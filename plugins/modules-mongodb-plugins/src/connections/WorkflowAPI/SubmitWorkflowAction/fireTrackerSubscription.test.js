import CancelWorkflow from "../CancelWorkflow/CancelWorkflow.js";
import createMongoDBConnection from "../../shared/createMongoDBConnection.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import fireTrackerSubscription, {
  CHILD_STAGE_MAP,
} from "./fireTrackerSubscription.js";

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  "in-progress": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1" },
};

let mongo;
let mongoDBConnection;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  mongoDBConnection = createMongoDBConnection({
    blockId: "test-block",
    connection: { databaseUri: mongo.uri },
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
  });
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
});

const parentConfig = {
  type: "parent-flow",
  entity_collection: "parents",
  action_groups: [],
  actions: [
    { type: "approve", kind: "form" },
    { type: "track-child", kind: "tracker" },
  ],
};

const childConfig = {
  type: "child-flow",
  entity_collection: "children",
  action_groups: [],
  actions: [{ type: "install", kind: "form" }],
};

function makeContext(overrides = {}) {
  return {
    mongoDBConnection,
    actionsEnum,
    workflowsConfig: overrides.workflowsConfig ?? [parentConfig, childConfig],
    changeStamp,
    eventId: overrides.eventId === undefined ? "event-1" : overrides.eventId,
  };
}

async function seedWorkflow({
  _id,
  workflow_type,
  stage = "active",
  parent_action_id = null,
  entity_id = `${_id}-entity`,
  entity_collection = "test-entities",
}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type,
    entity_id,
    entity_collection,
    parent_action_id,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
}

async function seedAction({
  _id,
  workflow_id,
  type,
  kind = "form",
  stage = "action-required",
  action_group = null,
  child_workflow_id = null,
  tracker = null,
}) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key: null,
    action_group,
    child_workflow_id,
    tracker,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

describe("CHILD_STAGE_MAP", () => {
  test("maps active → in-progress, completed → done, cancelled → not-required", () => {
    expect(CHILD_STAGE_MAP).toEqual({
      active: "in-progress",
      completed: "done",
      cancelled: "not-required",
    });
  });

  test.each(Object.entries(CHILD_STAGE_MAP))(
    "newStage %s produces parent stage %s",
    async (childStage, expectedParentStage) => {
      // Parent has tracker in `action-required` (not equal to any target stage)
      await seedWorkflow({ _id: "parent-1", workflow_type: "parent-flow" });
      await seedAction({
        _id: "track-1",
        workflow_id: "parent-1",
        type: "track-child",
        kind: "tracker",
        stage: "action-required",
        child_workflow_id: "child-1",
      });
      await seedWorkflow({
        _id: "child-1",
        workflow_type: "child-flow",
        parent_action_id: "track-1",
      });
      await seedAction({
        _id: "install-1",
        workflow_id: "child-1",
        type: "install",
        stage: childStage === "active" ? "action-required" : "done",
      });

      const fires = await fireTrackerSubscription(makeContext(), {
        workflowId: "child-1",
        newStage: childStage,
      });

      expect(fires.length).toBeGreaterThanOrEqual(1);
      expect(fires[0]).toEqual({
        parent_action_id: "track-1",
        parent_workflow_id: "parent-1",
        new_status: expectedParentStage,
      });
      const tracker = await mongo.db.collection("actions").findOne({ _id: "track-1" });
      expect(tracker.status[0].stage).toBe(expectedParentStage);
    },
  );
});

test("workflow not found → returns [], no writes", async () => {
  const fires = await fireTrackerSubscription(makeContext(), {
    workflowId: "missing",
    newStage: "completed",
  });
  expect(fires).toEqual([]);
  expect(await mongo.db.collection("actions").countDocuments()).toBe(0);
});

test("workflow with parent_action_id:null → returns [], no writes", async () => {
  await seedWorkflow({ _id: "child-1", workflow_type: "child-flow", parent_action_id: null });
  await seedAction({ _id: "install-1", workflow_id: "child-1", type: "install" });

  const fires = await fireTrackerSubscription(makeContext(), {
    workflowId: "child-1",
    newStage: "completed",
  });
  expect(fires).toEqual([]);
  // No parent action exists; install-1 untouched.
  const install = await mongo.db.collection("actions").findOne({ _id: "install-1" });
  expect(install.status).toHaveLength(1);
});

