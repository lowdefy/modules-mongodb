# Part 19 — Operational Apis

**Source rationale:** [workflows-module-concept/module-surface/spec.md](../../../workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** M. **Repo:** `modules/workflows/api/`.

## Goal

Ship the static module-shipped Apis that consuming apps call to manage workflows from the outside: `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`, and `close-workflow` (added by [part 23](../23-close-workflow-handler/design.md)). The per-action `update-action-{action_type}` Apis ship from [part 13](../13-resolver-apis/design.md).

## In scope

**`references` pass-through.** The routines emitted by this part pass payload `references` through to the engine handlers unchanged. The handlers defend against reserved-key collisions via the `RESERVED_WORKFLOW_KEYS` deletion pattern shipped in [`CancelWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js); [part 23](../23-close-workflow-handler/design.md) adopts the same pattern for `CloseWorkflow`. The routine layer does not re-validate.

### `api/start-workflow.yaml`

- Payload schema:
  - Required: `workflow_type`, `entity_id`, `entity_collection`. `entity_collection` is the sole entity-identity scalar — see [part 21](../21-entity-type-to-collection/design.md).
  - Optional: `parent_action_id`, `actions: []`, `references: {}`. (Callers do not supply `parent_entity_id` / `parent_entity_collection` — the handler reads them off the parent tracker action; see [part 5 review-1 #1](../_completed/05-start-cancel-handlers/review/review-1.md#1-parent-entity_id--entity_collection-provenance-contradicts-the-engine-spec).)
- Routine: single step invoking `StartWorkflow` plugin handler from [part 5](../_completed/05-start-cancel-handlers/design.md) via the `workflow-api` connection.
- Returns `{ workflow_id, action_ids }`. `action_ids` preserves input order — either the order of payload `actions: []` when supplied, or the order of YAML `starting_actions:` when not.

### `api/cancel-workflow.yaml`

- Payload schema:
  - Required: `workflow_id`.
  - Optional: `reason`, `references: {}`.
- Routine: single step invoking `CancelWorkflow` plugin handler from [part 5](../_completed/05-start-cancel-handlers/design.md).
- Returns `{ action_ids, event_id, tracker_fired }`. The shape is fixed. `tracker_fired` is the array populated by the `fireTrackerSubscription` call shipped in [part 10](../_completed/10-tracker-subscription/design.md) — `[]` when the workflow has no `parent_action_id`. `event_id` stays `null` on the cancel path in v1 ([part 8](../_completed/08-side-effect-dispatch/design.md) lit it up for `SubmitWorkflowAction` but did not backfill cancel/close; that's a follow-up).

### `api/close-workflow.yaml`

Added by [part 23](../23-close-workflow-handler/design.md). User-initiated normal termination — pushes the workflow to `completed` (not `cancelled`) and sweeps non-terminal actions while honoring `required_after_close: true`.

- Payload schema:
  - Required: `workflow_id`.
  - Optional: `reason`, `references: {}`.
- Routine: single step invoking `CloseWorkflow` plugin handler from [part 23](../23-close-workflow-handler/design.md).
- Returns `{ action_ids, event_id, tracker_fired }`. Same v1 ship contract as `cancel-workflow` — `tracker_fired` is the array from [part 10](../_completed/10-tracker-subscription/design.md)'s subscription (`[]` when no parent); `event_id` stays `null` on close in v1 (no event-log backfill from [part 8](../_completed/08-side-effect-dispatch/design.md)).

### `api/get-entity-workflows.yaml`

- Payload: `entity_id`, `entity_collection`. (Per [part 21](../21-entity-type-to-collection/design.md), the lookup is by collection, not by named entity type.)
- Routine: aggregation over `workflows-collection` and `actions-collection`:
  - Find all workflows for the entity.
  - Find all actions for those workflows.
  - Filter actions per access rule: `access.{vars.app_name}` must intersect `[view, edit, review]` (per the verb-implication table in [action-authoring/spec.md § Per-app verb maps](../../../workflows-module-concept/action-authoring/spec.md) — `edit` and `review` both imply `view`) AND `access.roles` must intersect with `_user.roles` resolved via `user_schema.roles_path` (empty or missing `access.roles` = no gate; see [Access enforcement](#access-enforcement) below).
  - Group actions by workflow + by `action_group` (read positionally from each workflow's persisted `groups[]`).
  - Sort workflows by `display_order` ASC (workflow-level field written by `StartWorkflow` from `workflowsConfig.{type}.display_order`; see [part 5](../_completed/05-start-cancel-handlers/design.md)), tie-break `created.timestamp` DESC.
  - Return: array of workflows, each with `actions[]` filtered + grouped. Keyed actions surface as N rows in `actions[]` (one per instance, identified by `key`), kept together within their group slot.

### `api/get-workflow-overview.yaml`

- Payload: `workflow_id`.
- Routine:
  - Find workflow.
  - Find all actions for the workflow.
  - Filter per access (same rule as `get-entity-workflows`).
  - Order actions: workflow's `action_groups[]` declaration order, then `sort_order` ASC, then YAML declaration order. Keyed actions surface as N rows (one per instance, identified by `key`), kept together within their parent action's sort slot.
  - Return: `{ workflow, actions: [] }`; if no visible actions, return `{ workflow: null, actions: [] }` and the page redirects back to its host entity page (`actions-on-entity`). The access-vs-existence distinction is intentionally collapsed for security — callers can't tell whether the workflow is absent or simply inaccessible.

### `api/get-action-group-overview.yaml`

Returns one workflow + one action group's metadata + ordered + filtered actions in that group. Shipped in [part 25](../../25-group-overview-page/design.md). Reuses this part's `access_filter` stage at `api/stages/access_filter.yaml`. Part 19 doesn't own the file; this row is a pointer so the operational-Api inventory stays coherent.

### Access enforcement

User roles resolve via the module's `user_schema.roles_path` var (default `roles`, declared in [part 20's manifest](../20-module-manifest/design.md)). The routine reads `_user: { _module.var: user_schema.roles_path }` (see "Read path: Lowdefy routines" below).

Access enforcement is split across three layers — each layer enforces what its inputs allow:

- **Build time** → [part 12 (resolver-pages)](../12-resolver-pages/design.md): per-app verb filter on page emission. No role gate (no user context at build time).
- **Query time** → here (`get-entity-workflows`, `get-workflow-overview`): per-app verb filter AND role gate.
- **Submit time** → [part 6 (submit-action-writes)](../_completed/06-submit-action-writes/design.md): role gate re-check. Verb filter is implicit — the page wouldn't have been emitted if the verb wasn't allowed in the calling app (per [engine spec § Capabilities](../../../workflows-module-concept/engine/spec.md#capabilities)).

The composite policy must be consistent: a user can submit an action iff query time would have surfaced it.

### Read path: Lowdefy routines (not plugin handlers)

`get-entity-workflows` and `get-workflow-overview` ship as plain Lowdefy routines hitting the read-only `workflows-collection` and `actions-collection` connections directly — **not** plugin handlers on the `workflow-api` connection. The trade-offs the implementer should know:

- **`_user` access.** Routines read `_user` via the operator. A plugin handler would read `lowdefyContext.user` and would need a `user_schema` connection property added to [`WorkflowAPI/schema.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js) — a part-3 schema bump.
- **Connection separation.** Routines hit `workflows-collection` + `actions-collection` (read-only `MongoDBCollection` connections, [`module-surface/spec.md`](../../../workflows-module-concept/module-surface/spec.md)). Plugin handlers all go through `workflow-api`'s shared client. Keeping reads on the read-only connections preserves the read/write client-lifecycle split that motivated three separate connection exports.
- **`makeActionPages` parity.** The build-time access check (part 12) is JS, not a Mongo aggregation. Routines duplicate the verb-list + role-gate logic in routine YAML (`_js` or operator chain) versus the JS in `makeActionPages.js`. A plugin handler would consolidate to one JS implementation but at the cost of the two points above.

## Out of scope / deferred

- **Per-action `update-action-{action_type}` Apis** → [part 13](../13-resolver-apis/design.md).
- **References-collision validation** — concept says reserved keys win silently in v1; no throwing.

## Depends on

[Part 5](../_completed/05-start-cancel-handlers/design.md), [Part 7](../_completed/07-group-state-machine/design.md) (so `get-entity-workflows` returns persisted `groups[]`), [Part 23](../23-close-workflow-handler/design.md) (for the `close-workflow` API's plugin handler).

## Verification

- Unit tests:
  - `start-workflow` writes workflow + actions; returns ids.
  - `cancel-workflow` flips workflow + open actions.
  - `close-workflow` pushes workflow `completed` and sweeps non-terminal actions per part 23's filter.
  - `get-entity-workflows` filters by access correctly; returns persisted `groups[]`.
  - `get-workflow-overview` orders actions correctly; returns null workflow when all actions inaccessible.
- Integration: end-to-end through the worked-example onboarding workflow.
- End-to-end coverage lands in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (`operational-apis.spec.js`). This part's verification is unit-tests + handler-level smoke only.

## Open questions

_None — `get-workflow-overview` access-denial response is committed: return `{ workflow: null, actions: [] }` so page-side redirect logic stays simple (see [`api/get-workflow-overview.yaml`](#apiget-workflow-overviewyaml))._

## Contract to neighbours

- **Part 18 (`actions-on-entity`)** consumes `get-entity-workflows`.
- **Part 17 (`workflow-overview` page)** consumes `get-workflow-overview`.
- **Part 25 (`group-overview` page)** ships `get-action-group-overview`, which reuses this part's `access_filter` stage.
- **Part 20 (module-manifest)** declares all five Apis (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`) in `exports.api`.
- **Part 23 (close-workflow-handler)** ships the `CloseWorkflow` plugin handler that backs `close-workflow.yaml`.
