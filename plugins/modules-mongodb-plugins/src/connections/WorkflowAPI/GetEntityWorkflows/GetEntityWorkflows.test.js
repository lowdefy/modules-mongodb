/**
 * Integration tests for GetEntityWorkflows (Part 46 task 4).
 * Drives the real resolver against an in-memory Mongo.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import GetEntityWorkflows from "./GetEntityWorkflows.js";

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
        { id: "phase-1", title: "Phase 1", icon: "rocket", order: 0 },
        { id: "phase-2", title: "Phase 2", icon: "flag", order: 1 },
      ],
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
          type: "review-only",
          kind: "check",
          action_group: "phase-1",
          access: {
            "test-app": { view: false, edit: false, review: ["reviewer"] },
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
  workflow_type = "onboarding",
  entity_id = "lead-1",
  entity_collection = "leads-collection",
  overrides = {},
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type,
    entity: { connection_id: entity_collection, id: entity_id, ref_key: "lead_ids" },
    display_order: 1,
    status: [{ stage: "active", event_id: "e0", created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 0 },
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
    form_data: {},
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
// Basic return shape
// ─────────────────────────────────────────────────────────────────────────────

describe("GetEntityWorkflows return shape", () => {
  test("returns { workflows: [] } when no workflows match", async () => {
    const result = await GetEntityWorkflows(
      buildContext({
        request: {
          entity: { connection_id: "leads-collection", id: "no-such" },
        },
      }),
    );
    expect(result).toEqual({ workflows: [] });
  });

  test("returns workflows with title from config", async () => {
    await seedWorkflow();
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].title).toBe("Onboarding");
  });

  test("entity_link resolves from wfConfig.entity", async () => {
    await seedWorkflow();
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    expect(result.workflows[0].entity_link).toEqual({
      pageId: "leads/lead-view",
      urlQuery: { lead_id: "lead-1" },
      title: "Lead",
    });
  });

  test("entity_link is null when the workflow config has no entity block", async () => {
    await seedWorkflow();
    const config = makeWorkflowsConfig();
    delete config[0].entity;
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
        workflowsConfig: config,
      }),
    );
    expect(result.workflows[0].entity_link).toBeNull();
  });

  test("entity_link is null when the workflow_type is not in workflowsConfig", async () => {
    await seedWorkflow();
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
        workflowsConfig: [],
      }),
    );
    expect(result.workflows[0].entity_link).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action card shape: _id and kind are present
// ─────────────────────────────────────────────────────────────────────────────

describe("action cards include _id and kind", () => {
  test("each action card has _id, kind, type, status, allowed, message, link", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      stage: "action-required",
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const groups = result.workflows[0].groups;
    const phase1 = groups.find((g) => g.id === "phase-1");
    expect(phase1).toBeDefined();
    expect(phase1.actions).toHaveLength(1);
    const card = phase1.actions[0];
    expect(card._id).toBe("a1");
    expect(card.kind).toBe("check");
    expect(card.type).toBe("qualify");
    expect(card.status).toBe("action-required");
    expect(card.allowed).toEqual({
      view: true,
      edit: true,
      review: false,
      error: false,
    });
    expect(card.message).toBe("qualify message");
    expect(card.link).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Access drop
// ─────────────────────────────────────────────────────────────────────────────

describe("access drop", () => {
  test("actions with no accessible verb are dropped", async () => {
    await seedWorkflow();
    // review-only action: only reviewers can see it; user has account-manager role
    await seedAction({
      _id: "a-review",
      type: "review-only",
      action_group: "phase-1",
      extra: {
        access: {
          "test-app": { view: false, edit: false, review: ["reviewer"] },
        },
        "test-app": {
          links: { view: null, edit: null, review: null, error: null },
          message: "review msg",
        },
      },
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    // The action should be dropped since user doesn't have reviewer role.
    const allCards = result.workflows[0].groups.flatMap((g) => g.actions);
    expect(allCards.find((c) => c.type === "review-only")).toBeUndefined();
  });

  test("actions visible to reviewer role are dropped for account-manager user", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      stage: "action-required",
    });
    // Use reviewer user instead
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
        user: { id: "U2", profile: { name: "Reviewer" }, roles: ["reviewer"] },
      }),
    );
    // qualify has view: true (always visible) and edit: ['account-manager'] (not for reviewer)
    const allCards = result.workflows[0].groups.flatMap((g) => g.actions);
    const qualifyCard = allCards.find((c) => c.type === "qualify");
    expect(qualifyCard).toBeDefined();
    expect(qualifyCard.allowed.view).toBe(true);
    expect(qualifyCard.allowed.edit).toBe(false);
  });

  test("action whose all verbs are false (no access at all) is not included", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-none",
      type: "qualify",
      action_group: "phase-1",
      extra: {
        access: { "test-app": { view: ["admin"], edit: ["admin"] } },
        "test-app": {
          links: { view: null, edit: null, review: null, error: null },
          message: "",
        },
      },
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const allCards = result.workflows[0].groups.flatMap((g) => g.actions);
    expect(allCards).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Link collapse
// ─────────────────────────────────────────────────────────────────────────────

describe("link collapse", () => {
  test("edit link takes priority over view link", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      stage: "action-required",
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const card = result.workflows[0].groups.flatMap((g) => g.actions)[0];
    // account-manager has edit access and action-required stage has edit link
    expect(card.link.pageId).toContain("workflow-action-edit");
  });

  test("view link is used when edit link is null", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      stage: "done",
      extra: {
        "test-app": {
          links: {
            view: {
              pageId: "workflows/workflow-action-view",
              urlQuery: { action_id: "a1" },
            },
            edit: null,
            review: null,
            error: null,
          },
          message: "qualify message",
        },
      },
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const card = result.workflows[0].groups.flatMap((g) => g.actions)[0];
    expect(card.link.pageId).toContain("workflow-action-view");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group display config
// ─────────────────────────────────────────────────────────────────────────────

describe("group display config", () => {
  test("group entries carry title, icon from workflowsConfig", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "phase-1",
      stage: "action-required",
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const phase1 = result.workflows[0].groups.find((g) => g.id === "phase-1");
    expect(phase1.title).toBe("Phase 1");
    expect(phase1.icon).toBe("rocket");
  });

  test("group link uses entry_id/workflow-group-overview with workflow_id + group_id", async () => {
    await seedWorkflow({ _id: "wf-1" });
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const phase1 = result.workflows[0].groups.find((g) => g.id === "phase-1");
    expect(phase1.link).toEqual({
      pageId: "workflows/workflow-group-overview",
      urlQuery: { workflow_id: "wf-1", group_id: "phase-1" },
    });
  });

  test("group link is null when group_id is null", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: null }); // no group
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const nullGroup = result.workflows[0].groups.find((g) => g.id === null);
    expect(nullGroup.link).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort: declaration order within a group, not-required sinks last
// ─────────────────────────────────────────────────────────────────────────────

describe("within-group action ordering", () => {
  // config actions: [qualify (phase-1, decl 0), kickoff (phase-2, decl 1), review-only (phase-1, decl 2)]
  test("orders by action declaration index within a group", async () => {
    await seedWorkflow();
    // both placed in phase-1; seed in reverse declaration order.
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-1",
    });
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const phase1 = result.workflows[0].groups.find((g) => g.id === "phase-1");
    // qualify (decl 0) before kickoff (decl 1), regardless of seed/insert order.
    expect(phase1.actions.map((a) => a.type)).toEqual(["qualify", "kickoff"]);
  });

  test("not-required sinks below action-required even when it declares earlier", async () => {
    await seedWorkflow();
    // qualify declares first (decl 0) but is not-required → must sink below kickoff (decl 1).
    await seedAction({
      _id: "a-qualify",
      type: "qualify",
      action_group: "phase-1",
      stage: "not-required",
    });
    await seedAction({
      _id: "a-kickoff",
      type: "kickoff",
      action_group: "phase-1",
      stage: "action-required",
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const phase1 = result.workflows[0].groups.find((g) => g.id === "phase-1");
    // sink overrides declaration order within the group.
    expect(phase1.actions.map((a) => a.type)).toEqual(["kickoff", "qualify"]);
    expect(phase1.actions[0].status).toBe("action-required");
    expect(phase1.actions[1].status).toBe("not-required");
  });

  test("keyed siblings (same type/group) order by key", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "q-beta",
      type: "qualify",
      action_group: "phase-1",
      key: "beta",
    });
    await seedAction({
      _id: "q-alpha",
      type: "qualify",
      action_group: "phase-1",
      key: "alpha",
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const phase1 = result.workflows[0].groups.find((g) => g.id === "phase-1");
    expect(phase1.actions.map((a) => a._id)).toEqual(["q-alpha", "q-beta"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group id field (Issue 2: spec uses 'id', not 'group_id')
// ─────────────────────────────────────────────────────────────────────────────

describe("group id field", () => {
  test("each group has id field (not group_id)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const groups = result.workflows[0].groups;
    expect(groups[0].id).toBe("phase-1");
    expect("group_id" in groups[0]).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unseen-group order (Issue 4: undeclared groups sort AFTER declared ones)
// ─────────────────────────────────────────────────────────────────────────────

describe("unseen group order", () => {
  test("undeclared groups sort after all declared config groups", async () => {
    await seedWorkflow();
    // phase-1 and phase-2 are declared in config (indices 0 and 1).
    await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
    // 'extra-group' is not in the config.
    await seedAction({
      _id: "a2",
      type: "kickoff",
      action_group: "extra-group",
      extra: {
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
      },
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const groups = result.workflows[0].groups;
    const phase1 = groups.find((g) => g.id === "phase-1");
    const extraGroup = groups.find((g) => g.id === "extra-group");
    expect(phase1).toBeDefined();
    expect(extraGroup).toBeDefined();
    // extra-group must have a higher order than any declared config group (config has 2 entries: indices 0, 1)
    expect(extraGroup.order).toBeGreaterThanOrEqual(2);
    expect(phase1.order).toBe(0);
  });

  test("multiple undeclared groups sort stably after declared ones", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      action_group: "undeclared-a",
    });
    await seedAction({
      _id: "a2",
      type: "kickoff",
      action_group: "undeclared-b",
      extra: {
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
      },
    });
    const result = await GetEntityWorkflows(
      buildContext({
        request: { entity: { connection_id: "leads-collection", id: "lead-1" } },
      }),
    );
    const groups = result.workflows[0].groups;
    // Both undeclared; config has 2 declared groups, so order should be >= 2 for all.
    for (const g of groups) {
      expect(g.order).toBeGreaterThanOrEqual(2);
    }
    // The two undeclared groups must have distinct orders.
    const orders = groups.map((g) => g.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meta
// ─────────────────────────────────────────────────────────────────────────────

describe("handler meta", () => {
  test("has schema and meta with both check flags false", () => {
    expect(GetEntityWorkflows.schema).toEqual({});
    expect(GetEntityWorkflows.meta).toEqual({
      checkRead: false,
      checkWrite: false,
    });
  });
});
