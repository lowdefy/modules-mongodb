# Task 6: `computeAutoUnblocks.js` — emit `action-required` entries for now-unblocked types

## Context

Step 3 of the lifecycle ([design.md lifecycle bullet 3](../design.md#lifecycle-scaffold)) computes which actions on the workflow should flip from `blocked` to `action-required` because their `blocked_by` dependencies just became terminal (`done` or `not-required`).

v1 covers **action-type entries in `blocked_by` only**. Group-id resolution defers to [part 7's `blocked_by` group-id resolution + re-evaluation pass](../../07-group-state-machine/design.md). Part 7 extends this helper in place once it ships — leave a comment marker.

V0 didn't have an exact equivalent — v0's `handleUpdateActions.js` (`dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/handleUpdateActions.js`) iterates `params.actions` directly and the engine doesn't auto-compute unblocks. The new design promotes auto-unblock computation to first-class engine behaviour per [engine/spec.md § Ordering inside one SubmitWorkflowAction invocation step 2](../../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation) ("Walk the workflow's `blocked_by` graph; identify actions whose dependencies are now terminal").

The helper is consumed by step 3's wiring (task 9) — it doesn't write anywhere. It returns entries to be **appended** to the internal `actions[]` array before the per-entry write loop in step 4.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js`.

Signature:

```js
/**
 * Walk the workflow's `blocked_by` graph (action-type entries only in v1);
 * emit `{ type, status: 'action-required' }` entries for every blocked action
 * whose `blocked_by` action-type dependencies are now terminal.
 *
 * Group-id entries in `blocked_by` are skipped here — part 7's
 * `blocked_by` group-id resolution + re-evaluation pass extends this
 * helper in place when it lands.
 *
 * @param {Object} args
 * @param {Array<Object>} args.workflowActions — all action docs on the workflow.
 *   Each: `{ _id, type, kind, key, status: [{ stage, ... }, ...], ... }`.
 * @param {Array<Object>} args.actionsConfig — `workflowsConfig[workflow_type].actions`
 *   from `context.workflowsConfig`. Each: `{ type, kind, blocked_by?, ... }`.
 * @returns {Array<{ type: string, status: 'action-required' }>} — entries to
 *   merge into the internal `actions[]` before the write loop runs.
 */
function computeAutoUnblocks({ workflowActions, actionsConfig }) {
  // ...
}

export default computeAutoUnblocks;
```

Behaviour:

1. **Build a map of action type → current terminal-ness.** An action is terminal when `status[0].stage ∈ {'done', 'not-required'}`. For keyed actions (multiple docs per type), a type is considered "fully terminal" only when **every** doc of that type is terminal (per [engine/spec.md § Action doc](../../../../workflows-module-concept/engine/spec.md#action-doc), keyed actions share the same `type` across N docs). v1 keeps this simple — empty action types (no docs of that type yet) count as non-terminal.

   ```js
   const terminalByType = new Map();
   for (const action of workflowActions) {
     const isTerminal = ["done", "not-required"].includes(
       action.status[0]?.stage,
     );
     if (!terminalByType.has(action.type)) {
       terminalByType.set(action.type, isTerminal);
     } else if (!isTerminal) {
       terminalByType.set(action.type, false);
     }
   }
   ```

2. **Find currently-blocked actions whose `blocked_by` is now satisfied.** For each action whose `status[0].stage === 'blocked'`:
   - Look up the type in `actionsConfig`.
   - Read `blocked_by: []` from the config entry (default to empty array if missing).
   - Filter `blocked_by` to **action-type entries only** — any entry that doesn't match an existing action type in the workflow is assumed to be a group id (deferred to part 7). Practically: keep entries where `actionsConfig.some((cfg) => cfg.type === entry)`.
   - If every kept entry maps to a `terminalByType.get(entry) === true`, this action is auto-unblocked.

3. **Emit one entry per unblocked type** (de-duplicate by type — even if multiple keyed docs of the same type are blocked, emit one entry; the write loop in step 4 handles the fan-out via `keys: [...]`).

   ```js
   return [...new Set([...unblockedTypes])].map((type) => ({
     type,
     status: "action-required",
   }));
   ```

4. **Inline comment marker for part 7's extension.** Leave a comment naming the seam:

   ```js
   // PART 7 EXTENSION: group-id entries in `blocked_by` are filtered out here
   // (action-type only in v1). Part 7's design.md § blocked_by group-id resolution
   // adds the group-status lookup branch before this filter, so group ids resolve
   // via the workflow's persisted `groups[]` array.
   ```

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js`.
- Default export matches the signature above.
- Pure function — no Mongo, no I/O.
- Returns `{ type, status: 'action-required' }` entries for action types that are blocked but whose action-type `blocked_by` dependencies are all terminal.
- Skips group-id entries in `blocked_by` (any entry not matching an existing action type).
- De-duplicates by type — keyed actions don't produce N entries.
- Returns empty array when no actions are blocked or when no blocked actions' dependencies are satisfied.
- Inline comment names part 7 as the extension owner.
- Colocated `computeAutoUnblocks.test.js` is table-driven (no `inMemoryMongo` needed):
  - No blocked actions → empty array.
  - Single blocked action with one action-type dependency that's `done` → one unblock entry.
  - Single blocked action with two action-type dependencies, one still `in-progress` → no unblock.
  - Action with `blocked_by` containing both an action-type and a group-id-shaped entry → group-id entry filtered; unblock fires only if the action-type entry is satisfied.
  - Keyed action with three docs (all of type `device-install`), all blocked, dependency `done` → one unblock entry (not three).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js` — create — pure auto-unblock computation.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.test.js` — create — table-driven cases above.

## Notes

- The "is this entry a group id or an action type?" heuristic is "look it up in `actionsConfig`." Per [part 4 design.md § In scope](../../04-workflow-config-schema/design.md), the workflow config's build-time validator already prevents action-type / group-id collisions, so this lookup is unambiguous.
- Step 3's wiring task (task 9) appends the returned entries to the internal `actions[]` array. Step 4 (task 10) iterates and calls `updateAction` per entry. Auto-unblock entries don't carry `force` — they go through the normal priority-rule branch in the extended `updateAction.js`.
- The auto-unblock check fires **before** the priority rule on the user-submitted action lands. The freshly-written status from step 4 isn't visible to this helper because the helper runs in step 3, before step 4. That's per the design: auto-unblocks reflect the **pre-submit** state, not the post-write state. Part 7's `blocked_by` re-evaluation pass (running after step 4) covers the post-write re-evaluation.
