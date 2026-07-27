# Task 6: Ship `get-workflow-overview.yaml`

## Context

`get-workflow-overview` is consumed by part 17's shared `workflow-overview` page (`?workflow_id=<id>`). It runs as a Lowdefy routine over the read-only `workflows-collection` and `actions-collection` connections.

Payload: `{ workflow_id }`.

Per [`design.md` § `api/get-workflow-overview.yaml`](../design.md), the routine:

1. Finds the workflow by `_id`.
2. Looks up all actions for the workflow.
3. Filters per access (same rule as `get-entity-workflows` — uses the stage from task 4).
4. Orders actions: workflow's `action_groups[]` declaration order (primary), then `sort_order` ASC (secondary), then YAML declaration order (tie-break). Keyed actions surface as N rows (one per instance, identified by `key`), kept together within their parent action's sort slot.
5. Returns `{ workflow, actions: [] }`. If no visible actions, returns `{ workflow: null, actions: [] }` so the page redirects back to its host entity page (`actions-on-entity`). The access-vs-existence distinction is intentionally collapsed.

**Ordering breakdown.** The primary sort key is **derived** — for each action, find its `action_group` value's index in the workflow's `action_groups[]` array. This is `$indexOfArray` against the workflow's persisted `groups[].id` (or `action_groups[].id` from the config — the persisted `groups[]` carries `id` per [part 7 design § `groups[]` persistence](../../_completed/07-group-state-machine/design.md)). The lookup needs the workflow doc in scope, so the pipeline starts on `workflows-collection` and `$lookup`s actions.

YAML declaration order is harder — action docs don't carry an explicit declaration-order index. The action's `sort_order` field is the secondary sort; the tertiary "YAML declaration order" tie-break only matters when two actions share `(action_group, sort_order)`. Per part 7 the action docs are created in YAML order so their `_id`s tend to sort lexically in that order, but that's incidental. A defensible v1 stance: rely on `(action_group_index, sort_order)` as the deterministic sort keys; if two actions tie there, fall back to `_id` ascending. Document the caveat.

**Null short-circuit.** When the workflow exists but no actions pass the access filter, the response must collapse to `{ workflow: null, actions: [] }`. This is done in the `:return:` step with `_if`: if the filtered `actions[]` is empty, return null for the workflow; otherwise return the workflow doc and the sorted actions.

## Task

Create `modules/workflows/api/get-workflow-overview.yaml`:

```yaml
id: get-workflow-overview
type: Api
routine:
  - id: query
    type: MongoDBAggregation
    connectionId:
      _module.connectionId: workflows-collection
    properties:
      pipeline:
        # Stage 1: match the single workflow.
        - $match:
            _id:
              _payload: workflow_id

        # Stage 2: lookup actions, applying access filter inside the sub-pipeline.
        - $lookup:
            from: actions
            let:
              workflowId: $_id
              groupIds:
                $map:
                  input:
                    $ifNull:
                      - $action_groups
                      - $groups
                      - []
                  as: g
                  in: $$g.id
            pipeline:
              - $match:
                  $expr:
                    $eq:
                      - $workflow_id
                      - $$workflowId
              - _ref: stages/access_filter.yaml
              # Compute the group's declaration-order index for sorting.
              - $addFields:
                  _group_index:
                    $indexOfArray:
                      - $$groupIds
                      - $action_group
              # Sort by group index, then sort_order ASC, then _id ASC (tie-break).
              - $sort:
                  _group_index: 1
                  sort_order: 1
                  _id: 1
              # Drop the helper field before returning.
              - $project:
                  _group_index: 0
            as: actions

  - :set_state:
      workflow_doc:
        _get:
          from:
            _step: query
          key: "0"
          default: null

  - :return:
      workflow:
        _if:
          test:
            _and:
              - _ne:
                  - _state: workflow_doc
                  - null
              - _gt:
                  - _array.length:
                      _get:
                        from:
                          _state: workflow_doc
                        key: actions
                        default: []
                  - 0
          then:
            _state: workflow_doc
          else: null
      actions:
        _get:
          from:
            _state: workflow_doc
          key: actions
          default: []
```

The aggregation pulls the workflow + its filtered + sorted actions. The `:set_state:` step grabs the first (and only) workflow doc from the result array. The `:return:` step applies the null short-circuit: workflow is `null` when either the workflow wasn't found OR no actions passed the access filter; otherwise the workflow doc and its sorted actions return.

Do **not** register the API in `modules/workflows/module.lowdefy.yaml` yet — batched into task 7.

## Acceptance Criteria

- `modules/workflows/api/get-workflow-overview.yaml` exists with the pipeline above.
- File parses as valid YAML.
- `id` is kebab-case (`get-workflow-overview`); step `id` is snake_case (`query`); connection refs use `_module.connectionId`.
- The access filter is `_ref`'d from `stages/access_filter.yaml` (task 4), not duplicated inline.
- The lookup's `let:` builds the `groupIds` array from the workflow's persisted `groups[].id` (with fallback to the config's `action_groups[].id` if persisted is empty — see Notes).
- The sort uses three keys in order: `_group_index` ASC, `sort_order` ASC, `_id` ASC. The `_group_index` helper field is dropped via `$project` before returning so consumers don't see it.
- The `:return:` step returns `{ workflow: null, actions: [] }` when either the workflow is not found OR the filtered `actions[]` is empty.
- The `:return:` step returns the workflow doc with its `actions[]` inlined when both exist.
- Keyed actions are not collapsed — each action doc surfaces as its own entry in `actions[]`, with `key` populated, kept together within their group slot (the `(_group_index, sort_order, _id)` sort keeps them adjacent).

## Files

- `modules/workflows/api/get-workflow-overview.yaml` — **create** — `MongoDBAggregation` pipeline matching one workflow, lookup'ing filtered + ordered actions, with null-short-circuit return.

## Notes

- **`action_groups` vs `groups`.** The workflow doc carries both: `action_groups[]` from the workflow YAML config (the authored declaration) and `groups[]` the engine maintains with `{ id, status, summary }` ([part 7 design](../../_completed/07-group-state-machine/design.md)). Both arrays are in declaration order; both carry `id`. The `let.groupIds` uses `action_groups` first and falls back to `groups` (then empty) to handle the edge case where a workflow has the persisted `groups[]` but not the source `action_groups[]` (or vice versa). In practice both are present after part 7's `StartWorkflow` write; the `$ifNull` chain is defense-in-depth.
- **YAML declaration order tie-break.** The design says the tertiary sort key is YAML declaration order. Action docs don't carry an explicit declaration-index field, so the implementation uses `_id` as the tie-break. Document this caveat in the routine if a regression surfaces; for the worked-example onboarding workflow and any reasonable apps, distinct `sort_order` per action makes the tie-break unreachable.
- **Why `:set_state:` before `:return:`.** Aggregation returns an array even for a single-doc match. The `:set_state:` step pulls `result[0]` once into state; the `:return:` step reads from state twice (once for the null check, once for the actions array). Could be inlined with `_get` chains, but the state hop keeps the return readable.
- **No `auth:` block.** Same posture as the other routines. Host apps gate the page that calls this API.
- **Tracker action handling.** The aggregation returns tracker actions inline alongside form/task actions when they pass the access filter. Part 17's `workflow-overview` page handles tracker rendering per [part 17 design § Workflow overview page](../../17-shared-pages/design.md); part 19 doesn't branch on `kind`.
- **Verify `from: actions`.** Same caveat as task 5 — the physical collection name might be different in the final wiring; update if so.