test("tracker action missing → returns [], no writes", async () => {
  await seedWorkflow({
    _id: "child-1",
    workflow_type: "child-flow",
    parent_action_id: "ghost-tracker",
  });
  const fires = await fireTrackerSubscription(makeContext(), {
    workflowId: "child-1",
    newStage: "completed",
  });
  expect(fires).toEqual([]);
});

test("unknown newStage → returns [], no writes", async () => {
  await seedWorkflow({ _id: "parent-1", workflow_type: "parent-flow" });
  await seedAction({
    _id: "track-1",
    workflow_id: "parent-1",
    type: "track-child",
    kind: "tracker",
    stage: "action-required",
  });
  await seedWorkflow({
    _id: "child-1",
    workflow_type: "child-flow",
    parent_action_id: "track-1",
  });

  const fires = await fireTrackerSubscription(makeContext(), {
    workflowId: "child-1",
    newStage: "weird-stage",
  });
  expect(fires).toEqual([]);
  const tracker = await mongo.db.collection("actions").findOne({ _id: "track-1" });
  expect(tracker.status).toHaveLength(1);
  expect(tracker.status[0].stage).toBe("action-required");
});

test("same-stage guard: tracker already at target → returns [], no write, no recompute", async () => {
  // Parent has only the tracker; if recompute fired, it would auto-complete
  // the parent and recurse. Asserting no recurse + tracker untouched proves
  // the guard fired before the write.
  await seedWorkflow({ _id: "parent-1", workflow_type: "parent-flow" });
  await seedAction({
    _id: "track-1",
    workflow_id: "parent-1",
    type: "track-child",
    kind: "tracker",
    stage: "done", // already at target for completed → done
  });
  await seedWorkflow({
    _id: "child-1",
    workflow_type: "child-flow",
    parent_action_id: "track-1",
  });

  const fires = await fireTrackerSubscription(makeContext(), {
    workflowId: "child-1",
    newStage: "completed",
  });

  expect(fires).toEqual([]);
  const tracker = await mongo.db.collection("actions").findOne({ _id: "track-1" });
  expect(tracker.status).toHaveLength(1); // no new push
  const parent = await mongo.db.collection("workflows").findOne({ _id: "parent-1" });
  expect(parent.status).toHaveLength(1); // no recompute → no completed push
});

test("one-level happy path: parent does not auto-complete; one fire entry; tracker updated", async () => {
  await seedWorkflow({ _id: "parent-1", workflow_type: "parent-flow" });
  // Parent has another non-terminal action so it does NOT auto-complete.
  await seedAction({
    _id: "approve-1",
    workflow_id: "parent-1",
    type: "approve",
    stage: "action-required",
  });
  await seedAction({
    _id: "track-1",
    workflow_id: "parent-1",
    type: "track-child",
    kind: "tracker",
    stage: "in-progress",
    child_workflow_id: "child-1",
  });
  await seedWorkflow({
    _id: "child-1",
    workflow_type: "child-flow",
    parent_action_id: "track-1",
  });

  const fires = await fireTrackerSubscription(makeContext({ eventId: "E1" }), {
    workflowId: "child-1",
    newStage: "completed",
  });

  expect(fires).toEqual([
    {
      parent_action_id: "track-1",
      parent_workflow_id: "parent-1",
      new_status: "done",
    },
  ]);
  const tracker = await mongo.db.collection("actions").findOne({ _id: "track-1" });
  expect(tracker.status[0]).toMatchObject({ stage: "done", event_id: "E1" });
  const parent = await mongo.db.collection("workflows").findOne({ _id: "parent-1" });
  expect(parent.summary).toEqual({ done: 1, not_required: 0, total: 2 });
  expect(parent.status[0].stage).toBe("active"); // didn't auto-complete
});

