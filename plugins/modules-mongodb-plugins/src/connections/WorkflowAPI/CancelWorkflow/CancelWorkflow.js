import createEngineContext from "../../shared/phases/createEngineContext.js";
import loadWorkflowState from "../../shared/phases/loadWorkflowState.js";
import terminateWorkflow from "../shared/terminateWorkflow.js";
import { WorkflowEngineError } from "../../shared/errors.js";

/**
 * CancelWorkflow handler (design D2/D3/D12; task 17).
 *
 * Load → plan → commit (→ tracker cascade), sharing the termination tail with
 * CloseWorkflow via `terminateWorkflow`. No pre-hook in v1.
 *
 * Load — the whole workflow + all actions via `loadWorkflowState` `{ workflowId }`
 * mode; a missing workflow throws `workflow_not_found` (an intended tightening
 * over the prior silent no-op).
 *
 * Plan — every NON-terminal action is swept to `not-required` (unconditional —
 * no `required_after_close` filter); `done` actions are preserved. The workflow
 * recompute pushes the declared `cancelled` lifecycle entry. Event =
 * `workflow-cancelled` (workflow-lifecycle context).
 *
 * Cancel deliberately has NO stage guard (cancelling a completed workflow is
 * unguarded today; kept per "build for what exists").
 */
async function CancelWorkflow(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params } = context;

  if (!params.workflow_id) {
    throw new WorkflowEngineError("CancelWorkflow: workflow_id is required", {
      code: "invalid_params",
    });
  }

  // ── Load (throws workflow_not_found on a missing workflow) ───────────────
  const loadedState = await loadWorkflowState(context, {
    workflowId: params.workflow_id,
  });
  context.loadedState = loadedState; // commitPlan's CAS anchor

  // ── Plan + commit + tracker cascade (shared termination tail) ────────────
  return terminateWorkflow(context, {
    handlerName: "CancelWorkflow",
    signal: "cancelled",
    lifecycleStage: "cancelled",
    trackerSignal: "internal_mirror_child_cancelled",
    // Sweep every non-terminal action — no exceptions on Cancel.
  });
}

CancelWorkflow.schema = {};
CancelWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CancelWorkflow;
