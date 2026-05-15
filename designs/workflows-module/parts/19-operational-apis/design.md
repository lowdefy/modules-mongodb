# Part 19 — Operational Apis

**Source rationale:** [workflows-module-concept/module-surface/spec.md](../../../workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** M. **Repo:** `modules/workflows/api/`.

## Goal

Ship the four static module-shipped Apis that consuming apps call to manage workflows from the outside: `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`. The per-action `update-action-{action_type}` Apis ship from [part 13](../13-resolver-apis/design.md).

## In scope

### `api/start-workflow.yaml`

- Payload schema:
  - Required: `workflow_type`, `entity_type`, `entity_id`, `entity_collection`.
  - Optional: `parent_action_id`, `parent_entity_id`, `parent_entity_collection`, `actions: []`, `references: {}`.
- Routine: single step invoking `StartWorkflow` plugin handler from [part 5](../05-start-cancel-handlers/design.md) via the `workflow-api` connection.
- Returns `{ workflow_id, action_ids }`.

### `api/cancel-workflow.yaml`

- Payload schema:
  - Required: `workflow_id`.
  - Optional: `reason`, `references: {}`.
- Routine: single step invoking `CancelWorkflow` plugin handler from [part 5](../05-start-cancel-handlers/design.md).
- Returns `{ action_ids, event_id, tracker_fired }`.

### `api/get-entity-workflows.yaml`

- Payload: `entity_type`, `entity_id`.
- Routine: aggregation over `workflows-collection` and `actions-collection`:
  - Find all workflows for the entity.
  - Find all actions for those workflows.
  - Filter actions per access rule: `access.{vars.app_name}` must include `view` AND `access.roles` must intersect with `_user.roles` (empty roles = no gate).
  - Group actions by workflow + by `action_group` (read positionally from each workflow's persisted `groups[]`).
  - Sort workflows by `display_order` ASC, tie-break `created.timestamp` DESC.
  - Return: array of workflows, each with `actions[]` filtered + grouped.

### `api/get-workflow-overview.yaml`

- Payload: `workflow_id`.
- Routine:
  - Find workflow.
  - Find all actions for the workflow.
  - Filter per access (same rule as `get-entity-workflows`).
  - Order actions: workflow's `action_groups[]` declaration order, then `sort_order` ASC, then YAML declaration order.
  - Return: `{ workflow, actions: [] }`; if no visible actions, return `{ workflow: null, actions: [] }` so the page can redirect.

### Access enforcement

The same two-part check (`access.{app_name}` verbs + `access.roles` gate) runs at:

- Build time → [part 12 (resolver-pages)](../12-resolver-pages/design.md).
- Query time → here (`get-entity-workflows`, `get-workflow-overview`).
- Submit time → [part 6 (submit-action-writes)](../06-submit-action-writes/design.md).

All three implementations must match.

## Out of scope / deferred

- **Per-action `update-action-{action_type}` Apis** → [part 13](../13-resolver-apis/design.md).
- **References-collision validation** — concept says reserved keys win silently in v1; no throwing.
- **Engine-side query handlers vs. routine-side aggregation.** Concept module-surface spec has a `GetEntityWorkflows` plugin handler called out implicitly. Decide during implementation: keep the query path as plain Lowdefy routines hitting the read-only collection connections (simpler) vs. plugin handlers reading via the shared client (consistent with writes). Lean routines for reads in v1.

## Depends on

[Part 5](../05-start-cancel-handlers/design.md), [Part 7](../07-group-state-machine/design.md) (so `get-entity-workflows` returns persisted `groups[]`).

## Verification

- Unit tests:
  - `start-workflow` writes workflow + actions; returns ids.
  - `cancel-workflow` flips workflow + open actions.
  - `get-entity-workflows` filters by access correctly; returns persisted `groups[]`.
  - `get-workflow-overview` orders actions correctly; returns null workflow when all actions inaccessible.
- Integration: end-to-end through the worked-example onboarding workflow.

## Open questions

- **`get-workflow-overview` access denial response.** Return `{ workflow: null, actions: [] }` (concept) vs. 403 from the API. Ship null-object so page-side redirect logic is simpler.
- **Routine vs. plugin handler for reads** — note above.

## Contract to neighbours

- **Part 18 (`actions-on-entity`)** consumes `get-entity-workflows`.
- **Part 17 (`workflow-overview` page)** consumes `get-workflow-overview`.
- **Part 20 (module-manifest)** declares all four Apis in `exports.api`.
