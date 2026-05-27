# Part 32 — Drop static `interactions.status` override; pre-hook is the only status override channel

**Source rationale:** [workflows-module-concept/submit-pipeline/spec.md § Status resolution](../../../../workflows-module-concept/submit-pipeline/spec.md), revisited under [CLAUDE.md § Principles "One correct way"](../../../../../CLAUDE.md). **Layer:** build-time config + resolvers + engine handlers (cross-cutting cleanup). **Size:** S. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

Today the engine resolves the per-interaction target status across three merge layers: an engine default, an optional static layer baked into the action YAML (`interactions.{interaction}.status`), and an optional pre-hook return. The static YAML layer ("Layer 2") is the only build-time-baked override channel for status. This part drops it: pre-hooks become the single override channel for status.

> **Scope note.** An earlier draft also dropped the action-YAML `event:` block. That has been pulled out — `event:` stays as a build-time override channel for now. The investigation surfaced a related but distinct question (how the user-supplied `comment` interacts with the events module's timeline rendering) that deserves its own design. See [Part 33 — Comment rendering on the events timeline](../../33-comment-rendering/design.md).

## Proposed change

1. **Remove `interactions: { <interaction>: { status: <stage> } }`** from the action YAML schema. The status resolver collapses from three layers to two: engine default per interaction, then pre-hook return `status`.
2. **Drop the resolver's bake-in of the `interactions` map.** `makeWorkflowApis` no longer emits the `interactions:` literal into the per-action endpoint payload. The handler stops reading it from `context.params`.
3. **Drop the resolver's YAML-override branch.** `resolveTargetStatus.js` drops the Layer 2 read and its tests.
4. **Authors needing a different target status write a pre-hook routine** (inline on the action YAML, per [part 13 § Hook emission](../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)). The resolver emits one hook Api per declared `{interaction}.pre` slot — incremental cost is one Api per interaction that didn't already declare a pre-hook (if the override piggy-backs onto an existing pre-hook routine, zero new Apis).
5. **`resolveTargetStatus` runtime-validates the pre-hook `status` return** against `action_statuses` and throws on miss. The check fires inside the second `resolveTargetStatus` invocation in `handleSubmit` (after step 2 pre-hook invocation, before step 4 writes) so no engine writes have landed; the action doc is unchanged. Pre-hook side effects re-run on retry per the [Part 29 § D6](../29-error-model-cleanup/design.md) idempotency contract — pre-hook authors own retry safety; this throw doesn't create a new exposure. Throw shape: `UserError` with `isReject: false` (default) — per [Part 29 § D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently), the wrapping endpoint's `runRoutine` classifies it as `{ status: 'error' }` and the calling app's `CallApi` sees a transient error. Not `:reject` — a misspelled status enum is a workflow-author bug, not user-facing validation the submitting user can fix.

## Why this is being considered

The repo principle ([CLAUDE.md § Principles "One correct way"](../../../../../CLAUDE.md)) says: prefer mechanically enforced patterns over conventions, even if it means more scaffolding up front, because understanding multiple implementations costs more than writing one. Today there are two ways to alter the per-interaction target status: a static YAML map (Layer 2) and a pre-hook return (Layer 3). For any author writing a workflow, knowing which to reach for is a documentation-and-experience problem we'd be removing. Concretely, the cleanup:

- Removes one field and its inline validator from the action YAML schema (`interactions:`) in [part 4 `makeWorkflowsConfig`](../04-workflow-config-schema/design.md).
- Removes one literal from the per-action endpoint payload emitted by [part 13 `makeWorkflowApis`](../13-resolver-apis/design.md).
- Removes one layer from the status resolver in [part 9 `hook-invocation`](../09-hook-invocation/design.md).
- Removes the `interactions:` discussion from the action-authoring concept spec.

## Use cases considered — does the static status override earn its keep?

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
| `submit_edit`     | "Skip review even though `review` is in access verbs" — the canonical example in [submit-pipeline/design.md:177](../../../../workflows-module-concept/submit-pipeline/design.md). But this is contradictory: if you don't want review on submit, drop `review` from `access.{app_name}`. Override exists only if reviewers reach the action via some _other_ path — workflow shape I cannot find in real use cases.                                                                                                                         | Not a real case — better fix is `access` verb list.    |
| `approve`         | Multi-stage approval (first approver → stays in `in-review` for second approver; second approver → `done`). Real pattern.                                                                                                                                                                                                                                                                                                                                                                                                                | Conditional on _who_ approved → pre-hook, not static.  |
| `request_changes` | "Send all the way back to draft" (write `action-required` instead of `changes-required`). Distinct semantics, but I cannot find a workflow where this is a static per-action decision rather than a per-incident reviewer judgment. The demo's `send-quote.yaml` declares `request_changes: action-required` statically, but inspection shows this is an artifact of Layer 2 being available to demonstrate, not a semantic the demo workflow needs — the demo is happy with the engine default `changes-required` once Layer 2 is gone. | Conditional on reviewer intent → pre-hook, not static. |
| `not_required`    | The default _is_ the verb. Nothing to override.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No case.                                               |
| `resolve_error`   | Land the recovery somewhere other than the normal flow's `submit_edit` target. Cannot construct a substantive case.                                                                                                                                                                                                                                                                                                                                                                                                                      | No case.                                               |

**Result:** every override case I could construct is either (a) a misconfigured `access.{app_name}` verb list — real fix is to change the verb list, not the override — or (b) genuinely conditional logic that is properly a pre-hook anyway. The engine defaults are complete for the cases that exist.

Confirming evidence: the concept design's worked example explicitly notes ([workflows-module-concept/design.md:137](../../../../workflows-module-concept/design.md)) that the `qualify` action "declares no `interactions:` block, so the engine uses defaults." The canonical worked example doesn't use the override.

**Conclusion:** Layer 2 for status has no real-world cases. Drop it.

## What the rewrite looks like

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

## Trade-offs

### What gets better

- **One channel for status** — the status resolution table collapses (3 → 2 layers).
- **Concept-spec and part-9 docs shrink** — the "which layer wins on collision" prose disappears for the status Layer 2.
- **Validator surface shrinks** — `makeWorkflowsConfig` drops one field-validator.
- **Resolver bake-in shrinks** — `makeWorkflowApis` stops emitting the `interactions:` literal.
- **Pre-hook authors no longer think about Layer 2 collisions on status** — today a pre-hook returning `status: done` has to reason about a YAML `interactions.submit_edit.status: changes-required` sitting below it in the merge. Gone.
- **Net-new runtime enum check on the pre-hook `status` return.** Today there is no enum-membership validation on either the YAML or pre-hook channel — `makeWorkflowsConfig` doesn't inspect `action.interactions[].status` (the field is in the build-time-excluded set and `validateAction` only enum-checks `status_map`), and `makeWorkflowApis.emitInteractions` passes `v.status` through unchanged. A typo on either channel silently ships and `updateAction` writes it. Change #5 adds the first enum check in this pipeline; the throw fires at the merge step before any engine writes.

### What gets worse

- **Static analysability loss for the rare reader who _would_ have written a static override.** Information lives one indirection deeper (inside the `:return:` step) than a top-level `interactions:` map would have surfaced it. Acceptable: the cases this matters in are the same ones we couldn't construct.
- **Per-overridden-interaction Api count grows.** Each new status override on an interaction that didn't already declare a pre-hook adds one emitted hook Api (`update-action-{type}-{interaction}-pre`); if the interaction already has a pre-hook for some other reason, the override piggy-backs and adds zero. Per § Use cases considered, real workflows are expected to override rarely — incremental Api count is small in practice.
- **Per-invocation `context.callApi` round-trip.** A submit that previously read a status override from the baked-in endpoint payload now makes one extra in-process `context.callApi` call to a one-line `Return` routine. In-process and cheap.

## Parts touched

### Cross-cutting impact

| Part                                                                                                    | Status            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Part 4 `makeWorkflowsConfig`](../04-workflow-config-schema/design.md)                       | shipped           | Drop `interactions:` from the per-action schema. Drop its inline validator. No dedicated rejecting-validator — `makeWorkflowsConfig` is a hand-written-checks validator (no Joi/Ajv schema, no unknown-keys rejection), so a stale `interactions:` field left on an action YAML will be silently accepted and ignored. Accepted as cheap risk: no real-world users to migrate, and the demo edit in this part removes the only YAMLs carrying these fields. |
| [Part 9 `hook-invocation`](../09-hook-invocation/design.md)                                             | shipped           | Add a top-of-file deviation note pointing at Part 32 (matching the Parts 4 and 13 pattern). The code change — `resolveTargetStatus` drops the layer-2 branch, the status resolver becomes 2-layer, and a runtime enum check fires on the pre-hook `status` return — happens in Task 4; Part 9's design body is not rewritten.                                                                                                                                |
| [Part 13 `makeWorkflowApis`](../13-resolver-apis/design.md)                                             | tasks 1–2 shipped | Stop emitting the `interactions:` literal into the per-action endpoint payload.                                                                                                                                                                                                                                                                                                                                                                              |
| Concept spec — [`submit-pipeline/spec.md`](../../../../workflows-module-concept/submit-pipeline/spec.md)   | committed         | Status resolution: drop the 3-layer table's Layer 2 row. Drop the example `action.interactions:` block.                                                                                                                                                                                                                                                                                                                                                      |
| Concept spec — [`action-authoring/spec.md`](../../../../workflows-module-concept/action-authoring/spec.md) | committed         | Drop `interactions:` from the per-action field list.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Worked-example YAML in the demo app                                                                     | needs edit        | Delete all `interactions:` blocks. Current state: `qualify.yaml` has one (redundant — matches engine default); `send-quote.yaml` has three, two redundant and one (`request_changes: action-required`) non-default that exists only because Layer 2 was there to demonstrate, not because the demo workflow needs that semantic. No pre-hook ports required. **Behavioural side effect:** `send-quote`'s `request_changes` flow now writes `changes-required` (engine default) instead of `action-required`. Accepted per § Use cases considered — the static `action-required` override is artifact-of-Layer-2, not a load-bearing demo semantic. |

