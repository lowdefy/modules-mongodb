// The default UI presence list for an action's universal fields.
//
// KEPT IN LOCK-STEP with `normalizeUniversalFields` in
// `modules/workflows/resolvers/makeActionPages.js` — the resolver normalizes the
// authored value at BUILD time for the per-action form pages; this module does
// the same at READ time for the check surfaces, which are shared across actions
// and so cannot resolve it at build time (see below). The two must agree, or a
// form page and a check page would disagree about the same action.
const UNIVERSAL_FIELDS_DEFAULT = ["assignees", "due_date"];

/**
 * Normalize an action's authored `universal_fields` declaration to a concrete
 * array, so consumers always see a (possibly empty) list with no type juggling.
 *
 *   undefined → ['assignees', 'due_date']   (author declared nothing → both)
 *   false     → []                          (author opted out of all)
 *   array     → as-is                       (already validated by
 *                                            makeWorkflowsConfig)
 *
 * WHY THIS IS READ AT REQUEST TIME, NOT PERSISTED
 *
 * `universal_fields` is a UI presence declaration that lives on `actionConfig`
 * (author config), NOT on the action doc — the same category as Part 64's
 * `description`. Resolving it per read means an author's change to the workflow
 * YAML applies immediately to in-flight actions; a create-time materialisation
 * onto the doc would go stale the moment the declaration changed and would owe a
 * migration to repair. There is nothing to persist.
 *
 * WHY THE CHECK SURFACES NEED IT ON THE ENVELOPE AT ALL
 *
 * Form actions get per-action pages, so `makeActionPages` bakes the resolved
 * list into each page's `action_config` at build time. Neither check surface can
 * do that: the check page is emitted once per workflow TYPE and serves every
 * check action via `?action_id`, and the in-context `check-action-modal` is a
 * module component dropped by host entity pages with no action identity at build
 * time at all. Both learn which action they are showing only from this envelope.
 *
 * @param {unknown} value — `actionConfig.universal_fields` as authored.
 * @returns {string[]} concrete presence list.
 */
function resolveUniversalFields(value) {
  if (value === undefined) return [...UNIVERSAL_FIELDS_DEFAULT];
  if (value === false) return [];
  return value;
}

export default resolveUniversalFields;
