import planActionTransition from "./planActionTransition.js";
import recomputeGroups from "./recomputeGroups.js";

const TERMINAL = ["done", "not-required"];

/**
 * Auto-unblock ⇄ group-recompute fixpoint over the in-progress action plan
 * (design D4). When the planned transitions satisfy a blocked action's
 * `blocked_by`, the dependent action gains an `unblock` signal, resolved
 * through the FSM (`blocked` → `action-required`) as a full transition via
 * `planActionTransition` — new status[] entry (reusing the per-invocation
 * `event_id` / `now`), re-rendered cell, recomputed links, change-log delta.
 *
 * Each `blocked_by` entry is satisfied iff:
 *   - (action type) every doc of that type in the planned view is terminal —
 *     the keyed-action rule: a type isn't terminal until all its keyed
 *     instances are; or
 *   - (group id, declared in `action_groups[]`) the group's *recomputed*
 *     planned status is `done`;
 *   - (neither) defensive false — the build-time validator rejects unresolved
 *     entries; this branch only fires if it was bypassed.
 *
 * Unblock-only / monotonic: the engine never auto-emits `block` on dep
 * regression — pre-hook `block` entries arrive via `preHookResult.actions[]`
 * and are planned upstream, not here. Termination is structural: each action
 * unblocks at most once (`unblock` lands `action-required`, which has no
 * `unblock` entry), so the loop runs at most N iterations for N actions.
 *
 * Returns only the fired-unblock plan entries; the final group recompute that
 * feeds the workflow doc is `planWorkflowRecompute`'s job (task 11) — both
 * import the shared `recomputeGroups` helper, keeping the planners
 * independent.
 *
 * Pure: no I/O.
 *
 * @param {Object} args
 * @param {Object[]} args.actions — current planned view: every action doc on
 *   the workflow with already-planned transitions substituted in.
 * @param {Object[]} args.actionsConfig — workflowConfig.actions.
 * @param {Array<{ id: string }>} [args.declaredGroups] —
 *   workflowConfig.action_groups.
 * @param {Object} args.loadedWorkflow
 * @param {string} args.entry_id
 * @param {string} args.event_id
 * @param {{ timestamp: Date, user: Object }} args.now
 * @returns {Array<{ doc: Object, operation: 'update',
 *   changeLog: { before: Object, after: Object } }>}
 */
function planAutoUnblock({
  actions,
  actionsConfig,
  declaredGroups = [],
  loadedWorkflow,
  entry_id,
  event_id,
  now,
}) {
  const declaredGroupIds = new Set((declaredGroups ?? []).map((g) => g.id));
  const actionTypes = new Set(actionsConfig.map((cfg) => cfg.type));

  let view = [...actions];
  const fired = [];

  for (;;) {
    const groups = recomputeGroups({ declaredGroups, actions: view });
    const groupById = new Map(groups.map((g) => [g.id, g]));

    const terminalByType = new Map();
    for (const action of view) {
      const isTerminal = TERMINAL.includes(action.status?.[0]?.stage);
      if (!terminalByType.has(action.type)) {
        terminalByType.set(action.type, isTerminal);
      } else if (!isTerminal) {
        terminalByType.set(action.type, false);
      }
    }

    const satisfied = (entry) => {
      if (declaredGroupIds.has(entry)) {
        return groupById.get(entry)?.status === "done";
      }
      if (actionTypes.has(entry)) {
        return terminalByType.get(entry) === true;
      }
      return false;
    };

    const candidates = view.filter((action) => {
      if (action.status?.[0]?.stage !== "blocked") return false;
      const cfg = actionsConfig.find((c) => c.type === action.type);
      const blockedBy = cfg?.blocked_by ?? [];
      return blockedBy.length > 0 && blockedBy.every(satisfied);
    });

    if (candidates.length === 0) return fired;

    for (const candidate of candidates) {
      const entry = planActionTransition({
        action: candidate,
        signal: "unblock",
        source: "cascade",
        payload: {},
        actionConfig: actionsConfig.find((c) => c.type === candidate.type),
        loadedWorkflow,
        entry_id,
        event_id,
        now,
      });
      if (entry == null) continue; // FSM structural no-op
      fired.push(entry);
      view = view.map((a) => (a._id === candidate._id ? entry.doc : a));
    }
  }
}

export default planAutoUnblock;
