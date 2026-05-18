# Part 07 — Group state machine

**Source rationale:** [workflows-module-concept/action-groups/spec.md](../../../workflows-module-concept/action-groups/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

Promote `action_group` from a UI label to a first-class engine concept. After this part, `SubmitWorkflowAction` writes a persisted `groups[]` array on every transition, re-evaluates every blocked action's `blocked_by` (now resolving group ids), surfaces `completed_groups` in the return shape, and `CancelWorkflow` keeps the `groups[]` array in sync.

## In scope

### Group status derivation (three-value enum)

Pure function `deriveGroupStatus(actions, groupId, declaredActionGroup)`:

- `done` — every action in the group is terminal (`done` or `not-required`). Empty groups are `done` by convention.
- `blocked` — every non-terminal action in the group is `blocked`.
- `in-progress` — otherwise.

### `groups[]` persistence

- Eager writeback on every `SubmitWorkflowAction` call (lifecycle step 5 — promoted from "summary only" to "summary + groups").
- Group entry shape: `{ id, status, summary: { done, not_required, total } }`.
- Array order = declaration order in workflow YAML (deterministic; UI reads positionally).

### `blocked_by` group-id resolution

Replace part 6's action-type-only `computeAutoUnblocks` with mixed resolution:

- For each entry in `blocked_by`, first match against declared `action_groups[].id`; if matched, evaluate against that group's persisted status (`done` ⇒ unblocked).
- Otherwise match against an action `type`; evaluate against the action's status.
- Build-time validation in [part 4](../04-workflow-config-schema/design.md) already prevents collisions.

### `blocked_by` re-evaluation pass

After step 4 writes a transition, walk every action in `blocked` status:

- If its `blocked_by` is now fully satisfied (every entry resolves to terminal action or `done` group), push `action-required` (subject to the priority rule).
- O(N) per submit; acceptable given typical action counts.

### `completed_groups` return shape

`SubmitWorkflowAction` returns `{ ..., completed_groups: [{ workflow_id, id, on_complete? }] }` for every group that transitioned from non-`done` to `done` in this call. `on_complete` is the Api id from the workflow's `action_groups[].on_complete` declaration (or null). Firing is part 11's job; this part carries the metadata.

### Auto-complete check

After group + `blocked_by` re-evaluation, if every action is terminal, push `{ stage: completed }` to the workflow's status array (subject to the same priority rule).

### `CancelWorkflow` integration

Part 5 already cancels actions to `not-required` with `force: true`. This part adds a group recompute + writeback after that loop so the cancelled workflow doc has `groups[]` consistent with its actions (all `done` per the empty-group convention).

## Out of scope / deferred

- **`on_complete` hook invocation** → [part 11](../11-group-on-complete-fanout/design.md). This part surfaces the metadata; part 11 fans it out via `context.callApi`.
- **`workflow_lifecycle_stages_display` for groups** — concept-spec note mentions display overrides being mis-scoped. Confirm the var split during implementation (group display attributes may need a separate `vars.action_groups_display` — keep as open question rather than blocking ship).

## Depends on

[Part 6](../06-submit-action-writes/design.md). Uses [part 4](../04-workflow-config-schema/design.md)'s normalized config to read `action_groups[]`.

## Verification

- Unit tests on `deriveGroupStatus`: table-driven over every status combination.
- Integration tests on `handleSubmit`:
  - Submitting the last non-terminal action in a group transitions the group to `done` and surfaces it in `completed_groups`.
  - An action whose `blocked_by` lists a group id flips to `action-required` exactly when the group enters `done`, not before.
  - Mixed `blocked_by` (action types + group ids) handled correctly.
  - Auto-complete: completing every group pushes the workflow to `completed`.
- Regression: every part-6 unit test still passes with `groups[]` writeback enabled.
- `CancelWorkflow` integration: cancelled workflows have consistent `groups[]`.

## Open questions

- **Incremental vs. full recompute.** Lean incremental (only affected groups) for write efficiency; full recompute as a correctness fallback if drift surfaces.
- **`action_groups` display overrides scope.** Concept spec mis-scopes them under `workflow_lifecycle_stages_display`; clarify in implementation. Doesn't block ship.

## Contract to neighbours

- **Part 11** consumes `completed_groups` from this part's return shape to fan out `on_complete` Apis.
- **Part 19 (operational-apis)** — `get-entity-workflows` returns workflow docs including the persisted `groups[]`; part 18 (`actions-on-entity`) reads positionally.
