# Task 1: `action-fields-updated` event type in `planEventDispatch`

## Context

Part 38's pure event planner `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` composes the single per-invocation event doc for every engine handler. It branches on a `handlerType` discriminator (`StartWorkflow` / `SubmitWorkflowAction` / `CancelWorkflow` / `CloseWorkflow` / `tracker-mirror`) in a `titleTemplate` if/else chain (`:156-185`), each branch mapping to an event `type`, a default Nunjucks title (drawn from `LIFECYCLE_TITLES` / `DEFAULT_SIGNAL_TITLES`, falling back to `ACTION_FALLBACK_TITLE`), a render context, and a `metadata` shape (`buildMetadata`). There is **no `DEFAULT_TITLES` map** — titles are assigned inside the if/else chain.

Part 24 introduces a new engine operation, `UpdateActionFields`, which writes the three universal fields (`assignees`, `due_date`, `description`) on an action with **no FSM transition** and **no workflow doc write**. Its planner (task 4) must emit an `action-fields-updated` log event with the same `references` + entity-ref-key composition as the submit-pipeline's default event, with the operation's optional `comment` routed through the planner's `comment` param — Part 33's `foldCommentIntoEvent` (single call site, inside this planner) owns rendering it into `display.{app_name}.description`; **no `metadata.comment` is written** (Part 33 D2). This task adds that event type to `planEventDispatch` so all event composition stays in one place.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`:

1. **New handler type `'UpdateActionFields'`** — add an `else if (handlerType === 'UpdateActionFields')` branch to the `titleTemplate` if/else chain (`:156-185`):
   - `eventType = 'action-fields-updated'`
   - `isActionEvent = true` (action render context; `references.action_ids` from `allTouchedActionDocs`)
   - Set `titleTemplate` to a default title. Reuse the existing `ACTION_FALLBACK_TITLE` (`'{{ user.profile.name }} updated {{ action.title }}'`) — it already matches the convention (every shipped title interpolates `{{ action.title }}`, the human title, never `{{ action.type }}`, the slug). The design does not pin the copy; keep it in the same voice as the existing titles.
2. **New optional `comment` param** on the planner args (`{ text, html } | null` shape, same as the comment field). The planner itself does not store or render it — Part 33's `foldCommentIntoEvent` (one call site, post-render, inside this planner) folds it into `display.{app_name}.description`. If Part 33's fold hasn't landed yet when this task runs, the param flows un-folded until it does — Part 33 pins this landing-order freedom ("the planner is the contract").
3. **Render context for the new type:** `{ user, action: plannedActionDoc, workflow }`. There is no transition, so do **not** include `signal` / `status_before` / `status_after` / `submitted_form` in the context. `signal` is not a meaningful input for this handler type — the planner must not require it (today `signal` is read unconditionally in `ctx` composition; branch so the fields-updated path doesn't reference it).
4. **Metadata shape for the new type** (extend `buildMetadata`): `{ action_type, workflow_type, current_key }` where `action_type` / `current_key` come from `plannedActionDoc` (same null-coalescing as the action-event branch) and `workflow_type` from the workflow doc. No `signal` / `status_before` / `status_after` keys — there is no transition. **No `comment` key** — `metadata.comment` is dropped per Part 33 D2 (one storage location: `display.{app_name}.description`); the existing JSDoc note ("No `metadata.comment` is written") applies to this handler type too.
5. **No override layers**: like the lifecycle and tracker-mirror paths, the fields-updated event renders engine-default only (no YAML/pre-hook override channels exist for it — "build for what exists").
6. The existing `references` composition applies unchanged: `workflow_ids: [workflow._id]`, `action_ids` from `allTouchedActionDocs`, `[entity_ref_key]: [workflow.entity_id]`.

Update the planner's JSDoc (handler-type list, new `comment` param).

Extend `planEventDispatch.test.js` with cases for the new handler type:

- Event doc `type` is `action-fields-updated`; `_id` is the injected `event_id`.
- Default title renders against `{ user, action, workflow }`.
- `metadata` carries `{ action_type, workflow_type, current_key }` and **no** `signal` / `status_before` / `status_after` / `comment`.
- `metadata.comment` is absent whether or not a `comment` is passed (Part 33 owns comment rendering; the param only flows).
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

- **Comment contract (Part 33 D2/D3):** no event on any path writes `metadata.comment` — the comment lives once, in `display.{app_name}.description`, rendered by Part 33's `foldCommentIntoEvent` at its single call site inside this planner. The fields operation passes `comment` through the same planner param the submit path uses; this task adds the param, not a fold or a metadata key. (Part 24's design was amended to this route; if you see `metadata.comment` referenced anywhere, it's stale.)
- The title copy is the one detail the design leaves open; if review wants different copy it's a one-line change.
