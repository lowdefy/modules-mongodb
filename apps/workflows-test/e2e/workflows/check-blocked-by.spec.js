import { test, expect } from "../fixtures.js";

// Cluster: check-blocked-by (Part 22 task 4). Mode: Spine.
//
// Proves both blocked_by dependency kinds fire through the wired app — a TYPE
// dep (needs-type ← first-check) and a GROUP dep (needs-group ← prep group) —
// and is the suite's coverage home for the per-workflow check page
// (check-blocked-by-action) and the two overview pages
// (workflow-overview, workflow-group-overview) rendering in a running app.
//
// TARGET STATE (parts 40/46/48/56):
//   - kind:check actions render on the per-workflow check page
//     check-blocked-by-action via ?action_id= (Part 56 retired the shared
//     workflow-action-{edit,view,review} pages; the signal model from Part 40 —
//     button_submit / button_approve — is unchanged).
//   - Per Part 40 D5, clicking a check row in actions-on-entity opens the
//     in-context MODAL rather than navigating, so this spec reaches the check
//     page by its canonical ?action_id= URL (its addressable target) — the
//     modal path is Part 40's own e2e supplement, not this cluster's.
//   - submit endpoint is per-workflow check-blocked-by-submit (Part 48).
// These tests fail against pre-40/48 code by design — the suite is the spec.
//
// The `mdb` fixture wipes all collections between tests.

const WORKFLOW_TYPE = "check-blocked-by";

// Engine `_id`s and id refs are UUID strings (createEngineContext:
// newId: randomUUID), so query by the raw `workflow_id` — no ObjectId coercion.
function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

test("completing a type blocker and completing a group both unblock their dependents — committed in the DB and reflected on the entity surface", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });

  const thingId = "thing-check-blocked-by";
  await mdb.seed("things", [{ _id: thingId, title: "Blocked-by Thing" }]);

  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });

  const firstCheck = await actionByType(mdb, workflow_id, "first-check");
  const secondCheck = await actionByType(mdb, workflow_id, "second-check");
  const needsType = await actionByType(mdb, workflow_id, "needs-type");
  const needsGroup = await actionByType(mdb, workflow_id, "needs-group");

  // ── initial stages: two action-required, two blocked ───────────────────────
  expect(firstCheck.status[0].stage).toBe("action-required");
  expect(secondCheck.status[0].stage).toBe("action-required");
  expect(needsType.status[0].stage).toBe("blocked");
  expect(needsGroup.status[0].stage).toBe("blocked");

  // Blocked UI affordance: the entity surface shows the blocked status messages
  // (no actionable affordance) for the two blocked actions.
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(
    page.getByText("Waiting on the first prep check."),
  ).toBeVisible();
  await expect(page.getByText("Waiting on the prep group.")).toBeVisible();

  // ── TYPE dep: completing first-check unblocks needs-type ───────────────────
  // Reach the per-workflow check page by its canonical ?action_id= URL and
  // assert it renders the check action (its current-stage message), then
  // complete it.
  await ldf.goto(
    `/workflows/check-blocked-by-action?action_id=${firstCheck._id.toString()}`,
  );
  // Target the heading specifically — the restructured check-action header also
  // renders the action title in a breadcrumb, so a bare getByText is ambiguous.
  await expect(
    page.getByRole("heading", { name: "Complete the first prep check." }),
  ).toBeVisible();
  await ldf.block("button_submit").do.click();

  await workflow.assertStatus(firstCheck._id.toString(), "done");
  // needs-type (blocked_by [first-check]) flips to action-required…
  await workflow.assertStatus(needsType._id.toString(), "action-required");
  // …while needs-group stays blocked (second-check still open, prep incomplete).
  expect(
    (await actionByType(mdb, workflow_id, "needs-group")).status[0].stage,
  ).toBe("blocked");

  // ── GROUP dep: completing the prep group unblocks needs-group ──────────────
  // second-check has the review verb: submit → in-review.
  await ldf.goto(
    `/workflows/check-blocked-by-action?action_id=${secondCheck._id.toString()}`,
  );
  await ldf.block("button_submit").do.click();
  await workflow.assertStatus(secondCheck._id.toString(), "in-review");

  // The check page serves the in-review check action; approve → done.
  await ldf.goto(
    `/workflows/check-blocked-by-action?action_id=${secondCheck._id.toString()}`,
  );
  await expect(page).toHaveURL(/check-blocked-by-action/);
  await ldf.block("button_approve").do.click();
  await workflow.assertStatus(secondCheck._id.toString(), "done");

  // prep group now complete (both checks done) → needs-group → action-required.
  await workflow.assertStatus(needsGroup._id.toString(), "action-required");
  // The prep group's derived status flips to done (both checks complete). Since
  // Part 66 group status is derived on read, so assert it through the overview.
  await workflow.assertGroup(workflow_id, "prep", { status: "done" });

  // ── check page sweep: the page renders for a done check action ─────────────
  await ldf.goto(
    `/workflows/check-blocked-by-action?action_id=${firstCheck._id.toString()}`,
  );
  await expect(page).toHaveURL(/check-blocked-by-action/);
  await expect(page.getByText("First prep check complete.")).toBeVisible();

  // ── overview pages render against the group-structured workflow ────────────
  await ldf.goto(`/workflows/workflow-overview?workflow_id=${workflow_id}`);
  await expect(page.getByText("Check blocked-by")).toBeVisible(); // workflow.title

  await ldf.goto(
    `/workflows/workflow-group-overview?workflow_id=${workflow_id}&group_id=prep`,
  );
  // Target the title heading specifically — a bare getByText('Prep') also
  // matches the "...prep check complete." status messages on this page.
  await expect(page.getByRole("heading", { name: "Prep" })).toBeVisible(); // group.title

  // ── SPINE CLOSURE: the entity surface reflects both committed unblocks ─────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(
    page.getByText("Unblocked by the first prep check."),
  ).toBeVisible();
  await expect(page.getByText("Unblocked by the prep group.")).toBeVisible();
});
