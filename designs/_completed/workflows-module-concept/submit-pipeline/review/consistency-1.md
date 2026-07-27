# Consistency Review 1

## Summary

Cross-checked submit-pipeline design.md, spec.md, and the annotated review-1.md against the resolved review decisions, and swept the rest of the workflows-module tree (engine, action-authoring, module-surface, ui, call-api) for stale references. Found 10 inconsistencies — all auto-resolved.

## Files Reviewed

**Design (submit-pipeline):**

- `designs/workflows-module/submit-pipeline/design.md`
- `designs/workflows-module/submit-pipeline/spec.md`

**Reviews:**

- `designs/workflows-module/submit-pipeline/review/review-1.md` (15 findings, all resolved)

**Cross-design (sibling sub-designs checked for ripple effects):**

- `designs/workflows-module/engine/design.md` + `spec.md`
- `designs/workflows-module/action-authoring/design.md` + `spec.md`
- `designs/workflows-module/module-surface/design.md` + `spec.md`
- `designs/workflows-module/ui/design.md` + `spec.md`
- `designs/workflows-module/call-api/design.md` + `spec.md`
- `designs/workflows-module/design.md` + `spec.md` (parent)

**Tasks / plans:** none exist yet.

## Inconsistencies Found

### 1. design.md cross-ref claimed "four module-level APIs become three" while listing four

**Type:** Internal Contradiction
**Source of truth:** module-surface spec, which lists `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview` — four APIs.
**Files affected:** `submit-pipeline/design.md` "Interaction with the other sub-designs"
**Resolution:** Changed "The four module-level APIs become three" to "The module-level APIs become four."

### 2. "Next Step" referenced closed Open Question 3

