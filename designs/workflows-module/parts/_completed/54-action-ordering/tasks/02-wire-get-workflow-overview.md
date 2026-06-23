# Task 2: Wire the comparator into `GetWorkflowOverview`

## Context

Task 1 created `makeWorkflowOrderComparator(workflowsConfig)` in
`plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.js`.

`GetWorkflowOverview.js` orders a single workflow's visible actions by a bespoke
`(groupIndex, sort_order, _id)` sort (lines ~77–89). It computes its own runtime
`groupIndex` from the config's `action_groups` (lines ~45–55) — the right idea, but
coupled to the dead `sort_order` (which is always `undefined`, so today this
collapses to `_id` order within each group). This surface **does not** sink
`not-required` today.

The engine already destructures `workflowsConfig` from its context
(`const { params, mongoDb, connection, workflowsConfig } = context;`), so no new data
is needed.

## Task

In `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js`:

1. Import the comparator:
   `import { makeWorkflowOrderComparator } from '../../shared/render/compareActionOrder.js';`
2. Replace the bespoke sort (lines ~77–89) with the shared comparator. The comparator
   operates on **action documents**, but the current code sorts an array of
   `{ action, allowed, link, message, status }` wrappers — apply the comparator to the
   nested `action` doc:
   ```js
   const compare = makeWorkflowOrderComparator(workflowsConfig);
   visibleActions.sort((a, b) => compare(a.action, b.action));
   ```
3. Remove the now-unused bespoke `groupIndex` helper and the `configGroups` /
   `groupIdList` / `wfDocGroupIds` scaffolding (lines ~43–55) — the comparator resolves
   group order internally. (Leave `wfConfig` itself: it is still used for `title`,
   `form_meta`, etc.)
4. The `status` field passed into the wrapper is already
   `action.status?.[0]?.stage` — but the comparator reads `action.status` directly off
   the doc (array shape), so this works unchanged. No change to card-building or
   form_data pruning.

**Behavior change (intended, D4):** because the comparator carries the
`not-required` sink as its second key, this surface now sinks `not-required` actions
to the bottom of their group, bringing it in line with the other three surfaces.

Update `GetWorkflowOverview.test.js`:

- Re-assert ordering against **declaration order** rather than `_id`/`sort_order`.
  Ensure the fixture's `workflowsConfig` has populated `action_groups[]` and
  `actions[]`, and seeded action docs carry `type` and `action_group` matching that
  config (so the comparator resolves real indices).
- Add a test asserting the **new** `not-required` sink behavior on this surface
  (a `not-required` action sorts after an `action-required` sibling in the same
  group).
- Add coverage for cross-group ordering and keyed siblings if not already present.

## Acceptance Criteria

- `GetWorkflowOverview` orders actions via `makeWorkflowOrderComparator`; the bespoke
  `groupIndex` helper and `sort_order` reference are gone.
- `not-required` actions sink within their group on this surface (new behavior).
- `GetWorkflowOverview.test.js` asserts declaration order (not `_id`/`sort_order`),
  covers the new not-required sink, and is green.
- Package tests pass.

## Files

- `plugins/.../WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — **modify** —
  import comparator, replace bespoke sort, remove `groupIndex` helper + `sort_order`.
- `plugins/.../WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.test.js` — **modify**
  — re-assert declaration order, add not-required-sink + cross-group/keyed coverage.

## Notes

- The comparator's `_id` final fallback keeps results deterministic; do not re-add a
  `_id`/`sort_order` sort around it.
- form_data pruning logic (visible keys per type) is unrelated to ordering — leave it
  untouched.
