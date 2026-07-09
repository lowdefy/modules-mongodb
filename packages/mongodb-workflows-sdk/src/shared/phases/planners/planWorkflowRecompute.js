const TERMINAL = ["done", "not-required"];

/**
 * Compose the planned post-commit workflow doc (whole doc) from the loaded
 * workflow + the planned action states. Replaces the deleted
 * `recomputeWorkflowAfterActionWrite.js` read-modify-write helper: the commit
 * phase `$set`s the composed doc whole under the CAS gate (design D9/D15) —
 * this planner does no I/O.
 *
 * Part 66: the denormalised `summary`/`groups[]` caches are gone. They were
 * pure read-display fields never read for engine logic; the overview resolvers
 * now derive their counts on read from the action docs. So this planner no
 * longer composes them and the final persist-only group recompute pass is
 * deleted. `planAutoUnblock` still runs `recomputeGroups` in-memory per
 * fixpoint iteration for unblock logic — that result simply isn't persisted.
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
 * `lifecyclePush` (task 23; consumed by task 17's Cancel/Close): when present,
 * the auto-complete check is **skipped entirely** and the declared lifecycle
 * entry is pushed instead — `{ stage, event_id, created: now, ...(reason ?
 * { reason } : {}) }` — composed here, the single status-entry composition
 * site. Skip-entirely, not replace-if-firing: Close pushes `completed` even
 * when a `required_after_close` survivor keeps the action set non-terminal,
 * and Cancel's sweep-induced all-terminal state can't add a phantom
 * `completed` under its `cancelled`. Submit and tracker levels omit it —
 * auto-complete behaviour unchanged.
 *
 * Pure: derives everything from its inputs; builds a **new** `status` value
 * rather than mutating the loaded doc.
 *
 * @param {Object} args
 * @param {import('../types.js').LoadedState} args.loadedState — load-phase
 *   output; reads `workflow`.
 * @param {Array<Object>} args.plannedActions — every action doc on the
 *   workflow in its **planned post-commit** state (task 10 output, after the
 *   auto-unblock fixpoint).
 * @param {Object} [args.formData] — the whole merged `form_data` object from
 *   `planFormDataMerge` (task 15 threads it through). Omitted → the loaded
 *   `form_data` carries over unchanged.
 * @param {{ stage: string, reason?: string }} [args.lifecyclePush] — declared
 *   lifecycle entry (Cancel's `cancelled` / Close's `completed`); skips the
 *   auto-complete check entirely. Omitted → auto-complete as documented above.
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
  lifecyclePush,
  event_id,
  now,
}) {
  const { workflow } = loadedState;
  const actions = plannedActions ?? [];

  let status;
  if (lifecyclePush != null) {
    // Declared lifecycle entry — the auto-complete check is skipped entirely
    // (skip-entirely, not replace-if-firing; see the doc block).
    const { stage, reason } = lifecyclePush;
    status = [
      { stage, event_id, created: now, ...(reason ? { reason } : {}) },
      ...(workflow.status ?? []),
    ];
  } else {
    const allTerminal =
      actions.length > 0 &&
      actions.every((a) => TERMINAL.includes(a.status?.[0]?.stage));
    const currentWorkflowStage = workflow.status?.[0]?.stage;
    const shouldPushCompleted =
      allTerminal &&
      currentWorkflowStage !== "completed" &&
      currentWorkflowStage !== "cancelled";

    status = shouldPushCompleted
      ? [
          { stage: "completed", event_id, created: now },
          ...(workflow.status ?? []),
        ]
      : [...(workflow.status ?? [])];
  }

  return {
    ...workflow,
    status,
    form_data: formData ?? workflow.form_data,
    updated: now,
  };
}

export default planWorkflowRecompute;
