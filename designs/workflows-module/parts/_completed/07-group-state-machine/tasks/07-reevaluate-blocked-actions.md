# Task 7: `reevaluateBlockedActions.js` — sub-step 4b post-write walk

## Context

Sub-step 4b is part 7's net-new pipeline step. From [design.md § blocked_by re-evaluation pass](../design.md#blocked_by-re-evaluation-pass):

> After step 4 writes a transition and 4a recomputes `groups[]`, walk every action in `blocked` status:
> - If its `blocked_by` is now fully satisfied (every entry resolves to terminal action or `done` group), push `action-required` via `shared/updateAction.js` — the priority rule allows `action-required` (6) < `blocked` (7); same-stage on already-`action-required` actions no-ops.

How this differs from task 6's `computeAutoUnblocks`:

| Aspect | `computeAutoUnblocks` (step 3) | `reevaluateBlockedActions` (sub-step 4b) |
| --- | --- | --- |
| When | Before step 4 writes | After step 4 writes + 4a recomputes |
| State read | Pre-submit `groups[]` and action statuses | Post-submit `groups[]` (from 4a) and post-write action statuses |
| Output | Returns entries to *append* to the internal `actions[]` for step 4 | **Writes directly** via `shared/updateAction.js` |
| Scope | Catches unblocks visible *before* the user's submit | Catches unblocks the user's submit enabled (e.g. closing the last action in a group → group → done → unblocks downstream actions) |

Both are needed; they catch different cases. The single-pass invariant from the design ("the walk only pushes `action-required` (non-terminal), so a newly-unblocked action can never cause another group to transition to `done` in the same call") means 4b never needs to re-run 4a — group transitions happen exclusively in 4a.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.js`.

Signature:

```js
import updateAction from '../../shared/updateAction.js';

/**
 * Sub-step 4b: walk every action in `blocked` status post-write and push
 * `action-required` on those whose `blocked_by` dependencies are now satisfied.
 * Reads the post-4a `groups[]` array and the post-step-4 action statuses.
 *
 * Writes directly via `shared/updateAction.js` — the priority rule allows
 * `action-required` (6) < `blocked` (7); same-stage on already-`action-required`
 * actions no-ops. Walk-pushed entries don't carry `force` and don't use the
 * `currentActionId` self-exception (they're never the user-submitted action).
 *
 * Single-pass: the walk only pushes `action-required` (non-terminal), so a
 * newly-unblocked action can never cause another group to transition to `done`
 * in the same call. Downstream chains unwind one user submit at a time.
 *
 * @param {Object} context — engine handler context.
 * @param {Object} args
 * @param {Array<Object>} args.workflowActions — every action doc on the
 *   workflow, post-step-4. Each: `{ _id, type, status: [{ stage, ... }, ...], ... }`.
 * @param {Array<Object>} args.actionsConfig — `workflowConfig.actions`.
 * @param {Array<Object>} args.groups — post-4a `groups[]` array.
 * @param {Array<Object>} args.declaredGroups — `workflowConfig.action_groups`.
 * @param {string | null} args.eventId — the submit's event id, threaded into
 *   each pushed status entry.
 * @returns {Promise<Array<string>>} — ids of actions that were pushed to
 *   `action-required`. Empty when nothing was unblocked.
 */
async function reevaluateBlockedActions(
  context,
  { workflowActions, actionsConfig, groups, declaredGroups, eventId },
) {
  // ...
}

