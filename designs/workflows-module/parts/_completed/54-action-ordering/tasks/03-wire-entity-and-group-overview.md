# Task 3: Wire the comparator into `GetEntityWorkflows` + `GetWorkflowActionGroupOverview`

## Context

Task 1 created `makeWorkflowOrderComparator(workflowsConfig)`. Two engines share an
**identical** within-group sort that must be replaced:

- `GetEntityWorkflows.js` (lines ~92–103)
- `GetWorkflowActionGroupOverview.js` (lines ~66–76)

Both currently sort with:
```js
visibleActions.sort((a, b) => {
  const aNotRequired = a.status === 'not-required' ? 1 : 0;
  const bNotRequired = b.status === 'not-required' ? 1 : 0;
  if (aNotRequired !== bNotRequired) return aNotRequired - bNotRequired;
  const aSort = aNotRequired ? 1 : (a.action.sort_order ?? 0);
  const bSort = bNotRequired ? 1 : (b.action.sort_order ?? 0);
  if (aSort !== bSort) return aSort - bSort;
  const aTs = a.action.created?.timestamp ?? 0;
  const bTs = b.action.created?.timestamp ?? 0;
  return aTs < bTs ? -1 : aTs > bTs ? 1 : 0;
});
```
The `not-required` sink they apply by hand is now **folded into the comparator** (D4),
so the whole block — sink, dead `sort_order`, timestamp tiebreak — is replaced by one
comparator call. Both engines already destructure `workflowsConfig` from context.

In `GetEntityWorkflows`, the group-**section** iteration that orders groups by
declaration order (the `groupOrderMap` / `groupEntries` logic, ~lines 105–172) is a
**non-goal — leave it unchanged**. Only the within-group action sort changes.

## Task

In **both** files, import the comparator and replace the sort block with:
```js
import { makeWorkflowOrderComparator } from '../../shared/render/compareActionOrder.js';
// ...
const compare = makeWorkflowOrderComparator(workflowsConfig);
visibleActions.sort((a, b) => compare(a.action, b.action));
```
The comparator reads `action.status` (array shape) and `action.action_group` /
`action.type` / `action.workflow_type` directly off the doc — all present on the
`a.action` wrapper. No change to access filtering, card building, grouping, or
form_data pruning.

Note for `GetEntityWorkflows`: it sorts `visibleActions` flat **before** bucketing
into groups. Because the comparator's primary key is `groupIndex`, the flat sort is
already group-contiguous and group order is then reinforced by the existing
`groupEntries.sort((a,b) => a.order - b.order)` — both agree, so this is consistent.

Update both test files:

- **`GetEntityWorkflows.test.js`** (the "not-required sinks last within a group" test,
  ~line 394) and **`GetWorkflowActionGroupOverview.test.js`** (the "not-required sinks
  last" test, ~line 364): these currently seed `sort_order: 0/1` and assert
  "action-required comes first despite a higher `sort_order`." They keep passing (the
  folded sink still orders ahead of `declIndex`, and the assertions only check
  `status`), but the `sort_order` framing is now misleading. **Rework them** to assert
  against **declaration order** — drop the `sort_order` seed values, and make the
  fixture's `workflowsConfig.actions[]` order define the expectation. Keep the
  not-required-sink assertion (it is still correct and now comparator-driven).
- Add new coverage to at least one of the two: cross-group ordering, ungrouped
  (null-group) actions sorting last, and keyed siblings (same `type`/group, distinct
  `key`).

## Acceptance Criteria

- Both engines order within-group actions via `makeWorkflowOrderComparator`; the
  hand-rolled sink + `sort_order` + timestamp tiebreak block is removed from both.
- `GetEntityWorkflows` group-section ordering (`groupEntries.sort`) is unchanged.
- Both test files re-assert declaration order (no `sort_order` seeds in the reworked
  tests), keep the not-required-sink assertion, and add cross-group / null-group /
  keyed coverage.
- Package tests pass.

## Files

- `plugins/.../WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — **modify** —
  import comparator; replace within-group sort.
- `plugins/.../WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js`
  — **modify** — same.
- `plugins/.../WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.test.js` — **modify** —
  rework `sort_order`-framed test to declaration order; add coverage.
- `plugins/.../WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.test.js`
  — **modify** — same.

## Notes

- The two engine edits are byte-for-byte identical aside from the surrounding code —
  apply the same change to both.
- Do not re-add a `created.timestamp` or `_id` tiebreak; the comparator's `key` →
  `_id` chain handles determinism.
