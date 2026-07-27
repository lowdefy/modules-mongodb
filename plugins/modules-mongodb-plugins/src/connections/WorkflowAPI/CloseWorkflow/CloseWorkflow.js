import createEngineContext from "../../shared/phases/createEngineContext.js";
import loadWorkflowState from "../../shared/phases/loadWorkflowState.js";
import terminateWorkflow from "../shared/terminateWorkflow.js";
import { WorkflowEngineError } from "../../shared/errors.js";

/**
 * CloseWorkflow handler (design D2/D3/D12; task 17).
 *
 * Same load → plan → commit (→ tracker cascade) shape as CancelWorkflow —
 * shared via `terminateWorkflow` — with two deltas:
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
  const { params } = context;

  if (!params.workflow_id) {
    throw new WorkflowEngineError("CloseWorkflow: workflow_id is required", {
      code: "invalid_params",
    });
  }

  // ── Load (throws workflow_not_found on a missing workflow) ───────────────
  const loadedState = await loadWorkflowState(context, {
    workflowId: params.workflow_id,
  });
  const { workflow, workflowConfig } = loadedState;

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
    (workflowConfig.actions ?? []).map((a) => [
      a.type,
      a.required_after_close === true,
    ]),
  );

  // ── Plan + commit + tracker cascade (shared termination tail) ────────────
  return terminateWorkflow(context, {
    handlerName: "CloseWorkflow",
    signal: "closed",
    // Close pushes `completed` regardless of survivors (skip-entirely semantics).
    lifecycleStage: "completed",
    // Close is forced completion → parent tracker mirrors to done.
    trackerSignal: "internal_mirror_child_completed",
    // Sweep when not protected, OR when blocked (blocked-action exception).
    shouldSweep: (action, stage) =>
      !requiredAfterCloseByType[action.type] || stage === "blocked",
  });
}

CloseWorkflow.schema = {};
CloseWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CloseWorkflow;
