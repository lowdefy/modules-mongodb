# Part 13 — `makeWorkflowApis` resolver

> **Deviation (Part 32):** Task 2's `interactions:` literal is no longer emitted in the per-action endpoint payload. The `event_overrides:` literal is unchanged. See [Part 32 design](../32-drop-static-overrides/design.md).

> **⚠️ Deviation from original design — read before implementing task 3.**
>
> [Part 02](../02-dynamic-module-pages/design.md) was resolved upstream by **removing the static `exports:` block from `module.lowdefy.yaml` entirely** rather than by adding a resolver-emit channel. The resolver logic in this part (tasks 1–2, already shipped — emission of `update-action-{action_type}`, inline-routine hook APIs, and group `on_complete` APIs) is unaffected. **What changes is task 3 (manifest wiring):** instead of a `resolver:` channel entry under `exports.api`, the manifest's `api:` array invokes the resolver from `_build.array.map` over `_module.var: workflows_config` (concrete shape pinned in [part 20b](../20b-module-manifest-dynamic/design.md) when task 3 lands). The "Upstream dependency" subsection below and the open question about a parallel `exports.api` channel are dissolved.

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Emit one `update-action-{action_type}` Lowdefy Api per form / task action at build time. Bake the action's `hooks:`, `event_overrides:`, and `interactions:` maps into the endpoint config as build-time literals. Hooks and group `on_complete` routines are authored inline on the action / workflow YAML; the resolver also emits those as Apis with `auth.roles` synthesized from `action.access.roles` so the hook-auth gate holds by construction (no separate validation pass). Tracker actions get nothing (engine writes their status via subscription).

## In scope

### `makeWorkflowApis.js`

Reads the raw `vars.workflows_config` YAML (not the normalized output of `makeWorkflowsConfig`). Build-time-only fields (`hooks`, `interactions`, `event`, `access`) live on the raw action YAML, not on the normalized config — same input contract part 12 uses. Part 4's `tasks/tasks.md` documents this: build-time-only fields are read by parts 12/13/15 from the raw workflow YAML.

