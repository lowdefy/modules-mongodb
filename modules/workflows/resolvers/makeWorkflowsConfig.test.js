import makeWorkflowsConfig from "./makeWorkflowsConfig.js";

const validWorkflow = {
  type: "onboarding",
  entity: {
    connection_id: "leads-collection",
    ref_key: "lead_ids",
    page_id: "lead-view",
    title: "Lead",
  },
  display_order: 1,
  starting_actions: [{ type: "do-it", status: "action-required" }],
  actions: [{ type: "do-it", kind: "check" }],
};

test("makeWorkflowsConfig: entity block is carried wholesale (as authored, nothing lifted to flat aliases) and no entity_type appears", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.entity).toEqual({
    connection_id: "leads-collection",
    ref_key: "lead_ids",
    page_id: "lead-view",
    title: "Lead",
    id_query_key: "_id",
  });
  // Nothing is lifted to flat aliases.
  expect("entity_collection" in out).toBe(false);
  expect("entity_ref_key" in out).toBe(false);
  expect("entity_type" in out).toBe(false);
});

test("makeWorkflowsConfig: id_query_key defaults to _id when omitted", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.entity.id_query_key).toBe("_id");
});

test("makeWorkflowsConfig: an explicit id_query_key flows through verbatim", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, id_query_key: "lead_id" },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.entity.id_query_key).toBe("lead_id");
});

test("makeWorkflowsConfig: an unknown entity field survives the wholesale carry", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, name_field: "company_name" },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.entity.name_field).toBe("company_name");
});

test("makeWorkflowsConfig: rejects legacy entity_type with migration message", () => {
  const workflow = {
    ...validWorkflow,
    entity_type: "lead",
  };

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy "entity_type" field is no longer supported/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects a workflow missing the entity block", () => {
  const workflow = { ...validWorkflow };
  delete workflow.entity;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity" block/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects a workflow whose entity is not an object", () => {
  const workflow = { ...validWorkflow, entity: "leads-collection" };

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity" block/,
  );
});

test("makeWorkflowsConfig: rejects a workflow missing entity.connection_id", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity },
  };
  delete workflow.entity.connection_id;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity\.connection_id"/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects an empty-string entity.connection_id", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, connection_id: "" },
  };

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity\.connection_id"/,
  );
});

test("makeWorkflowsConfig: rejects a workflow missing entity.ref_key", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity },
  };
  delete workflow.entity.ref_key;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity\.ref_key" — the event-references key/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects a workflow missing entity.page_id", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity },
  };
  delete workflow.entity.page_id;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity\.page_id"/,
  );
});

test("makeWorkflowsConfig: rejects a workflow missing entity.title", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity },
  };
  delete workflow.entity.title;

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /missing required "entity\.title"/,
  );
});

test("makeWorkflowsConfig: rejects a non-string entity.id_query_key when present", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, id_query_key: 42 },
  };

  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /entity\.id_query_key must be a non-empty string when present/,
  );
});

// --- entity.name_field (Part 56 D10) ---------------------------------------

test("makeWorkflowsConfig: entity.name_field non-empty string validates and survives onto the materialized entity block", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, name_field: "company.name" },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.entity.name_field).toBe("company.name");
});

test("makeWorkflowsConfig: omitted entity.name_field validates (no error)", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [validWorkflow] }),
  ).not.toThrow();
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect("name_field" in out.entity).toBe(false);
});

test("makeWorkflowsConfig: rejects a non-string entity.name_field", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, name_field: 42 },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /entity\.name_field must be a non-empty string when present/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects an empty-string entity.name_field", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, name_field: "" },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /entity\.name_field must be a non-empty string when present/,
  );
});

// --- entity.list_page_id / entity.list_title (breadcrumb list link) ---------

test("makeWorkflowsConfig: entity.list_page_id + list_title validate and survive onto the materialized entity block", () => {
  const workflow = {
    ...validWorkflow,
    entity: {
      ...validWorkflow.entity,
      list_page_id: "lead-list",
      list_title: "Leads",
    },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.entity.list_page_id).toBe("lead-list");
  expect(out.entity.list_title).toBe("Leads");
});

test("makeWorkflowsConfig: omitting both list_page_id and list_title validates (no list crumb)", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect("list_page_id" in out.entity).toBe(false);
  expect("list_title" in out.entity).toBe(false);
});

test("makeWorkflowsConfig: rejects list_page_id without list_title", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, list_page_id: "lead-list" },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /entity\.list_page_id and entity\.list_title must be set together/,
  );
});

test("makeWorkflowsConfig: rejects list_title without list_page_id", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, list_title: "Leads" },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /entity\.list_page_id and entity\.list_title must be set together/,
  );
});

test("makeWorkflowsConfig: rejects an empty-string entity.list_page_id", () => {
  const workflow = {
    ...validWorkflow,
    entity: { ...validWorkflow.entity, list_page_id: "", list_title: "Leads" },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /entity\.list_page_id must be a non-empty string when present/,
  );
});

// --- entity_view (Part 56 D2) -----------------------------------------------

