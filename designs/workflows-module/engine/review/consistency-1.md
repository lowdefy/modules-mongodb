# Consistency Review 1

## Summary

Scanned the full workflows-module design tree (parent + four sub-designs + engine review-1) after the engine sub-design's first action-review pass introduced ten substantive edits. Found three drifts in sibling sub-designs (action-authoring × 1, module-surface × 2) — all auto-resolved by propagating the engine's review decisions forward.

## Files Reviewed

**Parent:**

- [designs/workflows-module/design.md](../../design.md)

**Sub-designs:**

- [designs/workflows-module/engine/design.md](../design.md) (source of truth — just-revised)
- [designs/workflows-module/module-surface/design.md](../../module-surface/design.md)
- [designs/workflows-module/action-authoring/design.md](../../action-authoring/design.md)
- [designs/workflows-module/ui/design.md](../../ui/design.md)

**Reviews:**

- [designs/workflows-module/engine/review/review-1.md](review-1.md) — 12 findings, all annotated as resolved

**Tasks / plans:** None yet — no `tasks.md`, `tasks/`, or `plan/` directories exist for this design.

## Inconsistencies Found

### 1. Stale tracker-query example in action-authoring

**Type:** Design-vs-Design (across sub-designs)
**Source of truth:** Engine sub-design "Reverse-lookup index" (per review-1 finding #4 resolution)
**Files affected:** [action-authoring/design.md](../../action-authoring/design.md) line 162
**Resolution:** Updated the example to drop the `"tracker.workflow_type": "device-installation"` filter (engine now ships partial index `{ key: 1 }` filtered on `tracker.workflow_type: { $exists: true }`, and the query uses just `{ key: <child workflow_id> }` because workflow `_id`s are globally unique). Added a one-sentence pointer to engine sub-design "Reverse-lookup index" so the rationale isn't duplicated.

### 2. `keys: []` footgun missing from module-surface payload contract

**Type:** Design-vs-Design (across sub-designs)
**Source of truth:** Engine sub-design Decision 1 capabilities bullet + Risks entry (per review-1 finding #6 resolution)
**Files affected:** [module-surface/design.md](../../module-surface/design.md) Decision 4 "Action entries always use `keys: [...]`"
**Resolution:** Appended a "Footgun: `keys: []` is silent" paragraph under the behaviour table — explains the `_array.map`-over-empty-payload trap, points at `skip` / `_if` on `keys.length` as the author-side mitigation, and notes the purely-additive `allowEmpty: true` upgrade path. The consumer-facing payload spec is where most authors will look for `keys` semantics, so the warning needs to live here too, not only in the engine sub-design.

### 3. `force: true` is documented in engine but absent from `submit-action` payload — needs explicit "intentional absence" note

**Type:** Design-vs-Design (across sub-designs)
**Source of truth:** Engine sub-design Decision 4 (per review-1 finding #7 resolution)
**Files affected:** [module-surface/design.md](../../module-surface/design.md) Decision 4 payload spec
**Resolution:** Added a "No `force` field on `submit-action`" paragraph after "Form-action submit shape." Explains that `UpdateWorkflowActions` accepts `force: true` at the plugin layer (migrations / admin tools), but `submit-action` is the user-submit path and deliberately doesn't expose the escape hatch — privileged callers bypass `submit-action` and call `UpdateWorkflowActions` directly via a gated route. Prevents the asymmetry from being read as drift.

## No Issues

The following were checked and found consistent — listed to confirm coverage:

- **Parent design Risks** ([design.md:265-271](../../design.md)) — already updated during the action review to include the new "No transactional atomicity in v1" risk and the reframed "Plugin dual-runtime build complexity." No further drift.
- **Parent design worked example** ([design.md:236-247](../../design.md)) — uses lead-onboarding → device-installation; consistent with engine's new 2-level worked example, no contradictions.
- **`currentActionId` aliasing** — engine Decision 4 documents the alias; module-surface routine ([module-surface/design.md:322](../../module-surface/design.md)) actually performs it (`currentActionId: { _payload: action_id }`). Implementation matches spec.
- **`eventId` vs `event_id` naming** — engine pseudo-code uses camelCase `eventId` (plugin-side payload field name); module-surface routine uses snake_case `event_id` for `:set_state:` and maps it to `eventId: { _state: event_id }` at the boundary ([module-surface/design.md:323](../../module-surface/design.md)). Intentional split, consistent on both sides.
- **`fields` block is "atomic with status transition"** ([module-surface/design.md:316](../../module-surface/design.md)) — means same `$set` in the same Mongo `updateOne`, which the engine's shared-client model still guarantees. Not a transactional claim; consistent with the new no-transactions-in-v1 framing.
- **UI's `force: true` UX note** ([ui/design.md:182](../../ui/design.md)) — "`force: true` overrides aren't typically exposed through the UI." Consistent with engine's "migrations and admin tools" framing and module-surface's intentional omission of `force` from the user-facing payload.
- **Entity-agnostic field shape** — scalar `entity_type` + `entity_id` used consistently across parent design, engine, module-surface, and action-authoring. The promotion to a named sub-section in engine (review-1 finding #10) was a prominence change, not a behaviour change; no propagation needed.
- **Action-authoring `makeWorkflowApis` scope** ([action-authoring/design.md:262](../../action-authoring/design.md)) — "Form actions only; task actions don't get per-action endpoints; sub-workflow actions don't have endpoints at all" — consistent with engine's tracker-writes-its-own-status model.

## Open Questions

None. All consistency drift was auto-resolved by propagating engine review-1 decisions forward.
