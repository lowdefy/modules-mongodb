# Task 4: Type cleanup — drop polymorphic `StatusEntry` fields and the `error_transition` return field

## Context

`plugins/modules-mongodb-plugins/src/connections/shared/types.js` defines a `StatusEntry` typedef that lists optional `reason`, `error_message`, and `error_metadata` fields. No shipped writer in the repo ever populates those fields on a status doc — they were aspirational polymorphic-error fields that Part 29 retires (per design § D2a). The handler return type in the same file (or wherever it lives) advertises an `error_transition` field that Part 29 also removes.

## Task

### `plugins/modules-mongodb-plugins/src/connections/shared/types.js`

- Remove the optional `reason`, `error_message`, and `error_metadata` properties from the `StatusEntry` JSDoc typedef. The cleaned-up shape:

  ```js
  /**
   * @typedef {Object} StatusEntry
   * @property {string} stage
   * @property {ChangeStamp} created
   * @property {string} [event_id]
   */
  ```

  (Add `event_id` if it isn't already present — every entry shipped writers produce carries `event_id` per `shared/updateAction.js`.)

- If a `SubmitWorkflowActionResult` typedef (or equivalent) is documented in this file or anywhere else under `plugins/modules-mongodb-plugins/src/connections/`, drop the `error_transition` field from it. Search the package for any other JSDoc / TS surface that mentions `error_transition` — there should be none after this task.

### Verification

Search for any remaining references to the dropped fields (these should all be eliminated after Tasks 4 and 5; this task is responsible for the type-surface ones):

```bash
rg -n 'error_transition' plugins/
rg -n 'error_message|error_metadata' plugins/
rg -n 'reason' plugins/modules-mongodb-plugins/src/connections/shared/types.js
```

The first two should return only matches that Task 5 will remove (in `handleSubmit.js` and tests). The third should return nothing.

## Acceptance Criteria

- `StatusEntry` typedef has only `stage`, `created`, and `event_id`.
- No JSDoc surface advertises `error_transition`.
- Repo searches confirm no type-level mention of `reason` / `error_message` / `error_metadata` remains in `shared/types.js`.
- `pnpm test` (or the equivalent in this repo) still passes — no test depends on these JSDoc fields.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify.
- (Any other JSDoc / type-surface file that advertises `error_transition` — modify; none expected besides `shared/types.js`.)

## Notes

- This task is doc-shape only (JSDoc). Runtime code that writes / returns these fields is the subject of Task 5.
- The `event_id` addition to `StatusEntry` documents what's already written — verify against `shared/updateAction.js:70-82` if uncertain.