test("makeWorkflowsConfig: valid entity_view with an object slot validates and is absent from the materialized output", () => {
  const workflow = {
    ...validWorkflow,
    entity_view: { slot: { _ref: "components/details.yaml" } },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect("entity_view" in out).toBe(false);
});

test("makeWorkflowsConfig: valid entity_view with an array slot validates (block array)", () => {
  const workflow = {
    ...validWorkflow,
    entity_view: { slot: [{ _ref: "components/details.yaml" }] },
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: omitted entity_view validates (no error)", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [validWorkflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: rejects entity_view missing slot", () => {
  const workflow = { ...validWorkflow, entity_view: {} };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /"entity_view" must be an object with a "slot" block ref/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: rejects entity_view whose slot is not a block ref (string)", () => {
  const workflow = {
    ...validWorkflow,
    entity_view: { slot: "components/details.yaml" },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /"entity_view" must be an object with a "slot" block ref/,
  );
});

test("makeWorkflowsConfig: rejects entity_view that is not an object (string)", () => {
  const workflow = { ...validWorkflow, entity_view: "details" };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /"entity_view" must be an object with a "slot" block ref/,
  );
});

test("makeWorkflowsConfig: rejects entity_view that is an array", () => {
  const workflow = {
    ...validWorkflow,
    entity_view: [{ slot: { _ref: "x" } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /"entity_view" must be an object with a "slot" block ref/,
  );
});

test("makeWorkflowsConfig: blocked_by referencing a declared action type passes", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      { type: "send-quote", kind: "check", blocked_by: ["qualify"] },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: blocked_by referencing a declared group id passes", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check", action_group: "phase-1" },
      { type: "send-quote", kind: "check", blocked_by: ["phase-1"] },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: blocked_by with mixed group id + action type passes", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    action_groups: [{ id: "phase-1" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check", action_group: "phase-1" },
      {
        type: "send-quote",
        kind: "check",
        blocked_by: ["phase-1", "qualify"],
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: no blocked_by field on any action passes", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      { type: "send-quote", kind: "check" },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: blocked_by entry that resolves to nothing throws with action type, entry, and workflow type", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      { type: "send-quote", kind: "check", blocked_by: ["nonexistent-entry"] },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /send-quote/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /nonexistent-entry/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /onboarding/,
  );
});

test("makeWorkflowsConfig: blocked_by walk doesn't short-circuit on the first valid entry", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check" },
      {
        type: "send-quote",
        kind: "check",
        blocked_by: ["qualify", "nonexistent-entry"],
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /nonexistent-entry/,
  );
});

test("makeWorkflowsConfig: inline hook routine validates cleanly (signal-keyed)", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: {
          submit: {
            pre: { routine: [{ id: "x", type: "MongoDBFindOne" }] },
          },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy string hook fails with migration message", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { submit: { pre: "some-api-id" } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy shape/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /Convert to an inline routine object/,
  );
});

test("makeWorkflowsConfig: hook value missing routine: array fails", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { submit: { pre: { not_routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /must be an object with a routine: array/,
  );
});

test("makeWorkflowsConfig: unknown hook signal fails (legacy submit_edit rejected)", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { submit_edit: { pre: { routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
});

test("makeWorkflowsConfig: completely unknown hook key fails", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        hooks: { surprise: { pre: { routine: [] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
});

// --- validateEvent: event: key validation -----------------------------------

test("makeWorkflowsConfig: signal-keyed event block validates cleanly", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          submit: { type: "qualified", display: "Lead qualified" },
          approve: { type: "approved", display: "Lead approved" },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy event key submit_edit hard-errors", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          submit_edit: { type: "qualified", display: "Lead qualified" },
        },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /submit_edit/,
  );
});

test("makeWorkflowsConfig: unknown event key hard-errors", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: { surprise: { type: "something" } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /is not a known signal/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /surprise/,
  );
});

test("makeWorkflowsConfig: authored event display.{app}.description hard-errors (comment-only, D4)", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          submit: {
            display: { demo: { description: "should not be authored" } },
          },
        },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /has a "description"/,
  );
});

test("makeWorkflowsConfig: authored event display.{app}.title-only passes (D7)", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          submit: { display: { demo: { title: "Lead qualified" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: inline on_complete routine validates cleanly", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: {
          routine: [{ id: "notify", type: "CallApi" }],
        },
      },
    ],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "check", action_group: "phase-1" }],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [workflow] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: legacy string on_complete fails with migration message", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    action_groups: [
      {
        id: "phase-1",
        on_complete: "workflow_config/onboarding/api/phase-1-complete.yaml",
      },
    ],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "check", action_group: "phase-1" }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /on_complete is a string/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /legacy shape/,
  );
});

// Stub child workflow used in tracker tests so that tracker.child_workflow_type
// "device-installation" resolves to a declared type in the workflows array.
const deviceInstallationStub = {
  type: "device-installation",
  entity: {
    connection_id: "installations-collection",
    ref_key: "installation_ids",
    page_id: "installation-view",
    title: "Installation",
  },
};

// --- validateActionAccess (Part 34 D4) -------------------------------------

function workflowWithAccess(access) {
  return {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "form", form: [], access }],
  };
}

