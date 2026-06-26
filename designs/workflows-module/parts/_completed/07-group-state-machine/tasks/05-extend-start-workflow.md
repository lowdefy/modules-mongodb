# Task 5: Extend `StartWorkflow.js` to pre-populate `groups[]` at workflow creation

## Context

[StartWorkflow.js:83](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) currently writes `groups: []` as a literal placeholder. Part 7's design commits to replacing this with the full pre-populated array: every declared `action_groups[]` entry gets a `{ id, status, summary }` slot at workflow creation, with statuses derived from the just-built starting actions.

Why pre-populate at creation rather than lazily on first submit:

- Apps that read `groups[]` positionally (UI per [part 18](../../18-entity-components/design.md), analytics) see the full array from day 1.
- Groups that never get touched by a submit (e.g. emergency-only phases) still appear in the workflow doc.
- Lets the submit-side recompute stay incremental (only the affected group needs updating on each transition).

All data is already in memory at the time `StartWorkflow` builds `workflowDoc` — `workflowConfig.action_groups` from the normalized config and `actionDrafts` from the just-built starting actions. No extra DB read.

This is an **in-place extension of shipped code** (part 5). Same pattern as part 6's extension of `updateAction.js`. The extension is small (one helper call + replace the `groups: []` literal).

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js`.

1. **Import `recomputeGroups`** (task 3) at the top of the file:

   ```js
   import recomputeGroups from "../SubmitWorkflowAction/recomputeGroups.js";
   ```

   The import path crosses handler folders — `SubmitWorkflowAction/` owns the helper because that's where the rest of the group-state-machine code lives. Matches the existing `createAction.js` cross-handler pattern (lives in `shared/`, consumed by `StartWorkflow`).

2. **Compute `groups[]` before the `workflowDoc` literal.** Around line 73 (where `workflowDoc` is declared), insert:

   ```js
   const declaredGroups = workflowConfig.action_groups ?? [];
   const groups = recomputeGroups({ declaredGroups, actions: actionDrafts });
   ```

   `actionDrafts` is built at line 92 — the array of starting-action docs with their initial `status[]` from `createAction.js`. The `recomputeGroups` call must run **after** `actionDrafts` is built, so move the computation to after line 94 (after `actionDrafts` exists) but before line 103 (where `workflowDoc.summary` gets its final value — `groups` and `summary` should be set together for symmetry).

3. **Replace the `groups: []` placeholder.** At line 83, change:

   ```js
   groups: [],
   ```

   to use a placeholder that gets assigned the computed value alongside the summary assignment a few lines later. One clean approach:

   ```js
   const workflowDoc = {
     ...payload.references,
     _id: randomUUID(),
     workflow_type: payload.workflow_type,
     // ...
     status: [{ stage: "active", created: context.changeStamp }],
     summary: { done: 0, not_required: 0, total: 0 },
     groups: [], // populated below
     form_data: {},
     // ...
   };

   const actionDrafts = startingActions.map((action) =>
     createAction(context, { workflow: workflowDoc, action, eventId: null }),
   );

   const notRequiredCount = actionDrafts.filter(
     (a) => a.status[0]?.stage === "not-required",
   ).length;
   workflowDoc.summary = {
     done: 0,
     not_required: notRequiredCount,
     total: actionDrafts.length,
   };
   workflowDoc.groups = recomputeGroups({
     declaredGroups: workflowConfig.action_groups ?? [],
     actions: actionDrafts,
   });
   ```

   The pattern mirrors how `summary` is already computed and assigned post-doc-literal. Doesn't change the existing `createAction(context, { workflow: workflowDoc, ... })` call site — `createAction` reads from `workflowDoc` before `groups` is populated, but it doesn't reference `groups`, so the order is safe.

4. **`createAction` doesn't read `action_group`.** Confirm by inspection of [shared/createAction.js](../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js) — if it propagates `action.action_group` to the action doc (which it must for groups to work), the `actionDrafts` already have the field. If not, add it to the propagation list. (The design assumes actions carry `action_group` — see [part 4 design.md § Workflow YAML schema](../../04-workflow-config-schema/design.md) where `action_group` is listed under "display fields" on the action.)

## Acceptance Criteria

- `StartWorkflow.js` imports `recomputeGroups` from `../SubmitWorkflowAction/recomputeGroups.js`.
- `workflowDoc.groups` is assigned via `recomputeGroups(...)` after `actionDrafts` is built and before `MongoDBInsertOne`.
- The `groups: []` literal on the `workflowDoc` initializer is now a placeholder (or removed entirely) — the final value is computed.
- A workflow with `action_groups: [{ id: 'phase-1' }, { id: 'phase-2' }, { id: 'phase-3' }]` and starting actions `[{ type: a, status: 'action-required', action_group: 'phase-1' }, { type: b, status: 'blocked', action_group: 'phase-1' }, { type: c, status: 'blocked', action_group: 'phase-2' }]` produces a workflow doc with `groups: [{ id: 'phase-1', status: 'in-progress', summary: { done: 0, not_required: 0, total: 2 } }, { id: 'phase-2', status: 'blocked', summary: { done: 0, not_required: 0, total: 1 } }, { id: 'phase-3', status: 'done', summary: { done: 0, not_required: 0, total: 0 } }]`.
- A workflow with no `action_groups` declared (`workflowConfig.action_groups` is undefined) gets `groups: []` — `recomputeGroups({ declaredGroups: [], actions: ... })` returns `[]`.
- A workflow with `action_groups` declared but no actions referencing them via `action_group` produces all empty groups (`status: 'done'`, `total: 0`).
- Existing `StartWorkflow` tests still pass (parent linking, validation, payload override, etc.).
- New tests in `StartWorkflow.test.js` (use `inMemoryMongo.js`) — or extend the existing one with the cases above:
  - Initial `groups[]` array length matches `workflowConfig.action_groups.length`.
  - Initial `groups[]` order matches declaration order.
  - Empty groups serialize as `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`.
  - Starting actions with mixed initial statuses produce the correct per-group derivation.
  - Workflow with no declared groups → `groups: []`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — import `recomputeGroups`, compute and assign `workflowDoc.groups` after `actionDrafts` is built.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify (or create if missing) — add the groups-initialization cases above.
- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` — verify (no change expected) — confirm it propagates `action.action_group` onto the action doc. If not, add it. (Spot-check before editing — part 5 may have already wired this.)

## Notes

- The import path `../SubmitWorkflowAction/recomputeGroups.js` crosses handler folders. The alternative is putting `recomputeGroups.js` in `shared/`. Lean: keep it in `SubmitWorkflowAction/` (matches `computeAutoUnblocks.js` and `deriveGroupStatus.js`'s placement — the group state machine logically owns the helper). The cross-folder import precedent exists (`StartWorkflow.js` already imports from `../../shared/`).
- This task is independent of every submit-pipeline task (6, 7, 8). It can ship in its own PR.
- The `recomputeGroups` call doesn't read or write the database — purely in-memory transformation of `actionDrafts` and `declaredGroups`.
- "Same in-place extension pattern as part 6's extension of `updateAction.js`" — that extension (per [part 6 task 5](../../06-submit-action-writes/tasks/05-extend-update-action.md)) added behaviour without breaking existing callers. Same posture here: every existing `StartWorkflow` test should still pass.
