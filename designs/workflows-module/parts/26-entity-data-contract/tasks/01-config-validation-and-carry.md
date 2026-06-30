# Task 1: Validate `entity.data` and carry the resolved `data_endpoint`

## Context

`makeWorkflowsConfig.js` validates the raw `workflows_config` and materializes the runtime
config carried onto the `workflow-api` connection (via `components/validated_workflows_config.yaml`
→ `properties.workflowsConfig`). The read handlers consume this `workflowsConfig`.

Part 26 adds an optional **`entity.data`** block to a workflow's `entity:` config — an inline
routine in the `{ routine: [...] }` envelope, identical in shape to a hook phase
(`hooks.{signal}.{phase}`) and an action group's `on_complete`. This task makes the resolver:

1. **Validate** `entity.data` (when present) with a new `validateEntityData` that mirrors
   `validateGroupOnComplete` (`makeWorkflowsConfig.js:247-267`).
2. **Remove** the now-dead `entity.name_field` validation block (`makeWorkflowsConfig.js:805-816`)
   — the routine returns `name` instead.
3. In the entity-carry step (`makeWorkflowsConfig.js:1051-1054`), **strip** the raw `data` routine
   from the carried `entity` block (build-only, heavy) and, **when `data` was present**, add
   `data_endpoint: { "_module.endpointId": "${workflow.type}-entity-data" }`. The build walker
   resolves `_module.endpointId` in resolver output to a pre-scoped opaque string
   (`<workflowsEntryId>/<type>-entity-data`) — the same resolution hook refs rely on
   (`makeWorkflowApis.js:36-40`).

`title`, `connection_id`, `ref_key`, `page_id`, `id_query_key`, `list_page_id`/`list_title`
all stay unchanged. `connection_id` stays (entity identity / `GetEntityWorkflows` query).

The endpoint id `{type}-entity-data` is collision-free: hook ids are 4 segments, group ids are
`{type}-group-{id}-on-complete`, lifecycle/submit ids are `{type}-{submit|start|cancel|close|update-fields}`.

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. **Add `validateEntityData(workflow)`** near `validateGroupOnComplete` (lines 247-267). It runs
   only when `workflow.entity?.data` is present. Reject:
   - a **string** value with the same legacy-shape message hooks/`on_complete` emit, e.g.:
     `entity.data is a string ("${value}") — the legacy shape pointing at an external Api id. Convert to an inline routine object: { routine: [ ... ] }.`
   - a non-object / null / `routine`-not-an-array value with a routine-array message, e.g.:
     `entity.data must be an object with a routine: array (got: ${JSON.stringify(value)}).`

   Do **not** validate routine internals — same depth as hook / `on_complete` validation (the
   build walks and validates the routine like any other).

2. **Call `validateEntityData(workflow)`** from `validateWorkflow` (alongside the other entity
   validations, after the `entity.title` / `id_query_key` checks around line 803).

3. **Remove** the `entity.name_field` validation block at `makeWorkflowsConfig.js:805-816`
   (the `if ("name_field" in entity ...)` check and its comment).

4. **In the entity-carry step** (lines 1051-1054), replace the wholesale `entity` carry with one
   that strips `data` and conditionally adds `data_endpoint`. Roughly:

   ```js
   const { data: entityData, ...entityRest } = workflow.entity;
   // ...
   entity: {
     ...entityRest,
     id_query_key: workflow.entity.id_query_key ?? "_id",
     ...(entityData
       ? { data_endpoint: { "_module.endpointId": `${workflow.type}-entity-data` } }
       : {}),
   },
   ```

   The carried `entity` block must **never** contain the raw `data` routine, and must contain
   `data_endpoint` **iff** `entity.data` was authored.

5. Update `modules/workflows/resolvers/makeWorkflowsConfig.test.js`:
   - Drop/adjust any `name_field` validation tests.
   - Add tests: a valid `entity.data: { routine: [...] }` is accepted; the carried `entity` has
     `data_endpoint: { "_module.endpointId": "<type>-entity-data" }` and **no** `data` key.
   - A string `entity.data` fails with the "convert to an inline routine object" message.
   - `entity.data: { routine: 42 }` fails with the routine-array message.
   - When `entity.data` is absent, the carried `entity` has **no** `data_endpoint` key.

## Acceptance Criteria

- `validateEntityData` rejects the string form and the non-routine-array form with clear messages;
  accepts a `{ routine: [...] }` object.
- `entity.name_field` validation is gone; supplying `name_field` no longer has special handling.
- Carried `entity` block strips `data` and carries `data_endpoint` only when `data` was present.
- `pnpm jest modules/workflows/resolvers/makeWorkflowsConfig.test.js` passes.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `validateEntityData`, wire it
  into `validateWorkflow`, remove the `name_field` validation block, transform the entity carry.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — drop `name_field` tests, add
  `entity.data` validation + carry tests.

## Notes

- Keep the error-message phrasing consistent with `validateHooks` (`:170-185`) and
  `validateGroupOnComplete` (`:251-266`) — the design wants the same migration hint so the
  rejected-draft `data_endpoint: <id>` form lands here with a clear message.
- This task's `data_endpoint` id string **must** exactly match the id emitted in Task 2
  (`${workflow.type}-entity-data`).
