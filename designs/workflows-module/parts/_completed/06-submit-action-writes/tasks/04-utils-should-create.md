# Task 4: `utils/shouldCreate.js` — upsert gate for pre-hook `actions[]` entries

## Context

[Submit-pipeline/spec.md § Pre-hook return](../../../../workflows-module-concept/submit-pipeline/spec.md) commits this pre-hook return shape:

```
actions: array
  - { type, key, status, fields, upsert, force }
```

`upsert: true` on a pre-hook-returned entry tells the engine to **create** a new action doc for a keyed action that doesn't yet exist (the "spawn instances" path from [action-authoring/spec.md § Keyed actions](../../../../workflows-module-concept/action-authoring/spec.md)). Without `upsert`, an entry for a `(type, key)` triple that has no matching action doc no-ops.

Pre-hook plumbing lands in [part 9](../../09-hook-invocation/design.md), not here. But the `shouldCreate.js` utility lands now per part 6's [Sub-modules list](../design.md#sub-modules) so part 9 can wire it in without needing to ship the utility itself. Part 6's lifecycle scaffold (the per-entry write loop in step 4) doesn't itself call `shouldCreate` — it's only relevant when `actions[]` contains pre-hook entries with `upsert: true`, which only happens after part 9 lands.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/utils/shouldCreate.js` (4 lines).

```js
function shouldCreate({ actionUpdate, fetchedActions }) {
  return (
    (!fetchedActions || fetchedActions.length === 0) && actionUpdate.upsert
  );
}
export default shouldCreate;
```

The v0 shape is exactly what's needed — the design's only divergence from v0 here is naming (the new design uses `actionEntry` instead of v0's `actionUpdate` for the entry name, matching task 3's signature).

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldCreate.js`.

Signature:

```js
/**
 * Gate for the `upsert: true` path: returns `true` when no action doc exists
 * for the entry's `(type, key)` triple AND the entry opts into `upsert: true`.
 *
 * Used by the per-entry write loop in step 4 (task 10) to branch between an
 * update path (call `updateAction`) and an insert path (call `createAction`,
 * the helper from part 5). The insert path is only exercised by pre-hook
 * returns (part 9) — v1 of this part never returns `true` here, because
 * pre-hook entries don't exist in part 6's `actions[]` yet.
 *
 * @param {Object} args
 * @param {Object} args.actionEntry — `{ type, key?, status, fields?, upsert?, force? }`.
 * @param {Array<Object>} args.fetchedActions — actions matching `(workflow_id, type, key)`.
 *   Empty array (or null/undefined) means no doc exists yet for this triple.
 * @returns {boolean}
 */
function shouldCreate({ actionEntry, fetchedActions }) {
  return (
    (!fetchedActions || fetchedActions.length === 0) &&
    actionEntry.upsert === true
  );
}

export default shouldCreate;
```

Behaviour:

- Returns `true` only when both conditions hold: no matching action docs **and** `actionEntry.upsert === true`.
- Strict equality on `upsert === true` — `upsert: 'yes'` or other truthy values do not match. Matches v0's posture (v0 uses bare `actionUpdate.upsert` which is looser; tighten here for clarity).
- Pure function. No Mongo, no I/O.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldCreate.js`.
- Default export matches the signature above.
- Returns `true` only on `(no matching docs) AND upsert === true`.
- Returns `false` when matching docs exist (regardless of `upsert`).
- Returns `false` when no matching docs but `upsert` is undefined / false / `'yes'`.
- Pure function — colocated `shouldCreate.test.js` is table-driven and doesn't need `inMemoryMongo`.
- Plugin builds cleanly.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldCreate.js` — create — pure upsert gate.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldCreate.test.js` — create — table-driven cases for the four combinations of (matching-docs × upsert).

## Notes

- This utility is **not consumed by any caller in part 6**. It lands here per the design's Sub-modules list so the file exists when part 9 wires in pre-hook returns. Part 9 will import it from this exact path.
- v0 used `actionUpdate.upsert` (truthy). Tightening to `=== true` here avoids surprising behaviour from a typo'd pre-hook return value like `upsert: 'yes'` — the hook author gets a no-op (with a way to debug) rather than an unintended insert.
