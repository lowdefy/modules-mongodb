/**
 * makeWorkflowOrderComparator — the single source of truth for action display
 * order across every read engine (Part 54).
 *
 * Orders action docs by their declaration position in the workflow config:
 *   1. group declaration index — position in cfg.action_groups[]
 *   2. not-required sink       — not-required actions drop to the bottom of
 *                                their own group (after groupIndex, so groups
 *                                stay contiguous; D4)
 *   3. action declaration index — position in cfg.actions[]
 *   4. key                     — distinguishes keyed siblings sharing a type
 *   5. _id                     — final determinism when all else ties
 *
 * Config is resolved per action via `action.workflow_type`, so the comparator
 * works whether the caller holds one workflow (overview / entity / group
 * overview) or many (the timeline aggregates events across all of an entity's
 * workflows). Actions with no resolvable config — unknown group, removed action
 * type, or a non-workflow card with no `workflow_type` — sort last (∞),
 * deterministically.
 *
 * Reads `action.status` tolerantly: the raw array doc shape (`[{ stage }]`,
 * passed by GetWorkflowOverview / GetEntityWorkflows /
 * GetWorkflowActionGroupOverview) and the scalar stage the timeline's $lookup
 * has already rewritten.
 *
 * Nothing here crosses the wire — engines emit plain pre-ordered card arrays.
 *
 * @param {Array<{ type: string, action_groups?: Array<{ id: string }>, actions?: Array<{ type: string }> }>} workflowsConfig
 * @returns {(a: object, b: object) => number} comparator over action docs
 */
const INF = Number.POSITIVE_INFINITY;

export function makeWorkflowOrderComparator(workflowsConfig) {
  const configs = Array.isArray(workflowsConfig) ? workflowsConfig : [];

  function keyOf(action) {
    const cfg = configs.find((wc) => wc.type === action.workflow_type);
    const groups = cfg?.action_groups ?? [];
    const actions = cfg?.actions ?? [];
    // findIndex → -1 (unknown group / removed action type / no config) sorts last.
    const groupIndex = cfg ? groups.findIndex((g) => g.id === action.action_group) : -1;
    const declIndex = cfg ? actions.findIndex((a) => a.type === action.type) : -1;
    const stage = Array.isArray(action.status) ? action.status[0]?.stage : action.status;
    const notRequired = stage === 'not-required' ? 1 : 0;
    return [
      groupIndex === -1 ? INF : groupIndex,
      notRequired,
      declIndex === -1 ? INF : declIndex,
      action.key ?? '',
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
