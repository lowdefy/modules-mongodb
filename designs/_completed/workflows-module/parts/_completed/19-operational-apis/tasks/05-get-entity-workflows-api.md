# Task 5: Ship `get-entity-workflows.yaml`

## Context

`get-entity-workflows` is consumed by part 18's `actions-on-entity` component — the per-entity widget that renders workflow rows with grouped actions. It runs as a Lowdefy routine (not a plugin handler — see [design § Read path: Lowdefy routines](../design.md)) over the read-only `workflows-collection` and `actions-collection` connections.

Payload: `{ entity_id, entity_collection }`.

Per [`design.md` § `api/get-entity-workflows.yaml`](../design.md), the routine:

1. Finds all workflows for the entity (`entity_id` + `entity_collection` match).
2. Looks up all actions for those workflows.
3. Filters actions per the access rule (task 4's reusable stage).
4. Sorts workflows by `display_order` ASC, tie-break `created.timestamp` DESC.
5. Returns: array of workflows, each with `actions[]` filtered. Keyed actions surface as N rows (one per instance, identified by `key`). Each workflow doc carries its persisted `groups[]` array (engine-written, positionally ordered) — consumers (part 18) read positionally.

**Grouping note.** The design says "Group actions by workflow + by `action_group` (read positionally from each workflow's persisted `groups[]`)." Grouping is consumer-side, not aggregation-side: the routine returns each workflow with a flat `actions[]` array; part 18 reads the workflow's `groups[]` positionally and slots actions in by their `action_group` field. The aggregation just has to keep actions associated with their workflow (via `$lookup`) and pass through.

## Task

Create `modules/workflows/api/get-entity-workflows.yaml`:

```yaml
id: get-entity-workflows
type: Api
routine:
  - id: query
    type: MongoDBAggregation
    connectionId:
      _module.connectionId: workflows-collection
    properties:
      pipeline:
        # Stage 1: match workflows for this entity.
        - $match:
            entity_collection:
              _payload: entity_collection
            entity_id:
              _payload: entity_id

        # Stage 2: sort by display_order ASC, then created.timestamp DESC.
        - $sort:
            display_order: 1
            created.timestamp: -1

        # Stage 3: lookup actions, applying the access filter inside the
        # sub-pipeline so unauthorized actions never leave Mongo.
        - $lookup:
            from: actions
            let:
              workflowId: $_id
            pipeline:
              - $match:
                  $expr:
                    $eq:
                      - $workflow_id
                      - $$workflowId
              - _ref: stages/access_filter.yaml
            as: actions

  - :return:
      workflows:
        _step: query
```

The `MongoDBAggregation` step's `connectionId` is `workflows-collection` (the entity-side collection). The `$lookup`'s `from: actions` references the **physical** collection name (`actions`) the `actions-collection` Lowdefy connection wraps — `$lookup` operates on raw Mongo collection names, not Lowdefy connection ids. Confirm the physical name when wiring; if part 3 / 20's connection config sets the collection to something else, update accordingly.

The `pipeline:` inside `$lookup` runs against the `actions` collection. The first stage joins on `workflow_id`; the second stage `_ref`s the access filter from task 4.

The return wraps the aggregation result in a `workflows` key (rather than returning a bare array) so consumers can extend the response shape additively without a breaking change.

Do **not** register the API in `modules/workflows/module.lowdefy.yaml` yet — batched into task 7.

## Acceptance Criteria

- `modules/workflows/api/get-entity-workflows.yaml` exists with the pipeline above.
- File parses as valid YAML.
- `id` is kebab-case (`get-entity-workflows`); step `id` is snake_case (`query`); connection refs use `_module.connectionId`.
- The `$match` reads payload values via `_payload`, not `_state` (per CLAUDE.md anti-pattern).
- The `$sort` keys (`display_order`, `created.timestamp`) match the design's commitment exactly.
- The access filter is `_ref`'d from `stages/access_filter.yaml` (task 4), not duplicated inline.
- The return wraps the result in `{ workflows: <array> }`.
- The routine does not flatten `groups[]` into the response — each workflow's persisted `groups[]` array passes through as-is (consumers read positionally per [part 18 design § `actions-on-entity`](../../18-entity-components/design.md)).
- Keyed actions are not collapsed — each action doc surfaces as its own entry in `actions[]`, with `key` populated (the action doc shape already carries `key` per [part 5 design § StartWorkflow.js](../../_completed/05-start-cancel-handlers/design.md)).

## Files

- `modules/workflows/api/get-entity-workflows.yaml` — **create** — `MongoDBAggregation` pipeline matching workflows for an entity, lookup'ing filtered actions, sorted by `display_order`.

## Notes

- **Verify the `from:` collection name.** `$lookup`'s `from` is the physical Mongo collection name. The `actions-collection` Lowdefy connection wraps a physical collection — at present that's `actions` per [part 3 design](../../03-engine-plugin-shell/design.md) and [`CancelWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) (`mongoDBConnection('actions')`). If the physical name changes during part 20's wiring (e.g. namespaced per-tenant), update both this task and task 6.
- **No client-side post-processing.** The aggregation returns workflows in sort order with filtered actions inlined. The consumer (`actions-on-entity` component, part 18) iterates and slots actions into the workflow's `groups[]` positionally. Part 19 does not do the grouping itself.
- **Empty results.** When the entity has no workflows, the routine returns `{ workflows: [] }`. Consumers handle empty arrays.
- **Performance posture.** This is a per-entity-page query; expected cardinality is small (single-digit workflows, single-digit-to-low-double-digit actions per workflow). No pagination, no projection trimming in v1 — the action docs carry small payloads (status array, summary, references), and the consumer needs most of the fields for display. If a real app surfaces a hot path with hundreds of actions per entity, revisit with an index recommendation; not in v1 scope.
