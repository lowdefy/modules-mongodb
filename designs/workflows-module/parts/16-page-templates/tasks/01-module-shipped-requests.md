# Task 1: Module-shipped requests (`get_action`, `get_workflow`, `get_entity`)

## Context

Part 12's page shell carries no `requests:` block — templates own request wiring. Part 16's templates run a fixed 8-step `onMount` sequence that fires three module-shipped requests in order:

1. `get_action` — loads the action doc by the URL query `action_id`.
2. `get_workflow` — loads the parent workflow doc by `_request: get_action.workflow_id` (needed because form-field state lives on the workflow doc at `form_data.{action_type}.{key}.{field}`, not the action doc).
3. `get_entity` — loads the action's entity doc by `_request: get_action.entity_id`, querying the entity's own collection (per part 21, `entity_collection` carried on the action doc is the connection id to query).

These requests live in `modules/workflows/requests/` (a new directory). Templates `_ref` them from inside their Nunjucks bodies and inject them into the page's `requests:` list. Authors who need different shapes author their own `page_config.requests:` to override or augment.

The workflows module already declares two MongoDB connections in its manifest comments (`workflows-collection`, `actions-collection`) and reads the `workflow-api` connection in the API endpoints — see `modules/workflows/api/get-entity-workflows.yaml:6-7` for the connection-id pattern.

The `get_entity` request is unusual: each emitted page binds it to a specific entity collection at Nunjucks render time, because `entity_collection` varies per workflow type. Part 12 passes `entity_collection` to every template as a build-time var; the template substitutes `{{ entity_collection }}` into the `connectionId` literal so each page bakes its specific connection id into the request.

## Task

Create three new files under `modules/workflows/requests/`:

### `modules/workflows/requests/get_action.yaml`

```yaml
id: get_action
type: MongoDBFindOne
connectionId:
  _module.connectionId: actions-collection
payload:
  action_id:
    _url_query: action_id
properties:
  query:
    _id:
      _payload: action_id
```

Single `$match`-equivalent find on `_id`. Returns the action doc (carries `workflow_id`, `entity_id`, `entity_collection`, `status[]`, `key`, the universal fields `assignees` / `due_date` / `description`, and any author-defined per-action scalars).

### `modules/workflows/requests/get_workflow.yaml`

```yaml
id: get_workflow
type: MongoDBFindOne
connectionId:
  _module.connectionId: workflows-collection
payload:
  workflow_id:
    _request: get_action.workflow_id
properties:
  query:
    _id:
      _payload: workflow_id
```

Single find on `_id`. Depends on `get_action` having resolved first (template wires the order in `onMount`).

### `modules/workflows/requests/get_entity.yaml.njk`

This one is a Nunjucks template (not plain YAML) because the `connectionId` is substituted at template-render time from the `entity_collection` build-time var passed by part 12:

```yaml
id: get_entity
type: MongoDBFindOne
connectionId: {{ entity_collection }}
payload:
  entity_id:
    _request: get_action.entity_id
properties:
  query:
    _id:
      _payload: entity_id
```

The `connectionId` is the literal entity-collection name (e.g. `leads-collection`, `tickets-collection`), substituted by the Nunjucks engine when the page is rendered. Each emitted page bakes its specific connection id into the request.

## Acceptance Criteria

- All three files exist under `modules/workflows/requests/`.
- `get_action.yaml` and `get_workflow.yaml` are plain YAML (no Nunjucks).
- `get_entity.yaml.njk` substitutes `{{ entity_collection }}` into `connectionId` (case-insensitive — the var is whatever string part 12 passes).
- `get_action`'s `query._id` reads from the `_url_query: action_id` URL parameter, threaded via `payload.action_id`.
- `get_workflow`'s `query._id` reads from `_request: get_action.workflow_id`, threaded via `payload.workflow_id`.
- `get_entity`'s `query._id` reads from `_request: get_action.entity_id`, threaded via `payload.entity_id`.
- Request IDs use snake_case per the CLAUDE.md "Snake case request IDs" rule (`get_action`, `get_workflow`, `get_entity` — no kebab-case).
- File names use snake_case per the CLAUDE.md "File naming conventions" rule (request files are snake_case).

## Files

- `modules/workflows/requests/get_action.yaml` — create — single MongoDBFindOne on `actions-collection` by `_id: { _url_query: action_id }`.
- `modules/workflows/requests/get_workflow.yaml` — create — single MongoDBFindOne on `workflows-collection` by `_id: { _request: get_action.workflow_id }`.
- `modules/workflows/requests/get_entity.yaml.njk` — create — single MongoDBFindOne whose `connectionId` is `{{ entity_collection }}` substituted at Nunjucks render time, querying by `_id: { _request: get_action.entity_id }`.

## Notes

- **Use `MongoDBFindOne`, not `MongoDBAggregation`.** The existing aggregation request (`get-entity-workflows.yaml`) needs the heavier machinery (`$lookup`, `$sort`, `access_filter` stage). These three are simple by-id reads — keep them small. If the implementer finds that `MongoDBFindOne` isn't a recognized type in the Lowdefy plugin set this repo uses, fall back to `MongoDBAggregation` with a single `$match` stage (see `modules/notifications/requests/get-selected-notification.yaml` for a working example of the aggregation pattern from this repo).
- **No projections.** The design's "Module-shipped requests" section explicitly says "All three requests are kept simple (single `$match`, no projections)." Apps that need narrower fetches author their own `page_config.requests:`.
- **`get_entity` runs against an external collection.** The entity's collection (`leads-collection`, `tickets-collection`, etc.) isn't owned by the workflows module — it belongs to whichever host-app domain registered the entity. The connectionId is the bare string the host app's lowdefy.yaml registered, and Lowdefy resolves it at runtime.
- **Don't add this directory to `module.lowdefy.yaml`.** Requests aren't a manifest export — they're consumed by `_ref` from templates and from apps' page YAML. The module manifest doesn't need to list them.
- **Verification at this task level is light:** the requests can't be run standalone (they need a page context with URL query). Verification is "the files exist with the right shape"; runtime verification happens when task 2 (view template) wires them up.
