/**
 * Integration tests for CancelWorkflow (task 17). Drives the real resolver
 * against an in-memory Mongo (standalone, no transactions) with a mock callApi
 * — mirrors SubmitWorkflowAction.test.js.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import CancelWorkflow from "./CancelWorkflow.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

function makeWorkflowsConfig() {
  return [
    {
      type: "onboarding",
      entity: { connection_id: "leads-collection", ref_key: "lead_ids" },
      starting_actions: [{ type: "qualify", status: "action-required" }],
      action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
      actions: [
        {
          type: "qualify",
          kind: "check",
          action_group: "phase-1",
          access: { "test-app": { view: true, edit: ["account-manager"] } },
        },
        {
          type: "kickoff",
          kind: "check",
          action_group: "phase-2",
          access: { "test-app": { view: true, edit: ["account-manager"] } },
        },
        {
          type: "track-child",
          kind: "tracker",
          tracker: { child_workflow_type: "onboarding" },
          access: { "test-app": { view: true } },
        },
      ],
    },
  ];
}

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await clearMongoClientCache();
  await mongo.cleanup();
});

async function resetCollections() {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("events").deleteMany({});
}

beforeEach(async () => {
  await clearMongoClientCache();
  await resetCollections();
});

function makeCallApi({ failOn = null, calls = [] } = {}) {
  return async ({ endpointId, payload }) => {
    calls.push({ endpointId, payload });
    if (failOn === endpointId) {
      throw new Error(`forced failure: ${endpointId}`);
    }
    if (endpointId === "events/new-event") {
      await mongo.db.collection("events").insertOne({
        _id: payload._id,
        type: payload.type,
        display: payload.display,
        references: payload.references,
        metadata: payload.metadata,
        created: { timestamp: new Date() },
      });
      return { eventId: payload._id };
    }
    if (endpointId === "notifications/send-notification") {
      return null;
    }
    throw new Error(`unexpected callApi: ${endpointId}`);
  };
}

function buildContext({
  request,
  app_name = "test-app",
  user = {
    id: "U1",
    profile: { name: "Test User" },
    roles: ["account-manager"],
  },
  callApi,
  workflowsConfig = makeWorkflowsConfig(),
} = {}) {
  return {
    request,
    blockId: "test-block",
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
    connection: {
      databaseUri: mongo.uri,
      useTransactions: false,
      entry_id: "workflows",
      workflowsCollection: "workflows",
      actionsCollection: "actions",
      app_name,
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
      workflowsConfig,
      changeStamp,
      user,
    },
    callApi: callApi ?? makeCallApi(),
  };
}

async function seedWorkflow({ _id = "wf-1", overrides = {} } = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    title: "Onboarding",
    entity: { connection_id: "leads-collection", id: "lead-1", ref_key: "lead_ids" },
    status: [{ stage: "active", event_id: "e0", created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
    created: changeStamp,
    updated: changeStamp,
    ...overrides,
  });
}

async function seedAction({
  _id,
  type,
  action_group = null,
  stage = "action-required",
  workflow_id = "wf-1",
  kind = "check",
  extra = {},
}) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key: null,
    action_group,
    status: [{ stage, event_id: "e0", created: changeStamp }],
    metadata: {},
    created: changeStamp,
    updated: changeStamp,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sweep + lifecycle entry
// ─────────────────────────────────────────────────────────────────────────────

describe("cancel sweep + lifecycle", () => {
  test("sweeps all non-terminal actions to not-required and preserves done actions", async () => {
    await seedWorkflow({
      overrides: { summary: { done: 1, not_required: 0, total: 3 } },
    });
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    await seedAction({ _id: "a2", type: "kickoff", stage: "blocked" });
    await seedAction({ _id: "a3", type: "qualify", stage: "done" });

    const result = await CancelWorkflow(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );

    const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
    const a2 = await mongo.db.collection("actions").findOne({ _id: "a2" });
    const a3 = await mongo.db.collection("actions").findOne({ _id: "a3" });
    expect(a1.status[0].stage).toBe("not-required");
    expect(a2.status[0].stage).toBe("not-required");
    expect(a3.status[0].stage).toBe("done"); // preserved
    // Only swept actions appear in action_ids.
    expect(result.action_ids.sort()).toEqual(["a1", "a2"]);
  });

  test("status[] gains exactly one cancelled entry carrying the invocation event_id (no phantom completed)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

    const result = await CancelWorkflow(
      buildContext({ request: { workflow_id: "wf-1", reason: "duplicate" } }),
    );

    const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
    expect(wf.status).toHaveLength(2);
    expect(wf.status[0].stage).toBe("cancelled");
    expect(wf.status[0].event_id).toBe(result.event_id);
    expect(wf.status[0].reason).toBe("duplicate");
    expect(wf.status[1].stage).toBe("active");
  });

  test("emits exactly one workflow-cancelled event", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    const calls = [];

    const result = await CancelWorkflow(
      buildContext({
        request: { workflow_id: "wf-1" },
        callApi: makeCallApi({ calls }),
      }),
    );

    const eventCalls = calls.filter((c) => c.endpointId === "events/new-event");
    expect(eventCalls).toHaveLength(1);
    const eventDoc = await mongo.db
      .collection("events")
      .findOne({ _id: result.event_id });
    expect(eventDoc.type).toBe("workflow-cancelled");
    expect(eventDoc.references.action_ids.sort()).toEqual(["a1"]);
  });

  test("change-log records each per-action not-required transition", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    await seedAction({ _id: "a2", type: "kickoff", stage: "blocked" });

    await CancelWorkflow(
      buildContext({
        request: { workflow_id: "wf-1" },
        // changeLog opt-in.
      }),
    );
    // No changeLog configured → no entries (opt-out). Re-run with changeLog.
    await resetCollections();
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    await seedAction({ _id: "a2", type: "kickoff", stage: "blocked" });

    const ctx = buildContext({ request: { workflow_id: "wf-1" } });
    ctx.connection.changeLog = { collection: "log_changes", meta: {} };
    await CancelWorkflow(ctx);

    const logs = await mongo.db.collection("log_changes").find({}).toArray();
    const actionUpdates = logs.filter(
      (l) =>
        l.type === "MongoDBUpdateOne" &&
        ["a1", "a2"].includes(l.args?.filter?._id),
    );
    expect(actionUpdates).toHaveLength(2);
    for (const u of actionUpdates) {
      expect(u.after.status[0].stage).toBe("not-required");
    }
    await mongo.db.collection("log_changes").deleteMany({});
  });

  test("return shape is { action_ids, event_id, tracker_fired } with no completed_groups", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

    const result = await CancelWorkflow(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(Object.keys(result).sort()).toEqual(
      ["action_ids", "event_id", "tracker_fired"].sort(),
    );
    expect(result.tracker_fired).toEqual([]);
    expect("completed_groups" in result).toBe(false);
  });

  test("groups/summary recompute after the sweep", async () => {
    await seedWorkflow({
      overrides: { summary: { done: 0, not_required: 0, total: 2 } },
    });
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      stage: "action-required",
    });
    await seedAction({
      _id: "a2",
      type: "kickoff",
      action_group: "phase-2",
      stage: "action-required",
    });

    await CancelWorkflow(buildContext({ request: { workflow_id: "wf-1" } }));

    const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
    expect(wf.summary).toEqual({ done: 0, not_required: 2, total: 2 });
    expect(wf.groups.every((g) => g.status === "done")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preconditions
// ─────────────────────────────────────────────────────────────────────────────

describe("preconditions", () => {
  test("a missing workflow_id param throws invalid_params", async () => {
    await expect(
      CancelWorkflow(buildContext({ request: {} })),
    ).rejects.toMatchObject({ code: "invalid_params" });
  });

  test("a missing workflow throws workflow_not_found (intended tightening)", async () => {
    await expect(
      CancelWorkflow(buildContext({ request: { workflow_id: "nope" } })),
    ).rejects.toMatchObject({ code: "workflow_not_found" });
  });

  test("cancelling a completed workflow is unguarded (no stage guard)", async () => {
    await seedWorkflow({
      overrides: {
        status: [{ stage: "completed", event_id: "e0", created: changeStamp }],
      },
    });
    await seedAction({ _id: "a1", type: "qualify", stage: "done" });
    await expect(
      CancelWorkflow(buildContext({ request: { workflow_id: "wf-1" } })),
    ).resolves.toBeDefined();
    const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
    expect(wf.status[0].stage).toBe("cancelled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle event override (params.lifecycle_event_override)
// ─────────────────────────────────────────────────────────────────────────────

describe("lifecycle event override", () => {
  test("lifecycle_event_override.display overrides the event title for the named app; non-overridden apps fall through to default", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    const calls = [];

    const result = await CancelWorkflow(
      buildContext({
        request: {
          workflow_id: "wf-1",
          lifecycle_event_override: {
            display: {
              "test-app": {
                title: "Onboarding kicked off for {{ workflow.entity.id }}",
              },
            },
          },
        },
        callApi: makeCallApi({ calls }),
      }),
    );
    const eventDoc = await mongo.db
      .collection("events")
      .findOne({ _id: result.event_id });
    expect(eventDoc).not.toBeNull();
    // Override title rendered against lifecycle context ({ user, workflow, signal }).
    expect(eventDoc.display["test-app"].title).toBe(
      "Onboarding kicked off for lead-1",
    );
  });

  test("no lifecycle_event_override → engine default title unchanged", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    const calls = [];

    const result = await CancelWorkflow(
      buildContext({
        request: { workflow_id: "wf-1" },
        callApi: makeCallApi({ calls }),
      }),
    );
    const eventDoc = await mongo.db
      .collection("events")
      .findOne({ _id: result.event_id });
    expect(eventDoc).not.toBeNull();
    expect(eventDoc.display["test-app"].title).toBe(
      "Test User cancelled Onboarding",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tracker fire (parent → not-required)
// ─────────────────────────────────────────────────────────────────────────────

describe("tracker cascade", () => {
  async function seedParentWithTracker({ trackerStage = "in-progress" } = {}) {
    await mongo.db.collection("workflows").insertOne({
      _id: "wf-parent",
      workflow_type: "onboarding",
      entity: {
        connection_id: "leads-collection",
        id: "parent-entity",
        ref_key: "lead_ids",
      },
      status: [{ stage: "active", event_id: "e0", created: changeStamp }],
      summary: { done: 0, not_required: 0, total: 2 },
      groups: [],
      form_data: {},
      created: changeStamp,
      updated: changeStamp,
    });
    await mongo.db.collection("actions").insertOne({
      _id: "p-a",
      workflow_id: "wf-parent",
      type: "qualify",
      kind: "check",
      key: null,
      action_group: null,
      status: [
        { stage: "action-required", event_id: "e0", created: changeStamp },
      ],
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
    });
    await mongo.db.collection("actions").insertOne({
      _id: "p-tracker",
      workflow_id: "wf-parent",
      type: "track-child",
      kind: "tracker",
      key: null,
      action_group: null,
      tracker: { child_workflow_type: "onboarding" },
      child_workflow_id: "wf-child",
      access: { "test-app": { view: true } },
      workflow_type: "onboarding",
      status: [{ stage: trackerStage, event_id: "e0", created: changeStamp }],
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
    });
  }

  test("cancel a child → parent tracker lands not-required; tracker_fired carries the level entry", async () => {
    await seedParentWithTracker();
    await seedWorkflow({
      _id: "wf-child",
      overrides: {
        parent_action_id: "p-tracker",
        parent_workflow_id: "wf-parent",
      },
    });
    await seedAction({
      _id: "c-a1",
      type: "qualify",
      stage: "action-required",
      workflow_id: "wf-child",
    });

    const result = await CancelWorkflow(
      buildContext({ request: { workflow_id: "wf-child" } }),
    );

    expect(result.tracker_fired).toHaveLength(1);
    expect(result.tracker_fired[0]).toEqual({
      parent_action_id: "p-tracker",
      parent_workflow_id: "wf-parent",
      new_status: "not-required",
    });
    const tracker = await mongo.db
      .collection("actions")
      .findOne({ _id: "p-tracker" });
    expect(tracker.status[0].stage).toBe("not-required");
  });

  test("a workflow without parent_action_id fires nothing", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    const result = await CancelWorkflow(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(result.tracker_fired).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-commit dispatch failure
// ─────────────────────────────────────────────────────────────────────────────

describe("post-commit dispatch failure", () => {
  test("a failing event dispatch throws post_commit_dispatch_failed while the swept docs stay committed", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

    await expect(
      CancelWorkflow(
        buildContext({
          request: { workflow_id: "wf-1" },
          callApi: makeCallApi({ failOn: "events/new-event" }),
        }),
      ),
    ).rejects.toMatchObject({ code: "post_commit_dispatch_failed" });

    // Swept docs committed (durable).
    const a1 = await mongo.db.collection("actions").findOne({ _id: "a1" });
    expect(a1.status[0].stage).toBe("not-required");
    const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
    expect(wf.status[0].stage).toBe("cancelled");
  });
});
