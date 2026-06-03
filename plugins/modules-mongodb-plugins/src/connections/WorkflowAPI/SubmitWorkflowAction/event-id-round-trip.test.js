import { randomUUID } from "node:crypto";

import inMemoryMongo from "../../shared/inMemoryMongo.js";
import SubmitWorkflowAction from "./SubmitWorkflowAction.js";

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

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("events").deleteMany({});

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
});

function buildLowdefyContext({ request }) {
  return {
    request,
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
    // Shipped contract: callApi({ endpointId, payload }) — pre-scoped opaque
    // ids, resolves the target's :return value, throws on failure.
    callApi: async ({ endpointId, payload }) => {
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
        // Default empty send_routine ends without :return.
        return null;
      }
      throw new Error(`unexpected callApi: ${endpointId}`);
    },
  };
}

describe("SubmitWorkflowAction event_id round-trip", () => {
  test("returns event_id equal to the inserted event doc _id", async () => {
    const result = await SubmitWorkflowAction(
      buildLowdefyContext({
        request: { action_id: "A1", interaction: "submit_edit" },
      }),
    );

    const eventDoc = await mongo.db
      .collection("events")
      .findOne({ _id: result.event_id });

    expect(eventDoc).not.toBeNull();
    expect(eventDoc._id).toBe(result.event_id);
  });

  test("returns event_id equal to every written action status[0].event_id", async () => {
    const result = await SubmitWorkflowAction(
      buildLowdefyContext({
        request: { action_id: "A1", interaction: "submit_edit" },
      }),
    );

    const actionDoc = await mongo.db
      .collection("actions")
      .findOne({ _id: "A1" });

    expect(actionDoc.status[0].event_id).toBe(result.event_id);
  });
});
