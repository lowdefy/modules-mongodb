import planActionTransition from './planners/planActionTransition.js';
import planAutoUnblock from './planners/planAutoUnblock.js';
import planFormDataMerge from './planners/planFormDataMerge.js';
import planWorkflowRecompute from './planners/planWorkflowRecompute.js';
import planEventDispatch from './planners/planEventDispatch.js';
import planChangeLog from './planners/planChangeLog.js';
import { WorkflowEngineError } from '../errors.js';

/**
 * Plan-phase orchestrator for SubmitWorkflowAction (design D3; task 15).
 *
 * Composes the pure planners (tasks 10–12) into the immutable `Plan` the commit
 * phase writes. No I/O, no id/clock minting — `event_id`, `now`, `newId`, and
 * the request-context fields are minted once at handler entry
 * (`createEngineContext`, task 15) and threaded in.
 *
 * Step order mirrors the task spec:
 *   1. Compose the transition-entry list (current action `source: 'user'` +
 *      one entry per pre-hook auxiliary action `source: 'auxiliary'`).
 *   2. planActionTransition per entry (signal resolution + source-aware
 *      throw/no-op live inside the planner).
 *   3. planAutoUnblock fixpoint.
 *   4. planFormDataMerge → planWorkflowRecompute.
 *   5. completedGroups diff (loaded groups vs planned groups, `on_complete` join).
 *   6. (folded into planActionTransition — doc/cell/links composed per action.)
 *   7. planEventDispatch (action-event context).
 *   8. planChangeLog.
 *   9. trackerFires (iff workflow auto-completed AND has a parent).
 *  10. Assemble the Plan.
 *
 * @param {Object} args
 * @param {import('./types.js').LoadedState} args.loadedState
 * @param {import('./types.js').PreHookResult} args.preHookResult
 * @param {Object} args.context — engine context (event_id, now, newId,
 *   connection, params, user, lowdefyContext, …).
 * @returns {import('./types.js').Plan}
 */