test("two-level recurse: parent auto-completes; two fire entries newest-first", async () => {
  // Grandparent A with another action so chain stops at A.
  await seedWorkflow({ _id: "wf-A", workflow_type: "parent-flow" });
  await seedAction({
    _id: "approve-A",
    workflow_id: "wf-A",
    type: "approve",
    stage: "action-required",
  });
  await seedAction({
    _id: "track-B",
    workflow_id: "wf-A",
    type: "track-child",
    kind: "tracker",
    stage: "in-progress",
    child_workflow_id: "wf-B",
  });
  // Parent B: single tracker action so B auto-completes when tracker flips.
  await seedWorkflow({
    _id: "wf-B",
    workflow_type: "parent-flow",
    parent_action_id: "track-B",
  });
  await seedAction({
    _id: "track-C",
    workflow_id: "wf-B",
    type: "track-child",
    kind: "tracker",
    stage: "in-progress",
    child_workflow_id: "wf-C",
  });
  // Override parent-flow config to have only the tracker action (so B auto-completes).
  // We use a one-action parent config so the parent has only the tracker, and
  // it auto-completes when the tracker becomes done.
  const oneActionParentConfig = {
    type: "parent-flow",
    entity_collection: "parents",
    action_groups: [],
    actions: [
      { type: "approve", kind: "form" },
      { type: "track-child", kind: "tracker" },
    ],
  };

  // Child C with parent_action_id: track-C.
  await seedWorkflow({
    _id: "wf-C",
    workflow_type: "child-flow",
    parent_action_id: "track-C",
  });

  const fires = await fireTrackerSubscription(
    makeContext({ workflowsConfig: [oneActionParentConfig, childConfig] }),
    { workflowId: "wf-C", newStage: "completed" },
  );

  // Note: with current fixture A has approve-A non-terminal, so A does NOT
  // auto-complete. But B has only track-C so B DOES auto-complete; track-B
  // gets flipped. Expected: 2 fires.
  expect(fires).toHaveLength(2);
  expect(fires[0]).toEqual({
    parent_action_id: "track-C",
    parent_workflow_id: "wf-B",
    new_status: "done",
  });
  expect(fires[1]).toEqual({
    parent_action_id: "track-B",
    parent_workflow_id: "wf-A",
    new_status: "done",
  });

  const trackB = await mongo.db.collection("actions").findOne({ _id: "track-B" });
  expect(trackB.status[0].stage).toBe("done");
  const trackC = await mongo.db.collection("actions").findOne({ _id: "track-C" });
  expect(trackC.status[0].stage).toBe("done");
  const wfA = await mongo.db.collection("workflows").findOne({ _id: "wf-A" });
  expect(wfA.status[0].stage).toBe("active");
  const wfB = await mongo.db.collection("workflows").findOne({ _id: "wf-B" });
  expect(wfB.status[0].stage).toBe("completed");
});

test("eventId propagation: context.eventId='E1' threads onto parent tracker's status entry", async () => {
  await seedWorkflow({ _id: "parent-1", workflow_type: "parent-flow" });
  await seedAction({
    _id: "approve-1",
    workflow_id: "parent-1",
    type: "approve",
    stage: "action-required",
  });
  await seedAction({
    _id: "track-1",
    workflow_id: "parent-1",
    type: "track-child",
    kind: "tracker",
    stage: "in-progress",
  });
  await seedWorkflow({
    _id: "child-1",
    workflow_type: "child-flow",
    parent_action_id: "track-1",
  });

  await fireTrackerSubscription(makeContext({ eventId: "E1" }), {
    workflowId: "child-1",
    newStage: "completed",
  });

  const tracker = await mongo.db.collection("actions").findOne({ _id: "track-1" });
  expect(tracker.status[0].event_id).toBe("E1");
});

test("eventId:null on cancel-style invocation; tracker's status entry has event_id:null", async () => {
  await seedWorkflow({ _id: "parent-1", workflow_type: "parent-flow" });
  await seedAction({
    _id: "approve-1",
    workflow_id: "parent-1",
    type: "approve",
    stage: "action-required",
  });
  await seedAction({
    _id: "track-1",
    workflow_id: "parent-1",
    type: "track-child",
    kind: "tracker",
    stage: "in-progress",
  });
  await seedWorkflow({
    _id: "child-1",
    workflow_type: "child-flow",
    parent_action_id: "track-1",
    stage: "cancelled",
  });

  await fireTrackerSubscription(makeContext({ eventId: null }), {
    workflowId: "child-1",
    newStage: "cancelled",
  });

  const tracker = await mongo.db.collection("actions").findOne({ _id: "track-1" });
  expect(tracker.status[0].stage).toBe("not-required");
  expect(tracker.status[0].event_id).toBeNull();
});