test("validateActionAccess: accepts the verb→gate map (true and array gates)", () => {
  const wf = workflowWithAccess({
    demo: {
      view: true,
      edit: ["account-manager"],
      review: ["account-manager"],
    },
    support: { view: ["support-rep"] },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
});

test("validateActionAccess: rejects the empty-list gate []", () => {
  const wf = workflowWithAccess({ demo: { view: true, edit: [] } });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/empty list \[\] — invalid/);
});

test("validateActionAccess: rejects the shorthand list form access.{app}: [verbs]", () => {
  const wf = workflowWithAccess({ demo: ["view", "edit"] });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/removed shorthand list form/);
});

test("validateActionAccess: rejects the removed action-wide access.roles", () => {
  const wf = workflowWithAccess({ demo: { view: true }, roles: ["admin"] });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/access\.roles .* is removed/);
});

test("validateActionAccess: rejects notification_roles nested under access", () => {
  const wf = workflowWithAccess({
    demo: { view: true },
    notification_roles: ["admin"],
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/notification_roles lives at the action root/);
});

test("validateActionAccess: rejects an unknown verb key", () => {
  const wf = workflowWithAccess({ demo: { view: true, delete: true } });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/unknown verb key "delete"/);
});

test("validateActionAccess: rejects a gate that is neither true nor a role array", () => {
  const wf = workflowWithAccess({ demo: { view: "admin" } });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/gate must be true or a non-empty array of role strings/);
});

test("validateActionAccess: notification_roles at the action root is valid", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        access: { demo: { view: true } },
        notification_roles: ["admin"],
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
});

test("validateActionAccess: lint-warns (does not throw) on edit/review/error without view", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wf = workflowWithAccess({ demo: { edit: ["account-manager"] } });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
  expect(warn).toHaveBeenCalledWith(
    expect.stringMatching(/declares edit\/review\/error without view/),
  );
  warn.mockRestore();
});

// --- validateButtonsExtra (Part 36) ----------------------------------------

// A valid author extra entry is a full Lowdefy Button block (type: Button,
// properties: {...}) carrying its own events.onClick — the template concats it
// verbatim into the floating-actions bar alongside the signal buttons.
const extraHelpButton = {
  id: "open_help",
  type: "Button",
  properties: { title: "Help", type: "link" },
  events: {
    onClick: [
      {
        id: "nav_help",
        type: "Link",
        params: { url: "https://docs.lowdefy.com", newTab: true },
      },
    ],
  },
};

function formWorkflowWithPages(pages) {
  return {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        access: { demo: { view: true, edit: true, review: true, error: true } },
        pages,
      },
    ],
  };
}

const runForm = (pages) =>
  makeWorkflowsConfig(null, { workflows: [formWorkflowWithPages(pages)] });

test("validateButtonsExtra: (a) valid extra array on pages.edit passes", () => {
  expect(() =>
    runForm({ edit: { buttons: { extra: [extraHelpButton] } } }),
  ).not.toThrow();
});

test("validateButtonsExtra: (g) valid extra array on pages.view of a form action passes", () => {
  expect(() =>
    runForm({ view: { buttons: { extra: [extraHelpButton] } } }),
  ).not.toThrow();
});

test("validateButtonsExtra: (b) non-array extra rejected", () => {
  expect(() =>
    runForm({ edit: { buttons: { extra: { id: "open_help" } } } }),
  ).toThrow(/buttons\.extra must be an array/);
});

test("validateButtonsExtra: (c) entry missing id rejected", () => {
  expect(() =>
    runForm({
      edit: { buttons: { extra: [{ type: "Button", events: { onClick: [] } }] } },
    }),
  ).toThrow(/must have a string "id"/);
});

test("validateButtonsExtra: (d) entry missing events.onClick rejected", () => {
  expect(() =>
    runForm({ edit: { buttons: { extra: [{ id: "open_help", type: "Button" }] } } }),
  ).toThrow(/must have an events\.onClick action array/);
});

test("validateButtonsExtra: (e) reserved id button_submit on edit rejected", () => {
  expect(() =>
    runForm({
      edit: { buttons: { extra: [{ ...extraHelpButton, id: "button_submit" }] } },
    }),
  ).toThrow(/reserved button id "button_submit"/);
});

test("validateButtonsExtra: (e2) reserved id button_progress on edit rejected", () => {
  expect(() =>
    runForm({
      edit: { buttons: { extra: [{ ...extraHelpButton, id: "button_progress" }] } },
    }),
  ).toThrow(/reserved button id "button_progress"/);
});

test("validateButtonsExtra: (f) reserved id button_resolve_error on error rejected", () => {
  expect(() =>
    runForm({
      error: {
        buttons: { extra: [{ ...extraHelpButton, id: "button_resolve_error" }] },
      },
    }),
  ).toThrow(/reserved button id "button_resolve_error"/);
});

test("validateButtonsExtra: (f2) reserved nav id button_edit on review rejected", () => {
  expect(() =>
    runForm({
      review: { buttons: { extra: [{ ...extraHelpButton, id: "button_edit" }] } },
    }),
  ).toThrow(/reserved button id "button_edit"/);
});

