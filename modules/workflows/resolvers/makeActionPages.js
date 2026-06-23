import { humanizeSlug } from "./humanizeSlug.js";

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

function emitForAction(workflow, action, appName, titleAcronyms) {
  if (action.kind !== "form") return [];

  // Part 34 D5: emit a verb page iff the verb key is present in the app's
  // verb→gate map. Role gates don't matter at build time — presence of the key
  // alone gates page generation. Reads the map keys, not the old verb array.
  const accessMap = action.access?.[appName] ?? {};
  const emittedVerbs = VERBS.filter((v) => v in accessMap);
  if (emittedVerbs.length === 0) return [];

  const pageIds = Object.fromEntries(
    emittedVerbs.map((v) => [v, `${workflow.type}-${action.type}-${v}`]),
  );

  const actionConfig = pick(action, ACTION_FIELDS_FOR_TEMPLATE);

  // Resolve the action title identically to makeWorkflowsConfig (this resolver
  // reads raw YAML, not the materialized config, so it must re-derive rather
  // than read a pre-resolved field — kept in lock-step so a page title and the
  // action's config title never disagree).
  const actionTitle = action.title ?? humanizeSlug(action.type, titleAcronyms);

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
        // `title` defaults to the resolved action title (Part 51 F1 gap); an
        // explicit per-verb `pages[verb].title` still wins.
        page_config: {
          ...(action.pages?.[verb] ?? {}),
          title: action.pages?.[verb]?.title ?? actionTitle,
        },
      },
    },
  }));
}

function makeActionPages(_, vars) {
  const { workflows, app_name: appName, title_acronyms = [] } = vars;

  if (!appName) {
    fail(
      `vars.app_name is required and must be non-empty (got: ${JSON.stringify(appName)}).`,
    );
  }

  const pages = [];
  for (const workflow of workflows) {
    for (const action of workflow.actions ?? []) {
      pages.push(...emitForAction(workflow, action, appName, title_acronyms));
    }
  }
  return pages;
}

export default makeActionPages;
