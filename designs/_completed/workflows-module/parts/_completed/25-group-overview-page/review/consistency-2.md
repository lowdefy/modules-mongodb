# Consistency Review 2

## Summary

Scanned the full Part 25 tree (design + review/ + tasks/) after the unit-test verification rewrite. Found two real drift classes: stale "Part 17 isn't shipped" status claims and six broken cross-design link paths (Parts 4, 16, 17 all moved to `_completed/` and links were never updated). All auto-resolved.

## Files Reviewed

- **Design:** [design.md](../design.md)
- **Reviews:** [review/review-1.md](designs/workflows-module/parts/_completed/25-group-overview-page/review/review-1.md), [review/consistency-1.md](designs/workflows-module/parts/_completed/25-group-overview-page/review/consistency-1.md)
- **Tasks:** [tasks/tasks.md](../tasks/tasks.md), [tasks/01-api-get-action-group-overview.md](../tasks/01-api-get-action-group-overview.md), [tasks/02-page-group-overview.md](../tasks/02-page-group-overview.md), [tasks/03-actions-on-entity-group-link.md](../tasks/03-actions-on-entity-group-link.md), [tasks/04-sibling-design-cross-refs.md](../tasks/04-sibling-design-cross-refs.md)
- **Supporting / plans:** none.

## Inconsistencies Found

### 1. Stale "Part 17 isn't shipped" status

**Type:** Stale Status / Blocker
**Source of truth:** Filesystem — Part 17 lives under `designs/workflows-module/parts/_completed/17-shared-pages/`, and `git log -- modules/workflows/pages/workflow-overview.yaml` confirms commit `95d23f1` shipped Part 17.
**Files affected:** [design.md:115](../design.md) ("Part 17 isn't shipped yet — its design absorbs a 'see also part 25' line"); [tasks/04-sibling-design-cross-refs.md:7](../tasks/04-sibling-design-cross-refs.md) ("Not yet shipped (still under `parts/`, not `_completed/`)").
**Resolution:** Auto-resolved. Rewrote design.md:115 to read "Parts 17, 18, and 19 are shipped — each design grows a 'see also part 25' line and the new YAML / manifest edits ship from this part rather than reopening them. Part 18's design also notes that this part extends the `actionGroupConfig` builder it already specifies. Part 20 isn't shipped — its design picks up the formal manifest-shape contract for the entries this part appends progressively." Updated tasks/04 line 7 to "(shipped)".

### 2. Broken cross-design link paths to Parts 4, 16, 17

**Type:** Stale Reference
**Source of truth:** Filesystem — Parts 4, 16, 17 all live under `_completed/`, not `parts/`.
**Files affected:** Five links in [design.md](../design.md) (5 to Part 17 across lines 7, 18, 115, 130, 160; 1 to Part 16 at line 26; 1 to Part 4 at line 120) and three links in [tasks/04-sibling-design-cross-refs.md](../tasks/04-sibling-design-cross-refs.md) (the inline link at line 7 plus two literal-path references at lines 16 and 51).
**Resolution:** Auto-resolved. Replaced every `../17-shared-pages/design.md` → `../_completed/17-shared-pages/design.md`, `../16-page-templates/design.md` → `../_completed/16-page-templates/design.md`, `../04-workflow-config-schema/design.md` → `../_completed/04-workflow-config-schema/design.md` in design.md (replace_all). Same `_completed/` insertion applied to tasks/04 (path string `designs/workflows-module/parts/17-shared-pages/design.md` → `…/_completed/17-shared-pages/design.md`).

## No Issues

The following were checked and are consistent:

- **review-1 decisions** — all 9 findings remain consistently propagated (no design-vs-task drift introduced by the unit-test rewrite).
- **Verification block + Task 1 handler-level smoke** — design.md:135-149 and tasks/01 "Handler-level smoke" section + acceptance criteria + Files list all agree: no `.test.yaml` file, manual smoke against demo, four Api scenarios deferred to Part 22.
- **Task 3 references to design.md:104-107** — line numbers still accurate after the verification rewrite.
- **Tasks.md ordering rationale** — Task 1 description ("handler-level smoke") matches Task 1 file content and design.md verification.
- **Path correctness for Parts 13, 18, 19, 20, 22** — these are all under the path they're already linked at. No changes needed.