test("validateButtonsExtra: (f3) reserved id button_approve rejected on edit (global, not per-page)", () => {
  // The edit bar ships no approve button, yet the id is reserved everywhere.
  expect(() =>
    runForm({
      edit: { buttons: { extra: [{ ...extraHelpButton, id: "button_approve" }] } },
    }),
  ).toThrow(/reserved button id "button_approve"/);
});

test("validateButtonsExtra: (h) buttons.extra on a check (non-form) action rejected", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        access: { demo: { view: true } },
        pages: { edit: { buttons: { extra: [extraHelpButton] } } },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /only available on form actions/,
  );
});

test("validateButtonsExtra: (h2) buttons.extra on a tracker (non-form) action rejected", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        pages: { edit: { buttons: { extra: [extraHelpButton] } } },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/only available on form actions/);
});

// --- validateStatusMapCells (Part 30 D9) -----------------------------------

function workflowWithStatusMap(status_map) {
  return {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        access: { demo: { view: true } },
        status_map,
      },
    ],
  };
}

test("validateStatusMapCells: accepts a message-only cell and a status_title", () => {
  const wf = workflowWithStatusMap({
    "action-required": {
      demo: { message: "Qualify the lead." },
      status_title: "Qualifying",
    },
    done: { status_title: null },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: status_map is validated but NOT carried on the returned blob (Part 48)", () => {
  // status_map now arrives per-request via render_config and is spliced at load
  // time (loadWorkflowState seam), so the connection blob must not carry it.
  const wf = workflowWithStatusMap({
    "action-required": {
      demo: { message: "Qualify the lead." },
      status_title: "Qualifying",
    },
    done: { status_title: null },
  });
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect("status_map" in out.actions[0]).toBe(false);
});

test("validateStatusMapCells: rejects link: on a built-in kind", () => {
  const wf = workflowWithStatusMap({
    done: { demo: { message: "Done.", link: { pageId: "x" } } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/link is engine-managed for kind: form/);
});

test("validateStatusMapCells: rejects an invalid stage key", () => {
  const wf = workflowWithStatusMap({
    "not-a-stage": { demo: { message: "x" } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/is not a member of action_statuses/);
});

test("validateStatusMapCells: rejects a non-string/null status_title", () => {
  const wf = workflowWithStatusMap({ done: { status_title: 42 } });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/status_title must be a string or null/);
});

// --- validateTrackerStartLink (Part 44) ------------------------------------

function workflowWithTracker(tracker) {
  return {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [{ type: "install-device", kind: "tracker", tracker }],
  };
}

test("validateTrackerStartLink: full shape (pageId + urlQuery with sentinels and static string) passes and flows through", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: {
      pageId: "ticket-new",
      urlQuery: {
        action_id: true,
        entity_id: true,
        source: "onboarding",
      },
    },
  });
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].tracker.start_link).toEqual({
    pageId: "ticket-new",
    urlQuery: { action_id: true, entity_id: true, source: "onboarding" },
  });
});

test("validateTrackerStartLink: minimal shape (pageId only, no urlQuery) passes", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new" },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
});

test("validateTrackerStartLink: tracker block with no start_link passes (regression guard)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
});

test("validateTrackerStartLink: rejects missing pageId", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { urlQuery: { source: "onboarding" } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.pageId must be a non-empty string/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/onboarding/);
});

test("validateTrackerStartLink: rejects non-string pageId", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: 42 },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.pageId must be a non-empty string/);
});

test("validateTrackerStartLink: rejects empty-string pageId", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "" },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.pageId must be a non-empty string/);
});

test("validateTrackerStartLink: rejects unknown key — specifically title:", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", title: "Create ticket" },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link has unknown key "title"/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/only pageId and urlQuery are allowed/);
});

test("validateTrackerStartLink: rejects start_link that is a string", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: "ticket-new",
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link must be a plain object/);
});

test("validateTrackerStartLink: rejects start_link that is an array", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: [{ pageId: "ticket-new" }],
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link must be a plain object/);
});

test("validateTrackerStartLink: rejects urlQuery that is not an object", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: "not-an-object" },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.urlQuery must be a plain object/);
});

test("validateTrackerStartLink: rejects urlQuery with true on a non-sentinel key (source: true)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { source: true } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.urlQuery\.source must be a string/);
});

test("validateTrackerStartLink: rejects urlQuery with static string on reserved key action_id", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { action_id: "some-id" } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(
    /tracker\.start_link\.urlQuery\.action_id is a reserved sentinel key/,
  );
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/value must be exactly true/);
});

test("validateTrackerStartLink: rejects urlQuery with static string on reserved key entity_id", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { entity_id: "foo" } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(
    /tracker\.start_link\.urlQuery\.entity_id is a reserved sentinel key/,
  );
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/value must be exactly true/);
});

test("validateTrackerStartLink: rejects urlQuery with non-string static — number (count: 3)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { count: 3 } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.urlQuery\.count must be a string/);
});

test("validateTrackerStartLink: rejects urlQuery with non-string static — boolean false (flag: false)", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
    start_link: { pageId: "ticket-new", urlQuery: { flag: false } },
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/tracker\.start_link\.urlQuery\.flag must be a string/);
});

// --- title materialization (workflow / action / group) ----------------------

