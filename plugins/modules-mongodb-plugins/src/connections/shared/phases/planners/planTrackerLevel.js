import { WorkflowEngineError } from '../../errors.js';
import planActionTransition from './planActionTransition.js';
import planAutoUnblock from './planAutoUnblock.js';
import planWorkflowRecompute from './planWorkflowRecompute.js';
import planEventDispatch from './planEventDispatch.js';
import planChangeLog from './planChangeLog.js';

/**
 * Plan-phase orchestrator for ONE tracker-cascade level (design D3 / D10 / D12;
 * task 16). The per-level mirror of `planSubmit`: it emits the mirror signal
 * against the parent's target action, then delegates to the SAME planner
 * machinery (planActionTransition → planAutoUnblock → planWorkflowRecompute →
 * planEventDispatch → planChangeLog) to produce the immutable `Plan` the commit
 * phase writes.
 *
 * Differences from `planSubmit`:
 *   - The input is a `{ workflowId }`-mode `LoadedState` — only
 *     `{ workflow, actions, workflowConfig }`, no `targetAction`/`actionConfig`.
 *     This planner RESOLVES its own target: it locates `fire.parentActionId` in
 *     `loadedState.actions` and its config in `workflowConfig.actions`, throwing
 *     `missing_target` when either is gone (the cascade loop owns the permissive
 *     record-and-continue policy — D13).
 *   - The signal is the cascade mirror signal (`internal_mirror_child_active` /
 *     `_completed` / `_cancelled`), planned with `source: 'cascade'` so an FSM
 *     no-op returns `null` instead of throwing. A `null` here means the level
 *     changed nothing — `planTrackerLevel` returns `null` and the cascade loop
 *     skips `commitPlan` entirely (D3: empty plans never reach commit).
 *   - The event is an action event of type `action-internal-mirror-{state}`
 *     (planEventDispatch `handlerType: 'tracker-mirror'`), referencing the one
 *     mirrored action.
 *   - The returned Plan carries a `fired` entry — today's shape
 *     `{ parent_action_id, parent_workflow_id, new_status }` — so the cascade
 *     can accumulate it without re-deriving the FSM-resolved stage.
 *
 * Pure: no I/O; `event_id`, `now`, `newId` are injected per level by the
 * cascade loop (a fresh `event_id` per level, the shared `now`/`newId`).
 *
 * @param {import('../types.js').LoadedState} loadedState — `{ workflowId }`-mode
 *   output: `{ workflow, actions, workflowConfig }`.
 * @param {Object} args
 * @param {string} args.parentActionId — the tracker action on this workflow.
 * @param {string} args.signal — the cascade mirror signal.
 * @param {string} args.event_id — per-level event id (minted per level).
 * @param {{ timestamp: Date, user: Object }} args.now — shared per-request stamp.
 * @param {() => string} [args.newId] — id source (passed through unchanged).
 * @param {Object} args.connection — engine connection config (app_name,
 *   collection names, changeLog) — `{ workflowId }`-mode `loadWorkflowState`
 *   does not return it, so the cascade threads it in from the level context.
 * @param {Object} [args.lowdefyContext] — request context for change-log fields.
 * @returns {import('../types.js').Plan | null} the level's Plan, or `null` when
 *   the mirror signal FSM-no-ops against the parent's target action.
 */
function planTrackerLevel(
  loadedState,
  { parentActionId, signal, event_id, now, newId, connection, lowdefyContext },
) {
  const { workflow, actions, workflowConfig } = loadedState;
  const entry_id = connection?.entry_id;
  const actionsConfig = workflowConfig.actions ?? [];
  const declaredGroups = workflowConfig.action_groups ?? [];

  // ── Resolve the target tracker action + its config ───────────────────────
  const targetAction = actions.find(
    (a) => String(a._id) === String(parentActionId),
  );
  const actionConfig = targetAction
    ? actionsConfig.find((c) => c.type === targetAction.type)
    : undefined;
  if (!targetAction || !actionConfig) {
    throw new WorkflowEngineError(
      `planTrackerLevel: parent action ${parentActionId} ${
        !targetAction ? 'not found on' : 'has no config in'
      } workflow ${workflow._id} (${workflow.workflow_type}) — dangling tracker parent reference.`,
      { code: 'missing_target' },
    );
  }

  // ── Mirror transition (source: 'cascade' → FSM no-op returns null) ────────
  const targetEntry = planActionTransition({
    action: targetAction,
    signal,
    source: 'cascade',
    payload: {},
    actionConfig,
    loadedWorkflow: workflow,
    entry_id,
    event_id,
    now,
    newId,
  });
  if (targetEntry == null) return null; // FSM no-op — skip the level (D3)

  // ── Auto-unblock fixpoint over the planned view ──────────────────────────
  const plannedView = actions.map((a) =>
    String(a._id) === String(targetEntry.doc._id) ? targetEntry.doc : a,
  );
  const unblockEntries = planAutoUnblock({
    actions: plannedView,
    actionsConfig,
    declaredGroups,
    loadedWorkflow: workflow,
    entry_id,
    event_id,
    now,
  });

  const allActionEntries = [targetEntry, ...unblockEntries];
  const allPlannedById = new Map(
    allActionEntries.map((e) => [String(e.doc._id), e.doc]),
  );
  const plannedActions = actions.map(
    (a) => allPlannedById.get(String(a._id)) ?? a,
  );

  // ── Workflow recompute ───────────────────────────────────────────────────
  const plannedWorkflowDoc = planWorkflowRecompute({
    loadedState,
    plannedActions,
    event_id,
    now,
  });

  // ── Mirror event (action-event context; single mirrored action) ──────────
  const status_before = targetAction.status?.[0]?.stage ?? null;
  const status_after = targetEntry.doc.status?.[0]?.stage;
  const event = planEventDispatch({
    event_id,
    user: now?.user,
    handlerType: 'tracker-mirror',
    signal,
    plannedWorkflowDoc,
    plannedActionDoc: targetEntry.doc,
    status_before,
    status_after,
    allTouchedActionDocs: [targetEntry.doc],
    connection,
  });

  // ── Change-log ───────────────────────────────────────────────────────────
  const planWorkflow = {
    doc: plannedWorkflowDoc,
    operation: 'update',
    changeLog: { before: workflow, after: plannedWorkflowDoc },
  };
  const changeLog = planChangeLog({
    planActions: allActionEntries,
    planWorkflow,
    connection,
    lowdefyContext,
    timestamp: now?.timestamp,
  });

  // ── Next-level fires (iff this level pushed `completed` AND has a parent) ──
  const loadedStage = workflow.status?.[0]?.stage;
  const plannedStage = plannedWorkflowDoc.status?.[0]?.stage;
  const pushedCompleted =
    plannedStage === 'completed' && loadedStage !== 'completed';
  const trackerFires =
    pushedCompleted && workflow.parent_action_id != null
      ? [
          {
            parentWorkflowId: workflow.parent_workflow_id,
            parentActionId: workflow.parent_action_id,
            signal: 'internal_mirror_child_completed',
          },
        ]
      : [];

  // ── The level's fired entry (today's shape; FSM-resolved new_status) ──────
  const fired = {
    parent_action_id: targetAction._id,
    parent_workflow_id: workflow._id,
    new_status: status_after,
  };

  return {
    workflow: planWorkflow,
    actions: allActionEntries,
    event,
    changeLog,
    trackerFires,
    completedGroups: [],
    fired,
  };
}

export default planTrackerLevel;
