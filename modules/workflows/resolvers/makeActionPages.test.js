import makeActionPages from "./makeActionPages.js";

const APP = "my-team-app";

const qualifyAction = {
  type: "qualify",
  kind: "form",
  access: { "my-team-app": ["view", "edit"], roles: ["account-manager"] },
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
    "my-team-app": ["view", "edit", "review"],
    roles: ["account-manager"],
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
  kind: "simple",
  access: { "my-team-app": ["view", "edit"], roles: ["account-manager"] },
  blocked_by: ["send-quote"],
};

const trackInstallationAction = {
  type: "track-installation",
  kind: "tracker",
  access: {
    "my-team-app": ["view", "edit", "review"],
    roles: ["account-manager"],
  },
  tracker: { workflow_type: "device-installation" },
};

function workflow(actions) {
  return {
    type: "onboarding",
    entity_collection: "leads-collection",
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
      "my-team-app": ["view", "edit", "error"],
      roles: ["account-manager"],
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
  expect(withoutErrorPages.some((p) => p.id === "onboarding-qualify-error")).toBe(false);
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

test("makeActionPages: schedule-followup (simple) emits nothing even with view+edit access", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([scheduleFollowupAction])],
    app_name: APP,
  });

  expect(pages).toEqual([]);
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

test("makeActionPages: worked-example fixture emits exactly the five expected pages", () => {
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
    "onboarding-qualify-edit",
    "onboarding-qualify-view",
    "onboarding-send-quote-edit",
    "onboarding-send-quote-review",
    "onboarding-send-quote-view",
  ]);
});

test("makeActionPages: page_config var passes through action.pages.{verb} verbatim", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const editPage = pages.find((p) => p.id === "onboarding-qualify-edit");
  const viewPage = pages.find((p) => p.id === "onboarding-qualify-view");

  expect(editPage._ref.vars.page_config).toEqual({ maxWidth: 1200 });
  expect(viewPage._ref.vars.page_config).toEqual({});
});

test("makeActionPages: action_config does not carry the `pages` slot (duplicate path removed)", () => {
  const pages = makeActionPages(null, {
    workflows: [workflow([qualifyAction])],
    app_name: APP,
  });

  const editPage = pages.find((p) => p.id === "onboarding-qualify-edit");
  expect(editPage._ref.vars.action_config.pages).toBeUndefined();
});
