# Task 5: Recompute `summary` + `groups[]` and write back

## Context

After Task 4's sweep, the workflow's action set is in its final post-close shape. This task recomputes the workflow-level `summary` (`{ done, not_required, total }`) and the per-group `groups[]` array against that shape, then writes both back to the workflow doc in one `MongoDBUpdateOne`.

From [design.md:33](../design.md):

> Recompute and write `summary` + `groups[]` inline against the post-sweep action set — same inline shape as shipped `CancelWorkflow.js:96–127` (re-read all actions with `{ status: { $slice: 1 }, action_group: 1 }` projection, compute counts, call `recomputeGroups`, write both in one `MongoDBUpdateOne`).

The key asymmetry from cancel ([design.md:34](../design.md)):

> Groups with `required_after_close: true` survivors land at whatever `deriveGroupStatus` returns — likely `in-progress` or `blocked`, not `done`. This is an asymmetry with cancel (where every group lands at `done` because every action is terminal post-sweep), and it's intentional.

In cancel, every action is terminal after the blanket sweep, so every group derives `done` via the empty-non-terminal-set convention. In close, `required_after_close: true` survivors keep their non-terminal status (typically `action-required` or `in-review`), so any group containing them derives `in-progress` or `blocked`. The workflow lands `completed` but with non-`done` groups — truthful per-group status; UI consumers decide whether to surface group status on terminal workflows.

`recomputeGroups` lives at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js` — same import path `CancelWorkflow.js:2` uses. Its signature (from shipped code):

```js
recomputeGroups({ declaredGroups, actions })
```

- `declaredGroups`: array from `workflowConfig.action_groups` (or `[]` if absent).
- `actions`: projected action docs with `action_group` and `status.[0]` (the `$slice: 1` projection produces this shape).

Returns `[{ id, status, summary: { done, not_required, total } }]`, one entry per declared group.

## Task

Inside `CloseWorkflow.js`, after Task 4's sweep block:

### 1. Resolve declared groups

```js
const declaredGroups = workflowConfig?.action_groups ?? [];
```

(Reuse the `workflowConfig` local from Task 4 — don't re-resolve.)

### 2. Re-read all actions with the recompute projection

```js
const allActions = await context.mongoDBConnection('actions').MongoDBFind({
  query: { workflow_id: payload.workflow_id },
  options: {
    // Project the first status entry as a 1-element slice — MongoDB can't
    // dot-project nested-array-index fields like `status.0.stage`.
    projection: { status: { $slice: 1 }, action_group: 1 },
  },
}) ?? [];
```

Same projection shape as `CancelWorkflow.js:103–109`.

### 3. Compute summary counts

```js
const total = allActions.length;
const done = allActions.filter((a) => a.status?.[0]?.stage === 'done').length;
const not_required = allActions.filter(
  (a) => a.status?.[0]?.stage === 'not-required',
).length;
```

`summary` counts only the two terminal stages, matching cancel's convention. Non-terminal survivors (the `required_after_close: true` actions) contribute to `total` but not to `done`/`not_required` — readers can derive "still open" as `total - done - not_required`.

### 4. Recompute groups

```js
import recomputeGroups from '../SubmitWorkflowAction/recomputeGroups.js';
// (at top of file)

const groups = recomputeGroups({ declaredGroups, actions: allActions });
```

The default groups-derivation logic handles the asymmetry automatically: groups with non-terminal members land non-`done`. No close-specific override needed.

### 5. Write back

```js
await context.mongoDBConnection('workflows').MongoDBUpdateOne({
  filter: { _id: payload.workflow_id },
  update: {
    $set: {
      summary: { done, not_required, total },
      groups,
      updated: context.changeStamp,
    },
  },
});
```

Same shape as `CancelWorkflow.js:120–127`.

## Acceptance Criteria

Add unit tests to `CloseWorkflow.test.js`:

- **Summary counts match post-sweep state:** seed two `action-required` actions (no flag) + one `done` + one `not-required`. After close, `summary = { done: 1, not_required: 3, total: 4 }` — the two swept now count toward `not_required`.
- **Summary asymmetry — `required_after_close: true` survivor:** seed one `action-required` no-flag + one `action-required` with `required_after_close: true`. After close, `summary = { done: 0, not_required: 1, total: 2 }` — the survivor contributes to `total` but not to either terminal bucket.
- **Groups: every action terminal → group `done` (parity with cancel):** seed two actions in group `phase-1`, both no-flag, both `action-required`. After close, both swept; group `phase-1` lands `{ id: 'phase-1', status: 'done', summary: { done: 0, not_required: 2, total: 2 } }`.
- **Groups: surviving non-blocked `required_after_close: true` → group `in-progress`:** seed one `action-required` with `required_after_close: true` in group `phase-1`. After close, the action survives at `action-required`; group `phase-1` lands `status: 'in-progress'` (NOT `done`).
- **Groups: surviving blocked `required_after_close: true` → group `done` (because blocked-exception swept it):** seed one `blocked` action with `required_after_close: true` in group `phase-1`. After close, the action is swept (per Task 4's blocked-exception); group lands `done`.
- **Empty group:** seed a workflow with `action_groups: [{ id: 'phase-1' }, { id: 'phase-2' }]` but no actions in `phase-2`. After close, `groups` array still includes `phase-2` with the empty-group default — `{ id: 'phase-2', status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`. (Same convention `CancelWorkflow.test.js` asserts.)
- **`updated` on writeback:** assert workflow doc's `updated` reflects `context.changeStamp` after this write — proving the recompute writeback ran.
- **No double-push on `status`:** assert workflow `status` array length is 2 (one `completed`, one `active`) — the recompute writeback uses `$set` only, never `$push`. Mirrors `CancelWorkflow.test.js`'s "status[] gets one 'cancelled' push (not double-pushed by summary $set)" test.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — add `recomputeGroups` import; add the post-sweep recompute + writeback block.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — add eight tests above.

## Notes

- Two workflow-doc writes total in this handler (status push in Task 3, summary + groups writeback here) — same trade-off `CancelWorkflow.js` accepts. The design explicitly calls this out: "Two workflow-doc writes instead of one bundled write — same trade-off `CancelWorkflow.js` already accepts."
- The `declaredGroups` resolution belongs here, after the sweep, because the input to `recomputeGroups` is the post-sweep action set. Resolving at the top of the handler would still work; placing it next to the recompute makes the data-flow obvious.
- `recomputeGroups` is fully reusable as-is — no Part 23-specific extension. If a future test surfaces a behaviour that needs close-specific overrides, lift the override into the helper (not into this handler).
- The asymmetry test cases (groups with survivors landing non-`done`) are the load-bearing assertions for [design.md:34](../design.md). Make sure they're in the test file with comments naming the design line — future readers should see why the test asserts non-`done`.
