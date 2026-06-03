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

/**
 * Thrown when the CAS filter in commit step 1 finds zero matching docs —
 * a concurrent write moved the workflow between load and commit. Callers
 * (Submit, Cancel, Close, tracker cascade) catch this by class name as the
 * retryable case; the engine does NOT auto-retry (each retry re-runs the
 * pre-hook, which may be non-idempotent — caller's policy decides).
 *
 * Despite the name it fires for every handler's `update` commit path, not
 * only Submit: Cancel, Close, and each tracker cascade level claim the
 * workflow the same way.
 */
class ConcurrentSubmitError extends WorkflowEngineError {
  constructor(message, { cause } = {}) {
    super(message, { code: 'concurrent_submit', cause });
    this.name = 'ConcurrentSubmitError';
  }
}

/**
 * Thrown when the tracker cascade's chain depth exceeds `MAX_DEPTH` — a
 * structural config bug (a cycle in workflow parent linking). Unlike a CAS miss
 * or a gone parent, this is not recoverable per-level: it taints the whole
 * cascade and propagates out of `runTrackerCascade` to fail the request loudly.
 *
 * `fire` is the offending cascade fire (carrying its `depth`); kept on the
 * error so callers/tests can see which parent reference overflowed.
 */
class TrackerCascadeDepthError extends WorkflowEngineError {
  constructor(message, { fire, cause } = {}) {
    super(message, { code: 'tracker_depth_exceeded', cause });
    this.name = 'TrackerCascadeDepthError';
    this.fire = fire;
  }
}

export { WorkflowEngineError, ConcurrentSubmitError, TrackerCascadeDepthError };
