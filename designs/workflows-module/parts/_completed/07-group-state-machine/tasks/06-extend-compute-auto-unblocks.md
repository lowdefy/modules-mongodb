# Task 6: Extend `computeAutoUnblocks.js` with group-id resolution

## Context

[Shipped `computeAutoUnblocks.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js) (part 6 task 6) handles **action-type entries only** in `blocked_by`. The seam marker is already in the file:

> ```js
> // PART 7 EXTENSION: group-id entries in `blocked_by` are filtered out here
> // (action-type only in v1). Part 7's design.md § blocked_by group-id resolution
> // adds the group-status lookup branch before this filter, so group ids resolve
> // via the workflow's persisted `groups[]` array.
> ```

Part 7's design replaces the action-type-only logic with **mixed resolution**:

> For each entry in `blocked_by`, first match against declared `action_groups[].id`; if matched, evaluate against that group's persisted status (`done` ⇒ unblocked). Otherwise match against an action `type`; evaluate against the action's status.

The function runs in **step 3 of the lifecycle** (pre-write, before step 4's per-entry write loop). Its job: compute which currently-`blocked` actions should flip to `action-required` because their `blocked_by` dependencies are all terminal. Group-status reads use the workflow doc's **current** `groups[]` array — the pre-submit state. Part 7's submit-side recompute (sub-step 4a, task 8) computes the post-submit state, but that runs *after* step 3's auto-unblock check.

This means `computeAutoUnblocks` needs a new input: the workflow's current `groups[]` array. Caller (the existing wiring in `handleSubmit.js` step 3) needs to pass it.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js`.

1. **Add `groups` to the input signature.**

   ```js
   /**
    * Walk the workflow's `blocked_by` graph (mixed action types + group ids in v1+);
    * emit `{ type, status: 'action-required' }` entries for every blocked action
    * whose `blocked_by` dependencies are now all terminal.
    *
    * @param {Object} args
    * @param {Array<Object>} args.workflowActions
    * @param {Array<Object>} args.actionsConfig
    * @param {Array<{ id: string, status: 'done'|'blocked'|'in-progress', ... }>} args.groups
    *   — the workflow doc's current `groups[]` array. Group-id `blocked_by` entries
    *   resolve to terminal when the matching group's status is 'done'.
    * @param {Array<Object>} args.declaredGroups — `workflowConfig.action_groups`,
    *   used to distinguish "this entry is a declared group id" from "this entry
    *   is an action type" during resolution.
    * @returns {Array<{ type: string, status: 'action-required' }>}
    */
   ```

2. **Replace the "filter to action-type entries only" branch with mixed resolution.** Today the function silently skips entries that don't match an action type. The new logic:

   For each `blocked_by` entry on a currently-blocked action:

   - **Group id?** Check `declaredGroupIds.has(entry)`. If yes, look up `groups.find((g) => g.id === entry)`. The entry is satisfied iff `group.status === 'done'`.
   - **Action type?** (Falls through if not a group id.) Check `actionTypes.has(entry)` — if yes, the entry is satisfied iff `terminalByType.get(entry) === true` (same rule as v0).
   - **Neither?** Can't happen at runtime — [task 2's build-time validator](./02-validator-blocked-by-resolution.md) catches unresolved entries. Defensive: skip (treat as unsatisfied; the action stays blocked). Don't throw at runtime — the validator is the authoritative gate.

3. **Build the two reference sets once at function entry:**

   ```js
   const declaredGroupIds = new Set((declaredGroups ?? []).map((g) => g.id));
   const actionTypes = new Set(actionsConfig.map((cfg) => cfg.type));
   const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
   ```

4. **Drop the "filter to action-type entries only" seam comment** and replace it with the mixed-resolution branch. Update the JSDoc lede to reflect that the function now handles both kinds.

