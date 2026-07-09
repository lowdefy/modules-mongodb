/**
 * Integration tests for engine.updateActionFields (Part 24) — drives the
 * public engine surface against an in-memory Mongo (standalone) with recorded
 * callbacks. Mirrors SubmitWorkflowAction.test.js's harness conventions.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import createWorkflowsEngine from "../../createWorkflowsEngine.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

const loadedTimestamp = new Date("2026-01-01T00:00:00Z");

function makeWorkflowsConfig() {
  return [
    {
      type: "onboarding",
      entity: { connection_id: "leads-collection", ref_key: "lead_ids" },
      starting_actions: [{ type: "qualify", status: "action-required" }],
      actions: [
        {
          type: "qualify",
          kind: "form",
          status_map: {
            done: { "test-app": { message: "Owner {{ assignees[0] }}" } },
          },
          access: {
            "test-app": {
              view: true,
              edit: ["account-manager"],
              review: ["reviewer"],
            },
          },
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

async function seed({
  workflowStage = "active",
  actionStage = "done",
  action = {},
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id: "W1",
    workflow_type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      id: "L1",
      ref_key: "lead_ids",
    },
    status: [{ stage: workflowStage, event_id: "e0", created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    form_data: {},
    created: changeStamp,
    updated: { timestamp: loadedTimestamp },
  });
  await mongo.db.collection("actions").insertOne({
    _id: "A1",
    workflow_id: "W1",
    type: "qualify",
    kind: "form",
    key: null,
    action_group: null,
    workflow_type: "onboarding",
    status: [{ stage: actionStage, event_id: "e0", created: changeStamp }],
    assignees: ["u-old"],
    due_date: new Date("2026-01-01"),
    metadata: {},
    access: makeWorkflowsConfig()[0].actions[0].access,
    created: changeStamp,
    updated: changeStamp,
    ...action,
  });
}

/**
 * Shipped contract: semantic callbacks ({ emitEvent, sendNotification }).
 * Records calls under the historical endpointId-style labels so assertions
 * over `calls` keep working; `failOn` forces a throw for a given label to
 * exercise the post-commit dispatch-failure path.
 */
function makeCallbacks({ failOn = null, calls = [] } = {}) {
  return {
    emitEvent: async (eventDoc) => {
      calls.push({ endpointId: "events/new-event", payload: eventDoc });
      if (failOn === "events/new-event") {
        throw new Error("forced failure: events/new-event");
      }
      await mongo.db.collection("events").insertOne({
        _id: eventDoc._id,
        type: eventDoc.type,
        display: eventDoc.display,
        references: eventDoc.references,
        metadata: eventDoc.metadata,
        created: { timestamp: new Date() },
      });
      return { eventId: eventDoc._id };
    },
    sendNotification: async (payload) => {
      calls.push({ endpointId: "notifications/send-notification", payload });
      if (failOn === "notifications/send-notification") {
        throw new Error("forced failure: notifications/send-notification");
      }
      return null;
    },
  };
}

const DEFAULT_USER = {
  id: "U1",
  profile: { name: "Test User" },
  roles: ["account-manager"],
};

const AUDIT = {
  blockId: "test-block",
  connectionId: "test-conn",
  pageId: "test-page",
  requestId: "test-req",
};

function makeEngine({
  app_name = "test-app",
  workflowsConfig = makeWorkflowsConfig(),
  changeLog,
  callbacks,
  calls,
  failOn,
} = {}) {
  return createWorkflowsEngine({
    databaseUri: mongo.uri,
    useTransactions: false,
    entry_id: "workflows",
    workflowsCollection: "workflows",
    actionsCollection: "actions",
    app_name,
    workflowsConfig,
    ...(changeLog ? { changeLog } : {}),
    callbacks: callbacks ?? makeCallbacks({ calls, failOn }),
  });
}

/** Per-call wrapper: every write passes the stamp + audit bag. */
function updateActionFields(
  request,
  { user = DEFAULT_USER, ...engineOpts } = {},
) {
  return makeEngine(engineOpts).updateActionFields(request, {
    user,
    stamp: changeStamp,
    audit: { ...AUDIT, payload: request },
  });
}

beforeEach(async () => {
  await clearMongoClientCache();
  await resetCollections();
});