**Type:** Stale Status (review #7 closed the tracker sync/async open question)
**Source of truth:** review-1 finding #7's `> **Resolved.**` annotation; engine D3 commits sync in-process.
**Files affected:** `submit-pipeline/design.md` "Next Step" step 3
**Resolution:** Dropped the "Lock the tracker sync vs async question" step; renumbered following steps.

### 3. Side-effects table in design Decision 6 still flagged tracker subscription as "Open — sync vs async"

**Type:** Review-vs-Design Drift (review #7 closed sync; spec already updated; design table missed)
**Source of truth:** review-1 #7 resolution; matching spec.md row.
**Files affected:** `submit-pipeline/design.md` Decision 6 table
**Resolution:** Changed the table cell to "Synchronous in-process per engine D3. Engine writes parent tracker action via internal `updateAction` recursion; `SubmitWorkflowAction` invocations don't recurse on themselves." Now matches spec.

### 4. Notifications "When" column referenced dropped `access.notification_roles` field

**Type:** Stale Reference (action-authoring D4 explicitly dropped `access.notification_roles` from the v1 grammar)
**Source of truth:** action-authoring D4 "Fields explicitly dropped from the v1 grammar"; spec uses cleaner wording.
**Files affected:** `submit-pipeline/design.md` Decision 6 table
**Resolution:** Changed "When the action's `access.notification_roles` (or notifications config) names roles to notify" to "When notification recipients are wired (via the notifications module's `send_routine` var)."

### 5. Stale `event_overrides_by_interaction` field name in Decision 3

**Type:** Stale Reference (review #4 rejected the rename — kept `event_overrides` on both surfaces)
**Source of truth:** review-1 #4 resolution; rest of design + spec uses `event_overrides`.
**Files affected:** `submit-pipeline/design.md` Decision 3 (action-YAML `interactions:` block paragraph)
**Resolution:** Renamed reference back to `event_overrides`.

### 6. Engine cross-ref claimed form_data layout + error transition "unchanged"

**Type:** Review-vs-Design Drift (review #2 restructured engine D5 — form_data is now flat, error context moved to status entry; review #8 added per-entry `force` to engine D4)
**Source of truth:** updated engine/design.md D4 + D5.
**Files affected:** `submit-pipeline/design.md` "Interaction with the other sub-designs" engine bullet
**Resolution:** Replaced "form_data layout, error transition all unchanged" with explicit notes about the per-entry `force` addition to D4 and the flat form_data restructuring + status-entry error context in D5.

### 7. action-authoring cross-ref missed `interactions:` block, `event:` block, and hook-auth validation

**Type:** Review-vs-Design Drift (reviews #10, #5/log-event override, and #9 introduced these but the cross-ref wasn't updated)
**Source of truth:** action-authoring spec changes for `interactions:`, `event:`, and `makeWorkflowApis` validation rules.
**Files affected:** `submit-pipeline/design.md` "Interaction with the other sub-designs" action-authoring bullet
**Resolution:** Added bullets for new `interactions:` block (per-interaction `status:` override), new `event:` block (per-interaction log-event override), and the build-time hook auth rule (`hook.auth.roles ⊇ action.access.roles`; `auth.public: true` rejected).

### 8. Decision 2 referenced non-existent "Trade-offs section"

**Type:** Stale Reference (no Trade-offs section in the file)
**Source of truth:** file structure check via `grep`.
**Files affected:** `submit-pipeline/design.md` Decision 2 closing paragraph
**Resolution:** Replaced the forward-pointer with an inline rationale ("per-action endpoints carry static action context and align with existing modules-mongodb resolver conventions — see Decision 2 rationale above").

### 9. Default log-event Nunjucks template used `{{ status }}` but metadata only has `status_before` / `status_after`

**Type:** Internal Contradiction (template variable not defined in `metadata`)
**Source of truth:** the metadata block lists `status_before` and `status_after`; "status" alone is ambiguous.
**Files affected:** `submit-pipeline/design.md` Decision 5 default event shape; `submit-pipeline/spec.md` Default log event shape
**Resolution:** Updated both files to use `{{ status_after }}` in the template (the new status after this submit) and matching `on: { user, action_type, status_after }`.

### 10. call-api/design.md:98 referenced removed `form_data.{action_type}.error` sub-key

**Type:** Cross-Design Drift (engine D5 was restructured to drop the `.error` sub-key; call-api's error-propagation description didn't follow)
**Source of truth:** engine D5 new layout; submit-pipeline pre-hook abort wording.
**Files affected:** `call-api/design.md` Decision 4 error propagation
**Resolution:** Replaced "captured failure context in `form_data.{action_type}.error`" with "engine writes the action's `status[0]` to `{ stage: error, reason, error_message, error_metadata }` carrying the captured failure context."

## No Issues

Verified consistent — no edits needed:

- **Lifecycle step numbering** between Decision 1 (`design.md`), the proposed-shape box, and the spec's `Flow` box all align after the #7 close (step 12 / step 9 / step 10 across the three boxes).
- **Pre-hook return shape** between design Decision 4 and spec "Pre-hook return" (all six fields — `status`, `actions[]` with `force`, `event_overrides`, `form_overrides`, `hook_error`).
- **Post-hook payload shape** including the new `result.tracker_fired` field, present in both design Decision 4 and spec "Post-hook payload."
- **`hooks` and `event_overrides` keying paragraph** between design Decision 2 and spec "Per-action Api."
- **Hook auth rule** (`hook.auth.roles ⊇ action.access.roles`; reject `auth.public: true`) appears identically in design Decision 4, spec, and action-authoring spec's `makeWorkflowsConfig` per-action validation list.
- **`force: true` per-entry** appears in design Decision 4 pre-hook return, spec pre-hook return, and engine spec's `UpdateWorkflowActions` payload definition.
- **Engine D5 form_data flat layout** propagated to engine/design.md, engine/spec.md, module-surface/design.md, module-surface/spec.md, action-authoring/design.md, action-authoring/spec.md, ui/design.md, ui/spec.md, submit-pipeline/design.md, submit-pipeline/spec.md. No stale `.review.{field}` or `.error.{field}` form_data path references survive in design files (page-config references like `pages.error` and `status_map.error.{app_name}` are unrelated; left untouched).
- **Open Questions lists** in design.md (5 items) and spec.md (5 items) are aligned on topic and count.
- **Module-surface `submit-action` content** still exists in module-surface design + spec — this is flagged in the submit-pipeline cross-ref as a follow-up edit ("module-surface drops `submit-action`") and isn't a consistency drift within submit-pipeline's scope; it's the next sub-design's cleanup.

## Open follow-ups (not consistency drifts — surfaced for downstream work)

- **Module-surface rewrite.** module-surface/design.md + spec.md still describe the v0 `submit-action` API and its payload shape. submit-pipeline's "Interaction with the other sub-designs" section already names this; the actual edit belongs in a module-surface design pass, not here.
- **action-authoring vocabulary additions.** action-authoring's grammar needs to acquire the `interactions:` block (Decision 3) and `event:` block (Decision 5) sections. Cross-ref already in submit-pipeline; the actual additions belong in an action-authoring pass.
