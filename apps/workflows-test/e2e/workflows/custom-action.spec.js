import { test, expect } from "../fixtures.js";

// Cluster: custom-action (Part 28). Mode: Spine.
//
// Proves kind:custom routes the AUTHOR's `link:` cell into the per-verb links
// map and that the card click-through carries the CONCRETE action _id — the
// single assertion guarding the design's #1/#2 defect class (computeEngineLinks
// used to `return {}` for custom, so the authored link never reached the card
// and the `action_id: true` sentinel was never substituted).
//
// Two concerns, both against the wired app:
//   1. CLICK-THROUGH (load-bearing): a user who can act (reviewer) sees the card
//      link resolve to the app-owned working page (custom-thing-review) with
//      action_id=<the real UUID>, NOT the literal string "true"; clicking it
//      navigates there.
//   2. OBSERVER FALLBACK: a view-only user's card link resolves to the shared
//      per-workflow page (custom-action-action), never the working page.
//
// The `mdb` fixture wipes all collections between tests.

const WORKFLOW_TYPE = "custom-action";

const REVIEWER = {
  name: "Reviewer",
  email: "reviewer@example.com",
  roles: ["reviewer"],
};
// The access bag gates edit/review on `reviewer` and leaves view open (true),
// so a plain user passes only the view gate → the observer profile.
const OBSERVER = {
  name: "Plain User",
  email: "plain@example.com",
  roles: ["user"],
};

function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

// Flatten the entity-workflows response to the single review-thing card.
function reviewCard(entityWorkflows) {
  return entityWorkflows.workflows
    .flatMap((wf) => wf.groups)
    .flatMap((g) => g.actions)
    .find((a) => a.type === "review-thing");
}

test("a reviewer's custom-action card link carries the concrete action _id and clicks through to the app page", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-custom-action";
  await ldf.user(REVIEWER);
  await mdb.seed("things", [{ _id: thingId, title: "Custom Action Thing" }]);

  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });

  const reviewThing = await actionByType(mdb, workflow_id, "review-thing");
  const actionId = reviewThing._id.toString();
  expect(reviewThing.status[0].stage).toBe("action-required");

  // ── ENGINE ROUTING (the #1/#2 guard): the authored link reached the per-verb
  //    links map with the sentinel substituted to the concrete _id ─────────────
  // edit slot → the app-owned working page; view slot → the shared fallback.
  expect(reviewThing.test.links.edit).toEqual({
    pageId: "custom-thing-review",
    urlQuery: { action_id: actionId },
  });
  expect(reviewThing.test.links.view).toEqual({
    pageId: "workflows/custom-action-action",
    urlQuery: { action_id: actionId },
  });
  // Explicit: the sentinel was substituted — NOT the literal `true`.
  expect(reviewThing.test.links.edit.urlQuery.action_id).not.toBe(true);
  expect(reviewThing.test.links.edit.urlQuery.action_id).toBe(actionId);

  // ── READ-TIME COLLAPSE (reviewer): GetEntityWorkflows returns the edit-slot
  //    link (the app working page) because the reviewer holds `edit` ───────────
  const card = reviewCard(
    await workflow.getEntityWorkflows({ entity_id: thingId }),
  );
  expect(card.link.pageId).toBe("custom-thing-review");
  expect(card.link.urlQuery.action_id).toBe(actionId);

  // ── CLICK-THROUGH: clicking the card row navigates to the app page carrying
  //    the concrete _id (check-action-click navigates a non-check kind via
  //    action.link) ────────────────────────────────────────────────────────────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await page.getByText("Review the thing on the app page.").click();
  await expect(page).toHaveURL(
    new RegExp(`custom-thing-review\\?action_id=${actionId}`),
  );
  // The app page loaded the right action (the substituted _id round-tripped).
  await expect(page.locator("#loaded-action-id")).toHaveText(actionId);

  // ── ROUND-TRIP: the app page → custom-action-submit advances the FSM ────────
  await ldf.block("submit_review").do.click();
  await workflow.assertStatus(actionId, "in-review");
});

test("a view-only observer's custom-action card link falls back to the shared {workflow_type}-action page", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-custom-observer";
  // Start as the reviewer (start has no access gate), then switch to observer.
  await ldf.user(REVIEWER);
  await mdb.seed("things", [{ _id: thingId, title: "Observer Thing" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  const reviewThing = await actionByType(mdb, workflow_id, "review-thing");
  const actionId = reviewThing._id.toString();

  // ── OBSERVER: holds only `view`, so collapseLink yields the view-slot link —
  //    the shared per-workflow page, never the app working page ────────────────
  await ldf.user(OBSERVER);
  const card = reviewCard(
    await workflow.getEntityWorkflows({ entity_id: thingId }),
  );
  expect(card.link.pageId).toBe("workflows/custom-action-action");
  expect(card.link.pageId).not.toBe("custom-thing-review");
  expect(card.link.urlQuery.action_id).toBe(actionId);

  // ── CLICK-THROUGH (observer): the card navigates to the shared action page,
  //    not the working page ────────────────────────────────────────────────────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await page.getByText("Review the thing on the app page.").click();
  await expect(page).toHaveURL(
    new RegExp(`custom-action-action\\?action_id=${actionId}`),
  );
});
