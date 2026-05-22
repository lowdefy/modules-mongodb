# Consistency Review 1

## Summary

Scanned design.md against review-1.md (14 findings, 13 resolved + 1 deferred) and review-2.md (3 findings, all resolved). Six inconsistencies found — all auto-resolved. No user-resolved items, no remaining open questions.

## Files Reviewed

**Design:**
- `design.md`

**Reviews (chronological):**
- `review/review-1.md` (14 findings)
- `review/review-2.md` (3 findings — `ActionSteps`-based widget shape)

**Supporting / tasks / plans:** none exist for this part. The design hasn't been broken into tasks yet.

**Cross-design references verified to resolve:**
- Part 4 → `parts/_completed/04-workflow-config-schema/design.md`
- Part 12 → `parts/12-resolver-pages/design.md` (top-level, correct)
- Part 16 → `parts/_completed/16-page-templates/design.md`
- Part 17 → `parts/17-shared-pages/design.md`
- Part 19 → `parts/_completed/19-operational-apis/design.md`
- Part 20 → `parts/20-module-manifest/design.md`
- Part 21 → `parts/_completed/21-entity-type-to-collection/design.md`
- Part 22 → `parts/22-workflows-e2e-suite/design.md` (top-level, correct)
- Part 24 → `parts/24-universal-fields/design.md`
- `ActionSteps` block → `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/`
- `recomputeGroups.js`, `handleSubmit.js`, `StartWorkflow.js`, `access_filter.yaml`, `get-entity-workflows.yaml`, `get-workflow-overview.yaml` — all verified to exist on the shipped paths cited.

## Inconsistencies Found

### 1. `Goal` described `action_role_check` as "verb / role gate primitive"

**Type:** Review-vs-Design drift.
**Source of truth:** review-1 #7 — resolved to roles-only; design.md:142 makes "No verb-membership check" explicit.
**Files affected:** `design.md:7`.
**Resolution:** Auto-resolved. Changed "verb / role gate primitive" → "role gate primitive" in the Goal section.

### 2. `workflow-header` opener still said the entity-page slot was "per-group sections"

**Type:** Review-vs-Design drift.
**Source of truth:** review-2 #1 + design.md:40, 94 — `actions-on-entity`'s slot is "a single `ActionSteps` block per workflow," not per-group sections.
**Files affected:** `design.md:57`.
**Resolution:** Auto-resolved. Replaced "slot = per-group sections" with "slot = a single `ActionSteps` block per workflow" in the `workflow-header` opening paragraph.

### 3. `actions-on-entity` vars-contract trailer mentioned "status-map rendering" as hardcoded behaviour

**Type:** Review-vs-Design drift.
**Source of truth:** review-2 #1 — per-action rendering (status badge, status_map message, link) was delegated to the `ActionSteps` block.
**Files affected:** `design.md:33`.
**Resolution:** Auto-resolved. Reworded the trailer to "iteration, client-side grouping + sort, `ActionSteps` data prep is hardcoded; per-action rendering itself is delegated to the `ActionSteps` block."

### 4. `Out of scope / deferred` was missing the entity-kind label deferral

**Type:** Review-vs-Design drift.
**Source of truth:** review-1 #14 — deferred to v1.x; no design entry tracking it.
**Files affected:** `design.md` (Out of scope / deferred section).
**Resolution:** Auto-resolved. Added a bullet citing part 17's "may consume `vars.entities[entity_collection].title`" wording, the v1.x deferral, and the "additive when needed" escape hatch.

### 5. `Contract to neighbours` only listed parts 19 and 20

**Type:** Review-vs-Design drift.
**Source of truth:** review-1 #2 + #4 + #5 and review-2 #2 — Part 18 has concrete contracts with parts 16, 17, 24, and the `ActionSteps` block.
**Files affected:** `design.md` (Contract to neighbours section).
**Resolution:** Auto-resolved. Expanded the section to six bullets: part 16 + part 17 (call `action_role_check` at step 6), part 17 (composes `workflow-header` with the workflow doc + `is_overview_page: true`), part 19 (data path — both Apis), part 20 (manifest export), part 24 (reads `_state.action_allowed`), and the `ActionSteps` plugin block (consumed by `actions-on-entity`).

### 6. Stale links: `[part 21](../21-entity-type-to-collection/...)` and `[part 4](../04-workflow-config-schema/...)`

**Type:** Stale reference.
**Source of truth:** Filesystem — both parts live under `parts/_completed/`. Same shape as review-1 #13, which fixed the Part 19 link.
**Files affected:** `design.md:31` (part 21), `design.md:163` (part 4).
**Resolution:** Auto-resolved. Updated both links to point at `../_completed/`.

## No issues found in

- **Review annotations** — all 17 findings across reviews 1 and 2 are annotated with a resolution status.
- **Open questions** — only `workflow-header` collapse state persistence remains, which is the original design's open question (not raised by either review).
- **Verification section** — covers all the v1 behaviour committed by the resolved findings (multi-workflow tie-break demo, `workflow-header` link button, refresh-on-back-nav, `ActionSteps` integration).
- **Refresh-after-submit section** — matches review-1 #8's resolution exactly; no socket-based refresh leaked in from review-2's scope question.
- **Internal cross-references** within design.md (anchors, "see X below" pointers) — all resolve.

## Cross-design follow-ups (already logged in review-2.md, no part-18 action)

- Part 17 design.md:50, 173, 191 — `DataView` → `DataDescriptions` swap.
- Part 25 design.md:35, 93 — same swap.
- Part 17 design.md:182 — lingering open question on tracker linking that contradicts part 17:53 and Part 18 review-1 #9. Should be closed in part 17's next consistency pass.
