import loadWorkflowState from '../../shared/phases/loadWorkflowState.js';
import invokePreHook from '../../shared/phases/invokePreHook.js';
import planSubmit from '../../shared/phases/planSubmit.js';
import commitPlan from '../../shared/phases/commitPlan.js';
import invokePostHook from '../../shared/phases/invokePostHook.js';
import runTrackerCascade from '../../shared/phases/runTrackerCascade.js';
import { WorkflowEngineError } from '../../shared/errors.js';

/**
 * SubmitWorkflowAction handler — the reference phase composition (design D2/D3;
 * task 15). The tracker cascade (task 16) and Start/Cancel/Close (task 17)
 * follow this same shape.
 *
 *   load (incl. per-verb access gate)
 *     → invokePreHook
 *     → planSubmit (composition of the pure planners)
 *     → commitPlan
 *     → runTrackerCascade
 *     → invokePostHook
 *     → return handler payload
 *
 * The engine context (mongoDb/mongoClient/useTransactions, callApi, user,
 * connection, params, workflowsConfig, the per-invocation `event_id`/`now`/
 * `newId` mint, and the request-context fields) is composed once at handler
 * entry by `createEngineContext` (called from SubmitWorkflowAction.js) and
 * threaded through every phase. No mutable shared `context` doc-mirroring: the
 * planned post-commit shapes live on the immutable Plan, never re-read.
 *
 * Q4 — recursive submits via pre-hooks: a pre-hook may itself fire a
 * SubmitWorkflowAction (e.g. via callApi back into the engine). That recursion
 * commits a separate invocation against possibly the same workflow; the CAS
 * gate on `updated.timestamp` (commit step 1, D15) catches any real conflict
 * between this invocation's load and commit. No explicit pre-hook-callback
 * detection is added — CAS is the conflict authority.
 *
 * @param {Object} context — the engine context from createEngineContext.
 * @returns {Promise<{
 *   action_ids: string[],
 *   completed_groups: Array,
 *   event_id: string | null,
 *   tracker_fired: Array,
 *   pre_hook_response: import('../../shared/phases/types.js').PreHookResult,
 *   post_hook_response: any,
 * }>}
 */
async function handleSubmit(context) {
  const { params, user, callApi } = context;

  // ── Load (all reads + per-verb access gate, ahead of the pre-hook) ───────
  const loadedState = await loadWorkflowState(context, {
    actionId: params.action_id,
    signal: params.signal,
  });
  // commitPlan pins loadedState.workflow.updated.timestamp as the CAS anchor.
  context.loadedState = loadedState;

  // ── Pre-hook (D5; external side effects only after access is granted) ────
  const preHookResult = await invokePreHook(loadedState, params, user, callApi);

  // ── Plan (pure composition of the planners) ──────────────────────────────
  const plan = planSubmit({ loadedState, preHookResult, context });

  // ── Commit (D9: workflow CAS → actions → event → notifications → log) ────
  const commitResult = await commitPlan(context, plan);

  // ── Tracker cascade (task 16; stubbed here, returns empty fire list) ─────
  const cascade = await runTrackerCascade(plan.trackerFires, context);
  const trackerFired = cascade.fires;

  // ── Post-hook (D6: fires after commit + cascade; throws propagate) ───────
  const postHookResponse = await invokePostHook(
    loadedState,
    plan,
    commitResult,
    trackerFired,
    params,
    user,
    callApi,
  );

  // ── Surface post-commit dispatch failures, last (D13) ────────────────────
  // commitPlan never throws for steps 3–5 — it records them on
  // commitResult.dispatchErrors. The cascade returns each level's
  // dispatchErrors plus its own cascadeErrors. The cascade and post-hook always
  // run first; the throw is last, so a dispatch failure costs the caller only
  // the success payload — never committed state work — while still surfacing
  // through Lowdefy's error reporting.
  const dispatchErrors = [
    ...commitResult.dispatchErrors,
    ...cascade.dispatchErrors,
  ];
  const { cascadeErrors } = cascade;
  if (dispatchErrors.length > 0 || cascadeErrors.length > 0) {
    const failedSteps = dispatchErrors.map((e) => `step ${e.step}`);
    const failedCascades = cascadeErrors.length > 0 ? ['tracker cascade'] : [];
    const named = [...failedSteps, ...failedCascades].join(', ');
    const cause = dispatchErrors[0]?.error ?? cascadeErrors[0]?.error;
    throw new WorkflowEngineError(
      `SubmitWorkflowAction: the workflow + action writes committed successfully, but post-commit dispatch failed (${named}). The committed state is durable; the failed dispatch(es) must be reconciled.`,
      { code: 'post_commit_dispatch_failed', cause },
    );
  }

  // ── Return the six-key payload (verbatim; matches makeWorkflowApis :return) ─
  return {
    action_ids: commitResult.action_ids,
    completed_groups: plan.completedGroups,
    event_id: context.event_id,
    tracker_fired: trackerFired,
    pre_hook_response: preHookResult,
    post_hook_response: postHookResponse,
  };
}

export default handleSubmit;
