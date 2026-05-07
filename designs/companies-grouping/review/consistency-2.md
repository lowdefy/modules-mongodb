# Consistency Review 2

## Summary

Scanned `design.md` for internal contradictions and verified each resolution annotation in `review-1.md` is reflected in the design body. Five inconsistencies found, all auto-resolved against the most recent review decisions.

## Files Reviewed

**Design:**
- `designs/companies-grouping/design.md`

**Reviews:**
- `designs/companies-grouping/review/review-1.md` (all 9 findings annotated as Resolved)

**Tasks / plans:** none yet.
**Supporting files:** none yet.

## Inconsistencies Found

### 1. "(optional) parent column on the list page" contradicts the no-built-in-column decision

**Type:** Internal Contradiction
**Source of truth:** Architecture / List page item 4 ("No parents column is added to the default table. Apps that want one add it via the existing `components.table_columns` slot.").
**Files affected:** `design.md` — Key decisions / "Opt-in via a single hierarchy.enabled flag" bullet list (line 65), and Module config var description (lines 188–189).
**Resolution:** Removed "(optional) column" from the behaviours list and "(optional) parent column to the list page" from the var description. The bullet list now reads "A filter on the list page" and adds a separate bullet for the descendants-resolution request that feeds it. Var description updated to drop the column language.

### 2. `as: __ancestor_chain` vs `as: __ancestors` naming drift

**Type:** Internal Contradiction
**Source of truth:** The concrete YAML in "Cycle-check step layout" (`as: __ancestors`) — closer to implementation, plural form is more idiomatic.
**Files affected:** `design.md` — Cycle check formalisation (line 95) used `__ancestor_chain`.
**Resolution:** Renamed to `__ancestors` everywhere.

### 3. Files-changed entry for `get_all_companies.yaml` describes the rejected approach

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #2 resolution — option A (pre-resolve descendants in a separate request, feed ids into Atlas Search `must` clause). No `$graphLookup` runs inside `get_all_companies`.
**Files affected:** `design.md` Files-changed → Modified list (line 430).
**Resolution:** Replaced "conditional `$graphLookup` + `$match` on parent_scope filter" with a description that matches the resolved approach: accept `parent_scope_ids` payload sourced from `_request: get_descendant_company_ids.0.ids` and append a conditional Atlas Search `in` clause to `compound.must`. Explicitly states no `$graphLookup` lives in this pipeline.

### 4. Cycle-check formalisation `startWith: parent_ids` mismatches the concrete YAML

**Type:** Internal Contradiction
**Source of truth:** The concrete YAML in "Cycle-check step layout" — uses `$match` to pull candidate parents into the pipeline, then `$graphLookup` with `startWith: "$_id"`.
**Files affected:** `design.md` — "Cycle check formalisation" subsection (lines 89–99).
**Resolution:** Reframed the formalisation as `$match` + `$graphLookup` instead of a single `$graphLookup` with `startWith: parent_ids`. Added a closing line noting that the concrete YAML's `$concatArrays: [["$_id"], "$__ancestors._id"]` projection folds the "self is one of the candidate parents" and "self is an ancestor of one of the candidate parents" cases into a single boolean.

### 5. API section verbal description of the cycle check has the same `startWith` drift

**Type:** Internal Contradiction
**Source of truth:** Same YAML.
**Files affected:** `design.md` — Architecture / API items 1–2 (lines 351–352).
**Resolution:** Reworded item 1 to mention the `$match` + `$graphLookup` flow explicitly, and item 2 to acknowledge that "self appears" can mean either the candidate parent set or the ancestor closure (matching the concrete projection).

## No Issues

- All nine review-1 resolutions are reflected in `design.md` (DAG model, `cycle_check_ids` rename, disable-with-label projection, two-step edit-page `onMount`, combined `tile_hierarchy` sidebar tile, pre-resolve descendants for list filter, soft-delete idiom, cycle-check step layout, namespace example trim, batched mount fetch, view-page projection shape).
- Files-changed list entries for `tile_hierarchy.yaml`, `parent_selector.yaml`, `get_descendant_company_ids.yaml`, `get_company_children.yaml`, `pages/view.yaml`, `company-selector.yaml`, and `apps/demo/modules/companies/vars.yaml` all match the architecture sections.
- The "Related cleanup" section flags the two pre-existing soft-delete bugs (Atlas Search `mustNot exists path: removed.timestamp` no-op; user-admin literal `removed: null` matches) consistently with the `Removed parents leave dangling references` decision.
