/**
 * Adapter-contract tests (workflows-sdk-split design).
 *
 * The engine's behaviour is covered in @lowdefy/mongodb-workflows-sdk; these
 * tests cover what the PLUGIN owns — the lowdefyContext → SDK mapping:
 *   - endpoints.new_event / endpoints.send_notification → emitEvent /
 *     sendNotification callbacks (dispatched via callApi verbatim)
 *   - request.hooks endpointId leaves → hook functions wrapping callApi
 *   - entity.data_endpoint → resolveEntityData → callApi
 *   - connection.changeStamp → per-call stamp (stamped onto written docs)
 *   - lowdefyContext request-context fields → audit (stamped onto change-log)
 *   - resolver schema/meta statics (Lowdefy read/write gating)
 * Driven through the real connection objects against an in-memory Mongo.
 */
import inMemoryMongo, {
  clearMongoClientCache,
} from "@lowdefy/mongodb-workflows-sdk/testing";

import WorkflowAPI from "./WorkflowAPI/WorkflowAPI.js";
import EventsTimeline from "./EventsTimeline/EventsTimeline.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-06-01T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

const user = {
  id: "U1",
  profile: { name: "Test User" },
  roles: ["account-manager"],
};

const workflowsConfig = [
  {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      data_endpoint: "host/onboarding-entity-data",
    },
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        access: { "test-app": { view: true, edit: ["account-manager"] } },
      },
    ],
  },
];

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await clearMongoClientCache();
  await mongo.cleanup();
});

function makeCallApi({ calls }) {
  return async ({ endpointId, payload }) => {
    calls.push({ endpointId, payload });
    if (endpointId === "events/new-event") {
      await mongo.db.collection("events").insertOne({ _id: payload._id });
      return { eventId: payload._id };
    }
    if (endpointId === "host/onboarding-entity-data") {
      return { name: "Acme Lead" };
    }
    return null;
  };
}

function makeLowdefyContext({ request, calls, changeLog } = {}) {
  return {
    request,
    blockId: "adapter-block",
    connectionId: "adapter-conn",
    pageId: "adapter-page",
    requestId: "adapter-req",
    connection: {
      databaseUri: mongo.uri,
      useTransactions: false,
      entry_id: "workflows",
      workflowsCollection: "workflows",
      actionsCollection: "actions",
      app_name: "test-app",
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
      workflowsConfig,
      changeStamp,
      user,
      ...(changeLog ? { changeLog } : {}),
    },
    callApi: makeCallApi({ calls }),
  };
}

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("events").deleteMany({});
  await mongo.db.collection("audit-log").deleteMany({});
});

test("resolver statics carry the Lowdefy read/write meta", () => {
  expect(WorkflowAPI.requests.StartWorkflow.schema).toEqual({});
  expect(WorkflowAPI.requests.StartWorkflow.meta).toEqual({
    checkRead: false,
    checkWrite: true,
  });
  expect(WorkflowAPI.requests.GetWorkflowOverview.meta).toEqual({
    checkRead: false,
    checkWrite: false,
  });
  expect(EventsTimeline.requests.GetEventsTimeline.meta).toEqual({
    checkRead: false,
    checkWrite: false,
  });
  // Request keys are the plugin's public request types.
  expect(Object.keys(WorkflowAPI.requests).sort()).toEqual(
    [
      "StartWorkflow",
      "CancelWorkflow",
      "CloseWorkflow",
      "SubmitWorkflowAction",
      "UpdateActionFields",
      "GetEntityWorkflows",
      "GetWorkflowOverview",
      "GetWorkflowActionGroupOverview",
      "GetWorkflowAction",
    ].sort(),
  );
});

test("StartWorkflow: event + notification dispatch via endpoints, stamp on docs, audit on change-log", async () => {
  const calls = [];
  const result = await WorkflowAPI.requests.StartWorkflow(
    makeLowdefyContext({
      request: { workflow_type: "onboarding", entity: { id: "L1" } },
      calls,
      changeLog: { collection: "audit-log", meta: { app: "test-app" } },
    }),
  );

  expect(result.workflow_id).toBeDefined();

  // endpoints.new_event → emitEvent: the event doc goes to callApi verbatim.
  const eventCalls = calls.filter((c) => c.endpointId === "events/new-event");
  expect(eventCalls).toHaveLength(1);
  expect(eventCalls[0].payload._id).toBe(result.event_id);

  // endpoints.send_notification → sendNotification keyed on the event id.
  const notifCalls = calls.filter(
    (c) => c.endpointId === "notifications/send-notification",
  );
  expect(notifCalls).toHaveLength(1);
  expect(notifCalls[0].payload).toEqual({ event_ids: [result.event_id] });

  // connection.changeStamp → stamp → created/updated on written docs.
  const wfDoc = await mongo.db
    .collection("workflows")
    .findOne({ _id: result.workflow_id });
  expect(wfDoc.created).toEqual(changeStamp);
  expect(wfDoc.updated).toEqual(changeStamp);

  // request-context fields + payload → audit → change-log entries.
  const logEntries = await mongo.db.collection("audit-log").find({}).toArray();
  expect(logEntries.length).toBeGreaterThan(0);
  for (const entry of logEntries) {
    expect(entry.blockId).toBe("adapter-block");
    expect(entry.connectionId).toBe("adapter-conn");
    expect(entry.pageId).toBe("adapter-page");
    expect(entry.requestId).toBe("adapter-req");
    expect(entry.payload).toEqual({
      workflow_type: "onboarding",
      entity: { id: "L1" },
    });
    expect(entry.meta).toEqual({ app: "test-app" });
  }
});

test("SubmitWorkflowAction: hook endpointId leaves are invoked via callApi", async () => {
  const calls = [];
  const start = await WorkflowAPI.requests.StartWorkflow(
    makeLowdefyContext({
      request: { workflow_type: "onboarding", entity: { id: "L1" } },
      calls: [],
    }),
  );
  const result = await WorkflowAPI.requests.SubmitWorkflowAction(
    makeLowdefyContext({
      request: {
        action_id: start.action_ids[0],
        signal: "submit",
        hooks: {
          qualify: {
            submit: { pre: "hooks/qualify-pre", post: "hooks/qualify-post" },
          },
        },
      },
      calls,
    }),
  );

  const hookCalls = calls.filter((c) => c.endpointId.startsWith("hooks/"));
  expect(hookCalls.map((c) => c.endpointId)).toEqual([
    "hooks/qualify-pre",
    "hooks/qualify-post",
  ]);
  // The pre-hook payload carries the loaded workflow + action + user.
  expect(hookCalls[0].payload.workflow._id).toBe(start.workflow_id);
  expect(hookCalls[0].payload.user).toEqual(user);
  expect(result.event_id).toBeDefined();
});

test("GetWorkflowOverview: entity.data_endpoint → resolveEntityData → callApi", async () => {
  const calls = [];
  const start = await WorkflowAPI.requests.StartWorkflow(
    makeLowdefyContext({
      request: { workflow_type: "onboarding", entity: { id: "L1" } },
      calls: [],
    }),
  );
  const { workflow } = await WorkflowAPI.requests.GetWorkflowOverview(
    makeLowdefyContext({
      request: { workflow_id: start.workflow_id },
      calls,
    }),
  );

  const entityCalls = calls.filter(
    (c) => c.endpointId === "host/onboarding-entity-data",
  );
  expect(entityCalls).toHaveLength(1);
  expect(entityCalls[0].payload).toEqual({ entity_id: "L1" });
  // The routine's `name` is lifted onto entity_link chrome.
  expect(workflow.entity_link.name).toBe("Acme Lead");
});
