# Task 5: Extend `shared/updateAction.js` in place — add the priority-rule branch

## Context

Part 5 shipped a `force: true`-only scaffold of `updateAction.js` at `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`. Its current body:

```js
async function updateAction(context, { actionId, newStage, fields = {}, eventId = null, force }) {
  if (force !== true) {
    throw new Error(
      'updateAction: priority-rule path is part 06 scope; this scaffold requires force: true'
    );
  }
  return context.mongoDBConnection('actions').MongoDBUpdateOne({
    filter: { _id: actionId },
    update: {
      $set: { updated: context.changeStamp, ...fields },
      $push: {
        status: {
          $position: 0,
          $each: [{ stage: newStage, event_id: eventId, created: context.changeStamp }],
        },
      },
    },
  });
}
```

Part 5's [Contract to neighbours](../../05-start-cancel-handlers/design.md#contract-to-neighbours) and part 6's [Sub-modules list](../design.md#sub-modules) both commit to **extending this file in place** rather than introducing a `SubmitWorkflowAction/`-nested copy. The priority-rule branch lives here so existing callers (parts 5, 10, 23) consume the same helper without import-path changes.

Callers after this task lands:

- `StartWorkflow`'s parent-link push — passes `force: true` (unchanged).
- `CancelWorkflow`'s `not-required` sweep — passes `force: true` (unchanged).
- Tracker subscription (part 10) — passes `force: true` (unchanged).
- `CloseWorkflow`'s sweep (part 23) — passes `force: true` (future).
- Pre-hook returned `actions[]` entries (part 9) — may pass `force: true` per-entry; otherwise priority-rule branch applies.
- **The per-entry write loop in step 4 (task 10) — this is the new caller.** It passes `currentActionId` for the self-exception and lets `shouldUpdate` decide whether the write lands.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/updateAction.js` does the write itself using `$concatArrays` in a pipeline-update form. The current scaffold uses the `$push: { $position: 0, $each: [...] }` shape — keep that shape (newest-at-index-0); the priority-rule branch only adds a pre-write gate.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js`.

### 1. Update the signature

Accept `currentActionId` (for the self-exception). Make `force` optional (default `false`):

```js
/**
 * Update one action doc — push a new status entry, optionally set additional fields.
 *
 * Apply the priority rule by default: looks up the current action via
 * `getCurrentAction`, runs `shouldUpdate` against `context.actionsEnum`, and
 * either writes the status push or no-ops (caller sees a falsy return).
 *
 * Per-entry `force: true` bypasses the priority rule for this call only —
 * used by engine-internal force-pushes (`StartWorkflow`'s parent push,
 * `CancelWorkflow`'s sweep, tracker subscription, `CloseWorkflow`'s sweep
 * from part 23, pre-hook returns from part 9).
 *
 * Self-exception: same-stage allowed for the action whose id matches
 * `currentActionId`. A re-click writes a fresh status entry — audit history
 * is the source of truth for "user did this again" (part 6 design § Priority rule).
 *
 * @param {Object} context — engine handler context (`mongoDBConnection`, `changeStamp`, `actionsEnum`).
 * @param {Object} options
 * @param {string} options.actionId
 * @param {string} options.newStage
 * @param {Object} [options.fields] — additional `$set` fields.
 * @param {string | null} [options.eventId]
 * @param {string | null} [options.currentActionId] — used only for the self-exception.
 *   Falsy = no self-exception applies (engine-internal callers pass null).
 * @param {boolean} [options.force] — defaults to false. `true` bypasses the priority rule.
 * @returns {Promise<any | null>} — dispatcher result on write; `null` when priority rule rejected.
 */
async function updateAction(
  context,
  { actionId, newStage, fields = {}, eventId = null, currentActionId = null, force = false }
) {
  // ...
}
```

### 2. Add the priority-rule branch

Imports at the top of the file:

```js
import getCurrentAction from '../WorkflowAPI/SubmitWorkflowAction/utils/getCurrentAction.js';
import shouldUpdate from '../WorkflowAPI/SubmitWorkflowAction/utils/shouldUpdate.js';
```

(The utilities live under `SubmitWorkflowAction/utils/` per part 6's Sub-modules list and tasks 2/3. The import path crosses connection-handler boundaries but the file layout already permits that — `shared/createMongoDBConnection.js` is imported into all three handlers, mirroring the same shape.)

Body:

```js
async function updateAction(context, options) {
  const { actionId, newStage, fields = {}, eventId = null, currentActionId = null, force = false } = options;

  if (force !== true) {
    const fetchedAction = await getCurrentAction(context, { actionId });
    if (!fetchedAction) {
      throw new Error(`updateAction: action ${actionId} not found`);
    }
    const allow = shouldUpdate({
      actionsEnum: context.actionsEnum,
      currentActionId,
      actionEntry: { type: fetchedAction.type, status: newStage, force: false },
      fetchedAction,
    });
    if (!allow) {
      return null;
    }
  }

  return context.mongoDBConnection('actions').MongoDBUpdateOne({
    filter: { _id: actionId },
    update: {
      $set: { updated: context.changeStamp, ...fields },
      $push: {
        status: {
          $position: 0,
          $each: [{ stage: newStage, event_id: eventId, created: context.changeStamp }],
        },
      },
    },
  });
}

export default updateAction;
```

Behaviour:

- `force === true` → preserve the existing write path. No `getCurrentAction` call, no priority check. Existing callers (parts 5, 10, 23, pre-hook entries) behave identically.
- `force !== true` → load the action via `getCurrentAction`, run `shouldUpdate`, either write (returns dispatcher result) or no-op (returns `null`).
- Per-entry `force: true` from the caller flows in via `options.force`. The `actionEntry.force` field in `shouldUpdate`'s args is intentionally hard-coded `false` here — by the time control reaches `shouldUpdate`, the outer `force !== true` check has already filtered the force path, so the entry-level `force` field would be redundant in the inner check.
- Returning `null` on priority-rule rejection (rather than throwing) lets the per-entry write loop in step 4 (task 10) iterate without breaking on no-op entries.

### 3. Update the file's JSDoc note

Drop the "v1 scope: supports `force: true` only" line. Replace with: "Part 6 extension landed: per-entry priority-rule branch active. Force-bypass path preserved for engine-internal callers."

## Acceptance Criteria

- `updateAction.js` accepts `currentActionId` and a defaulting `force = false`.
- `force === true` path writes the same `$push: { $position: 0, $each: [...] }` shape as the part-5 scaffold (no behaviour change for existing callers).
- `force !== true` path loads the action via `getCurrentAction`, runs `shouldUpdate`, writes on `true` and returns `null` on `false`.
- Missing action (`getCurrentAction` returns `null`) on the non-force path throws a precise error.
- Plugin builds cleanly.
- Colocated `updateAction.test.js` covers (using `inMemoryMongo` from task 1):
  - Force path writes regardless of priority (seed an `in-review` action; push `done` with `force: true`; assert the push lands).
  - Non-force path rejects same-stage on non-self entries (seed `done`; push `done` without force; assert no write).
  - Non-force path allows same-stage on the `currentActionId` (seed `in-review`; push `in-review` with `currentActionId` matching; assert audit entry lands).
  - Non-force path allows lower-priority transition (seed `action-required`, priority 6; push `in-review`, priority 4; assert lands).
  - Non-force path rejects higher-priority transition (seed `done`, priority 3; push `action-required`, priority 6; assert no write).
- Existing callers in part 5 (`StartWorkflow`, `CancelWorkflow`) continue to work without source changes — manually verify by reading their call sites and confirming the function signature accepts the same options.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — modify — add priority-rule branch, accept `currentActionId`, default `force = false`.
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.test.js` — create — `inMemoryMongo`-backed tests for the five cases above.

## Notes

- **Cross-package-path import.** Importing `getCurrentAction` and `shouldUpdate` from `../WorkflowAPI/SubmitWorkflowAction/utils/` is a slightly unusual shape — utilities are usually consumed by code within the same handler directory. But the design's [Sub-modules list](../design.md#sub-modules) puts these utilities under `SubmitWorkflowAction/utils/` (matching v0's layout) while keeping `updateAction.js` in `shared/` (so parts 5/10/23 can import it without crossing into a sibling handler directory). The asymmetry is intentional — `updateAction` is a *shared* helper that *uses* a SubmitWorkflowAction-specific utility, but parts 5/10/23 don't need to see the utility, only the extended `updateAction` interface.
- The `actionEntry.force = false` hard-coded value inside `shouldUpdate` is correct because the outer `force !== true` check on `options.force` already filtered the force case. Don't worry about it being a per-entry vs per-call confusion — there is no per-call surface; `options.force` *is* the per-entry force flag (the loop in task 10 passes it through from each entry).
- Existing callers in part 5 pass `force: true` explicitly. They keep working unchanged. The `currentActionId` field defaults to `null` — engine-internal callers (parts 5, 10, 23) don't need to pass it.
