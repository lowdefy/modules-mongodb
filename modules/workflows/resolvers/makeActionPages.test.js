import makeActionPages from "./makeActionPages.js";

const APP = "my-team-app";

const qualifyAction = {
  type: "qualify",
  kind: "form",
  access: { "my-team-app": { view: true, edit: ["account-manager"] } },
  status_map: {
    "action-required": { "my-team-app": { message: "Qualify the lead." } },
  },
  form: [{ id: "contact_name", type: "TextInput" }],
  hooks: {
    submit_edit: {
      pre: { routine: [{ id: "qualify_pre_submit", type: "MongoDBFindOne" }] },
    },
  },
  pages: {
    edit: { maxWidth: 1200 },
  },
};

const sendQuoteAction = {
  type: "send-quote",
  kind: "form",
  access: {
    "my-team-app": {
      view: true,
      edit: ["account-manager"],
      review: ["account-manager"],
    },
  },
  blocked_by: ["qualify"],
  status_map: {
    blocked: { "my-team-app": { message: "Awaiting quote acceptance." } },
  },
  form: [{ id: "quote_total", type: "NumberInput" }],
  form_review: [{ id: "approve_notes", type: "TextArea" }],
};

const scheduleFollowupAction = {
  type: "schedule-followup",
  kind: "check",
  access: { "my-team-app": { view: true, edit: ["account-manager"] } },
  blocked_by: ["send-quote"],
};

const trackInstallationAction = {
  type: "track-installation",
  kind: "tracker",
  access: {
    "my-team-app": {
      view: true,
      edit: ["account-manager"],
      review: ["account-manager"],
    },
  },
  tracker: { child_workflow_type: "device-installation" },
};

function workflow(actions) {
  return {
    type: "onboarding",
    entity: {
      connection_id: "leads-collection",
      ref_key: "lead_ids",
      page_id: "lead-view",
      title: "Lead",
    },
    actions,
  };
}

test("makeActionPages: qualify (form, access [view, edit]) emits exactly -edit and -view", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const ids = pages.map((p) => p.id).sort();
  expect(ids).toEqual(["onboarding-qualify-edit", "onboarding-qualify-view"]);
});

test("makeActionPages: adding error to access list emits -error; removing it does not", () => {
  const withError = {
    ...qualifyAction,
    access: {
      "my-team-app": { view: true, edit: ["account-manager"], error: true },
    },
  };

  const withErrorPages = makeActionPages(null, {
    workflows: [workflow([withError])],
    app_name: APP,
  });
  const withErrorIds = withErrorPages.map((p) => p.id).sort();
  expect(withErrorIds).toEqual([
    "onboarding-qualify-edit",
    "onboarding-qualify-error",
    "onboarding-qualify-view",
  ]);

  const withoutErrorPages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  expect(
    withoutErrorPages.some((p) => p.id === "onboarding-qualify-error"),
  ).toBe(false);
});

test("makeActionPages: send-quote (form, access [view, edit, review]) emits -edit, -view, -review and no -error", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([sendQuoteAction])],
    app_name: APP,
  });

  const ids = pages.map((p) => p.id).sort();
  expect(ids).toEqual([
    "onboarding-send-quote-edit",
    "onboarding-send-quote-review",
    "onboarding-send-quote-view",
  ]);
  expect(pages.some((p) => p.id.endsWith("-error"))).toBe(false);
});

test("makeActionPages: schedule-followup (check) emits no per-verb pages even with view+edit access", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([scheduleFollowupAction])],
    app_name: APP,
  });

  // The check action emits no verb pages (no -edit/-view/-review/-error). It
  // contributes only the single per-workflow action page (asserted separately).
  expect(pages.some((p) => /-(edit|view|review|error)$/.test(p.id))).toBe(
    false,
  );
  expect(pages.map((p) => p.id)).toEqual(["onboarding-action"]);
});

test("makeActionPages: track-installation (tracker) emits nothing even with view+edit+review access", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([trackInstallationAction])],
    app_name: APP,
  });

  expect(pages).toEqual([]);
});

