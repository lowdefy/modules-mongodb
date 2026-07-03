import { test, expect } from "../fixtures.js";

// Cluster: tracker-child (Part 22 task 7). Mode: Spine + Tail.
//
// Proves a parent workflow's kind:tracker action mirrors a separate CHILD
// workflow's lifecycle ACROSS TWO REAL WORKFLOW DOCS, through the wired app —
// all three mirror directions plus terminal-row recovery:
//   child started   → internal_mirror_child_active    → parent in-progress
//   child completes  → internal_mirror_child_completed → parent done
//   child cancelled  → internal_mirror_child_cancelled → parent not-required
//   child activates against a terminal parent (done/not-required → in-progress)
//
// The mirror signals are engine-internal (never user-fired): they originate from
// the child's real operational/submit endpoints — StartWorkflow emits the
// `active` fire (incl. the recovery re-entry), the child's auto-complete on
// submit emits `completed`, CancelWorkflow emits `cancelled` — and each runs
// runTrackerCascade against the parent. So every transition here is driven by a
// real wire call; only the browser is skipped on the tail paths.
//
// What is NOT re-proved here (unit-owned): the full 6×N tracker FSM table
// (fsm/tables.test.js) and runTrackerCascade's multi-level walk + depth guard
// (runTrackerCascade.test.js). This cluster proves the wiring fires end-to-end.
//
// TARGET STATE (parts 40/46/48/56): track-child is kind:tracker; its child-step
// is kind:check submitting from the per-workflow tracker-child-flow-action page
// (Part 56 retired the shared workflow-action-* pages); the child is started via
// the per-workflow operational endpoint (Part 48). Fails against pre-40/48 code
// by design — the suite is the spec.
//
// The `mdb` fixture wipes all collections between tests.

const PARENT_TYPE = "tracker-parent";
const CHILD_TYPE = "tracker-child-flow";

// Engine `_id`s and id refs are UUID strings (createEngineContext:
// newId: randomUUID), so query by the raw `workflow_id` — no ObjectId coercion.
function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

const adminUser = {
  name: "Test User",
  email: "test-user@example.com",
  roles: ["admin"],
};

test("starting the child mirrors the parent tracker to in-progress, and completing the child workflow flips the parent tracker to done", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  await ldf.user(adminUser);

  const thingId = "thing-tracker-child";
  await mdb.seed("things", [{ _id: thingId, title: "Tracked Thing" }]);

  // Start the PARENT. Its track-child tracker seeds action-required.
  const { workflow_id: parentWorkflowId } = await workflow.start({
    workflow_type: PARENT_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });

  const trackChild = await actionByType(mdb, parentWorkflowId, "track-child");
  expect(trackChild.status[0].stage).toBe("action-required");
  const trackChildId = trackChild._id.toString();

  // ── START_LINK SURFACE: the tracker row renders on the parent's surface, and
  //    its server-resolved start link carries the action_id/entity_id query ────
  // The link is computed by the engine (computeEngineLinks tracker arm 2) and
  // persisted on the action doc under its access slug — the SAME field the
  // entity-surface ActionSteps row navigates by (via get-entity-workflows).
  expect(trackChild.test?.links?.edit).toEqual({
    pageId: "thing-view",
    urlQuery: { action_id: trackChildId, entity_id: thingId },
  });
  // …and the row itself renders (its action-required start message).
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Start the child workflow.")).toBeVisible();

  // ── MIRROR UP (active): start the CHILD linked to the tracker via the real
  //    operational endpoint — the same call the start_link page would make ─────
  const { workflow_id: childWorkflowId } = await workflow.start({
    workflow_type: CHILD_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
    parent_action_id: trackChildId,
  });

  // StartWorkflow fired internal_mirror_child_active → parent tracker in-progress
  // (committed in the DB; the child link denormalised onto the tracker doc).
  await workflow.assertStatus(trackChildId, "in-progress");
  await workflow.assertStatus(trackChildId, {
    child_workflow_id: String(childWorkflowId),
  });
  // Entity surface reflects the committed in-progress mirror.
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Child workflow in progress.")).toBeVisible();

  // ── MIRROR UP (completed): complete the child's one step through its real
  //    per-workflow action page → child auto-completes → parent tracker done ────
  const childStep = await actionByType(mdb, childWorkflowId, "child-step");
  await ldf.goto(
    `/workflows/tracker-child-flow-action?action_id=${childStep._id.toString()}`,
  );
  await ldf.block("button_submit").do.click();

  // child-step done → child workflow completes → internal_mirror_child_completed
  // → parent tracker done.
  await workflow.assertStatus(childStep._id.toString(), "done");
  await workflow.assertStatus(trackChildId, "done");
  // The parent workflow's own summary reflects its single tracker action done.
  await workflow.assertSummary(parentWorkflowId, {
    total: 1,
    counts: expect.objectContaining({ done: 1, "not-required": 0 }),
  });

  // ── SPINE CLOSURE: the entity surface reflects the recovered done state ─────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Child workflow complete.")).toBeVisible();
});

