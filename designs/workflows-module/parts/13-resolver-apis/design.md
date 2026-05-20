# Part 13 — `makeWorkflowApis` resolver

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Emit one `update-action-{action_type}` Lowdefy Api per form / task action at build time. Bake the action's `hooks:`, `event:`, and `interactions:` maps into the endpoint config as build-time literals. Validate hook auth at build time. Tracker actions get nothing (engine writes their status via subscription).

## In scope

### `makeWorkflowApis.js`

For each form / task action in the normalized config (from [part 4](../04-workflow-config-schema/design.md)):

- Emits one Api with id `update-action-{action_type}` scoped under the workflows module entry id.
- Bakes in:
  - `hooks: { submit_edit: { pre, post }, not_required: { ... }, resolve_error: { ... }, approve: { ... }, request_changes: { ... } }` — each hook value either an api id (string) or null.
  - `event: { submit_edit: { type, display, metadata }, ... }` — per-interaction event overrides from the action YAML.
  - `interactions: { submit_edit: { status: <override-or-null> }, ... }` — per-interaction target-status overrides.
- Routine: single step that invokes the `SubmitWorkflowAction` plugin handler with the request payload.
- Payload shape committed: `action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, optional `current_status` (task `submit_edit` only).

### Build-time validation (hook auth gate)

For every hook declared on every action:

- Read the referenced hook Api's auth block.
- Validate `hook.auth.roles ⊇ action.access.roles`.
- Reject `hook.auth.public: true`.
- Build fails with a precise message naming the offending action + interaction + hook + missing role.

Same validation applies to group-level `on_complete` Apis declared on `workflow.action_groups[].on_complete` (per [part 11](../11-group-on-complete-fanout/design.md)'s open question — confirm during implementation whether to gate here or skip).

### Upstream dependency

Like [part 12](../12-resolver-pages/design.md), this resolver emits dynamic exports. Depending on the answer to part 2's API-channel open question, this either reuses part 2's dynamic-page extension for Apis, or requires a parallel `exports.api` resolver channel. Decide before implementation; resolve in part 2.

## Out of scope / deferred

- **Per-action pages** → [part 12](../12-resolver-pages/design.md).
- **Page templates and button wiring** → [part 16](../16-page-templates/design.md).
- **Runtime hook invocation and merging** → [part 9](../09-hook-invocation/design.md). This part bakes the config; part 9 reads it.

## Depends on

[Part 2](../02-dynamic-module-pages/design.md) (or a parallel API-resolver channel), [part 4](../04-workflow-config-schema/design.md), [part 6](../06-submit-action-writes/design.md) (so the endpoint payload shape matches what the handler accepts).

## Verification

- Unit tests:
  - Worked-example onboarding workflow produces `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup` — no `update-action-track-installation`.
  - `hooks`, `event`, `interactions` maps baked correctly per action.
  - Hook auth-gate failure: a fixture with `hook.auth.roles` missing one of `action.access.roles` fails the build with a clear message.
  - `hook.auth.public: true` fails the build.
- Integration: build the demo app; assert generated Api ids.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Where to validate `on_complete` Api auth** — here vs. in [part 4](../04-workflow-config-schema/design.md). Lean here (consistent with action-level hooks).
- **`force: true` exposure on the endpoint payload** — concept says never. Confirm the endpoint payload shape doesn't accept root-level `force`.

## Contract to neighbours

- **Part 9** reads the baked-in `hooks`, `event`, `interactions` maps via the endpoint payload that this resolver constructs.
- **Part 16** templates call the emitted endpoints with the right `interaction` value from button blocks.
