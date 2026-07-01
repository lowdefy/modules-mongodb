# Task 13: Wrap steps 4–6 in a mid-write error transition

## Context

[design.md § Lifecycle scaffold step 1 — Failure shape](../design.md#lifecycle-scaffold) commits the dual validation paths:

> **Before action lookup** (payload schema, action-not-found, role gate, terminal-workflow gate): no action doc to attach error context to → throw with a structured error. Caller sees it through the CallApi result. Matches `StartWorkflow`'s posture.
> **After action lookup, mid-write** (sub-step failure inside steps 4–6): force-push `{ stage: error, created, reason: <step-name>, error_message, error_metadata }` onto the action's `status[]` via `updateAction(...force: true)`; skip the remaining lifecycle steps; return partial `{ action_ids, event_id, ... }`. Pre-hook `hook_error` returns ([part 9](../../09-hook-invocation/design.md#pre-hook-return-merge)) take the same path with `reason: 'pre-hook'`.

[engine/spec.md § Action `error` transition](../../../../workflows-module-concept/engine/spec.md#action-error-transition):

> The submit pipeline catches a thrown failure from a sub-step (submit hook, entity_update, event, notification dispatch) and converts it to an `error` transition: writes `{ stage: error, created, reason: <step-name>, error_message, error_metadata }` to the action's `status` array with **`force: true` semantics** (bypasses priority rule); skips remaining auto-complete / tracker-subscription / group-rollup work (an `error` action is non-terminal); returns partial `{ action_ids, event_id }`. `form_data` is not touched on error transitions — all error context lives on the status entry.

By this point (after tasks 8–12), `handleSubmit.js` has working bodies for steps 1, 3, 4, 5, 6. This task wraps the write-section (steps 4, 5, 6) in a try/catch and force-pushes an `error` status entry on the user-submitted action when any of those steps throws. Steps 7–11 (no-ops in part 6) still get skipped — the design's "skip remaining lifecycle steps" rule means the `return` statement after the catch block returns early.

V0 reference: v0's `handleUpdateActions.js` did not have an error-transition wrapper — failures bubbled up uncaught. The new design promotes the error-transition path to a first-class engine behaviour so users see a recoverable `error` state instead of an opaque CallApi failure.

## Task

Modify `handleSubmit.js` to wrap steps 4–6 in a try/catch.

### Shape

```js
import updateAction from "../../shared/updateAction.js";
// ...

// (Steps 1, 2, 3 stay outside the try — pre-lookup failures throw per task 8's spec.)

let errorTransition = null;

try {
  // Step 4 — Write action transitions.
  // (existing body from task 10)
  // Step 5 — Recompute workflow summary.
  // (existing body from task 11)
  // Step 6 — Write form_data.
  // (existing body from task 12)
} catch (err) {
  // Force-push the error transition onto the user-submitted action.
  // Per engine/spec.md § Action `error` transition: bypasses priority rule;
  // skips remaining lifecycle work; returns partial.
  errorTransition = {
    reason: err.step ?? "mid-write",
    error_message: err.message,
    error_metadata: err.metadata ?? null,
  };

  await updateAction(context, {
    actionId: internal.currentActionId,
    newStage: "error",
    fields: {}, // form_data is not touched on error transitions.
    eventId: context.eventId,
    currentActionId: null,
    force: true,
  });

  // Skip steps 7–11 (no-ops in part 6 anyway, but the early return makes the
  // posture explicit and protects parts 7–11 once they wire bodies in).
  return {
    action_ids: actionIds,
    completed_groups: [],
    event_id: null,
    tracker_fired: null,
    pre_hook_response: null,
    post_hook_response: null,
    error_transition: errorTransition, // surfaces the error context on the API response.
  };
}

// Steps 7–11 — no-ops in part 6.

return {
  action_ids: actionIds,
  completed_groups: [],
  event_id: null,
  tracker_fired: null,
  pre_hook_response: null,
  post_hook_response: null,
};
```

Key shape:

- **`err.step` and `err.metadata`** — convention for sub-step throws to attach context. Tasks 10, 11, 12 should set `err.step = 'write-action-transitions'` / `'recompute-summary'` / `'write-form-data'` and optionally `err.metadata` before rethrowing. v1 doesn't need to retrofit every throw — the catch defaults to `'mid-write'` for unannotated errors.
- **`error_transition` on the return shape** — adds a new field to the success-shape envelope. Per the design's "Failure shape" bullet, the engine returns a **partial** success object with an `error_transition` field carrying the error context, **not** a thrown error. Callers (page-level event handlers in part 16 / shared pages in part 17) read this field to know to navigate to the `-error` page.
- **`fields: {}` on the error `updateAction` call** — per engine spec, `form_data` is not touched on error transitions. The status push and the change stamp are the only writes.
- **Mid-write error skips form_data writes.** If step 6 itself throws (e.g. Mongo connection drops mid-write), the previously-written status push from step 4 stays — the design accepts this partial state (per [engine/spec.md § Risks](../../../../workflows-module-concept/engine/spec.md#risks): "No transactional atomicity in v1. Mid-sequence handler failure leaves partial writes.").

### Optional: extend `handleSubmit`'s return-shape JSDoc

Update the JSDoc on `handleSubmit` (from task 7) to include the `error_transition` field:

```js
/**
 * @returns {Promise<{
 *   action_ids: string[],
 *   completed_groups: Array,
 *   event_id: string | null,
 *   tracker_fired: any | null,
 *   pre_hook_response: any | null,
 *   post_hook_response: any | null,
 *   error_transition?: { reason: string, error_message: string, error_metadata: any | null },
 * }>}
 */
```

## Acceptance Criteria

- Steps 4, 5, 6 in `handleSubmit.js` are wrapped in a try/catch.
- On catch: `updateAction(context, { actionId: currentActionId, newStage: 'error', fields: {}, eventId, currentActionId: null, force: true })` is called.
- Catch path returns the partial success shape with `error_transition: { reason, error_message, error_metadata }`.
- Pre-lookup failures (step 1) still throw uncaught — they're outside the try.
- Steps 7–11 are skipped on catch (early `return`).
- `handleSubmit.test.js` extended with cases (using `inMemoryMongo`):
  - **Step 4 throws** (simulate by passing an invalid action type that triggers a downstream throw): the user-submitted action's status array has `[{ stage: 'error', ... }, { stage: <previous>, ... }]`; the return value has `error_transition` populated.
  - **Step 5 throws** (simulate by mocking `MongoDBUpdateOne` to fail on the workflows collection): the action's `error` status push lands; the return value carries the error context.
  - **Step 6 throws** (simulate similarly): same outcome; step 4's transition writes stay on disk (partial state, per the design's accepted risk).
  - **Step 1 throws** (action not found): error is **not** caught; bubbles up as a CallApi-level failure (no `error_transition` write).
  - **Pre-hook `hook_error` path** (when part 9 lands): documented as a comment marker for part 9 to wire its `hook_error` flow into the same catch block with `reason: 'pre-hook'`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — wrap steps 4–6 in try/catch, update return-shape JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the five cases above.

## Notes

- **Why not wrap pre-lookup steps too.** Pre-lookup failures have no action doc to attach error context to — there's nothing to force-push the error onto. Throwing is the only correct posture. The design's split is explicit; this task honours it.
- **`updateAction` with `currentActionId: null` on the error path.** The self-exception is **not** wanted here — even if the user-submitted action is at `error` already, the engine-driven force-push lands a fresh audit entry. Setting `currentActionId: null` is technically redundant (the `force: true` bypass short-circuits to `true` before the self-exception check), but explicit-is-better and protects against future refactors that might rearrange the priority/force-check order in task 5's `updateAction`.
- **`error_metadata` on the return shape is `any | null`.** v1 has no convention for what sub-steps put there; part 9 may standardize a shape for hook errors. Leave the field open for now.
- **Hook error path is part 9.** Per [part 9 § Pre-hook return merge](../../09-hook-invocation/design.md#pre-hook-return-merge): "`hook_error` → aborts the lifecycle. Engine writes `{ stage: error, reason: 'pre-hook', error_message: <message>, error_metadata? }` to the action's status (`force: true` so it bypasses priority). No further side effects. Returns `{ pre_hook_response: <pre-hook return>, ... rest null }`." Part 9 wires this into step 2's pre-hook invocation path; the catch block here handles the **mid-write** path with the same shape (`reason: 'mid-write'` vs `reason: 'pre-hook'`).
- **Auto-complete is part 7's job.** Auto-complete check (push workflow `completed` when every action is terminal) is in part 7's design — not in part 6. Per the design's note: "an `error` action is non-terminal, so the auto-complete check would never fire on a workflow with an erroring action anyway." No conflict between the error transition and auto-complete.
