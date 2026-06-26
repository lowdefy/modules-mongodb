/**
 * Substitutes the `{ action_id: true }` sentinel in `kind: custom` author-
 * authored cell links with the real action UUID (Part 30 D5).
 *
 * Authors write `urlQuery: { action_id: true }` so the cell config need not know
 * the action's UUID at authoring time. After rendering, the engine swaps any
 * `action_id: true` for the concrete `_id`. Built-in kinds don't use this — the
 * engine builds their `urlQuery` directly with the UUID (computeEngineLinks).
 *
 * Pure: returns a new tree, does not mutate the input.
 */
function substituteActionIdSentinel(node, actionId) {
  if (Array.isArray(node)) {
    return node.map((n) => substituteActionIdSentinel(n, actionId));
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "action_id" && v === true) {
        out[k] = actionId;
      } else {
        out[k] = substituteActionIdSentinel(v, actionId);
      }
    }
    return out;
  }
  return node;
}

export default substituteActionIdSentinel;
