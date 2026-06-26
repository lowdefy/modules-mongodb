# Task 2: Make the comparator config-free; drop `workflowsConfig` from all read engines

## Context

After task 1, every action doc carries `group_index` and `decl_index` (the
declaration-position sort key), stamped at build time and copied on every write.
This task switches `makeWorkflowOrderComparator` (`compareActionOrder.js`) to read
those stamped indices off the action doc instead of resolving them from
`workflowsConfig` — and then removes the now-unused `workflowsConfig` argument from
every call site.

The comparator's current sort key is:

```
[groupIndex, notRequired, declIndex, key, _id]
```

Only `groupIndex` and `declIndex` are config-derived. `notRequired` reads off
`status` (the array doc shape `[{ stage }]` **or** the scalar stage the timeline's
`$lookup` already rewrote), and `key` / `_id` read straight off the doc. So only
the two indices change source: doc fields instead of `findIndex` over config.

This is a **global** change — the comparator is the single source of truth for
action display order across all four engines (Part 54), so all four move to
doc-stamped ordering together. Keeping a config-based path for the three
config-holding engines while forking a doc-based path for the timeline is rejected:
it would produce two ordering implementations and break the single-source-of-truth.

Call sites (verified):

- `GetEntityWorkflows.js:69` — `makeWorkflowOrderComparator(workflowsConfig)`
- `GetWorkflowOverview.js:67` — `makeWorkflowOrderComparator(workflowsConfig)`
- `GetWorkflowActionGroupOverview.js:67` — `makeWorkflowOrderComparator(workflowsConfig)`
- `GetEventsTimeline.js:253` — `makeWorkflowOrderComparator(workflowsConfig)`,
  plus a `workflowsConfig` destructure off `context` at line 31.

## Task

### 1. `compareActionOrder.js` — read stamped indices

Change `makeWorkflowOrderComparator` to take **no arguments**. In `keyOf(action)`:

- Replace the config resolution (`configs.find(...)`, `groups.findIndex(...)`,
  `actions.findIndex(...)`) with reads of `action.group_index` and
  `action.decl_index`.
- Preserve the `-1`/missing → `+∞` convention: an index that is `-1`, `null`, or
  `undefined` must sort last. E.g. `groupIndex = action.group_index ?? -1` then
  `groupIndex === -1 ? INF : groupIndex` (and likewise for `decl_index`). This keeps
  actions written before the field existed (or with no resolvable group) sorting
  deterministically last, then by `_id` — matching D5.
- Leave `notRequired` (reads `action.status`, tolerating array or scalar), `key`,
  and `_id` exactly as they are.

Update the function's JSDoc: it no longer takes `workflowsConfig`; it reads the
denormalised `group_index` / `decl_index` off the action doc (stamped at write
time by `planActionTransition.js`, computed at build time by `makeWorkflowsConfig`).

### 2. Update all four call sites

In each engine, change `makeWorkflowOrderComparator(workflowsConfig)` to
`makeWorkflowOrderComparator()` and remove the now-dead `workflowsConfig` local
where it is no longer used:

- `GetEntityWorkflows.js`
- `GetWorkflowOverview.js`
- `GetWorkflowActionGroupOverview.js`
- `GetEventsTimeline.js` — also remove `workflowsConfig` from the
  `const { params, mongoDb, connection, workflowsConfig } = context;` destructure
  (line 31). The engine is now fully config-free. Update the comment at ~line
  170–172 that says action cards are ordered in JS "because declaration order needs
  the workflowsConfig" — the reason is now that ordering needs the per-request user
  for nothing here; cards are ordered in JS from the stamped indices.

Leave the three overview engines' other uses of `workflowsConfig` (if any) intact —
only the comparator call and its sole-purpose local change.

### 3. Update tests

- `compareActionOrder.test.js` — the fixtures currently build a `workflowsConfig`
  and pass it to `makeWorkflowOrderComparator(workflowsConfig)`. Rewrite them to
  call `makeWorkflowOrderComparator()` and stamp `group_index` / `decl_index` onto
  the action doc fixtures instead. Cover: group ordering, `not-required` sink,
  decl ordering, `key` and `_id` tiebreakers, and the missing-index → sorts-last
  case (previously the "unknown group / no config" cases).
- `GetEventsTimeline.test.js` — drop `workflowsConfig` from the context fixture
  (~line 78) and stamp the two declaration indices onto each seeded action doc so
  the engine orders by doc-stamped indices. The existing ordering assertions
  (e.g. "phase-1 (qualify decl 0, site-visit decl 2) then phase-2 (kickoff decl
  1)", ~line 573) must still hold — with the indices now coming from the doc, set
  them on the seeded docs to match: `qualify` → `{group_index:0, decl_index:0}`,
  `kickoff` → `{group_index:1, decl_index:1}`, `site-visit` → `{group_index:0,
decl_index:2}`. Have the `seedAction` helper accept/stamp these.
- `GetEntityWorkflows.test.js`, `GetWorkflowOverview.test.js`,
  `GetWorkflowActionGroupOverview.test.js` — wherever these stamp action docs and
  assert order, ensure seeded docs carry `group_index` / `decl_index` (they may
  already go through `planActionTransition`, which now stamps them; otherwise set
  them on fixtures). Drop any direct `workflowsConfig` passed solely for ordering.

## Acceptance Criteria

- `makeWorkflowOrderComparator()` takes no arguments and orders purely from
  `action.group_index`, `action.decl_index`, `action.status`, `action.key`,
  `action._id`.
- An action with missing/`-1` `group_index` or `decl_index` sorts last,
  deterministically, then by `_id`.
- All four read engines call `makeWorkflowOrderComparator()` with no argument;
  `GetEventsTimeline` no longer destructures `workflowsConfig` from context.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes — comparator,
  GetEventsTimeline, and the three overview engine test suites green.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.js` — modify — read stamped indices; drop the `workflowsConfig` param; update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.test.js` — modify — stamp indices on fixtures; call comparator with no arg.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js` — modify — drop `workflowsConfig` destructure and comparator arg; fix stale comment.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.test.js` — modify — drop `workflowsConfig` fixture; stamp indices on seeded actions.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — modify — comparator call.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — modify — comparator call.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — modify — comparator call.
- `plugins/.../{GetEntityWorkflows,GetWorkflowOverview,GetWorkflowActionGroupOverview}/*.test.js` — modify — ensure seeded docs carry indices; drop ordering-only `workflowsConfig`.

## Notes

- This is the change that makes `GetEventsTimeline` a pure function of stored data
  - session roles — the precondition for relocating it onto a config-free
    connection (task 3). Confirm `GetEventsTimeline` reads nothing else off
    `workflowsConfig` after this task (it does not — `workflowsConfig` was used only
    for the comparator).
- The three overview engines still receive `workflowsConfig` on their `WorkflowAPI`
  connection for their _other_ uses; this task only stops passing it to the
  comparator. Do not remove `workflowsConfig` from the `WorkflowAPI` schema.