// ─────────────────────────────────────────────────────────────────────────────
// Fields write
// ─────────────────────────────────────────────────────────────────────────────

test("writes assignees; omitted keys preserved", async () => {
  await seed();
  const result = await updateActionFields({
    action_id: "A1",
    fields: {
      assignees: ["u-7"],
    },
  });
  expect(result).toEqual({ action_id: "A1", event_id: expect.any(String) });

  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc.assignees).toEqual(["u-7"]);
  // due_date omitted from the bag → preserved.
  expect(doc.due_date).toEqual(new Date("2026-01-01"));
});

test("null clears a field", async () => {
  await seed();
  await updateActionFields({ action_id: "A1", fields: { due_date: null } });
  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc.due_date).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// Cell re-render
// ─────────────────────────────────────────────────────────────────────────────

test("re-renders the status-map cell against the new field values", async () => {
  await seed();
  await updateActionFields({
    action_id: "A1",
    fields: { assignees: ["u-7"] },
  });
  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc["test-app"].message).toBe("Owner u-7");
});

// ─────────────────────────────────────────────────────────────────────────────
// No workflow write / no status change
// ─────────────────────────────────────────────────────────────────────────────

test("writes no workflow doc (timestamp unchanged) and does not change the action status", async () => {
  await seed({ actionStage: "done" });
  await updateActionFields({
    action_id: "A1",
    fields: { assignees: ["u-7"] },
  });
  const wf = await mongo.db.collection("workflows").findOne({ _id: "W1" });
  expect(wf.updated.timestamp).toEqual(loadedTimestamp); // untouched

  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc.status).toHaveLength(1);
  expect(doc.status[0].stage).toBe("done");
});

// ─────────────────────────────────────────────────────────────────────────────
// Role reject
// ─────────────────────────────────────────────────────────────────────────────

test("caller without the edit verb is rejected with access_denied and writes nothing", async () => {
  await seed();
  await expect(
    updateActionFields(
      { action_id: "A1", fields: { assignees: ["u-7"] } },
      {
        user: { id: "U2", profile: { name: "Reviewer" }, roles: ["reviewer"] },
      },
    ),
  ).rejects.toMatchObject({ code: "access_denied" });

  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc.assignees).toEqual(["u-old"]); // unchanged
  const eventCount = await mongo.db.collection("events").countDocuments();
  expect(eventCount).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle freedom
// ─────────────────────────────────────────────────────────────────────────────

test("updates fine on a completed workflow (required_after_close does not apply)", async () => {
  await seed({ workflowStage: "completed", actionStage: "done" });
  await updateActionFields({
    action_id: "A1",
    fields: { assignees: ["u-7"] },
  });
  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc.assignees).toEqual(["u-7"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Event + return
// ─────────────────────────────────────────────────────────────────────────────

test("dispatches an action-fields-updated event that carries no comment (Part 61)", async () => {
  await seed();
  const calls = [];
  const result = await updateActionFields(
    {
      action_id: "A1",
      fields: { assignees: ["u-7"] },
      // A crafted comment in the payload is ignored — the field-update
      // operation never carries one.
      comment: { text: "reassigned", html: "<p>reassigned</p>" },
    },
    { calls },
  );

  const eventCall = calls.find((c) => c.endpointId === "events/new-event");
  expect(eventCall.payload.type).toBe("action-fields-updated");
  expect(eventCall.payload.metadata).not.toHaveProperty("comment");
  // The comment is dropped: the event's display bucket carries no description.
  expect(eventCall.payload.display["test-app"]).not.toHaveProperty(
    "description",
  );
  expect(eventCall.payload._id).toBe(result.event_id);

  const ev = await mongo.db
    .collection("events")
    .findOne({ _id: result.event_id });
  expect(ev.type).toBe("action-fields-updated");
});

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch failure
// ─────────────────────────────────────────────────────────────────────────────

test("new_event dispatch failure → committed action survives, throws post_commit_dispatch_failed", async () => {
  await seed();
  await expect(
    updateActionFields(
      { action_id: "A1", fields: { assignees: ["u-7"] } },
      { failOn: "events/new-event" },
    ),
  ).rejects.toMatchObject({ code: "post_commit_dispatch_failed" });

  // The action write committed (steps 1–2 are durable before the dispatch).
  const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
  expect(doc.assignees).toEqual(["u-7"]);
});
