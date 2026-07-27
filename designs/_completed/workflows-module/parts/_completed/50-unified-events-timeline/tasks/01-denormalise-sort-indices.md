# Task 1: Denormalise the action sort key onto the action doc

## Context

Today `makeWorkflowOrderComparator` (`compareActionOrder.js`) is the single source
of truth for action display order across all four read engines. It maps each
action to its declaration position by resolving the workflow config at read time:

- **group index** — position of the action's `action_group` in `cfg.action_groups[]`
- **action (decl) index** — position of the action in `cfg.actions[]`

These two indices are pure functions of the authored config, so their natural home
is build time. This task stamps them onto the action doc so the comparator (task 2)
can read them off stored data instead of resolving config — making the read path
config-free.

There are **two** writes to add:

1. **Build time** — `modules/workflows/resolvers/makeWorkflowsConfig.js` already
   walks every group and action to normalise them (the `result = workflows.map(...)`
   block, ~line 728). In the same pass it attaches `group_index` and `decl_index`
   onto each action's config entry.
2. **Write time** — `planActionTransition.js` already copies config-derived fields
   (`doc.access`, `doc.workflow_type`, `doc.title`, `doc.tracker`) onto the action
   doc on every plan (the block at ~line 209). It now copies the two indices in the
   same block — a plain copy beside `doc.access`, no signature change, no
   per-transition computation.

This is the same denormalisation trade the codebase already makes for `access`
(D5): a config reorder does not retroactively reorder already-written actions
until their next transition rewrites the doc. No migration is needed — workflows
has not shipped, so there is no live action data.

This task does **not** change the comparator yet — it still reads config. After
this task, action docs carry the indices but nothing reads them. That keeps the
change behaviour-neutral and independently verifiable.

## Task

### 1. `makeWorkflowsConfig.js` — attach indices at build time

In the `workflows.map((workflow) => { ... })` block (~line 728), the action
config entries are built by `(workflow.actions ?? []).map((action) => { ... })`
and the group config entries by `(workflow.action_groups ?? []).map(...)`.

- Compute the normalised `actionGroups` array first (it already exists, ~line 764).
- When mapping each action, attach:
  - `decl_index` — the action's index within `actions[]` (the `.map` index).
  - `group_index` — `actionGroups.findIndex((g) => g.id === action.action_group)`
    (the position of the action's group in `action_groups[]`). When the action has
    no `action_group` or the group is not found, `findIndex` returns `-1`; store
    `-1` (the comparator maps `-1`/missing to `+∞`, task 2).

Mirror the comparator's current semantics exactly: it does
`groups.findIndex((g) => g.id === action.action_group)` and
`actions.findIndex((a) => a.type === action.type)`. Because action `type` is
unique within a workflow's `actions[]`, the `.map` index equals
`actions.findIndex((a) => a.type === action.type)` — so the map index is the
correct `decl_index`.

Note the map callback that builds actions currently runs **before** `actionGroups`
is computed. Reorder so `actionGroups` (or at least the group-id list) is available
when computing each action's `group_index`, or compute `group_index` from
`workflow.action_groups` directly (ids are unchanged by the title-defaulting map).

### 2. `planActionTransition.js` — copy indices at write time

In the persisted-denormalisation block (~line 209, where `doc.access`,
`doc.workflow_type`, `doc.title`, `doc.tracker` are set), add:

```js
doc.group_index = actionConfig.group_index;
doc.decl_index = actionConfig.decl_index;
```

`actionConfig` is the per-action config entry now carrying both indices (from
change 1). This is the single write path, so every action mutation (seed, submit,
close, cancel, auto-unblock, tracker-level) carries the indices.

### 3. Update tests

- `makeWorkflowsConfig.test.js` (if present) — assert each action config entry
  carries `group_index` and `decl_index` with the expected values, including the
  `-1` case for an action with no/unknown group.
- `planActionTransition.test.js` — assert the planned doc carries `group_index`
  and `decl_index` copied from `actionConfig`.

## Acceptance Criteria

- `makeWorkflowsConfig` output: every action config entry has numeric
  `group_index` and `decl_index`; an action with no resolvable group has
  `group_index: -1`.
- `planActionTransition` output: every planned action doc carries `group_index`
  and `decl_index` equal to the action's config values, alongside `access` etc.
- Existing comparator behaviour is unchanged (it still reads config in this task).
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes (plugin tests).
- Workflows resolver tests pass.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — attach
  `group_index` / `decl_index` onto each action config entry in the normalisation map.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — assert the
  attached indices (create assertions if the file exists; otherwise note absence).
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — copy the two indices onto `doc` beside `doc.access` (~line 209).
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — assert the doc carries the indices.

## Notes

- Keep the comparator's `-1`/missing → `+∞` convention intact by storing `-1`
  (not `null`/`undefined`) for unresolvable groups; task 2 translates `-1` to `+∞`.
- Do not touch the comparator in this task — it remains config-reading so the
  change is behaviour-neutral and isolates the data-write from the reader-switch.
