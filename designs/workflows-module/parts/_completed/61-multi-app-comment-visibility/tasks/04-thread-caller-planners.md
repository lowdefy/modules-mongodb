# Task 4: Thread `comment_visibility` through both planner callers

## Context

Two write paths reach `planEventDispatch` (which task 3 taught to accept `comment_visibility`):

1. **Submit path** — `planSubmit.js` calls `planEventDispatch` directly (around `planSubmit.js:186`), passing `comment: params.comment` today.
2. **Part 24 update-fields path** — `UpdateActionFields.js` calls `planFieldsUpdate` (`UpdateActionFields.js:54`), which in turn calls `planEventDispatch` (`planFieldsUpdate.js:87`). The `comment` rides through `planFieldsUpdate`'s `comment` param.

Both paths already carry `comment` from `context.params` / the planner args. This task threads `comment_visibility` along the same routes so the choice reaches the fold. No new logic — pure plumbing of one optional param.

## Task

### `planSubmit.js`

In the `planEventDispatch({ ... })` call, add `comment_visibility: params.comment_visibility` beside the existing `comment: params.comment`.

### `planFieldsUpdate.js`

1. Add `comment_visibility` to the destructured args: `function planFieldsUpdate({ loadedState, fields, comment, comment_visibility, metadata, context })`.
2. Pass `comment_visibility` into its `planEventDispatch({ ... })` call beside the existing `comment`.
3. Update the JSDoc `@param` list to include the optional `comment_visibility`.

### `UpdateActionFields.js`

In the `planFieldsUpdate({ ... })` call, add `comment_visibility: params.comment_visibility` beside the existing `comment: params.comment`. (The param is read off `context.params`, same as the existing `comment`.)

## Acceptance Criteria

- A submit carrying `params.comment_visibility` reaches `foldCommentIntoEvent` with that value via `planSubmit` → `planEventDispatch`.
- A Part 24 update-fields carrying `params.comment_visibility` reaches the fold via `UpdateActionFields` → `planFieldsUpdate` → `planEventDispatch`.
- Absent `comment_visibility` on either path → `shared` (the fold default; verified end-to-end, not re-defaulted in these files).
- `pnpm --filter @lowdefy/modules-mongodb-plugins test planSubmit planFieldsUpdate` passes (extend the existing tests to assert the param is forwarded; absent → shared).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js` — modify — add `comment_visibility: params.comment_visibility` to the `planEventDispatch` call.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.js` — modify — destructure `comment_visibility`, forward to `planEventDispatch`, update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/UpdateActionFields.js` — modify — pass `comment_visibility: params.comment_visibility` into `planFieldsUpdate`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js` / `planFieldsUpdate.test.js` — modify — assert forwarding and the absent-default.

## Notes

- Do not coerce or normalise here — the fold (task 1) owns the `internal → shared` coercion against the connection flag. These files just carry the raw value through.
