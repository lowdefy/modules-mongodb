# Task 3: Build the `updateAction` helper scaffold (`force: true` only)

## Context

`updateAction.js` lives in `plugins/modules-mongodb-plugins/src/connections/shared/`. This task ships a **minimal scaffold** — enough surface to support:

- `StartWorkflow`'s parent-link push: set `child_workflow_id`, `child_entity_id`, `child_entity_collection`, and `$push` `in-progress` to the parent tracker action's status using `force: true` (task 5 calls this).
- `CancelWorkflow`'s non-terminal flips: `$push` `not-required` onto every open action's status using `force: true` (task 6 calls this).

Both use cases bypass the priority rule via `force: true`. The full priority-rule + idempotency-guarded path lands in part 6 (`SubmitWorkflowAction`) — part 6 **extends this scaffold in place** rather than replacing it. So the API surface this task ships must compose with what part 6 adds.

V0 reference: the v0 `UpdateWorkflowActions.updateAction` helper uses `MongoDBUpdateOne` with the pipeline-update form to prepend a status entry. The newest-at-index-0 pattern (`$position: 0, $each: [...]`) is the same one v0's `CloseWorkflowActions.handleCloseActions` uses with `MongoDBUpdateMany`.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`.

Signature:

```js
/**
 * Update one action doc — push a new status entry, optionally set additional fields.
 *
 * v1 scope: supports `force: true` only (callers explicitly opt in). The priority-rule path
 * lands in part 6, which extends this function in place. Until then, every caller passes
 * `force: true`; calls without `force: true` throw a precise error.
 *
 * @param {Object} context — engine handler context (has `mongoDBConnection`, `changeStamp`).
 * @param {Object} options
 * @param {string} options.actionId
 * @param {string} options.newStage — the status enum key to push (`in-progress`, `not-required`, etc.).
 * @param {Object} [options.fields] — additional `$set` fields (e.g. `child_workflow_id`, `child_entity_id`).
 * @param {string} [options.eventId]
 * @param {boolean} [options.force] — required `true` in v1; future task in part 6 makes this optional.
 * @returns {Promise<void>}
 */
async function updateAction(context, { actionId, newStage, fields = {}, eventId, force }) {
  // ...
}

export default updateAction;
```

Behaviour:

1. **Force gate.** If `force !== true`, throw `new Error('updateAction: priority-rule path is part 06 scope; this scaffold requires force: true')`. Part 6 will replace this throw with the real priority-rule check.

2. **Build the update.** Use the community-plugin `MongoDBUpdateOne` request via `context.mongoDBConnection('actions').MongoDBUpdateOne({ filter, update })`:

   ```js
   {
     filter: { _id: actionId },
     update: {
       $set: {
         updated: context.changeStamp,
         ...fields,
       },
       $push: {
         status: {
           $position: 0,
           $each: [
             {
               stage: newStage,
               event_id: eventId,
               created: context.changeStamp,
             },
           ],
         },
       },
     },
   }
   ```

   The `$position: 0` + `$each` pattern keeps status history newest-at-index-0 (matches v0's `handleCloseActions.js` pattern and the engine spec's idempotency guards which read `status[0].stage`).

3. **Return** whatever the dispatcher returns (community plugin's standard shape). No translation.

## Acceptance Criteria

- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` exports a default function matching the signature above.
- Throws a precise error if called without `force: true`.
- When called with `force: true`, calls `mongoDBConnection('actions').MongoDBUpdateOne` with the filter/update shape above.
- The status entry is pushed at position 0 (`$push: { status: { $position: 0, $each: [...] } }`).
- Additional `fields` (e.g. `child_workflow_id`, `child_entity_id`, `child_entity_collection`) are `$set` alongside `updated`.
- Plugin builds cleanly.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — create — `force: true`-only status push.

## Notes

- **Part 6's extension contract.** Part 6 will keep this file but add the priority-rule branch: if `force` is falsy, read the current action via `getCurrentAction.js` / `shouldUpdate.js` (also part 6 scope), compare priorities against `context.actionsEnum`, and either run the same `$push` shape or no-op. The `force: true` branch this task ships stays load-bearing for the tracker subscription (part 10) and the cancel path.
- **Why a `force` flag instead of two separate functions.** The design's "Contract to neighbours" line commits part 6 to extending this file in place. Splitting into `forceUpdateAction.js` + `updateAction.js` would mean two call sites in part 5 for what is one logical operation.
- The community-plugin `MongoDBUpdateOne` handler owns BSON serialization and the `MongoClient` lifecycle. This function just shapes the request; the dispatcher does the rest.
