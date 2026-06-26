# Task 10: get-entity-workflows API + entity-workflow components — nested param and renamed \_var inputs

## Context

The `get-entity-workflows` endpoint and the two entity-workflow components form the client side of the `GetEntityWorkflows` param contract (Task 4), which is now `entity: { connection_id, id }`.

- `modules/workflows/api/get-entity-workflows.yaml` maps `properties: { entity_collection: { _payload: entity_collection }, entity_id: { _payload: entity_id } }`.
- `modules/workflows/components/actions-on-entity.yaml` (onMount `CallAPI`) and `modules/workflows/components/entity-workflows-refetch.yaml` (a `CallAPI` action snippet) take `_var: entity_id` and `_var: entity_collection` from their `_ref` callers and pass them flat in the `get-entity-workflows` payload.

Part 59: the endpoint forwards the whole `entity` object; the components rename their `_var: entity_collection` input to `_var: entity_connection_id` (kept flat — a dotted `_var` name would be awkward, but it adopts the `connection_id` name for consistency) and assemble the nested `entity` object in the `CallAPI` payload.

## Task

### `api/get-entity-workflows.yaml`

Replace the two flat properties with a whole-object forward (the param genuinely **is** `{ connection_id, id }`, so forwarding the client object as-is is exactly right):

```yaml
properties:
  entity:
    _payload: entity
```

### `components/actions-on-entity.yaml`

- Update the `Vars:` doc comment: rename `entity_collection` → `entity_connection_id`.
- In the `call_entity_workflows` `CallAPI` payload, replace:

  ```yaml
  payload:
    entity_id:
      _var: entity_id
    entity_collection:
      _var: entity_collection
  ```

  with the nested object built from the (renamed) vars:

  ```yaml
  payload:
    entity:
      id:
        _var: entity_id
      connection_id:
        _var: entity_connection_id
  ```

### `components/entity-workflows-refetch.yaml`

Apply the same payload change to the `refetch_entity_workflows` `CallAPI`:

```yaml
payload:
  entity:
    id:
      _var: entity_id
    connection_id:
      _var: entity_connection_id
```

## Acceptance Criteria

- `get-entity-workflows.yaml` forwards `entity: { _payload: entity }`; no flat `entity_collection` / `entity_id` properties remain.
- Both components read `_var: entity_id` and `_var: entity_connection_id` and build a nested `entity: { id, connection_id }` payload.
- `actions-on-entity.yaml` doc comment names the renamed input.
- `pnpm ldf:b` (from `apps/demo`) compiles once the matching app caller var rename (Task 12) lands — note the components and their callers must move together.

## Files

- `modules/workflows/api/get-entity-workflows.yaml` — modify — whole-object `entity` forward.
- `modules/workflows/components/actions-on-entity.yaml` — modify — `_var` rename + nested payload + doc comment.
- `modules/workflows/components/entity-workflows-refetch.yaml` — modify — `_var` rename + nested payload.

## Notes

The `_var: entity_id` input keeps its flat name (it is a local composition token, not a persisted field). Only the `entity_collection` input is renamed (to `entity_connection_id`). The app `_ref` callers that supply these vars (the Part 56 action-workspace shell — `thing-view.yaml`, `lead-view.yaml`, `companies/vars.yaml`) are renamed in the app tasks (12, 13) and must land alongside this task — between them the demo build is broken (accepted: unreleased modules).
