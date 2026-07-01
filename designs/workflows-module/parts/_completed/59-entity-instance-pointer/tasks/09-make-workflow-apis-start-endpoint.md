# Task 9: makeWorkflowApis — nest the generated start endpoint param mapping

## Context

`modules/workflows/resolvers/makeWorkflowApis.js` generates a per-workflow-type start endpoint (`emitStartEndpoint`). Its `StartWorkflow` routine maps the payload to params (~lines 218-221):

```js
workflow_type: workflow.type,
entity_id: { _payload: 'entity_id' },
entity_collection: { _payload: 'entity_collection' },
parent_action_id: { _payload: 'parent_action_id' },
```

Part 59 drops the connection id from the start payload (it's sourced from config in StartWorkflow, Task 3) and nests the entity id. The narrow pick **is the filter**: mapping only `entity: { id: { _payload: entity.id } }` mechanically prevents a caller from smuggling in a conflicting `connection_id` — it never reaches the method. A whole-object forward (`entity: { _payload: entity }`) is deliberately **not** used here (it would pass a stray `connection_id` through, or hard-error under a strict schema).

## Task

In `emitStartEndpoint`, replace the two flat entity properties:

```js
entity_id: { _payload: 'entity_id' },
entity_collection: { _payload: 'entity_collection' },
```

with the nested, id-only mapping:

```js
entity: { id: { _payload: 'entity.id' } },
```

Leave `workflow_type`, `parent_action_id`, `actions`, `references`, `metadata`, `render_config`, and `lifecycle_event_override` unchanged.

### Test

`makeWorkflowApis.test.js` — update the generated start-endpoint param assertions: expect `entity: { id: { _payload: 'entity.id' } }` and assert no `entity_collection` property is emitted.

## Acceptance Criteria

- The generated start endpoint maps `entity: { id: { _payload: 'entity.id' } }` and emits no `entity_collection` / flat `entity_id` property.
- `makeWorkflowApis.test.js` passes.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — nested start-endpoint param mapping.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — updated param assertions.

## Notes

Confirm the `_payload` dotted-path form (`'entity.id'`) is how this resolver expresses nested payload reads — match the surrounding mapping idiom in the file. Depends on Task 3 (StartWorkflow now reads `params.entity.id`).
