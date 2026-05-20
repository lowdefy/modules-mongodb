# Part 13 — `makeWorkflowApis` resolver

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Emit one `update-action-{action_type}` Lowdefy Api per form / task action at build time. Bake the action's `hooks:`, `event_overrides:`, and `interactions:` maps into the endpoint config as build-time literals. Validate hook auth at build time. Tracker actions get nothing (engine writes their status via subscription).

## In scope

### `makeWorkflowApis.js`

Reads the raw `vars.workflows_config` YAML (not the normalized output of `makeWorkflowsConfig`). Build-time-only fields (`hooks`, `interactions`, `event`, `access`) live on the raw action YAML, not on the normalized config — same input contract part 12 uses. Part 4's `tasks/tasks.md` documents this: build-time-only fields are read by parts 12/13/15 from the raw workflow YAML.

Endpoints emit once per form/task action, regardless of `access.{app_name}` verb list — the engine enforces access at submit time via the role gate (per [submit-pipeline/spec.md § Per-app emission](../../../workflows-module-concept/submit-pipeline/spec.md#per-action-update-action-action_type-api-resolver-emitted)). `vars.app_name` is **not** an input to this resolver (contrast with `makeActionPages`).

For each form / task action:

- Emits one Api with id `update-action-{action_type}` scoped under the workflows module entry id.
- Form and task actions get **identical** endpoint shapes (same routine, same payload contract). The handler routes task-specific behaviour via `current_status`; the resolver does not branch on `kind`. Only `kind: tracker` is skipped.
- Bakes in (sparse — only declared interactions/fields are emitted; the handler reads `hooks?.[interaction]?.pre` etc. and treats absent slots as no-hook):
  - `hooks: { <interaction>: { pre?, post? }, ... }` — each value is an api id (string). Slots are emitted only for interactions that declare at least one of `pre`/`post` on the action YAML.
  - `event_overrides: { <interaction>: { type?, display?, references?, metadata? }, ... }` — per-interaction event overrides lifted from the action YAML's `event:` block. The resolver renames `event` → `event_overrides` on emission to disambiguate the build-time payload key from the per-action YAML key. The four-tuple matches the `buildDefaultLogEventPayload` shape part 9 imports as the bottom layer (see [part 8 design.md:15](../08-side-effect-dispatch/design.md)).
  - `interactions: { <interaction>: { status: <override> }, ... }` — per-interaction target-status overrides.
- Routine: single step that invokes the `SubmitWorkflowAction` plugin handler with the request payload. The routine targets the workflows module's `workflow-api` connection (`_module.connectionId: workflow-api`); the connection's `workflowsConfig` and `actionsEnum` properties — wired in part 20 — are what the handler reads for engine state. Part 13 emits no payload fields for those.
- Payload shape committed: the runtime payload (`action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, optional `current_status` for task `submit_edit`) **plus** the build-time literals (`action_type`, `workflow_type`) the resolver bakes in. No root-level `force` field — `force: true` lives only on pre-hook-returned `actions[]` entries (engine-internal); the resolver does not emit a `force:` slot in `properties:`.

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

[Part 2](../02-dynamic-module-pages/design.md) (or a parallel API-resolver channel), [part 6](../06-submit-action-writes/design.md) (so the endpoint payload shape matches what the handler accepts). [Part 4](../04-workflow-config-schema/design.md) validates the YAML this resolver consumes but its normalized output is not consumed here — the resolver reads `vars.workflows_config` directly.

## Verification

- Unit tests:
  - Worked-example onboarding workflow produces `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup` — no `update-action-track-installation`.
  - `schedule-followup` (task) emits `update-action-schedule-followup` with the same payload shape as form endpoints (including the `current_status` slot accepted via `_payload`).
  - `hooks`, `event_overrides`, `interactions` maps baked correctly per action (sparse — only declared slots present).
  - Hook auth-gate failure: a fixture with `hook.auth.roles` missing one of `action.access.roles` fails the build with a clear message.
  - `hook.auth.public: true` fails the build.
- Integration: build the demo app; assert generated Api ids.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Where to validate `on_complete` Api auth** — here vs. in [part 4](../04-workflow-config-schema/design.md). Lean here (consistent with action-level hooks).

## Contract to neighbours

- **Part 9** reads the baked-in `hooks`, `event_overrides`, `interactions` maps via the endpoint payload that this resolver constructs.
- **Part 16** templates call the emitted endpoints with the right `interaction` value from button blocks.
