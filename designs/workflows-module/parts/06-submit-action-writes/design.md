# Part 06 — `SubmitWorkflowAction` core writes

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** L. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

Ship the bones of the user-submit path: a `SubmitWorkflowAction` handler that takes an `interaction`, applies the priority rule, writes the action transition and `form_data`, recomputes the workflow summary, and returns. The 11-step lifecycle skeleton lands here with all 11 steps stubbed; only the writes-and-priority slice executes. Parts 7–11 light up the other steps.

## In scope

### Lifecycle scaffold

Full 11-step skeleton in `handleSubmit.js`; only steps 1, 3 (auto-unblocks for action types only — group ids defer to part 7), 4, 5, 6 execute. Other steps no-op with TODO comments pointing at their part:

1. **Validate**: payload schema, action exists, access check (`access.roles ∩ user.roles`).
2. **Pre-hook** — no-op, → [part 9](../09-hook-invocation/design.md).
3. **Compute auto-unblocks** — action-type entries in `blocked_by` only. Group ids resolved in [part 7](../07-group-state-machine/design.md).
4. **Write action transitions** — priority rule + `currentActionId` self-exception + `force: true` overrides. Push to `status[]` with change stamps.
5. **Recompute workflow summary** — counts only. `groups[]` defer to part 7.
6. **Write `form_data`** — layout `form_data.{action_type}[.{key}].{field}` (per concept engine D5).
7. **Generate log event** — no-op, → [part 8](../08-side-effect-dispatch/design.md).
8. **Dispatch notifications** — no-op, → [part 8](../08-side-effect-dispatch/design.md).
9. **Group `on_complete` fan-out** — no-op, → [part 11](../11-group-on-complete-fanout/design.md).
10. **Tracker subscription** — no-op, → [part 10](../10-tracker-subscription/design.md).
11. **Post-hook** — no-op, → [part 9](../09-hook-invocation/design.md).

Then return: `{ action_ids, completed_groups: [], event_id: null, tracker_fired: null, pre_hook_response: null, post_hook_response: null }`.

### Interaction → target-status mapping (engine default only)

No `action.interactions:` override (part 9), no pre-hook override (part 9). Defaults:

- `submit_edit` → `in-review` if any `access.{app}` has `review`, else `done`.
- `not_required` → `not-required`.
- `resolve_error` → same target as `submit_edit`.
- `approve` → `done`.
- `request_changes` → `changes-required`.
- Task `submit_edit` honors caller-supplied `current_status` instead of computing (status-selector pattern).

### Priority rule

- Allow transition iff `priority(new) < priority(current)`.
- Self-exception: same-stage allowed for the `currentActionId` (idempotent re-save).
- `force: true` per-call (payload root) and per-entry (in `actions[]`) bypasses the rule. v1 only the pre-hook path (part 9) sets `force`; this part plumbs the flag everywhere it needs to flow.
- `not-required` (priority 0) is universal terminal.

### Idempotency

- Same `(action_id, current_status, interaction)` re-submitted is a no-op via the `shouldUpdate` guard.
- Implemented in `utils/shouldUpdate.js` + `utils/getCurrentAction.js`.

### Sub-modules

- `SubmitWorkflowAction/handleSubmit.js` — orchestrator.
- `SubmitWorkflowAction/computeAutoUnblocks.js` — action-type-only resolution; commented for extension by part 7.
- `SubmitWorkflowAction/updateAction.js` (full) — replaces part 5's scaffold; enforces priority rule, idempotency, change stamps.
- `SubmitWorkflowAction/utils/shouldUpdate.js`, `shouldCreate.js`, `getCurrentAction.js`.

## Out of scope / deferred

- **Group recompute, `blocked_by` group-id resolution, group return shape** → [part 7](../07-group-state-machine/design.md).
- **Log event + notifications** → [part 8](../08-side-effect-dispatch/design.md).
- **Pre/post hooks, `force: true` from hook returns, three-layer status resolution, `event_overrides`, `form_overrides`, `hook_error`** → [part 9](../09-hook-invocation/design.md).
- **Tracker subscription fire** → [part 10](../10-tracker-subscription/design.md).
- **Group `on_complete` fan-out** → [part 11](../11-group-on-complete-fanout/design.md).
- **`required_after_close` honoring** — ship in this part if cheap; otherwise defer to part 7 (where workflow-stage gating already gets touched).

## Depends on

[Part 3](../03-engine-plugin-shell/design.md), [part 4](../04-workflow-config-schema/design.md), [part 5](../05-start-cancel-handlers/design.md).

## Verification

- Unit tests on `handleSubmit`:
  - Priority rule honored; same-stage on `currentActionId` allowed; same-stage on others rejected.
  - `force: true` per-call and per-entry both bypass.
  - `form_data` writes land at the right path for keyed and non-keyed actions.
  - Summary counts match after a transition.
  - Each interaction default maps correctly (form action with `review` verb → `in-review`; without → `done`; etc.).
  - Task `submit_edit` honors caller-supplied `current_status`.
- Idempotency: re-submit same `(action_id, current_status, interaction)` is no-op.

## Open questions

- **Validation failure return shape** — throw vs. structured `{ success: false }` return. Lean structured so part 9's `hook_error` and validation failures use the same shape.
- **`current_status` payload provenance for task vs. form.** Task `submit_edit` is the one interaction where the caller supplies. Confirm at the call sites.

## Contract to neighbours

- **Parts 7, 8, 9, 10, 11** each light up one of the no-op'd lifecycle steps. The 11-step skeleton and return-shape skeleton commits here.
- **Part 13 (resolver-apis)** emits per-action endpoints that call this handler.
