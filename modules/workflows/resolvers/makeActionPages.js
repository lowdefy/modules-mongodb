const VERBS = ["edit", "view", "review", "error"];

// Fields lifted from the raw action YAML onto each emitted page's
// `action_config` template var. Engine-runtime fields and build-time-only
// fields live on the same raw object — templates see one flat shape.
// `pages` is intentionally excluded — the per-verb slice is lifted to the
// top-level `page_config` var below, and authors shouldn't reach the other
// verbs' chrome from inside a template.
const ACTION_FIELDS_FOR_TEMPLATE = [
  "type",
  "kind",
  "key",
  "tracker",
  "blocked_by",
  "action_group",
  "sort_order",
  "required_after_close",
  "access",
  "status_map",
  "form",
  "form_review",
  "form_error",
  "hooks",
  "interactions",
  "event",
];

function pick(source, fields) {
  const picked = {};
  for (const field of fields) {
    if (field in source) picked[field] = source[field];
  }
  return picked;
}

function fail(message) {
  throw new Error(`makeActionPages: ${message}`);
}

function emitForAction(workflow, action, appName) {
  if (action.kind !== "form") return [];

  const accessVerbs = action.access?.[appName] ?? [];
  const emittedVerbs = VERBS.filter((v) => accessVerbs.includes(v));
  if (emittedVerbs.length === 0) return [];

  const pageIds = Object.fromEntries(
    emittedVerbs.map((v) => [v, `${workflow.type}-${action.type}-${v}`]),
  );

  const actionConfig = pick(action, ACTION_FIELDS_FOR_TEMPLATE);

  return emittedVerbs.map((verb) => ({
    id: pageIds[verb],
    _ref: {
      path: `templates/${verb}.yaml.njk`,
      vars: {
        action_config: actionConfig,
        workflow_type: workflow.type,
        entity_collection: workflow.entity_collection,
        page_ids: pageIds,
        // Per-verb page customization (title, requests, events, formHeader,
        // formFooter, modals, maxWidth, buttons.submit on error) passes
        // through verbatim as a top-level var. Templates read off
        // `page_config.*` — the duplicate path through `action_config.pages`
        // is intentionally removed (see `ACTION_FIELDS_FOR_TEMPLATE`).
        page_config: action.pages?.[verb] ?? {},
      },
    },
  }));
}

function makeActionPages(_, vars) {
  const { workflows, app_name: appName } = vars;

  if (!appName) {
    fail(
      `vars.app_name is required and must be non-empty (got: ${JSON.stringify(appName)}).`,
    );
  }

  const pages = [];
  for (const workflow of workflows) {
    for (const action of workflow.actions ?? []) {
      pages.push(...emitForAction(workflow, action, appName));
    }
  }
  return pages;
}

export default makeActionPages;
