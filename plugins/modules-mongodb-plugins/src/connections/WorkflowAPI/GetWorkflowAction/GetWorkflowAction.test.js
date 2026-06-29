/**
 * Integration tests for GetWorkflowAction (Part 46 task 5).
 * Drives the real resolver against an in-memory Mongo.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import GetWorkflowAction from "./GetWorkflowAction.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

/**
 * Build a minimal workflowsConfig with one form-kind action and one check-kind
 * action, so both paths (with form_values, without form_values) are exercised.
 */
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
      action_groups: [{ id: "phase-1", title: "Phase 1", icon: "rocket" }],
      actions: [
        {
          type: "qualify",
          kind: "form",
          action_group: "phase-1",
          allow_not_required: false,
          required_after_close: true,
          access: { "test-app": { view: true, edit: ["account-manager"] } },
          form_meta: {
            form: [
              // Real-shaped keys: dotted state paths prefixed with 'form.'
              {
                component: "text_input",
                key: "form.company_name",
                required: true,
                title: "Company",
              },
              {
                component: "text_area",
                key: "form.notes",
                required: false,
                title: "Notes",
              },
              {
                // section: structural container — own key 'form.details_section' is
                // collected but maps to slice prop 'details_section' (which isn't
                // stored); nested leaf 'form.phone' maps to slice prop 'phone'.
                component: "section",
                key: "form.details_section",
                form: [
                  {
                    component: "text_input",
                    key: "form.phone",
                    required: false,
                    title: "Phone",
                  },
                ],
              },
              // file_upload: structural component that IS a persisted leaf field
              // (no nested form, own key must be collected).
              {
                component: "file_upload",
                key: "form.attachment",
                title: "Attachment",
              },
              // Nested path: 'form.address.street' → slice prop 'address'
              {
                component: "text_input",
                key: "form.address.street",
                title: "Street",
              },
            ],
            form_review: [
              {
                component: "text_area",
                key: "form.review_note",
                required: false,
                title: "Review Note",
              },
            ],
          },
        },
        {
          type: "check-step",
          kind: "check",
          action_group: "phase-1",
          allow_not_required: true,
          required_after_close: false,
          access: { "test-app": { view: true, edit: ["account-manager"] } },
        },
        {
          type: "keyed-form",
          kind: "form",
          action_group: "phase-1",
          allow_not_required: false,
          access: { "test-app": { view: true, edit: ["account-manager"] } },
          form_meta: {
            form: [
              {
                component: "text_input",
                key: "form.slot_name",
                required: true,
                title: "Slot Name",
              },
            ],
          },
        },
        {
          type: "secret-action",
          kind: "check",
          action_group: "phase-1",
          allow_not_required: false,
          access: { "test-app": { view: ["admin"], edit: ["admin"] } },
        },
        {
          type: "approve-action",
          kind: "form",
          action_group: "phase-1",
          allow_not_required: true,
          access: {
            "test-app": {
              view: true,
              edit: ["account-manager"],
              review: ["reviewer"],
            },
          },
          form_meta: {
            form: [
              {
                component: "text_input",
                key: "form.applicant",
                required: true,
                title: "Applicant",
              },
            ],
            form_review: [
              {
                component: "text_area",
                key: "form.decision",
                required: false,
                title: "Decision",
              },
            ],
            form_error: [
              {
                component: "text_area",
                key: "form.error_note",
                required: false,
                title: "Error Note",
              },
            ],
          },
        },
        {
          type: "list-action",
          kind: "form",
          action_group: "phase-1",
          allow_not_required: false,
          access: { "test-app": { view: true, edit: ["account-manager"] } },
          form_meta: {
            form: [
              // controlled_list: structural component whose own key is where the
              // array value lives — nested $-indexed leaf keys are not slice props.
              {
                component: "controlled_list",
                key: "form.items",
                form: [
                  {
                    component: "text_input",
                    key: "form.items.$.name",
                    title: "Name",
                  },
                ],
              },
            ],
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
      app_name,
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
  wfStage = "active",
  overrides = {},
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    entity: { connection_id: "leads-collection", id: entity_id, ref_key: "lead_ids" },
    display_order: 1,
    status: [{ stage: wfStage, event_id: "e0", created: changeStamp }],
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
    form_data,
    created: changeStamp,
    updated: changeStamp,
    ...overrides,
  });
}