test("makeActionPages: action_config carries access, status_map, and form", () => {
  const [editPage] = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const vars = editPage._ref.vars;
  expect(vars.action_config.access).toEqual(qualifyAction.access);
  expect(vars.action_config.status_map).toEqual(qualifyAction.status_map);
  expect(vars.action_config.form).toEqual(qualifyAction.form);
});

test("makeActionPages: pages.{verb}.buttons.extra round-trips into the page_config var", () => {
  // Part 36: makeActionPages only forwards page_config = action.pages[verb];
  // the _build.array.concat that merges these into the bar's actions: array
  // happens later in Lowdefy's build. Assert the author array round-trips.
  const extra = [
    {
      id: "open_help",
      type: "Button",
      properties: { title: "Help", type: "link" },
      events: { onClick: [{ id: "nav_help", type: "Link", params: { url: "x" } }] },
    },
  ];
  const action = {
    ...qualifyAction,
    pages: { edit: { buttons: { extra } } },
  };
  const editPage = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  }).find((p) => p.id === "onboarding-qualify-edit");

  expect(editPage._ref.vars.page_config.buttons.extra).toEqual(extra);
});

test("makeActionPages: page_ids only contains emitted verbs", () => {
  const [editPage] = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const pageIds = editPage._ref.vars.page_ids;
  expect(Object.keys(pageIds).sort()).toEqual(["edit", "view"]);
  expect(pageIds.review).toBeUndefined();
  expect(pageIds.error).toBeUndefined();
});

test('makeActionPages: app_name of undefined, null, or "" throws with /app_name is required/', () => {
  for (const appName of [undefined, null, ""]) {
    expect(() =>
      makeActionPages(null, {
        workflows: [workflow([qualifyAction])],
        app_name: appName,
      }),
    ).toThrow(/app_name is required/);
  }
});

test("makeActionPages: worked-example fixture emits the five form pages plus the single action page", () => {
  const pages = makeActionPages(null, {
    workflows: [
      workflow([
        qualifyAction,
        sendQuoteAction,
        scheduleFollowupAction,
        trackInstallationAction,
      ]),
    ],
    app_name: APP,
  });

  const ids = pages.map((p) => p.id).sort();
  expect(ids).toEqual([
    // The check action (schedule-followup) contributes the per-workflow
    // action page; the tracker action contributes nothing.
    "onboarding-action",
    "onboarding-qualify-edit",
    "onboarding-qualify-view",
    "onboarding-send-quote-edit",
    "onboarding-send-quote-review",
    "onboarding-send-quote-view",
  ]);
});

test("makeActionPages: page_config var passes through action.pages.{verb} keys plus a defaulted title", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const editPage = pages.find((p) => p.id === "onboarding-qualify-edit");
  const viewPage = pages.find((p) => p.id === "onboarding-qualify-view");

  // Author-supplied per-verb keys pass through; title defaults to the action title.
  expect(editPage._ref.vars.page_config).toEqual({
    maxWidth: 1200,
    title: "Qualify",
  });
  expect(viewPage._ref.vars.page_config).toEqual({ title: "Qualify" });
});

test("makeActionPages: page_config.title defaults to humanizeSlug(action.type)", () => {
  const action = {
    type: "upload-po",
    kind: "form",
    access: { [APP]: { view: true, edit: true } },
    form: [{ id: "po", type: "TextInput" }],
  };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.page_config.title).toBe("Upload PO");
  }
});

test("makeActionPages: page_config.title defaults to an explicit action.title", () => {
  const action = {
    type: "upload-po",
    kind: "form",
    title: "Send the PO",
    access: { [APP]: { view: true, edit: true } },
    form: [{ id: "po", type: "TextInput" }],
  };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.page_config.title).toBe("Send the PO");
  }
});

test("makeActionPages: explicit pages[verb].title wins over the action title", () => {
  const action = {
    type: "qualify",
    kind: "form",
    access: { [APP]: { view: true, edit: true } },
    form: [{ id: "x", type: "TextInput" }],
    pages: { edit: { title: "Edit qualification" } },
  };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  });
  const editPage = pages.find((p) => p.id.endsWith("-edit"));
  const viewPage = pages.find((p) => p.id.endsWith("-view"));
  expect(editPage._ref.vars.page_config.title).toBe("Edit qualification");
  expect(viewPage._ref.vars.page_config.title).toBe("Qualify");
});

