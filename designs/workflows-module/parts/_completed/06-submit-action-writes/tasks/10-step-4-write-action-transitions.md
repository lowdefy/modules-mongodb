# Task 10: Step 4 — Per-entry write loop, call extended `updateAction` per entry

## Context

[design.md § Lifecycle scaffold step 4](../design.md#lifecycle-scaffold):

> Write action transitions — per-entry loop over `actions[]`; each entry's write applies the priority rule + `currentActionId` self-exception + per-entry `force: true` bypass. Push to `status[]` with change stamps.

By this point in the lifecycle:

- Step 1 (task 8) populated `internal.actions` with one entry (the `currentActionId` slot).
- Step 3 (task 9) appended auto-unblock entries.
- `context.workflow`, `context.action`, `context.actionsConfig`, `context.workflowActions` are all cached.

The loop iterates each entry, calls the extended `updateAction` from task 5, and tracks the action ids that wrote successfully in `actionIds[]` (for the return shape's `action_ids` field).

Each entry's `(type, key)` triple — keyed entries with `keys: [...]` — fans out to multiple action docs. v1 always sends one key (or none) per [task 8 step 7](08-step-1-validate-and-translate.md#7-build-the-internal-actions-shape), so the fan-out is N=1, but the loop needs to handle the N≥1 case so part 9's pre-hook returns work without re-shaping the seam.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/handleUpdateActions.js` shows the shape: for each entry, find matching docs by `(workflow_id, type, key)`, call `updateAction` per doc, collect the resulting action ids. The new shape is the same with the priority-rule branch now inside `updateAction.js` (task 5) rather than in a separate `shouldUpdate` call site.

## Task

Replace the `// Step 4 — Write action transitions` TODO in `handleSubmit.js` with the per-entry loop body.

### 1. Build a docs-by-`(type, key)` lookup from `context.workflowActions`

```js
function findMatchingActionDocs({ workflowActions, type, key }) {
  return workflowActions.filter((doc) => {
    if (doc.type !== type) return false;
    if (key === null || key === undefined) {
      // Non-keyed entry matches the unique non-keyed doc for the type.
      return doc.key === null;
    }
    return doc.key === key;
  });
}
```

Place this either inline in `handleSubmit.js` or extract to `./utils/findMatchingActionDocs.js`. Lean: inline (one call site, ~10 LOC); extract if it grows.

### 2. Per-entry loop

```js
import updateAction from '../../shared/updateAction.js';
// ...

// Step 4 — Write action transitions (per-entry loop with priority rule).
for (const entry of internal.actions) {
  const keys = entry.keys ?? [null];
  for (const key of keys) {
    const matchingDocs = findMatchingActionDocs({
      workflowActions: context.workflowActions,
      type: entry.type,
      key,
    });

    if (matchingDocs.length === 0) {
      // Per-hook upsert path lands in part 9. v1 has no upsert entries, so a
      // missing match is silently skipped — `keys: []` semantics from the engine
      // spec (`[]` → zero ops). Document but don't throw.
      continue;
    }

    for (const doc of matchingDocs) {
      const result = await updateAction(context, {
        actionId: doc._id,
        newStage: entry.status,
        fields: entry.fields,
        eventId: context.eventId,
        currentActionId: internal.currentActionId,
        force: entry.force === true,
      });

      if (result !== null) {
        actionIds.push(doc._id);
        // Update the in-memory cache so step 5's summary recompute reads the post-write state.
        doc.status = [
          {
            stage: entry.status,
            event_id: context.eventId,
            created: context.changeStamp,
          },
          ...(doc.status ?? []),
        ];
        doc.updated = context.changeStamp;
      }
    }
  }
}
```

Key behaviour:

- `keys ?? [null]` — entries without an explicit `keys` array produce one iteration with `key = null` (non-keyed action), matching the engine-spec rule "omitted → one op `key: null`."
- `result !== null` — `updateAction` returns `null` when the priority rule rejects the write. Only track action ids that actually wrote.
- **In-memory cache update.** Step 5 (task 11) recomputes the summary from `context.workflowActions`, but it needs the post-write state. Updating `doc.status` in place after each successful write is the cheapest correct option (avoiding a re-read of the action set from Mongo). The new status entry uses the same shape `updateAction.js` writes via `$push: { $position: 0, $each: [...] }`.
- **No `upsert` handling in v1.** `shouldCreate.js` (task 4) exists for part 9 to wire in pre-hook `upsert: true` entries — v1 just silently skips no-match entries. Add a comment marker:

  ```js
  // PART 9 EXTENSION: pre-hook entries with `upsert: true` land in part 9; the
  // create branch goes here (call `shouldCreate(entry, matchingDocs)`; if true,
  // call `createAction` from `../../shared/createAction.js` and append the new
  // doc's id to actionIds + workflowActions). v1 has no upsert entries.
  ```

### 3. Track `currentActionId` in `actionIds`

Per v0's posture (`handleUpdateActions.js` always adds `currentActionId` to the returned set, regardless of whether the write landed) — the engine returns the user-submitted action id even if its push was a same-stage no-op on a non-self-exempted action. v1 keeps the same posture for compatibility with downstream consumers (part 16 templates, part 18 components) that expect the submitted id back:

```js
// Always include the user-submitted action id in the returned set, even if
// its write no-op'd due to priority rule. Matches v0's posture.
if (internal.currentActionId && !actionIds.includes(internal.currentActionId)) {
  actionIds.push(internal.currentActionId);
}
```

Place this after the loop.

## Acceptance Criteria

- Step 4's TODO marker in `handleSubmit.js` is replaced with the per-entry loop.
- Each entry's `keys ?? [null]` is iterated; matching action docs found via `(type, key)` filter on `context.workflowActions`.
- `updateAction` called per (entry × matching doc) with `currentActionId` and `force` correctly threaded.
- Action ids whose write landed are appended to `actionIds`.
- `currentActionId` is always present in `actionIds`, even on same-stage no-op.
- The in-memory `context.workflowActions` cache is updated in place after each successful write so step 5 sees post-write state.
- No-match entries silently skipped with a PART 9 comment marker.
- `handleSubmit.test.js` extended with cases (using `inMemoryMongo`):
  - Single-entry submit on a form action transitioning `action-required → in-review` (review verb): the push lands; `action_ids` contains the id.
  - Single-entry submit on a form action where the action is already `done`: same-stage no-op via non-self priority rule; `action_ids` still contains the id (the always-include rule); the action doc shows no new status entry.
  - Single-entry submit where the same-stage push is the `currentActionId` self-exception: writes a fresh audit entry; `action_ids` contains the id.
  - Two entries (the currentActionId entry + one auto-unblock entry for a different type): both write; `action_ids` contains both ids.
  - Auto-unblock entry pointing at a non-existent action type: silently skipped (no throw, no id added).
  - Entry with `force: true` overriding a priority rejection (engine-internal callers): write lands.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — fill in step 4 body.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the six cases above.

## Notes

- **Sequential, not parallel.** v0's `handleUpdateActions.js` does `Promise.all(actions.map(...))` for parallelism. The new design uses sequential `await` per entry, per [engine/spec.md § Client and transaction model](../../../../workflows-module-concept/engine/spec.md#client-and-transaction-model): "Ordering inside a handler invocation is preserved (sub-steps are awaited sequentially), but atomicity is not." Sequential is the documented posture; don't introduce parallelism here.
- **Why update `context.workflowActions` in place.** Without it, step 5's summary recompute reads the pre-write state and writes the wrong counts. The cleanest alternative would be a re-read after step 4 — but the in-place update is cheap (no I/O) and matches the engine's "sequential through the shared dispatcher" posture. The action docs cache is throw-away (request-scoped); mutating it is safe.
- **`actionIds` is a plain array, not a `Set`.** v0 used a `Set` to de-duplicate; the new design's flow naturally avoids duplicates (each `(type, key)` pair maps to at most one doc; the same-id always-include guard checks `!includes`). Plain array keeps the code shorter.
- **The `keys: []` silent no-op footgun.** Per [engine/spec.md § SubmitWorkflowAction payload](../../../../workflows-module-concept/engine/spec.md#submitworkflowaction-payload) and [design.md § Payload](../design.md#payload), an entry with `keys: []` writes zero ops. v1 never produces such entries (step 1 always normalizes to `[k]` or omitted), but if a pre-hook return (part 9) supplies `keys: []`, the loop naturally writes zero docs because the inner `for (const key of keys)` skips empty arrays. No throw; documented behaviour.
