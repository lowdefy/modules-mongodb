# Task 4: Wire the comparator into `GetEventsTimeline` (and overhaul its fixture)

## Context

Task 1 created `makeWorkflowOrderComparator(workflowsConfig)`. This task fixes the
timeline (design F12, superseding Part 51's narrower scope).

`GetEventsTimeline.js` orders each event's action cards with a MongoDB aggregation
stage (lines ~180–189):
```js
{ $addFields: { 'event.actions': { $sortArray: {
  input: '$event.actions',
  sortBy: { sort_order: 1, 'updated.timestamp': 1 },
} } } },
```
`sort_order` is always absent, so this effectively orders by `updated.timestamp`.

This engine is different from the other three:

- The config is **on the context but not destructured** today —
  `const { params, mongoDb, connection } = context;` (line ~29). The comparator needs
  it, so add `workflowsConfig` to the destructure.
- It aggregates events across **all** of an entity's workflows, so action cards within
  one event may belong to different `workflow_type`s — the comparator's per-action
  config resolution (via `action.workflow_type`) handles this.
- The `$lookup` sub-pipeline rewrites `status` array → **scalar** current stage
  (line ~117, `status: { $arrayElemAt: ['$status.stage', 0] }`). The comparator's
  `Array.isArray(action.status)` branch already tolerates this scalar shape.
- **Critical:** the JS enrichment loop (lines ~239–276) builds trimmed cards holding
  only `{ _id, kind, status, link, message, sort_order, updated }` — it **drops**
  `type`, `action_group`, and `workflow_type`. The comparator needs those fields, so
  it must sort the **raw** action docs (`rawActions`), **before** the enrichment loop
  trims them.
- Non-workflow cards (`workflow_id: null`, no `workflow_type`) have no config → they
  sort after workflow cards by `_id` (comparator's `Infinity`/`_id` fallback).

## Task

In `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js`:

1. Import the comparator:
   `import { makeWorkflowOrderComparator } from '../../shared/render/compareActionOrder.js';`
2. Add `workflowsConfig` to the context destructure on line ~29.
3. **Remove** the `$sortArray` aggregation stage (lines ~180–189). Cards are now
   ordered in JS.
4. In the JS post-processing `rawEvents.map(...)` (line ~235), sort `rawActions` with
   the comparator **before** the enrichment loop runs:
   ```js
   const compare = makeWorkflowOrderComparator(workflowsConfig);
   // inside the map, after `const rawActions = ...`:
   rawActions.sort(compare);
   ```
   The enrichment loop then iterates the already-ordered raw docs, so the emitted
   `enrichedActions` array preserves comparator order.
5. **Drop `sort_order` from the emitted card shape** — remove the
   `sort_order: action.sort_order ?? null,` line from **both** card branches (the
   workflow-card branch ~line 258 and the non-workflow branch ~line 270). It is
   vestigial; nothing downstream reads it.
6. Update the JSDoc card-shape comment (line ~25) to drop `sort_order` from the
   documented card fields.

**Behavior note (D4):** the comparator now also sinks `not-required` within each
event group. On the timeline this affects only rare "completed-then-deprecated"
cards (the `$lookup` card-worthiness filter only cards actions that have done real
work). This is intended; keep the rule uniform.

Overhaul `GetEventsTimeline.test.js`:

- The existing test "cards are sorted by `sort_order` ascending within an event"
  (~line 526) is a **false positive**: it seeds `workflowsConfig: []` and a
  `seedAction` helper (~line 103) that writes no `type`/`action_group`/`workflow_type`,
  so under the comparator every action resolves to `(∞, 0, ∞, '')` and falls to the
  `_id` tiebreak — the `['a-first','a-second']` assertion passes purely lexically and
  would pass even if declaration order were broken.
  - **Populate `workflowsConfig`** in the fixture (line ~60) with real
    `action_groups[]` and `actions[]`.
  - **Extend `seedAction`** (line ~103) to write `type`, `action_group`, and
    `workflow_type` onto seeded docs, and drop its `sort_order` param/field
    (lines ~109, ~131).
  - Rewrite the sort test to assert **declaration order** driven by the config's
    `actions[]` order, not lexical `_id`.
- Add coverage for: cross-group ordering within an event, a non-workflow card
  (`workflow_id: null`) sorting after workflow cards, and keyed siblings.
- Confirm event-level ordering is untouched — events still sort `date: -1`
  (latest-at-top, Part 51 F15). Do not change the `{ $sort: { date: -1 } }` stage.

## Acceptance Criteria

- `GetEventsTimeline` destructures `workflowsConfig`, removes the `$sortArray` stage,
  and sorts `rawActions` with the comparator before enrichment.
- Emitted action cards no longer include `sort_order` (both branches); the JSDoc
  card-shape comment is updated.
- `GetEventsTimeline.test.js`: `workflowsConfig` is populated, `seedAction` writes
  `type`/`action_group`/`workflow_type` and no longer writes `sort_order`, and the
  ordering test asserts declaration order. New cross-group / non-workflow-card / keyed
  coverage added. Event-level `date: -1` order unchanged.
- Package tests pass.

## Files

- `plugins/.../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js` — **modify** —
  destructure `workflowsConfig`; drop `$sortArray` stage; sort `rawActions` via
  comparator pre-enrichment; drop `sort_order` from both card branches + JSDoc.
- `plugins/.../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.test.js` — **modify** —
  populate `workflowsConfig`, extend `seedAction`, re-assert declaration order, add
  coverage.

## Notes

- Sort the **raw** docs, not the trimmed cards — sorting after the enrichment loop is
  a bug because the cards lack `type`/`action_group`/`workflow_type`.
- The non-workflow branch keeps emitting its card; only the `sort_order` field is
  removed from it.
