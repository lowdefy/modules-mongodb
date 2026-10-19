# Consistency Review 3

## Summary

Third consistency pass after the breadcrumb-label update (`"<title> <entity_id>"`) and the spin-out of [part 26 entity-data-contract](../../26-entity-data-contract/design.md). Found one drift theme: handwave references to "v1.x" / "revisit if richer labels are needed" weren't updated to cite part 26 as the named home for that work. Three small targeted edits resolved it.

## Files Reviewed

- **Design:** `designs/workflows-module/parts/17-shared-pages/design.md`
- **Reviews:** `review/review-1.md`, `review/consistency-1.md`, `review/consistency-2.md`
- **Tasks:** `tasks/tasks.md`, `tasks/02-task-view-page.md`, `tasks/03-task-edit-page.md`, `tasks/04-task-review-page.md`, `tasks/05-workflow-overview-page.md`, `tasks/06-manifest-page-exports.md`, `tasks/07-demo-app-wiring.md`
- **Sibling design referenced for cross-check:** `designs/workflows-module/parts/26-entity-data-contract/design.md`
- **Plans / supporting files:** none

## Inconsistencies Found

### 1. "v1.x" / "revisit" handwaves don't reference part 26

**Type:** Stale Reference (post-spin-out)
**Source of truth:** Part 26 is now the named home for the entity-fetch + richer-label work. References in part 17 to vague "v1.x" / "revisit if real apps need" miss the cross-link.
**Files affected:** `design.md` § Reused module-shipped requests (the workflow-overview bullet); `tasks/tasks.md` § Out-of-scope (the entity-fetch bullet); `design.md` § Out of scope / deferred (no entry for the entity-fetch deferral at all).

**Before:**

- Design line 61: "revisit if real apps need richer breadcrumb labels than the static `title` from the enum."
- tasks.md line 50: "Revisit in v1.x if richer breadcrumb labels are needed."
- Design § Out of scope: had no entry for entity-fetch deferral at all (entry existed only in `entities module var § Forward compatibility` and in tasks.md's Out-of-scope).

**Resolution:**

- Design § Out of scope: added a bullet "Entity-doc fetch + richer back-link labels → part 26" with the v1 label contract and a one-sentence summary of what part 26 owns. Mirrors the pattern other deferred items use ("→ [part N]").
- Design line 61: replaced "revisit if real apps need richer breadcrumb labels" with "the richer-label path lives in [part 26]". Direct cross-link.
- tasks.md line 50: replaced "Revisit in v1.x..." with "The richer-label path ... is owned by [part 26] — separate design, separate review cycle." Mirrors the design wording.

## No Issues

- **Breadcrumb label format `"<title> <entity_id>"`** consistent across design (lines 54, 173), task 05 (line 101), and task 07 (line 44). Placeholder variation (`<id>` vs `<entity_id>` vs `65a1f3...`) is stylistic; all three mean the same thing.
- **`entities` enum field shape** (`page_id`, `id_query_key`, `title`) consistent across design (lines 54, 61, 75–88, 96, 173), task 05 (line 9, code snippet), task 07 (line 19–20, line 44), and part 26 (cross-reference target).
- **Part 26 cross-reference** from design § entities module var → Forward compatibility is bidirectional with part 26's Source rationale and Contract-to-neighbours sections.
- **No dangling task-1 references** — both mentions in tasks.md are explanatory notes about the deleted task, not live dependencies.
- **Cross-part obligations** (part 4 validator, part 20 manifest) listed consistently in design § entities module var and tasks.md § Cross-part obligations.
- **Task 06 (manifest wiring)** correctly does NOT mention `vars.entities` — that's part 20's responsibility, not part 17's.
- **Task 07 prerequisite wording** about validator/manifest readiness is accurate: the consumer (workflow-overview reading `_module.var: entities`) doesn't require the manifest declaration to be present, only the validation does.
- **All review-1 decisions** (verb namespace, role gate, stale-URL allowlists, `onMount` sequence, keyed `form_data` indexing, etc.) remain consistent across design and tasks — no regressions from prior consistency passes.
- **`dist/...` path violations** — none.
- **Review-finding numerical cross-references** in design — none.
- **`_completed/` link paths** consistent across design (parts 15, 19) and tasks.
