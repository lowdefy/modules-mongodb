# Consistency Review 1

## Summary

Checked the full Part 64 file tree (design, two reviews, the task index, and eight task files) for drift. Found **4** inconsistencies — all caused by the design being revised (modal render deferred + the new "Middle-column layout model" + the closed-banner-on-form fix) **after** the task files were generated, plus one stale cross-reference. All 4 auto-resolved by propagating the current design into the tasks; no user decision was needed.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-resolver-config-and-universal.md`, `tasks/02-getworkflowaction-read-render.md`, `tasks/03-drop-description-write-path.md`, `tasks/04-action-description-component.md`, `tasks/05-shrink-universal-fields-components.md`, `tasks/06-rework-check-surfaces.md`, `tasks/07-rework-form-templates.md`, `tasks/08-concept-spec-amendments.md`
- **Source spot-checks:** `modules/workflows/templates/action.yaml.njk` (confirmed the middle column is a bare block list today, with the closed banner ordered _below_ the description callout — the bug the layout model fixes).

## Inconsistencies Found

### 1. In-context modal render: design defers it, Task 6 adds it

**Type:** Design-vs-Task
**Source of truth:** `design.md` (point 6, "Rendering the description" §, Non-goals, Files-changed `check-action-surface.yaml` note — all state the modal's authored render is **deferred to a separate design**; this part does cleanup only)
**Files affected:** `tasks/06-rework-check-surfaces.md` (step 4 + AC said "Add an `action-description.yaml` `_ref` to the card body … so the in-context surface renders the authored description directly"), `tasks/tasks.md` (table row 6: "+ in-context surfaces")
**Resolution:** Removed the render step from Task 6 — `check-action-surface.yaml` is now **cleanup only** (drop the dead `description` mapping; no render added). Updated the task title, context, steps, AC, Files, and Notes, and the `tasks.md` row to match the deferral.

### 2. Check page "Middle-column layout model" not implemented in Task 6

**Type:** Design-vs-Task
**Source of truth:** `design.md` (point 7, "Middle-column layout model" §, Files-changed note for `action.yaml.njk`)
**Files affected:** `tasks/06-rework-check-surfaces.md` (only swapped slot-0 callout + removed seeds; omitted the content-card wrap and the closed-banner reorder)
**Resolution:** Rewrote Task 6's `action.yaml.njk` steps to land the layout model: `workflow_closed_banner` moves to a bare full-width alert slot at the **top** (above the card), and a **single** content `Card` now wraps the working content with `action-description.yaml` as its **first child**, followed by the entity slot and comment. AC and Files updated accordingly.

### 3. Form-page layout omissions in Task 7 (placement + missing closed banner)

**Type:** Design-vs-Task
**Source of truth:** `design.md` ("Rendering the description" form bullet, "Closed banner now renders on form pages too" §, Files-changed note for the form templates)
**Files affected:** `tasks/07-rework-form-templates.md` (said to keep the render "at the same position (lead-in above the form body)" and never mentioned the closed banner)
**Resolution:** Corrected Task 7 to place `action-description.yaml` **inside the form card as its first child** (above `formHeader`), in **both** `_build.if` branches (direct-form and `form_card`), and added a new step to render `workflow_closed_banner` in a bare-alerts slot above the card (gated `action.workflow_closed` AND not `action.required_after_close`). Also reinforced the review-2 #1 distinction (the `_state: action.description` envelope binding is unchanged; only the seed under a `fields:` map is deleted). AC, Files, and Context updated.

### 4. Stale Part 56 cross-reference link + stale task-generation footer

**Type:** Stale Reference
**Source of truth:** sibling relative links in `design.md` (`../_completed/24-universal-fields/design.md`); the actual file tree (`review-2.md` now exists)
**Files affected:** `design.md` (Part 56 link used an absolute-style `designs/workflows-module/parts/_completed/…` path, broken relative to the design file), `tasks/tasks.md` (Scope footer claimed "the folder contains only `design.md` and `review/review-1.md`" and listed review-1 as skipped)
**Resolution:** Fixed the Part 56 link to `../_completed/56-three-tier-action-pages/design.md`. Updated the `tasks.md` Scope footer to note both reviews are resolved into the design and that tasks were reconciled here.

## No Issues

These were checked and found already consistent:

- **Review-2 #2 (compile-check) — Rejected.** No build-time `nunjucksFunction` compile check or read-time try/catch is added anywhere. Task 1 step 3 validates only that `description` is a string when present, matching the rejection. ✅
- **Review-2 #1 (form binding).** Task 2 and Task 7 both state the `_state: action.description` envelope binding is unchanged and only GetWorkflowAction's source flips. ✅
- **Review-2 #3 (~7 repeated `show` defaults).** Task 5 step 3 / AC require dropping `description` from _every_ inline `_build.array.includes` default plus the top-level `visible` gate, not just one. ✅
- **Review-2 #4 / Review-1 #4 (which kinds render + event `display.description` disambiguation).** Design contract bullet + Task 8 steps 2/4 cover the per-kind rule (form + check render; accepted-but-unrendered on custom/tracker) and the event-display rejection reconciliation. ✅
- **Review-1 #1–#3, #5 (scope→form+check, seed enumeration, `parseNunjucks` primitive, autoescape).** All folded into the design and reflected in Tasks 1–3, 6, 7. ✅
- **Task dependency graph** (`tasks.md` Ordering Rationale) still holds: Task 7 depends on 4 + 6; the layout additions don't change the chain. ✅
