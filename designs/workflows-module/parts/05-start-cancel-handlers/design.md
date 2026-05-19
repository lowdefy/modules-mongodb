# Part 05 — `StartWorkflow` + `CancelWorkflow` handlers

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Goal

Ship the two engine handlers that bookend a workflow's lifecycle. `StartWorkflow` writes the workflow doc and starting action docs (with optional parent linking for trackers); `CancelWorkflow` cancels a workflow and flips open actions to `not-required`. After this part the engine can create and tear down workflows but cannot transition them — that comes in part 6.

## In scope

### `StartWorkflow.js`

- **Payload**:
  - Required: `workflow_type`, `entity_id`, `entity_collection`. `entity_collection` is the sole entity-identity scalar — see [part 21](../21-entity-type-to-collection/design.md).
  - Optional: `parent_action_id` (links the new workflow as a child of an existing tracker action). The handler reads `parent_entity_id` and `parent_entity_collection` off the parent tracker action's `entity_id` / `entity_collection` — callers do not (and cannot) supply them. Matches [engine spec § Capabilities](../../../workflows-module-concept/engine/spec.md#capabilities).
  - Optional: `actions: [{ type, key?, status, fields?, references? }]` — overrides YAML `starting_actions`.
  - Optional: `references: { ... }` — spread onto workflow + starting action docs.
