import computeEngineLinks from "./computeEngineLinks.js";

const ENTRY = "workflows";

test("check kind at action-required: view+edit links, review/error null", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      workflow_type: "onboarding",
      status: [{ stage: "action-required" }],
      access: { demo: { view: true, edit: true } },
    },
  });
  expect(links.demo).toEqual({
    view: {
      pageId: "workflows/onboarding-action",
      urlQuery: { action_id: "a1" },
    },
    edit: {
      pageId: "workflows/onboarding-action",
      urlQuery: { action_id: "a1" },
    },
    review: null,
    error: null,
  });
});

test("verb the slug does not declare is null", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      status: [{ stage: "action-required" }],
      access: { customer: { view: true } },
    },
  });
  expect(links.customer.view).not.toBeNull();
  expect(links.customer.edit).toBeNull();
});

test("does NOT consult role gates — an array gate still yields a link", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      status: [{ stage: "action-required" }],
      // gate is a role list the (absent) user could never satisfy — irrelevant
      // to link computation; only verb-key presence matters.
      access: { demo: { view: ["nobody-has-this-role"] } },
    },
  });
  expect(links.demo.view).not.toBeNull();
});

test("in-review exposes review (declared), nulls edit", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      workflow_type: "onboarding",
      status: [{ stage: "in-review" }],
      access: { demo: { view: true, edit: true, review: true } },
    },
  });
  expect(links.demo.review.pageId).toBe("workflows/onboarding-action");
  expect(links.demo.edit).toBeNull();
});

test("error stage: check kind error verb targets the single {workflow_type}-action page", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      workflow_type: "onboarding",
      status: [{ stage: "error" }],
      access: { demo: { view: true, error: true } },
    },
  });
  // Part 56 D3: check kind has a single per-workflow page; every non-null verb
  // cell — error included — targets it, so the error-verb special case is gone.
  expect(links.demo.error.pageId).toBe("workflows/onboarding-action");
  expect(links.demo.view.pageId).toBe("workflows/onboarding-action");
});

test("blocked / not-required stages produce all-null cells", () => {
  for (const stage of ["blocked", "not-required"]) {
    const links = computeEngineLinks({
      entry_id: ENTRY,
      action: {
        _id: "a1",
        kind: "check",
        status: [{ stage }],
        access: { demo: { view: true, edit: true } },
      },
    });
    expect(links.demo).toEqual({
      view: null,
      edit: null,
      review: null,
      error: null,
    });
  }
});

test("form kind uses derived per-action page ids", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a2",
      kind: "form",
      workflow_type: "installation",
      type: "install-verify",
      status: [{ stage: "action-required" }],
      access: { demo: { view: true, edit: true } },
    },
  });
  expect(links.demo.view.pageId).toBe(
    "workflows/installation-install-verify-view",
  );
  expect(links.demo.edit.pageId).toBe(
    "workflows/installation-install-verify-edit",
  );
});

test("tracker kind: only view, to the child workflow-overview, when started", () => {
  const started = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a3",
      kind: "tracker",
      status: [{ stage: "in-progress" }],
      child_workflow_id: "w-child",
      access: { demo: { view: true } },
    },
  });
  expect(started.demo).toEqual({
    view: {
      pageId: "workflows/workflow-overview",
      urlQuery: { workflow_id: "w-child" },
    },
    edit: null,
    review: null,
    error: null,
  });

  const notStarted = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a3",
      kind: "tracker",
      status: [{ stage: "blocked" }],
      child_workflow_id: null,
      access: { demo: { view: true } },
    },
  });
  expect(notStarted.demo.view).toBeNull();
});

test("tracker start_link: edit emitted at action-required with null child + declared start_link", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "action-abc",
      entity: { connection_id: "tickets", id: "entity-xyz" },
      kind: "tracker",
      status: [{ stage: "action-required" }],
      child_workflow_id: null,
      access: { demo: { view: true, edit: true } },
      tracker: {
        workflow_type: "device-installation",
        start_link: {
          pageId: "ticket-new",
          urlQuery: { action_id: true, entity_id: true, source: "onboarding" },
        },
      },
    },
  });
  // edit → start_link with sentinel substitution; pageId NOT entry-scoped
  expect(links.demo.edit).toEqual({
    pageId: "ticket-new",
    urlQuery: {
      action_id: "action-abc",
      entity_id: "entity-xyz",
      source: "onboarding",
    },
  });
  // view null because child does not exist
  expect(links.demo.view).toBeNull();
});

test("tracker start_link: edit null when edit verb not declared", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "action-abc",
      entity: { connection_id: "tickets", id: "entity-xyz" },
      kind: "tracker",
      status: [{ stage: "action-required" }],
      child_workflow_id: null,
      // view-only — edit not declared
      access: { demo: { view: true } },
      tracker: {
        workflow_type: "device-installation",
        start_link: { pageId: "ticket-new" },
      },
    },
  });
  expect(links.demo.edit).toBeNull();
});

test("tracker start_link: edit null when no start_link declared", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "action-abc",
      kind: "tracker",
      status: [{ stage: "action-required" }],
      child_workflow_id: null,
      access: { demo: { view: true, edit: true } },
      tracker: { child_workflow_type: "device-installation" },
    },
  });
  expect(links.demo.edit).toBeNull();
});

test("tracker start_link: blocked stage stays linkless even with start_link + edit declared", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "action-abc",
      kind: "tracker",
      status: [{ stage: "blocked" }],
      child_workflow_id: null,
      access: { demo: { view: true, edit: true } },
      tracker: {
        workflow_type: "device-installation",
        start_link: { pageId: "ticket-new", urlQuery: { action_id: true } },
      },
    },
  });
  expect(links.demo).toEqual({
    view: null,
    edit: null,
    review: null,
    error: null,
  });
});

