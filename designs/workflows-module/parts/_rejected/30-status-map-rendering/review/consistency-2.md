# Consistency Review 2

## Summary

Scanned design.md and review-1.md for Part 30 (no supporting files, tasks, or plan files exist yet). Found 3 inconsistencies — all auto-resolved. Two were internal contradictions in the decision-letter numbering; one was a stale cross-reference qualifier.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`
- **Related (for cross-reference checks):** `../28-custom-action-kind/design.md`, `../_completed/18-entity-components/`
- **Tasks / plans:** none exist yet
- **Code refs verified:** `modules/workflows/module.lowdefy.yaml`, `modules/workflows/components/actions-on-entity.yaml`, `modules/workflows/pages/workflow-overview.yaml`, `modules/workflows/pages/group-overview.yaml`, `plugins/modules-mongodb-plugins/src/connections/shared/` (line numbers in design.md confirmed against current code)

## Inconsistencies Found

### 1. Decision-letter numbering: duplicate D9, out-of-order D8, and orphaned D5a/D5b

**Type:** Internal Contradiction
**Source of truth:** Standard convention — sequential decisions, no duplicates, parent before letter-suffixed children
**Files affected:** `design.md`

The design used `D5a`, `D5b` _before_ a `D5`, then `D9` twice (lines 160 and 218), with `D8` appearing between the two `D9`s. The `D5a` / `D5b` naming implied they were sub-decisions of a parent `D5`, but the only `D5` in the doc was unrelated (about how display surfaces resolve `appName`) and physically came after them. The duplicate `D9` and out-of-order `D8` are leftovers from incremental edits across review cycles.

**Resolution:** Renumbered decisions sequentially:

| Was         | Is  | Topic                                     |
| ----------- | --- | ----------------------------------------- |
| D5a         | D5  | Sentinel for `kind: custom` links         |
| D5b         | D6  | Reserved keys inside a status_map cell    |
| D5          | D7  | How display surfaces know which `appName` |
| D6          | D8  | Caller-supplied per-app override          |
| D7          | D9  | Shape-only validation                     |
| D9 (first)  | D10 | Render context                            |
| D8          | D11 | One pipeline builder, three call sites    |
| D9 (second) | D12 | No backfill for in-flight action docs     |
| D10         | D13 | Render walks the cell tree                |

D1–D4 preserved (no changes there).

### 2. Stale cross-reference in Part 28

**Type:** Stale Reference
**Source of truth:** Part 30's renumbering (this consistency pass)
**Files affected:** `../28-custom-action-kind/design.md`

Line 51 of Part 28 references Part 30's "shape-only cell validation (D7)". After Part 30's renumbering, that decision is now D9.

**Resolution:** Updated Part 28 line 51: `(D7)` → `(D9)`. Part 28's reference to Part 30's `(D4)` remains valid — D4 was not renumbered.

### 3. Stale qualifier on Part 18 cross-reference

**Type:** Stale Reference / Stale Status
**Source of truth:** Filesystem state — `designs/workflows-module/parts/_completed/18-entity-components/` exists
**Files affected:** `design.md` (Related section, line 542)

The Related section said "[Part 18 — actions-on-entity](../_completed/) (if archived)". Part 18 _is_ archived (it lives at `_completed/18-entity-components/`), so the "(if archived)" hedge is stale, and the link pointed at the bare `_completed/` directory rather than the specific design.

**Resolution:** Updated the link to point at the actual file and dropped the "(if archived)" qualifier.

## No Issues

The following were checked and are consistent:

- **Code paths in "Current state" and "Files changed"** — verified against actual file locations (`connections/shared/`, `components/actions-on-entity.yaml`, `pages/workflow-overview.yaml`, `pages/group-overview.yaml`, `module.lowdefy.yaml`).
- **Line-number references** for display surfaces (92-99, 158/177/196, 274/293/312) match current code.
- **D1–D4 numbering and content** consistent with review-1's resolutions and with Part 28's references.
- **All review-1 resolutions** (paths under `connections/shared/`, `substituteActionIdSentinel.js` rename, shape-only validation, `buildActionStageUpdate` helper, `app_name` extension, no backfill, neutral app-slug placeholders, `start-workflow.yaml` / `makeWorkflowApis.js` in Modified list) are reflected in the current design.
- **No client-name leakage** in design or supporting text (verified `prp-team`, `prp-support`, `file:///Users/...` paths are absent).
- **No stale tasks / plans** — none exist for this part yet.
