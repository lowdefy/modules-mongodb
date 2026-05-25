# Review 1 — Workflows Module (parent-level, post-submit-pipeline)

Critical review of `designs/workflows-module/design.md`, `spec.md`, and the seven sub-design `design.md` / `spec.md` files. Triggered by the submit-pipeline review + consistency cycle that committed substantial cross-design changes (engine-orchestrated lifecycle, per-action endpoints, pre/post hooks, flat `form_data`, hook auth rule). The parent docs were updated in consistency-2; this review focuses on **sibling sub-design files that still describe the v0 shape** and on **internal contradictions / semantic bugs** the parent rewrite didn't catch.

Two prior parent-level reviews (`review-sam-1.md`, `review-steph-1.md`) are topical / annotated already; this is the first systematic numbered review at parent scope.

## Cross-design drift (sibling sub-designs still describe v0 shape)

### 1. Engine sub-design still names the handler `UpdateWorkflowActions`

> **Resolved.** Renamed `UpdateWorkflowActions` → `SubmitWorkflowAction` throughout engine/design.md (~26 references) and engine/spec.md (~11 references): connection-structure directory, handler function signature, payload contract block, pseudo-code, tracker-subscription mechanism, idempotency story, 2-level nested auto-complete worked example, Risks list, ordering section. Article-grammar fixed where the rename created "an `SubmitWorkflowAction`" artifacts. Also tied off the dangling `submit-action` references that the rename exposed: spec.md replaced `submit-action`'s `payload.action_id` aliasing with "the per-action endpoint passes `action_id` straight through"; access enforcement, idempotency, payload-shape descriptions, and the cross-module-resolution risk all rephrased to refer to the handler directly. design.md analogous fixes: the worked-example trace now runs via `update-action-install-device` with `interaction: approve`, the `currentActionId` source is the per-action endpoint's payload, the recovery path uses `interaction: resolve_error` (matching #7's rename), and the author-driven error path is the pre-hook `hook_error` abort (matching submit-pipeline Decision 4). Engine files are now self-consistent with the new submit-pipeline shape.

The parent design + spec, action-groups, submit-pipeline, and call-api all use `SubmitWorkflowAction` as the canonical handler name. Submit-pipeline Decision 1 explicitly says the engine handler is **renamed**: "`UpdateWorkflowActions` → `SubmitWorkflowAction`."

But `engine/design.md` and `engine/spec.md` are completely unrenamed:

- [engine/spec.md:14-15](../engine/spec.md): `UpdateWorkflowActions/` directory; `UpdateWorkflowActions.js`.
- [engine/spec.md:62](../engine/spec.md): `async function UpdateWorkflowActions({ request, connection })`.
- [engine/spec.md:165-184](../engine/spec.md): the entire `UpdateWorkflowActions` payload contract, capabilities, and ordering section.
- [engine/spec.md:225, 263, 274, 276, 278, 297, 317](../engine/spec.md): handler references throughout the tracker subscription, idempotency, ordering, worked example.
- [engine/design.md](../engine/design.md): mirror set — `UpdateWorkflowActions` appears in Decision 1, Decision 3 pseudo-code, Decision 4 priority rule, the 2-level nested auto-complete worked example, and the Risks list.

**Why this matters:** the engine sub-design owns the handler implementation. Readers entering from the engine doc never see the rename; the parent doc commits to the new name in invariants and the worked example but the engine doc contradicts it. Implementation tasks generated from the engine sub-design would scaffold `UpdateWorkflowActions/` directories that immediately fight the submit-pipeline name commitment.

**Fix:** Rename `UpdateWorkflowActions` → `SubmitWorkflowAction` throughout `engine/design.md` and `engine/spec.md`, including the connection structure directory name, the handler function signature, every payload contract reference, the pseudo-code, the worked example trace, and the Risks bullets. Add one line at the top of engine D1 stating the handler is what submit-pipeline introduces; the engine doc owns the request-handler implementation contract.

### 2. Engine D5 and module-surface still reference `submit-action` as the user-submit path

> **Resolved.** Engine side was handled with #1 (the `submit-action` references in engine files were retired alongside the `UpdateWorkflowActions` → `SubmitWorkflowAction` rename). Module-surface got a substantial rewrite: dropped the entire `submit-action` API (the manifest `api:` export, the static `_ref: api/submit-action.yaml`, Decision 2's table row + "Why one submit endpoint" rationale, and Decision 5's ~150-line payload contract + routine YAML + composition-error semantics + "Why not helpers" section). Replaced with a one-paragraph Decision 5 pointing at submit-pipeline plus a "Submit endpoints (owned by submit-pipeline)" note in Decision 2. Added the `makeWorkflowApis` resolver `_ref` in the manifest `api:` array so the per-action endpoints actually get emitted at build time. Updated the module description, opening framing, dependency descriptions (events / notifications now described via `context.callApi` from the handler, notifications dispatch is always-on per the #8 resolution), and the Risks bullet on submit-endpoint surface stability. module-surface/spec.md mirrors the same edits — Decision 5 content collapsed to a brief "Submit endpoints" pointer, manifest `api:` export list updated, Risk bullet tightened.

Engine sub-design and module-surface still describe `submit-action` as a routine-orchestrated module API:

- [engine/spec.md:149](../engine/spec.md): "Submit-hook routine calls `submit-action` with `current_status: error`" — `submit-action` no longer exists.
- [engine/spec.md:153](../engine/spec.md): "Recovery. A normal `submit-action` call from the `-error` page" — same.
- [engine/spec.md:168](../engine/spec.md): "`submit-action` re-checks role gate before writes" — the engine handler does this directly now.
- [engine/spec.md:263](../engine/spec.md): "the four `submit-action` routine steps tolerate re-runs (the leaky steps are `new_event` and `notify`)" — the four-step routine doesn't exist.
- [engine/spec.md:274](../engine/spec.md): "`currentActionId` is aliased from `submit-action`'s `payload.action_id`" — submit-pipeline's per-action endpoint shape uses `action_id` directly; no aliasing layer.
- [engine/spec.md:329](../engine/spec.md): Risk list "Cross-module endpoint resolution inside `submit-action`" — needs to be reframed as inside the engine handler via `context.callApi`.
- [module-surface/design.md](../module-surface/design.md): entire Decision 5 "`submit-action` payload contract" (~150 lines), Decision 1 manifest exports listing `submit-action`, the worked example showing `qualify-submit-hook.yaml` calling `submit-action`, the "How `submit-action` runs" sub-section, the dependencies/notifications/error-semantics framing.
- [module-surface/spec.md](../module-surface/spec.md): mirror set — manifest exports + Decision 4 "`submit-action` payload contract" + the notifications dispatch contract.

Submit-pipeline's cross-ref section names "module-surface drops `submit-action`" as a follow-up. consistency-2 flagged this as out-of-scope for parent-level cleanup. But the drift is real: anyone implementing module-surface or engine from these files will write code that the parent design + submit-pipeline say doesn't exist.

**Fix:** Engine sub-design needs to be rewritten to align with submit-pipeline:

- Drop `submit-action` references; replace with "the engine handler" or `SubmitWorkflowAction` directly.
- D5 (form data layout) "Recovery" subsection — the engine handler is the recovery path now, not a routine call.
- The Risks bullet on cross-module endpoint resolution becomes "cross-module API invocation from the engine handler via `context.callApi`" (matches the parent design Risks bullet now).

Module-surface sub-design needs a substantial rewrite:

- Drop the `submit-action` API entirely (Decision 4 + the routine YAML).
- Drop the manifest's `submit-action` export.
- Replace with a brief pointer at submit-pipeline for the per-action endpoint shape (`update-action-{action_type}`).
- Add `get-workflow-overview` to the manifest exports if it's not already there.
- Update the worked example's `modules.yaml` walkthrough.

### 3. Action-authoring sub-design doesn't document `hooks:`, `interactions:`, or `event:` blocks

> **Resolved.** Rewrote `makeWorkflowApis` (Decision 6) in both action-authoring/design.md and action-authoring/spec.md to emit `update-action-{action_type}` endpoints with the new build-time-literal `hooks:`, `event_overrides:`, and `interactions:` payload fields. The hook auth gate (`hook.auth.roles ⊇ action.access.roles`, reject `auth.public: true`) is now documented in the resolver's build-time validation in both files. The worked-example YAML for `qualify.yaml` now declares `hooks: { submit_edit: { pre: ... } }` instead of `submit_hook:`. All ~40 stale references (Submit API surface in Decision 2, role-gate check at submit-time, universal fields routing, error-status entry path, instanced-action spawning, the resolver pipeline table) updated to point at the new shape — `submit-action` removed from action-authoring's design and spec entirely. Cross-references throughout point at submit-pipeline Decisions 2–4 for the canonical contracts.

The action-authoring sub-design is the canonical place for action YAML grammar, but it still describes the v0 authoring vocabulary:

- [action-authoring/design.md:113](../action-authoring/design.md): `submit_hook: workflow_config/onboarding/api/qualify-submit-hook.yaml` in the worked example.
- [action-authoring/design.md](../action-authoring/design.md) Decision 6 "`makeWorkflowApis` — the per-action endpoint generator" still describes `{workflow_type}-{action_type}-submit` endpoints with `_ref`'d `submit_hook`.
- [action-authoring/spec.md](../action-authoring/spec.md): "Submit API surface: form → `submit-action` ..." in the verb table; the `submit_hook` field shape; the routing-by-verb that submit-pipeline replaces with `interaction:`.

Submit-pipeline's cross-ref names three grammar additions: `hooks:` block (per-interaction pre/post API ids), `interactions:` block (per-interaction `status:` overrides), `event:` block (per-interaction log-event overrides). action-authoring has none of these documented in its grammar section.

**Fix:** Rewrite action-authoring Decision 4 (action-authoring vocabulary) to:

- Remove `submit_hook:` from the action YAML grammar.
- Add `hooks:` per-interaction map (Decision 4 of submit-pipeline).
- Add `interactions:` per-interaction `status:` override map (Decision 3 of submit-pipeline).
- Add `event:` per-interaction log-event override map (Decision 5 of submit-pipeline).
- Rewrite Decision 6 (`makeWorkflowApis`) to emit `update-action-{action_type}` per form / task action with the build-time-baked `hooks`, `event_overrides`, `interactions` payload fields.

Cross-ref the build-time validation rules (the `hook.auth.roles ⊇ action.access.roles` check is already in action-authoring/spec.md line 103, but the design.md side doesn't have it).

### 4. UI sub-design doesn't ship the five-button vocabulary or describe template-button wiring

> **Resolved.** Added a new "Template-shipped button vocabulary" subsection to both ui/design.md Decision 2 and ui/spec.md "Templates shipped by the module" — with the full vocabulary table (button name, template, `interaction` value, author event handler fired, engine target-status default) and the click-sequence contract (fire `pages.{verb}.events.{handler}` first for page-state work, then call `update-action-{action_type}` with the `interaction` value). design.md gains an illustrative block-tree shape so readers see how the template wires the CallApi step. Rewrote the form-action template descriptions, the error-template recovery-button description, the task-action page descriptions, and all `submit-action` wording across both files. Per-action page YAML (`status_map`, role checks, status-selector hides) now refers to the per-action endpoint or the `SubmitWorkflowAction` handler depending on context. Action verbs (`onSubmit`, `onApprove`, `onRequestChanges`) stay separate from the engine call per the explicit two-step click sequence — fixes the "what's left for `onSubmit` to do" ambiguity raised earlier and aligns with action-authoring Decision 8 + submit-pipeline Decision 3.

Submit-pipeline Decision 3 commits the templates to ship five buttons (`submit_edit`, `not_required`, `submit_error`, `approve`, `request_changes`), each wired to the per-action endpoint with a different `interaction` value. The ui sub-design's template descriptions are pre-submit-pipeline:

- [ui/design.md:104](../ui/design.md) Decision 2 "Page templates (sketch)" still says "Approve calls `submit-action` with `current_status: done`; Request Changes calls it with `current_status: changes-required`."
- [ui/spec.md:64](../ui/spec.md): "`templates/review.yaml.njk` — read-only form display + approve / request-changes affordances. Approve → `submit-action` with `current_status: done`; Request Changes → `current_status: changes-required`." Submit-pipeline replaces this — there's no `submit-action`; the buttons call `update-action-{action_type}` with `interaction: approve` / `request_changes` and the engine resolves the target status.
- [ui/design.md:251-260](../ui/design.md): event-handler example shows `onSubmit` calling `endpointId: my-team-app-initial-details-submit` directly — but the template button now does the CallApi wiring itself per submit-pipeline (the event handler is only for page-state work).
- [ui/spec.md](../ui/spec.md): same drift in the Decision 4 vocabulary section.

**Fix:** Update ui Decision 2 and the spec's templates section to describe the five-button vocabulary as template-shipped blocks. Update the event-handler examples to clarify that `onSubmit` / `onApprove` / `onRequestChanges` are author-supplied page-state hooks fired _before_ the template button's CallApi step, not the CallApi step itself. The Click sequence is `(1) page-state handler → (2) template-shipped CallApi to update-action-{action_type} with the right interaction → (3) navigation`. Add the explicit mapping between buttons, `pages.{verb}.events` handlers, and the per-action endpoint.

### 5. Action-groups sub-design still describes `UpdateWorkflowActions` and `submit-action` as the orchestration layer

> **Resolved.** Renamed `UpdateWorkflowActions` → `SubmitWorkflowAction` throughout action-groups/design.md (~18 references) and action-groups/spec.md (~10 references) — section headings, return-value references, recursion-bound note. Rewrote Decision 6 in design.md and the matching `on_complete` invocation section in spec.md to commit to engine-internal fan-out as step 11 of the submit-pipeline lifecycle (one orchestrator, one lifecycle, one error-capture surface) rather than the previous "outer Layer-1 routine step" framing. Kept one intentional historical reference to "Earlier drafts framed the fan-out as a Layer 1 routine step" in design.md to preserve the rationale. The worked-example runtime sequence now walks the `update-action-send-quote` per-action endpoint → `SubmitWorkflowAction` lifecycle (steps 1-13 in order) instead of the v0 `submit-action` routine. Cross-ref to module-surface in "Interaction with the other sub-designs" updated — the operational `get-entity-workflows` / `get-workflow-overview` return `groups[]`; submit-pipeline owns step 11. Open Question 1 reframed from "Fanout primitive at Layer 1" to "api-hooks follow-up refinements" since the fan-out mechanism is no longer open. Risks bullet for `on_complete` retry duplication updated to refer to lifecycle step numbers instead of `submit-action` routine steps.

The action-groups sub-design carries 11 references to `UpdateWorkflowActions` and `submit-action` ([action-groups/spec.md:89, 95, 123, 131, 132, 139, 143, 147, 157, 167](../action-groups/spec.md); also action-groups/design.md throughout). Examples:

- spec.md:95: "## Engine flow inside `UpdateWorkflowActions`" — the section heading is the old handler name.
- spec.md:131: "`UpdateWorkflowActions` returns `completed_groups`. Each entry carries the `on_complete` path declared in YAML (or null)." — name needs to be `SubmitWorkflowAction`.
- spec.md:139: "`submit-action`'s routine `CallApi`s each" — the routine doesn't exist.
- spec.md:167: "If `submit-action` retries mid-routine after `UpdateWorkflowActions` succeeded but before the hook-invocation step ran" — both names superseded.

Submit-pipeline Decision 6 commits the `on_complete` fan-out to happen inside `SubmitWorkflowAction` itself (step 11 of the lifecycle), not in a separate `submit-action` routine step.

**Fix:** Rename `UpdateWorkflowActions` → `SubmitWorkflowAction` throughout action-groups. Drop references to "submit-action's routine" — the fan-out is engine-internal (step 11 of submit-pipeline Decision 1). Update Decision 6 to align with submit-pipeline's "engine fires group on_complete pipelines via `context.callApi`" framing instead of "outer Layer-1 mechanism."

## Internal contradictions

### 6. Parent design has two stale "exercises the core four" / "exercises all four" claims

> **Resolved.** Updated design.md:5 to "exercises all seven sub-designs"; updated design.md:306 to match. The closing paragraph of the worked example (line 273) already enumerates the seven; both surrounding sentences now agree.

After the consistency-2 worked-example rewrite, the worked example exercises all seven sub-designs (engine + submit-pipeline + action-groups + call-api now load-bearing). But two surrounding sentences still describe the example as covering four:

- [design.md:5](../design.md): "This parent doc carries the framing, an end-to-end worked example that exercises **the core four**..." — should be seven (or rephrased to match the new closing paragraph).
- [design.md:306](../design.md): "The worked example above exercises **all four**; treat it as the integration smoke test for v1." — same issue.

The closing paragraph at [design.md:273](../design.md) correctly enumerates all seven sub-designs as load-bearing in the example. Lines 5 and 306 contradict that.

**Fix:** Line 5 → "exercises all seven." Line 306 → "exercises all seven sub-designs" (or drop the count and reuse the integration-smoke-test framing).

### 7. `submit_error` interaction's default target status (`error`) is semantically wrong

> **Resolved by renaming.** `submit_error` → `resolve_error`. The button name caused the confusion — it's the "user resolves the error" interaction, not "submit while in error state." With the rename, the interaction → status default cleanly follows `submit_edit`: `in-review` if the action has a `review` verb in any `access.{app_name}` map, else `done`; for task actions, caller-supplied via the status selector. Renamed across submit-pipeline design.md (button table, interaction → status table, hooks map in Decision 2, edge-case bullets in Decision 3 and Open Questions, the action-YAML `hooks:` example comment) and spec.md (button table, interaction → status table, hooks map, Open Questions). Also updated the parent design's worked-example "Build-time output" section that named the five buttons.

Submit-pipeline Decision 3's interaction → status map ([submit-pipeline/design.md:160-166](../submit-pipeline/design.md), [submit-pipeline/spec.md:106-108](../submit-pipeline/spec.md)) maps:

```
| submit_error | error | error |
```

The `submit_error` button is the **recovery submit** on the `-error` page (submit-pipeline Decision 3: "`submit_error` — `error` template (recovery submit)"). The user is on the error page and clicking Submit to fix the broken submission and move forward.

Mapping `submit_error → error` means the recovery submit re-writes `status: error` to the action's status history. That's the opposite of recovery — the user is trying to _leave_ the error stage.

Cross-check against action-authoring Decision 8's authoring shape ([action-authoring/design.md:780-785](../action-authoring/design.md)) and engine D5's recovery contract:

- action-authoring: "the recovery submit routine (recovery is usually a fresh CallAPI to submit-action)" — recovery is a normal forward submit, not a self-loop in `error`.
- engine D5 (updated): "Recovery. A normal `submit-action` call from the `-error` page. On success, engine writes the recovery transition (typically `current_status: done`)."

So the correct default for `submit_error` is one of:

- `done` (the recovery completed the action),
- `in-review` (the action goes back into review after recovery),
- or whatever the equivalent of `submit_edit`'s default is, since recovery is "submit-edit again, having seen the error."

The current `submit_error → error` mapping would either be silently rejected by the priority rule (priority 1 → priority 1 is not strictly less) or re-write the same error stage on every retry.

**Fix:** Change the default in submit-pipeline Decision 3 + spec:

```
| submit_error | same as submit_edit (in-review if review verb exists, else done) | same as submit_edit (caller-supplied) |
```

Document the rationale: `submit_error` is the user clicking "Submit" on the error page; the engine treats it semantically the same as `submit_edit` from the edit page. The difference is which template fires it (error template vs edit template) and which hook gets invoked (`hooks.submit_error.pre/post` vs `hooks.submit_edit.pre/post`); the target status default is shared.

Alternative: define `submit_error` as an explicit recovery interaction that defaults to `done` (assumes the recovery completes the action). Either is defensible; the current "error → error" default is not.

### 8. Notifications dispatch criteria is unspecified in submit-pipeline lifecycle

> **Resolved — always dispatch.** Engine calls `send-notification` on every successful submit; no per-payload opt-in flag. The dispatch decision lives in the notifications module's `send_routine` var (app-supplied) — that routine reads the event doc, resolves recipients, dispatches via whatever channels the app wires. Silent no-op when no `send_routine` is wired. Matches the "engine becomes the orchestrator" framing — no per-call branching on side effects, the app's notifications wiring is the filter. Updated submit-pipeline design Decision 6 (table row + new "When notifications dispatch — always" subsection), spec.md side-effects table row, and the parent design's worked-example runtime flow step. Module-surface still describes the v0 `event.notifications: true` payload flag — that's part of #2 (module-surface rewrite to drop `submit-action`), not this finding's scope.

Submit-pipeline Decision 6 side-effects table says notifications fire "When notification recipients are wired (via the notifications module's `send_routine` var)" ([submit-pipeline/design.md:407](../submit-pipeline/design.md)). Decision 1 lifecycle step 10 says "Dispatch notifications via the notifications module's `send-notification` InternalApi (existing pattern, unchanged)."

But there's no actual criteria for whether the engine dispatches on this submission. The v0 shape had `event.notifications: true` as an opt-in payload flag (module-surface design.md:323). Submit-pipeline drops the `event.notifications` field along with the `submit-action` payload — but doesn't say what replaces it.

Options:

- Always dispatch (the engine calls `send-notification` on every successful submit; the app's `send_routine` decides whether anything happens).
- Per-interaction opt-in via the action YAML `event:` block (e.g. `event.{interaction}.notifications: true`).
- Per-pre-hook return field (`event_overrides.notifications: true`).
- Always dispatch but no-op when no roles wired (current implicit behavior).

The design doesn't pick one.

**Fix:** Decision 6 needs an explicit "When notifications dispatch" subsection. Recommend: **always dispatch on successful submit; the notifications module's `send_routine` is the app's filter.** This matches submit-pipeline's "engine becomes the orchestrator" thesis — moving the dispatch decision out of the per-submit payload and into the app's notifications wiring. Alternative: keep a per-interaction `notifications:` flag on the action's `event:` block, baked into the endpoint at build time like the rest of `event_overrides`. Either way, spell it out.

### 9. Parent design's Next Step still describes a 4-sub-design implementation order

> **Resolved.** Rewrote the Next Step step 2 to list all seven sub-designs with the dependency graph: call-api first (gates submit-pipeline); engine + action-authoring in parallel; action-groups + submit-pipeline after engine + call-api; module-surface + ui alongside submit-pipeline as its consumers.

[design.md:303-305](../design.md): "Sub-designs commit independently; the engine sub-design unblocks plugin work, the module-surface sub-design unblocks app integration, the action-authoring sub-design unblocks workflow authors, and the ui sub-design unblocks page generation."

This lists four sub-designs and skips the three that joined later (action-groups, submit-pipeline, call-api). Submit-pipeline explicitly **gates** on call-api ("Submit-pipeline is gated on call-api landing first" per submit-pipeline Decision 7); action-groups Decision 6 references submit-pipeline as the consumer of `completed_groups`. The implementation order should reflect these dependencies.

**Fix:** Update Next Step to reflect the dependency graph:

1. call-api lands first (gates submit-pipeline).
2. engine sub-design ships in parallel with action-authoring (no inter-dependency).
3. action-groups + submit-pipeline land after engine + call-api.
4. module-surface + ui ship alongside submit-pipeline (they're its consumers).

Or simpler: cross-reference the implementation-order section in submit-pipeline + action-groups, which already have the dependency story.

## Spec-only issues

### 10. Parent spec invariant on `force: true` mis-states the v1 surface

> **Resolved.** Updated spec.md invariant on the priority rule to list both `force` surfaces — per-call on the `SubmitWorkflowAction` payload (engine D4 + migrations/admin tools) and per-entry on individual `actions[]` entries (submit-pipeline pre-hook replay/rollback). Engine D4 remains the canonical contract.

[spec.md:26](../spec.md): "Status transitions follow a priority rule. A new status's priority must be strictly less than the current. Exceptions: `currentActionId` self-exception (same-stage allowed for the submitted action), **`force: true` per-call override**."

But submit-pipeline review-1 #8 added **per-entry `force`** on pre-hook `actions[]`. Engine D4 was updated to compose per-call OR per-entry. The parent spec invariant should mention both surfaces or stay generic ("`force: true` override at the engine layer; submit-pipeline pre-hooks may set per-entry `force` on `actions[]`").

**Fix:** Either "`force: true` per-call or per-entry override (engine D4; pre-hook `actions[].force` per submit-pipeline)" — or drop the parenthetical and let engine D4 own the full contract.

### 11. Parent spec line 3 references "the four sub-design `design.md` files"

> **Resolved.** Changed "four sub-design `design.md` files" to "seven sub-design `design.md` files" at spec.md:3.

[spec.md:3](../spec.md): "Full rationale in [design.md](designs/_completed/activities/design.md) and the four sub-design `design.md` files; this file carries only the committed decisions."

Stale — there are seven sub-designs now.

**Fix:** "Full rationale in [design.md](designs/_completed/activities/design.md) and the seven sub-design `design.md` files."

## Summary

- **5 cross-design drifts (rewrites needed in sibling sub-designs):** #1 engine handler rename, #2 engine + module-surface `submit-action` removal, #3 action-authoring `hooks:` / `interactions:` / `event:` grammar, #4 ui five-button vocabulary, #5 action-groups handler name + Decision 6 alignment.
- **2 internal contradictions in parent design:** #6 stale "core four" counts, #9 stale Next Step implementation order.
- **1 semantic bug (submit-pipeline):** #7 `submit_error → error` default is wrong.
- **1 unspecified contract:** #8 notifications dispatch criteria.
- **2 spec hygiene fixes:** #10 `force` invariant scope, #11 stale sub-design count.

Critical path before implementation:

- **#1, #2, #3, #4, #5** are sub-design rewrites blocking implementation of those sub-designs against the new shape. Without these, generated tasks would target dead surfaces.
- **#7, #8** are missing semantics in submit-pipeline that any author wiring `submit_error` or notifications today will hit immediately.
- **#6, #9, #10, #11** are documentation tightening.
