# Task 3: Thread `comment_visibility` and the connection flag through `planEventDispatch`

## Context

`planEventDispatch` is the pure event planner that composes and renders the event doc, then folds the runtime comment in via `foldCommentIntoEvent` (the single call site, run strictly after `renderEventDisplay`). Today it calls:

```js
foldCommentIntoEvent({ display: renderedDisplay }, comment, appName);
```

It already receives `comment` and `connection` as args (it reads `connection.app_name` into `appName` and throws if absent). Task 1 has extended `foldCommentIntoEvent` to accept `visibility` and `enableInternalComments`. Task 2 has added `enable_internal_comments` to the connection schema.

This task wires the new choice from `planEventDispatch`'s inputs into the fold. The visibility decision is made entirely at write time; the read side is unchanged.

## Task

In `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`:

1. Add a new optional arg `comment_visibility` to the `planEventDispatch({ ... })` destructured parameter list, alongside the existing `comment`.

2. Pass both the visibility and the connection flag into the fold call:

   ```js
   foldCommentIntoEvent(
     { display: renderedDisplay },
     comment,
     appName,
     comment_visibility, // 'shared' | 'internal' | undefined
     connection?.enable_internal_comments === true,
   );
   ```

   Rely on `foldCommentIntoEvent`'s defaults for the absent/garbage case: when `comment_visibility` is `undefined` or unrecognised, the fold treats it as `shared` (task 1). Do not add normalisation logic here — the helper owns the `internal → shared` coercion and the absent-default.

3. Make **no other change**: type/title/metadata logic, the override merge, the render step, and the lifecycle/tracker/fields-update branches are all untouched. The `description` slot stays comment-only.

4. Update the JSDoc `@param` block to document the new `comment_visibility` param (optional; `'shared' | 'internal'`; absent → `shared`; honoured only when the connection has `enable_internal_comments: true`).

## Acceptance Criteria

- `planEventDispatch` accepts `comment_visibility` and forwards it (plus `connection.enable_internal_comments`) to `foldCommentIntoEvent`.
- With `comment_visibility` absent → comment fans out to every bucket (shared default).
- With `comment_visibility: 'internal'` and `connection.enable_internal_comments: true` → single submitting-app bucket.
- With `comment_visibility: 'internal'` and the flag false/absent → coerced to shared (fan-out).
- Lifecycle paths (no comment) remain no-ops — unchanged.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test planEventDispatch` passes (extend `planEventDispatch.test.js` to assert `comment_visibility` flows to the fold and absent → shared).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — modify — destructure `comment_visibility`; pass it + `connection.enable_internal_comments` into `foldCommentIntoEvent`; update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.test.js` — modify — add cases covering the param flow and the absent-default.

## Notes

- Keep the planner pure — no I/O, no clock/id minting. The flag is read off the already-injected `connection`.
