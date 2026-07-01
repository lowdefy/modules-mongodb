# Consistency Review 1

## Summary

Checked the full file tree of Part 26 (design.md + review-1 + review-2) against the decision register from both reviews. The design was already reconciled with every review decision; found and fixed **one** stale cross-reference (a broken Part 56 dependency link). One issue total, auto-resolved.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`
- **Supporting:** none
- **Tasks:** none (no `tasks.md` / `tasks/`)
- **Plans:** none (no `plan/`)

## Decision Register (source-of-truth pass)

Review-1: #1 Resolved (single `entity: { ...routineResult, id }` object; drop dead `connection_id` subfield; replace whole-shell `visible` gate with `loading`/`skeleton`), #2 Resolved-auto (keep `connection_id` in `workspaceVars`, drop only `name_field`), #3 Resolved (drop `GetEntityWorkflows` from routine-calling set; "one call per read" now literally true), #4 Resolved (enumerate all three `get_entity` template sites), #5 Rejected (recursion-guard wording nitpick — no edit).

Review-2: #1 Resolved-auto (reorder merge to `{ ...(data ?? {}), id }` so injected id wins), #2 Resolved (add `authoring-grammar.md` + `action-pages.md` to files-changed), #3 Resolved-auto (DataDescriptions keys take the same `.0`-drop migration as the slot), #4 Resolved-auto (drop the non-existent "second read in view/review" parenthetical; repoint applies only to view/review), #5 Resolved (keep `entity_name` as an injected `_var`, re-source from `entity_link.name`; `action-breadcrumbs.yaml` no functional change).

All ten decisions verified present in design.md (the uncommitted diff shows review-2's fixes already applied: merge order at lines 42/134/202, `.0`-drop note at line 155, hand-authored docs added at lines 205-206, `entity_name` var re-sourcing at line 200, and `action-breadcrumbs.yaml` marked no-functional-change at line 201).

## Inconsistencies Found

### 1. Stale Part 56 dependency link uses a broken path format

**Type:** Stale Reference
**Source of truth:** The sibling dependency links in the same "Depends on" list (Parts 4, 16, 17, 63), which all use design-relative `../...` paths.
**Files affected:** `design.md` (line 239, "Depends on" section)
**Resolution:** Changed `[Part 56](designs/workflows-module/parts/_completed/56-three-tier-action-pages/design.md)` to `[Part 56](../_completed/56-three-tier-action-pages/design.md)`. The old path was repo-root-relative, so from the design file's own location (`parts/26-entity-data-contract/`) it did not resolve. Verified the target exists at `parts/_completed/56-three-tier-action-pages/design.md`; the corrected relative path now matches the four sibling links.

## No Issues

- **Merge-order invariant** (review-2 #1): `{ ...routineResult, id }` is consistent across the rationale (line 42), the `GetWorkflowAction` code literal (line 134), and the files-changed bullet (line 202). No `{ id, ...data }` literals remain.
- **`connection_id` subfield vs config field** (line 13 vs 14): not a contradiction — the returned `entity.connection_id` _subfield_ is dropped while the `entity.connection_id` _config field_ (identity / `GetEntityWorkflows` query) is kept; both are stated correctly.
- **`GetEntityWorkflows` excluded** (review-1 #3): consistently "no call" in proposed-change #4 (line 12), the handler table (line 142), the one-call-per-read claim (line 144), and the files-changed handler bullet (line 202).
- **Template edit sites** (review-1 #4 / review-2 #4): the files-changed templates bullet (line 200) enumerates the three `get_entity` sites and correctly scopes the DataDescriptions repoint to `view`/`review` only, with no phantom "second read."
- **DataDescriptions `.0`-drop** (review-2 #3): consolidation §2 (line 155) and §3 (line 156) now describe one consistent array→object migration.
- **`action-breadcrumbs.yaml` no functional change** (review-2 #5): files-changed bullet (line 201) and the Part 63 relationship note agree the component is unshared with the overview pages and only the templates' var source changes.
- **Docs files** (review-2 #2): both hand-authored pages (`authoring-grammar.md`, `action-pages.md`) appear in the "Manifest & docs" section and the files-changed list; `vars.md` correctly referenced as generated.
- **Part 63 relationship**: design's framing (overview + action pages both read `entity_link.name`; Part 63 uses its own runtime breadcrumb fragment) is internally consistent with line 201 and the review-2 #5 resolution.