test("makeWorkflowsConfig: explicit workflow title flows through verbatim", () => {
  const workflow = { ...validWorkflow, title: "Custom Onboarding" };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.title).toBe("Custom Onboarding");
});

test("makeWorkflowsConfig: workflow without title derives it from type", () => {
  const workflow = { ...validWorkflow, type: "company-setup" };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.title).toBe("Company Setup");
});

test("makeWorkflowsConfig: action without title derives it from type", () => {
  const workflow = {
    ...validWorkflow,
    starting_actions: [{ type: "upload-po", status: "action-required" }],
    actions: [{ type: "upload-po", kind: "check" }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.actions[0].title).toBe("Upload PO");
});

test("makeWorkflowsConfig: explicit action title wins over the derived default", () => {
  const workflow = {
    ...validWorkflow,
    starting_actions: [{ type: "upload-po", status: "action-required" }],
    actions: [{ type: "upload-po", kind: "check", title: "Send the PO" }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.actions[0].title).toBe("Send the PO");
});

test("makeWorkflowsConfig: group title — explicit wins, else derived from id (2-tier)", () => {
  const workflow = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    action_groups: [
      { id: "kickoff-call", title: "Kickoff" },
      { id: "billing-details" },
    ],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [{ type: "qualify", kind: "check", action_group: "kickoff-call" }],
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });
  expect(out.action_groups[0].title).toBe("Kickoff");
  expect(out.action_groups[1].title).toBe("Billing Details");
});

test("makeWorkflowsConfig: title_acronyms extends the humanizer for all defaults", () => {
  const workflow = {
    type: "manage-bom",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    action_groups: [{ id: "bom-review" }],
    starting_actions: [{ type: "upload-bom", status: "action-required" }],
    actions: [
      { type: "upload-bom", kind: "check", action_group: "bom-review" },
    ],
  };
  const [out] = makeWorkflowsConfig(null, {
    workflows: [workflow],
    title_acronyms: ["BOM"],
  });
  expect(out.title).toBe("Manage BOM");
  expect(out.actions[0].title).toBe("Upload BOM");
  expect(out.action_groups[0].title).toBe("BOM Review");
});

test("makeWorkflowsConfig: rejects a non-string workflow title", () => {
  const workflow = { ...validWorkflow, title: 42 };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /workflow title must be a string when present/,
  );
});

test("makeWorkflowsConfig: rejects a non-string action title", () => {
  const workflow = {
    ...validWorkflow,
    actions: [{ type: "do-it", kind: "check", title: { x: 1 } }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /action "do-it" title must be a string when present/,
  );
});

test("makeWorkflowsConfig: rejects a non-string group title", () => {
  const workflow = {
    ...validWorkflow,
    action_groups: [{ id: "phase-1", title: 7 }],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [workflow] })).toThrow(
    /action_groups "phase-1" title must be a string when present/,
  );
});

// --- form_meta (form-kind actions) ------------------------------------------

const qualifyAction = {
  type: "qualify",
  kind: "form",
  form: [
    {
      component: "text_input",
      key: "contact_name",
      required: true,
      title: "Contact name",
    },
    { component: "text_area", key: "notes", title: "Notes" },
  ],
};

const sendQuoteAction = {
  type: "send-quote",
  kind: "form",
  form: [{ component: "number", key: "quote_total", required: true }],
  form_review: [{ component: "text_area", key: "approve_notes" }],
};

const proofOfInstallAction = {
  type: "proof-of-installation",
  kind: "form",
  form: [
    {
      component: "controlled_list",
      key: "form.devices",
      required: true,
      title: "Devices",
      form: [
        {
          component: "label_value",
          key: "form.devices.$._id",
          title: "Device Number",
        },
        {
          component: "date_range_selector",
          key: "form.devices.$.warranty",
          required: true,
          title: "Warranty",
        },
      ],
    },
  ],
};

function workflowWithFormActions(...actions) {
  return {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: actions[0].type, status: "action-required" }],
    actions,
  };
}

test("makeWorkflowsConfig: form-kind action carries form_meta matching makeActionFormConfigs shape", () => {
  const wf = workflowWithFormActions(qualifyAction);
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].form_meta).toEqual({
    form: [
      {
        component: "text_input",
        key: "contact_name",
        required: true,
        title: "Contact name",
      },
      { component: "text_area", key: "notes", required: false, title: "Notes" },
    ],
  });
});

test("makeWorkflowsConfig: form_meta includes form_review when present", () => {
  const wf = workflowWithFormActions(sendQuoteAction);
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].form_meta).toEqual({
    form: [{ component: "number", key: "quote_total", required: true }],
    form_review: [
      { component: "text_area", key: "approve_notes", required: false },
    ],
  });
  expect("form_error" in out.actions[0].form_meta).toBe(false);
});

test("makeWorkflowsConfig: form_meta includes form_error when present", () => {
  const withError = {
    type: "qualify-with-error",
    kind: "form",
    form: [{ component: "text_input", key: "name", required: true }],
    form_error: [{ component: "text_area", key: "recovery_notes" }],
  };
  const wf = workflowWithFormActions(withError);
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].form_meta.form_error).toEqual([
    { component: "text_area", key: "recovery_notes", required: false },
  ]);
});

