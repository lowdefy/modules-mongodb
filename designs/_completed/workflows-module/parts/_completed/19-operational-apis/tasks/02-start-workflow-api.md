# Task 2: Ship `start-workflow.yaml`

## Context

Task 1 established the `modules/workflows/api/` directory and the canonical handler-wrapper pattern. This task ships the second wrapper: `start-workflow` proxies into the `StartWorkflow` plugin handler at [`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js).

Handler payload contract:

- **Required:** `workflow_type`, `entity_id`, `entity_collection`. `entity_collection` is the sole entity-identity scalar (per [part 21](../../_completed/21-entity-type-to-collection/design.md)).
- **Optional:** `parent_action_id`, `actions: []`, `references: {}`. Callers do **not** supply `parent_entity_id` / `parent_entity_collection` — the handler reads them off the parent tracker action ([part 5 review-1 #1](../../_completed/05-start-cancel-handlers/review/review-1.md#1-parent-entity_id--entity_collection-provenance-contradicts-the-engine-spec)).
- **Returns:** `{ workflow_id, action_ids }`. `action_ids` preserves input order — either the order of payload `actions: []` when supplied, or the order of YAML `starting_actions:` when not (confirmed by [`StartWorkflow.js:93-95, 132-134`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js), where `actionDrafts` maps from `startingActions` and the return maps `actionDrafts.map(a => a._id)`).

`references` passes through unchanged; the handler spreads it onto the workflow + action docs with the reserved-key merge order ([engine spec § References write contract](../../../../workflows-module-concept/engine/spec.md)).

## Task

Create `modules/workflows/api/start-workflow.yaml`:

```yaml
id: start-workflow
type: Api
routine:
  - id: start
    type: StartWorkflow
    connectionId:
      _module.connectionId: workflow-api
    properties:
      workflow_type:
        _payload: workflow_type
      entity_id:
        _payload: entity_id
      entity_collection:
        _payload: entity_collection
      parent_action_id:
        _payload: parent_action_id
      actions:
        _payload: actions
      references:
        _payload: references

  - :return:
      workflow_id:
        _step: start.workflow_id
      action_ids:
        _step: start.action_ids
```

Do **not** register the API in `modules/workflows/module.lowdefy.yaml` yet — batched into task 7.

## Acceptance Criteria

- `modules/workflows/api/start-workflow.yaml` exists with the shape above.
- File parses as valid YAML.
- `id` is kebab-case; step `id` is snake_case; `connectionId` uses `_module.connectionId`.
- The optional payload fields (`parent_action_id`, `actions`, `references`) are passed through whether or not the caller supplies them — `_payload` returns `undefined` for missing keys and the handler treats them as omitted.
- The routine has no `auth:` block. Host apps gate the call site.
- No `parent_entity_id` / `parent_entity_collection` keys in the `properties:` block. Per [part 5 review-1 #1](../../_completed/05-start-cancel-handlers/review/review-1.md), callers do not supply these; the handler derives them from the parent action.

## Files

- `modules/workflows/api/start-workflow.yaml` — **create** — single-step routine invoking the `StartWorkflow` plugin request, returning `{ workflow_id, action_ids }`.

## Notes

- The handler's `actions: []` payload field is the keyed-action fan-out surface ([part 5 design](../../_completed/05-start-cancel-handlers/design.md)). Callers pass an array of `{ type, key?, status, fields?, references? }` entries to override the YAML `starting_actions:`. The routine doesn't need to validate the shape; the handler rejects bad shapes with a precise error at runtime.
- `action_ids` is returned as an array. Order matches input order (per the design's clarification at [`design.md:19`](../design.md)) — callers who want the first action's id can use `_step: start.action_ids[0]` or `_get` with `key: 0`.
