/**
 * Integration tests for GetWorkflowOverview (Part 46 task 4).
 * Drives the real resolver against an in-memory Mongo.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import GetWorkflowOverview from "./GetWorkflowOverview.js";

jest.setTimeout(60000);

// Flatten the grouped response back to a single ordered card list. Groups are
// emitted in declaration order and cards within a group keep declaration order,
// so flatMap reproduces the canonical action order.
const cards = (result) => (result.groups ?? []).flatMap((g) => g.actions);

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
        list_page_id: "leads/lead-list",
        list_title: "Leads",
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
          action_group: "phase-2",
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
        summary: { done: 0, not_required: 0, total: 1 },
      },
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 1 },
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
  action_group = null,
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
          pageId: "workflows/onboarding-action",
          urlQuery: { action_id: _id },
        },
        edit:
          stage === "action-required"
            ? {
                pageId: "workflows/onboarding-action",
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
// Basic return shape
// ─────────────────────────────────────────────────────────────────────────────

describe("GetWorkflowOverview return shape", () => {
  test("returns { workflow: null, groups: [] } when workflow not found", async () => {
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "no-such" } }),
    );
    expect(result).toEqual({ workflow: null, groups: [] });
  });

  test("returns { workflow, groups } when workflow exists", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(result.workflow).toBeDefined();
    expect(result.workflow._id).toBe("wf-1");
    expect(cards(result)).toHaveLength(1);
  });

  test("workflow carries title from config", async () => {
    await seedWorkflow();
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(result.workflow.title).toBe("Onboarding");
  });

  test("entity_link resolves from wfConfig.entity", async () => {
    await seedWorkflow();
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(result.workflow.entity_link).toEqual({
      pageId: "leads/lead-view",
      urlQuery: { lead_id: "lead-1" },
      title: "Lead",
      // Part 26: null because no entity.data routine is declared (callApi → null).
      name: null,
      // Part 63: list-crumb fields ride the response for the runtime breadcrumb.
      list_page_id: "leads/lead-list",
      list_title: "Leads",
    });
  });

  test("entity_link is null when the workflow config has no entity block", async () => {
    await seedWorkflow();
    const config = makeWorkflowsConfig();
    delete config[0].entity;
    const result = await GetWorkflowOverview(
      buildContext({
        request: { workflow_id: "wf-1" },
        workflowsConfig: config,
      }),
    );
    expect(result.workflow.entity_link).toBeNull();
  });

  test("entity_link is null when the workflow_type is not in workflowsConfig", async () => {
    await seedWorkflow();
    // workflowsConfig has no entry whose type matches the doc's workflow_type.
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" }, workflowsConfig: [] }),
    );
    expect(result.workflow.entity_link).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// grouping — cards grouped by action_group, group display config from config
// ─────────────────────────────────────────────────────────────────────────────

describe("grouping", () => {
  const adminUser = {
    id: "U2",
    profile: { name: "Admin" },
    roles: ["admin", "account-manager"],
  };

  test("groups carry id/title/icon/order in config declaration order", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-2",
    });
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
    });

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );

    expect(result.groups).toEqual([
      {
        id: "phase-1",
        order: 0,
        title: "Phase 1",
        icon: "rocket",
        actions: [expect.objectContaining({ type: "qualify" })],
      },
      {
        id: "phase-2",
        order: 1,
        title: "Phase 2",
        icon: "flag",
        actions: [expect.objectContaining({ type: "kickoff" })],
      },
    ]);
  });

  test("actions land in their declared group", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
    });
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      action_group: "phase-1",
    });
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-2",
    });

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" }, user: adminUser }),
    );

    const phase1 = result.groups.find((g) => g.id === "phase-1");
    const phase2 = result.groups.find((g) => g.id === "phase-2");
    expect(phase1.actions.map((c) => c.type)).toEqual([
      "qualify",
      "secret-action",
    ]);
    expect(phase2.actions.map((c) => c.type)).toEqual(["kickoff"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action card shape: no _id/kind (per spec), has form_meta
// ─────────────────────────────────────────────────────────────────────────────

describe("action card shape", () => {
  test("action card has type, status, message, link, allowed — no _id or kind", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    const card = cards(result)[0];
    expect(card.type).toBe("qualify");
    expect(card.status).toBe("action-required");
    expect(card.message).toBe("qualify message");
    expect(card.allowed).toBeDefined();
    expect(card.link).toBeDefined();
    // No _id or kind on overview cards
    expect("_id" in card).toBe(false);
    expect("kind" in card).toBe(false);
  });

  test("form_meta is populated from action config", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    const card = cards(result).find((c) => c.type === "qualify");
    expect(card.form_meta).toEqual({ schema: { type: "object" } });
  });

  test("form_meta is null when action config has no form_meta", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-2" });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    const card = cards(result).find((c) => c.type === "kickoff");
    expect(card.form_meta).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Access drop
// ─────────────────────────────────────────────────────────────────────────────

describe("access drop", () => {
  test("action with no accessible verb for this user is dropped", async () => {
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
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    // secret-action not visible to account-manager
    expect(
      cards(result).find((c) => c.type === "secret-action"),
    ).toBeUndefined();
    // qualify is visible
    expect(cards(result).find((c) => c.type === "qualify")).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// form_data pruning
// ─────────────────────────────────────────────────────────────────────────────

describe("form_data pruning", () => {
  test("form_data is pruned to view-visible actions only (unkeyed)", async () => {
    await seedWorkflow({
      form_data: {
        qualify: { answer: "yes" },
        // form_data key matches action type verbatim (per planFormDataMerge)
        "secret-action": { sensitive: "data" },
        kickoff: { note: "done" },
      },
    });
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    // secret-action is dropped by access filter
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
    await seedAction({ _id: "a2", type: "kickoff", action_group: "phase-2" });

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );

    // qualify and kickoff should be in form_data, secret-action should not
    expect(result.workflow.form_data.qualify).toEqual({ answer: "yes" });
    expect(result.workflow.form_data.kickoff).toEqual({ note: "done" });
    expect("secret-action" in result.workflow.form_data).toBe(false);
  });

  test("form_data is empty object when no visible actions have form data", async () => {
    await seedWorkflow({ form_data: { qualify: { x: 1 } } });
    // Seed no visible actions (only a dropped secret action)
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

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(result.workflow.form_data).toEqual({});
  });

  test("keyed action: only visible key slices ship; denied sibling key does not leak", async () => {
    // Two keyed actions of type 'qualify': key 'a' (visible) and key 'b' (denied).
    // form_data.qualify = { a: { val: 1 }, b: { secret: 2 } }
    // Only key 'a' survives access; form_data.qualify.b must not ship.
    await seedWorkflow({
      form_data: {
        qualify: {
          a: { val: 1 },
          b: { secret: 2 },
        },
      },
    });
    // key 'a' — visible to account-manager
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

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );

    // qualify subtree should only contain key 'a'
    expect(result.workflow.form_data.qualify).toEqual({ a: { val: 1 } });
    expect("b" in (result.workflow.form_data.qualify ?? {})).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// key field on action cards
// ─────────────────────────────────────────────────────────────────────────────

describe("key field on action cards", () => {
  test("action card carries key for keyed actions", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      key: "slot-a",
    });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(cards(result)[0].key).toBe("slot-a");
  });

  test("action card key is null for unkeyed actions", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" } }),
    );
    expect(cards(result)[0].key).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// action ordering — declaration order (group index, not-required sink, decl index)
// ─────────────────────────────────────────────────────────────────────────────

describe("action ordering", () => {
  // config declares: groups [phase-1, phase-2];
  //   actions [qualify (phase-1, 0), kickoff (phase-2, 1), secret-action (phase-1, 2)]
  const adminUser = {
    id: "U2",
    profile: { name: "Admin" },
    roles: ["admin", "account-manager"],
  };

  test("orders by group declaration index, then action declaration index", async () => {
    await seedWorkflow();
    // Seed deliberately out of order.
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-2",
    });
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      action_group: "phase-1",
    });
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
    });

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" }, user: adminUser }),
    );
    // phase-1 (qualify decl 0, secret-action decl 2) then phase-2 (kickoff decl 1).
    expect(cards(result).map((c) => c.type)).toEqual([
      "qualify",
      "secret-action",
      "kickoff",
    ]);
  });

  test("not-required sinks to the bottom of its own group", async () => {
    await seedWorkflow();
    // qualify (decl 0) is not-required → sinks below secret-action (decl 2) within phase-1.
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
      stage: "not-required",
    });
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      action_group: "phase-1",
      stage: "action-required",
    });
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-2",
    });

    const result = await GetWorkflowOverview(
      buildContext({ request: { workflow_id: "wf-1" }, user: adminUser }),
    );
    // within phase-1, the not-required qualify sinks below secret-action;
    // phase-2's kickoff still follows the whole phase-1 group.
    expect(cards(result).map((c) => c.type)).toEqual([
      "secret-action",
      "qualify",
      "kickoff",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meta
// ─────────────────────────────────────────────────────────────────────────────

describe("handler meta", () => {
  test("has schema and meta with both check flags false", () => {
    expect(GetWorkflowOverview.schema).toEqual({});
    expect(GetWorkflowOverview.meta).toEqual({
      checkRead: false,
      checkWrite: false,
    });
  });
});