test("depth-limit overflow at depth=10 throws err.step='tracker-subscription'", async () => {
  await expect(
    fireTrackerSubscription(makeContext(), {
      workflowId: "anything",
      newStage: "completed",
      depth: 10,
    }),
  ).rejects.toMatchObject({
    step: "tracker-subscription",
    message: expect.stringMatching(/depth limit \(10\)/),
  });
});

// NOTE(task 16): the two handleSubmit-driven cascade describe blocks that lived
// here (`3-level chain integration`, `depth-limit overflow (real fixture)`)
// were re-homed into `shared/phases/runTrackerCascade.test.js` against the real
// cascade loop, then deleted — the old recursive path can no longer be driven
// through the rewritten handleSubmit. The pure fireTrackerSubscription /
// CHILD_STAGE_MAP unit tests above + the cancel-path recurse below remain live
// for Cancel/Close until task 17 rewires them.

describe("cancel-path recurse", () => {
  // 2-level chain: A (parent, only track-B as action — auto-completes when
  // tracker fires) → B (child, no other actions). Cancel B → track-B flips
  // to not-required → A's recompute finds all terminal → A auto-completes →
  // fireTrackerSubscription recurses; A has no parent so chain stops.
  const oneActionParentConfig = {
    type: "one-action-parent",
    action_groups: [],
    actions: [{ type: "track-child", kind: "tracker" }],
  };
  const childNoActionsConfig = {
    type: "child-no-actions",
    action_groups: [],
    actions: [],
  };

  function makeCancelContext({ workflowId }) {
    return {
      blockId: "test-block",
      connection: {
        databaseUri: mongo.uri,
        workflowsConfig: [oneActionParentConfig, childNoActionsConfig],
        actionsEnum,
        changeStamp,
      },
      connectionId: "test-conn",
      pageId: "test-page",
      requestId: "test-req",
      request: { workflow_id: workflowId },
    };
  }

  test("fans up not-required through a 2-level chain on cancel", async () => {
    await mongo.db.collection("workflows").insertOne({
      _id: "wf-A",
      workflow_type: "one-action-parent",
      entity_id: "ent-A",
      entity_collection: "entities",
      status: [{ stage: "active", created: new Date() }],
      summary: { done: 0, not_required: 0, total: 0 },
      groups: [],
      form_data: {},
    });
    await mongo.db.collection("actions").insertOne({
      _id: "track-B",
      workflow_id: "wf-A",
      type: "track-child",
      kind: "tracker",
      key: null,
      child_workflow_id: "wf-B",
      status: [{ stage: "in-progress", created: new Date() }],
    });
    await mongo.db.collection("workflows").insertOne({
      _id: "wf-B",
      workflow_type: "child-no-actions",
      entity_id: "ent-B",
      entity_collection: "entities",
      parent_action_id: "track-B",
      status: [{ stage: "active", created: new Date() }],
      summary: { done: 0, not_required: 0, total: 0 },
      groups: [],
      form_data: {},
    });

    const result = await CancelWorkflow(makeCancelContext({ workflowId: "wf-B" }));

    expect(result.tracker_fired).toHaveLength(1);
    expect(result.tracker_fired[0]).toEqual({
      parent_action_id: "track-B",
      parent_workflow_id: "wf-A",
      new_status: "not-required",
    });
    const wfB = await mongo.db.collection("workflows").findOne({ _id: "wf-B" });
    expect(wfB.status[0].stage).toBe("cancelled");
    const trackB = await mongo.db.collection("actions").findOne({ _id: "track-B" });
    expect(trackB.status[0].stage).toBe("not-required");
    const wfA = await mongo.db.collection("workflows").findOne({ _id: "wf-A" });
    expect(wfA.status[0].stage).toBe("completed");
    expect(wfA.summary).toEqual({ done: 0, not_required: 1, total: 1 });
  });
});
