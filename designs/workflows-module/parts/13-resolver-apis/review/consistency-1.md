# Consistency Review 1

## Summary

Scanned part 13's tree (design.md + review-1.md) after the action review landed the inline-routine emission model for hooks and `on_complete`. Found one in-tree inconsistency (auto-resolved) and two cross-part drifts in neighbour designs (surfaced for the user — out of this skill's edit scope).

## Files Reviewed

- **Design:** [design.md](../design.md)
- **Reviews:** [review-1.md](designs/workflows-module/parts/13-resolver-apis/review/review-1.md) (all 13 findings annotated; 12 Resolved, 1 Accepted)
- **Tasks / Plans:** none exist yet

## Inconsistencies Found

### 1. Goal contradicts the new "Hook emission" section

**Type:** Internal Contradiction
**Source of truth:** review-1 §9 / §10 resolutions (inline-routine emission, auth-by-construction)
**Files affected:** [design.md:7](../design.md) (Goal)
**Resolution:** Updated the Goal to drop "Validate hook auth at build time" and instead state that hooks and `on_complete` routines are authored inline and emitted by the resolver, with `auth.roles` synthesized from `action.access.roles` so the gate holds by construction. The body's "Hook emission" section already says this; the Goal sentence had been left over from the old gate model.

## Cross-part drift (surfaced — out of edit scope)

These touch neighbour designs, not part 13's tree. Flagging so they can be addressed in those parts' own review cycles.

### A. Part 9 still says part 13 "validates" hook auth

[part 9 design.md:51–53, 57, 84](../../09-hook-invocation/design.md) still describes part 13's role as a build-time validation gate (`hook.auth.roles ⊇ action.access.roles`). Per part 13's new model that gate is gone — auth is synthesized, not validated. Part 9's "Build-time hook auth gate (handed off to part 13)" section and the "Contract to neighbours" bullet need a fold-in to reflect "Part 13 emits the hook Apis with synthesized auth; runtime enforcement is structural."

**Recommendation:** Part 9's design.md is not yet shipped (Wave 5). Fold this in as a small edit when part 9 enters its own review cycle.

### B. Part 11 still has the resolved-but-not-closed `on_complete` auth open question

[part 11 design.md:58, 63](../../11-group-on-complete-fanout/design.md) lists "Per-hook auth — should `on_complete` Apis carry the same `hook.auth.roles ⊇ action.access.roles` build-time check?" as open, and the Contract bullet says "Part 13 baked-in hook-auth check may need extending to cover `on_complete` Apis." Per part 13's new model the answer is "yes by construction" — the resolver emits the `on_complete` Api with synthesized auth.

**Recommendation:** Drop the open question from part 11 and rewrite the Contract bullet ("Part 13 emits the `on_complete` Api inline with synthesized `auth.roles`") when part 11 next enters its review cycle.

### C. Action-authoring spec still treats `hooks.{interaction}.{pre|post}` as a string

[action-authoring/spec.md:361–366, 487](../../../workflows-module-concept/action-authoring/spec.md) shows hooks as `pre: lead-onboarding-qualify-pre-submit` (a string id) and the "Action hooks contract" / `makeWorkflowApis` resolver row both describe hook Apis as separately authored. Per design.md:41 this is a known precondition fold-in for part 13 — flagged explicitly in the design as "out of scope to author here, but blocking part 13's task list."

**Recommendation:** Already documented in design.md:41; nothing to fix here. Picked up when the spec fold-in task lands.

## No Issues

- **Payload shape** consistent across design.md In-scope (line 26) and the spec it references — `action_type` / `workflow_type` as build-time literals, no root-level `force`.
- **`event_overrides` rename** consistent in design.md (Goal, In-scope, Verification, Contract to neighbours) — all four sites use the new name.
- **Sparse map convention** consistent across the three baked-in maps (`hooks`, `event_overrides`, `interactions`).
- **Input source** consistent: design.md:13 says raw `vars.workflows_config`; Depends-on line 55 matches.
- **Task / form scope** consistent: line 20 ("identical endpoint shapes"), verification lines 60–61 (positive task assertion), Goal sentence ("form / task action").
- **Verification scope** matches the design body — emission tests for hook Apis (line 63) and `on_complete` Apis (line 64) align with the "Hook emission" section.
- **Open questions** section correctly states "(None)" — matches the §9 / §10 / §13 resolutions in review-1.
