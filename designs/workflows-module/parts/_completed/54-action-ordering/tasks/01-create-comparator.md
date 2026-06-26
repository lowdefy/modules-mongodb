# Task 1: Create the shared `makeWorkflowOrderComparator`

## Context

Workflow action documents currently render in the wrong order. Every read engine
sorts by `action.sort_order`, but `sort_order` is **never written** onto action
docs (the canonical creation path `planActionTransition.js` writes `type`, `kind`,
`key`, `action_group`, `status`, `workflow_type`, etc. — but not `sort_order`), so
the field reads as `undefined` everywhere and the sort collapses to whatever
tiebreaker follows. This design replaces that dead sort with a **declaration-order**
model computed from the workflow config.

This task creates the one shared comparator that all four read engines will use, so
there is exactly one ordering definition. It is pure (no I/O) and lives alongside
the other server-side render helpers in
`plugins/modules-mongodb-plugins/src/connections/shared/render/` (next to
`resolveActionAccess.js`, which it should match in file-header and export style).

Action docs already persist everything the comparator needs: `type`, `action_group`,
`workflow_type`, `key`, `status`, `_id`. The config (`workflowsConfig`) carries the
declared order in two arrays: `action_groups[]` (group order) and `actions[]`
(action order). The comparator resolves each action's config **per action** via
`action.workflow_type`, so it works whether the caller holds one workflow or many
(the timeline aggregates across all of an entity's workflows).

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.js`
exporting `makeWorkflowOrderComparator(workflowsConfig)`. It returns a comparator
function `(a, b) => number` over action documents, ordering by this key tuple
(lexicographic compare):

```
key(action):
  cfg         = workflowsConfig.find(w => w.type === action.workflow_type)
  groupIndex  = cfg ? cfg.action_groups.findIndex(g => g.id === action.action_group) : -1
  declIndex   = cfg ? cfg.actions.findIndex(a => a.type === action.type)            : -1
  stage       = Array.isArray(action.status) ? action.status[0]?.stage : action.status
  notRequired = stage === 'not-required' ? 1 : 0
  return [ groupIndex === -1 ? Infinity : groupIndex,   // 1. group declaration order
           notRequired,                                  // 2. not-required sinks within group (D4)
           declIndex  === -1 ? Infinity : declIndex,     // 3. action declaration order
           action.key ?? '',                             // 4. keyed-sibling tiebreak
           String(action._id) ]                          // 5. final deterministic fallback
```

Key requirements, each mapping to a design decision:

- **`groupIndex` is the primary key** (D1). Unknown/removed group or no config →
  `findIndex` returns `-1` → map to `Infinity` so it sorts after all declared
  groups. Ungrouped actions (`action_group: null`) likewise resolve to `-1` → last.
- **`notRequired` is the _second_ key — after `groupIndex`, before `declIndex`** (D4).
  A `not-required` action sinks to the bottom of _its own group_ without escaping
  it (groups stay contiguous). Reading `stage` must tolerate **both** doc shapes:
  the raw `status` array (`[{ stage }]`, as the three findDocs-based engines pass)
  **and** the scalar that the timeline's `$lookup` has already rewritten — hence the
  `Array.isArray(...)` branch.
- **`declIndex`** is the action's position in `cfg.actions[]`. `-1` (removed/unknown
  type) → `Infinity` → sorts last, deterministically.
- **`action.key`** separates keyed siblings (multiple instances sharing a `type`,
  thus identical `(groupIndex, declIndex)`). It is deterministic and stable across
  status changes, unlike the timestamp tiebreak the engines apply today. `null` keys
  → `''`.
- **`String(action._id)`** is retained only as the final fallback so order is fully
  deterministic when two docs share `(groupIndex, declIndex, key)` (e.g. both
  `key: null`). It never decides order for genuinely keyed actions.

Implement the lexicographic compare by building both key tuples and comparing
element-by-element (numbers via subtraction with `Infinity` handled, strings via
`<`/`>`). Keep it pure — no mutation of inputs, no I/O.

Also create `compareActionOrder.test.js` in the same directory (match the
surrounding `*.test.js` style — these use Jest/Vitest-style `describe`/`test`/`expect`;
follow `resolveActionAccess.test.js`). Cover:

- **Cross-group ordering** — actions in earlier-declared groups sort first
  regardless of `declIndex`; reproduce the design's worked example
  (groups `[qualification, quoting, order, conversion]`; actions `qualify,
site-visit, send-quote, schedule-followup, upload-po, track-company-setup` →
  that exact output order).
- **Within-group declaration order** — two actions in the same group sort by
  `declIndex`.
- **`not-required` sinks within its group** — a `not-required` action sorts after
  an `action-required` sibling in the same group _even when its `declIndex` is
  lower_, but **does not** leave its group (a later-group action still sorts after
  it). Test with both the array `status` shape and the scalar shape.
- **Ungrouped (null-group) actions** sort after all declared groups.
- **Keyed siblings** — same `type`/`action_group`, distinct `key` → ordered by
  `key`, not by `_id`.
- **Removed/unknown type** (live action whose `type` is absent from config) sorts
  last, deterministically.
- **No config for the workflow_type** (e.g. timeline non-workflow card with
  `workflow_type` absent) → all keys fall to `Infinity`/`''`/`_id`; ordered by `_id`.

## Acceptance Criteria

- `compareActionOrder.js` exports `makeWorkflowOrderComparator(workflowsConfig)`
  returning a comparator with the five-key tuple above.
- The comparator handles both `status` shapes (array `[{stage}]` and scalar).
- `findIndex` `-1` results (unknown group, removed type, no config, null group) sort
  last via `Infinity`.
- The file is pure (no imports of mongo/IO helpers) and matches the header/export
  style of `resolveActionAccess.js`.
- `compareActionOrder.test.js` covers cross-group, within-group decl order,
  not-required sink (both shapes, stays in group), null-group, keyed siblings,
  removed type, and no-config cases — all green.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or the package's test
  runner) passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.js`
  — **create** — `makeWorkflowOrderComparator(workflowsConfig)`.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.test.js`
  — **create** — unit coverage per the cases above.

## Notes

- Do **not** read `blocked_by` for ordering. The concept doc once described a
  topological fallback over `blocked_by`; it was never implemented and is rejected
  outright (D1, rejected alternative). Declaration order is _the_ model, not a
  fallback.
- This task only creates the comparator and its tests; wiring into engines is tasks
  2–4. Nothing imports it yet after this task.
