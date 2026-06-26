/**
 * Integration tests for GetEventsTimeline (Part 46 task 6).
 * Drives the real resolver against an in-memory Mongo.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import GetEventsTimeline from "./GetEventsTimeline.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

// Declaration order: groups [phase-1, phase-2];
//   actions [qualify (phase-1, 0), kickoff (phase-2, 1), site-visit (phase-1, 2)]
function makeWorkflowsConfig() {
  return [
    {
      type: "onboarding",
      action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
      actions: [
        { type: "qualify", action_group: "phase-1" },
        { type: "kickoff", action_group: "phase-2" },
        { type: "site-visit", action_group: "phase-1" },
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
  await mongo.db.collection("log-events").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("user-contacts").deleteMany({});
}

beforeEach(async () => {
  await clearMongoClientCache();
  await resetCollections();
});

function buildContext({
  request,
  app_name = "test-app",
  user = {
    id: "U1",
    profile: { name: "Test User" },
    roles: ["account-manager"],
  },
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
      eventsCollection: "log-events",
      app_name,
      workflowsConfig,
      changeStamp,
      user,
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
    },
    callApi: async () => null,
  };
}

/**
 * Seed a log event. The event's action_ids array links it to zero or more
 * action docs. `app_name_block` is the display block stored under `app_name`
 * on the event doc (title/description/info).
 */
async function seedEvent({
  _id,
  reference_field = "lot_ids",
  reference_value = "lot-1",
  action_ids = [],
  date = new Date("2026-05-01T10:00:00Z"),
  created_timestamp = new Date("2026-05-01T10:00:00Z"),
  user_id = "u1",
  app_name = "test-app",
  title = "Event Title",
  description = "Event Description",
  info = "Event Info",
} = {}) {
  await mongo.db.collection("log-events").insertOne({
    _id,
    [reference_field]: reference_value,
    action_ids,
    date,
    created: { timestamp: created_timestamp, user: { id: user_id } },
    [app_name]: { title, description, info },
  });
}

/**
 * Seed a contact doc in the shared user-contacts collection. `picture` is
 * stored under `profile.picture` (the field GetEventsTimeline joins onto the
 * event author's created.user.picture).
 */
async function seedContact({
  _id,
  picture = null,
  name = "Contact Name",
} = {}) {
  await mongo.db.collection("user-contacts").insertOne({
    _id,
    profile: { name, picture },
  });
}

/**
 * Seed an action doc. `stage` is the current (first) status stage.
 * `history` allows injecting extra historical stages (appended after current).
 */