test("makeActionPages: title_acronyms extends the humanizer for page titles", () => {
  const action = {
    type: "upload-bom",
    kind: "form",
    access: { [APP]: { view: true } },
    form: [{ id: "x", type: "TextInput" }],
  };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
    title_acronyms: ["BOM"],
  });
  expect(pages[0]._ref.vars.page_config.title).toBe("Upload BOM");
});

test("makeActionPages: action_config does not carry the `pages` slot (duplicate path removed)", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const editPage = pages.find((p) => p.id === "onboarding-qualify-edit");
  expect(editPage._ref.vars.action_config.pages).toBeUndefined();
});

// ── Part 24: universal_fields normalization on action_config ─────────────────

test("makeActionPages: universal_fields omitted → all-three default on action_config", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  expect(pages[0]._ref.vars.action_config.universal_fields).toEqual([
    "assignees",
    "due_date",
    "description",
  ]);
});

test("makeActionPages: universal_fields false → [] on action_config", () => {
  const action = { ...qualifyAction, universal_fields: false };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  });
  expect(pages[0]._ref.vars.action_config.universal_fields).toEqual([]);
});

test("makeActionPages: universal_fields explicit subset passes through unchanged", () => {
  const action = { ...qualifyAction, universal_fields: ["assignees"] };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  });
  expect(pages[0]._ref.vars.action_config.universal_fields).toEqual([
    "assignees",
  ]);
});

test("makeActionPages: universal_fields_required never appears in output", () => {
  const action = { ...qualifyAction, universal_fields_required: ["assignees"] };
  const pages = makeActionPages(null, {
    workflows: [workflow([action])],
    app_name: APP,
  });
  expect("universal_fields_required" in pages[0]._ref.vars.action_config).toBe(
    false,
  );
});

// ── Part 56 Task 10: workspace vars on form pages ────────────────────────────

test("makeActionPages: form pages carry connection_id from workflow.entity.connection_id", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.connection_id).toBe("leads-collection");
  }
});

test("makeActionPages: form pages carry reference_field from workflow.entity.ref_key", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.reference_field).toBe("lead_ids");
  }
});

test("makeActionPages: workflow_title falls back to humanizeSlug(workflow.type) when workflow.title absent", () => {
  // The shared `workflow()` fixture sets `entity.title` (the entity's display
  // name) but no top-level `workflow.title`, so the title is derived from the
  // workflow type "onboarding".
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.workflow_title).toBe("Onboarding");
  }
});

test("makeActionPages: explicit workflow.title wins over the humanized type", () => {
  const wf = { ...workflow([qualifyAction]), title: "Lead Onboarding" };
  const pages = makeActionPages(null, {
    workflows: [wf],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.workflow_title).toBe("Lead Onboarding");
  }
});

test("makeActionPages: workflow_title honours title_acronyms in the humanized fallback", () => {
  const wf = { ...workflow([qualifyAction]), type: "kyc-review" };
  const pages = makeActionPages(null, {
    workflows: [wf],
    app_name: APP,
    title_acronyms: ["BOM"],
  });
  // "kyc" is in BASE_ACRONYMS, so it uppercases regardless of supplied acronyms.
  for (const p of pages) {
    expect(p._ref.vars.workflow_title).toBe("KYC Review");
  }
});

test("makeActionPages: name_field defaults to empty string when workflow.entity.name_field absent", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.name_field).toBe("");
  }
});

test("makeActionPages: name_field passes through workflow.entity.name_field when present", () => {
  const wf = workflow([qualifyAction]);
  wf.entity = { ...wf.entity, name_field: "lead.full_name" };
  const pages = makeActionPages(null, {
    workflows: [wf],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.name_field).toBe("lead.full_name");
  }
});

test("makeActionPages: list_page_id/list_title default to empty string when absent", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.list_page_id).toBe("");
    expect(p._ref.vars.list_title).toBe("");
  }
});