test("tracker start_link: child exists at action-required — view arm wins, edit null", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "action-abc",
      kind: "tracker",
      status: [{ stage: "action-required" }],
      child_workflow_id: "w-child",
      access: { demo: { view: true, edit: true } },
      tracker: {
        workflow_type: "device-installation",
        start_link: { pageId: "ticket-new" },
      },
    },
  });
  expect(links.demo.view).toEqual({
    pageId: "workflows/workflow-overview",
    urlQuery: { workflow_id: "w-child" },
  });
  expect(links.demo.edit).toBeNull();
});

test("tracker start_link: without urlQuery emits link with only pageId", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "action-abc",
      kind: "tracker",
      status: [{ stage: "action-required" }],
      child_workflow_id: null,
      access: { demo: { view: true, edit: true } },
      tracker: {
        workflow_type: "device-installation",
        start_link: { pageId: "ticket-new" },
      },
    },
  });
  expect(links.demo.edit).toEqual({ pageId: "ticket-new" });
  expect(links.demo.edit).not.toHaveProperty("urlQuery");
});

// ── Part 28: custom kind routes the author's cell links ──────────────────────

// A custom action doc as it reaches computeEngineLinks: the planner has already
// rendered the status_map cell onto doc[slug] (so doc.demo.link / .view_link
// exist). The cell urlQuery still carries the `true` sentinels — the engine
// substitutes them here.
function customAction(stage, demoCell, { access } = {}) {
  return {
    _id: "c1",
    kind: "custom",
    workflow_type: "account-review",
    entity: { id: "ent-9" },
    status: [{ stage }],
    access: access ?? { demo: { view: true, edit: true, review: true } },
    demo: demoCell,
  };
}

test("custom at action-required: working link → edit slot, sentinel substituted; view falls back to the shared action page", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("action-required", {
      message: "Review.",
      link: { pageId: "contract-review", urlQuery: { action_id: true } },
    }),
  });
  expect(links.demo.edit).toEqual({
    pageId: "contract-review",
    urlQuery: { action_id: "c1" },
  });
  // No view_link authored → observer fallback to the shared page.
  expect(links.demo.view).toEqual({
    pageId: "workflows/account-review-action",
    urlQuery: { action_id: "c1" },
  });
  expect(links.demo.review).toBeNull();
  expect(links.demo.error).toBeNull();
});

test("custom: an author-provided title on the link cell is preserved onto the resolved link", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("action-required", {
      message: "Review.",
      link: {
        pageId: "contract-review",
        urlQuery: { action_id: true },
        title: "Review contract",
      },
    }),
  });
  expect(links.demo.edit).toEqual({
    pageId: "contract-review",
    urlQuery: { action_id: "c1" },
    title: "Review contract",
  });
  // Engine-built view fallback carries no title (takes the verb default downstream).
  expect(links.demo.view.title).toBeUndefined();
});

test("custom at in-review: working link → review slot; view falls back", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("in-review", {
      link: { pageId: "contract-review", urlQuery: { action_id: true } },
    }),
  });
  expect(links.demo.review).toEqual({
    pageId: "contract-review",
    urlQuery: { action_id: "c1" },
  });
  expect(links.demo.view.pageId).toBe("workflows/account-review-action");
  expect(links.demo.edit).toBeNull();
});

test("custom at error: working link → error slot when error declared; view falls back", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction(
      "error",
      { link: { pageId: "contract-review", urlQuery: { action_id: true } } },
      { access: { demo: { view: true, error: true } } },
    ),
  });
  expect(links.demo.error).toEqual({
    pageId: "contract-review",
    urlQuery: { action_id: "c1" },
  });
  expect(links.demo.view.pageId).toBe("workflows/account-review-action");
});

test("custom at done: working link → view slot (done precedence over view_link)", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("done", {
      link: { pageId: "contract-view", urlQuery: { action_id: true } },
      view_link: { pageId: "should-not-win", urlQuery: { action_id: true } },
    }),
  });
  // At done the working link claims the view slot; view_link does NOT override.
  expect(links.demo.view).toEqual({
    pageId: "contract-view",
    urlQuery: { action_id: "c1" },
  });
  expect(links.demo.edit).toBeNull();
});

test("custom: authored view_link fills the view slot at an in-flight stage", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("action-required", {
      link: { pageId: "contract-review", urlQuery: { action_id: true } },
      view_link: { pageId: "contract-view", urlQuery: { action_id: true } },
    }),
  });
  expect(links.demo.edit.pageId).toBe("contract-review");
  expect(links.demo.view).toEqual({
    pageId: "contract-view",
    urlQuery: { action_id: "c1" },
  });
});

test("custom: entity_id sentinel substituted from action.entity.id", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("action-required", {
      link: {
        pageId: "contract-review",
        urlQuery: { action_id: true, entity_id: true },
      },
    }),
  });
  expect(links.demo.edit.urlQuery).toEqual({
    action_id: "c1",
    entity_id: "ent-9",
  });
});

test("custom at blocked: message-only, all slots null (no view fallback)", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("blocked", { message: "Awaiting requirements." }),
  });
  expect(links.demo).toEqual({
    view: null,
    edit: null,
    review: null,
    error: null,
  });
});

test("custom: working link absent → working slot null, view still falls back", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: customAction("in-review", { message: "In review." }),
  });
  expect(links.demo.review).toBeNull();
  expect(links.demo.view.pageId).toBe("workflows/account-review-action");
});

test("reserved access keys are not treated as slugs", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      status: [{ stage: "action-required" }],
      access: { demo: { view: true }, roles: ["x"], notification_roles: ["y"] },
    },
  });
  expect(Object.keys(links)).toEqual(["demo"]);
});
