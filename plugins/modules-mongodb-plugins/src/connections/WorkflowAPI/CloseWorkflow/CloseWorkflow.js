import createEngineContext from "../../shared/phases/createEngineContext.js";
import loadWorkflowState from "../../shared/phases/loadWorkflowState.js";
import planActionTransition from "../../shared/phases/planners/planActionTransition.js";
import planWorkflowRecompute from "../../shared/phases/planners/planWorkflowRecompute.js";
import planEventDispatch from "../../shared/phases/planners/planEventDispatch.js";
import planChangeLog from "../../shared/phases/planners/planChangeLog.js";
import commitPlan from "../../shared/phases/commitPlan.js";
import runTrackerCascade from "../../shared/phases/runTrackerCascade.js";
import throwIfDispatchFailed from "../../shared/phases/throwIfDispatchFailed.js";
import { WorkflowEngineError } from "../../shared/errors.js";

// Fields that may NOT be overwritten by payload.references — engine-owned on
// the workflow doc (carried over from the prior handler).
const RESERVED_WORKFLOW_KEYS = [
  "_id",
  "workflow_id",
  "type",
  "workflow_type",
  "entity",
  "status",
  "form_data",
  "created",
  "updated",
];

const TERMINAL_STAGES = ["done", "not-required"];

/**
 * CloseWorkflow handler (design D2/D3/D12; task 17).
 *
 * Same load → plan → commit (→ tracker cascade) shape as CancelWorkflow, with
 * two deltas:
 *   - Close pushes `completed` (not `closed`; `closed` is not a workflow stage,
 *     and every `status.0.stage === 'completed'` consumer depends on it).
 *   - Close's sweep keeps the `required_after_close` exception: it sweeps only
 *     non-terminal actions where `required_after_close !== true` OR currently
 *     `blocked` (the blocked-action exception). Survivors stay at their stage,
 *     keeping the post-close submit carve-out reachable (D2 / task 9).
 *
 * Lifecycle preconditions (carried over): Close on a `completed` workflow is an
 * idempotent no-op (returns the empty result, mints no event, fires nothing);
 * Close on a `cancelled` workflow throws `stage_rejects_close`.
 */
async function CloseWorkflow(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, event_id, now, newId, user, connection } = context;
  const entry_id = connection.entry_id;

  if (!params.workflow_id) {
    throw new WorkflowEngineError("CloseWorkflow: workflow_id is required", {
      code: "invalid_params",
    });
  }

  // ── Load (throws workflow_not_found on a missing workflow) ───────────────
  const loadedState = await loadWorkflowState(context, {
    workflowId: params.workflow_id,
  });
  const { workflow, actions, workflowConfig } = loadedState;
  const actionsConfig = workflowConfig.actions ?? [];

  // ── Lifecycle preconditions ──────────────────────────────────────────────
  const currentStage = workflow.status?.[0]?.stage;
  if (currentStage === "completed") {
    // Idempotent no-op — returns before commit, so no event and no fires.
    return { action_ids: [], event_id: null, tracker_fired: [] };
  }
  if (currentStage === "cancelled") {
    throw new WorkflowEngineError(
      `CloseWorkflow: workflow ${params.workflow_id} is cancelled; cannot close`,
      { code: "stage_rejects_close" },
    );
  }

  context.loadedState = loadedState; // commitPlan's CAS anchor

  const requiredAfterCloseByType = Object.fromEntries(
    actionsConfig.map((a) => [a.type, a.required_after_close === true]),
  );

  // ── Plan: sweep non-terminal actions with the required_after_close exception
  const sweepEntries = [];
  for (const action of actions) {
    const stage = action.status?.[0]?.stage;
    if (TERMINAL_STAGES.includes(stage)) continue; // preserve done / not-required
    const isBlocked = stage === "blocked";
    const requiredAfterClose = requiredAfterCloseByType[action.type] === true;
    // Sweep when not protected, OR when blocked (blocked-action exception).
    if (requiredAfterClose && !isBlocked) continue; // survivor stays at its stage
    const actionConfig = actionsConfig.find((c) => c.type === action.type);
    const planned = planActionTransition({
      action,
      signal: "internal_cancel_action",
      source: "cascade",
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

  const sweptById = new Map(
    sweepEntries.map((e) => [String(e.doc._id), e.doc]),
  );
  const plannedActions = actions.map((a) => sweptById.get(String(a._id)) ?? a);

  // ── Plan: workflow recompute with the completed lifecycle entry ──────────
  // Close pushes `completed` regardless of survivors (skip-entirely semantics).
  const recomputed = planWorkflowRecompute({
    loadedState,
    plannedActions,
    lifecyclePush: { stage: "completed", reason: params.reason },
    event_id,
    now,
  });

  const safeReferences = { ...(params.references ?? {}) };
  for (const key of RESERVED_WORKFLOW_KEYS) {
    delete safeReferences[key];
  }
  const plannedWorkflowDoc = { ...recomputed, ...safeReferences };

  // ── Plan: lifecycle event (workflow-closed) ──────────────────────────────
  // Lifecycle override context: { user, workflow, signal } only — no action,
  // status_after, or submitted_form; see planEventDispatch.js:168–175.
  const event = planEventDispatch({
    event_id,
    user,
    handlerType: "CloseWorkflow",
    signal: "closed",
    plannedWorkflowDoc,
    allTouchedActionDocs: sweepEntries.map((e) => e.doc),
    connection,
    yamlEventOverrides: params.lifecycle_event_override,
  });

  // ── Plan: change-log ─────────────────────────────────────────────────────
  const planWorkflow = {
    doc: plannedWorkflowDoc,
    operation: "update",
    changeLog: { before: workflow, after: plannedWorkflowDoc },
  };
  const changeLog = planChangeLog({
    planActions: sweepEntries,
    planWorkflow,
    connection,
    lowdefyContext: context.lowdefyContext,
    timestamp: now?.timestamp,
  });

  // ── Plan: tracker fire (parent tracker → done; close is forced completion) ─
  const trackerFires =
    workflow.parent_action_id != null
      ? [
          {
            parentWorkflowId: workflow.parent_workflow_id,
            parentActionId: workflow.parent_action_id,
            signal: "internal_mirror_child_completed",
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
  throwIfDispatchFailed({
    handlerName: "CloseWorkflow",
    commitResult,
    cascade,
  });

  return {
    action_ids: commitResult.action_ids,
    event_id,
    tracker_fired: cascade.fires,
  };
}

CloseWorkflow.schema = {};
CloseWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CloseWorkflow;
