# Task 9: Step 3 — Wire `computeAutoUnblocks` into `handleSubmit.js`

## Context

Task 6 shipped `computeAutoUnblocks.js` — a pure function that walks the workflow's `blocked_by` graph and emits `{ type, status: 'action-required' }` entries for action types whose action-type dependencies just became terminal.

This task wires that helper into step 3 of `handleSubmit.js`. The output entries are appended to the internal `actions[]` array (built in step 1, task 8) before the per-entry write loop in step 4 (task 10) runs.

[design.md § Lifecycle scaffold step 3](../design.md#lifecycle-scaffold):

> Compute auto-unblocks — action-type entries in `blocked_by` only. Group ids resolved in [part 7](../../07-group-state-machine/design.md).

[engine/spec.md § Ordering inside one SubmitWorkflowAction invocation step 2](../../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation):

> Walk the workflow's `blocked_by` graph; identify actions whose dependencies are now terminal. Merge pre-hook `actions[]` (precedence) with auto-unblocks.

Pre-hook precedence merging defers to [part 9](../../09-hook-invocation/design.md). v1 just appends auto-unblock entries.

## Task

Replace the `// Step 3 — Compute auto-unblocks` TODO in `handleSubmit.js` with:

```js
import computeAutoUnblocks from './computeAutoUnblocks.js';
import getActions from '../../shared/getActions.js';
// ...

// Step 3 — Compute auto-unblocks (action-type entries only; group ids → part 7).
const workflowActions = await getActions(context.mongoDBConnection, context.workflow._id);
const autoUnblockEntries = computeAutoUnblocks({
  workflowActions,
  actionsConfig: context.actionsConfig,
});
internal.actions.push(...autoUnblockEntries);
```

`getActions` is the shared helper from part 3 (`plugins/modules-mongodb-plugins/src/connections/shared/getActions.js`) — bulk fetch by `workflow_id` with no projection.

Cache `workflowActions` on `context` so step 5 (task 11) can re-read without another round-trip:

```js
context.workflowActions = workflowActions;
```

Step 5 (task 11) reads `context.workflowActions` to recompute the summary. It needs the pre-write state (which is what step 3 fetched) plus the writes from step 4 applied in memory — but the loop in step 4 updates `context.workflowActions` in place as it writes (task 10 handles that).

### Pre-hook precedence note

[Part 9's design.md § Pre-hook return merge](../../09-hook-invocation/design.md) commits:

> **`actions[]`** → merged with engine-computed auto-unblocks from [part 7](../07-group-state-machine/design.md). Pre-hook entries take precedence on `(type, key)` collision.

So when part 9 lands, the merge order becomes: pre-hook entries first, then auto-unblock entries, with collisions de-duplicated in favour of pre-hook entries. This task doesn't ship pre-hook plumbing — leave a comment marker:

```js
// PART 9 EXTENSION: pre-hook returned actions[] entries merge here, taking
// precedence over auto-unblock entries on (type, key) collision. v1 has no
// pre-hook entries, so the append-only flow above is sufficient.
```

## Acceptance Criteria

- Step 3's TODO marker in `handleSubmit.js` is replaced with the real body.
- `getActions` is called once with `context.workflow._id`; the result is cached on `context.workflowActions`.
- `computeAutoUnblocks` is called with `{ workflowActions, actionsConfig: context.actionsConfig }`.
- Returned entries are appended to `internal.actions` via `.push(...)`.
- Inline comment names part 9 as the pre-hook precedence extension owner.
- `handleSubmit.test.js` extended with cases (using `inMemoryMongo`):
  - Workflow with no blocked actions → `internal.actions` length unchanged after step 3.
  - Workflow with one blocked action whose action-type dependency is `done` → `internal.actions` gains one entry with `status: 'action-required'`.
  - Workflow with one blocked action whose dependency is still `in-progress` → no new entry.
  - The fetched `workflowActions` is cached on `context.workflowActions`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — fill in step 3 body, add imports.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the four cases above.

## Notes

- **Why fetch `workflowActions` here, not in step 1.** Step 1 only needs the current action (via `getCurrentAction`) and the workflow (for the terminal-workflow gate). Loading the full action set is cheaper to defer until step 3, where the auto-unblock computation actually needs it. Step 5's summary recompute also needs it, but step 5 runs after step 3, so the cache fits.
- **Pre-hook precedence is part 9's job.** Leaving the inline comment + putting the append after the (future) pre-hook merge point keeps the seam clean: part 9 inserts its merge call between step 2 (pre-hook invocation) and step 3 (auto-unblock computation), then de-duplicates by `(type, key)` after both have run.
- **Group-id resolution is part 7's job.** `computeAutoUnblocks.js` (task 6) already skips group-id entries; this task doesn't need to repeat that filter.