Endpoints emit once per form/task action, regardless of `access.{app_name}` verb list — the engine enforces access at submit time via the role gate (per [submit-pipeline/spec.md § Per-app emission](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md#per-action-update-action-action_type-api-resolver-emitted)). `vars.app_name` is **not** an input to this resolver (contrast with `makeActionPages`).

For each form / task action:

- Emits one Api with id `update-action-{action_type}` scoped under the workflows module entry id.
- Form and task actions get **identical** endpoint shapes (same routine, same payload contract). The handler routes task-specific behaviour via `current_status`; the resolver does not branch on `kind`. Only `kind: tracker` is skipped.
- Bakes in (sparse — only declared interactions/fields are emitted; the handler reads `hooks?.[interaction]?.pre` etc. and treats absent slots as no-hook):
  - `hooks: { <interaction>: { pre?, post? }, ... }` — each value is an api id (string). Slots are emitted only for interactions that declare at least one of `pre`/`post` on the action YAML.
  - `event_overrides: { <interaction>: { type?, display?, references?, metadata? }, ... }` — per-interaction event overrides lifted from the action YAML's `event:` block. The resolver renames `event` → `event_overrides` on emission to disambiguate the build-time payload key from the per-action YAML key. The four-tuple matches the `buildDefaultLogEventPayload` shape part 9 imports as the bottom layer (see [part 8 design.md:15](../08-side-effect-dispatch/design.md)).
  - `interactions: { <interaction>: { status: <override> }, ... }` — per-interaction target-status overrides.
- Routine: single step that invokes the `SubmitWorkflowAction` plugin handler with the request payload. The routine targets the workflows module's `workflow-api` connection (`_module.connectionId: workflow-api`); the connection's `workflowsConfig` and `actionsEnum` properties — wired in part 20 — are what the handler reads for engine state. Part 13 emits no payload fields for those.
- Payload shape committed: the runtime payload (`action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, `comment`, optional `current_status` for task `submit_edit`) **plus** the build-time literals (`action_type`, `workflow_type`) the resolver bakes in. No root-level `force` field — `force: true` lives only on pre-hook-returned `actions[]` entries (engine-internal); the resolver does not emit a `force:` slot in `properties:`.

### Comment mapping

The runtime `comment` field is the user-supplied comment from the page's comment input — a top-level scalar in the payload, not nested under `event.metadata.*`. Keeping it flat at the boundary lets the template author the comment input as a single block (`id: comment`) with no knowledge of the engine's event-emission shape.

The resolver-emitted routine simply passes `comment: { _payload: 'comment' }` through to the handler. The `SubmitWorkflowAction` handler reads it and writes it into the engine-emitted event's `metadata.comment` slot before the event hits the events module. This is a runtime layer that sits **above** the build-time `event_overrides[interaction]` map but **below** the pre-hook return's `event_overrides` (so a pre-hook can still override the user-supplied comment if it has reason to). The merge order becomes:

1. Engine defaults (per submit-pipeline § "Log event").
2. Action YAML `event.{interaction}.{type|display|metadata}` — baked into `event_overrides` by this resolver.
3. **Runtime `comment` field** — handler injects into `metadata.comment` if present and non-empty.
4. Pre-hook return `event_overrides` — unkeyed runtime bag, merges last.

Empty / null `comment` is a no-op (no `metadata.comment` written).

#### Pending handler work (part 6 follow-up)

**Superseded by [Part 9 Task 9 — Extend `buildDefaultLogEventPayload`](../09-hook-invocation/tasks/09-extend-build-default-log-event-payload.md)** and [Part 9 Task 7 (`handleSubmit.js` wiring)](../09-hook-invocation/tasks/07-wire-step-2-pre-hook.md). Part 9 owns the handler-side fold-in (extend `buildDefaultLogEventPayload(comment)`, thread `params.comment` through `logEventInputBag`, drop `metadata.comment` when falsy, lock down the layer ordering via `mergeEventOverrides.test.js`). The "no schema validation on comment shape" rule still holds — free-text scalar, handler trusts the input, sanitisation is the events module's concern.

The resolver-emission piece of this contract is implemented in [makeWorkflowApis.js](../../../../modules/workflows/resolvers/makeWorkflowApis.js) — every emitted endpoint passes `comment: { _payload: 'comment' }` to `SubmitWorkflowAction`. Until Part 9 Task 9 lands, the resolver passes `comment` to the handler but nothing reads it (no behaviour break — comment payloads are simply ignored).

### Hook emission (replaces the build-time auth gate)

Hooks are authored **inline** on the action YAML — the routine lives on `hooks.{interaction}.{pre|post}` as an object, not a string pointing at an external Api. The resolver emits the hook Apis alongside the `update-action-{action_type}` endpoint, deriving the id deterministically:

- `update-action-{action_type}-{interaction}-pre`
- `update-action-{action_type}-{interaction}-post`

The `hooks:` map baked into the `update-action-{action_type}` endpoint carries these derived ids (one slot per interaction that declares `pre`/`post`). Part 9's `invokePreHook.js` reads the id from the endpoint config and calls it via `context.callApi` — same contract it already has; only the provenance of the id changes.

**Auth by construction.** The resolver synthesizes each emitted hook Api's `auth:` block from `action.access.roles` directly (`hook.auth.roles ≡ action.access.roles`, never `auth.public: true`). The "`hook.auth.roles ⊇ action.access.roles`" gate holds by construction — no separate validation pass, no cross-resource lookup, no `vars.apis` input needed. There is no surface for the author to mis-author a hook's auth.

Same model applies to group-level `on_complete` routines on `workflow.action_groups[].on_complete`: authored inline, resolver emits an Api with id `workflow-{workflow_type}-group-{group_id}-on-complete`, auth synthesized from the union of `access.roles` across the group's actions. The build-time validation for `on_complete` (part 11's open question) is dissolved by the same mechanism.

**Schema fold-in required before implementation.** The action-authoring spec ([action-authoring/spec.md "Action hooks contract"](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md)) and the worked-example YAML currently treat `hooks.{interaction}.{pre|post}` as a string Api id. That needs to flip to an object carrying the routine inline (shape mirrors a Lowdefy Api `routine:`). Part 4's `makeWorkflowsConfig` validator should reject the old string form with a migration message. Treat this as a precondition task — not in part 13's scope to author, but blocking part 13's task list.

### Upstream dependency

Like [part 12](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md), this resolver emits dynamic exports. Depending on the answer to part 2's API-channel open question, this either reuses part 2's dynamic-page extension for Apis, or requires a parallel `exports.api` resolver channel. Decide before implementation; resolve in part 2.

## Out of scope / deferred

- **Per-action pages** → [part 12](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md).
- **Page templates and button wiring** → [part 16](../16-page-templates/design.md).
- **Runtime hook invocation and merging** → [part 9](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md). This part bakes the config; part 9 reads it.

## Depends on

[Part 2](../02-dynamic-module-pages/design.md) (or a parallel API-resolver channel), [part 6](../06-submit-action-writes/design.md) (so the endpoint payload shape matches what the handler accepts). [Part 4](../04-workflow-config-schema/design.md) validates the YAML this resolver consumes but its normalized output is not consumed here — the resolver reads `vars.workflows_config` directly.

## Verification

- Unit tests:
  - Worked-example onboarding workflow produces `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup` — no `update-action-track-installation`.
  - `schedule-followup` (task) emits `update-action-schedule-followup` with the same payload shape as form endpoints (including the `current_status` slot accepted via `_payload`).
  - Every emitted form/task endpoint passes the runtime `comment` field through to the handler via `comment: { _payload: 'comment' }` (per "Comment mapping" above).
  - `hooks`, `event_overrides`, `interactions` maps baked correctly per action (sparse — only declared slots present).
  - Hook Api emission: a fixture action declaring `hooks.submit_edit.pre: { routine: [...] }` produces an emitted Api with id `update-action-{action_type}-submit_edit-pre`, the inline routine, and `auth.roles` synthesized from `action.access.roles`.
  - `on_complete` Api emission: a fixture group declaring `on_complete: { routine: [...] }` produces an emitted Api with id `workflow-{workflow_type}-group-{group_id}-on-complete` and `auth.roles` synthesized from the union of the group's actions' `access.roles`.
  - Author error: an action whose `hooks.{interaction}.{pre|post}` is a string (legacy shape) fails the build with a migration message (validated in `makeWorkflowsConfig`).
- Integration: build the demo app; assert generated Api ids.
- End-to-end coverage lands in [part 22](modules-mongodb/designs/workflows-module/parts/22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

_(None — the hook-auth and `on_complete`-auth questions dissolved into the inline-routine emission model above.)_

## Contract to neighbours

- **Part 9** reads the baked-in `hooks`, `event_overrides`, `interactions` maps via the endpoint payload that this resolver constructs.
- **Part 16** templates call the emitted endpoints with the right `interaction` value from button blocks.
- **Part 29** — per [§ D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently), per-action endpoints emit **no** trailing `:if` / `:reject` control step. Pre-hook rejects propagate transparently as a `UserError(isReject: true)` throw and are classified at the wrapping endpoint's `runRoutine` (which lands the reject as `{ status: 'reject', error }` via the upstream `cc18b41e9` tweak — see [Part 29 § Upstream dependency](../29-error-model-cleanup/design.md#upstream-dependency)).
