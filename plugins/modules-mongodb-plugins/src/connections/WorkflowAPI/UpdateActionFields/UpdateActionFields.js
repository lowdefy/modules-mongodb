import createEngineContext from "../../shared/phases/createEngineContext.js";
import loadWorkflowState from "../../shared/phases/loadWorkflowState.js";
import planFieldsUpdate from "../../shared/phases/planners/planFieldsUpdate.js";
import commitPlan from "../../shared/phases/commitPlan.js";
import throwIfDispatchFailed from "../../shared/phases/throwIfDispatchFailed.js";

/**
 * UpdateActionFields connection resolver (Part 24).
 *
 * Writes the universal fields (`assignees` / `due_date`)
 * on ONE action as a state-orthogonal operation — NO FSM transition, NO
 * workflow doc write, NO pre/post hook, NO tracker cascade. It is an operation,
 * not a signal: the deliberate operations/transitions boundary (critique
 * §3 / state-machine.md). The phase composition is short enough to inline here
 * (no separate `handleFieldsUpdate.js`):
 *
 *   load (verb: 'edit' gate, signal-less, no stage check)
 *     → planFieldsUpdate (fields $set + status-map cell re-render + event)
 *     → commitPlan (action bulk-write + event + notifications + change-log; no CAS)
 *     → surface dispatch errors
 *     → return { action_id, event_id }
 *
 * Params (from `context.params`): `action_id` (required — the authoritative
 * target locator), `fields` (`{ assignees?, due_date? }`),
 * `comment` (optional; routed through the planner's `comment` param — Part 33
 * renders it into `display.{app}.description`, never `metadata.comment`),
 * `comment_visibility` (optional `'shared' | 'internal'`; Part 61 — routed
 * through the planner to the shared fold, where `internal` is honoured only when
 * the connection opted in via `enable_internal_comments`, else coerced to
 * `shared`), and `metadata` (optional). `action_type` is NOT sent — the endpoint is
 * per-workflow (not per-action-type, Rev 2), so the handler derives type/kind
 * from the loaded action doc.
 *
 * Access: the load phase's `edit`-verb gate (`access.{app_name}.edit`) is the
 * sole access authority — the same posture as the submit endpoint. The
 * universal fields stay editable in any stage the caller has `edit` on,
 * including `done` / `not-required` / `error` and on a completed/cancelled
 * workflow (`required_after_close` does not apply to this operation).
 *
 * Concurrency: two near-simultaneous updates are last-write-wins (no per-action
 * CAS — Part 38 D15 deferral). Do not add one.
 */
async function UpdateActionFields(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params } = context;

  // ── Load (verb-gated, signal-less; no stage check — task 2) ──────────────
  const loadedState = await loadWorkflowState(context, {
    actionId: params.action_id,
    verb: "edit",
  });
  // commitPlan reads loadedState.workflow._id for the workflow-less plan's
  // CommitResult.workflow_id (task 3).
  context.loadedState = loadedState;

  // ── Plan (pure; workflow: null) ──────────────────────────────────────────
  const plan = planFieldsUpdate({
    loadedState,
    fields: params.fields,
    comment: params.comment,
    comment_visibility: params.comment_visibility,
    metadata: params.metadata,
    context,
  });

  // ── Commit (action bulk-write + event + notifications + change-log) ──────
  const commitResult = await commitPlan(context, plan);

  // ── Surface post-commit dispatch failures (no cascade for this op) ───────
  throwIfDispatchFailed({
    handlerName: "UpdateActionFields",
    commitResult,
    cascade: { dispatchErrors: [], cascadeErrors: [] },
  });

  return {
    action_id: commitResult.action_ids[0],
    event_id: context.event_id,
  };
}

UpdateActionFields.schema = {};
UpdateActionFields.meta = {
  checkRead: false,
  checkWrite: true,
};

export default UpdateActionFields;
