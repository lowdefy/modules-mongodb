# Task 1: `action-fields-updated` event type in `planEventDispatch`

## Context

Part 38's pure event planner `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` composes the single per-invocation event doc for every engine handler. It branches on a `handlerType` discriminator (`StartWorkflow` / `SubmitWorkflowAction` / `CancelWorkflow` / `CloseWorkflow` / `tracker-mirror`), each mapping to an event `type`, a default Nunjucks title template (`DEFAULT_TITLES`), a render context, and a `metadata` shape (`buildMetadata`).

Part 24 introduces a new engine operation, `UpdateActionFields`, which writes the three universal fields (`assignees`, `due_date`, `description`) on an action with **no FSM transition** and **no workflow doc write**. Its planner (task 4) must emit an `action-fields-updated` log event with the same `references` + entity-ref-key composition as the submit-pipeline's default event, plus `metadata.comment` from the operation payload. This task adds that event type to `planEventDispatch` so all event composition stays in one place.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`:

1. **New handler type `'UpdateActionFields'`** in the handler-type branch:
   - `eventType = 'action-fields-updated'`
   - `isActionEvent = true` (action render context; `references.action_ids` from `allTouchedActionDocs`)
   - New `DEFAULT_TITLES` entry. Use: `'{{ user.profile.name }} updated {{ action.type }} details'` (the design does not pin the copy — keep it in the same voice as the existing titles).
2. **New optional `comment` param** on the planner args (`{ text, html } | null` shape, same as the comment field). Only the `UpdateActionFields` path consumes it.
3. **Render context for the new type:** `{ user, action: plannedActionDoc, workflow }`. There is no transition, so do **not** include `signal` / `status_before` / `status_after` / `submitted_form` in the context. `signal` is not a meaningful input for this handler type — the planner must not require it (today `signal` is read unconditionally in `ctx` composition; branch so the fields-updated path doesn't reference it).
4. **Metadata shape for the new type** (extend `buildMetadata`): `{ action_type, workflow_type, current_key, comment }` where `action_type` / `current_key` come from `plannedActionDoc` (same null-coalescing as the action-event branch), `workflow_type` from the workflow doc, and `comment` is the payload comment or `null`. No `signal` / `status_before` / `status_after` keys — there is no transition.
5. **No override layers**: like the lifecycle and tracker-mirror paths, the fields-updated event renders engine-default only (no YAML/pre-hook override channels exist for it — "build for what exists").
6. The existing `references` composition applies unchanged: `workflow_ids: [workflow._id]`, `action_ids` from `allTouchedActionDocs`, `[entity_ref_key]: [workflow.entity_id]`.

Update the planner's JSDoc (handler-type list, new `comment` param).

Extend `planEventDispatch.test.js` with cases for the new handler type:

- Event doc `type` is `action-fields-updated`; `_id` is the injected `event_id`.
- Default title renders against `{ user, action, workflow }`.
- `metadata` carries `{ action_type, workflow_type, current_key, comment }` and **no** `signal` / `status_before` / `status_after`.
- `comment` omitted → `metadata.comment: null`.
- `references` carries the workflow id, the action id, and the entity-ref key, identical in shape to the Submit path.
- YAML / pre-hook overrides are not applied for this handler type even when passed.

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test planEventDispatch` passes with the new cases.
- All pre-existing handler-type behaviour is unchanged (existing tests pass untouched).
- The fields-updated path never reads `signal`, `status_before`, `status_after`, or `submitted_form`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — modify — new handler type, `comment` param, metadata branch, default title.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.test.js` — modify — new handler-type cases.

## Notes

- **Comment-on-event tension, resolved by the design:** Part 38's planner deliberately writes no `metadata.comment` on submit events (Part 33's `foldCommentIntoEvent` owns the submit-path comment fold; `comment` stays a wire param). Part 24's design explicitly maps the fields operation's `comment` payload to `event.metadata.comment` — that is the contract here. Confine `metadata.comment` strictly to the `UpdateActionFields` handler type; do not add it to any other path.
- The title copy is the one detail the design leaves open; if review wants different copy it's a one-line change.
