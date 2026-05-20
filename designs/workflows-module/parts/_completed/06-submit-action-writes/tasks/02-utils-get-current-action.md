# Task 2: `utils/getCurrentAction.js` — fetch the user-submitted action

## Context

`SubmitWorkflowAction` operates on a `currentActionId` — the action id the user posted to. Step 1 (validate + translate) needs the full action doc to read `workflow_id`, `type`, `kind`, `key`, `status[0]`, etc. The per-entry write loop in step 4 (task 10) also reads the action doc per entry to apply the priority rule against `actionsEnum` — meaning every entry's write needs a current-state fetch.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/utils/getCurrentAction.js` (4 lines — pure dispatcher call to `MongoDBFindOne` on actions).

This task ships a single-purpose reader that mirrors the v0 shape but lives in the new `SubmitWorkflowAction/utils/` location.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/getCurrentAction.js`.

Signature:

```js
/**
 * Fetch one action doc by id. Used by `handleSubmit.js` step 1 (validate the
 * `currentActionId` exists) and by the per-entry write loop in step 4 (read
 * current state for the priority-rule comparison).
 *
 * @param {Object} context — engine handler context (has `mongoDBConnection`).
 * @param {Object} options
 * @param {string} options.actionId
 * @returns {Promise<Object | null>} — the action doc or null if not found.
 */
async function getCurrentAction(context, { actionId }) {
  return context.mongoDBConnection('actions').MongoDBFindOne({
    query: { _id: actionId },
  });
}

export default getCurrentAction;
```

No projection — callers need the full doc (status array for priority comparison, `type` + `key` for workflow lookup, `workflow_id` for downstream reads). The community-plugin `MongoDBFindOne` handler returns the full doc when `options.projection` is omitted.

Differs from `shared/getActionFields.js` (which exists for parts 5/10 and uses a 10-field projection): that helper is for cases where only the projection fields are needed (lighter network payload). For the submit lifecycle the full doc is needed, so this helper is a separate, simpler reader.

Per the [top-level § Testing conventions](../../../../design.md#testing-conventions), pure-function utilities table-driven without Mongo. This is one of the few utilities that **does** hit Mongo (a `MongoDBFindOne` dispatcher call) — so its test uses the `inMemoryMongo.js` helper from task 1.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/getCurrentAction.js`.
- Default export matches the signature above.
- Returns the action doc when found.
- Returns `null` when no action matches.
- Plugin builds cleanly.
- Colocated `getCurrentAction.test.js` covers: happy path (seeded action returned with all fields), missing-action returns `null`. Uses `inMemoryMongo.js` from task 1.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/getCurrentAction.js` — create — pure reader.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/getCurrentAction.test.js` — create — `inMemoryMongo`-backed tests for the two cases above.

## Notes

- This is one of three utility tasks (2, 3, 4) that can ship in parallel after the Jest harness from task 1 lands. None of them depends on the others.
- The test file's `context` argument needs a `mongoDBConnection` dispatcher — construct one via `createMongoDBConnection({ connection: { databaseUri: uri }, blockId, connectionId, pageId, requestId })` using the dispatcher already shipping at `plugins/modules-mongodb-plugins/src/connections/shared/createMongoDBConnection.js`.