test("makeWorkflowsConfig: form_meta recurses into controlled_list structural component", () => {
  const wf = workflowWithFormActions(proofOfInstallAction);
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].form_meta).toEqual({
    form: [
      {
        component: "controlled_list",
        key: "form.devices",
        required: true,
        title: "Devices",
        form: [
          {
            component: "label_value",
            key: "form.devices.$._id",
            required: false,
            title: "Device Number",
          },
          {
            component: "date_range_selector",
            key: "form.devices.$.warranty",
            required: true,
            title: "Warranty",
          },
        ],
      },
    ],
  });
});

test("makeWorkflowsConfig: check-kind action has no form_meta", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect("form_meta" in out.actions[0]).toBe(false);
});

test("makeWorkflowsConfig: tracker-kind action has no form_meta", () => {
  const wf = workflowWithTracker({
    child_workflow_type: "device-installation",
  });
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect("form_meta" in out.actions[0]).toBe(false);
});

// --- allow_not_required -----------------------------------------------------

test("makeWorkflowsConfig: allow_not_required defaults to false when absent (check-kind)", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.actions[0].allow_not_required).toBe(false);
});

test("makeWorkflowsConfig: allow_not_required: true flows through on a form-kind action", () => {
  const wf = workflowWithFormActions({
    ...qualifyAction,
    allow_not_required: true,
  });
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].allow_not_required).toBe(true);
});

test("makeWorkflowsConfig: allow_not_required: false flows through explicitly", () => {
  const wf = workflowWithFormActions({
    ...qualifyAction,
    allow_not_required: false,
  });
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].allow_not_required).toBe(false);
});

test("makeWorkflowsConfig: allow_not_required: true flows through on a tracker-kind action", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        allow_not_required: true,
      },
    ],
  };
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].allow_not_required).toBe(true);
});

test("makeWorkflowsConfig: non-boolean allow_not_required hard-errors with makeWorkflowsConfig: message", () => {
  const wf = workflowWithFormActions({
    ...qualifyAction,
    allow_not_required: "yes",
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/makeWorkflowsConfig:/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/allow_not_required must be a boolean/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/onboarding/);
});

test("makeWorkflowsConfig: non-boolean allow_not_required (number) hard-errors", () => {
  const wf = workflowWithFormActions({
    ...qualifyAction,
    allow_not_required: 1,
  });
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/allow_not_required must be a boolean/);
});

test("makeWorkflowsConfig: allow_not_required works on check-kind action too", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    display_order: 1,
    starting_actions: [{ type: "do-it", status: "action-required" }],
    actions: [{ type: "do-it", kind: "check", allow_not_required: true }],
  };
  const [out] = makeWorkflowsConfig(null, {
    workflows: [wf, deviceInstallationStub],
  });
  expect(out.actions[0].allow_not_required).toBe(true);
});

// --- validateTrackerChildWorkflowType + validateTrackerEdges (Part 48 D6) ---

function trackerWorkflow(overrides = {}) {
  return {
    type: "parent",
    entity: {
      connection_id: "parents-collection",
      ref_key: "parent_ids",
      page_id: "parent-view",
      title: "Parent",
    },
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [
      {
        type: "track-it",
        kind: "tracker",
        tracker: { child_workflow_type: "child" },
        ...overrides,
      },
    ],
  };
}

const childStub = {
  type: "child",
  entity: {
    connection_id: "children-collection",
    ref_key: "child_ids",
    page_id: "children-view",
    title: "Children",
  },
};

test("validateTrackerChildWorkflowType: valid child_workflow_type resolving to a declared type passes", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [trackerWorkflow(), childStub] }),
  ).not.toThrow();
});

test("validateTrackerChildWorkflowType: missing child_workflow_type hard-errors", () => {
  const wf = {
    type: "parent",
    entity: {
      connection_id: "parents-collection",
      ref_key: "parent_ids",
      page_id: "parent-view",
      title: "Parent",
    },
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [{ type: "track-it", kind: "tracker", tracker: {} }],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/tracker\.child_workflow_type must be a non-empty string/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/parent/);
});

test("validateTrackerChildWorkflowType: empty-string child_workflow_type hard-errors", () => {
  const wf = {
    type: "parent",
    entity: {
      connection_id: "parents-collection",
      ref_key: "parent_ids",
      page_id: "parent-view",
      title: "Parent",
    },
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [
      {
        type: "track-it",
        kind: "tracker",
        tracker: { child_workflow_type: "" },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/tracker\.child_workflow_type must be a non-empty string/);
});

test("validateTrackerChildWorkflowType: non-string child_workflow_type hard-errors", () => {
  const wf = {
    type: "parent",
    entity: {
      connection_id: "parents-collection",
      ref_key: "parent_ids",
      page_id: "parent-view",
      title: "Parent",
    },
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [
      {
        type: "track-it",
        kind: "tracker",
        tracker: { child_workflow_type: 42 },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/tracker\.child_workflow_type must be a non-empty string/);
});

test("validateTrackerChildWorkflowType: legacy tracker.workflow_type key hard-errors with rename hint", () => {
  const wf = {
    type: "parent",
    entity: {
      connection_id: "parents-collection",
      ref_key: "parent_ids",
      page_id: "parent-view",
      title: "Parent",
    },
    starting_actions: [{ type: "track-it", status: "action-required" }],
    actions: [
      {
        type: "track-it",
        kind: "tracker",
        tracker: { workflow_type: "child" },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/tracker\.workflow_type is renamed/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/tracker\.child_workflow_type/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, childStub] }),
  ).toThrow(/Part 48 D6/);
});

test("validateTrackerEdges: child_workflow_type not matching any declared workflow type hard-errors", () => {
  const wf = trackerWorkflow(); // references "child" which is not in the workflows array
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /child_workflow_type "child" which is not a declared workflow type/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /parent/,
  );
});

test("validateTrackerEdges: no cycle — linear parent → child passes", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [trackerWorkflow(), childStub] }),
  ).not.toThrow();
});