test("makeActionPages: list_page_id/list_title pass through workflow.entity when present", () => {
  const wf = workflow([qualifyAction]);
  wf.entity = { ...wf.entity, list_page_id: "lead-list", list_title: "Leads" };
  const pages = makeActionPages(null, {
    workflows: [wf],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.list_page_id).toBe("lead-list");
    expect(p._ref.vars.list_title).toBe("Leads");
  }
});

test("makeActionPages: entity_view_slot defaults to [] when workflow declares no entity_view", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.entity_view_slot).toEqual([]);
  }
});

test("makeActionPages: entity_view_slot is baked from workflow.entity_view.slot when present", () => {
  const slot = [{ id: "lead_summary", type: "Html" }];
  const wf = { ...workflow([qualifyAction]), entity_view: { slot } };
  const pages = makeActionPages(null, {
    workflows: [wf],
    app_name: APP,
  });
  for (const p of pages) {
    expect(p._ref.vars.entity_view_slot).toEqual(slot);
  }
});

// ── Part 56 Task 10 / Part 28: shared action page emission ──────────────────

test("makeActionPages: a workflow with a check action emits exactly one action page", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction, scheduleFollowupAction])],
    app_name: APP,
  });

  const checkPages = pages.filter((p) => p.id === "onboarding-action");
  expect(checkPages).toHaveLength(1);
});

test("makeActionPages: the action page targets templates/action.yaml.njk with the workspace vars", () => {
  const slot = [{ id: "lead_summary", type: "Html" }];
  const wf = {
    ...workflow([qualifyAction, scheduleFollowupAction]),
    entity_view: { slot },
  };
  wf.entity = { ...wf.entity, name_field: "lead.full_name" };

  const pages = makeActionPages(null, {
    workflows: [wf],
    app_name: APP,
  });

  const checkPage = pages.find((p) => p.id === "onboarding-action");
  expect(checkPage._ref.path).toBe("templates/action.yaml.njk");
  expect(checkPage._ref.vars).toEqual({
    workflow_type: "onboarding",
    connection_id: "leads-collection",
    reference_field: "lead_ids",
    workflow_title: "Onboarding",
    entity_view_slot: slot,
    name_field: "lead.full_name",
    list_page_id: "",
    list_title: "",
  });
});

test("makeActionPages: a workflow with neither check nor custom action emits no action page", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction, sendQuoteAction])],
    app_name: APP,
  });

  expect(pages.some((p) => p.id === "onboarding-action")).toBe(false);
});

test("makeActionPages: multiple check actions still emit exactly one action page", () => {
  const secondCheck = { ...scheduleFollowupAction, type: "confirm-delivery" };
  const pages = makeActionPages(null, {
    workflows: [workflow([scheduleFollowupAction, secondCheck])],
    app_name: APP,
  });

  const checkPages = pages.filter((p) => p.id === "onboarding-action");
  expect(checkPages).toHaveLength(1);
});

test("makeActionPages: the action page's entity_view_slot defaults to [] when no entity_view", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([scheduleFollowupAction])],
    app_name: APP,
  });

  const checkPage = pages.find((p) => p.id === "onboarding-action");
  expect(checkPage._ref.vars.entity_view_slot).toEqual([]);
});

// ── Part 28: custom kind ─────────────────────────────────────────────────────

const reviewDocumentAction = {
  type: "review-document",
  kind: "custom",
  access: { "my-team-app": { view: true, edit: ["account-manager"] } },
  status_map: {
    "action-required": {
      "my-team-app": {
        message: "Review the document.",
        link: { pageId: "contract-review", urlQuery: { action_id: true } },
      },
    },
  },
};

test("makeActionPages: a custom action emits no per-action pages (app owns the working surface)", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([reviewDocumentAction])],
    app_name: APP,
  });

  // No -edit/-view/-review/-error per-action pages — only the shared action page.
  expect(pages.some((p) => /-(edit|view|review|error)$/.test(p.id))).toBe(
    false,
  );
});

test("makeActionPages: a custom-only workflow emits the single shared action page", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([reviewDocumentAction])],
    app_name: APP,
  });

  expect(pages.map((p) => p.id)).toEqual(["onboarding-action"]);
});