- **Validation** (runtime, at handler entry — extends [engine spec § Capabilities](../../../workflows-module-concept/engine/spec.md#capabilities) step 1):
  - Workflow type exists in `connection.workflowsConfig`.
  - When using YAML `starting_actions` (no payload `actions:` override): no entry references a keyed action. YAML `starting_actions` grammar is `{ type, status }` only ([action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md) lines 33, 85); keyed-action spawning at workflow start must come through the payload's `actions:` field, which carries `key:`. Reject with a precise error rather than writing an action doc with `key: null` for a type that requires a concrete key. _Caught at runtime here rather than build time in part 04 because part 04 is already implemented; folds into part 05's already-required handler-entry validation._
  - When `parent_action_id` is set: parent action exists, is `kind: tracker`, has null `child_workflow_id`, and `parent_action.tracker.workflow_type === payload.workflow_type` (rejects linking a child of the wrong shape — guards against the parent's `status_map` display text and tracker contract breaking silently).
- **Writes**:
  - One workflow doc: `_id`, `workflow_type`, `key`, `display_order` (from the matching `workflowsConfig` entry), `entity_id`, `entity_collection`, `status: [{ stage: active, created, ... }]`, initial `summary: { done: 0, not_required: <count of starting actions whose status is "not-required">, total: <N> }` computed from the just-built actions, empty `groups[]` (populated by part 7 on first transition), empty `form_data`, change stamps, parent back-references when given.
  - N action docs from either the API payload or the YAML `starting_actions`. Each action: `_id`, `workflow_id`, `type`, `kind` (from config), `key` (from payload when provided), `status: [...]`, universal fields, `tracker` (if `kind: tracker`), reference-key spread.
- **Parent linking**: When `parent_action_id` is set (and the Validation block above passes), also write the parent tracker action's `child_workflow_id` (new workflow's `_id`), `child_entity_id` (new workflow's `entity_id`), `child_entity_collection` (new workflow's `entity_collection`), and `$push` to `status[]` with `{ stage: in-progress, created, ... }` using `force: true` (engine-driven write — bypasses the priority rule so the push lands regardless of the action's current status; same posture as the tracker subscription in [part 10](../10-tracker-subscription/design.md)). Sequential through the shared dispatcher, not atomic — same posture as the rest of the engine (see [engine spec § Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)).
- **Half-linked failure mode (accepted)**: With no transactions, a crash mid-sequence can leave a half-linked state — either an orphan child workflow whose parent tracker is unaware, or a parent tracker pointing at a child workflow that didn't get written. Same risk class as `summary` writeback drift ([engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency)); reconciliation is the catch-all. The engine never reads "child" off the parent action for behaviour (the tracker subscription is child→parent, not parent→child), so the inconsistency is display-only until reconciliation runs. Write order is not pinned in v1 — same posture as every other multi-step write in the engine.
- **Returns**: `{ workflow_id, action_ids }`.
- **Retry posture**: `StartWorkflow` is **not idempotent on retry** — `_id` is server-generated, so a retried call writes a second workflow doc with a fresh `_id` rather than no-opping. This matches the same posture [engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency) accepts for `summary` writeback drift and side-effect duplication. Callers needing exactly-once semantics check before calling (typically a guard at the entity-creation step that owns the `start-workflow` invocation).

### `CancelWorkflow.js`

- **Payload**:
  - Required: `workflow_id`.
  - Optional: `reason` (written into the cancelled status entry).
  - Optional: `references` (spread onto workflow doc on cancel using the engine's reserved-key merge order — references first, core fields including the cancelled status push last, per [engine spec § References write contract](../../../workflows-module-concept/engine/spec.md#references-write-contract)).
- **Writes**:
  - Push `{ stage: cancelled, created, reason? }` onto the workflow's `status[]`.
  - For every action whose latest status is non-terminal, push `not-required` with `force: true` (cancellation bypasses the priority rule).
  - Recompute and write `summary`. `groups[]` recompute is owned by [part 7's CancelWorkflow integration](../07-group-state-machine/design.md#cancelworkflow-integration) — that part appends a group recompute + writeback after this handler's `not-required` loop so the cancelled workflow doc has `groups[]` consistent with its actions. This handler updates `summary` only.
- **Tracker fan-up**: If the workflow has a `parent_action_id`, the engine's tracker subscription handles parent-side updates. The subscription itself lands in [part 10](../10-tracker-subscription/design.md); this handler simply marks the workflow cancelled — part 10 listens.
- **Returns**: `{ action_ids, event_id: null, tracker_fired: null }` (side effects land in parts 8, 10).

### Connection schema extension

- Extend `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` with a `changeStamp` property (`{ type: 'object', description: 'Resolves to the events module change_stamp at app build time; the engine reads it at handler entry and stamps every workflow + action doc write with it.' }`, optional). Picks up the deferral from [part 04 review-1 finding 5](../04-workflow-config-schema/review/review-1.md). Once accepted by the schema, the handler reads it via `connection.changeStamp` (per [engine spec § Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)) and threads it through `created` / `updated` on every workflow + action doc. One stamp per handler invocation; all writes in the same call share the timestamp.

### Shared internal helpers (in `src/connections/shared/`)

Placed next to the existing `createMongoDBConnection.js`, `getActions.js`, `getActionFields.js`, `populateIds.js` — matches the established "stuff used by multiple handlers lives in `shared/`" pattern (part 03's shipped layout). Concept spec at [engine/spec.md](../../../workflows-module-concept/engine/spec.md) nests these under `SubmitWorkflowAction/` as an example layout; this part diverges because `StartWorkflow` and `CancelWorkflow` also consume them, and importing from `../SubmitWorkflowAction/` would be backwards.

- `createAction.js` — inserts an action doc; consumed by `StartWorkflow`, `CancelWorkflow`, and `SubmitWorkflowAction` (part 6).
- `updateAction.js` (minimal scaffold) — sufficient for the cancel path's `force: true` writes. Full priority-rule implementation in part 6 (extends this scaffold rather than replacing it).

## Out of scope / deferred

- **Group recompute on cancel** → owned by [part 7's CancelWorkflow integration](../07-group-state-machine/design.md#cancelworkflow-integration); this handler updates `summary` only.
- **Log event + notifications on cancel** → [part 8](../08-side-effect-dispatch/design.md). v1 cancel writes no event; opt-in in a follow-up.
- **Tracker subscription firing on parent cancel** → [part 10](../10-tracker-subscription/design.md).
- **`SubmitWorkflowAction`** → [part 6](../06-submit-action-writes/design.md).

## Depends on

[Part 3](../03-engine-plugin-shell/design.md) (connection scaffold, schemas, indexes), [part 4](../04-workflow-config-schema/design.md) (the normalized config the handler reads action `kind` from).

## Verification

Part 05 ships **no unit tests of its own** — see [`tasks/tasks.md` § Verification posture](tasks/tasks.md) for the rationale (dispatcher-mock fixture surface drifts against the community-plugin contract; coverage overlaps part 22).

- Integration smoke: end-to-end through a fixture app with one trivial workflow definition. Manual or as part of a downstream task; not a separate task here.
- End-to-end coverage lands in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (`start-cancel.spec.js`). The suite covers the assertions that would otherwise be unit tests in this part: workflow + N action docs written from YAML `starting_actions`; payload `actions[]` override; reference-key spread on both collections; parent-linking happy path + the three parent-link rejections (`kind`, `child_workflow_id`, `workflow_type` mismatch); cancelled status push; non-terminal action flips; terminal actions untouched; `reason` propagation.

## Open questions

- **Whether cancelling an already-cancelled workflow is a no-op or an error.** Lean: no-op (idempotent).

## Contract to neighbours

- **Part 6** imports `createAction.js` and `updateAction.js` from `src/connections/shared/`, then extends `updateAction.js` with priority-rule logic and idempotency guards (extending the scaffold in place rather than introducing a separate `SubmitWorkflowAction/`-nested copy).
- **Part 10** reads workflow status changes from `CancelWorkflow`'s cancel push to fire the tracker subscription.
- **Part 19 (operational-apis)** wires `start-workflow` and `cancel-workflow` Lowdefy Apis to these handlers.
