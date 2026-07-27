# Task 2: Concept-spec amendments — engine, submit-pipeline, ui

## Context

The workflows-module concept specs in `designs/workflows-module-concept/` describe the contract Part 29 changes: `error` as an author-only domain stage (not an engine-driven mid-submit synthetic transition), uniform status-entry shape, no `hook_error` pre-hook return field, throw-on-failure handler return shape. This task lands all of the spec text changes in one pass so the contract is in writing before code changes.

Repo: `/Users/sam/Developer/lowdefy/modules-mongodb`.

## Task

Edit the following spec files. The changes are prose only — no schema changes need encoding.

### `designs/workflows-module-concept/engine/spec.md`

- **§ Action `error` transition** — rewrite. Replace the current text describing "engine-driven mid-submit failure" + "author-driven via `hook_error`" with a single paragraph stating that `error` is an author-driven domain stage. Reachable via: (a) pre-hook returning `actions: [{ ..., status: 'error' }]` through the regular merge channel (no `force` needed — `error.priority = 1` is below every non-terminal stage), (b) a task action's `submit_edit` with caller-supplied `current_status: 'error'` if the task's `task.statuses:` list includes `error`, and (c) external systems / follow-on injection APIs. Diagnostic context lives on the events-log entry via `event_overrides.metadata`, not on the status entry. Engine sub-step failures no longer write an `error` transition — they throw and propagate to `CallApi`.

- **§ Action doc / status field** — change the status-entry shape note from "`[{ stage, created, ... }]` plus error-only `{ reason, error_message, error_metadata }` fields" to a uniform `{ stage, created, event_id }`. Add a one-liner: "Spec text only — no shipped writer ever populated the polymorphic fields."

- **§ Priority rule** — leave the priority table values unchanged. Update the per-doc force-callers list: drop the submit-pipeline catch-converter's `force: true` `error` write. Remaining per-doc force callers stay: `resolve_error`'s recovery transition, tracker subscription's parent push, `StartWorkflow`'s parent-link push.

- **§ Capabilities** — in the `SubmitWorkflowAction` return-shape description, drop `pre_hook_response: null`, `hook_error`, and `post_hook_error: null` from the failure-mode wording. The handler has no failure-return shape; failures throw. The success return is `{ action_ids, completed_groups, event_id, tracker_fired, pre_hook_response, post_hook_response }`.

### `designs/workflows-module-concept/submit-pipeline/spec.md`

- **§ Button vocabulary (template-shipped, open-validate)** — structurally unchanged (all five buttons remain). Remove any prose tying `resolve_error` to engine force-write semantics; the page-level interaction is the same as any other (the handler-internal `force: true` for the recovery transition is invisible to authors).

- **§ Interaction → target status** — unchanged.

- **§ Pre-hook return (all fields optional)** — drop the `hook_error` field entirely. Update prose: a pre-hook that wants to mark the action errored returns `actions: [{ ..., status: 'error' }]` through the regular merge. A pre-hook that wants to abort the lifecycle throws — for a user-facing rejection the routine calls `:reject` (propagates as a `UserError(isReject: true)` throw); for an infrastructure failure it throws (or lets the thrown error propagate). The engine catches neither.

### `designs/workflows-module-concept/ui/spec.md`

- In the `-error` page-emission section, clarify that the page exists for **author-driven** recovery from an `error` stage (pushed by a pre-hook, a task `submit_edit + current_status: error`, or an external system). It is no longer reachable via engine-driven mid-submit failure — those failures throw to `CallApi` and the user retries the same submit.

### `designs/workflows-module-concept/action-authoring/spec.md`

No edits required. The `resolve_error` row in the `interactions:` examples stays.

## Acceptance Criteria

- All four spec files reflect the new error model.
- The `engine/spec.md § Action error transition` no longer references "engine-driven mid-submit failure" or `hook_error` as entry paths.
- `engine/spec.md § Action doc` describes status entries uniformly as `{ stage, created, event_id }`.
- `engine/spec.md § Capabilities` describes the `SubmitWorkflowAction` return as success-only (no `hook_error` / `post_hook_error`).
- `submit-pipeline/spec.md § Pre-hook return` has no `hook_error` field.
- `ui/spec.md` `-error` page section frames the page as author-driven recovery.
- Cross-references to `engine/spec.md` from inside the spec set still resolve.

## Files

- `designs/workflows-module-concept/engine/spec.md` — modify (four sections).
- `designs/workflows-module-concept/submit-pipeline/spec.md` — modify (Button vocabulary prose + Pre-hook return field drop).
- `designs/workflows-module-concept/ui/spec.md` — modify (`-error` page clarification).
- `designs/workflows-module-concept/action-authoring/spec.md` — no change (verify only).

## Notes

- Don't update Part 6's `_completed/06-submit-action-writes/design.md` here — that's a separate task (Task 3) because it's a shipped-part design amendment with its own conventions.
- Keep spec wording terse; this is contract documentation, not narrative.
