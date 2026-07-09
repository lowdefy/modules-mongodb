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
 *   - check   -> single per-workflow page `{workflow_type}-action`, urlQuery
 *               action_id (Part 56 D3: replaces the fixed `workflow-action-{verb}`
 *               module pages; the page reads `?action_id` and derives its mode
 *               from the loaded action, so every non-null verb cell — `error`
 *               included — targets the one page and the error-verb special case
 *               is gone. Generalized check-only → all FSM kinds in Part 28)
 *   - form    -> derived pages `{workflow_type}-{action_type}-{verb}` (unprefixed),
 *                urlQuery action_id
 *   - tracker -> two arms:
 *               • child exists → `view` to child `workflow-overview`,
 *                 urlQuery workflow_id
 *               • `action-required` + null child + declared `tracker.start_link`
 *                 → `edit` to start_link.pageId (verbatim, NOT entry-scoped),
 *                   urlQuery sentinels: `action_id: true` → action._id,
 *                   `entity_id: true` → action.entity.id, statics verbatim
 *   - custom  -> author-routed (Part 28): the working `link` cell
 *               (action[slug].link) lands in the stage's active working verb
 *               slot (edit at action-required/in-progress/changes-required,
 *               review at in-review, error at error, view at done); the `view`
 *               slot is filled by the author's `view_link` cell or, absent that,
 *               the shared `{workflow_type}-action` page (observer fallback).
 *               Sentinels (`action_id`/`entity_id`) are substituted as for
 *               tracker start_link.
 *
 * Output: `{ [slug]: { view, edit, review, error } }` (each cell a link object
 * or null). The planner assigns each map to `action[slug].links`.
 */

const VERBS = ["view", "edit", "review", "error"];

const RESERVED_ACCESS_KEYS = new Set(["roles", "notification_roles"]);

// The single active working verb at each stage — the slot a custom action's
// working `link` cell lands in. `done` is view-only (no working verb), so a
// working `link` at done lands in the `view` slot. blocked / not-required
// expose no slot. Mirrors STAGE_VERB_PAGE's exposed verbs.
const STAGE_WORKING_VERB = {
  "action-required": "edit",
  "in-progress": "edit",
  "changes-required": "edit",
  "in-review": "review",
  error: "error",
  done: "view",
};

// Substitute the engine-link sentinels over a flat urlQuery: `action_id: true`
// → action._id, `entity_id: true` → action.entity.id, every other key/value
// verbatim. Returns undefined when there is no urlQuery (so the caller emits a
// pageId-only link, matching tracker start_link). Shared by the tracker arm and
// the custom branch so every engine-routed link resolves sentinels identically.
function substituteSentinels(urlQuery, action) {
  if (urlQuery == null) return undefined;
  const out = {};
  for (const [key, val] of Object.entries(urlQuery)) {
    if (key === "action_id" && val === true) {
      out[key] = action._id;
    } else if (key === "entity_id" && val === true) {
      out[key] = action.entity.id;
    } else {
      out[key] = val;
    }
  }
  return out;
}

// Build a link object from an engine-link cell `{ pageId, urlQuery?, title? }`,
// substituting sentinels. Omits urlQuery entirely when the cell has none.
// A cell may carry an author `title` (custom action link/view_link, tracker
// start_link) — passed through so it overrides the verb-default button label in
// collapseLink. Engine-built check/form links (below) carry no title and take
// the verb default.
function resolveCellLink(cell, action) {
  const link = { pageId: cell.pageId };
  const urlQuery = substituteSentinels(cell.urlQuery, action);
  if (urlQuery !== undefined) link.urlQuery = urlQuery;
  if (cell.title != null) link.title = cell.title;
  return link;
}

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

  const access = action.access ?? {};
  const slugs = declaredSlugs(access);
  const stage = action.status?.[0]?.stage;
  const result = {};

  for (const slug of slugs) {
    const verbsDeclared = access[slug] ?? {};
    const links = { view: null, edit: null, review: null, error: null };

    if (kind === "custom") {
      // Part 28: route the author's rendered cells into the per-verb map.
      const stageVerbs = STAGE_VERB_PAGE[stage] ?? {};
      const cell = action[slug] ?? {};

      // Working link → the stage's single active working verb slot (gated on
      // the slug declaring that verb and the stage exposing a page for it).
      const workingVerb = STAGE_WORKING_VERB[stage];
      if (
        workingVerb &&
        workingVerb in verbsDeclared &&
        stageVerbs[workingVerb] &&
        cell.link != null
      ) {
        links[workingVerb] = resolveCellLink(cell.link, action);
      }

      // View slot → author's view_link else the shared {workflow_type}-action
      // page (observer fallback), wherever the stage exposes view and the slug
      // declares it, and the working link has not already claimed the slot
      // (the done-stage precedence: a done.link wins the view slot).
      if (stageVerbs.view && "view" in verbsDeclared && links.view == null) {
        links.view =
          cell.view_link != null
            ? resolveCellLink(cell.view_link, action)
            : {
                pageId: scoped(entryId, `${action.workflow_type}-action`),
                urlQuery: { action_id: action._id },
              };
      }

      result[slug] = links;
      continue;
    }

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
        links.edit = resolveCellLink(startLink, action);
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
          ? `${action.workflow_type}-action`
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
