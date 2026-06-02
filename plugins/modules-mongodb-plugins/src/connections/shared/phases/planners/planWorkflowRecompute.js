import recomputeGroups from "./recomputeGroups.js";

const TERMINAL = ["done", "not-required"];

/**
 * Compose the planned post-commit workflow doc (whole doc) from the loaded
 * workflow + the planned action states. Replaces the deleted
 * `recomputeWorkflowAfterActionWrite.js` read-modify-write helper: the commit
 * phase `$set`s the composed doc whole under the CAS gate (design D9/D15) —
 * this planner does no I/O.
 *
 * The group recompute here is the **final** pass after the auto-unblock ⇄
 * recompute fixpoint (task 10): `planAutoUnblock` imports the shared
 * `recomputeGroups` helper directly per iteration; this planner runs it one
 * last time against the settled planned action states so `groups[]` reflects
 * the unblock transitions (e.g. a group label flipping blocked → in-progress).
 *
 * Auto-complete: pushes `completed` onto the workflow status iff
 * `total > 0 && total === done + not_required` and the current workflow stage
 * is not already `completed` or `cancelled`. The `total > 0` guard stops a
 * zero-action workflow from auto-completing (`0 === 0`); the current-stage
 * guard makes the push idempotent (no second `completed` entry on a
 * `required_after_close` re-submit) and keeps `completed`/`cancelled`
 * mutually exclusive. Both guards preserve
 * `recomputeWorkflowAfterActionWrite.js:82–89` and its pinned tests.
 *
 * Pure: derives everything from its inputs; builds **new** `status`/`groups`/
 * `summary` values rather than mutating the loaded doc.
 *
 * @param {Object} args
 * @param {import('../types.js').LoadedState} args.loadedState — load-phase
 *   output; reads `workflow` and `workflowConfig.action_groups`.
 * @param {Array<Object>} args.plannedActions — every action doc on the
 *   workflow in its **planned post-commit** state (task 10 output, after the
 *   auto-unblock fixpoint).
 * @param {Object} [args.formData] — the whole merged `form_data` object from
 *   `planFormDataMerge` (task 15 threads it through). Omitted → the loaded
 *   `form_data` carries over unchanged.
 * @param {string} args.event_id — the per-invocation event id (minted at
 *   handler entry, task 15); stamped on the optional `completed` status entry.
 * @param {Object} args.now — the per-invocation change stamp; written to
 *   `updated` (the CAS anchor the next writer pins, design D15) and to the
 *   optional `completed` status entry's `created`.
 * @returns {Object} the whole planned post-commit workflow doc.
 */
function planWorkflowRecompute({
  loadedState,
  plannedActions,
  formData,
  event_id,
  now,
}) {
  const { workflow, workflowConfig } = loadedState;
  const actions = plannedActions ?? [];

  const groups = recomputeGroups({
    declaredGroups: workflowConfig.action_groups ?? [],
    actions,
  });

  const summary = {
    done: actions.filter((a) => a.status?.[0]?.stage === "done").length,
    not_required: actions.filter(
      (a) => a.status?.[0]?.stage === "not-required",
    ).length,
    total: actions.length,
  };

  const allTerminal =
    actions.length > 0 &&
    actions.every((a) => TERMINAL.includes(a.status?.[0]?.stage));
  const currentWorkflowStage = workflow.status?.[0]?.stage;
  const shouldPushCompleted =
    allTerminal &&
    currentWorkflowStage !== "completed" &&
    currentWorkflowStage !== "cancelled";

  const status = shouldPushCompleted
    ? [
        { stage: "completed", event_id, created: now },
        ...(workflow.status ?? []),
      ]
    : [...(workflow.status ?? [])];

  return {
    ...workflow,
    status,
    summary,
    groups,
    form_data: formData ?? workflow.form_data,
    updated: now,
  };
}

export default planWorkflowRecompute;
