import { test, expect } from "../fixtures.js";
import { getBlock } from "@lowdefy/e2e-utils";

// Cluster: access-verbs (Part 22 task 10). Mode: Spine (UI) + endpoint tail.
//
// Proves the per-app, per-verb access gates (access.{app_name}.{verb}) BIND
// THROUGH THE WIRED APP, per role — not just in the unit layer. Three concerns:
//   1. Entity-surface VISIBILITY: GetEntityWorkflows drops an action with no
//      accessible verb, so admin-only is invisible to non-admins.
//   2. Button GATING on a review page: the review-only `approve` button renders
//      for a reviewer and not for a plain editor (server-resolved buttons map,
//      Part 46). request_changes — gated on view/edit/review (Part 49) — shows
//      for the plain editor, the post-49 contrast.
//   3. Endpoint ENFORCEMENT: a real `approve` from a role lacking `review` is
//      rejected at the endpoint (DB unchanged); a reviewer's succeeds through
//      the same real endpoint.
//
// The gate logic itself is unit-owned (gateAllows / resolveActionAccess.test.js,
// per-verb gates in SubmitWorkflowAction tests); this cluster proves it is wired.
//
// The `mdb` fixture wipes all collections between tests.

const WORKFLOW_TYPE = "access-verbs";

// Role profiles. The access bags never name `user`, so the plain user passes
// only the `true` gates (everyone-edits, reviewer-gated view/edit).
const PLAIN_USER = {
  name: "Plain User",
  email: "plain@example.com",
  roles: ["user"],
};
const REVIEWER = {
  name: "Reviewer",
  email: "reviewer@example.com",
  roles: ["reviewer"],
};
const ADMIN = { name: "Admin", email: "admin@example.com", roles: ["admin"] };

// Action-required status messages — unique per action, so presence/absence on
// the entity surface is an unambiguous visibility probe.
const MSG = {
  everyone: "Everyone can edit this.",
  reviewer: "Submit this for review.",
  admin: "Admins only — complete this action.",
};

function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

async function seedAndStart(ldf, mdb, workflow, thingId) {
  // Start has no access gate; do it as admin so the workflow exists before we
  // switch role profiles to assert rendered/enforced behaviour.
  await ldf.user(ADMIN);
  await mdb.seed("things", [{ _id: thingId, title: "Access Thing" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  return workflow_id;
}

test("the entity surface shows each action only to roles with an accessible verb", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-access-visibility";
  await seedAndStart(ldf, mdb, workflow, thingId);

  // ── plain user: everyone-edits + reviewer-gated visible; admin-only HIDDEN ──
  await ldf.user(PLAIN_USER);
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText(MSG.everyone)).toBeVisible();
  await expect(page.getByText(MSG.reviewer)).toBeVisible();
  // admin-only has no verb the plain user can reach → dropped from the surface.
  await expect(page.getByText(MSG.admin)).toHaveCount(0);

  // ── reviewer: same surface (the review verb is a button/endpoint gate, not a
  //    row-visibility one) — admin-only still HIDDEN (reviewer is not admin) ──
  await ldf.user(REVIEWER);
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText(MSG.everyone)).toBeVisible();
  await expect(page.getByText(MSG.reviewer)).toBeVisible();
  await expect(page.getByText(MSG.admin)).toHaveCount(0);

  // ── admin: all three rows visible, including admin-only ─────────────────────
  await ldf.user(ADMIN);
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText(MSG.everyone)).toBeVisible();
  await expect(page.getByText(MSG.reviewer)).toBeVisible();
  await expect(page.getByText(MSG.admin)).toBeVisible();
});

test("only a reviewer sees the approve button and only a reviewer can approve at the endpoint", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-access-review";
  const workflowId = await seedAndStart(ldf, mdb, workflow, thingId);

  const reviewed = await actionByType(mdb, workflowId, "reviewer-gated");
  const actionId = reviewed._id.toString();
  const editUrl = `/workflows/${WORKFLOW_TYPE}-reviewer-gated-edit?action_id=${actionId}`;
  const reviewUrl = `/workflows/${WORKFLOW_TYPE}-reviewer-gated-review?action_id=${actionId}`;

  // ── SPINE: the plain user (edit verb) submits through the real edit page →
  //    in-review (review is action-global, so submit routes to review here) ───
  await ldf.user(PLAIN_USER);
  await ldf.goto(editUrl);
  await ldf.block("form.summary").do.fill("A summary from a plain editor.");
  await ldf.block("button_submit").do.click();
  await workflow.assertStatus(actionId, "in-review");

  // ── button gating, non-reviewer: on the review page the plain editor sees
  //    request_changes (gated on view/edit/review — Part 49) but NOT approve
  //    (review-only). Wait for the page to settle on the visible button before
  //    asserting the gated one's absence. ──
  await ldf.goto(reviewUrl);
  await expect(getBlock(page, "button_request_changes")).toBeVisible();
  await expect(getBlock(page, "button_approve")).toHaveCount(0);

  // ── TAIL rejection: the plain user fires `approve` directly at the real
  //    endpoint. The role lacks `review` → rejected, and the action is unchanged.
  const rejected = await workflow.submit(
    actionId,
    { signal: "approve" },
    { expectError: true },
  );
  expect(rejected.success).toBe(false);
  await workflow.assertStatus(actionId, "in-review"); // DB unchanged

  // ── button gating, reviewer: the approve button now renders ─────────────────
  await ldf.user(REVIEWER);
  await ldf.goto(reviewUrl);
  await expect(getBlock(page, "button_approve")).toBeVisible();

  // ── POSITIVE CONTROL (same real endpoint, via the button): the reviewer
  //    approves → done. Spine closure: the entity surface reflects the commit. ─
  await ldf.block("button_approve").do.click();
  await workflow.assertStatus(actionId, "done");

  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Approved by a reviewer.")).toBeVisible();
});

test("a role without view cannot reach the admin-only page and no action data leaks", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-access-noleak";
  const workflowId = await seedAndStart(ldf, mdb, workflow, thingId);

  const adminOnly = await actionByType(mdb, workflowId, "admin-only");
  const actionId = adminOnly._id.toString();
  const editUrl = `/workflows/${WORKFLOW_TYPE}-admin-only-edit?action_id=${actionId}`;

  // ── plain user: GetWorkflowAction returns null (no view), so the edit page's
  //    stale-status guard redirects to the view page and no form data renders. ─
  await ldf.user(PLAIN_USER);
  await ldf.goto(editUrl);
  await expect(page).toHaveURL(new RegExp(`${WORKFLOW_TYPE}-admin-only-view`));
  // No leak: the form input never renders for the unauthorized role.
  await expect(getBlock(page, "form.note")).toHaveCount(0);

  // ── positive control: an admin opens the same edit page and the form renders,
  //    so the gate is role-sensitive, not broken-closed. ──────────────────────
  await ldf.user(ADMIN);
  await ldf.goto(editUrl);
  await expect(getBlock(page, "form.note")).toBeVisible();
});
