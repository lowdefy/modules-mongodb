# Task 2: Emit the `{type}-entity-data` `InternalApi` from `entity.data`

## Context

`makeWorkflowApis.js` emits the per-workflow `Api`/`InternalApi` endpoints from the raw
`workflows_config`. Hooks and action-group `on_complete` are each turned into an engine-only
`InternalApi` (`emitHookApi` at `:16-22`, `emitGroupOnCompleteApi` at `:296-303`). An
`InternalApi` blocks HTTP and client `CallApi` while staying reachable via the engine's
`callApi` — exactly how the read handlers (Task 3) will reach it.

Part 26 adds a third instance of the same pattern: one `InternalApi` per workflow that declares
`entity.data`, with id `{type}-entity-data` and `routine: workflow.entity.data.routine`.

## Task

In `modules/workflows/resolvers/makeWorkflowApis.js`:

1. **Add `emitEntityDataApi(workflow)`** — same body as `emitGroupOnCompleteApi` (`:296-303`):

   ```js
   // Engine-only for the same reason as hook Apis (see emitHookApi).
   function emitEntityDataApi(workflow) {
     if (!workflow.entity?.data) return null;
     return {
       id: `${workflow.type}-entity-data`,
       type: "InternalApi",
       routine: workflow.entity.data.routine,
     };
   }
   ```

2. **Push its result in `emitForWorkflow`** (around `:363-366`, alongside the group loop) when
   non-null:

   ```js
   const entityDataApi = emitEntityDataApi(workflow);
   if (entityDataApi) apis.push(entityDataApi);
   ```

3. Update `modules/workflows/resolvers/makeWorkflowApis.test.js`:
   - A workflow with `entity.data: { routine: [...] }` emits an `{type}-entity-data` `InternalApi`
     whose `routine` equals `workflow.entity.data.routine`.
   - A workflow with **no** `entity.data` emits no such endpoint.
   - (Optional but cheap) assert the id does not collide with any other emitted id for the same
     workflow.

## Acceptance Criteria

- A workflow declaring `entity.data` produces exactly one `{ id: "<type>-entity-data", type:
"InternalApi", routine: <the routine array> }` endpoint.
- A workflow without `entity.data` produces no entity-data endpoint.
- `pnpm jest modules/workflows/resolvers/makeWorkflowApis.test.js` passes.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — add `emitEntityDataApi`, push it in
  `emitForWorkflow`.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — add emission tests.

## Notes

- The emitted id (`${workflow.type}-entity-data`) **must** match the `data_endpoint`
  `_module.endpointId` string carried in Task 1.
- `type: "workflow"` is already rejected by `emitForWorkflow` (`:310-314`), so the reserved-name
  guard needs no change.
