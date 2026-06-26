/**
 * Per-verb engine link computation for built-in action kinds (Part 34 D7,
 * superseding Part 30 D4's single-link cells).
 *
 * For each app slug declared in the action's `access` block, builds a per-verb
 * link map `{ view, edit, review, error }`. A cell is non-null only when BOTH:
 *   (a) the slug declares that verb key in `access.{slug}`, AND
 *   (b) the stage exposes a meaningful page for that verb (the kind x stage x
 *       verb table below).
 * Per-verb *role gates* (the `true | [roles]` values) do NOT enter this
 * computation — they filter which verbs the user is in (`visible_verbs`) on
 * read, owned by the display layer (Part 42 D5).
 *
 * Page ids are entry-scoped (`${entry_id}/${page}`) to match Lowdefy's build-
 * time _module.pageId scoping (Part 30 D4 mechanic):
 *   - check   -> fixed module pages `workflow-action-{verb}`, urlQuery action_id
 *               (the `error` verb maps to `workflow-action-view` — no error page
 *                exists for the check kind; recovery is a button on the view page)
 *   - form    -> derived pages `{workflow_type}-{action_type}-{verb}` (unprefixed),
 *                urlQuery action_id
 *   - tracker -> two arms:
 *               • child exists → `view` to child `workflow-overview`,
 *                 urlQuery workflow_id
 *               • `action-required` + null child + declared `tracker.start_link`
 *                 → `edit` to start_link.pageId (verbatim, NOT entry-scoped),
 *                   urlQuery sentinels: `action_id: true` → action._id,
 *                   `entity_id: true` → action.entity_id, statics verbatim
 *   - custom  -> no engine links (author authors them in the cell); returns {}
 *
 * Output: `{ [slug]: { view, edit, review, error } }` (each cell a link object
 * or null). The planner assigns each map to `action[slug].links`.
 */

const VERBS = ["view", "edit", "review", "error"];

const RESERVED_ACCESS_KEYS = new Set(["roles", "notification_roles"]);

// Which verbs have a meaningful page at each stage (shared by check + form).
// `true` => the stage exposes a page for that verb; otherwise the cell is null.
const STAGE_VERB_PAGE = {
  "action-required": { view: true, edit: true, review: false, error: false },
  "in-progress": { view: true, edit: true, review: false, error: false },
  "changes-required": { view: true, edit: true, review: false, error: false },
  "in-review": { view: true, edit: false, review: true, error: false },
  done: { view: true, edit: false, review: false, error: false },
  error: { view: true, edit: false, review: false, error: true },
  blocked: { view: false, edit: false, review: false, error: false },
  "not-required": { view: false, edit: false, review: false, error: false },
};

function declaredSlugs(access = {}) {
  return Object.keys(access).filter((key) => !RESERVED_ACCESS_KEYS.has(key));
}

function scoped(entryId, page) {
  return `${entryId}/${page}`;
}

function computeEngineLinks({ action, entry_id: entryId }) {
  const { kind } = action;
  // Custom kinds author their own links in the status_map cell.
  if (kind === "custom") return {};

  const access = action.access ?? {};
  const slugs = declaredSlugs(access);
  const stage = action.status?.[0]?.stage;
  const result = {};

  for (const slug of slugs) {
    const verbsDeclared = access[slug] ?? {};
    const links = { view: null, edit: null, review: null, error: null };

    if (kind === "tracker") {
      // Arm 1: child exists → `view` to child workflow-overview.
      if ("view" in verbsDeclared && action.child_workflow_id != null) {
        links.view = {
          pageId: scoped(entryId, "workflow-overview"),
          urlQuery: { workflow_id: action.child_workflow_id },
        };
      }

      // Arm 2: pre-child at action-required + declared start_link → `edit`.
      const startLink = action.tracker?.start_link;
      if (
        "edit" in verbsDeclared &&
        stage === "action-required" &&
        action.child_workflow_id == null &&
        startLink != null
      ) {
        const link = { pageId: startLink.pageId };
        if (startLink.urlQuery != null) {
          const urlQuery = {};
          for (const [key, val] of Object.entries(startLink.urlQuery)) {
            if (key === "action_id" && val === true) {
              urlQuery[key] = action._id;
            } else if (key === "entity_id" && val === true) {
              urlQuery[key] = action.entity_id;
            } else {
              urlQuery[key] = val;
            }
          }
          link.urlQuery = urlQuery;
        }
        links.edit = link;
      }

      result[slug] = links;
      continue;
    }

    // check / form
    const stageVerbs = STAGE_VERB_PAGE[stage] ?? {};
    for (const verb of VERBS) {
      if (!(verb in verbsDeclared)) continue; // slug doesn't declare this verb
      if (!stageVerbs[verb]) continue; // stage has no page for this verb
      const page =
        kind === "check"
          ? verb === "error"
            ? "workflow-action-view"
            : `workflow-action-${verb}`
          : `${action.workflow_type}-${action.type}-${verb}`;
      links[verb] = {
        pageId: scoped(entryId, page),
        urlQuery: { action_id: action._id },
      };
    }
    result[slug] = links;
  }

  return result;
}

export default computeEngineLinks;