### Out of scope (was previously in scope; pulled out)

- **Action-YAML `event:` block** — stays. The investigation surfaced a related rendering question (whether the user-supplied `comment` should flow into the events timeline's secondary-text channel, and how that interacts with template scoping) that needs its own design before deciding whether the static channel can be safely retired. Tracked under [Part 33 — Comment rendering on the events timeline](../../33-comment-rendering/design.md).

### Migration

No real-world users or implementers. No data migration. No backwards-compatibility shim, no rejecting-validator-with-helpful-message machinery.

The demo worked example currently carries four `interactions:` overrides (one in `qualify.yaml`, three in `send-quote.yaml`); none are load-bearing — they exist because Layer 2 was there to demonstrate, not because the demo workflows are semantically tied to non-default behaviour. All four get deleted; the demo workflows operate on engine defaults afterwards. See § Parts touched for specifics.

The hardest churn is **rewriting cross-referencing design documents** (parts 4, 9, 13 above), all of which already cite "Layer 2" by that label. All three are in `_completed/`; per repo convention completed designs are read-only history, so the amendments are documented as top-of-file deviation notes against the shipped designs (handled by Task 2). Each cross-reference needs to be re-checked.

## Out of scope / deferred

- **Action-YAML `event:` block.** See § Out of scope above. Tracked under Part 33.
- **Page chrome overrides** (`pages.{verb}.{title|buttons|...}`) stay. They're build-time UI composition, not engine-runtime overrides — different concept.
- **`status_map`** stays. Per-stage display copy, no engine-runtime channel.
- **Form schemas** (`form:`, `form_review:`, `form_error:`) stay. They define the action's data contract, not overrides of it.
- **`access:` block** stays. Same reason — it's the source of truth for access, not an override.
- **`hooks:` itself** stays — it's the proposal's replacement channel.
- **Group-level `on_complete:`** stays. Already a pre-hook-shaped routine surface per [part 11](../../11-group-on-complete-fanout/design.md); no Layer 2 to drop.

## Depends on

[Part 9 `hook-invocation`](../09-hook-invocation/design.md) — shipped; this part amends the resolver code that Part 9 landed (the layer-2 branch in `resolveTargetStatus`). [Part 13 `makeWorkflowApis`](../13-resolver-apis/design.md) — task 2 (which bakes the `interactions:` literal) is shipped; this part amends shipped resolver code directly.

**Independent of [Part 29 `error-model-cleanup`](../29-error-model-cleanup/design.md).** Part 29 changes throw classification (drops `hook_error`, drops the mid-write catch-converter, adds `UserError.isReject`). This part doesn't touch any of those surfaces. The throw from change #5 fires before step 4 writes so it pre-dates the catch-converter in either ordering; behaviour is identical pre- and post-Part-29.

## Verification

- `makeWorkflowsConfig` no longer references `interactions:` (the inline validator for that field is gone). Stale fields on an action YAML are silently ignored — verified by reading the resolver, not by a unit test (the validator has no unknown-keys rejection; see § Parts touched).
- `makeWorkflowApis` emits no `interactions:` keys in `properties:` on any per-action endpoint (snapshot the worked-example demo output).
- `resolveTargetStatus` resolves to engine default unless a pre-hook returns `status`.
- `resolveTargetStatus` throws a `UserError(isReject: false)` on a pre-hook `status` return that is not a member of `action_statuses`. Test that no writes have landed when the throw fires (action's `status[0]` unchanged from pre-submit), and that the wrapping endpoint classifies it as `'error'` (not `'reject'`).
- Worked-example smoke (in [part 22](../../22-workflows-e2e-suite/design.md)): every action with a non-default target status still produces the same submit-time behaviour after any YAML overrides have been ported to pre-hook routines.

## Contract to neighbours

- **Part 4** drops one field definition and its inline validator; updates the schema commit. No dedicated rejecting-validator — `makeWorkflowsConfig` has no unknown-keys mechanism, so stale fields are silently ignored (accepted as cheap risk per § Parts touched / § Migration).
- **Part 9** drops the status merge layer and its tests; adds the runtime `status` enum check in `resolveTargetStatus`.
- **Part 13** stops baking the `interactions:` literal into the per-action endpoint payload.
- **Worked example demo** audited for `interactions:` blocks; all are deleted.
- **Concept specs** (`submit-pipeline`, `action-authoring`) revise the status-resolution section and drop the `interactions:` field documentation.
