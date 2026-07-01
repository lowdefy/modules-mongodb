# Task 7: Wire `createAction` and `StartWorkflow` for initial-stage render

## Context

`createAction` (`plugins/modules-mongodb-plugins/src/connections/shared/createAction.js`) builds the draft action doc on initial insert. Today it copies only structural fields from config and payload — no `status_map` lookup, no render, and no top-level `workflow_type` on the action doc (only nested as `tracker.workflow_type` for tracker kind, which refers to the _child_ workflow). The engine needs:

- Denormalise the owning workflow's `workflow_type` onto every action doc (alongside the existing `entity_id` / `entity_collection` denormalisations). This is the field `computeEngineLinks` reads for the `form` kind's `pageId` and the field the event-display render context exposes via `action.workflow_type`.
- Rename the existing tracker-subtree write at line 51 from `tracker: { workflow_type: actionConfig.tracker.workflow_type }` to `tracker: { child_workflow_type: actionConfig.tracker.workflow_type }`. The action-doc field carrying the child workflow's type becomes `tracker.child_workflow_type`, paralleling the existing `child_workflow_id` / `child_entity_id` / `child_entity_collection` siblings on the same subtree and disambiguating from the new top-level `workflow_type` (the parent's type). The action **config** side (`actionConfig.tracker.workflow_type`, read here) is unchanged — author-facing YAML keeps the simpler name where there's no collision.
- Render the initial-stage cell against the in-memory draft (per design D10), embed the rendered cell + engine-computed links + accumulated metadata in the draft, and insert. No update pipeline runs on this path — it's an `InsertOne`.

The new signature is:

```
createAction(context, { workflow, action, actionDisplay, metadata, eventId })
```

Two new keyed params vs today: `actionDisplay` (per-call cell override, D8) and `metadata` (caller-supplied accumulating bag, D10).

`StartWorkflow.js` calls `createAction` for each starting action; it needs to forward `payload.metadata` and `payload.action_display` (already passed in by the API per Task 6) so the draft's render context can resolve `{{ metadata.* }}` references and apply caller overrides.

Critical ordering inside `createAction`: today's code at line 31 assigns `draft._id = randomUUID()`. The render must run **after** the UUID assignment so sentinel substitution can swap `{ action_id: true }` → `draft._id` on the rendered tree.

Per D11, the render and link computation both run against the in-memory draft (it is already the merged source of truth — there are no separate `fields` to merge on the initial-insert path).

## Task

1. **`plugins/modules-mongodb-plugins/src/connections/shared/createAction.js`**:
   - Accept the new signature `(context, { workflow, action, actionDisplay, metadata, eventId })`.
   - Populate `draft.workflow_type = workflow.workflow_type` alongside the existing `entity_id` / `entity_collection` denormalisations. Immutable after creation.
   - Rename the tracker-subtree write at line 51: `tracker: { workflow_type: actionConfig.tracker.workflow_type }` → `tracker: { child_workflow_type: actionConfig.tracker.workflow_type }`. (Read side of `actionConfig.tracker.workflow_type` is unchanged — config YAML keeps the simpler name.)
   - After `draft._id` is assigned and the draft's other fields are populated, compute:
     - `mergedMetadata = { ...(metadata ?? {}) }` (no prior metadata — this is the first write).
     - `{ renderedCell }` = `renderStatusMap({ actionConfig, stage: initialStage, mergedActionDoc: draft, actionDisplay, mergedMetadata, actionId: draft._id })`.
     - `engineLinks = computeEngineLinks({ actionConfig, stage: initialStage, actionDoc: draft, entryId: context.entry_id })`.
   - Embed the rendered cell, the engine-computed link values, and `metadata: mergedMetadata` onto the draft. For built-in kinds, `engineLinks` is an object of per-slug `$mergeObjects` expressions — that shape is meant for the update pipeline, not for an InsertOne. On the insert path, resolve each `$mergeObjects: ['$<slug>', { link }]` against the draft's current slug subtree (which is `{ message }` from `renderedCell`, or absent). Practically: for the insert path, write each slug as `{ ...renderedCell[slug], link: <computed> }`. Custom-kind path: spread `renderedCell` (which carries the author's `link`); skip `engineLinks`.
   - `initialStage` is whatever the existing code already determines for the initial status entry.

2. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js`** — three changes:
   1. Accept `payload.metadata` and `payload.action_display` (already passed in by the API per Task 6) and forward both to `createAction` for each starting action via the named keyed args `metadata` and `actionDisplay`.
   2. The parent-tracker `updateAction` push at lines 117-128 inherits render + link computation from `updateAction` (Task 8); it omits `actionDisplay` / `metadata` (relying on the safe defaults `{}` / `null`), and is the call site that produces the tracker's first non-null `link` once `child_workflow_id` is set. Sticky display + prior `action.metadata` cover the render context for this internal push. This is the canonical test case for D11's "Engine-link merge rule" — link computation must run against `{ ...actionDocBeforeWrite, ...fields }` so the `in-progress` cell's tracker link picks up the newly-set `child_workflow_id`.
   3. Update the parent-tracker validation at lines 67-71 to read the renamed action-doc field: `parent.tracker?.workflow_type` → `parent.tracker?.child_workflow_type`, and update the error string at line 69 from `"parent tracker.workflow_type"` to `"parent tracker.child_workflow_type"`. See the `createAction.js` step above for the rename rationale.

3. **Tests** — add coverage to `StartWorkflow.test.js`:
   - On Start, every inserted action doc carries top-level `workflow_type` equal to the workflow's `workflow_type`.
   - Tracker action docs carry `tracker.child_workflow_type` (the renamed field) — not `tracker.workflow_type` — and the value matches `actionConfig.tracker.workflow_type` from config.
   - On Start with a `status_map.action-required` cell, the inserted action doc has rendered `message` for each slug in the cell and an engine-computed `link` per slug × stage.
   - Every emitted built-in-kind `link.pageId` is prefixed with `${context.entry_id}/` (asserts the entry-id threading from Task 6 reaches the renderer).
   - `metadata` passed in the start payload lands on the action doc and is reachable in the rendered cell via `{{ physical_id }}` (or whatever key).
   - `action_display.{slug}` (passed via payload, forwarded as `actionDisplay`) overrides the cell's slug subtree for the initial render.
   - For `kind: custom`, `{ action_id: true }` in an author-written link is substituted with the new action's UUID.
   - For `kind: tracker` where `child_workflow_id` is set before the engine writes the action (parent-tracker path at `StartWorkflow.js:117-128`), the `in-progress` cell's tracker link references `child_workflow_id`.
   - For `kind: form`, the computed `pageId` interpolates `draft.workflow_type` correctly (asserts the denormalisation is wired).
   - Parent-tracker validation at lines 67-71 reads `parent.tracker?.child_workflow_type`; a missing field produces the new error message.

## Acceptance Criteria

- `createAction` accepts the new signature with `actionDisplay` and `metadata` keyed params.
- `createAction` writes top-level `workflow_type` on every action doc.
- `createAction` writes `tracker.child_workflow_type` (not `tracker.workflow_type`) on tracker action docs.
- `createAction` runs the renderer + link computer and embeds the result in the draft, threading `context.entry_id` into `computeEngineLinks`.
- `StartWorkflow.js` forwards `metadata` and `action_display` to `createAction`.
- `StartWorkflow.js` parent-tracker validation reads `parent.tracker?.child_workflow_type` and the error string matches.
- Start-path tests pass, including the tracker parent path and the form-pageId case.
- `pnpm -F modules-mongodb-plugins test` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify (or create new test cases).

## Notes

The `$mergeObjects` shape from `computeEngineLinks` is designed for the update pipeline. On the insert path, you flatten it to a literal `{ message, link }` per slug because there's no prior slug subtree to merge against. Keep `computeEngineLinks` as the single source of the link table — don't duplicate the link-defaults logic in `createAction`.

`workflow_type` is immutable on the action doc after creation; nothing in `updateAction` or the cascade should rewrite it.
