/**
 * Gate for the `upsert: true` path: returns `true` when no action doc exists
 * for the entry's `(type, key)` triple AND the entry opts into `upsert: true`.
 *
 * Used by the per-entry write loop in step 4 to branch between an update
 * path (call `updateAction`) and an insert path (call `createAction`). The
 * insert path is only exercised by pre-hook returns (part 9) — v1 never
 * returns `true` here because pre-hook entries don't exist in part 6.
 *
 * @param {Object} args
 * @param {Object} args.actionEntry — `{ type, key?, status, fields?, upsert?, force? }`.
 * @param {Array<Object>} args.fetchedActions — actions matching `(workflow_id, type, key)`.
 *   Empty array (or null/undefined) means no doc exists yet for this triple.
 * @returns {boolean}
 */
function shouldCreate({ actionEntry, fetchedActions }) {
  return (!fetchedActions || fetchedActions.length === 0) && actionEntry.upsert === true;
}

export default shouldCreate;
