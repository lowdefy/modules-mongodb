# Consistency Review 1

## Summary

Scanned `design.md` and `review-1.md` for review-vs-design drift after action review. Found 2 inconsistencies, both auto-resolvable. No tasks/plans exist yet, so nothing else to check.

## Files Reviewed

**Design:**

- `designs/company-fields/design.md`

**Reviews:**

- `designs/company-fields/review/review-1.md`

**Supporting / tasks / plans:** none exist for this design.

## Inconsistencies Found

### 1. Body still said "demo app's `lowdefy.yaml`" after #7 fixed the example header

**Type:** Internal Contradiction (review-vs-design drift)
**Source of truth:** review-1 finding #7 (resolved) — the canonical wiring file is `apps/demo/modules.yaml`, with per-module vars in `apps/demo/modules/companies/vars.yaml`. The Files-changed table already reflects this (`modules/companies/vars.yaml` row, line 456).
**Files affected:** `design.md` line 48 (in "Sections default to empty…").
**Before:**

> The demo app's `lowdefy.yaml` will need to wire up the SA presets explicitly.

**After:**

> The demo app's module-entry vars (`apps/demo/modules/companies/vars.yaml`, `_ref`'d from `apps/demo/modules.yaml`) will need to wire up the SA presets explicitly.

**Resolution:** Edited `design.md` line 48.

---

### 2. Files-changed rows for `create-company.yaml` and `update-company.yaml` contradicted the rewritten "Whole-payload writes" body

**Type:** Internal Contradiction (review-vs-design drift)
**Source of truth:** review-1 finding #2 (resolved) — create uses literal `MongoDBInsertConsecutiveId.doc` with `_if_none` per section; update uses `MongoDBUpdateOne` pipeline with `$mergeObjects` per section. The body (lines 52-129) was rewritten to reflect this, but the table rows still said:

> `api/create-company.yaml` — Replace per-field `$set` with section-level `$mergeObjects`. `name` instead of `trading_name`.
> `api/update-company.yaml` — Same: per-section `$mergeObjects`.

The create row was wrong on two counts (it's not `$set`, and `$mergeObjects` doesn't apply to inserts) and neither row enumerated the specific scalar deletions / merge additions an implementer would need.

**Files affected:** `design.md` lines 435-436 (Files-changed module table).
**Resolution:** Replaced both rows with the actual edits per review-1 #2's split:

- create row: literal `MongoDBInsertConsecutiveId.doc`, replace flat `trading_name`/`registered_name`/`registration_number`/`vat_number`/`website` keys with `name`, add `registration: _if_none: [_payload: registration, {}]` alongside existing `contact`/`address`/`attributes`. `lowercase_email` stays inline at insert time. Insert-not-pipeline call-out preserved.
- update row: rename `trading_name` → `name` in stage 1, drop the flat scalars, add `registration: $mergeObjects [...]` alongside existing merges. Stage-2 `lowercase_email` unchanged.

## No Issues

- Solution-at-a-glance bullet 4 (line 27) matches the rewritten "Whole-payload writes" body.
- "Section structure (form and view)" subsection (lines 165-196) matches the `view_company.yaml` Files-changed row.
- Excel-download body (lines 198-202) and the corresponding Files-changed row match.
- Pages rows (`edit.yaml` / `new.yaml` / `view.yaml`) match review-1 finding #1's resolution.
- Demo Files-changed table (`modules/companies/vars.yaml`, `modules/companies/index.yaml` deletion, seed reseed) matches findings #6, #7, #11.
- README row mentions the `index.yaml` pointer fix from finding #11.
- "Resolved decisions" section reflects the user's open-question answers.
- All 11 review findings carry resolution annotations (`> **Resolved.** …`).
