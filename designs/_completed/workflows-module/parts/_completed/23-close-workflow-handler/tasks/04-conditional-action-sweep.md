# Task 4: Conditional action sweep — bulk three-step

## Context

After Task 3, the workflow doc carries a `completed` status entry. This task sweeps non-terminal actions to `not-required`, but **conditionally** — actions with `required_after_close: true` survive unless they're also `blocked`.

From [design.md § Action sweep](../design.md):

> Sweep when `status.0.stage NOT IN [done, not-required]` AND (`required_after_close ≠ true` OR `status.0.stage = blocked`).
>
> The blocked-action exception is load-bearing: a `required_after_close: true` action that's `blocked` still gets swept, because the user can't act on it post-close anyway and leaving it lingering would be a footgun.

This diverges from shipped `CancelWorkflow.js:73–93`'s blanket sweep (which flips every non-terminal action without consulting `required_after_close`). The `required_after_close` flag lives in `workflowsConfig[].actions[]` (per-action-type), not on action docs — so the filter has to run in-memory in JavaScript, not in the Mongo query.

The design mandates a three-step pattern ([design.md:28–31](../design.md)):

1. **Fetch candidates** via `MongoDBFind` (same query as `CancelWorkflow.js:73–79` but with `status: { $slice: 1 }` added so the blocked-exception can be evaluated in-memory).
2. **Filter in-memory** against `workflowsConfig` for `required_after_close ≠ true` OR `status.0.stage === 'blocked'`.
3. **Bulk write** the filtered set via `MongoDBUpdateMany`. Bypasses the priority rule by writing directly — does NOT go through `shared/updateAction.js` (per the engine spec's per-doc force vs bulk-bypass split).

`workflowsConfig` is on `context` already (Task 1 set it). Resolve the workflow's config entry by `workflowDoc.workflow_type`, then index its `actions[]` by `type` for fast lookup.

## Task

### 1. Resolve the workflow config and build the `required_after_close` lookup

After Task 3's status push:

```js
const workflowConfig = (context.workflowsConfig ?? []).find(
  (w) => w.type === context.workflow.workflow_type,
);
const requiredAfterCloseByType = Object.fromEntries(
  (workflowConfig?.actions ?? []).map((a) => [
    a.type,
    a.required_after_close === true,
  ]),
);
```

Missing config → empty lookup, every action gets swept (defensive default — a workflow that has no config can't have honoured `required_after_close` flags, so the conservative behaviour is the cancel-equivalent blanket sweep).

### 2. Fetch candidate non-terminal actions

```js
const candidateActions =
  (await context.mongoDBConnection("actions").MongoDBFind({
    query: {
      workflow_id: payload.workflow_id,
      "status.0.stage": { $nin: ["done", "not-required"] },
    },
    options: {
      projection: {
        _id: 1,
        type: 1,
        key: 1,
        status: { $slice: 1 },
      },
    },
  })) ?? [];
```

The `status: { $slice: 1 }` projection gives the latest entry only — enough to evaluate the blocked-exception.

### 3. Filter in-memory

```js
const actionsToSweep = candidateActions.filter((a) => {
  const isBlocked = a.status?.[0]?.stage === "blocked";
  const requiredAfterClose = requiredAfterCloseByType[a.type] === true;
  // Sweep when not protected, OR when blocked (blocked-action exception).
  return !requiredAfterClose || isBlocked;
});
const actionIds = actionsToSweep.map((a) => a._id);
```

### 4. Bulk write the sweep

```js
if (actionIds.length > 0) {
  await context.mongoDBConnection("actions").MongoDBUpdateMany({
    filter: { _id: { $in: actionIds } },
    update: {
      $set: { updated: context.changeStamp },
      $push: {
        status: {
          $position: 0,
          $each: [{ stage: "not-required", created: context.changeStamp }],
        },
      },
    },
  });
}
```

Same write shape as `CancelWorkflow.js:80–93`. No event-stamp on the entry (cancel doesn't carry one either — engine-internal force-pushes generally don't generate audit events).

Stash `actionIds` on `context` for Task 6's return:

```js
context.sweptActionIds = actionIds;
```

## Acceptance Criteria

Add unit tests to `CloseWorkflow.test.js`. Use the shipped `seedAction` pattern from `CancelWorkflow.test.js:68–80`. Add a `requiredAfterClose` boolean to the `workflowsConfig.actions[]` fixture for tests that exercise the filter.

- **Blanket non-terminal sweep (no `required_after_close` flags):** seed two actions in `action-required` + one in `done`; assert the two action-required ones now have `status[0].stage === 'not-required'` and the `done` one is untouched (no new status entry).
- **Skip `required_after_close: true` non-blocked:** seed an `action-required` action whose config has `required_after_close: true`; assert it's NOT swept (`status[0].stage` stays `action-required`).
- **Sweep `required_after_close: true` when `blocked`:** seed a `blocked` action whose config has `required_after_close: true`; assert it IS swept (`status[0].stage === 'not-required'`). This is the blocked-action exception.
- **Mixed:** seed (a) `action-required` no-flag → swept; (b) `action-required` with flag → survives; (c) `blocked` with flag → swept; (d) `done` no-flag → untouched. Assert all four outcomes.
- **Empty sweep:** seed a workflow with only `done` and `not-required` actions; assert no `MongoDBUpdateMany` write happens (no new status entries on any action). The `actionIds.length > 0` guard handles this; tests verify the guard works.
- **Missing config defaults to blanket sweep:** call with `workflowsConfig: []` (no entry for the workflow's type); seed one `action-required` action with no flag info available; assert it's swept. (Defensive default — empty `requiredAfterCloseByType` → every candidate gets swept.)
- **Returned action_ids list:** test the post-task-6 return shape that `action_ids` equals the swept set (this can be deferred to Task 6's tests, but if Task 4 happens to populate the return via `context.sweptActionIds`, smoke-check it here).
- **Pre-existing `not-required` action untouched:** seed an action already at `not-required`; assert no new status entry is pushed (the `$nin` filter excludes it).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — add config lookup, candidate fetch, in-memory filter, bulk write.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — add eight tests above.

## Notes

- The bulk-bypass posture is named in [engine spec § Priority rule](../../../../workflows-module-concept/engine/spec.md#priority-rule) (lines 309–310): "Bulk bypass via `MongoDBUpdateMany` — `CancelWorkflow`'s sweep, `CloseWorkflow`'s sweep." Do NOT use `shared/updateAction.js` here, not even with `force: true` — the engine spec is explicit that bulk sweeps bypass the priority rule by structure (writing directly via the bulk dispatcher), not by flag.
- Be careful about `null` keys on instanced (keyed) actions. `requiredAfterCloseByType` is keyed by `type` only; a keyed action with `key: 'serial-123'` and `type: 'install-device'` still inherits its `required_after_close` from the type-level config. That's correct — the design says the flag lives "per-action-type", not per-action-instance.
- If `workflowsConfig` is somehow missing for the workflow's `workflow_type`, the empty-lookup fallback produces a blanket sweep. This is conservative — under the design's contract this shouldn't happen (the config is required at handler entry) but defensive code keeps the handler from throwing on a missing-config edge case.
- `actionIds.length > 0` guard before `MongoDBUpdateMany` — mirrors `CancelWorkflow.js:80`. Some in-memory Mongo implementations throw on empty `$in` filters; the guard sidesteps that.
