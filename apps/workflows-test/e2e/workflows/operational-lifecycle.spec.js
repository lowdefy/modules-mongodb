import { test, expect } from "../fixtures.js";

// Cluster: operational-lifecycle (Part 22 task 9). Mode: Tail.
//
// The one browser-free cluster: every call goes through a real emitted Lowdefy
// endpoint via the `workflow` fixture (POST /api/endpoints/...), assertions via
// `mdb` reads. No page navigation — only `ldf.user()` session setup, so the
// authenticated Playwright request context carries the cookie.
//
// Proves the six operational APIs (part 19) are wired and reachable in the
// running app and return their documented shapes:
//   start / cancel / close (per-workflow, part 48) +
//   get-entity-workflows / get-workflow-overview / get-action-group-overview
//   (static module-scoped, `workflows/{id}`).
// Plus the three close edge cases the design names: required_after_close
// survives the close sweep, an already-completed close is a no-op, and a
// close-after-cancel is rejected. The exhaustive close/cancel logic is
// unit-owned (CloseWorkflow.test.js / CancelWorkflow.test.js) — this spec proves
// each API runs through the wired app once.
//
// The `mdb` fixture wipes all collections between tests, so each test starts its
// own workflow instance (the task's "three independent instances", one per test).

const WORKFLOW_TYPE = "operational-lifecycle";

// Engine `_id`s and id refs are UUID strings (createEngineContext:
// newId: randomUUID), so query by the raw `workflow_id` — no ObjectId coercion.
function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

function stageOf(doc) {
  return doc?.status?.[0]?.stage;
}

// Seed an entity + authenticate, then start a fresh workflow instance.
async function startInstance({ ldf, mdb, workflow }, thingId) {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: thingId, title: `Thing ${thingId}` }]);
  const res = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  return res;
}

test("start mints a workflow and its action docs, and the read APIs return their documented shapes", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-op-start";
  const startRes = await startInstance({ ldf, mdb, workflow }, thingId);

  // ── start: documented response shape { workflow_id, action_ids } ───────────
  expect(startRes).toEqual(
    expect.objectContaining({
      workflow_id: expect.any(String),
      action_ids: expect.any(Array),
    }),
  );
  const { workflow_id, action_ids } = startRes;
  expect(action_ids).toHaveLength(3); // three starting_actions

  // ── start committed: workflow doc + three action docs at their start stages ─
  const wf = await mdb
    .collection("workflows")
    .findOne({ _id: String(workflow_id) });
  expect(wf).not.toBeNull();
  expect(wf.workflow_type).toBe(WORKFLOW_TYPE);
  expect(stageOf(wf)).toBe("active");

  const routineStep = await actionByType(mdb, workflow_id, "routine-step");
  const mustFinish = await actionByType(mdb, workflow_id, "must-finish");
  const optionalStep = await actionByType(mdb, workflow_id, "optional-step");
  expect(stageOf(routineStep)).toBe("action-required");
  expect(stageOf(mustFinish)).toBe("action-required");
  expect(stageOf(optionalStep)).toBe("action-required");

  // ── get-entity-workflows: { workflows: [...] }, the started workflow present
  const { workflows } = await workflow.getEntityWorkflows({
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  expect(workflows).toHaveLength(1);
  const entry = workflows[0];
  expect(entry._id).toBe(workflow_id);
  expect(entry.workflow_type).toBe(WORKFLOW_TYPE);
  expect(entry.title).toBe("Operational lifecycle"); // workflow title from config
  // entity_link deep-links back to the host entity page (entities map).
  expect(entry.entity_link).toEqual(
    expect.objectContaining({ pageId: "thing-view" }),
  );
  // grouped actions: the routine group carries all three.
  const entityGroup = entry.groups.find((g) => g.id === "routine");
  expect(entityGroup).toBeTruthy();
  expect(entityGroup.actions).toHaveLength(3);

  // ── get-workflow-overview: { workflow, groups } ────────────────────────────
  const overview = await workflow.getWorkflowOverview(workflow_id);
  expect(overview.workflow._id).toBe(workflow_id);
  expect(overview.workflow.title).toBe("Operational lifecycle");
  expect(Array.isArray(overview.groups)).toBe(true);
  const overviewGroup = overview.groups.find((g) => g.id === "routine");
  expect(overviewGroup).toBeTruthy();
  expect(overviewGroup.actions).toHaveLength(3);

  // ── get-action-group-overview: { workflow, group, actions } ────────────────
  const groupOverview = await workflow.getActionGroupOverview(
    workflow_id,
    "routine",
  );
  expect(groupOverview.workflow._id).toBe(workflow_id);
  expect(groupOverview.group).toEqual(
    expect.objectContaining({ id: "routine", title: "Routine" }),
  );
  expect(groupOverview.actions).toHaveLength(3);
});

test("the close sweep marks an open optional action not-required but skips required_after_close", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-op-close-sweep";
  const { workflow_id } = await startInstance({ ldf, mdb, workflow }, thingId);

  const routineStep = await actionByType(mdb, workflow_id, "routine-step");
  const mustFinish = await actionByType(mdb, workflow_id, "must-finish");
  const optionalStep = await actionByType(mdb, workflow_id, "optional-step");

  // Complete routine-step (review-less check → done); leave the other two open.
  await workflow.submit(routineStep._id, { signal: "submit" });
  await workflow.assertStatus(routineStep._id, "done");

  // Close the workflow.
  const closeRes = await workflow.close(workflow_id);
  expect(closeRes.event_id).toEqual(expect.any(String)); // close minted an event

  // optional-step (non-protected, still open) is swept to not-required…
  await workflow.assertStatus(optionalStep._id, "not-required");
  // …while must-finish (required_after_close, non-blocked) survives at its stage.
  await workflow.assertStatus(mustFinish._id, "action-required");
  // routine-step's done is preserved.
  await workflow.assertStatus(routineStep._id, "done");

  // Workflow summary reflects the close: 1 done + 1 not_required of 3, completed.
  await workflow.assertSummary(workflow_id, {
    summary: { done: 1, not_required: 1, total: 3 },
  });
  const wf = await mdb
    .collection("workflows")
    .findOne({ _id: String(workflow_id) });
  expect(stageOf(wf)).toBe("completed");
});

