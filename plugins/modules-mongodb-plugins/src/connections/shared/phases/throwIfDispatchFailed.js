import { WorkflowEngineError } from "../errors.js";

/**
 * Surface post-commit dispatch failures, last (design D9/D13).
 *
 * `commitPlan` never throws for commit steps 3–5 (event / notifications /
 * change-log) — it records each failure on `CommitResult.dispatchErrors[]`. The
 * tracker cascade likewise records its levels' dispatch failures plus its own
 * `cascadeErrors[]` (CAS exhaustion + gone parents) rather than propagating
 * them. The committed step-1/2 state is durable; the end-of-handler throw is the
 * SOLE surfacing of these recorded failures (no engine side-channel logging).
 *
 * Every engine handler (Submit, Start, Cancel, Close) calls this at the very
 * end — after the cascade and post-hook, before the success return — so a
 * dispatch failure costs the caller only the success payload, never committed
 * state work, while still surfacing through Lowdefy's error reporting. Extracted
 * from `handleSubmit.js`'s inline block (task 15) so the four handlers share one
 * implementation ("one correct way").
 *
 * @param {Object} args
 * @param {string} args.handlerName — the calling handler's name, woven into the
 *   thrown message (e.g. `'SubmitWorkflowAction'`, `'CancelWorkflow'`).
 * @param {import('./types.js').CommitResult} args.commitResult — the base
 *   invocation's commit result; reads `dispatchErrors`.
 * @param {{ dispatchErrors: Array<{ step: number, error: Error }>,
 *   cascadeErrors: Array<{ fire: Object, error: Error }> }} args.cascade — the
 *   tracker cascade result (an empty-errors object when there was no cascade).
 * @throws {WorkflowEngineError} `code: 'post_commit_dispatch_failed'` when any
 *   dispatch or cascade error was recorded.
 */
function throwIfDispatchFailed({ handlerName, commitResult, cascade }) {
  const dispatchErrors = [
    ...commitResult.dispatchErrors,
    ...cascade.dispatchErrors,
  ];
  const { cascadeErrors } = cascade;
  if (dispatchErrors.length === 0 && cascadeErrors.length === 0) {
    return;
  }

  const failedSteps = dispatchErrors.map((e) => `step ${e.step}`);
  const failedCascades = cascadeErrors.length > 0 ? ["tracker cascade"] : [];
  const named = [...failedSteps, ...failedCascades].join(", ");
  const cause = dispatchErrors[0]?.error ?? cascadeErrors[0]?.error;
  throw new WorkflowEngineError(
    `${handlerName}: the workflow + action writes committed successfully, but post-commit dispatch failed (${named}). The committed state is durable; the failed dispatch(es) must be reconciled.`,
    { code: "post_commit_dispatch_failed", cause },
  );
}

export default throwIfDispatchFailed;