async function seedAction({
  _id = "a1",
  type = "qualify",
  kind = "form",
  action_group = "phase-1",
  stage = "action-required",
  workflow_id = "wf-1",
  key = null,
  extra = {},
} = {}) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    workflow_type: "onboarding",
    type,
    kind,
    key,
    action_group,
    sort_order: 0,
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
    metadata: { some: "internal" },
    description: `${type} description`,
    entity: { connection_id: "leads-collection", id: "lead-1" },
    created: changeStamp,
    updated: changeStamp,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Null-return guards
// ─────────────────────────────────────────────────────────────────────────────

describe("null-return guards", () => {
  test("returns null when action doc is missing", async () => {
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "no-such-id" } }),
    );
    expect(result).toBeNull();
  });

  test("returns null when action.workflow_id is null (task-kind doc)", async () => {
    await mongo.db.collection("actions").insertOne({
      _id: "task-a1",
      workflow_id: null,
      type: "some-task",
      kind: "check",
      status: [
        { stage: "action-required", event_id: "e0", created: changeStamp },
      ],
      access: { "test-app": { view: true } },
      "test-app": { message: "task msg" },
      created: changeStamp,
      updated: changeStamp,
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "task-a1" } }),
    );
    expect(result).toBeNull();
  });

  test("returns null when allowed.view is false (access gate)", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-secret",
      type: "secret-action",
      kind: "check",
      extra: {
        access: { "test-app": { view: ["admin"], edit: ["admin"] } },
      },
    });
    // user has account-manager role, not admin → view denied
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-secret" } }),
    );
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Envelope shape and allowlist
// ─────────────────────────────────────────────────────────────────────────────

