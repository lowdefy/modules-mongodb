# Task 11: Action page templates + get_entity request — connection_id var and nested response read

## Context

The action page templates render a `get_entity` request that touches the entity pointer in two distinct places, each resolved differently:

- **`connectionId`** — `requests/get_entity.yaml.njk` has `connectionId: {{ entity_collection }}`, a build-time Nunjucks var threaded in by `makeActionPages`. The four page templates (`view`/`edit`/`review`/`error.yaml.njk`) pass it down via the `get_entity` `_ref` as `entity_collection: {{ entity_collection }}`.
- **entity id** — `get_entity.yaml.njk` payload reads `entity_id: { _request: get_workflow_action.entity_id }`, which consumes the `GetWorkflowAction` **response** (nested by Task 5).

Part 59:

- Renames the template var the templates read from `entity_collection` → `connection_id` (kept as a build-time Nunjucks var; the **source** — `makeActionPages.js:86` value and the build-var **key** — is owned by **Part 57**).
- Changes the `get_entity` payload read to the nested response field `get_workflow_action.entity.id`.

## Task

### `requests/get_entity.yaml.njk`

- `connectionId: {{ entity_collection }}` → `connectionId: {{ connection_id }}`.
- Payload entity-id read:

  ```yaml
  payload:
    entity_id:
      _request: get_workflow_action.entity.id
  ```

  (The `payload.entity_id` **key** is this request's own internal payload name into its `$match` pipeline — leave it as `entity_id`; only its **value** changes to read the nested response field.)

### `templates/view.yaml.njk`, `edit.yaml.njk`, `review.yaml.njk`, `error.yaml.njk`

In each template's `get_entity` `_ref` `vars`, rename the threaded var:

```yaml
- _ref:
    path: requests/get_entity.yaml.njk
    vars:
      connection_id: { { connection_id } }
```

Update the build-time-vars doc-comment block at the top of each template (the `entity_collection: workflow.entity_collection (connection id baked into get_entity)` line) to `connection_id`.

## Acceptance Criteria

- `get_entity.yaml.njk` uses `connectionId: {{ connection_id }}` and reads `get_workflow_action.entity.id`.
- All four page templates thread `connection_id: {{ connection_id }}` into the `get_entity` `_ref` and their doc comments name `connection_id`.
- No `{{ entity_collection }}` remains in `modules/workflows/templates/` or `modules/workflows/requests/`.
- The demo build (`pnpm ldf:b`) compiles once Part 57's `makeActionPages` change (build-var key `connection_id`) has landed.

## Files

- `modules/workflows/requests/get_entity.yaml.njk` — modify — `connectionId` var + nested response read.
- `modules/workflows/templates/view.yaml.njk` — modify — `_ref` var rename + comment.
- `modules/workflows/templates/edit.yaml.njk` — modify — `_ref` var rename + comment.
- `modules/workflows/templates/review.yaml.njk` — modify — `_ref` var rename + comment.
- `modules/workflows/templates/error.yaml.njk` — modify — `_ref` var rename + comment.

## Notes

- This task depends on Task 5 (the `GetWorkflowAction` response now nests `entity`) and on **Part 57** (which renames the `makeActionPages` build-var key feeding `{{ connection_id }}` and changes its source to `workflow.entity.connection_id`). If Part 57's `makeActionPages` change has not landed, the templates read an undefined `connection_id` var (accepted in-between broken state).
- The host page's own `get_entity` request id and the entity-record fields it returns are the host's contract and are unaffected.
