import { randomUUID } from "node:crypto";

import inMemoryMongo from "../../shared/inMemoryMongo.js";
import SubmitWorkflowAction from "./SubmitWorkflowAction.js";

const SPEC_TEMPLATE =
  "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}";

const workflowsConfig = [
  {
    type: "onboarding",
    entity_collection: "leads-collection",
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        access: {
          "test-app": ["view", "edit"],
          roles: ["account-manager"],
        },
      },
    ],
  },
];

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1" },
};

let mongo;
let notificationCalls;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

async function resetCollections() {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("events").deleteMany({});
  await mongo.db.collection("notifications").deleteMany({});
}

async function seedWorkedExample() {
  await mongo.db.collection("workflows").insertOne({
    _id: "W1",
    workflow_type: "onboarding",
    entity_id: "L1",
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    created: changeStamp,
    updated: changeStamp,
  });

  await mongo.db.collection("actions").insertOne({
    _id: "A1",
    workflow_id: "W1",
    type: "qualify",
    kind: "form",
    key: null,
    status: [{ stage: "action-required", created: changeStamp }],
    created: changeStamp,
    updated: changeStamp,
  });
}

beforeEach(async () => {
  notificationCalls = [];
  await resetCollections();
  await seedWorkedExample();
});

// Shipped contract: callApi({ endpointId, payload }) — pre-scoped opaque
// endpoint ids, resolves the target's :return value, throws on failure.
function makeCallApi({ sendRoutineWired }) {
  return async ({ endpointId, payload }) => {
    if (endpointId === "events/new-event") {
      const _id = payload._id ?? randomUUID();
      const doc = {
        _id,
        ...(payload.display ?? {}),
        ...(payload.references ?? {}),
        date: new Date(),
        created: { timestamp: new Date() },
        type: payload.type,
        metadata: payload.metadata,
        files: payload.files,
      };
      await mongo.db.collection("events").insertOne(doc);
      return { eventId: _id };
    }
    if (endpointId === "notifications/send-notification") {
      if (sendRoutineWired) {
        notificationCalls.push(payload);
      }
      // Default empty send_routine ends without :return.
      return null;
    }
    throw new Error(`unexpected callApi: ${endpointId}`);
  };
}

function buildContext({ sendRoutineWired }) {
  return {
    request: { action_id: "A1", interaction: "submit_edit" },
    blockId: "test-block",
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
    connection: {
      databaseUri: mongo.uri,
      workflowsCollection: "workflows",
      actionsCollection: "actions",
      app_name: "test-app",
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
      workflowsConfig,
      actionsEnum,
      changeStamp,
    },
    user: {
      id: "U1",
      profile: { name: "Test User" },
      roles: ["account-manager"],
    },
    callApi: makeCallApi({ sendRoutineWired }),
  };
}

describe("Part 8 — worked-example onboarding smoke", () => {
  describe("with send_routine wired", () => {
    test("writes a log event with the expected default shape", async () => {
      const result = await SubmitWorkflowAction(
        buildContext({ sendRoutineWired: true }),
      );

      const eventDoc = await mongo.db
        .collection("events")
        .findOne({ _id: result.event_id });

      expect(eventDoc).not.toBeNull();
      expect(eventDoc.type).toBe("action-submit_edit");
      expect(eventDoc["test-app"]).toBeDefined();
      expect(eventDoc["test-app"].title._nunjucks.template).toBe(SPEC_TEMPLATE);
      expect(eventDoc.workflow_ids).toEqual(["W1"]);
      expect(eventDoc.action_ids).toEqual(["A1"]);
      expect(eventDoc.leads_ids).toEqual(["L1"]);
      expect(eventDoc.metadata).toEqual({
        action_type: "qualify",
        workflow_type: "onboarding",
        interaction: "submit_edit",
        current_key: null,
        status_before: "action-required",
        status_after: "done",
      });
    });

    test("dispatches send-notification with the just-emitted event_id", async () => {
      const result = await SubmitWorkflowAction(
        buildContext({ sendRoutineWired: true }),
      );

      expect(notificationCalls).toHaveLength(1);
      expect(notificationCalls[0]).toEqual({ event_ids: [result.event_id] });
    });
  });

  describe("with send_routine unwired", () => {
    test("does not throw — notifications module no-ops silently", async () => {
      const result = await SubmitWorkflowAction(
        buildContext({ sendRoutineWired: false }),
      );

      expect(result.event_id).toBeDefined();
      expect(notificationCalls).toHaveLength(0);
    });
  });
});