export default reevaluateBlockedActions;
```

Behaviour:

1. **Build resolution helpers** (same shape as task 6's extended `computeAutoUnblocks`):

   ```js
   const declaredGroupIds = new Set((declaredGroups ?? []).map((g) => g.id));
   const actionTypes = new Set(actionsConfig.map((cfg) => cfg.type));
   const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

   // Build terminalByType from current workflowActions (post-step-4 state).
   const terminalByType = new Map();
   for (const a of workflowActions) {
     const isTerminal = ['done', 'not-required'].includes(a.status?.[0]?.stage);
     if (!terminalByType.has(a.type)) {
       terminalByType.set(a.type, isTerminal);
     } else if (!isTerminal) {
       terminalByType.set(a.type, false);
     }
   }
   ```

2. **Find currently-blocked actions.** Walk `workflowActions`, keep those with `status[0].stage === 'blocked'`.

3. **For each blocked action, check whether every `blocked_by` entry is satisfied.** Resolution mirrors task 6:

   - Group id (in `declaredGroupIds`) → satisfied iff `groupById.get(entry)?.status === 'done'`.
   - Action type (in `actionTypes`) → satisfied iff `terminalByType.get(entry) === true`.
   - Neither → defensive skip (treat as unsatisfied).

   If every entry is satisfied (or the action has empty `blocked_by`), the action is now unblocked.

4. **Push `action-required` via `updateAction`** for each unblocked action:

   ```js
   const pushed = [];
   for (const action of unblockedActions) {
     await updateAction(context, {
       actionId: action._id,
       newStage: 'action-required',
       eventId,
       // No force, no currentActionId — the priority rule handles it.
     });
     pushed.push(action._id);
   }
   return pushed;
   ```

   `updateAction` (extended by part 6 task 5) checks the priority rule via `shouldUpdate.js`. `action-required` (6) < `blocked` (7) passes; same-stage no-ops. No `force` flag because walk-pushed entries go through the normal priority branch.

5. **Sequential writes.** Walk in order; await each `updateAction` call. The engine spec's posture is sequential ([engine spec § Client and transaction model](../../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)) — no concurrency primitives. O(N) per submit is the accepted cost.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.js`.
- Default export matches the signature above.
- Imports `updateAction` from `../../shared/updateAction.js`.
- Returns an array of `_id`s — actions actually pushed to `action-required`.
- Empty input (no blocked actions) → empty array, no `updateAction` calls.
- Blocked action with empty `blocked_by` → pushed immediately (vacuously satisfied).
- Blocked action with `blocked_by: ['phase-1']` where `groups` has `{ id: 'phase-1', status: 'done' }` → pushed.
- Blocked action with `blocked_by: ['phase-1']` where `groups` has `{ id: 'phase-1', status: 'in-progress' }` → not pushed.
- Blocked action with `blocked_by: ['some-type']` where every doc of that type is terminal → pushed.
- Blocked action with `blocked_by: ['phase-1', 'some-type']` (mixed) — both satisfied → pushed; one unsatisfied → not pushed.
- Defensive: blocked action with `blocked_by: ['unresolved']` (neither group nor type) → not pushed, no throw.
- Walk doesn't use `force` — every `updateAction` call passes through the priority rule.
- `eventId` propagates into the pushed status entries.
- Colocated `reevaluateBlockedActions.test.js` uses `inMemoryMongo.js`:
  - End-to-end: seed a workflow doc + 3 action docs (1 blocked on a group, 1 blocked on an action type, 1 not blocked), call the helper, assert the right actions get pushed to `action-required` in Mongo.
  - Mixed `blocked_by` resolution covered (group + type).
  - Walk is single-pass — pushed actions don't fan out further within the same call (verify by giving an action C `blocked_by: [<the action just pushed to action-required>]` and confirming C stays blocked).
  - Same-stage idempotency: a blocked action whose `blocked_by` is satisfied but whose status was already `action-required` — should be a no-op via the priority rule. (Set up by pushing once, then calling the helper again with the same state.)

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.js` — create — post-write walk implementation.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.test.js` — create — `inMemoryMongo`-backed cases above.

## Notes

- The walk reads `workflowActions` (passed in by task 8's wiring) — not re-fetching from Mongo. The caller is responsible for ensuring `workflowActions` reflects post-step-4 state. Task 8's `handleSubmit` extension does this by re-reading actions after step 4 writes — or, more efficiently, by updating the in-memory action list as step 4's loop writes (see [handleSubmit.js:205](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) where step 5's summary recompute already does this).
- The single-pass invariant is the design-level guarantee: the walk emits only `action-required` (non-terminal), which can't move a group to `done`, which means no downstream `blocked_by: [some-group]` constraint becomes newly satisfied during the walk. Don't add iteration-to-convergence logic.
- This helper is a sibling to `computeAutoUnblocks` — they share the resolution-logic shape but have different write contracts (one returns entries, one writes directly). If a refactor consolidates them later, that's a v2 cleanup; for v1 keep them separate so the lifecycle ordering is explicit at the call site.
