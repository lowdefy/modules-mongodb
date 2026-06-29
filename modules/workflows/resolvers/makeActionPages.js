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
  "universal_fields",
];

// Part 24: the all-three default for the UI presence list. Normalized onto the
// emitted action_config so templates/components always see a (possibly empty)
// array — `false` → [], omitted → all three, array → as-is.
const UNIVERSAL_FIELDS_DEFAULT = ["assignees", "due_date", "description"];

function normalizeUniversalFields(value) {
  if (value === undefined) return UNIVERSAL_FIELDS_DEFAULT;
  if (value === false) return [];
  return value;
}

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

// Resolve the workflow title identically to makeWorkflowsConfig (raw-YAML read,
// kept in lock-step). Used for the title eyebrow and the breadcrumb Workflow
// segment on every action page (Part 56 D8/D9).
function resolveWorkflowTitle(workflow, titleAcronyms) {
  return workflow.title ?? humanizeSlug(workflow.type, titleAcronyms);
}

// Per-workflow vars shared by the form templates and the shared action page (Part 56):
// the entity connection id + ref_key (nested entity: block — Part 57), the baked
// workflow title, the read-only entity_view.slot block array (empty when the
// workflow declares none), and the optional entity.name_field dot-path (empty
// string when absent, so the templates' `{% if name_field %}` gate is falsy).
function workspaceVars(workflow, workflowTitle) {
  return {
    connection_id: workflow.entity.connection_id,
    reference_field: workflow.entity.ref_key,
    workflow_title: workflowTitle,
    entity_view_slot: workflow.entity_view?.slot ?? [],
    name_field: workflow.entity.name_field ?? "",
  };
}

function emitForAction(workflow, action, appName, titleAcronyms, workflowTitle) {
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

  // Normalize universal_fields to a concrete array so templates can gate the
  // sidebar column on non-emptiness with no type juggling (Part 24).
  actionConfig.universal_fields = normalizeUniversalFields(
    action.universal_fields,
  );

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
        ...workspaceVars(workflow, workflowTitle),
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

// Part 56 D3 / Part 28: a workflow with ≥1 check OR custom action gets a SINGLE
// per-workflow `{workflow_type}-action` page. For check actions it is the
// working surface (the per-verb links all target it); for custom actions it is
// the read-only observer fallback (the working surface is an app-owned page).
// The page derives mode from the loaded action at runtime, so it is kind-
// agnostic. It is its own composition — `templates/action.yaml.njk` — not a
// reuse of the form templates or the modal. (A future `external` kind adds to
// the guard below.)
function emitActionPage(workflow, workflowTitle) {
  const hasActionPage = (workflow.actions ?? []).some(
    (a) => a.kind === "check" || a.kind === "custom",
  );
  if (!hasActionPage) return [];

  return [
    {
      id: `${workflow.type}-action`,
      _ref: {
        path: "templates/action.yaml.njk",
        vars: {
          workflow_type: workflow.type,
          ...workspaceVars(workflow, workflowTitle),
        },
      },
    },
  ];
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
    const workflowTitle = resolveWorkflowTitle(workflow, title_acronyms);
    for (const action of workflow.actions ?? []) {
      pages.push(
        ...emitForAction(
          workflow,
          action,
          appName,
          title_acronyms,
          workflowTitle,
        ),
      );
    }
    pages.push(...emitActionPage(workflow, workflowTitle));
  }
  return pages;
}

export default makeActionPages;
