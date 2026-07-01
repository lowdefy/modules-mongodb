/**
 * makeWorkflowOrderComparator — the single source of truth for action display
 * order across every read engine (Part 54).
 *
 * Orders action docs by their declaration position in the workflow config:
 *   1. group declaration index — denormalised `action.group_index`
 *   2. not-required sink       — not-required actions drop to the bottom of
 *                                their own group (after groupIndex, so groups
 *                                stay contiguous; D4)
 *   3. action declaration index — denormalised `action.decl_index`
 *   4. key                     — distinguishes keyed siblings sharing a type
 *   5. _id                     — final determinism when all else ties
 *
 * The two declaration indices are read straight off the action doc: they are
 * denormalised at write time by planActionTransition.js and computed at build
 * time by makeWorkflowsConfig, so the comparator needs no workflows config and
 * works whether the caller holds one workflow (overview / entity / group
 * overview) or many (the timeline aggregates events across all of an entity's
 * workflows). An index that is `-1`, `null`, or `undefined` — an action written
 * before the field existed, or one with no resolvable group — sorts last (∞),
 * deterministically, then by `_id`.
 *
 * Reads `action.status` tolerantly: the raw array doc shape (`[{ stage }]`,
 * passed by GetWorkflowOverview / GetEntityWorkflows /
 * GetWorkflowActionGroupOverview) and the scalar stage the timeline's $lookup
 * has already rewritten.
 *
 * Nothing here crosses the wire — engines emit plain pre-ordered card arrays.
 *
 * @returns {(a: object, b: object) => number} comparator over action docs
 */
const INF = Number.POSITIVE_INFINITY;

export function makeWorkflowOrderComparator() {
  function keyOf(action) {
    // Denormalised declaration indices; -1 / null / undefined sorts last.
    const groupIndex = action.group_index ?? -1;
    const declIndex = action.decl_index ?? -1;
    const stage = Array.isArray(action.status)
      ? action.status[0]?.stage
      : action.status;
    const notRequired = stage === "not-required" ? 1 : 0;
    return [
      groupIndex === -1 ? INF : groupIndex,
      notRequired,
      declIndex === -1 ? INF : declIndex,
      action.key ?? "",
      String(action._id),
    ];
  }

  return function compare(a, b) {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  };
}

export default makeWorkflowOrderComparator;
