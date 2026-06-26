import computeEngineLinks from "./computeEngineLinks.js";

const ENTRY = "workflows";

test("check kind at action-required: view+edit links, review/error null", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      status: [{ stage: "action-required" }],
      access: { demo: { view: true, edit: true } },
    },
  });
  expect(links.demo).toEqual({
    view: {
      pageId: "workflows/workflow-action-view",
      urlQuery: { action_id: "a1" },
    },
    edit: {
      pageId: "workflows/workflow-action-edit",
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
      status: [{ stage: "in-review" }],
      access: { demo: { view: true, edit: true, review: true } },
    },
  });
  expect(links.demo.review.pageId).toBe("workflows/workflow-action-review");
  expect(links.demo.edit).toBeNull();
});

test("error stage: check kind error verb maps to workflow-action-view (no error page exists)", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a1",
      kind: "check",
      status: [{ stage: "error" }],
      access: { demo: { view: true, error: true } },
    },
  });
  // Per review-14 #4: check kind has no error page; recovery is a
  // resolve_error button on the view page, so the error verb links there too.
  expect(links.demo.error.pageId).toBe("workflows/workflow-action-view");
  expect(links.demo.view.pageId).toBe("workflows/workflow-action-view");
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
      entity_id: "entity-xyz",
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
      entity_id: "entity-xyz",
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

test("custom kind returns no engine links", () => {
  const links = computeEngineLinks({
    entry_id: ENTRY,
    action: {
      _id: "a4",
      kind: "custom",
      status: [{ stage: "action-required" }],
      access: { demo: { view: true } },
    },
  });
  expect(links).toEqual({});
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
