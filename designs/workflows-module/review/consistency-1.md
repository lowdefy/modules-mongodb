# Consistency Review 1 (parent-level)

## Summary

Parent-level consistency pass across all five sub-designs (engine, module-surface, action-authoring, ui, plus parent design and parent spec) and their `spec.md` companions. Triggered after the four sub-design action-reviews completed (engine review-1, Sam's parent-level review, action-authoring review-1, module-surface review-1, ui review-1). Found **four cross-design drifts** from the action-authoring sub-design's new Decision 3 ("Action access semantics") not yet propagated into engine, module-surface, and the parent spec — all auto-resolved. One unannotated review (`review-steph-1.md`) is **intentionally left untouched** by this pass; consistency review propagates already-resolved decisions, not new findings.

## Files reviewed

**Parent-level:**

- [designs/workflows-module/design.md](../design.md)
- [designs/workflows-module/spec.md](../spec.md)

**Sub-designs (design.md + spec.md per sub-design):**

- [engine/](../engine/) — design.md, spec.md
- [module-surface/](../module-surface/) — design.md, spec.md
- [action-authoring/](../action-authoring/) — design.md, spec.md
- [ui/](../ui/) — design.md, spec.md

**Reviews (annotation-extracted as decision register):**

- [engine/review/review-1.md](../engine/review/review-1.md) — 12 findings, all annotated
- [engine/review/consistency-1.md](../engine/review/consistency-1.md) — historical (sub-design-scoped)
- [module-surface/review/review-1.md](../module-surface/review/review-1.md) — 8 findings, all annotated
- [action-authoring/review/review-1.md](../action-authoring/review/review-1.md) — 9 findings, all annotated
- [ui/review/review-1.md](../ui/review/review-1.md) — 10 findings, all annotated
- [review/review-sam-1.md](review-sam-1.md) — 7 findings, all annotated

**Alternative-architecture sub-designs (not in v1; left untouched):**

- [submit-pipeline/design.md](../submit-pipeline/design.md)
- [action-groups/design.md](../action-groups/design.md)

**Tasks / plans:** None yet.

## Inconsistencies Found

### 1. Engine sub-design doesn't document role-gate enforcement at query-time and submit-time

**Type:** Review-vs-Design (cross-design drift)
**Source of truth:** Action-authoring Decision 3 ("Action access semantics"), added by action-authoring review-1 finding #4 resolution. The decision commits to engine-side enforcement at three points: build-time (`makeActionPages` filters page emission), query-time (`get-entity-workflows` filters response), submit-time (`submit-action` re-checks role gate).
**Files affected:** [engine/design.md](../engine/design.md), [engine/spec.md](../engine/spec.md) — neither file mentioned role-gate enforcement, verb-map filtering at query time, or the submit-time re-check. The UI sub-design's `action_role_check` description (UI review-1 finding #7) explicitly anchors to "the same query-time check the engine runs in `get-entity-workflows` / `submit-action`," but that check wasn't documented in the engine.
**Resolution:** Added an "Access enforcement" bullet to engine/design.md's Capabilities list (after `CancelWorkflow`) describing both enforcement points and cross-referencing action-authoring Decision 3. Mirrored a tightened version into engine/spec.md's Capabilities section.

### 2. Module-surface API table doesn't reflect access filtering on `get-entity-workflows` and `submit-action`

**Type:** Review-vs-Design (cross-design drift)
**Source of truth:** Same as #1 — action-authoring Decision 3.
**Files affected:** [module-surface/design.md](../module-surface/design.md), [module-surface/spec.md](../module-surface/spec.md) — the API description tables for `get-entity-workflows` and `submit-action` didn't mention the access filter or role-gate re-check.
**Resolution:** Updated both API table rows in design.md and spec.md to call out access filtering on `get-entity-workflows` (response filtered by per-app verb map + role gate) and role-gate re-check on `submit-action` (rejects with structured error if user's roles no longer match before any writes). Both reference action-authoring Decision 3 / "Access" section.

### 3. `makeWorkflowsConfig` verb-list validation lists `(view, edit)` but canonical vocabulary is `view, edit, review`

**Type:** Internal contradiction
**Source of truth:** Action-authoring Decision 3 ships the verb vocabulary as `view`, `edit`, `review` (with `review` covering approve / request-changes affordances on the edit page). The validation rule under `makeWorkflowsConfig` was written before Decision 3 was added (during module-surface review #3 resolution) and still showed `(view, edit)`.
**Files affected:** [action-authoring/design.md](../action-authoring/design.md) `makeWorkflowsConfig` validation list, [action-authoring/spec.md](../action-authoring/spec.md) build-time-validation list.
**Resolution:** Updated both validation rules to list `view`, `edit`, `review` as the valid verb vocabulary and added a note pointing at Decision 3 as the canonical reference. Documented build-time behavior on unknown verbs (flagged at build, silently ignored at runtime).

### 4. Parent `spec.md` core-invariants list doesn't include the access decision

**Type:** Review-vs-Spec drift (parent-level)
**Source of truth:** Action-authoring Decision 3 became a load-bearing decision after review-sam-1 finding #4 resolution. The parent `spec.md` exists to enumerate the implementation-ready invariants in one place; access wasn't in the list.
**Files affected:** [spec.md](../spec.md) "Core invariants" section.
**Resolution:** Added an "Access has two parts that compose AND" invariant to the parent spec's core-invariants list, summarizing the verb maps + role gate shape and the three enforcement points, with a pointer to the action-authoring spec.

## No issues

The following were checked and found consistent — listed to confirm coverage:

- **Tracker rename (`sub-workflow` → `tracker`)** across all five active design files (parent, engine, module-surface, action-authoring, ui) and their spec.md companions. Zero `sub-workflow` references remain in the active tree. The alternative-architecture sub-designs (`submit-pipeline`, `action-groups`) retain the old term — out of scope for v1.
- **`entity_collection` propagation** across all 10 active files (5 design + 5 spec + parent design + parent spec). Schema includes `entity_collection`, `child_entity_collection`, `parent_entity_collection` consistently per the engine's "Entity-agnostic field shape" section.
- **`change_stamp` var dropped from module-surface** in both design.md and spec.md — workflow/action doc writes use `_ref: { module: events, component: change_stamp }` per the cross-module idiom; engine's `createAction.js` pseudo-code generates change stamps server-side from handler context (per action-authoring review-1 finding #8 resolution).
- **Decision-number renumbering in action-authoring** (3→4, 4→5, 5→6, 6→7) propagated correctly. Engine/design.md's cross-ref to action-authoring's tracker decision points at "Decision 5" (was 4). UI/design.md's cross-ref to the form components library points at "Decision 7" (was 6). Internal cross-refs within action-authoring/design.md updated. The submit-pipeline and action-groups alternative-architecture designs reference older decision numbers; left untouched as those designs aren't adopted.
- **Bidirectional parent/child link** (Sam's review #3 resolution) consistent across engine, action-authoring, module-surface, parent design. `parent_action_id` + `parent_entity_id` + `parent_entity_collection` on child workflows; `child_entity_id` + `child_entity_collection` on tracker actions. Single `start-workflow` call writes both sides.
- **`_build.var` → `_var` and `_module.var` → `_var` in resolver/library contexts** (action-authoring review-1 #1 and #7) applied uniformly across design.md and spec.md.
- **`onInit` vs `onMount`** on `actions-on-entity` (UI review-1 #1) — `onMount` in both design.md and spec.md; page-level `onInit` usages left unchanged (correct for pages).
- **Layout chrome reference** (`_module.pageId: { id: page-layout, module: layout }` → `_ref: { module: layout, component: page }`) applied in both design.md and spec.md.
- **Status-selector exceptions** (same-stage for current action, `not-required` disabled state) consistent in UI design.md and spec.md.
- **`action_role_check` roles path** (`_user: roles` from `apps.{app_name}.roles` on user_contacts) consistent in UI design.md, spec.md, and cross-referenced to action-authoring Decision 3.

## Open questions raised by this review

1. **Engine plumbing for `app_name` at runtime.** The access-semantics decision commits to per-app verb filtering at query-time (`get-entity-workflows`) and submit-time (`submit-action`). The engine needs the current host app's `app_name` to look up `access.{app_name}` on each action. Neither the `submit-action` payload nor the `get-entity-workflows` payload currently include `app_name`; the engine could read `_module.var: app_name` (the host app's value at build time) via the API routine, or apps could pass it in the payload. The runtime plumbing is undecided. **Flagged as a follow-up; not in scope for this consistency pass.** Suggest resolving in a separate design touch-up before the access-semantics enforcement points are implemented.

## Unannotated reviews not touched

- [review/review-steph-1.md](review-steph-1.md) — Three new findings on tracker-on-non-workflow-entities, SmartDescriptions for data displays, and whether `entity_type` is needed on workflow.yaml. **Unprocessed by this pass.** A consistency review propagates already-resolved decisions; processing new findings is the job of `/r:design-action-review`. Suggest a follow-up `/r:design-action-review workflows-module/review-steph-1` to resolve these.

## Postscript — Action-groups sub-design integrated as v1

After this consistency pass completed, the `action-groups/design.md` sub-design (previously listed as "alternative architecture, not in v1") was promoted to a fifth active sub-design. This required propagating the new Decisions 1–5 (workflow-level `action_groups:` declaration, `blocked_by` accepting group IDs, derived three-value group status, persisted `groups[]` on the workflow doc, two new ordered steps inside `UpdateWorkflowActions`, new `completed_groups` return shape) into the previously-active four sub-designs. Decision 6 (`on_complete` invocation mechanism) remains deferred to a follow-up `api-hooks` sub-design.

**Files modified during integration:**

- [spec.md](../spec.md) — fifth sub-design row; new "Action groups are first-class engine concept" invariant; moved the deferred entry to reflect that the engine work is in scope and only the hook-invocation mechanism is deferred.
- [engine/design.md](../engine/design.md) — added "Action groups as a persisted engine concept" capability bullet; rewrote the "Ordering relative to other engine work" section to 7 ordered steps (new step 2: `groups[]` writeback; new step 3: `blocked_by` re-evaluation; renumbered downstream).
- [engine/spec.md](../engine/spec.md) — added `groups` field to Workflow doc schema; rewrote the "Ordering inside one `UpdateWorkflowActions` invocation" section to 7 steps with `completed_groups` in the return value.
- [action-authoring/design.md](../action-authoring/design.md) — added a "Workflow-level `action_groups:` declaration" sub-section under Decision 1 with the YAML shape and cross-references to action-groups Decisions 1 and 2; extended `makeWorkflowsConfig` validation rules (new per-workflow `action_groups` rule + group/action-type collision check; per-action `action_group` resolution check; `blocked_by` accepting mixed action-type / group-id entries).
- [action-authoring/spec.md](../action-authoring/spec.md) — added `action_groups:` to the Workflow YAML example; mirrored the validation rules.
- [module-surface/design.md](../module-surface/design.md) — `get-entity-workflows` description now notes the returned workflow docs carry the persisted `groups[]`; `submit-action` description notes `UpdateWorkflowActions` returns `completed_groups` and an outer Layer-1 step fans out `on_complete` hooks; routine code-block grew a stubbed "Fan out group on_complete hooks" step + updated `:return:` to include `completed_groups`.
- [module-surface/spec.md](../module-surface/spec.md) — same.
- [ui/design.md](../ui/design.md) — `actions-on-entity` runtime-behaviour rewritten to read engine-persisted `groups[]` instead of computing groupings from action lists; `workflow-header` milestone label switched from action-priority-based to group-based (lowest-ordered non-`done` group's title).
- [ui/spec.md](../ui/spec.md) — same.
- [action-groups/spec.md](../action-groups/spec.md) — created (new companion spec).

**Open question raised:** the `api-hooks` follow-up sub-design needs to pick the fan-out mechanism (per-group generated endpoints / dispatcher API / plugin-side invocation). Engine work proceeds in parallel — `completed_groups` lands as a return-value first; the routine carries a stubbed hook-invocation step until the mechanism is locked.

**Unchanged from this pass:** the access-enforcement plumbing question (`app_name` at runtime in engine APIs) noted in the original Open Questions remains the same follow-up.
