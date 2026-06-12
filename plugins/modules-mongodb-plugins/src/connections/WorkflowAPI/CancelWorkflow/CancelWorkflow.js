import createEngineContext from '../../shared/phases/createEngineContext.js';
import loadWorkflowState from '../../shared/phases/loadWorkflowState.js';
import planActionTransition from '../../shared/phases/planners/planActionTransition.js';
import planWorkflowRecompute from '../../shared/phases/planners/planWorkflowRecompute.js';
import planEventDispatch from '../../shared/phases/planners/planEventDispatch.js';
import planChangeLog from '../../shared/phases/planners/planChangeLog.js';
import commitPlan from '../../shared/phases/commitPlan.js';
import runTrackerCascade from '../../shared/phases/runTrackerCascade.js';
import throwIfDispatchFailed from '../../shared/phases/throwIfDispatchFailed.js';
import { WorkflowEngineError } from '../../shared/errors.js';

// Fields that may NOT be overwritten by payload.references — they are engine-
// owned on the workflow doc (carried over from the prior handler).
const RESERVED_WORKFLOW_KEYS = [
  '_id',
  'workflow_id',
  'type',
  'workflow_type',
  'entity_id',
  'entity_collection',
  'status',
  'summary',
  'groups',
  'form_data',
  'created',
  'updated',
];

const TERMINAL_STAGES = ['done', 'not-required'];

/**
 * CancelWorkflow handler (design D2/D3/D12; task 17).
 *
 * Restructured into the engine's load → plan → commit (→ tracker cascade)
 * shape. No pre-hook in v1.
 *
 * Load — the whole workflow + all actions via `loadWorkflowState` `{ workflowId }`
 * mode; a missing workflow now throws `workflow_not_found` (an intended
 * tightening over the prior silent no-op).
 *
 * Plan — every NON-terminal action is swept to `not-required` via the FSM
 * signal `internal_cancel_action` (unconditional — no `required_after_close`
 * filter); `done` actions are preserved. The workflow recompute pushes the
 * declared `cancelled` lifecycle entry via `lifecyclePush` (skip-entirely:
 * auto-complete can't fire a phantom `completed`). Event = `workflow-cancelled`
 * (workflow-lifecycle context).
 *
 * Cancel deliberately has NO stage guard (cancelling a completed workflow is
 * unguarded today; kept per "build for what exists").
 */
async function CancelWorkflow(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, event_id, now, newId, user, connection } = context;
  const entry_id = connection.entry_id;

  if (!params.workflow_id) {
    throw new WorkflowEngineError('CancelWorkflow: workflow_id is required', {
      code: 'invalid_params',
    });
  }

  // ── Load (throws workflow_not_found on a missing workflow) ───────────────
  const loadedState = await loadWorkflowState(context, {
    workflowId: params.workflow_id,
  });
  context.loadedState = loadedState; // commitPlan's CAS anchor
  const { workflow, actions, workflowConfig } = loadedState;
  const actionsConfig = workflowConfig.actions ?? [];

  // ── Plan: sweep all non-terminal actions to not-required ─────────────────
  const sweepEntries = [];
  for (const action of actions) {
    const stage = action.status?.[0]?.stage;
    if (TERMINAL_STAGES.includes(stage)) continue; // preserve done / not-required
    const actionConfig = actionsConfig.find((c) => c.type === action.type);
    const planned = planActionTransition({
      action,
      signal: 'internal_cancel_action',
      source: 'cascade',
      actionConfig,
      loadedWorkflow: workflow,
      entry_id,
      event_id,
      now,
      newId,
    });
    if (planned == null) continue; // FSM no-op (structural safety)
    sweepEntries.push(planned);
  }

  // Build the planned view: swept docs substituted in by _id.
  const sweptById = new Map(
    sweepEntries.map((e) => [String(e.doc._id), e.doc]),
  );
  const plannedActions = actions.map(
    (a) => sweptById.get(String(a._id)) ?? a,
  );

  // ── Plan: workflow recompute with the cancelled lifecycle entry ──────────
  const recomputed = planWorkflowRecompute({
    loadedState,
    plannedActions,
    lifecyclePush: { stage: 'cancelled', reason: params.reason },
    event_id,
    now,
  });

  // payload.references merge (minus reserved keys), applied at plan time so the
  // whole-doc $set carries it (CancelWorkflow.js:5–18, 44–47 semantics).
  const safeReferences = { ...(params.references ?? {}) };
  for (const key of RESERVED_WORKFLOW_KEYS) {
    delete safeReferences[key];
  }
  const plannedWorkflowDoc = { ...recomputed, ...safeReferences };

  // ── Plan: lifecycle event (workflow-cancelled) ───────────────────────────
  // Lifecycle override context: { user, workflow, signal } only — no action,
  // status_after, or submitted_form; see planEventDispatch.js:168–175.
  const event = planEventDispatch({
    event_id,
    user,
    handlerType: 'CancelWorkflow',
    signal: 'cancelled',
    plannedWorkflowDoc,
    allTouchedActionDocs: sweepEntries.map((e) => e.doc),
    connection,
    yamlEventOverrides: params.lifecycle_event_override,
  });

  // ── Plan: change-log ─────────────────────────────────────────────────────
  const planWorkflow = {
    doc: plannedWorkflowDoc,
    operation: 'update',
    changeLog: { before: workflow, after: plannedWorkflowDoc },
  };
  const changeLog = planChangeLog({
    planActions: sweepEntries,
    planWorkflow,
    connection,
    lowdefyContext: context.lowdefyContext,
    timestamp: now?.timestamp,
  });

  // ── Plan: tracker fire (parent tracker → not-required), iff has a parent ──
  const trackerFires =
    workflow.parent_action_id != null
      ? [
          {
            parentWorkflowId: workflow.parent_workflow_id,
            parentActionId: workflow.parent_action_id,
            signal: 'internal_mirror_child_cancelled',
          },
        ]
      : [];

  const plan = {
    workflow: planWorkflow,
    actions: sweepEntries,
    event,
    changeLog,
    trackerFires,
    completedGroups: [],
  };

  // ── Commit (CAS-gated update) ────────────────────────────────────────────
  const commitResult = await commitPlan(context, plan);

  // ── Tracker cascade ──────────────────────────────────────────────────────
  const cascade = await runTrackerCascade(plan.trackerFires, context);

  // ── Surface post-commit dispatch failures, last (D9/D13) ─────────────────
  throwIfDispatchFailed({ handlerName: 'CancelWorkflow', commitResult, cascade });

  return {
    action_ids: commitResult.action_ids,
    event_id,
    tracker_fired: cascade.fires,
  };
}

CancelWorkflow.schema = {};
CancelWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CancelWorkflow;