describe("envelope shape", () => {
  test("returns a single object (not an array)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(Array.isArray(result)).toBe(false);
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });

  test("envelope carries all allowlisted engine fields", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result._id).toBe("a1");
    expect(result.type).toBe("qualify");
    expect(result.workflow_type).toBe("onboarding");
    expect(result.workflow_id).toBe("wf-1");
    expect(result.kind).toBe("form");
    expect(result.key).toBeNull();
    expect(result.status).toBeDefined();
    expect(result.action_group).toBe("phase-1");
    expect(result.created).toBeDefined();
    expect(result.updated).toBeDefined();
    expect(result.entity).toEqual({
      connection_id: "leads-collection",
      id: "lead-1",
    });
  });

  test("entity_link resolves from wfConfig.entity (id from action.entity.id)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // id_query_key/page_id/title come from wfConfig.entity; the id comes from
    // the action doc's entity.id (seedAction stamps entity.id: 'lead-1').
    expect(result.entity_link).toEqual({
      pageId: "leads/lead-view",
      urlQuery: { lead_id: "lead-1" },
      title: "Lead",
    });
  });

  test("entity_link is null when the workflow config has no entity block", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const config = makeWorkflowsConfig();
    delete config[0].entity;
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" }, workflowsConfig: config }),
    );
    expect(result.entity_link).toBeNull();
  });

  test("entity_link is null when the workflow_type is not in workflowsConfig", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" }, workflowsConfig: [] }),
    );
    expect(result.entity_link).toBeNull();
  });

  test("envelope carries message and required_after_close", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.message).toBe("qualify message");
    expect(result.required_after_close).toBe(true);
  });

  test("envelope carries allowed and buttons", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.allowed).toEqual({
      view: true,
      edit: true,
      review: false,
      error: false,
    });
    expect(result.buttons).toBeDefined();
    expect(typeof result.buttons.submit).toBe("boolean");
    expect(typeof result.buttons.approve).toBe("boolean");
    expect(typeof result.buttons.not_required).toBe("boolean");
  });

  test("envelope carries workflow_closed", async () => {
    await seedWorkflow({ wfStage: "active" });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.workflow_closed).toBe(false);
  });

  test("has schema and meta with both check flags false", () => {
    expect(GetWorkflowAction.schema).toEqual({});
    expect(GetWorkflowAction.meta).toEqual({
      checkRead: false,
      checkWrite: false,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Excluded fields (allowlist enforcement)
// ─────────────────────────────────────────────────────────────────────────────

describe("excluded fields (allowlist enforcement)", () => {
  test("raw access is NOT in the envelope", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect("access" in result).toBe(false);
  });

  test("metadata is NOT in the envelope", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect("metadata" in result).toBe(false);
  });

  test("workflow_type IS in the envelope (drives the {workflow_type}-submit endpoint id)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.workflow_type).toBe("onboarding");
  });

  test("slug links (app-name slug) are NOT in the envelope", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect("test-app" in result).toBe(false);
    expect("links" in result).toBe(false);
  });

  test("tracker is NOT in the envelope", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a1",
      type: "qualify",
      extra: { tracker: { some: "data" } },
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect("tracker" in result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workflow_closed
// ─────────────────────────────────────────────────────────────────────────────

describe("workflow_closed", () => {
  test("workflow_closed is true when workflow stage is completed", async () => {
    await seedWorkflow({ wfStage: "completed" });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.workflow_closed).toBe(true);
  });

  test("workflow_closed is true when workflow stage is cancelled", async () => {
    await seedWorkflow({ wfStage: "cancelled" });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.workflow_closed).toBe(true);
  });

  test("workflow_closed is false when workflow stage is active", async () => {
    await seedWorkflow({ wfStage: "active" });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.workflow_closed).toBe(false);
  });

  test("raw workflow stage is NOT in the envelope", async () => {
    await seedWorkflow({ wfStage: "completed" });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // workflow_closed is present, but not the raw stage
    expect("workflow_stage" in result).toBe(false);
    expect(result.workflow_closed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Buttons resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("buttons resolution", () => {
  test("submit is true for action-required stage with edit access", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.buttons.submit).toBe(true);
  });

  test("approve is false without review access", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "in-review" });
    // account-manager has edit but not review
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.buttons.approve).toBe(false);
  });

  test("not_required is false when allow_not_required is false (qualify action)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // qualify has allow_not_required: false
    expect(result.buttons.not_required).toBe(false);
  });

  test("not_required is true when allow_not_required is true and stage allows it", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-check",
      type: "check-step",
      kind: "check",
      stage: "action-required",
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-check" } }),
    );
    // check-step has allow_not_required: true
    expect(result.buttons.not_required).toBe(true);
  });

  test("buttons are all false for done stage (no user-facing signal)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify", stage: "done" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // done stage: only submit (done is a source-stage for submit), request_changes (in-review only), etc.
    // done is in submit sources ['action-required', 'in-progress', 'changes-required', 'done']
    expect(result.buttons.submit).toBe(true);
    expect(result.buttons.approve).toBe(false);
    expect(result.buttons.progress).toBe(false);
    expect(result.buttons.not_required).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Form values — unkeyed action
// ─────────────────────────────────────────────────────────────────────────────

describe("form_values — unkeyed action", () => {
  test("form_values contains allowlisted keys from workflow.form_data[type]", async () => {
    await seedWorkflow({
      form_data: {
        qualify: {
          company_name: "Acme",
          notes: "Good lead",
          phone: "555-1234",
          // extra key not in form — should be excluded
          internal_flag: true,
        },
      },
    });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // company_name, notes from form; phone from form.section; review_note from form_review
    expect(result.form_values.company_name).toBe("Acme");
    expect(result.form_values.notes).toBe("Good lead");
    expect(result.form_values.phone).toBe("555-1234");
    // internal_flag is NOT in the form definition → excluded
    expect("internal_flag" in result.form_values).toBe(false);
  });

  test("form_values is empty object when no form_data for the type", async () => {
    await seedWorkflow({ form_data: {} });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.form_values).toEqual({});
  });

  test("form_values includes review_note from form_review keys", async () => {
    await seedWorkflow({
      form_data: {
        qualify: {
          company_name: "Acme",
          review_note: "Looks good",
        },
      },
    });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.form_values.review_note).toBe("Looks good");
  });

  test("form_values includes all three form channel keys (form + form_review + form_error)", async () => {
    await seedWorkflow({
      form_data: {
        "approve-action": {
          applicant: "Jane",
          decision: "approved",
          error_note: "retry",
        },
      },
    });
    await seedAction({
      _id: "a-approve",
      type: "approve-action",
      kind: "form",
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-approve" } }),
    );
    expect(result.form_values.applicant).toBe("Jane");
    expect(result.form_values.decision).toBe("approved");
    expect(result.form_values.error_note).toBe("retry");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Form values — keyed action
// ─────────────────────────────────────────────────────────────────────────────

describe("form_values — keyed action", () => {
  test("keyed action reads from form_data[type][key]", async () => {
    await seedWorkflow({
      form_data: {
        "keyed-form": {
          "slot-a": { slot_name: "Slot Alpha" },
          "slot-b": { slot_name: "Slot Beta" },
        },
      },
    });
    await seedAction({
      _id: "a-ka",
      type: "keyed-form",
      kind: "form",
      key: "slot-a",
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-ka" } }),
    );
    expect(result.form_values.slot_name).toBe("Slot Alpha");
    // slot-b data does not leak
    expect(result.form_values.slot_name).not.toBe("Slot Beta");
  });

  test("keyed action carries key in envelope", async () => {
    await seedWorkflow({ form_data: {} });
    await seedAction({
      _id: "a-ka",
      type: "keyed-form",
      kind: "form",
      key: "slot-a",
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-ka" } }),
    );
    expect(result.key).toBe("slot-a");
  });

  test("keyed action form_values is empty when key slice is missing", async () => {
    await seedWorkflow({
      form_data: {
        "keyed-form": {
          "other-slot": { slot_name: "Other" },
        },
      },
    });
    await seedAction({
      _id: "a-ka",
      type: "keyed-form",
      kind: "form",
      key: "slot-a",
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-ka" } }),
    );
    expect(result.form_values).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Form key mapping — form.-prefixed paths to slice props
// ─────────────────────────────────────────────────────────────────────────────

describe("form key mapping — form.-prefixed paths", () => {
  test("file_upload field key (form.attachment) survives: structural component own key is collected", async () => {
    await seedWorkflow({
      form_data: {
        qualify: {
          attachment: [{ name: "doc.pdf", uid: "f1" }],
        },
      },
    });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.form_values.attachment).toEqual([
      { name: "doc.pdf", uid: "f1" },
    ]);
  });

  test("nested path form.address.street maps to first-segment prop (address)", async () => {
    await seedWorkflow({
      form_data: {
        qualify: {
          address: { street: "123 Main St", city: "Springfield" },
        },
      },
    });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // form.address.street → first segment after 'form.' = 'address'
    expect(result.form_values.address).toEqual({
      street: "123 Main St",
      city: "Springfield",
    });
  });

  test("controlled_list own key (form.items) survives: array value at slice prop items", async () => {
    await seedWorkflow({
      form_data: {
        "list-action": {
          items: [{ name: "Widget A" }, { name: "Widget B" }],
        },
      },
    });
    await seedAction({ _id: "a-list", type: "list-action", kind: "form" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-list" } }),
    );
    expect(result.form_values.items).toEqual([
      { name: "Widget A" },
      { name: "Widget B" },
    ]);
  });

  test("keys not prefixed with form. are excluded from projection", async () => {
    // The slice stores only bare keys from state.form submissions.
    // Any slice property not covered by a form. key in the allowlist is dropped.
    await seedWorkflow({
      form_data: {
        qualify: {
          company_name: "Acme",
          internal_only: "secret",
        },
      },
    });
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.form_values.company_name).toBe("Acme");
    expect("internal_only" in result.form_values).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check-kind action (no form)
// ─────────────────────────────────────────────────────────────────────────────

describe("check-kind action (no form)", () => {
  test("form_values is empty object for check-kind action", async () => {
    await seedWorkflow({ form_data: { "check-step": { some: "data" } } });
    await seedAction({ _id: "a-check", type: "check-step", kind: "check" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-check" } }),
    );
    expect(result.form_values).toEqual({});
  });

  test("check-kind action has kind in envelope", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a-check", type: "check-step", kind: "check" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a-check" } }),
    );
    expect(result.kind).toBe("check");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// allowed resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("allowed resolution", () => {
  test("allowed reflects actual user roles (account-manager)", async () => {
    await seedWorkflow();
    await seedAction({ _id: "a1", type: "qualify" });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.allowed.view).toBe(true);
    expect(result.allowed.edit).toBe(true);
    expect(result.allowed.review).toBe(false);
    expect(result.allowed.error).toBe(false);
  });

  test("allowed.review is true when user has reviewer role and action grants it", async () => {
    await seedWorkflow();
    await seedAction({
      _id: "a-approve",
      type: "approve-action",
      kind: "form",
      extra: {
        // Access must include review gate for reviewer role
        access: {
          "test-app": {
            view: true,
            edit: ["account-manager"],
            review: ["reviewer"],
          },
        },
      },
    });
    const result = await GetWorkflowAction(
      buildContext({
        request: { action_id: "a-approve" },
        user: {
          id: "U2",
          roles: ["reviewer"],
        },
      }),
    );
    expect(result.allowed.review).toBe(true);
  });

  test("allowed is computed from the action doc access, not the config", async () => {
    await seedWorkflow();
    // Seed action with custom access override (admin-only)
    await seedAction({
      _id: "a1",
      type: "qualify",
      extra: {
        access: { "test-app": { view: true, edit: ["admin"] } },
      },
    });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    // account-manager does not have edit
    expect(result.allowed.view).toBe(true);
    expect(result.allowed.edit).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 24: assignee_docs lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("assignee_docs (Part 24)", () => {
  test("returns [{ _id, profile: { name, picture } }] for an action with assignees", async () => {
    await seedWorkflow();
    await seedAction({ extra: { assignees: ["user-a", "user-b"] } });
    await mongo.db.collection("user-contacts").insertMany([
      {
        _id: "user-a",
        profile: { name: "Ada", picture: "a.png", extra: "drop-me" },
      },
      { _id: "user-b", profile: { name: "Bo", picture: "b.png" } },
    ]);

    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    const byId = Object.fromEntries(
      result.assignee_docs.map((d) => [d._id, d]),
    );
    expect(byId["user-a"]).toEqual({
      _id: "user-a",
      profile: { name: "Ada", picture: "a.png" },
    });
    expect(byId["user-b"]).toEqual({
      _id: "user-b",
      profile: { name: "Bo", picture: "b.png" },
    });
    // The envelope must not leak non-allowlisted contact fields.
    expect(byId["user-a"].profile).not.toHaveProperty("extra");
  });

  test("returns [] when the action has no assignees", async () => {
    await seedWorkflow();
    await seedAction({ extra: { assignees: [] } });
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.assignee_docs).toEqual([]);
  });

  test("returns [] when assignees is absent", async () => {
    await seedWorkflow();
    await seedAction();
    const result = await GetWorkflowAction(
      buildContext({ request: { action_id: "a1" } }),
    );
    expect(result.assignee_docs).toEqual([]);
  });
});
