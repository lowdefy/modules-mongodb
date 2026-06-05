# Task 4: `planFieldsUpdate` pure planner

## Context

Part 38's planners under `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/` are pure functions: no I/O, no id/clock minting — `event_id` / `now` (`{ timestamp, user }`) / `newId` are injected per invocation. `planActionTransition.js` is the reference for the planned-action-doc composition pattern (whole post-commit doc + `changeLog: { before, after }` delta), including how the status-map cell is re-rendered against the planned doc:

```js
const cell = actionConfig.status_map?.[stage];
const rendered = renderStatusMap({ cell, plannedActionDoc: doc, mergedMetadata: doc.metadata });
doc = deepMerge(doc, rendered);
```

This task ships the planner for the `UpdateActionFields` operation. The motivating invariant (design: "Why it still goes through the engine"): status-map cells can reference `assignees` / `due_date` (the D12 render context spreads them into the cell template), so a fields change must re-render the sticky cell or the entity-page card shows stale data. The plan touches **one action doc and no workflow doc**.

Task 1 added the `UpdateActionFields` handler type to `planEventDispatch` (event type `action-fields-updated`, `metadata.comment` support). Task 3 made `Plan.workflow` nullable.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.js`:

```js
function planFieldsUpdate({ loadedState, fields, comment, metadata, context }) → Plan
```

(Pick the exact signature to match sibling planners' conventions; `context` supplies `event_id`, `now`, `connection`, `user`, `lowdefyContext`.)

Composition steps (all pure):

1. **Planned action doc** — start from `loadedState.targetAction`:
   - Apply `$set` semantics for exactly the three universal fields from the `fields` bag: a key **present** in `fields` is written (`null` clears), a key **absent** leaves the stored value unchanged. Ignore any other keys in the bag — this operation owns exactly `assignees` / `due_date` / `description`.
   - Refresh the change stamp: `updated: now`.
   - Merge metadata: `metadata: { ...(action.metadata ?? {}), ...(metadata ?? {}) }` (same pattern as `planActionTransition`'s update path; the emitted endpoint sends no metadata bag in v1, so this is normally a no-op merge).
   - **No status change**: `status` array untouched, no new status entry, stage stays `targetAction.status[0].stage`.
2. **Re-render the status-map cell** against the planned doc: `cell = actionConfig.status_map?.[currentStage]`, then `renderStatusMap` + `deepMerge` exactly as `planActionTransition` does. Do **not** recompute engine links (`computeEngineLinks`) — stage and access are unchanged, so links are unchanged.
3. **Event** — `planEventDispatch` with `handlerType: 'UpdateActionFields'`, `plannedWorkflowDoc: loadedState.workflow` (the loaded doc verbatim — nothing recomputes it), `plannedActionDoc` = the planned doc, `allTouchedActionDocs: [plannedDoc]`, `comment` from the payload.
4. **Change-log** — `planChangeLog` with `planActions: [{ doc, operation: 'update', changeLog: { before: targetAction, after: doc } }]`, `planWorkflow: null`, `connection`, `lowdefyContext`, `timestamp: now.timestamp`.
5. **Return the Plan**: `{ workflow: null, actions: [entry], event, changeLog }`. No `trackerFires` / `completedGroups` — this is not a transition.

Create `planFieldsUpdate.test.js` (mirror sibling planner test setup):

- Fields `$set` semantics: present keys written, `null` clears, omitted keys preserved, non-universal keys in the bag ignored (never written to the doc).
- `updated` carries the injected `now`; `status` array identical before/after; stage unchanged.
- Cell re-render: a `status_map` cell templating `{{ action.assignees }}`-style content reflects the NEW field values on the planned doc; omitted cell keys keep prior sticky values (deepMerge semantics); no cell configured for the stage → doc unchanged apart from fields/stamp.
- Engine-link slugs on the doc are untouched.
- Event doc: type `action-fields-updated`, references carry workflow id / action id / entity-ref key, `metadata.comment` from payload.
- Change-log: one `MongoDBUpdateOne` entry with correct before/after; empty when `connection.changeLog` is unconfigured.
- `Plan.workflow` is `null`.
- Purity: no calls into mongo helpers; same inputs → same output.

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test planFieldsUpdate` passes.
- The planner is pure (no imports from `../../mongo/`).
- Plan shape is consumable by task 3's amended `commitPlan` (one action update, null workflow).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.test.js` — create.

## Notes

- `due_date` values arrive as dates (or null) from the payload; the planner treats them opaquely — no parsing/formatting here.
- `description` is `{ text, html } | null` (the comment shape — task 12 amends the engine spec accordingly). The planner treats it opaquely.
- Keep the JSDoc in the house style of the sibling planners (contract-first, design-decision references).
