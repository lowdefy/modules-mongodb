# Part 05 — `StartWorkflow` + `CancelWorkflow` handlers

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Goal

Ship the two engine handlers that bookend a workflow's lifecycle. `StartWorkflow` writes the workflow doc and starting action docs (with optional parent linking for trackers); `CancelWorkflow` cancels a workflow and flips open actions to `not-required`. After this part the engine can create and tear down workflows but cannot transition them — that comes in part 6.

## In scope

### `StartWorkflow.js`

- **Payload**:
  - Required: `workflow_type`, `entity_type`, `entity_id`, `entity_collection`.
  - Optional: `parent_action_id`, `parent_entity_id`, `parent_entity_collection` (links the new workflow as a child of an existing tracker action).
  - Optional: `actions: [{ type, key?, status, fields?, references? }]` — overrides YAML `starting_actions`.
  - Optional: `references: { ... }` — spread onto workflow + starting action docs.
- **Writes**:
  - One workflow doc: `_id`, `workflow_type`, `key`, `entity_type`, `entity_id`, `entity_collection`, `status: [{ stage: active, created, ... }]`, empty `summary` (computed once actions exist), empty `groups[]` (populated by part 7 on first transition), empty `form_data`, change stamps, parent back-references when given.
  - N action docs from either the API payload or the YAML `starting_actions`. Each action: `_id`, `workflow_id`, `type`, `kind` (from config), `key` (from payload when provided), `status: [...]`, universal fields, `tracker` (if `kind: tracker`), reference-key spread.
- **Parent linking (atomic on shared client)**: When `parent_action_id` is set, also write the parent tracker action's `child_workflow_id`, `child_entity_id`, `child_entity_collection`, and push `in-progress` to its status. Validate that the parent action is `kind: tracker` and has null `child_workflow_id` before linking.
- **Returns**: `{ workflow_id, action_ids }`.

### `CancelWorkflow.js`

- **Payload**:
  - Required: `workflow_id`.
  - Optional: `reason` (written into the cancelled status entry).
  - Optional: `references` (spread onto workflow doc on cancel).
- **Writes**:
  - Push `{ stage: cancelled, created, reason? }` onto the workflow's `status[]`.
  - For every action whose latest status is non-terminal, push `not-required` with `force: true` (cancellation bypasses the priority rule).
  - Recompute and write `summary`. (`groups[]` recompute deferred to part 7; this handler updates `summary` only.)
- **Tracker fan-up**: If the workflow has a `parent_action_id`, the engine's tracker subscription handles parent-side updates. The subscription itself lands in [part 10](../10-tracker-subscription/design.md); this handler simply marks the workflow cancelled — part 10 listens.
- **Returns**: `{ action_ids, event_id: null, tracker_fired: null }` (side effects land in parts 8, 10).

### Shared internal helpers (in `src/connections/WorkflowAPI/`)

- `createAction.js` — inserts an action doc; consumed by both handlers and by part 6.
- `updateAction.js` (minimal scaffold) — sufficient for the cancel path's `force: true` writes. Full priority-rule implementation in part 6.

## Out of scope / deferred

- **Group recompute on cancel** → [part 7](../07-group-state-machine/design.md).
- **Log event + notifications on cancel** → [part 8](../08-side-effect-dispatch/design.md). v1 cancel writes no event; opt-in in a follow-up.
- **Tracker subscription firing on parent cancel** → [part 10](../10-tracker-subscription/design.md).
- **`SubmitWorkflowAction`** → [part 6](../06-submit-action-writes/design.md).

## Depends on

[Part 3](../03-engine-plugin-shell/design.md) (connection scaffold, schemas, indexes), [part 4](../04-workflow-config-schema/design.md) (the normalized config the handler reads action `kind` from).

## Verification

- Unit tests on `StartWorkflow`:
  - Writes the expected workflow + N action docs from YAML `starting_actions`.
  - Payload `actions[]` overrides YAML `starting_actions`.
  - Reference-key spread on both collections.
  - Parent linking: tracker action's `child_workflow_id` + `in-progress` push; rejects when parent is not `kind: tracker` or `child_workflow_id` is already set.
  - Idempotent retry: re-calling with same `(workflow_id, type, key)` doesn't double-write (unique index).
- Unit tests on `CancelWorkflow`:
  - Pushes cancelled stage; flips every non-terminal action to `not-required`.
  - Terminal actions left untouched.
  - `reason` propagated.
- Integration smoke: end-to-end through a fixture app with one trivial workflow definition.

## Open questions

- **Where YAML `starting_actions` resolves to concrete keys for instanced actions.** Concept spec says payload must supply keys for keyed actions; raises error if YAML alone is used. Confirm in implementation.
- **Whether cancelling an already-cancelled workflow is a no-op or an error.** Lean: no-op (idempotent).

## Contract to neighbours

- **Part 6** uses `createAction.js` and `updateAction.js` from here, then extends `updateAction.js` with priority-rule logic and idempotency guards.
- **Part 10** reads workflow status changes from `CancelWorkflow`'s cancel push to fire the tracker subscription.
- **Part 19 (operational-apis)** wires `start-workflow` and `cancel-workflow` Lowdefy Apis to these handlers.