test("validateTrackerEdges: direct cycle (a → b → a) hard-errors naming the path", () => {
  const a = {
    type: "a",
    entity: {
      connection_id: "a-collection",
      ref_key: "a_ids",
      page_id: "a-view",
      title: "A",
    },
    starting_actions: [{ type: "track-b", status: "action-required" }],
    actions: [
      {
        type: "track-b",
        kind: "tracker",
        tracker: { child_workflow_type: "b" },
      },
    ],
  };
  const b = {
    type: "b",
    entity: {
      connection_id: "b-collection",
      ref_key: "b_ids",
      page_id: "b-view",
      title: "B",
    },
    starting_actions: [{ type: "track-a", status: "action-required" }],
    actions: [
      {
        type: "track-a",
        kind: "tracker",
        tracker: { child_workflow_type: "a" },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [a, b] })).toThrow(
    /tracker cycle/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [a, b] })).toThrow(
    /a.*b.*a|b.*a.*b/,
  );
});

test("validateTrackerEdges: longer cycle (a → b → c → a) hard-errors naming the path", () => {
  const a = {
    type: "a",
    entity: {
      connection_id: "a-collection",
      ref_key: "a_ids",
      page_id: "a-view",
      title: "A",
    },
    starting_actions: [{ type: "track-b", status: "action-required" }],
    actions: [
      {
        type: "track-b",
        kind: "tracker",
        tracker: { child_workflow_type: "b" },
      },
    ],
  };
  const b = {
    type: "b",
    entity: {
      connection_id: "b-collection",
      ref_key: "b_ids",
      page_id: "b-view",
      title: "B",
    },
    starting_actions: [{ type: "track-c", status: "action-required" }],
    actions: [
      {
        type: "track-c",
        kind: "tracker",
        tracker: { child_workflow_type: "c" },
      },
    ],
  };
  const c = {
    type: "c",
    entity: {
      connection_id: "c-collection",
      ref_key: "c_ids",
      page_id: "c-view",
      title: "C",
    },
    starting_actions: [{ type: "track-a", status: "action-required" }],
    actions: [
      {
        type: "track-a",
        kind: "tracker",
        tracker: { child_workflow_type: "a" },
      },
    ],
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [a, b, c] })).toThrow(
    /tracker cycle/,
  );
});

// --- validateEvent: mirror signals (Part 48 D4) --------------------------------

test("makeWorkflowsConfig: tracker action with mirror-signal event key passes", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        event: {
          internal_mirror_child_completed: {
            display: { demo: { title: "Child completed" } },
          },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).not.toThrow();
});

test("makeWorkflowsConfig: form action with mirror-signal event key hard-errors with kind-restriction message", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "form",
        form: [],
        event: {
          internal_mirror_child_completed: {
            display: { demo: { title: "x" } },
          },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/mirror signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/kind: tracker/);
});

test("makeWorkflowsConfig: check action with mirror-signal event key hard-errors with kind-restriction message", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      {
        type: "qualify",
        kind: "check",
        event: {
          internal_mirror_child_active: { display: { demo: { title: "x" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/mirror signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/kind: tracker/);
});

test("makeWorkflowsConfig: tracker action with unknown event key still hard-errors", () => {
  const wf = {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    starting_actions: [{ type: "install-device", status: "action-required" }],
    actions: [
      {
        type: "install-device",
        kind: "tracker",
        tracker: { child_workflow_type: "device-installation" },
        event: {
          completely_unknown_signal: { display: { demo: { title: "x" } } },
        },
      },
    ],
  };
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/is not a known signal/);
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [wf, deviceInstallationStub] }),
  ).toThrow(/completely_unknown_signal/);
});

// --- validateWorkflowEvent: workflow-level event map (Part 48 D8) ------------

test("makeWorkflowsConfig: workflow-level event with lifecycle signal keys passes", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { title: "Onboarding started" } } },
      cancelled: { display: { demo: { title: "Onboarding cancelled" } } },
      closed: { display: { demo: { title: "Onboarding closed" } } },
    },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).not.toThrow();
});

test("makeWorkflowsConfig: workflow-level event with unknown key hard-errors", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { title: "x" } } },
      submit: { display: { demo: { title: "x" } } },
    },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /is not a known lifecycle signal/,
  );
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /submit/,
  );
});

