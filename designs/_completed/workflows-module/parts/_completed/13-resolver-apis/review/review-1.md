# Review 1 — Payload contract drift, input source, scope of "task" actions

Focus: does the emitted endpoint's `properties:` block match what `SubmitWorkflowAction` actually accepts today (post-parts 6 & 7), and does the design's input-source story hold given the part-12 review's `entity_collection` fold-in?

## Payload contract: the design has drifted from the shipped handler

### 1. `action_type` / `workflow_type` are missing from the design's payload shape, but they're required by the spec

> **Resolved.** Payload-shape bullet in [design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) now commits "runtime payload (…) **plus** the build-time literals (`action_type`, `workflow_type`) the resolver bakes in." Matches the canonical spec shape.

[design.md:21](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) commits the payload shape as:

> `action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, optional `current_status` (task `submit_edit` only).

But the canonical resolver-emitted Api shape in [submit-pipeline/spec.md:47–55](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md) lists `action_type: <action_type>` and `workflow_type: <workflow_type>` as **build-time literals** baked into `properties:` (alongside the runtime `_payload:` fields). The action-authoring spec mirrors this at [action-authoring/spec.md:506–509](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md).

These two literals matter — they're how the handler will look up `actionConfig` and `workflowConfig` once the build-time literals are wired in. Today's `handleSubmit.js` happens to recover them via `getCurrentAction → workflow_id → workflows.findOne → workflow_type`, then derives `action.type` from the doc — but the spec contract says the resolver bakes them in. Part 13's design line 21 silently drops both literals from the committed payload shape.

**Fix:** Restate the design's payload as "the runtime payload (`action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, optional `current_status`) **plus** the build-time literals (`action_type`, `workflow_type`) that the resolver bakes in." This makes the on-the-wire contract match the spec and the handler's eventual lookup shape.

### 2. `hooks` map is overspecified vs. what the handler will consume

> **Resolved.** Folded into the §1/§3/§4 rewrite of "In scope". The committed shape is now sparse for all three maps: "only declared interactions/fields are emitted; the handler reads `hooks?.[interaction]?.pre` etc. and treats absent slots as no-hook." Spec example's dense five-slot shape is illustrative, not normative.

design.md:17 commits:

```
hooks: { submit_edit: { pre, post }, not_required: { ... }, resolve_error: { ... }, approve: { ... }, request_changes: { ... } }
```

This emits five interaction slots with `{ pre, post }` for every action, even when most are empty. Two problems:

- **Wasted bytes in the endpoint YAML.** For the worked-example, `qualify` declares only `hooks.submit_edit.pre`, but the resolver would still bake 10 null slots. The endpoint config is build-time literal, not free.
- **Spec wording leaves the shape open.** [submit-pipeline/spec.md:56–61](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md) shows the same five-slot shape but it's an illustrative example, not a contract — the handler only ever reads `hooks[interaction]` once on entry (spec line 78). A sparse map with only declared slots works identically at runtime.

**Fix:** Commit a sparse shape: `hooks` carries only the `{interaction: {pre?, post?}}` slots actually declared on the action. The handler still reads `hooks?.[interaction]?.pre` and treats absent slots as no-hook. Same applies to `event_overrides` and `interactions` below. Note that the spec example uses the dense form for readability, not as a normative shape.

### 3. The design names the baked-in event map `event:` but the spec / handler call it `event_overrides`

> **Resolved.** Renamed `event` → `event_overrides` throughout [design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) (Goal, In scope, Verification, Contract to neighbours). Added a one-liner: "the resolver renames `event` → `event_overrides` on emission to disambiguate the build-time payload key from the per-action YAML key."

design.md:18 emits the field as `event: { submit_edit: { type, display, metadata }, ... }`. But the canonical Api in [submit-pipeline/spec.md:62](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md) and [action-authoring/spec.md:523](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) names this `event_overrides:` (with a per-interaction key). The handler's part-6 `internal` payload already exists, and part 9 will read it as `event_overrides` per [part 9 design.md:32](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md).

This is the same field — but the design's prose ("baked-in `hooks:`, `event:`, and `interactions:` maps") reads as if the resolver mirrors the action YAML's `event:` key on the wire, when in fact the resolver renames it on emission to disambiguate from the YAML source.

**Fix:** Rename `event:` to `event_overrides:` in design.md:18, line 27, and Contract-to-neighbours. Add a one-liner: "Resolver lifts `action.event[interaction].{type|display|metadata}` from YAML into `event_overrides[interaction]` on the endpoint; the renaming disambiguates the build-time payload key from the per-action YAML key."

### 4. Where is `event_overrides[interaction].references`?

