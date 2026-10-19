# Task 3: `recomputeGroups.js` — pure helper that builds the full `groups[]` array

## Context

Two consumers need to compute the workflow doc's `groups[]` array:

- `StartWorkflow` extension (task 5) — runs at workflow creation against the just-built `actionDrafts` and `workflowConfig.action_groups`.
- `handleSubmit` extension (task 8) — sub-step 4a, runs after step 4 writes against the in-memory action list and the workflow's normalized config.
- `CancelWorkflow` extension (task 9) — runs after the not-required loop against the re-read action list.

All three callers have:

- The list of action docs (status + `action_group` assignment).
- The workflow's declared `action_groups[]` in YAML order.

The function is pure. It calls `deriveGroupStatus` (task 1) per group. Lives next to `deriveGroupStatus.js` in `SubmitWorkflowAction/`.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js`.

Signature:

```js
import deriveGroupStatus from "./deriveGroupStatus.js";

/**
 * Compute the workflow doc's `groups[]` array from the workflow's actions
 * and its declared action_groups. Output array preserves declaration order.
 *
 * @param {Object} args
 * @param {Array<Object>} args.declaredGroups — `workflowConfig.action_groups`
 *   in declaration order. Each: `{ id, title, on_complete? }`.
 * @param {Array<Object>} args.actions — every action doc on the workflow.
 *   Each: `{ action_group?, status: [{ stage, ... }, ...], ... }`.
 * @returns {Array<{ id: string, status: 'done' | 'blocked' | 'in-progress', summary: { done: number, not_required: number, total: number } }>}
 *   One entry per declared group, in declaration order.
 */
function recomputeGroups({ declaredGroups, actions }) {
  // ...
}

export default recomputeGroups;
```

Behaviour:

1. **Iterate `declaredGroups` in order.** For each group:
   - Filter `actions` to those with `action.action_group === group.id`.
   - Call `deriveGroupStatus(groupActions)` to get the 3-value status.
   - Compute the summary:
     ```js
     const summary = {
       done: groupActions.filter((a) => a.status?.[0]?.stage === "done").length,
       not_required: groupActions.filter(
         (a) => a.status?.[0]?.stage === "not-required",
       ).length,
       total: groupActions.length,
     };
     ```
   - Emit `{ id: group.id, status, summary }`.

2. **Empty groups** (no actions reference the group id) get `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }` — falls out naturally because `deriveGroupStatus([])` returns `'done'` (task 1).

3. **Order.** Output array matches `declaredGroups` order exactly. UI consumers read positionally per [design.md § groups[] persistence](../design.md#groups-persistence).

```js
function recomputeGroups({ declaredGroups, actions }) {
  return declaredGroups.map((group) => {
    const groupActions = actions.filter((a) => a.action_group === group.id);
    const status = deriveGroupStatus(groupActions);
    const summary = {
      done: groupActions.filter((a) => a.status?.[0]?.stage === "done").length,
      not_required: groupActions.filter(
        (a) => a.status?.[0]?.stage === "not-required",
      ).length,
      total: groupActions.length,
    };
    return { id: group.id, status, summary };
  });
}
```

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js`.
- Default export matches the signature above.
- Imports `deriveGroupStatus` from `./deriveGroupStatus.js`.
- Pure function — no Mongo, no I/O.
- Output array length equals `declaredGroups.length`.
- Output array order matches `declaredGroups` order.
- Empty groups serialise as `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`.
- Actions without an `action_group` field (or with one that doesn't match any declared group) are silently excluded from every group's filter — they don't appear in any group's count. (Build-time validation rejects undeclared `action_group` references per `makeWorkflowsConfig.js:122–127`; this is defence in depth.)
- Colocated `recomputeGroups.test.js`:
  - Empty `declaredGroups` → empty array output.
  - Three declared groups, all empty → three `done`/`{0,0,0}` entries in declaration order.
  - One group with 2 done + 1 not-required → `done`/`{done: 2, not_required: 1, total: 3}`.
  - One group with 1 blocked + 1 done → `blocked`/`{done: 1, not_required: 0, total: 2}` (the non-terminal is `blocked`).
  - One group with 1 action-required + 1 blocked → `in-progress`/`{done: 0, not_required: 0, total: 2}`.
  - Three declared groups + 1 action assigned to each → output is three entries with their respective statuses.
  - Action with `action_group: 'unknown-group'` is ignored — doesn't appear in any group's count.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js` — create — pure group-array recomputation.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.test.js` — create — table-driven cases above.

## Notes

- The design's sub-step 4a says "Recompute every group's status + per-group summary." For v1 this helper recomputes _every_ declared group on every call — see [design.md § groups[] persistence](../design.md#groups-persistence): "Incremental is safe because `StartWorkflow` already wrote a complete array at workflow creation." Reads cleaner than passing a "which groups to recompute" filter; the cost (≤ 20 actions × ≤ 10 groups per typical workflow) is negligible.
- The function signature accepts a flat action list (not a pre-grouped map). Keeps the caller code simple — every caller already has actions in a flat list.
- This helper doesn't know about `completed_groups` (the return-shape entries naming groups that transitioned to `done`). That belongs to the wiring task (task 8) which holds both the pre-write and post-write `groups[]` arrays and diffs them.
