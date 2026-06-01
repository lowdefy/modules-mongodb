# Consistency Review 2

## Summary

Checked Part 42's design + review against the in-flight Part 38 design and its 20 task files, focused on the D5 ↔ Part 38 boundary and the new shared-stage references. Found **3 inconsistencies** (1 internal-to-Part-38 contradiction, 1 cross-part stale-prose propagation gap spanning 3 locations, 1 surface-coverage gap in D5). All resolved — the first two auto-resolved against the D5 decision; the third resolved with a user scope decision (expand D5's adoption list to all three link-projecting APIs).

## Files Reviewed

- **Design (target):** `42-timeline-action-cards/design.md`
- **Review (target):** `42-timeline-action-cards/review/review-1.md`
- **Boundary design:** `38-engine-rebuild/design.md` (full)
- **Boundary tasks:** `38-engine-rebuild/tasks/07-visible-verbs-read-path.md`, `18-display-surface-renames.md`, `tasks.md` (scanned all 20 task files for UI-selection / shared-stage references)
- **Live code (to verify wiring):** `modules/workflows/api/get-entity-workflows.yaml`, `get-workflow-overview.yaml`, `get-action-group-overview.yaml`; `modules/workflows/pages/group-overview.yaml`, `workflow-overview.yaml`

## Inconsistencies Found

### 1. Part 38 internally contradicts itself on group-overview link resolution

**Type:** Internal Contradiction (within Part 38, exposed by the Part 42 D5 boundary)
**Source of truth:** Part 42 D5 (newest decision; Part 38's own D14/D16/test-strategy already converted to it)
**Files affected:** `38-engine-rebuild/design.md`

Part 38 D14 line 364 was updated to "the single rendered link is resolved server-side by the shared display-layer stage (Part 42 D5), not picked in the UI," but the Files-changed display-surface row (line 613) still read `…switch to reading actions_list.$.message / .links (UI applies the per-verb selection rule)`. The two lines described the same surface (`workflow-group-overview`) with opposite mechanisms.

**Resolution:** Updated line 613 to match line 364 (server-side resolution via Part 42 D5, "not picked in the UI").

### 2. Part 42 D5 claims the UI-selection prose is "dropped" but it survived in three Part 38 locations

**Type:** Review-vs-Design drift / Stale Reference (cross-part)
**Source of truth:** Part 42 D5 (supersedes Part 38's UI-side selection; resolves review-1 #1 + #4)
**Files affected:** `38-engine-rebuild/design.md:613`, `38-engine-rebuild/tasks/18-display-surface-renames.md:11`, `38-engine-rebuild/tasks/07-visible-verbs-read-path.md:5,49`; plus stale line-number citations in `42-timeline-action-cards/design.md:90,185`

Part 42 D5 (line 90) and its Files-changed row (line 185) asserted Part 38's "UI applies the per-verb selection rule" prose was dropped, citing fixed line numbers (`359, 362, 406, 757`). In fact the prose survived in task 18 (group-overview rename), task 7 (Context line 5 + Notes line 49), and design.md:613 — and the cited line numbers were stale (the Part 38 file has since grown; the live occurrences sit at ~361/364, 408, 766).

**Resolution:**
- Repointed task 18:11 and task 7:5/7:49 to server-side resolution via `resolve_action_link.yaml` (Part 42 D5), matching design line 364.
- Replaced Part 42's fragile line-number citations (lines 90, 185) with semantic location references (D14 note, D16, test strategy, Files-changed row, tasks 7 + 18).

### 3. D5's "every surface" promise covered only 2 of the 4 link-rendering surfaces, and misattributed one to a page

**Type:** Internal Contradiction (D5 prose vs. its own Files-changed list) + Stale Reference (page vs. API)
**Source of truth:** D5's stated principle ("read-side link selection is computed once, server-side, for every surface") + verified live wiring; **scope confirmed by user**
**Files affected:** `42-timeline-action-cards/design.md` (proposed change #6, D5 line 88, Files-changed line 184); coupling fix in `38-engine-rebuild/design.md:615` + `tasks/07-visible-verbs-read-path.md:27`

Verified wiring: the link is projected by **three standalone APIs** — `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview` — each emitting the singular `link: $<app_name>.link` (which Part 38 deletes for the per-verb `.links` map). The `workflow-group-overview` / `workflow-overview` *pages* only render `actions_list.$.link` from the API response (no aggregation pipeline of their own; neither overview API `_ref`s `get-entity-workflows`). Part 42 D5 named only `get-entity-workflows` (an API) and `workflow-group-overview` (a *page*, where a Mongo `$addFields` stage can't live), leaving `get-workflow-overview` and `get-action-group-overview` projecting a field Part 38 removes, with no server-side resolution — contradicting "every surface."

**Resolution (user decision — "Fix list to 3 APIs"):**
- Rewrote proposed change #6, D5 line 88, and the Files-changed row to adopt `resolve_action_link.yaml` (after `visible_verbs_filter`) in all three APIs, replacing each singular `link: $<app_name>.link` projection; the consuming pages render `actions_list.$.link` unchanged.
- Coupling fix: Part 38 task 7:27 and design.md:615 claimed these APIs' "message / links projections light up automatically (no change needed)." Narrowed to `message`-only (which does light up), with the singular `.link` projection explicitly attributed to Part 42 D5's `resolve_action_link.yaml` (since Part 38 deletes the field these projections read).

## No Issues

- **Shared-stage naming.** `modules/shared/workflow/{timeline_action_lookup,visible_verbs,resolve_action_link}.yaml` are named identically across Part 42 (design + review) and Part 38 (D16 line 410). Consistent.
- **`visible_verbs_filter` factoring.** Part 42 D5 ("`visible_verbs_filter.yaml` becomes this stage + its `$match $anyElementTrue` drop") matches Part 38 D16 line 410 verbatim. The sequencing is clean: Part 38 task 7 builds the monolithic `visible_verbs_filter.yaml`; Part 42 (which depends on Part 38) factors out the shared `visible_verbs.yaml` compute half. Both `visible_verbs.yaml` (timeline) and `visible_verbs_filter.yaml` (read APIs) emit `visible_verbs`, so `resolve_action_link.yaml` composes after either.
- **`_ref` path convention.** Single `../shared/...` used throughout Part 42 (review-1 #2 already fixed the earlier double-`../`); consistent with Part 38 and the repo's module-root resolution.
- **Write/read contract split.** Part 38 owns writing the per-verb `links` map (`computeEngineLinks`, D14/D16); Part 42 owns read-side resolution (D5). The boundary is now stated identically on both sides.
- **Review-1 resolutions.** All 8 findings in review-1 are resolved/accepted and their resolutions are reflected in the current design (D1–D5, the override-merge idiom, the `created.timestamp` note, the `action_ids` join confirmation, `modules/shared/workflow/` home).

## Note

Review file `42-timeline-action-cards/review/review-1.md` retains its original finding text (which quotes the pre-D5 "UI applies the per-verb selection rule" language and cites Part 38 line numbers). This is intentional — review files are the historical record; their resolution blockquotes already capture the D5 outcome, and they are not rewritten.