5. **Update the caller** in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` to pass the two new inputs. Around line 153–160 (the existing `computeAutoUnblocks` call):

   ```js
   const autoUnblockEntries = computeAutoUnblocks({
     workflowActions,
     actionsConfig: context.actionsConfig,
     groups: workflow.groups ?? [],
     declaredGroups: workflowConfig.action_groups ?? [],
   });
   ```

   Confirm `workflow` (the in-memory workflow doc from step 1's load) is in scope at the call site — if not, the call site has to load `workflow.groups` from `context` or via an additional projection. Spot-check during implementation.

## Acceptance Criteria

- `computeAutoUnblocks.js` accepts `groups` and `declaredGroups` as additional inputs.
- The function resolves each `blocked_by` entry in this order:
  1. Group id (lookup in `declaredGroupIds`) → satisfied iff the group's `status === 'done'`.
  2. Action type (lookup in `actionTypes`) → satisfied iff every doc of that type is terminal.
  3. Neither → defensive skip (treat as unsatisfied).
- Output shape unchanged: `Array<{ type, status: 'action-required' }>`, de-duplicated by type.
- The `// PART 7 EXTENSION:` seam comment is replaced with the new mixed-resolution code.
- `handleSubmit.js` is updated to pass `groups` and `declaredGroups` at the call site.
- Existing tests in `computeAutoUnblocks.test.js` still pass (they covered action-type-only resolution; that branch is preserved).
- New tests in `computeAutoUnblocks.test.js`:
  - **Group-id satisfied**: blocked action with `blocked_by: ['phase-1']`, `groups: [{ id: 'phase-1', status: 'done', ... }]` → emit `{ type: <blocked-action's type>, status: 'action-required' }`.
  - **Group-id not satisfied**: blocked action with `blocked_by: ['phase-1']`, `groups: [{ id: 'phase-1', status: 'in-progress', ... }]` → no emit.
  - **Group-id satisfied + action-type satisfied (mixed)**: blocked action with `blocked_by: ['phase-1', 'contact-customer']`, both satisfied → emit.
  - **Group-id satisfied + action-type not satisfied (mixed)**: blocked action with `blocked_by: ['phase-1', 'contact-customer']`, group `done` but contact-customer still `in-progress` → no emit.
  - **Group-id unsatisfied + action-type satisfied (mixed)**: blocked action with `blocked_by: ['phase-2', 'contact-customer']`, group still `blocked` but contact-customer terminal → no emit.
  - **`groups: undefined`**: function tolerates a missing `groups` input — treats all group-id entries as unsatisfied.
  - **`declaredGroups: undefined`**: function tolerates a missing `declaredGroups` input — falls back to action-type-only resolution.
  - **Build-validator-bypassed unresolved entry**: blocked action with `blocked_by: ['this-resolves-to-nothing']`, no matching group id, no matching action type → defensive skip (no emit, no throw).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js` — modify — replace filter-then-evaluate with mixed-resolution branching.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.test.js` — modify — add the group-id resolution cases above.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — pass `groups` and `declaredGroups` to the `computeAutoUnblocks` call.

## Notes

- `computeAutoUnblocks` reads the workflow's **pre-submit** `groups[]` array. Part 7's sub-step 4a (task 8) computes the post-submit array — but 4a runs *after* step 4 writes, while `computeAutoUnblocks` runs in step 3 *before* step 4. The auto-unblock check should see the pre-submit world; the post-write re-evaluation walk (task 7) sees the post-write world. Both are needed because they catch different cases.
- The defensive "skip unresolved entries" branch only fires if the build-time validator (task 2) was bypassed (e.g. ad-hoc DB editing of the workflow config, or a runtime config injection). It's not a real production code path.
- Per the existing JSDoc: keyed actions share a `type`; a type is "fully terminal" only when every doc of that type is terminal. That rule is preserved unchanged from part 6.
- The action-type lookup `terminalByType.get(entry) === true` returns `undefined` for entries that don't exist in `terminalByType` (no action docs of that type yet). `undefined !== true`, so the entry stays unsatisfied — same defensive behaviour as v0.