test("cancelling the child workflow flips the parent tracker to not-required", async ({
  ldf,
  mdb,
  workflow,
}) => {
  await ldf.user(adminUser);

  const thingId = "thing-tracker-cancel";
  await mdb.seed("things", [{ _id: thingId, title: "Cancel Thing" }]);

  const { workflow_id: parentWorkflowId } = await workflow.start({
    workflow_type: PARENT_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  const trackChild = await actionByType(mdb, parentWorkflowId, "track-child");
  const trackChildId = trackChild._id.toString();

  // Fresh parent+child pair: start the child, mirror up to in-progress.
  const { workflow_id: childWorkflowId } = await workflow.start({
    workflow_type: CHILD_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
    parent_action_id: trackChildId,
  });
  await workflow.assertStatus(trackChildId, "in-progress");

  // ── MIRROR UP (cancelled): cancel the child via the real cancel endpoint ────
  // CancelWorkflow emits internal_mirror_child_cancelled → parent not-required.
  await workflow.cancel(childWorkflowId, { reason: "Not pursuing." });

  await workflow.assertStatus(trackChildId, "not-required");
  // Spine closure: the parent workflow's summary recomputes the now-terminal
  // tracker action as not-required. (A not-required action is terminal and drops
  // off the active entity surface — so the closure is the summary recompute, the
  // same shape form-lifecycle's not_required test asserts, not a surface message.)
  await workflow.assertSummary(parentWorkflowId, {
    total: 1,
    counts: expect.objectContaining({ done: 0, "not-required": 1 }),
  });
});

test("a child activating against a terminal parent tracker recovers it to in-progress", async ({
  ldf,
  mdb,
  workflow,
}) => {
  await ldf.user(adminUser);

  const thingId = "thing-tracker-recovery";
  await mdb.seed("things", [{ _id: thingId, title: "Recovery Thing" }]);

  const { workflow_id: parentWorkflowId } = await workflow.start({
    workflow_type: PARENT_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  const trackChild = await actionByType(mdb, parentWorkflowId, "track-child");
  const trackChildId = trackChild._id.toString();

  // ── TAIL seed-state: position the tracker action at the terminal `done` row,
  //    while it is still UNLINKED (child_workflow_id null) — the documented tail
  //    pre-condition, mutating only the status[0].stage the engine writes. This
  //    is not a backdoor: the recovery transition below is fired by a real
  //    endpoint. (The cancel/complete mirrors never clear child_workflow_id, so
  //    a real terminal state always carries a linked child; seed-state is the
  //    way to reach a terminal-yet-unlinked tracker for the recovery re-entry.)
  await workflow.setStage(trackChildId, "done");
  await workflow.assertStatus(trackChildId, "done");

  // ── RECOVERY: start a child against the terminal tracker via the real start
  //    endpoint → StartWorkflow emits internal_mirror_child_active, which the
  //    tracker FSM resolves from `done` → `in-progress` (terminal-row recovery
  //    row). The parent tracker leaves its terminal row. ────────────────────────
  const { workflow_id: childWorkflowId } = await workflow.start({
    workflow_type: CHILD_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
    parent_action_id: trackChildId,
  });

  await workflow.assertStatus(trackChildId, "in-progress");
  await workflow.assertStatus(trackChildId, {
    child_workflow_id: String(childWorkflowId),
  });
});
