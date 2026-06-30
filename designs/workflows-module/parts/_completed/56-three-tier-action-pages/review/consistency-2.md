# Consistency Review 2

## Summary

Checked the full Part 56 file tree — `design.md`, three reviews, prior
`consistency-1`, `tasks.md`, and all 11 task files — against the chronological
decision register (now headed by **review-3**, which did not exist at
consistency-1 time). The design body, `tasks.md`, and Task 8 faithfully track
review-3's reframing of D6 (modal and workspace check page are **separate
components**, no shared-leaf extraction, Task 5 deleted). Found **1
inconsistency** — a stale shared-leaf reference in Task 11 — auto-resolved.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** none (this folder has only `design.md` + reviews + tasks).
- **Reviews:** `review/review-1.md` (9 findings, all resolved/rejected),
  `review/review-2.md` (5, resolved/accepted), `review/review-3.md` (5, all
  resolved); prior `review/consistency-1.md` (context only — not in the review
  chronology).
- **Tasks:** `tasks/tasks.md` + tasks 01, 02, 03, 04, 06, 07, 08, 09, 10, 11, 12
  (task 05 deleted per review-3 #1).

## Decision Register (source-of-truth, latest first)

From **review-3** (highest-numbered review — supersedes earlier text):

- **R3#1 (Resolved, reframed):** D6 — the modal (`check-action-surface.yaml`) and
  the workspace check page are **two separate components**; the shared-leaf
  extraction is **rejected**. **Task 5 deleted**; Task 8 authors the check page
  standalone (copies the controls it needs, copies the mode-derivation ladder);
  `check-action-surface.yaml` is **untouched** except a comment re-point. Task 8
  deps changed `5,6,7`→`6,7`.
- **R3#2 (Resolved):** Part 57 (lands first) owns both amendments — `makeActionPages.js:86`
  nested-read migration, and a **wholesale** routing-remainder carry (so
  `name_field` survives). Part 56's defensive "support both shapes" hedging
  removed from Tasks 3/4/10.
- **R3#3 (Resolved auto):** `modules/layout/components/page.yaml` added to
  Files-changed — it must forward the new `description` var into the `title-block`
  `_ref`.
- **R3#4 (Resolved):** form pages' action-scoped Activity card is **removed**,
  replaced by the shell's entity-scoped History (a strict superset) — owned by
  proposed-change item 3.
- **R3#5 (Resolved auto):** `findOne` wording aligned on `findDocs` everywhere.

Earlier decisions (review-1/2, already folded in and confirmed by consistency-1)
remain in force and were re-checked: single normalized `_state.entity_id`;
History sources `reference_field` from `entity.ref_key`; title = baked action
title, subtitle = `message` via the `description` var; `makeWorkflowsConfig`
validates (does not strip) `entity_view`; no connection `schema.js` change.

## Inconsistencies Found

### 1. Task 11 re-points the surface comment using the retired shared-leaf model

**Type:** Design-vs-Task drift / Stale Reference
**Source of truth:** review-3 #1 (reframed D6) — modal and check page are separate
components; no leaves; Task 5 deleted; check page authored standalone (Task 8).
**Files affected:** `tasks/11-retire-shared-pages-and-docs.md` (step 3, the
`check-action-surface.yaml:4` re-point instruction).
**Resolution:** The instruction described the new comment content as _"the modal
body composes the leaves; the workspace check page recomposes them — Tasks 5/8"_
— the pre-review-3 shared-leaf model, referencing the **deleted Task 5** and a
leaf extraction that D6 now rejects. Rewrote it to: _"this file is the standalone
in-context modal body only; the workspace check page is its own composition,
authored independently — no shared leaves — Task 8 / D6."_ This is the only place
in the task set still carrying the retired model.

## No Issues

Everything else was consistent with the register. Specifically confirmed:

- **R3#1 elsewhere** — `design.md` (proposed-change item 4, D6 at `:48–55`,
  Files-changed `:176–177`, Part 40 dep `:213`, Non-goals `:251`), `tasks.md`
  (row 5 "removed", ordering rationale, Task 8 deps `6,7`), and Task 8 (standalone
  authoring, copies controls + mode ladder, modal untouched) all track the reframed
  D6. The surviving "leaf" mentions in `design.md:53,55` are the **intentional
  rejection record**, not live design — correctly retained.
- **R3#2** — Tasks 3 (`:24–26,70–72`), 4 (`:52–59`), and 10 (`:82–88`) all assume
  Part 57 has landed the nested read + wholesale carry, with no "support both
  shapes" hedging; Task 4 frames `name_field` survival as a regression guard, not
  a carry fix.
- **R3#3** — Files-changed lists `page.yaml`; Task 1 adds the forward (`:36–40`).
- **R3#4** — proposed-change item 3 owns the Activity-card→History broadening;
  Task 9 step 4 removes the card.
- **R3#5** — `findDocs` wording consistent in D10 (`:85`), the `GetWorkflowAction`
  Files-changed line (`:178`), and Task 3 (`:35,50`).
- **Page-id contract** `{workflow_type}-check` agrees across Task 2 (engine link),
  Task 8 (page), and Task 10 (emission).
- **consistency-1 fixes** still hold — Non-goal cites "proposed change 6" (not D5);
  D8 cites the "Title content" note (no self-reference).
- Task dependency graph in `tasks.md` (1–4,6 parallel; 7→3; 8→6,7; 9→1,6,7;
  10→2,8,9; 11→2,10; 12→10,11) is coherent and matches the task headers.