async function seedAction({
  _id,
  workflow_id = "wf-1",
  workflow_type, // defaults below: 'onboarding' for workflow cards, null otherwise
  type = "qualify",
  action_group = "phase-1",
  kind = "check",
  status_history = null, // full status array override
  stage = "action-required",
  updated_timestamp = new Date("2026-05-01T09:00:00Z"),
  app_name = "test-app",
  message = "Action message",
  links = null,
  access = null,
  extra = {},
} = {}) {
  const defaultLinks = {
    view: {
      pageId: "workflows/workflow-action-view",
      urlQuery: { action_id: _id },
    },
    edit:
      stage === "action-required"
        ? {
            pageId: "workflows/workflow-action-edit",
            urlQuery: { action_id: _id },
          }
        : null,
    review: null,
    error: null,
  };
  const defaultAccess = {
    [app_name]: { view: true, edit: ["account-manager"] },
  };

  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    workflow_type: workflow_type ?? (workflow_id == null ? null : "onboarding"),
    type,
    action_group,
    kind,
    status: status_history ?? [{ stage, event_id: "e0", created: changeStamp }],
    [app_name]: {
      links: links ?? defaultLinks,
      message,
    },
    access: access ?? defaultAccess,
    updated: { timestamp: updated_timestamp, user: { id: "u1" } },
    created: changeStamp,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic return shape
// ─────────────────────────────────────────────────────────────────────────────

describe("basic return shape", () => {
  test("returns an empty array when no matching events", async () => {
    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-999" },
      }),
    );
    expect(result).toEqual([]);
  });

  test("returns events with title, description, info display fields from app_name block", async () => {
    await seedEvent({
      _id: "ev-1",
      title: "My Event",
      description: "My Desc",
      info: "My Info",
    });
    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("My Event");
    expect(result[0].description).toBe("My Desc");
    expect(result[0].info).toBe("My Info");
  });

  test("events with no linked actions return actions: []", async () => {
    await seedEvent({ _id: "ev-1", action_ids: [] });
    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toEqual([]);
  });

  test("schema and meta are set correctly", () => {
    expect(GetEventsTimeline.schema).toEqual({});
    expect(GetEventsTimeline.meta).toEqual({
      checkRead: false,
      checkWrite: false,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Card-worthiness filter
// ─────────────────────────────────────────────────────────────────────────────

describe("card-worthiness filter", () => {
  test("drops action whose current stage is blocked", async () => {
    await seedAction({
      _id: "a-blocked",
      stage: "blocked",
      // History has a non-blocked stage so it passes the "never worked" check.
      status_history: [
        { stage: "blocked", event_id: "e1" },
        { stage: "action-required", event_id: "e0" },
      ],
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-blocked"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toHaveLength(0);
  });

  test("drops action that has never reached an active stage (history: [blocked] only)", async () => {
    await seedAction({
      _id: "a-never",
      status_history: [{ stage: "blocked", event_id: "e0" }],
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-never"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toHaveLength(0);
  });

  test("drops action whose history is only blocked/not-required", async () => {
    await seedAction({
      _id: "a-never-worked",
      status_history: [
        { stage: "not-required", event_id: "e1" },
        { stage: "blocked", event_id: "e0" },
      ],
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-never-worked"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toHaveLength(0);
  });

  test("keeps action with current stage not-required that previously passed through action-required", async () => {
    // not-required is not blocked (current stage check passes) and it has a
    // non-blocked/non-not-required entry in history (action-required).
    await seedAction({
      _id: "a-nr",
      status_history: [
        { stage: "not-required", event_id: "e1" },
        { stage: "action-required", event_id: "e0" },
      ],
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-nr"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].actions[0]._id).toBe("a-nr");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Latest-event-per-action dedup
// ─────────────────────────────────────────────────────────────────────────────

describe("latest-event-per-action dedup", () => {
  test("action is attached only to its most-recent referencing event", async () => {
    // Two events both reference action 'a-1'. Only the later event should carry
    // the card; the earlier event should have an empty actions array.
    await seedAction({ _id: "a-1", stage: "action-required" });
    await seedEvent({
      _id: "ev-older",
      action_ids: ["a-1"],
      created_timestamp: new Date("2026-05-01T08:00:00Z"),
      date: new Date("2026-05-01T08:00:00Z"),
    });
    await seedEvent({
      _id: "ev-newer",
      action_ids: ["a-1"],
      created_timestamp: new Date("2026-05-01T10:00:00Z"),
      date: new Date("2026-05-01T10:00:00Z"),
    });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );

    // Sort result by date for deterministic assertion (newest first per pipeline).
    const newerEvent = result.find((e) => e._id === "ev-newer");
    const olderEvent = result.find((e) => e._id === "ev-older");

    expect(newerEvent).toBeDefined();
    expect(olderEvent).toBeDefined();
    expect(newerEvent.actions).toHaveLength(1);
    expect(newerEvent.actions[0]._id).toBe("a-1");
    expect(olderEvent.actions).toHaveLength(0);
  });

  test("two actions each on different events are attached to their respective events", async () => {
    await seedAction({ _id: "a-x", stage: "action-required" });
    await seedAction({ _id: "a-y", stage: "done" });
    await seedEvent({
      _id: "ev-1",
      action_ids: ["a-x"],
      created_timestamp: new Date("2026-05-01T09:00:00Z"),
    });
    await seedEvent({
      _id: "ev-2",
      action_ids: ["a-y"],
      created_timestamp: new Date("2026-05-01T10:00:00Z"),
    });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );

    const ev1 = result.find((e) => e._id === "ev-1");
    const ev2 = result.find((e) => e._id === "ev-2");
    expect(ev1.actions.map((a) => a._id)).toEqual(["a-x"]);
    expect(ev2.actions.map((a) => a._id)).toEqual(["a-y"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Access drop (workflow cards)
// ─────────────────────────────────────────────────────────────────────────────

describe("workflow card access drop", () => {
  test("drops workflow card when user holds no verb", async () => {
    await seedAction({
      _id: "a-restricted",
      stage: "action-required",
      access: { "test-app": { view: ["admin"], edit: ["admin"] } },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-restricted"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toHaveLength(0);
  });

  test("keeps workflow card when user has view: true", async () => {
    await seedAction({
      _id: "a-open",
      stage: "action-required",
      access: { "test-app": { view: true, edit: ["account-manager"] } },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-open"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions).toHaveLength(1);
  });

  test("drops card if user has only reviewer role but action requires admin", async () => {
    await seedAction({
      _id: "a-admin",
      stage: "action-required",
      access: {
        "test-app": {
          view: ["admin"],
          edit: ["admin"],
          review: ["admin"],
          error: ["admin"],
        },
      },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-admin"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
        user: { id: "U2", roles: ["reviewer"] },
      }),
    );
    expect(result[0].actions).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolved link on workflow cards
// ─────────────────────────────────────────────────────────────────────────────

describe("resolved link on workflow cards", () => {
  test("edit link is collapsed when user has edit access and edit link is set", async () => {
    await seedAction({
      _id: "a-edit",
      stage: "action-required",
      links: {
        view: {
          pageId: "workflows/action-view",
          urlQuery: { action_id: "a-edit" },
        },
        edit: {
          pageId: "workflows/action-edit",
          urlQuery: { action_id: "a-edit" },
        },
        review: null,
        error: null,
      },
      access: { "test-app": { view: true, edit: ["account-manager"] } },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-edit"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions[0].link.pageId).toContain("action-edit");
  });

  test("view link is used when edit link is null", async () => {
    await seedAction({
      _id: "a-view",
      stage: "done",
      links: {
        view: {
          pageId: "workflows/action-view",
          urlQuery: { action_id: "a-view" },
        },
        edit: null,
        review: null,
        error: null,
      },
      access: { "test-app": { view: true, edit: ["account-manager"] } },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-view"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions[0].link.pageId).toContain("action-view");
  });

  test("link is null when all verb links are null", async () => {
    await seedAction({
      _id: "a-nolink",
      stage: "action-required",
      links: { view: null, edit: null, review: null, error: null },
      access: { "test-app": { view: true } },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-nolink"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions[0].link).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _id and kind on cards
// ─────────────────────────────────────────────────────────────────────────────

describe("_id and kind on cards", () => {
  test("each action card carries _id and kind", async () => {
    await seedAction({ _id: "a-1", kind: "form", stage: "action-required" });
    await seedEvent({ _id: "ev-1", action_ids: ["a-1"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    const card = result[0].actions[0];
    expect(card._id).toBe("a-1");
    expect(card.kind).toBe("form");
  });

  test("status is the scalar current stage (not the raw array)", async () => {
    await seedAction({
      _id: "a-1",
      status_history: [
        { stage: "done", event_id: "e1" },
        { stage: "action-required", event_id: "e0" },
      ],
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-1"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions[0].status).toBe("done");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-workflow card pass-through (workflow_id null)
// ─────────────────────────────────────────────────────────────────────────────

describe("non-workflow card pass-through (workflow_id null)", () => {
  test("action with workflow_id null passes through with status and message, no link, no access check", async () => {
    // Deliberately restrictive access — would be dropped for a workflow card.
    await seedAction({
      _id: "a-task",
      workflow_id: null,
      stage: "action-required",
      access: { "test-app": { view: ["admin"], edit: ["admin"] } },
      message: "Task message",
      links: {
        view: { pageId: "tasks/task-view", urlQuery: { action_id: "a-task" } },
        edit: null,
        review: null,
        error: null,
      },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-task"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );

    // Card is included (no access drop for null workflow_id).
    expect(result[0].actions).toHaveLength(1);
    const card = result[0].actions[0];
    expect(card._id).toBe("a-task");
    expect(card.status).toBe("action-required");
    expect(card.message).toBe("Task message");
    // link is null (no link resolution for non-workflow cards).
    expect(card.link).toBeNull();
  });

  test("non-workflow card carries _id and kind", async () => {
    await seedAction({
      _id: "a-task",
      workflow_id: null,
      kind: "task",
      stage: "action-required",
      extra: { kind: "task" },
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-task"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    const card = result[0].actions[0];
    expect(card._id).toBe("a-task");
    expect(card.kind).toBe("task");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action card order within an event — declaration order
// ─────────────────────────────────────────────────────────────────────────────

describe("action card order within an event", () => {
  // config: groups [phase-1, phase-2];
  //   actions [qualify (phase-1, 0), kickoff (phase-2, 1), site-visit (phase-1, 2)]
  test("cards follow declaration order (group index, then action index)", async () => {
    // Seed in scrambled order; the engine must re-order by declaration.
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-2",
    });
    await seedAction({
      _id: "a-site-visit",
      type: "site-visit",
      action_group: "phase-1",
    });
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
    });
    await seedEvent({
      _id: "ev-1",
      action_ids: ["a-kickoff", "a-site-visit", "a-qualify"],
    });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    // phase-1 (qualify decl 0, site-visit decl 2) then phase-2 (kickoff decl 1).
    expect(result[0].actions.map((a) => a._id)).toEqual([
      "a-qualify",
      "a-site-visit",
      "a-kickoff",
    ]);
  });

  test("non-workflow cards (no workflow_type) sort after workflow cards", async () => {
    await seedAction({
      _id: "a-task",
      workflow_id: null,
      type: "misc",
      action_group: null,
    });
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
    });
    await seedEvent({ _id: "ev-1", action_ids: ["a-task", "a-qualify"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].actions.map((a) => a._id)).toEqual([
      "a-qualify",
      "a-task",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reference value filter (action whose _id == reference_value is excluded)
// ─────────────────────────────────────────────────────────────────────────────

describe("reference value filter", () => {
  test("action whose _id equals reference_value is excluded from event.actions", async () => {
    // An action whose _id happens to equal the entity reference value (lot-1).
    await seedAction({ _id: "lot-1", stage: "action-required" });
    await seedEvent({ _id: "ev-1", action_ids: ["lot-1"] });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    // The action is filtered out because its _id === reference_value.
    expect(result[0].actions).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Events without the app_name display block are excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("events without app_name display block are excluded", () => {
  test("event without app_name display block does not appear in results", async () => {
    // Insert an event doc without the 'test-app' field.
    await mongo.db.collection("log-events").insertOne({
      _id: "ev-no-display",
      lot_ids: "lot-1",
      action_ids: [],
      date: new Date("2026-05-01T10:00:00Z"),
      created: changeStamp,
      // No 'test-app' field.
    });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result.find((e) => e._id === "ev-no-display")).toBeUndefined();
  });

  test("event with app_name display block set to null is excluded", async () => {
    await mongo.db.collection("log-events").insertOne({
      _id: "ev-null-display",
      lot_ids: "lot-1",
      action_ids: [],
      date: new Date("2026-05-01T10:00:00Z"),
      created: changeStamp,
      "test-app": null,
    });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result.find((e) => e._id === "ev-null-display")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Event author avatar resolution (created.user.picture join, F7)
// ─────────────────────────────────────────────────────────────────────────────

describe("event author avatar resolution", () => {
  test("resolves created.user.picture from the matching contact", async () => {
    await seedContact({ _id: "u1", picture: "https://cdn.example/u1.png" });
    await seedEvent({ _id: "ev-1", user_id: "u1" });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].created.user.picture).toBe("https://cdn.example/u1.png");
  });

  test("leaves created.user.picture null when no contact matches", async () => {
    // No contact seeded for u1 → unmatched join degrades to no picture.
    await seedEvent({ _id: "ev-1", user_id: "u1" });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].created.user.picture).toBeNull();
  });

  test("leaves created.user.picture null when the contact has no profile.picture", async () => {
    await seedContact({ _id: "u1", picture: null });
    await seedEvent({ _id: "ev-1", user_id: "u1" });

    const result = await GetEventsTimeline(
      buildContext({
        request: { reference_field: "lot_ids", reference_value: "lot-1" },
      }),
    );
    expect(result[0].created.user.picture).toBeNull();
  });
});
