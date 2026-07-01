# Consistency Review 2

## Summary

Checked the post-review-4 Part 40 tree (design.md + four reviews; the task files and `open-questions.md` were deleted by review-4 #9/#10) against the review decision register, Part 46's current contract, the parent design / implementation plan, and — per the user's explicit ask — the concept docs (`ui/design.md`, `state-machine/design.md`). Found 6 inconsistencies, all auto-resolved. The largest item: the design's **Concept-doc reconciliation table was applied to the concept docs** (all six rows are design-level prose with final, 4-times-reviewed decisions behind them; the user asked for concept files to be updated), plus one concept-doc error the table didn't list (ui Decision 7's stale "no-ops" concurrency line — the concept-side twin of review-4 #5).

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` … `review-4.md`, `review/consistency-1.md` (prior pass, context only)
- **Cross-part:** `parts/46-debundle-workflow-config/design.md` (contract names re-verified: `GetWorkflowAction`, `allowed`, `buttons`, `workflow_closed`, `allow_not_required` machinery, D5/D6/D8 — all match; 46 and review-4 were committed together at 8e1f59c, so review-4's verification is current), parts tree link targets (34/35/38/39/42/43 in `_completed`, 24/33 in `_next`, 30 in `_rejected`, 46 active — all resolve)
- **Parent:** `designs/workflows-module/design.md`, `designs/workflows-module/implementation-plan.md`
- **Concept:** `workflows-module-concept/ui/design.md`, `workflows-module-concept/state-machine/design.md`
- **Tasks/plans:** none exist (deleted per review-4 #9/#10 — correct; regeneration via `/r:design-task` is pending Part 46)

## Decision register (delta since consistency-1)

Review-4 (latest word) — all ten findings annotated: #1 `GetAction` → `GetWorkflowAction` / `get_workflow_action`; #2 bag renamed `allowed`; #3 `get_workflow` deleted, `workflow_closed` resolved on the `GetWorkflowAction` envelope; #4 all three shared YAML stages deleted in Part 46 (zero stragglers), no Part 40 data-side timeline edit; #5 stale click **throws** (Part 38 D13), no bespoke handling; #6 `view`-mode comment at stage `error`; #7 `fields` rides `submit`/`progress` only; #8 review-page stale-URL allowlist drops `error`; #9 all nine task files deleted; #10 `open-questions.md` deleted. Design.md already reflects all ten — no review-vs-design drift found.

## Inconsistencies Found

### 1. Concept docs not yet carrying the part's (final) reconciliation decisions

**Type:** Design-vs-Supporting (concept) drift
**Source of truth:** design.md §Concept-doc reconciliation (decisions D3/D4/D5, stable through reviews 2–4)
**Files affected:** `workflows-module-concept/ui/design.md`, `workflows-module-concept/state-machine/design.md`
**Resolution:** Applied the full reconciliation table (user-authorized):

- **ui OQ4** — marked resolved (Part 40 D4: `resolve_error` on `workflow-action-view`, no `check-error` page); numbering kept so existing "Open Question 4" cross-references stay valid.
- **ui Decision 7** — error-recovery paragraph rewritten from "is a follow-on / is open" to the D4 resolution; added the server-resolved `buttons.{signal}` visibility note (Part 46 D5) with the `allow_not_required` opt-in (Part 40 D3); added the in-context modal (Part 40 D5) as the in-app open path alongside the page.
- **ui check-pages paragraph** ("no per-action customisation") — recorded the single `allow_not_required` exception (D3).
- **ui Decision 2 button table** — `not_required` row: opt-in moved from `pages.edit.buttons.not_required.visible` to the action-root `allow_not_required` (engine-enforced, any kind); `page_config.buttons.not_required.visible` noted as a plain opt-out, default `true` (D3 form alignment).
- **ui Decision 3 `actions-on-entity`** — added behaviour item 5: bundles `check-action-modal` (fixed blockId, kind-branch on `ActionSteps.onActionClick`, navigate default preserved).
- **state-machine Next-step note** — item 3's sub-question marked resolved (2026-06, Part 40 D4).

### 2. ui Decision 7's concurrency line contradicted Part 38 D13 (same error review-4 #5 fixed in the design)

**Type:** Supporting-vs-Design contradiction (not in the reconciliation table)
**Source of truth:** Part 38 D13 ("user signals throw, cascade signals no-op"), confirmed by review-4 #5
**Files affected:** `workflows-module-concept/ui/design.md` Decision 7
**Resolution:** "a submission the FSM doesn't accept … resolves to an undefined cell and no-ops" → user-driven signals **throw** the engine's invalid-signal error; the no-op path is cascade/mirror-only; the throw is the accepted outcome for the read-skew race.

### 3. Terminology note referenced the deleted task files

**Type:** Stale Reference
**Source of truth:** review-4 #9 (all nine task files deleted)
**Files affected:** `design.md:3`
**Resolution:** "The folder name … **and the task filenames** keep their original `simple-*` spelling" → folder name only.

### 4. Design still presented concept reconciliation as pending implementation work

**Type:** Stale Status (consequence of fix #1)
**Source of truth:** this pass's applied reconciliation
**Files affected:** `design.md` (§Layer, §Current state closing paragraph, §Concept-doc reconciliation, §Files changed → Concept docs)
**Resolution:** Marked the reconciliation **applied 2026-06-10** in all four places (table kept as the record of what changed; "No implementation task needed" noted so regenerated tasks don't re-task it). Current-state line "the remaining open item is ui OQ4 … which this part resolves" updated to resolved-and-applied.

### 5. Implementation-plan Part 40 status was stale

**Type:** Stale Status
**Source of truth:** review-4 #9 (tasks deleted, regenerate via `/r:design-task` after 46)
**Files affected:** `implementation-plan.md:14`
**Resolution:** "tasks need rework for 46" → "📐 design only — stale tasks deleted (review-4 #9); regenerate after 46".

### 6. Implementation-plan Part 46 row used the dead `GetAction` name

**Type:** Stale Reference
**Source of truth:** Part 46 design (method is `GetWorkflowAction`), review-4 #1
**Files affected:** `implementation-plan.md:13`
**Resolution:** "`GetAction` + 3 overviews" → "`GetWorkflowAction` + 3 overviews".

## No Issues

- **Review-vs-design:** all ten review-4 resolutions verified present in design.md (renames, `workflow_closed` single-read, per-signal `fields` payload, `view`-mode comment at `error`, review-allowlist `[in-review]`, timeline port to Part 46, throw-not-no-op).
- **Deliberately retained historical references** (review-4 #1/#2's explicit calls): pre-46 `get_action`/`action_role_check`/`get_workflow` in Current state; "binary `action_allowed`" in the Part 34 sequencing note; root-`action_allowed` retired-workaround description in D1; Part 34's own `action_allowed` naming in Related — all correctly framed as shipped/pre-46 or other-part vocabulary.
- **Part 46 contract:** every name and decision the design consumes (`GetWorkflowAction`, `get_workflow_action`, `allowed`, `buttons`, `workflow_closed`, `allow_not_required` validation + load-gate + resolution, D6 zero-stragglers stage deletion, `GetEventsTimeline` projecting `_id`/`kind`) matches 46's current design.
- **Link targets:** every relative part/concept link in design.md resolves on disk (including `_completed/43-rename-simple-kind-to-check`, `_rejected/30-status-map-rendering`).
- **Container/blockId/namespace:** `Modal` + `check_action_modal` + `current_action.*` consistent across D1/D2/D5/D6/Files-changed; no `surface.*`, `Drawer`, `simple_action_*`, or `button_signal_sources`-as-this-part's-work residue.
- **Parent design:** the §Parent design section's asks (Part 40 row, Part 34 graph slot) are correctly framed as outstanding cross-wave work; noted that the implementation plan already carries the sequence row.

## Open items (not consistency drift)

- **Task regeneration** — pending, deliberately sequenced after Part 46 lands (review-4 #9; reviews 3–4 are the spec for what regenerated tasks must not carry).
- **Parent `design.md` follow-on table** stops at Part 28 (+ a Part 39 bullet); parts 29–48 are tracked only in `implementation-plan.md`. Whether the parent table should be backfilled is a parent-design call, not Part 40 drift — left alone.