test("closing an already-completed workflow is a no-op", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-op-close-noop";
  const { workflow_id } = await startInstance({ ldf, mdb, workflow }, thingId);

  // Complete all three actions → the workflow auto-completes.
  for (const type of ["routine-step", "must-finish", "optional-step"]) {
    const action = await actionByType(mdb, workflow_id, type);
    await workflow.submit(action._id, { signal: "submit" });
    await workflow.assertStatus(action._id, "done");
  }
  await expect
    .poll(async () => {
      const wf = await mdb
        .collection("workflows")
        .findOne({ _id: String(workflow_id) });
      return stageOf(wf);
    })
    .toBe("completed");

  // Snapshot the committed docs before the no-op close.
  const before = {
    workflow: await mdb
      .collection("workflows")
      .findOne({ _id: String(workflow_id) }),
    actions: await mdb
      .collection("actions")
      .find({ workflow_id: String(workflow_id) })
      .toArray(),
  };

  // Close on a completed workflow: idempotent no-op (returns empty, mints no
  // event, fires nothing) — succeeds at the HTTP layer.
  // objectContaining: the fixture returns the still-serialized `response`, which
  // may carry serializer reference keys (`~k`) alongside the routine's :return.
  const closeRes = await workflow.close(workflow_id);
  expect(closeRes).toEqual(
    expect.objectContaining({
      action_ids: [],
      event_id: null,
      tracker_fired: [],
    }),
  );

  // No state change: docs are byte-for-byte what they were before the close.
  const after = {
    workflow: await mdb
      .collection("workflows")
      .findOne({ _id: String(workflow_id) }),
    actions: await mdb
      .collection("actions")
      .find({ workflow_id: String(workflow_id) })
      .toArray(),
  };
  expect(after).toEqual(before);
});

test("closing a cancelled workflow is rejected and leaves its state unchanged", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-op-close-after-cancel";
  const { workflow_id } = await startInstance({ ldf, mdb, workflow }, thingId);

  // Cancel: workflow lands cancelled, all open actions swept to not-required.
  const cancelRes = await workflow.cancel(workflow_id, {
    reason: "no longer needed",
  });
  expect(cancelRes.action_ids).toHaveLength(3); // all three open actions swept
  await expect
    .poll(async () => {
      const wf = await mdb
        .collection("workflows")
        .findOne({ _id: String(workflow_id) });
      return stageOf(wf);
    })
    .toBe("cancelled");
  for (const type of ["routine-step", "must-finish", "optional-step"]) {
    const action = await actionByType(mdb, workflow_id, type);
    expect(stageOf(action)).toBe("not-required");
  }

  // Snapshot before the rejected close.
  const before = {
    workflow: await mdb
      .collection("workflows")
      .findOne({ _id: String(workflow_id) }),
    actions: await mdb
      .collection("actions")
      .find({ workflow_id: String(workflow_id) })
      .toArray(),
  };

  // Close on a cancelled workflow is rejected (stage_rejects_close).
  const errRes = await workflow.close(workflow_id, { expectError: true });
  expect(errRes.success).toBe(false);
  expect(errRes.status).toBe("error");
  // The engine discriminates on `code`; it rides the serialized error envelope.
  expect(JSON.stringify(errRes.error)).toContain("stage_rejects_close");

  // No state change from the rejected close.
  const after = {
    workflow: await mdb
      .collection("workflows")
      .findOne({ _id: String(workflow_id) }),
    actions: await mdb
      .collection("actions")
      .find({ workflow_id: String(workflow_id) })
      .toArray(),
  };
  expect(after).toEqual(before);
});
