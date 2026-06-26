/**
 * Integration tests for GetWorkflowActionGroupOverview (Part 46 task 4).
 * Drives the real resolver against an in-memory Mongo.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import GetWorkflowActionGroupOverview from "./GetWorkflowActionGroupOverview.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

function makeWorkflowsConfig() {
  return [
    {
      type: "onboarding",
      title: "Onboarding",
      entity: {
        connection_id: "leads-collection",
        ref_key: "lead_ids",
        page_id: "leads/lead-view",
        id_query_key: "lead_id",
        title: "Lead",
      },
      display_order: 1,
      starting_actions: [{ type: "qualify", status: "action-required" }],
      action_groups: [
        { id: "phase-1", title: "Phase 1", icon: "rocket" },
        { id: "phase-2", title: "Phase 2", icon: "flag" },
      ],
      actions: [
        {
          type: "qualify",
          kind: "check",
          action_group: "phase-1",
          form_meta: { schema: { type: "object" } },
          access: { "test-app": { view: true, edit: ["account-manager"] } },
        },
        {
          type: "kickoff",
          kind: "check",
          action_group: "phase-1",
          access: { "test-app": { view: true, edit: ["account-manager"] } },
        },
        {
          type: "secret-action",
          kind: "check",
          action_group: "phase-1",
          access: { "test-app": { view: ["admin"], edit: ["admin"] } },
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
      app_name,
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
      workflowsConfig,
      changeStamp,
      user,
    },
    callApi: async () => null,
  };
}

async function seedWorkflow({
  _id = "wf-1",
  entity_id = "lead-1",
  form_data = {},
  overrides = {},
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      id: entity_id,
      ref_key: "lead_ids",
    },
    display_order: 1,
    status: [{ stage: "active", event_id: "e0", created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 2 },
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 2 },
      },
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 0 },
      },
    ],
    form_data,
    created: changeStamp,
    updated: changeStamp,
    ...overrides,
  });
}

// Denormalised declaration indices (Part 50 task 1), derived from the same
// config the engine receives so seeded docs carry the indices the comparator
// now reads. Unknown group/type → -1 (sorts last), matching findIndex semantics.
function declIndicesFor(type, action_group) {
  const cfg = makeWorkflowsConfig()[0];
  return {
    group_index: (cfg.action_groups ?? []).findIndex(
      (g) => g.id === action_group,
    ),
    decl_index: (cfg.actions ?? []).findIndex((a) => a.type === type),
  };
}

async function seedAction({
  _id,
  type,
  kind = "check",
  action_group = "phase-1",
  stage = "action-required",
  workflow_id = "wf-1",
  key = null,
  extra = {},
} = {}) {
  const { group_index, decl_index } = declIndicesFor(type, action_group);
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    workflow_type: "onboarding",
    type,
    kind,
    key,
    action_group,
    group_index,
    decl_index,
    status: [{ stage, event_id: "e0", created: changeStamp }],
    access: { "test-app": { view: true, edit: ["account-manager"] } },
    "test-app": {
      links: {
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
      },
      message: `${type} message`,
    },
    metadata: {},
    created: changeStamp,
    updated: changeStamp,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group null collapse
// ─────────────────────────────────────────────────────────────────────────────

describe("group null collapse", () => {
  test("workflow null + group null when workflow not found", async () => {
    const result = await GetWorkflowActionGroupOverview(
      buildContext({
        request: { workflow_id: "no-such", group_id: "phase-1" },
      }),
    );
    expect(result.workflow).toBeNull();
    expect(result.group).toBeNull();
    expect(result.actions).toEqual([]);
  });

  test("group is null when all actions in the group are dropped by access filter", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      action_group: "phase-1",
      extra: {
        access: { "test-app": { view: ["admin"], edit: ["admin"] } },
        "test-app": {
          links: { view: null, edit: null, review: null, error: null },
          message: "",
        },
      },
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.workflow).not.toBeNull();
    expect(result.group).toBeNull();
    expect(result.actions).toEqual([]);
  });

  test("group is null when group_id not found in workflow.groups", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "unknown-group",
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({
        request: { workflow_id: "wf-1", group_id: "unknown-group" },
      }),
    );
    expect(result.group).toBeNull();
    // actions may or may not be returned — workflow was found and actions were visible
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Basic return shape
// ─────────────────────────────────────────────────────────────────────────────

describe("return shape", () => {
  test("returns { workflow, group, actions } when workflow + group exist", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.workflow._id).toBe("wf-1");
    expect(result.group).not.toBeNull();
    expect(result.group.id).toBe("phase-1");
    expect(result.actions).toHaveLength(1);
  });

  test("workflow carries title from config", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.workflow.title).toBe("Onboarding");
  });

  test("entity_link resolves from wfConfig.entity", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.workflow.entity_link).toEqual({
      pageId: "leads/lead-view",
      urlQuery: { lead_id: "lead-1" },
      title: "Lead",
    });
  });

  test("entity_link is null when the workflow config has no entity block", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const config = makeWorkflowsConfig();
    delete config[0].entity;
    const result = await GetWorkflowActionGroupOverview(
      buildContext({
        request: { workflow_id: "wf-1", group_id: "phase-1" },
        workflowsConfig: config,
      }),
    );
    expect(result.workflow.entity_link).toBeNull();
  });

  test("entity_link is null when the workflow_type is not in workflowsConfig", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({
        request: { workflow_id: "wf-1", group_id: "phase-1" },
        workflowsConfig: [],
      }),
    );
    expect(result.workflow.entity_link).toBeNull();
  });

  test("group carries title + icon from config but no link", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.group.title).toBe("Phase 1");
    expect(result.group.icon).toBe("rocket");
    expect("link" in result.group).toBe(false);
  });

  test("group carries status and summary from workflow doc", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.group.status).toBe("in-progress");
    expect(result.group.summary).toEqual({
      done: 0,
      not_required: 0,
      total: 2,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action card shape (no _id/kind on overview cards)
// ─────────────────────────────────────────────────────────────────────────────

describe("action card shape", () => {
  test("action card has type, status, message, link, allowed — no _id or kind", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    const card = result.actions[0];
    expect(card.type).toBe("qualify");
    expect(card.status).toBe("action-required");
    expect(card.message).toBe("qualify message");
    expect(card.allowed).toBeDefined();
    expect(card.link).toBeDefined();
    expect("_id" in card).toBe(false);
    expect("kind" in card).toBe(false);
  });

  test("form_meta is populated from action config", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    const card = result.actions.find((c) => c.type === "qualify");
    expect(card.form_meta).toEqual({ schema: { type: "object" } });
  });

  test("form_meta is null when action config has no form_meta", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    const card = result.actions.find((c) => c.type === "kickoff");
    expect(card.form_meta).toBeNull();
  });

  test("action card carries key for keyed actions", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      key: "slot-a",
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.actions[0].key).toBe("slot-a");
  });

  test("action card key is null for unkeyed actions", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.actions[0].key).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Access drop
// ─────────────────────────────────────────────────────────────────────────────

describe("access drop", () => {
  test("action with no accessible verb for this user is dropped", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      action_group: "phase-1",
      extra: {
        access: { "test-app": { view: ["admin"], edit: ["admin"] } },
        "test-app": {
          links: { view: null, edit: null, review: null, error: null },
          message: "",
        },
      },
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(
      result.actions.find((c) => c.type === "secret-action"),
    ).toBeUndefined();
    expect(result.actions.find((c) => c.type === "qualify")).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Within-group ordering: declaration order, not-required sinks last
// ─────────────────────────────────────────────────────────────────────────────

describe("within-group action ordering", () => {
  // config actions (all phase-1): qualify (decl 0), kickoff (decl 1), secret-action (decl 2)
  test("orders by action declaration index", async () => {
    await seedWorkflow();
    // seed in reverse declaration order.
    await seedAction({ _id: "a-kickoff", type: "kickoff" });
    await seedAction({ _id: "a-qualify", type: "qualify" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.actions.map((c) => c.type)).toEqual(["qualify", "kickoff"]);
  });

  test("not-required sinks below action-required even when it declares earlier", async () => {
    await seedWorkflow();
    // qualify declares first (decl 0) but is not-required → must sink below kickoff (decl 1).
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      stage: "not-required",
    });
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      stage: "action-required",
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.actions.map((c) => c.type)).toEqual(["kickoff", "qualify"]);
    expect(result.actions[0].status).toBe("action-required");
    expect(result.actions[1].status).toBe("not-required");
  });

  test("keyed siblings (same type) order by key", async () => {
    await seedWorkflow();
    await seedAction({ _id: "q-beta", type: "qualify", key: "beta" });
    await seedAction({ _id: "q-alpha", type: "qualify", key: "alpha" });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.actions.map((c) => c.key)).toEqual(["alpha", "beta"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// form_data pruning
// ─────────────────────────────────────────────────────────────────────────────

describe("form_data pruning", () => {
  test("form_data pruned to view-visible actions (unkeyed)", async () => {
    await seedWorkflow({
      form_data: {
        qualify: { answer: "yes" },
        kickoff: { note: "ok" },
        // form_data key matches action type verbatim (per planFormDataMerge)
        "secret-action": { sensitive: "leak" },
      },
    });
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-1" });
    // secret-action dropped by access
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      action_group: "phase-1",
      extra: {
        access: { "test-app": { view: ["admin"] } },
        "test-app": {
          links: { view: null, edit: null, review: null, error: null },
          message: "",
        },
      },
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.workflow.form_data.qualify).toEqual({ answer: "yes" });
    expect(result.workflow.form_data.kickoff).toEqual({ note: "ok" });
    expect("secret-action" in result.workflow.form_data).toBe(false);
  });

  test("keyed action: only visible key slices ship; denied sibling key does not leak", async () => {
    // Two keyed actions of type 'qualify': key 'a' (visible) and key 'b' (denied).
    await seedWorkflow({
      form_data: {
        qualify: {
          a: { val: 1 },
          b: { secret: 2 },
        },
      },
    });
    // key 'a' — visible
    await seedAction({
      _id: "qa",
      type: "qualify",
      action_group: "phase-1",
      key: "a",
    });
    // key 'b' — denied (admin only)
    await seedAction({
      _id: "qb",
      type: "qualify",
      action_group: "phase-1",
      key: "b",
      extra: {
        access: { "test-app": { view: ["admin"] } },
        "test-app": {
          links: { view: null, edit: null, review: null, error: null },
          message: "",
        },
      },
    });

    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );

    expect(result.workflow.form_data.qualify).toEqual({ a: { val: 1 } });
    expect("b" in (result.workflow.form_data.qualify ?? {})).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Only actions in the requested group are returned
// ─────────────────────────────────────────────────────────────────────────────

describe("group scoping", () => {
  test("only actions in the requested group_id are included", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    // This action is in phase-2 and should not appear
    await mongo.db.collection("actions").insertOne({
      _id: "a2",
      workflow_id: "wf-1",
      workflow_type: "onboarding",
      type: "kickoff",
      kind: "check",
      key: null,
      action_group: "phase-2",
      status: [
        { stage: "action-required", event_id: "e0", created: changeStamp },
      ],
      access: { "test-app": { view: true, edit: ["account-manager"] } },
      "test-app": {
        links: {
          view: {
            pageId: "workflows/workflow-action-view",
            urlQuery: { action_id: "a2" },
          },
          edit: null,
          review: null,
          error: null,
        },
        message: "kickoff message",
      },
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
    });
    const result = await GetWorkflowActionGroupOverview(
      buildContext({ request: { workflow_id: "wf-1", group_id: "phase-1" } }),
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("qualify");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meta
// ─────────────────────────────────────────────────────────────────────────────

describe("handler meta", () => {
  test("has schema and meta with both check flags false", () => {
    expect(GetWorkflowActionGroupOverview.schema).toEqual({});
    expect(GetWorkflowActionGroupOverview.meta).toEqual({
      checkRead: false,
      checkWrite: false,
    });
  });
});