> **Resolved.** [design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) now commits the four-tuple `{ type?, display?, references?, metadata? }` and notes it matches the `buildDefaultLogEventPayload` shape part 9 imports as the bottom layer.

[part 8 design.md](../../08-side-effect-dispatch/design.md) (and the buildDefaultLogEventPayload contract that part 9 imports as the bottom layer per part 9 design.md:32) treats the event override slot as the four-tuple `{ type, display, references, metadata }`. design.md:18 lists only three (`{ type, display, metadata }`) — `references` is missing.

This isn't pedantry: `references` is the field apps use to point an event at a related entity (an attached document, a child workflow), and per [action-authoring/spec.md:103](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) static `references:` blocks live on the action YAML. If part 13 doesn't carry it through, hooks lose the ability to override that bottom-layer default at the YAML layer.

**Fix:** Include `references` in the `event_overrides` shape — `{ type, display, references, metadata }`.

## Input source: same problem part 12 had

### 5. The design doesn't say which input the resolver reads — but it has to be the raw YAML

> **Resolved.** Added an explicit input-source paragraph at the top of "In scope" mirroring part 12's resolved wording. Also dropped part 4 from the hard `Depends on` line (rephrased as "validates the YAML this resolver consumes; its normalized output is not consumed here").

design.md doesn't explicitly state whether `makeWorkflowApis` reads `vars.workflows_config` (raw YAML) or the normalized output of `makeWorkflowsConfig`. The "In scope" bullets reference action YAML fields (`hooks:`, `event:`, `interactions:`, `access:`) without naming the source.

This was exactly the part-12 review finding (consistency-1 / review-1 §3): the normalized config from `makeWorkflowsConfig.js:1–4` **strips** `form, form_review, form_error, pages, hooks, interactions, event`. So part 13 cannot read from `workflowsConfig` for the fields it needs to bake in. It has to read the raw `vars.workflows_config`, exactly like part 12 does (see [makeActionPages.js:72–88](modules-mongodb/modules/workflows/resolvers/makeActionPages.js) and [part 12 design.md:15–17](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md)).

**Fix:** Mirror part 12's resolved wording. Add to design.md "In scope":

> Reads the raw `vars.workflows_config` YAML (not the normalized output of `makeWorkflowsConfig`). Build-time-only fields (`hooks`, `interactions`, `event`, `access`) live on the raw action YAML, not on the normalized config. Part 4's `tasks/tasks.md` documents the contract — part 13 picks what it needs directly from the raw YAML.

Also: line 46 lists `Depends on … [part 4]` and `[part 6]` — drop the `[part 4]` dependency. Part 13 doesn't consume part 4's output; it only relies on part 4's validation pass having run (no ordering enforcement, just a guarantee that bad YAML didn't reach this resolver). Either drop it or rephrase as "Part 4 validates the YAML this resolver consumes."

### 6. `vars.app_name` requirement is missing

> **Resolved.** Added an explicit line under "In scope": "Endpoints emit once per form/task action, regardless of `access.{app_name}` verb list … `vars.app_name` is **not** an input to this resolver (contrast with `makeActionPages`)."

Part 12's review (§6) added a build-time validation that `vars.app_name` must be non-empty. Part 13 reads `access.{vars.app_name}` for the same per-app verb gating (or does it?). Three questions:

- Does part 13 emit endpoints per-app or once-per-action regardless of app? [submit-pipeline/spec.md:76](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md) says: **"Endpoints are emitted regardless of `access.{app_name}` verb list — the engine enforces access at submit time via the role gate."**
- If endpoints are app-agnostic, the resolver doesn't need `app_name` at all.
- But the design doesn't say. Reading line 11 ("for each form / task action in the normalized config"), the implicit answer is "emit one per action regardless of app." That's correct per spec.

**Fix:** Add an explicit line: "Endpoints emit once per form/task action, regardless of `access.{app_name}` verb list — engine enforces at submit time. `vars.app_name` is **not** an input to this resolver (contrast with `makeActionPages`)."

## Task actions: dropped without justification

### 7. The design conflates "form" and "task" actions inconsistently

> **Resolved.** Added one sentence to the per-action bullet list: "Form and task actions get **identical** endpoint shapes (same routine, same payload contract). The handler routes task-specific behaviour via `current_status`; the resolver does not branch on `kind`. Only `kind: tracker` is skipped."

The "Goal" sentence (design.md:7) says "one `update-action-{action_type}` Lowdefy Api per form / task action." Good, matches the spec. But:

