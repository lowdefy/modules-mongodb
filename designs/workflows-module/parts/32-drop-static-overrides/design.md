# Part 32 — Drop static action-YAML overrides; pre-hook is the only override channel

**Source rationale:** [workflows-module-concept/submit-pipeline/spec.md § Status resolution](../../../workflows-module-concept/submit-pipeline/spec.md), [workflows-module-concept/submit-pipeline/spec.md § Default log event](../../../workflows-module-concept/submit-pipeline/spec.md#default-log-event), revisited under [CLAUDE.md § Principles "One correct way"](../../../../CLAUDE.md). **Layer:** build-time config + resolvers + engine handlers (cross-cutting cleanup). **Size:** S–M. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

Today the engine resolves a handful of per-interaction values across three (or four) merge layers: an engine default, an optional static layer baked into the action YAML, an optional runtime layer, and an optional pre-hook return. The static YAML layer ("Layer 2") exists for two fields — `interactions.{interaction}.status` and the `event:` block — and is the only build-time-baked override channel the action surface offers. This part drops Layer 2 entirely: pre-hooks become the single override channel.

## Proposed change

1. **Remove `interactions: { <interaction>: { status: <stage> } }`** from the action YAML schema. The status resolver collapses from three layers to two: engine default per interaction, then pre-hook return `status`.
2. **Remove the `event: { <interaction>: { type?, display?, references?, metadata? } }`** block from the action YAML schema. The event merge collapses from four layers to three: engine default → runtime `comment` → pre-hook `event_overrides`.
3. **Drop the resolver's bake-in of both maps.** `makeWorkflowApis` no longer emits `event_overrides:` or `interactions:` literals into the per-action endpoint payload. The handler stops reading them from `context.params`.
4. **Drop the merge functions and tests for Layer 2.** `mergeEventOverrides.js` collapses to a 2-layer merge (engine default + pre-hook); `resolveTargetStatus.js` drops the YAML-override branch.
5. **Authors needing a different target status or event payload write a pre-hook routine** (inline on the action YAML, per [part 13 § Hook emission](../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)). The resolver emits one hook Api per declared `{interaction}.pre` slot — incremental cost is one Api per interaction that didn't already declare a pre-hook (if the override piggy-backs onto an existing pre-hook routine, zero new Apis).
6. **`resolveTargetStatus` runtime-validates the pre-hook `status` return** against `action_statuses` and throws on miss. The check fires inside the second `resolveTargetStatus` invocation in `handleSubmit` (after step 2 pre-hook invocation, before step 4 writes) so no engine writes have landed; the action doc is unchanged. Pre-hook side effects re-run on retry per the [Part 29 § D6](../29-error-model-cleanup/design.md) idempotency contract — pre-hook authors own retry safety; this throw doesn't create a new exposure. Throw shape: `UserError` with `isReject: false` (default) — per [Part 29 § D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently), the wrapping endpoint's `runRoutine` classifies it as `{ status: 'error' }` and the calling app's `CallApi` sees a transient error. Not `:reject` — a misspelled status enum is a workflow-author bug, not user-facing validation the submitting user can fix.

## Why this is being considered

The repo principle ([CLAUDE.md § Principles "One correct way"](../../../../CLAUDE.md)) says: prefer mechanically enforced patterns over conventions, even if it means more scaffolding up front, because understanding multiple implementations costs more than writing one. Today there are two ways to alter a per-interaction value: a static YAML map (Layer 2) and a pre-hook return (Layer 3). For any author writing a workflow, knowing which to reach for is a documentation-and-experience problem we'd be removing. Concretely, the cleanup:

- Removes two fields and their inline validators from the action YAML schema (`interactions:`, `event:`) in [part 4 `makeWorkflowsConfig`](../_completed/04-workflow-config-schema/design.md).
- Removes two literals from the per-action endpoint payload emitted by [part 13 `makeWorkflowApis`](../13-resolver-apis/design.md).
- Removes one layer from the status resolver and one from the event-overrides merge in [part 9 `hook-invocation`](../09-hook-invocation/design.md).
- Removes the `interactions:` / `event:` discussion from the action-authoring concept spec.

## Current state — what Layer 2 surfaces actually exist

A grep across the concept specs and part designs surfaces **exactly two** engine-runtime override surfaces baked into the action YAML at build time:

| Surface                                | Path on action YAML                                         | Layer in merge | Validation                                         |
| -------------------------------------- | ----------------------------------------------------------- | -------------- | -------------------------------------------------- |
| Per-interaction target status override | `interactions.{interaction}.status`                         | Layer 2 of 3   | `status` must be a member of `action_statuses`     |
| Per-interaction event payload override | `event.{interaction}.{type, display, references, metadata}` | Layer 2 of 4   | Shape-only (matches `buildDefaultLogEventPayload`) |

These are the only static fields that flow into the **engine's runtime decision-making**. Everything else on the action YAML is either:

- **Engine-runtime config** that is itself the source of truth, not an override (`type`, `kind`, `access`, `blocked_by`, `assignees`, `due_date`, `description`, `key`, `tracker.workflow_type`, `required_after_close`) — out of scope.
- **Build-time UI / chrome config** consumed by the page resolver, not by the engine handler (`pages.{verb}.{title|requests|events|buttons|modals|formHeader|formFooter|maxWidth}`, `status_map`, `form`, `form_review`, `form_error`) — not "overrides" in the engine sense; they author the page rendering and are out of scope for this proposal.
- **Hooks themselves** (`hooks.{interaction}.{pre|post}`) — the proposal's replacement channel, not a target.

So the proposal scope is narrow: two action-YAML fields go away. There is no third Layer-2 surface lurking in the corners.

## Use cases considered — does Layer 2 earn its keep?

The case for keeping `interactions.{interaction}.status` rests on whether real workflows actually need a static per-action status override. The engine defaults are:

| Interaction       | Form action default                                                    | Task action default                 |
| ----------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| `submit_edit`     | `in-review` if any `access.{app}` includes `review`, else `done`       | caller-supplied via status selector |
| `not_required`    | `not-required`                                                         | `not-required`                      |
| `resolve_error`   | same as `submit_edit` (`in-review` if review verb exists, else `done`) | same as `submit_edit`               |
| `approve`         | `done`                                                                 | `done`                              |
| `request_changes` | `changes-required`                                                     | `changes-required`                  |

The defaults already auto-detect review presence from the `access.{app_name}` verb list. Working through each interaction:

| Interaction       | Override case I could construct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `submit_edit`     | "Skip review even though `review` is in access verbs" — the canonical example in [submit-pipeline/design.md:177](../../../workflows-module-concept/submit-pipeline/design.md). But this is contradictory: if you don't want review on submit, drop `review` from `access.{app_name}`. Override exists only if reviewers reach the action via some _other_ path — workflow shape I cannot find in real use cases.                                                                                                                         | Not a real case — better fix is `access` verb list.    |
| `approve`         | Multi-stage approval (first approver → stays in `in-review` for second approver; second approver → `done`). Real pattern.                                                                                                                                                                                                                                                                                                                                                                                                                | Conditional on _who_ approved → pre-hook, not static.  |
| `request_changes` | "Send all the way back to draft" (write `action-required` instead of `changes-required`). Distinct semantics, but I cannot find a workflow where this is a static per-action decision rather than a per-incident reviewer judgment. The demo's `send-quote.yaml` declares `request_changes: action-required` statically, but inspection shows this is an artifact of Layer 2 being available to demonstrate, not a semantic the demo workflow needs — the demo is happy with the engine default `changes-required` once Layer 2 is gone. | Conditional on reviewer intent → pre-hook, not static. |
| `not_required`    | The default _is_ the verb. Nothing to override.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No case.                                               |
| `resolve_error`   | Land the recovery somewhere other than the normal flow's `submit_edit` target. Cannot construct a substantive case.                                                                                                                                                                                                                                                                                                                                                                                                                      | No case.                                               |

**Result:** every override case I could construct is either (a) a misconfigured `access.{app_name}` verb list — real fix is to change the verb list, not the override — or (b) genuinely conditional logic that is properly a pre-hook anyway. The engine defaults are complete for the cases that exist.

Confirming evidence: the concept design's worked example explicitly notes ([workflows-module-concept/design.md:137](../../../workflows-module-concept/design.md)) that the `qualify` action "declares no `interactions:` block, so the engine uses defaults." The canonical worked example doesn't use the override.

The `event:` block has clearer cases — actions commonly want a per-interaction custom event `type` and `display.title`. But the rewrite to a pre-hook is essentially the same body wrapped in `Return`, and the routing-through-pre-hook story is cleaner for richer payload composition (Nunjucks templates, conditional metadata) anyway.

**Conclusion:** Layer 2 is doubly unjustified. `interactions.{interaction}.status` has no real-world cases; `event:` has cases but they migrate cleanly. Drop both.

## What the rewrites look like

### Case A — status override

Layer 2 form (if any author had reached for it):

```yaml
type: qualify
kind: form
interactions:
  submit_edit: { status: done }
```

Pre-hook form:

```yaml
type: qualify
kind: form
hooks:
  submit_edit:
    pre:
      routine:
        - :return:
            status: done
```

The pre-hook also emits an extra Lowdefy Api at build time (`update-action-qualify-submit_edit-pre`) and incurs an in-process `context.callApi` round-trip per `submit_edit` invocation. Cost is small; usage is rare (see § Use cases considered).

### Case B — event override

Layer 2 form:

```yaml
type: qualify
kind: form
event:
  submit_edit:
    type: lead-qualified
    display:
      consumer:
        title:
          _nunjucks:
            template: "{{ user.profile.name }} qualified the lead"
            on: { user }
```

Pre-hook form:

```yaml
type: qualify
kind: form
hooks:
  submit_edit:
    pre:
      routine:
        - :return:
            event_overrides:
              type: lead-qualified
              display:
                consumer:
                  title:
                    _nunjucks:
                      template: "{{ user.profile.name }} qualified the lead"
                      on: { user }
```

Same body; the wrapping changes. ~3 extra lines of boilerplate per override.

### Case C — both at once

A single `Return` step carries both `status` and `event_overrides`. The pre-hook form is _less_ repetitive than the Layer 2 form (one routine vs. two YAML blocks).

## Trade-offs

### What gets better

- **One channel** — the resolution table for both surfaces collapses (status: 3 → 2 layers; event: 4 → 3 layers).
- **Concept-spec and part-9 docs shrink** — the "which layer wins on collision" prose disappears for Layer 2.
- **Validator surface shrinks** — `makeWorkflowsConfig` drops two field-validators.
- **Resolver bake-in shrinks** — `makeWorkflowApis` stops emitting `interactions:` / `event_overrides:` literals.
- **Pre-hook authors no longer think about Layer 2 collisions** — today a pre-hook returning `status: done` has to reason about a YAML `interactions.submit_edit.status: changes-required` sitting below it in the merge. Gone.
- **Mental model simpler** — the action YAML's engine-facing surface becomes `type`, `kind`, `access`, `blocked_by`, `assignees`, `due_date`, `description`, `key`, `tracker.workflow_type`, `required_after_close`, `hooks`. Nine config fields + one extension channel. No "and also two override maps that change engine behaviour."
- **Net-new runtime enum check on the pre-hook `status` return.** Today there is no enum-membership validation on either the YAML or pre-hook channel — `makeWorkflowsConfig` doesn't inspect `action.interactions[].status` (the field is in the build-time-excluded set and `validateAction` only enum-checks `status_map`), and `makeWorkflowApis.emitInteractions` passes `v.status` through unchanged. A typo on either channel silently ships and `updateAction` writes it. Change #6 adds the first enum check in this pipeline; the throw fires at the merge step before any engine writes.

### What gets worse

- **Static analysability loss for the rare reader who _would_ have written a static override.** Information lives one indirection deeper (inside the `:return:` step) than a top-level `interactions:` map would have surfaced it. Acceptable: the cases this matters in are the same ones we couldn't construct.
- **Per-overridden-interaction Api count grows.** Each new override on an interaction that didn't already declare a pre-hook adds one emitted hook Api (`update-action-{type}-{interaction}-pre`); if the interaction already has a pre-hook for some other reason, the override piggy-backs and adds zero. Per § Use cases considered, real workflows are expected to override rarely — incremental Api count is small in practice.
- **Per-invocation `context.callApi` round-trip.** A submit that previously read a status override from the baked-in endpoint payload now makes one extra in-process `context.callApi` call to a one-line `Return` routine. In-process and cheap. The user's framing — "extra API endpoint cost is negligible" — holds.

## Parts touched

### Cross-cutting impact

| Part                                                                                                    | Status            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Part 4 `makeWorkflowsConfig`](../_completed/04-workflow-config-schema/design.md)                       | shipped           | Drop `interactions:` and `event:` from the per-action schema. Drop their inline validators. No dedicated rejecting-validator — `makeWorkflowsConfig` is a hand-written-checks validator (no Joi/Ajv schema, no unknown-keys rejection), so stale `interactions:`/`event:` fields left on an action YAML will be silently accepted and ignored. Accepted as cheap risk: no real-world users to migrate, and the demo edit in this part removes the only YAML carrying these fields. |
| [Part 9 `hook-invocation`](../09-hook-invocation/design.md)                                             | in progress       | `resolveTargetStatus` drops the layer-2 branch; status resolver becomes 2-layer and adds a runtime enum check on the pre-hook `status` return. `mergeEventOverrides` drops layer 2; event merge becomes 3-layer. Tests for the dropped layers go away.                                                                                                                                                                                                                    |
| [Part 13 `makeWorkflowApis`](../13-resolver-apis/design.md)                                             | tasks 1–2 shipped | Stop emitting `event_overrides:` and `interactions:` literals into the per-action endpoint payload. Drop the `event → event_overrides` rename note.                                                                                                                                                                                                                                                                                                                                |
| Concept spec — [`submit-pipeline/spec.md`](../../../workflows-module-concept/submit-pipeline/spec.md)   | committed         | Status resolution: drop the 3-layer table's Layer 2 row. Event override paths: drop the Layer 2 bullet from "Override paths." Drop the example `action.interactions:` block.                                                                                                                                                                                                                                                                                                       |
| Concept spec — [`action-authoring/spec.md`](../../../workflows-module-concept/action-authoring/spec.md) | committed         | Drop `interactions:` and `event:` from the per-action field list. Update the worked-example YAML accordingly (the `qualify` action already doesn't use overrides per the spec example).                                                                                                                                                                                                                                                                                            |
| Worked-example YAML in the demo app                                                                     | needs edit        | Delete all `interactions:` blocks. Current state: `qualify.yaml` has one (redundant — matches engine default); `send-quote.yaml` has three, two redundant and one (`request_changes: action-required`) non-default that exists only because Layer 2 was there to demonstrate, not because the demo workflow needs that semantic. No pre-hook ports required. (Verified: no `event:` blocks exist in any demo workflow_config — grep returned zero hits.) **Behavioural side effect:** `send-quote`'s `request_changes` flow now writes `changes-required` (engine default) instead of `action-required`. Accepted per § Use cases considered — the static `action-required` override is artifact-of-Layer-2, not a load-bearing demo semantic.                           |

### Migration

No real-world users or implementers. No data migration. No backwards-compatibility shim, no rejecting-validator-with-helpful-message machinery.

The demo worked example currently carries four `interactions:` overrides (one in `qualify.yaml`, three in `send-quote.yaml`); none are load-bearing — they exist because Layer 2 was there to demonstrate, not because the demo workflows are semantically tied to non-default behaviour. All four get deleted; the demo workflows operate on engine defaults afterwards. See § Parts touched for specifics.

The hardest churn is **rewriting cross-referencing design documents** (parts 4, 9, 13 above), all of which already cite "Layer 2" by that label. Parts 4 and 13 are in `_completed/`; per repo convention completed designs are read-only history, so the amendments are documented as notes against the shipped designs (handled by Task 2). Part 9 is still in flight and is edited directly. Each cross-reference needs to be re-checked.

## Out of scope / deferred

- **Page chrome overrides** (`pages.{verb}.{title|buttons|...}`) stay. They're build-time UI composition, not engine-runtime overrides — different concept.
- **`status_map`** stays. Per-stage display copy, no engine-runtime channel.
- **Form schemas** (`form:`, `form_review:`, `form_error:`) stay. They define the action's data contract, not overrides of it.
- **`access:` block** stays. Same reason — it's the source of truth for access, not an override.
- **`hooks:` itself** stays — it's the proposal's replacement channel.
- **Group-level `on_complete:`** stays. Already a pre-hook-shaped routine surface per [part 11](../11-group-on-complete-fanout/design.md); no Layer 2 to drop.

## Depends on

[Part 9 `hook-invocation`](../09-hook-invocation/design.md) — the merge-function and resolver changes amend code part 9 ships. Land _after_ Part 9's first cut, or fold the collapse into Part 9 directly if it's still in flight (saves a round of ship-then-delete on Layer 2). [Part 13 `makeWorkflowApis`](../13-resolver-apis/design.md) — task 2 (which bakes `event_overrides:` and `interactions:` literals) is shipped; this part amends shipped resolver code directly.

**Independent of [Part 29 `error-model-cleanup`](../29-error-model-cleanup/design.md).** Part 29 changes throw classification (drops `hook_error`, drops the mid-write catch-converter, adds `UserError.isReject`). This part doesn't touch any of those surfaces. The throw from change #6 fires before step 4 writes so it pre-dates the catch-converter in either ordering; behaviour is identical pre- and post-Part-29.

## Verification

- `makeWorkflowsConfig` no longer references `interactions:` or `event:` (the inline validators for those fields are gone). Stale fields on an action YAML are silently ignored — verified by reading the resolver, not by a unit test (the validator has no unknown-keys rejection; see § Parts touched).
- `makeWorkflowApis` emits no `event_overrides:` or `interactions:` keys in `properties:` on any per-action endpoint (snapshot the worked-example demo output).
- `resolveTargetStatus` resolves to engine default unless a pre-hook returns `status`.
- `resolveTargetStatus` throws a `UserError(isReject: false)` on a pre-hook `status` return that is not a member of `action_statuses`. Test that no writes have landed when the throw fires (action's `status[0]` unchanged from pre-submit), and that the wrapping endpoint classifies it as `'error'` (not `'reject'`).
- `mergeEventOverrides` is a 3-layer merge (engine default → runtime `comment` → pre-hook).
- Worked-example smoke (in [part 22](../22-workflows-e2e-suite/design.md)): every action with a non-default target status or event payload still produces the same submit-time behaviour after any YAML overrides have been ported to pre-hook routines.

## `_nunjucks` evaluation — equivalence verified

The `_nunjucks` operator inside `display.{app_name}.title` (and the metadata templates the events module ships) is **not evaluated by the workflow engine in any override path**. The operator object travels as a literal through `context.callApi('new-event', module: 'events')` ([dispatchLogEvent.js:106–122](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js)), the events module's [`new-event.yaml`](../../../../modules/events/api/new-event.yaml) inserts it verbatim into MongoDB via `_payload: display`, and the timeline aggregation reads it back as a literal. Final evaluation happens at **page render time** inside the `EventsTimeline` block's `title` prop resolution ([EventsTimeline.js:225](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js) — `sanitize(title)`).

Same destination for the engine default (JS literal in `buildDefaultLogEventPayload`), the dropped Layer 2 path (YAML literal baked into endpoint properties), and the pre-hook path (returning `event_overrides` from a `:return:`). All three produce equivalent stored event documents; bindings are resolved by the timeline block, not by the engine or by the routine that wrote the override. **No scope shim, no documented divergence, no migration concern.**

## Contract to neighbours

- **Part 4** drops two field definitions and their inline validators; updates the schema commit. No dedicated rejecting-validator — `makeWorkflowsConfig` has no unknown-keys mechanism, so stale fields are silently ignored (accepted as cheap risk per § Parts touched / § Migration).
- **Part 9** drops merge layers and tests; adds the runtime `status` enum check in `resolveTargetStatus`.
- **Part 13** stops baking two literals into the per-action endpoint payload.
- **Worked example demo** audited for any `event:` overrides; ports them to inline pre-hooks. Status overrides are not expected to exist.
- **Concept specs** (`submit-pipeline`, `action-authoring`) revise the override-paths sections.