function planSubmit({ loadedState, preHookResult, context }) {
  const { workflow, actions, workflowConfig, actionConfig, targetAction } =
    loadedState;
  const { event_id, now, newId, connection, params, user } = context;
  const entry_id = connection.entry_id;
  const actionsConfig = workflowConfig.actions ?? [];
  const declaredGroups = workflowConfig.action_groups ?? [];

  const findActionConfig = (type) => actionsConfig.find((c) => c.type === type);

  // ── Step 1 — compose the transition-entry list ───────────────────────────
  // The user's own action first (`source: 'user'`), then one entry per pre-hook
  // auxiliary action (`source: 'auxiliary'`), each carrying its upsert/key and
  // its optional fields/metadata data-seeding bag as payload.fields/metadata.
  const entries = [
    {
      source: 'user',
      action: targetAction,
      actionConfig,
      signal: params.signal,
      upsert: false,
      key: targetAction.key ?? null,
      payload: { fields: params.fields, metadata: params.metadata },
    },
  ];

  for (const aux of preHookResult.actions ?? []) {
    const auxKey = aux.key ?? null;
    // Resolve the auxiliary target doc: by action_id, else by (type, key).
    const auxAction =
      aux.action_id != null
        ? actions.find((a) => String(a._id) === String(aux.action_id))
        : actions.find(
            (a) => a.type === aux.type && (a.key ?? null) === auxKey,
          );
    const auxType = aux.type ?? auxAction?.type;
    const auxConfig = findActionConfig(auxType);
    if (!auxConfig) {
      throw new WorkflowEngineError(
        `planSubmit: pre-hook auxiliary action targets type "${auxType}" which is not in workflow "${workflow.workflow_type}" config.`,
        { code: 'action_not_found' },
      );
    }
    entries.push({
      source: 'auxiliary',
      action: auxAction,
      actionConfig: auxConfig,
      signal: aux.signal,
      upsert: aux.upsert === true,
      key: auxKey,
      payload: { fields: aux.fields, metadata: aux.metadata },
    });
  }

  // ── Step 2 — plan each transition ────────────────────────────────────────
  // planActionTransition resolves the signal internally (takes signal + source)
  // and returns null for auxiliary/cascade structural no-ops.
  const transitionEntries = [];
  let targetActionEntry = null;
  for (const entry of entries) {
    const planned = planActionTransition({
      action: entry.action,
      signal: entry.signal,
      source: entry.source,
      payload: entry.payload,
      actionConfig: entry.actionConfig,
      loadedWorkflow: workflow,
      entry_id,
      upsert: entry.upsert,
      key: entry.key,
      event_id,
      now,
      newId,
    });
    if (planned == null) continue; // auxiliary/cascade FSM no-op
    transitionEntries.push(planned);
    if (entry.source === 'user') {
      targetActionEntry = planned;
    }
  }

  // ── Step 3 — auto-unblock fixpoint ───────────────────────────────────────
  // Build the planned view: every action doc on the workflow with the planned
  // transitions substituted in (matched by _id; inserts appended).
  const plannedById = new Map(
    transitionEntries.map((e) => [String(e.doc._id), e.doc]),
  );
  let plannedView = actions.map(
    (a) => plannedById.get(String(a._id)) ?? a,
  );
  for (const e of transitionEntries) {
    if (e.operation === 'insert') plannedView.push(e.doc);
  }

  const unblockEntries = planAutoUnblock({
    actions: plannedView,
    actionsConfig,
    declaredGroups,
    loadedWorkflow: workflow,
    entry_id,
    event_id,
    now,
  });

  // Fold the unblock transitions into the planned view + the touched-entry list.
  const allActionEntries = [...transitionEntries, ...unblockEntries];
  const allPlannedById = new Map(
    allActionEntries.map((e) => [String(e.doc._id), e.doc]),
  );
  let plannedActions = actions.map(
    (a) => allPlannedById.get(String(a._id)) ?? a,
  );
  for (const e of allActionEntries) {
    if (e.operation === 'insert') plannedActions.push(e.doc);
  }

  // ── Step 4 — form-data merge → workflow recompute ────────────────────────
  const { form_data, submitted_form } = planFormDataMerge({
    params,
    preHookResult,
    loadedState,
  });

  const plannedWorkflowDoc = planWorkflowRecompute({
    loadedState,
    plannedActions,
    formData: form_data,
    event_id,
    now,
  });

  // ── Step 5 — completed_groups diff (loaded groups vs planned groups) ─────
  const loadedGroupById = new Map(
    (workflow.groups ?? []).map((g) => [g.id, g]),
  );
  const completedGroups = [];
  for (const planned of plannedWorkflowDoc.groups ?? []) {
    const before = loadedGroupById.get(planned.id);
    if (planned.status === 'done' && before?.status !== 'done') {
      const cfg = declaredGroups.find((g) => g.id === planned.id);
      completedGroups.push({
        workflow_id: workflow._id,
        id: planned.id,
        on_complete: cfg?.on_complete ?? null,
      });
    }
  }

  // ── Step 7 — event dispatch (action-event context) ───────────────────────
  const plannedTargetDoc = targetActionEntry?.doc ?? targetAction;
  const event = planEventDispatch({
    event_id,
    user,
    handlerType: 'SubmitWorkflowAction',
    signal: params.signal,
    plannedWorkflowDoc,
    plannedActionDoc: plannedTargetDoc,
    status_before: targetAction.status?.[0]?.stage ?? null,
    status_after: plannedTargetDoc.status?.[0]?.stage,
    submitted_form,
    allTouchedActionDocs: allActionEntries.map((e) => e.doc),
    connection,
    comment: params.comment,
    yamlEventOverrides: actionConfig.event_overrides?.[params.signal],
    preHookEventOverrides: preHookResult.event_overrides,
  });

  // ── Step 8 — change-log ──────────────────────────────────────────────────
  const planWorkflow = {
    doc: plannedWorkflowDoc,
    operation: 'update',
    changeLog: { before: workflow, after: plannedWorkflowDoc },
  };
  const changeLog = planChangeLog({
    planActions: allActionEntries,
    planWorkflow,
    connection,
    lowdefyContext: context.lowdefyContext,
    timestamp: now?.timestamp,
  });

  // ── Step 9 — tracker fires ───────────────────────────────────────────────
  // Iff planWorkflowRecompute pushed `completed` AND the loaded workflow has a
  // parent. Both ids read off the loaded workflow doc (no cross-workflow read).
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

  // ── Step 10 — assemble the Plan ──────────────────────────────────────────
  return {
    workflow: planWorkflow,
    actions: allActionEntries,
    event,
    changeLog,
    trackerFires,
    completedGroups,
  };
}

export default planSubmit;