- design.md:13 says "For each form / task action in the normalized config…" ✓
- design.md:51 (verification): "Worked-example onboarding workflow produces `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup` — no `update-action-track-installation`." ✓ (schedule-followup is the task; track-installation is the tracker.)
- design.md:21 payload commits "optional `current_status` (task `submit_edit` only)" — but no other section explains how the resolver distinguishes task vs form when baking the endpoint. Task actions don't declare `form:` / `form_review:`, but the resolver still emits the same payload shape (`form` / `form_review` slots) per the spec (handler reads them as `{}` for tasks).

This is mostly fine, but the design never explicitly says: "the emitted endpoint shape is identical for `kind: form` and `kind: task` — only `kind: tracker` is excluded." Without that, a reader might assume task endpoints have a different routine.

**Fix:** Add one sentence: "Form and task actions get identical endpoint shapes (same routine, same payload contract). The handler routes task-specific behavior via `current_status` and the resolver doesn't branch on kind. Only `kind: tracker` is skipped."

### 8. Verification list omits the task-action case

> **Resolved.** Added a positive verification bullet: "`schedule-followup` (task) emits `update-action-schedule-followup` with the same payload shape as form endpoints (including the `current_status` slot accepted via `_payload`)."

design.md:51 names three emitted endpoints: `update-action-qualify` (form), `update-action-send-quote` (form), `update-action-schedule-followup` (task). The fourth, `track-installation` (tracker), is correctly absent.

The list passes, but there's no positive assertion of "task endpoint emitted with the right `current_status` slot in payload" — only the negative "no tracker endpoint." Given §7's drift risk, add a positive task-action test.

**Fix:** Add to verification: "`schedule-followup` (task) emits `update-action-schedule-followup` with the same payload shape as form endpoints (including the `current_status` slot accepted via `_payload`)."

## Build-time validation gate

### 9. The hook-auth validation lives where the hook configs land — but how does the resolver reach hook auth?

> **Resolved.** Dissolved by inverting the model: hooks are authored **inline** on the action YAML (the routine, not a string pointing at an external Api), and the resolver emits the hook Apis itself with deterministic ids (`update-action-{action_type}-{interaction}-{pre|post}`). Auth is synthesized from `action.access.roles` at emission, so the `⊇` gate holds by construction — no cross-resource lookup, no `vars.apis` input, no separate validation pass. [design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) "Hook emission" section replaces the old "Build-time validation (hook auth gate)" section. Flagged a precondition: the action-authoring spec and part 4's validator need a fold-in to flip `hooks.{interaction}.{pre|post}` from string to object.

design.md:25–30 commits the hook-auth gate at build time: validate `hook.auth.roles ⊇ action.access.roles`, reject `hook.auth.public: true`.

But the resolver reads `hooks[interaction].pre|post` from the action YAML, which is a **string** (the hook Api id). To validate `hook.auth.roles`, the resolver needs to **resolve the referenced Api by id** and read its `auth:` block from the host app's `apis/*.yaml`. That's a cross-resource lookup the resolver doesn't have today.

Three implementation options the design should pick between:

- (a) The resolver receives the host app's full Api registry as a `vars.apis` input and looks each hook id up there.
- (b) The validation happens not in the resolver but in a `makeWorkflowsConfig`-style second pass after all build-time resolvers run (a "post-resolution" validator).
- (c) Defer the gate to runtime — when `SubmitWorkflowAction` invokes a hook via `context.callApi`, it asserts the hook's auth allowed the calling user. Less precise but no cross-resource resolution at build.

Option (a) is the most authoring-friendly. Option (b) is the cleanest separation. The design doesn't pick one.

**Fix:** Add an "Implementation note" under "Build-time validation (hook auth gate)":

