# Consistency Review 2

## Summary

Checked `design.md` and the task files against the review-2 decision register (6 findings, all resolved — Workstream D). Found 3 internal inconsistencies, all introduced by the review-2 action edits within Workstream D, and auto-resolved all three. The A–C task files were untouched by review-2 (they predate Workstream D and don't reference it), so there was no design-vs-task drift to fix.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (10 findings, all resolved), `review/review-2.md` (6 findings, all resolved); prior report `review/consistency-1.md` (context only).
- **Tasks:** `tasks/tasks.md` + `tasks/01..10-*.md` (Workstreams A–C only).
- **Supporting / plans:** none exist.

## Inconsistencies Found

### 1. Manifest strip count wrong — phantom "packaging enum" var

**Type:** Internal Contradiction (Approach vs Audit + module source)
**Source of truth:** design.md audit Manifest bullet (five vars) + `modules/deals/module.lowdefy.yaml` (no packaging var; `package` options are inline on the `new.yaml` ButtonSelector)
**Files affected:** `design.md` Workstream D Approach (Manifest bullet)
**Resolution:** review-2 #3 added `package` to the strip list, and the Approach Manifest bullet over-corrected to "the **six** domain-taxonomy vars … and the packaging enum." There is no packaging var. Changed to "the **five** domain-taxonomy vars (`products`, `product_hierarchy`, `sectors`, `sub_sectors`, `customer_types`)" and noted `package`'s options are inline on the form block (they move with the block, no manifest change).

### 2. "all six" stale in the host-constraint note

**Type:** Stale Reference (count)
**Source of truth:** design.md create-form audit + Approach (seven domain field blocks after review-2 #3 added `package`)
**Files affected:** `design.md` Workstream D host-constraint note
**Resolution:** The note said the origin app "reconstitutes all **six**" — the pre-`package` count. Changed to "all **seven** via the same `fields` var" (also aligning the mechanism to review-2 #4's single-var decision).

### 3. Detail-view round-trip path attributed to the old display slots

**Type:** Internal Contradiction (Review-vs-Design)
**Source of truth:** review-2 #4 resolution (single `fields` var + `SmartDescriptions`; old slots retained for display-only extras)
**Files affected:** `design.md` Workstream D detail-view audit bullet
**Resolution:** The bullet said the round-trip display path "already exists (whole-doc read + the `company_fields`/`meta_fields`/`info_grid_slots` display slots)." After #4, host round-trip fields render via `SmartDescriptions` from the single `fields` declaration; the old slots are only for display-only extras. Reworded the bullet to point at the SmartDescriptions path and relegate the old slots to extras (also fixed a stray mid-sentence capitalization).

## No Issues

- **`create_fields` references:** appear only in `review-2.md` (preserved finding text + the annotation recording the switch to `fields`) — correct as historical record. No stale `create_fields` in `design.md` or the tasks.
- **Workstreams table (design line 35):** row D "Generic create form — move domain fields to host config" still accurate; `product`/`package`/`fields`-var edits don't change the one-line summary.
- **Tasks 01–10:** cover Workstreams A–C only; none reference Workstream D, `product`, the domain-taxonomy vars, or the create form — no drift from review-2. `tasks.md` overview correctly scopes itself to A–C folding into #111.
- **review-1 decisions (A–C):** untouched by review-2; consistency-1 already verified them and nothing in review-2 reopened an A–C decision.
- **Read-side decision (review-2 #5) and prefill default (#6):** stated once each in the Approach/Write bullets; no contradicting text elsewhere.
- **Consumer-clean:** no consumer-specific identifiers reintroduced; the `package` values (concrete size/unit options) are cited only as examples of content to strip.
