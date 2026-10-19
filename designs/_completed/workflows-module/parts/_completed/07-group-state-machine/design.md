# Part 07 — Group state machine

**Source rationale:** [workflows-module-concept/action-groups/spec.md](../../../workflows-module-concept/action-groups/spec.md). **Layer:** engine handlers + build-time config. **Size:** M. **Repos:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/{SubmitWorkflowAction,StartWorkflow,CancelWorkflow}/`; `modules/workflows/resolvers/makeWorkflowsConfig.js`.

## Goal

Promote `action_group` from a UI label to a first-class engine concept. After this part:

- `StartWorkflow` pre-populates the workflow doc's `groups[]` array at creation (replacing the shipped `groups: []` placeholder).
- `SubmitWorkflowAction` recomputes affected groups, re-evaluates every blocked action's `blocked_by` (now resolving group ids), auto-completes the workflow when every action is terminal, and surfaces `completed_groups` in the return shape.
- `CancelWorkflow` keeps `groups[]` in sync as part of its existing summary recompute.
- `makeWorkflowsConfig` rejects `blocked_by` entries that resolve to neither a declared group nor a declared action type.

## In scope

### Lifecycle ordering

Three new sub-steps slot between part 6's step 4 (write action transitions) and step 5 (recompute workflow summary). Numbering follows [submit-pipeline/spec.md § Flow](../../../workflows-module-concept/submit-pipeline/spec.md#flow), matching [part 6's commitment](../06-submit-action-writes/design.md#lifecycle-scaffold):

| Sub-step | Work                                                                                                                                  | After  | Before |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 4a       | Recompute every group's status + per-group summary; stage `groups[]` for the workflow-doc write                                       | Step 4 | 4b     |
| 4b       | `blocked_by` re-evaluation walk — push `action-required` on every blocked action whose dependencies are now satisfied                 | 4a     | 4c     |
| 4c       | Auto-complete check — if every action is terminal, stage a `pushWorkflowStatus(workflowId, 'completed', eventId)`                     | 4b     | Step 5 |
| 5        | Recompute workflow `summary`; write `summary`, `groups[]`, and the (optional) `status` push from 4c to the workflow doc in one `$set` | 4c     | Step 6 |

Part 6's step 5 was "summary only — counts only. `groups[]` defer to part 7" — this part promotes its signature to "summary + groups + auto-complete status push (if any), one Mongo update." This is the only contract change to part 6's step 5; every other lifecycle step is untouched.

### Group status derivation (three-value enum)

Pure function `deriveGroupStatus(groupActions)` — takes the actions already filtered to one group (callers like `recomputeGroups` own the per-group filtering):

- `done` — every action in the group is terminal (`done` or `not-required`). Empty groups are `done` by convention.
- `blocked` — every non-terminal action in the group is `blocked`.
- `in-progress` — otherwise.

### `groups[]` persistence

- **Initial population in `StartWorkflow`.** Extend [StartWorkflow.js:83](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) to compute the full `groups[]` array from `workflowConfig.action_groups` and the just-built `actionDrafts` (using `deriveGroupStatus`), in declaration order. Replaces the shipped `groups: []` placeholder. All data is already in memory at that point — no extra DB read. Same in-place extension pattern as part 6's extension of `updateAction.js`.
- Eager writeback on every `SubmitWorkflowAction` call — sub-step 4a recomputes affected groups (the group containing the requesting action plus any group whose actions transitioned in this call); step 5 writes `groups[]` to the workflow doc alongside `summary` (see [Lifecycle ordering](#lifecycle-ordering)). Incremental is safe because `StartWorkflow` already wrote a complete array at workflow creation.
- Group entry shape: `{ id, status, summary: { done, not_required, total } }`.
- Empty groups serialise as `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`. The `done === total` invariant doesn't apply to empty groups; consumers reading group completion should check `status === 'done'`, not derive it from counts. Consumers that need to distinguish "completed" from "empty" can check `summary.total === 0` alongside the status.
- Array order = declaration order in workflow YAML (deterministic; UI reads positionally).

### `blocked_by` group-id resolution

Replace part 6's action-type-only `computeAutoUnblocks` with mixed resolution:

- For each entry in `blocked_by`, first match against declared `action_groups[].id`; if matched, evaluate against that group's persisted status (`done` ⇒ unblocked).
- Otherwise match against an action `type`; evaluate against the action's status.
- Part 4's existing build-time check rejects id-vs-type collisions ([makeWorkflowsConfig.js:109–118](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)); the build-time resolution check below catches typos and unknown references.

### Build-time `blocked_by` resolution check

Extend `modules/workflows/resolvers/makeWorkflowsConfig.js` to walk every action's `blocked_by` and verify each entry resolves to either a declared `action_groups[].id` or a declared `actions[].type` in the same workflow. Fail the build with a precise message naming the action and the unresolved entry. Picks up the deferral from [part 4 design.md:28](../04-workflow-config-schema/design.md). Cost is negligible — the two sets (`groupIds`, `actionTypes`) are already constructed by existing validators; this adds at most O(N × B̄) hash lookups per workflow.

### `blocked_by` re-evaluation pass

Sub-step 4b. After step 4 writes a transition and 4a recomputes `groups[]`, walk every action in `blocked` status:

- If its `blocked_by` is now fully satisfied (every entry resolves to terminal action or `done` group), push `action-required` via `shared/updateAction.js` — the priority rule allows `action-required` (6) < `blocked` (7); same-stage on already-`action-required` actions no-ops. Walk-pushed entries don't use the `currentActionId` self-exception — they're never the user's submitted action (the submitted action was already transitioned in step 4 and isn't in `blocked` status by the time the walk runs).
- Single-pass is sufficient: the walk only pushes `action-required` (non-terminal), so a newly-unblocked action can never cause another group to transition to `done` in the same call. Group transitions happen in 4a; 4b reads 4a's output and never feeds back into it. Downstream chains unwind one user submit at a time.
- O(N) per submit; acceptable given typical action counts.

### `completed_groups` return shape

`SubmitWorkflowAction` returns `{ ..., completed_groups: [{ workflow_id, id, on_complete? }] }` for every group that transitioned from non-`done` to `done` in this call. `on_complete` is the Api id from the workflow's `action_groups[].on_complete` declaration (or null). Firing is part 11's job; this part carries the metadata.

### Auto-complete check

Sub-step 4c. After 4a (group recompute) and 4b (`blocked_by` walk), if every action is terminal, stage a `pushWorkflowStatus(workflowId, 'completed', eventId)` for step 5's bundled `$set`. `pushWorkflowStatus` applies the same-stage no-op guard from [engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency) (reads `status[0].stage`, returns early on equality) — no priority rule for workflow lifecycle (it's a 3-value enum with no priority numbers). The staged push is bundled into step 5's `$set` alongside `summary` and `groups[]` so the workflow doc updates in one Mongo call. Skipped entirely when the workflow is already in a terminal stage (`completed` / `cancelled`) — the terminal-workflow gate in part 6 step 1 would have rejected the submit before reaching this point, but the guard is restated here for the auto-recursion case (tracker subscription's parent push from [part 10](../10-tracker-subscription/design.md) may re-enter this handler).

### `CancelWorkflow` integration

Part 5 already cancels actions to `not-required` with `force: true`, then recomputes `summary` from a re-read of all actions with projection `{ 'status.0.stage': 1 }` ([CancelWorkflow.js:86–108](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)). This part folds `groups[]` recompute into that existing pass: extend the projection to include `action_group`, compute `groups[]` from the same in-memory action list (every group lands at `done` per the empty-group convention — every action is terminal post-cancel), and `$set` both `summary` and `groups` in the same `MongoDBUpdateOne`. No new round-trip.

`CancelWorkflow` does **not** compute or return `completed_groups`. Per concept, `on_complete` hooks do not fire on cancel ([action-groups/spec.md § Group status](../../../workflows-module-concept/action-groups/spec.md#group-status--derived-three-value-enum)); the handler's return shape stays `{ action_ids, event_id: null, tracker_fired: null }` and part 11's fan-out reads `completed_groups` only from `SubmitWorkflowAction`'s return.

## Out of scope / deferred

- **`on_complete` hook invocation** → [part 11](../11-group-on-complete-fanout/design.md). This part surfaces the metadata; part 11 fans it out via `context.callApi`.

## Depends on

[Part 6](../06-submit-action-writes/design.md). Uses [part 4](../04-workflow-config-schema/design.md)'s normalized config to read `action_groups[]`; also extends part 4's `makeWorkflowsConfig.js` with the build-time `blocked_by` resolution check (the resolver deferral [part 4 design.md:28](../04-workflow-config-schema/design.md) parked on this part) and extends shipped part 5's `StartWorkflow.js` to pre-populate `groups[]` at workflow creation (same in-place extension pattern as part 6's extension of `updateAction.js`).

## Verification

- Unit tests on `deriveGroupStatus`: table-driven over every status combination.
- Unit tests in `makeWorkflowsConfig.test.js`: a `blocked_by` entry that resolves to neither a declared group nor a declared action type fails the build with a path-prefixed error naming the action and the unresolved entry.
- Integration tests on `handleSubmit`:
  - Submitting the last non-terminal action in a group transitions the group to `done` and surfaces it in `completed_groups`.
  - An action whose `blocked_by` lists a group id flips to `action-required` exactly when the group enters `done`, not before.
  - Mixed `blocked_by` (action types + group ids) handled correctly.
  - Auto-complete: completing every group pushes the workflow to `completed`.
- Regression: every part-6 unit test in `SubmitWorkflowAction/handleSubmit.test.js` still passes with `groups[]` writeback enabled in step 5.
- `CancelWorkflow` integration: cancelled workflows have consistent `groups[]`.
- `StartWorkflow` integration: a newly-started workflow has a full `groups[]` array (one entry per declared `action_groups[]` in declaration order) with statuses derived from the starting actions.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

None.

## Contract to neighbours

- **Part 11** consumes `completed_groups` from this part's return shape to fan out `on_complete` Apis.
- **Part 19 (operational-apis)** — `get-entity-workflows` returns workflow docs including the persisted `groups[]`; part 18 (`actions-on-entity`) reads positionally.
