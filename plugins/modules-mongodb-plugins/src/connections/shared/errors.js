/**
 * Engine error model (design D13).
 *
 * Every engine throw shares this base class; callers and tests discriminate on
 * `code`, never on message text. Load-phase invariant codes:
 * `workflow_not_found`, `action_not_found`, `stage_rejects_submit`,
 * `access_denied`. Plan-phase signal-validation codes: `unknown_signal`,
 * `missing_target`, `signal_not_allowed`. Lifecycle-handler code:
 * `stage_rejects_close`.
 *
 * Subclasses that callers catch by name keep named classes:
 * `ConcurrentSubmitError` (`code: "concurrent_submit"`, task 13) and
 * `TrackerCascadeDepthError` (`code: "tracker_depth_exceeded"`, task 16)
 * extend this base.
 *
 * Cause chains: a rethrow that adds engine context must pass `{ cause }` so
 * the original error is preserved; the default is not to wrap at all — driver
 * and downstream errors bubble as-is unless the wrap genuinely adds context.
 */
class WorkflowEngineError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message, { cause });
    this.name = 'WorkflowEngineError';
    this.code = code;
  }
}

export { WorkflowEngineError };
