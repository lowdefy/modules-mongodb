/**
 * Keys the engine owns on its documents. Client-supplied bags that are merged
 * onto a stored doc (a user submit's `fields`, Cancel/Close `references`) are
 * stripped of these keys before the merge: the doc is written back with a
 * whole-doc `$set` filtered by `_id`, so any one of them would let a caller
 * redirect the write to another doc, skip the state machine, or re-link the
 * doc to another workflow, group or parent.
 *
 * The tenant field is not listed here — it is dynamic, and the mongo wrappers
 * pin it on every update (`stampUpdate` in mongo/tenantScope.js).
 */

export const ENGINE_OWNED_ACTION_KEYS = [
  "_id",
  "workflow_id",
  "workflow_type",
  "type",
  "kind",
  "key",
  "action_group",
  "status",
  "entity",
  "access",
  "tracker",
  "child_workflow_id",
  "child_entity",
  "title",
  "group_index",
  "decl_index",
  "created",
  "updated",
];

export const ENGINE_OWNED_WORKFLOW_KEYS = [
  "_id",
  "workflow_id",
  "type",
  "workflow_type",
  "title",
  "key",
  "display_order",
  "entity",
  "status",
  "form_data",
  "parent_action_id",
  "parent_workflow_id",
  "parent_entity",
  "created",
  "updated",
];

/**
 * Copy `bag` without the given keys. A null/undefined bag yields `{}`.
 *
 * @param {Object | null | undefined} bag
 * @param {string[]} keys
 * @returns {Object}
 */
export function omitKeys(bag, keys) {
  const result = { ...(bag ?? {}) };
  for (const key of keys) delete result[key];
  return result;
}
