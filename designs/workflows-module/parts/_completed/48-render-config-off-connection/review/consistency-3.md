# Consistency Review 3

## Summary

Checked the full design tree (`design.md`, `review-1.md`, `review-3.md`, prior `consistency-2.md`) after the review-3 resolutions, verified every code citation and cross-part reference against the repo, and audited the linked sibling designs (Parts 19, 38, 39, 40, 44, 46, 47) for drift. Found 5 inconsistencies, all auto-resolved; 1 cross-part item flagged for Part 40's owner without edits. No task or plan files exist yet.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-3.md` (chronology), `review/consistency-2.md` (context only)
- **Tasks / Plans:** none present
- **Cross-referenced designs:** `46-debundle-workflow-config/design.md`, `_rejected/47-per-workflow-submit-endpoints/design.md`, `_completed/{19-operational-apis,38-engine-rebuild,39-form-submit-buttons,44-tracker-start-link}/design.md`, `40-simple-action-surfaces/design.md`, `_next/49-request-changes-verb-gate/`
- **Code verified:** `makeWorkflowsConfig.js`, `makeWorkflowApis.js`, `loadWorkflowState.js`, `invokePreHook.js`, `invokePostHook.js`, `StartWorkflow.test.js`, `templates/*.yaml.njk`, `pages/workflow-action-*.yaml`, `module.lowdefy.yaml:142–144`, `apps/demo/api/leads-create.yaml:48`, `apps/demo/modules/companies/vars.yaml:34`

## Inconsistencies Found

### 1. Intro pointed the rename rationale at D2 instead of D6

**Type:** Stale Reference (internal)
**Source of truth:** design.md itself — proposed-change item 2 ("see **D6** for the rename rationale and full scope") and D6 (the rename decision, added by a later revision after the intro was written)
**Files affected:** `design.md` (intro ¶4, line 10)
**Resolution:** "renamed here for clarity and disambiguation (see D2)" → "(see D2 for the trace, D6 for the rename)" — D2 covers the ancestor trace, D6 holds the rename rationale/scope.

### 2. Layer line pointed the rename at D2 instead of D6

**Type:** Stale Reference (internal)
**Source of truth:** same as #1
**Files affected:** `design.md` (Layer line, line 12)
**Resolution:** "(`tracker.workflow_type` → `tracker.child_workflow_type`; see D2)" → "see D6".

### 3. D2 cited `makeWorkflowsConfig.js:230–283` for `validateTrackerStartLink`

**Type:** Stale Reference (internal contradiction with Current state)
**Source of truth:** the code — `validateTrackerStartLink` spans `makeWorkflowsConfig.js:229–289` (verified), matching the Current-state bullet's `:229–289`
**Files affected:** `design.md` (D2, line 47)
**Resolution:** Updated D2's citation to `:229–289` so both citations of the same function agree and match the file.

### 4. Current state cited `ACTION_FIELDS` as `:7–17`

**Type:** Stale Reference
**Source of truth:** the code — the `ACTION_FIELDS` array literal spans `makeWorkflowsConfig.js:7–18` (verified); review-1 and review-3 both cite `:7–18`
**Files affected:** `design.md` (Current state, first bullet)
**Resolution:** `:7–17` → `:7–18`.

### 5. Part 46 D3 contradicts Part 48 with no forward-reference

**Type:** Internal Contradiction (cross-design)
**Source of truth:** Part 48 D1/D5 (the later, reviewed decisions) — Part 48's Related section already records "D1 here narrows its D3"
**Files affected:** `46-debundle-workflow-config/design.md` (D3)
**Resolution:** Part 46 D3 says "the connection keeps the **full** validated config" and its third bullet argues _for_ the generic Start/Cancel/Close endpoints ("per-workflow variants would force every generic caller to construct endpoint ids from runtime data") — the exact endpoints Part 48 D5 retires and the exact regression D5 deliberately accepts. Part 47 carries a supersession banner but Part 46 had no equivalent note, so a reader of 46 alone would treat D3 as permanent. Added a blockquote under the D3 heading: narrowed by Part 48 — D1 moves `status_map` off the blob, D5 retires the generic endpoints, accepting the third bullet's regression.

## Flagged, not edited

- **Part 40 still targets the retired `update-action-{action type}` endpoint id** (`40-simple-action-surfaces/design.md:26,93,254`). That id was renamed to `{type}-{action}-submit` by Part 38 (commit `9748a6e`, "emitted-id naming"), and Part 48 will change it again to `{type}-submit`. Part 48's call-sites table already records the coordination ("Parts 39/40 own the submit buttons — coordinate so they re-point once"), and Part 40 is paused until Part 46 lands, so the correct target id depends on landing order — left to Part 40's own revision rather than edited from here.

## No Issues

- **Review-3 resolutions all propagated:** hooks treatment (D7 + item 3 — sibling property keyed by action type, `handleSubmit` re-slice, tracker-skip + reserved-type-guard invariants), acyclicity check (D2 + D6 + schema-example validation note), lifecycle override channel (D8 + intro item 2 + items 5–6 + endpoint examples + Current state), call-sites-and-sequencing section, missing-key contract + idempotent in-place merge at the item-4 seam.
- **Review-1 resolutions remain intact** (re-confirmed after the review-3 edits): two-mechanism framing, merge-at-load seam, D4's two concrete changes, D5 (no generic endpoint), `makeActionPages.js:19` separability scoping.
- **Code citations verified against the working tree:** `makeWorkflowApis.js:72` (`{type}-{action}-submit`), `:109–112` (reserved-type guard), `:117–118` (tracker skip), `loadWorkflowState.js:110` (`.find`, no clone), `invokePreHook.js:82` / `invokePostHook.js:43`, `StartWorkflow.test.js:76,433`, templates' stale `update-action-` ids (`edit.yaml.njk:252`, `workflow-action-edit.yaml:202`), demo start callers (`leads-create.yaml:48`, `companies/vars.yaml:34`), manifest `_ref`s (`module.lowdefy.yaml:142–144`).
- **"Pre-Part-38 rename" attribution in the call-sites table:** correct — commit `9748a6e` (Part 38 task 6) renamed `update-action-{type}` → `{type}-{action}-submit` in `makeWorkflowApis`.
- **Related links:** all five resolve (`46`, `_rejected/47`, `_completed/44`, `_completed/19`, `_completed/38`); Part 47 carries its supersession banner pointing back at Part 48; "Part 39 is `_completed`; Part 40 is active" matches the repo.
- **No leftover OQ/pending/TBD language** in design.md.
- **New Part 49 (`_next/49-request-changes-verb-gate`):** no overlap with Part 48's surfaces (no references to `render_config`, submit endpoint ids, or `event_overrides`).
