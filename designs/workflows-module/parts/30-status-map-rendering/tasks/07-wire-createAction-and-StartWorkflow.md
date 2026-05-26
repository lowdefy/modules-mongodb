# Task 7: Wire `createAction` and `StartWorkflow` for initial-stage render

## Context

`createAction` (`plugins/modules-mongodb-plugins/src/connections/shared/createAction.js`) builds the draft action doc on initial insert. Today it copies only structural fields from config and payload — no `status_map` lookup, no render. The engine needs to render the initial-stage cell against the in-memory draft (per design D10), embed the rendered cell + engine-computed links + accumulated metadata in the draft, and insert. No update pipeline runs on this path — it's an `InsertOne`.

`StartWorkflow.js` calls `createAction` for each starting action; it needs to forward `payload.metadata` so the draft's render context can resolve `{{ metadata.* }}` references.

Critical ordering inside `createAction`: today's code at line 31 assigns `draft._id = randomUUID()`. The render must run **after** the UUID assignment so sentinel substitution can swap `{ action_id: true }` → `draft._id` on the rendered tree.

Per D11, the render and link computation both run against the in-memory draft (it is already the merged source of truth — there are no separate `fields` to merge on the initial-insert path).

## Task

1. **`plugins/modules-mongodb-plugins/src/connections/shared/createAction.js`**:
   - After `draft._id` is assigned and the draft's other fields are populated, compute:
     - `mergedMetadata = { ...(payload.metadata ?? {}) }` (no prior metadata — this is the first write).
     - `{ renderedCell }` = `renderStatusMap({ actionConfig, stage: initialStage, mergedActionDoc: draft, actionDisplay: payload.action_display, mergedMetadata, actionId: draft._id })`.
     - `engineLinks = computeEngineLinks(actionConfig, initialStage, draft)`.
   - Embed the rendered cell, the engine-computed link values, and `metadata: mergedMetadata` onto the draft. For built-in kinds, `engineLinks` is an object of per-slug `$mergeObjects` expressions — that shape is meant for the update pipeline, not for an InsertOne. On the insert path, resolve each `$mergeObjects: ['$<slug>', { link }]` against the draft's current slug subtree (which is `{ message }` from `renderedCell`, or absent). Practically: for the insert path, write each slug as `{ ...renderedCell[slug], link: <computed> }`. Custom-kind path: spread `renderedCell` (which carries the author's `link`); skip `engineLinks`.
   - `initialStage` is whatever the existing code already determines for the initial status entry.

2. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js`**:
   - Accept `payload.metadata` and `payload.action_display` (already passed in by the API per Task 6).
   - Forward both to `createAction` for each starting action.

3. **Tests** — add coverage to `StartWorkflow.test.js`:
   - On Start with a `status_map.action-required` cell, the inserted action doc has rendered `message` for each slug in the cell and an engine-computed `link` per slug × stage.
   - `metadata` passed in the start payload lands on the action doc and is reachable in the rendered cell via `{{ physical_id }}` (or whatever key).
   - `payload.action_display.{slug}` overrides the cell's slug subtree for the initial render.
   - For `kind: custom`, `{ action_id: true }` in an author-written link is substituted with the new action's UUID.
   - For `kind: tracker` where `child_workflow_id` is set before the engine writes the action (parent-tracker path at `StartWorkflow.js:117-128`), the `in-progress` cell's tracker link references `child_workflow_id`.

## Acceptance Criteria

- `createAction` runs the renderer + link computer and embeds the result in the draft.
- `StartWorkflow.js` forwards `metadata` and `action_display` to `createAction`.
- Start-path tests pass, including the tracker parent path.
- `pnpm -F modules-mongodb-plugins test` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify (or create new test cases).

## Notes

The `$mergeObjects` shape from `computeEngineLinks` is designed for the update pipeline. On the insert path, you flatten it to a literal `{ message, link }` per slug because there's no prior slug subtree to merge against. Keep `computeEngineLinks` as the single source of the link table — don't duplicate the link-defaults logic in `createAction`.