test("makeWorkflowsConfig: workflow-level lifecycle event display.{app}.description hard-errors (D4)", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { description: "dead config" } } },
    },
  };
  expect(() => makeWorkflowsConfig(null, { workflows: [wf] })).toThrow(
    /has a "description"/,
  );
});

test("makeWorkflowsConfig: workflow-level event is not present on the returned config blob", () => {
  const wf = {
    ...validWorkflow,
    event: {
      started: { display: { demo: { title: "x" } } },
    },
  };
  const [out] = makeWorkflowsConfig(null, { workflows: [wf] });
  expect("event" in out).toBe(false);
});

// ── Part 24: universal_fields authoring field ────────────────────────────────

function universalFieldsWorkflow(universal_fields) {
  return {
    ...validWorkflow,
    actions: [
      {
        type: "do-it",
        kind: "form",
        form: [{ id: "x", type: "TextInput" }],
        ...(universal_fields !== undefined ? { universal_fields } : {}),
      },
    ],
  };
}

test("makeWorkflowsConfig: universal_fields omitted passes and is absent from the blob", () => {
  const [out] = makeWorkflowsConfig(null, {
    workflows: [universalFieldsWorkflow(undefined)],
  });
  expect("universal_fields" in out.actions[0]).toBe(false);
});

test("makeWorkflowsConfig: universal_fields a valid subset passes through verbatim", () => {
  const [out] = makeWorkflowsConfig(null, {
    workflows: [universalFieldsWorkflow(["assignees", "due_date"])],
  });
  expect(out.actions[0].universal_fields).toEqual(["assignees", "due_date"]);
});

test("makeWorkflowsConfig: universal_fields false passes through verbatim", () => {
  const [out] = makeWorkflowsConfig(null, {
    workflows: [universalFieldsWorkflow(false)],
  });
  expect(out.actions[0].universal_fields).toBe(false);
});

test("makeWorkflowsConfig: universal_fields [] passes through verbatim", () => {
  const [out] = makeWorkflowsConfig(null, {
    workflows: [universalFieldsWorkflow([])],
  });
  expect(out.actions[0].universal_fields).toEqual([]);
});

test("makeWorkflowsConfig: universal_fields with an unknown field name throws, action named", () => {
  expect(() =>
    makeWorkflowsConfig(null, {
      workflows: [universalFieldsWorkflow(["bogus"])],
    }),
  ).toThrow(/universal_fields entry "bogus"/);
  expect(() =>
    makeWorkflowsConfig(null, {
      workflows: [universalFieldsWorkflow(["bogus"])],
    }),
  ).toThrow(/do-it/);
});

test("makeWorkflowsConfig: universal_fields: true throws (must be array or false)", () => {
  expect(() =>
    makeWorkflowsConfig(null, { workflows: [universalFieldsWorkflow(true)] }),
  ).toThrow(/universal_fields must be/);
});

test("makeWorkflowsConfig: universal_fields a string throws", () => {
  expect(() =>
    makeWorkflowsConfig(null, {
      workflows: [universalFieldsWorkflow("assignees")],
    }),
  ).toThrow(/universal_fields must be/);
});

test("makeWorkflowsConfig: universal_fields with a duplicate entry throws", () => {
  expect(() =>
    makeWorkflowsConfig(null, {
      workflows: [universalFieldsWorkflow(["assignees", "assignees"])],
    }),
  ).toThrow(/duplicate entry "assignees"/);
});

// Part 50: denormalised sort indices attached to each action config entry.
test("makeWorkflowsConfig: attaches decl_index and group_index onto each action config entry", () => {
  const workflow = {
    ...validWorkflow,
    action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check", action_group: "phase-1" },
      { type: "send-quote", kind: "check", action_group: "phase-2" },
      { type: "close", kind: "check", action_group: "phase-1" },
    ],
  };

  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });

  expect(out.actions[0]).toMatchObject({ type: "qualify", decl_index: 0, group_index: 0 });
  expect(out.actions[1]).toMatchObject({ type: "send-quote", decl_index: 1, group_index: 1 });
  expect(out.actions[2]).toMatchObject({ type: "close", decl_index: 2, group_index: 0 });
});

test("makeWorkflowsConfig: group_index is -1 when the action has no group or an unknown group", () => {
  const workflow = {
    ...validWorkflow,
    action_groups: [{ id: "phase-1" }],
    starting_actions: [{ type: "qualify", status: "action-required" }],
    actions: [
      { type: "qualify", kind: "check", action_group: "phase-1" },
      { type: "send-quote", kind: "check" },
    ],
  };

  const [out] = makeWorkflowsConfig(null, { workflows: [workflow] });

  expect(out.actions[0]).toMatchObject({ type: "qualify", decl_index: 0, group_index: 0 });
  // No action_group declared → findIndex returns -1 (comparator maps -1 → +∞).
  expect(out.actions[1]).toMatchObject({ type: "send-quote", decl_index: 1, group_index: -1 });
});

test("makeWorkflowsConfig: decl_index/group_index default to -1 group when a workflow declares no groups", () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });

  expect(out.actions[0]).toMatchObject({ type: "do-it", decl_index: 0, group_index: -1 });
});
