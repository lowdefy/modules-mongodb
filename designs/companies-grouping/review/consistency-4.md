# Consistency Review 4

## Summary

Scanned all design + task + review files for drift after the review-3 action pass. One terminology inconsistency found across 7 locations — auto-resolved by propagating the review-3 finding #3 resolution ("three-step `onMount`") that wasn't fully applied last round.

## Files Reviewed

**Design:**
- `designs/companies-grouping/design.md`

**Reviews:**
- `designs/companies-grouping/review/review-1.md` (9 findings, all resolved)
- `designs/companies-grouping/review/consistency-2.md` (5 findings, all resolved)
- `designs/companies-grouping/review/review-3.md` (14 findings, all resolved)

**Tasks:**
- `designs/companies-grouping/tasks/tasks.md`
- `designs/companies-grouping/tasks/01-module-manifest.md` … `11-demo-and-readme.md` (11 task files)

**Plans / supporting files:** none.

## Inconsistencies Found

### 1. "Two-step" / "three-step" `onMount` terminology drift

**Type:** Review-vs-Design + Design-vs-Task drift.
**Source of truth:** `review-3.md` finding #3 resolution annotation — "Updated the design's 'Architecture / Edit form' section to describe a **three-step sequence** … The example YAML now shows `set_state` as the middle step. The step-by-step prose was also rewritten to match."
**Files affected:**

- `design.md:262` — closing parenthetical: "The two-step `onMount` still applies"
- `tasks/07-edit-form-wiring.md:1` — task title: "Wire parent selector into form, two-step `onMount` on edit page"
- `tasks/07-edit-form-wiring.md:8` — Context bullet 2: "becomes a **two-step sequence**"
- `tasks/07-edit-form-wiring.md:13` — "The two-step `onMount` shape:"
- `tasks/07-edit-form-wiring.md:38` — "So the two-step framing in the design becomes effectively three steps."
- `tasks/tasks.md:17` — task #7 row summary: "two-step `onMount` on `edit.yaml`"
- `tasks/tasks.md:29` — ordering rationale: "the two-step `onMount` sequence"

**Resolution:** Renamed all seven occurrences to "three-step", and rewrote the now-stale "the two-step framing in the design becomes effectively three steps" sentence at `07-edit-form-wiring.md:38` to "This three-step ordering matches the design's Architecture / Edit form section." The design's `onMount` example YAML at `design.md:225-238` already shows the three-step sequence (`fetch_doc_data → set_state → fetch_selector_options`); only the prose around it carried the old terminology.

## No Issues

- **Cycle-check `as: __ancestors`** — consistent across `design.md` formalisation, `design.md` step layout, and `tasks/04-update-company-cycle-check.md` YAML.
- **`$graphLookup.from: companies`** — hardcoded literally in tasks 2, 4, 8 and the design's two graph-lookup YAML examples. No remaining `<companies-collection name>` placeholders.
- **`get_descendant_company_ids` payload `_if_none [filter.parent_scope, _id]` fallback** — consistent across `tasks/02-descendants-request.md` and `design.md`'s List page section.
- **`$group: { _id: null, has_cycle: { $max: "$has_cycle" } }`** — present in both `design.md`'s "Cycle-check step layout" and `tasks/04-update-company-cycle-check.md` YAML.
- **`removed: { $ne: true }` idiom** — used uniformly across all new requests in design + tasks. No `removed: null` literal-match drift.
- **`cycle_check_ids` (not `exclude_ids`)** — the variable rename from review-1 finding #1 resolution propagated cleanly; no `exclude_ids` references remain.
- **Tile rendering pattern** — `tasks/09-view-page-hierarchy-tile.md` uses `Html` + `_nunjucks` per `tile_contacts.yaml` precedent; no `List + itemTemplate` references remain.
- **Reset/Clear button re-fire YAML** — concrete chain present in `tasks/10-list-filter.md`'s Notes section.
- **No "(optional) parent column" / "view header" stale references** anywhere.
- **PR body claims** match the actual changeset (16 files, design + 11 tasks + 3 review/consistency files).