> The resolver receives `vars.apis` (the host app's full Api registry expanded by the framework, same way `vars.workflows_config` is expanded) and looks up hook ids in it. Failure message: `makeWorkflowApis: workflow "<type>" action "<type>" hooks.<interaction>.<pre|post>: hook api "<id>" auth.roles missing required role "<role>" (action.access.roles = [...]).`

Confirm `vars.apis` is a thing the framework can hand a resolver; if not, fall back to option (b) and document it as a separate validation pass.

### 10. The `on_complete` validation is left open — close it

> **Resolved.** Same fold as §9 — `on_complete` is authored inline on `workflow.action_groups[].on_complete`; the resolver emits an Api with id `workflow-{workflow_type}-group-{group_id}-on-complete` and `auth.roles` synthesized from the union of the group's actions' `access.roles`. Gate dissolves by construction. The "where to validate `on_complete` Api auth" open question is dropped from [design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md).

design.md:32 says:

> Same validation applies to group-level `on_complete` Apis declared on `workflow.action_groups[].on_complete` (per [part 11](../11-group-on-complete-fanout/design.md)'s open question — confirm during implementation whether to gate here or skip).

Part 11's open question ([11 design.md:58](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md)) explicitly hands the decision to part 13. Part 13 hands it back to "confirm during implementation." The decision needs to land before tasks file open.

The case for validating here: same shape, same risk class (a hook-without-role-gate can leak privilege escalation onto a group-completion firing), same resolver already has the auth-lookup machinery from §9.

**Fix:** Commit: "Yes — `on_complete` Apis go through the same auth gate. The resolver iterates `workflow.action_groups[]` after iterating `workflow.actions[]` and validates `auth.roles ⊇ (union of all action.access.roles in the group)`." Or: commit "no — `on_complete` Apis are app-internal and gate themselves." Either is fine; the design just can't leave it pending.

## Cross-part contract

### 11. Where does the resolver-emitted Api land in the manifest?

> **Accepted.** The risk is real but the existing wording already gestures at it — `Depends on` says "Part 2 (or a parallel API-resolver channel)" and the Upstream dependency section says "Decide before implementation; resolve in part 2." A hard `Depends on` row would just restate that. Leaving as-is.

design.md:34 ("Upstream dependency") flags the part-2 open question about whether `exports.api` rides on the same dynamic-export channel as `exports.pages`. Part 12 ships, so the page channel will land. Part 13 needs **either** the same channel or a parallel `exports.resolvers.api`.

Part 20 (module-manifest) is in Wave 7. If part 2 ships only the `exports.pages` channel, part 13's manifest wiring is **blocked on a part-2 follow-up**. That's a real sequencing risk that the design doesn't surface.

**Fix:** Add a row to "Depends on": "**Part 2 must include the API channel** before part 13's manifest wiring (task 3-ish) can land. If part 2 ships only `exports.pages`, file a follow-up against part 2 here."

### 12. Connection wiring for `actionsEnum` and `workflowsConfig` — does the emitted endpoint need to know?

> **Resolved.** Added one sentence to the Routine bullet: "The routine targets the workflows module's `workflow-api` connection (`_module.connectionId: workflow-api`); the connection's `workflowsConfig` and `actionsEnum` properties — wired in part 20 — are what the handler reads for engine state. Part 13 emits no payload fields for those."

[SubmitWorkflowAction.js:10–11](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction.js) reads `connection.workflowsConfig` and `connection.actionsEnum` at handler entry. The emitted endpoint sets `connectionId: { _module.connectionId: workflow-api }` ([spec.md:45–46](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md)) — fine.

Part 13's design doesn't restate this, but it's the implicit contract: the emitted endpoint targets the workflows module's `workflow-api` connection, whose properties carry the normalized config and enum. Worth mentioning so it's clear part 13 doesn't have to plumb those through the payload.

**Fix:** Add one sentence in "Routine": "The routine targets the workflows module's `workflow-api` connection (`_module.connectionId: workflow-api`); the connection's `workflowsConfig` and `actionsEnum` properties — wired in part 20 — are what the handler reads for engine state. Part 13 emits no payload fields for those."

## Open questions

### 13. The `force: true` open question (design.md:61) is already answered by the spec

> **Resolved.** Dropped the open question and folded a positive contract statement into the payload-shape bullet: "No root-level `force` field — `force: true` lives only on pre-hook-returned `actions[]` entries (engine-internal); the resolver does not emit a `force:` slot in `properties:`."

design.md:61 lists as open:

> **`force: true` exposure on the endpoint payload** — concept says never. Confirm the endpoint payload shape doesn't accept root-level `force`.

This is already a closed contract. [Part 6 design.md:87](modules-mongodb/designs/workflows-module/parts/_completed/06-submit-action-writes/design.md) (Implemented): **"Per-entry is the only force surface — no top-level `force` on the handler payload."** And the spec ([submit-pipeline/spec.md:189](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md) area) makes it explicit. The handler today wouldn't read it anyway.

**Fix:** Drop the open question. Replace with a positive contract statement: "The endpoint payload has no root-level `force` field. `force: true` lives only on pre-hook-returned `actions[]` entries (engine-internal). The resolver does not emit a `force:` slot in `properties:`."

## Summary

- Three drift findings against the spec contract (§1, §3, §4) — the design's committed payload shape doesn't match the canonical spec shape.
- One sparseness finding (§2) worth fixing before tasks open.
- One input-source clarification (§5), copying the part-12 fold-in.
- One validation-mechanism choice that needs picking (§9) and one open question (§10) that needs closing.
- One scope clarification on task actions (§7, §8).
- Two sequencing risks (§11, §12) worth surfacing.
- One stale open question to drop (§13).

Most are small textual folds — the main load-bearing fix is §9 (how the resolver reaches hook auth blocks for the gate).
