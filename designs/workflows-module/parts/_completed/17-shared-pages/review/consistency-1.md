# Consistency Review 1

## Summary

Scanned part 17's small file tree (design.md + review-1.md) after the 13 review-1 findings landed. Found 4 inconsistencies, all auto-resolved against the decision register from review-1 and CLAUDE.md / user-memory rules.

## Files Reviewed

- **Design:** `designs/workflows-module/parts/17-shared-pages/design.md`
- **Reviews:** `designs/workflows-module/parts/17-shared-pages/review/review-1.md`
- **Tasks / Plan:** none (not yet generated for this part)
- **Supporting files:** none

## Inconsistencies Found

### 1. Design referenced review findings by number

**Type:** Stale Reference / Sourcing leak
**Source of truth:** Design should be readable standalone — review-finding numbers are sourcing artifacts.
**Files affected:** `design.md` lines 96, 99 (steps 3 and 6 of the task-page `onMount` sequence).
**Before:** "per the task-page allowlist defined in finding #7's resolution (covered in the dedicated subsection below)" and "covered by finding #6's resolution".
**Resolution:** Step 3 now points at the "Stale-URL redirect guards (task pages)" subsection (also fixed "below" → "above" — the subsection sits _before_ the `onMount` list in the document). Step 6 now points at the "Role gate" bullets on `task-edit` and `task-review`.

### 2. `dist/...` path cited in design.md and review-1.md

**Type:** Stale Reference / Project-rule violation
**Source of truth:** User memory rule `feedback_v0_references.md` — "Call prior-generation implementations 'v0' in designs/reviews; never cite the `/dist/...` path."
**Files affected:** `design.md` line 49; `review/review-1.md` finding #5 annotation.
**Before:** "v0 pattern from [`dist/.../workflow-overview.yaml`](../../../../dist/workflows-module/...)"
**Resolution:** Reworded both to reference v0 directly without the path: "preserves v0's `_array.concat` pattern for the same DataView" in design.md; "keeps v0's `_array.concat` pattern" in review-1.md annotation.

### 3. Verb namespacing inconsistency in verification bullet

**Type:** Internal Contradiction
**Source of truth:** The "Page event wiring" section (lines 63–74) uses `pages.{verb}.events.{handler}` with verbs matching form-action verbs (`edit` / `view` / `review`). Verification bullet at line 132 broke the pattern by using `pages.task-edit.events.onSubmit`.
**Files affected:** `design.md` line 132.
**Before:** "Task action with an author-supplied `pages.task-edit.events.onSubmit` fires the handler..."
**Resolution:** Standardized on `pages.edit.events.onSubmit` (the verb namespace, not the module-shipped page id). Added a clarifying sentence: "Same verb namespace (`edit` / `view` / `review`) as form actions — the `task-` prefix only appears on the module-shipped page filenames, not in author YAML."

### 4. Initial selector value not stated on `task-edit` description

**Type:** Internal Contradiction (missing forward reference)
**Source of truth:** The `onMount` sequence (step 7) says SetState primes `_state.status` to the action's current stage. The task-edit description didn't mention this default, leaving readers to infer it from the SetState step.
**Files affected:** `design.md` task-edit description (around line 19).
**Before:** Status selector bullet listed inputs but not the initial value.
**Resolution:** Added an "Initial value" bullet under the status-selector inputs: "the selector defaults to the action's current stage (`_request: get_action.status.0.stage`) so a same-stage save is a one-click action. Step 7 of the `onMount` sequence (`SetState`) primes `_state.status` accordingly."

## No Issues

- **Decision register coverage.** All 13 review-1 findings have their committed positions reflected in design.md (verified by spot-checking each).
- **Cross-references to other parts.** Parts 4, 13, 15, 16, 18, 19, 22, 24 all listed in both "Depends on" and "Contract to neighbours" with consistent descriptions of the relationship.
- **Stale-URL allowlist ↔ verification.** The allowlist table (lines 80–84) matches the stale-URL verification bullet (line 131) — `task-edit` redirects from `done` to `task-view`, consistent with the `[action-required, in-progress, changes-required]` allowlist.
- **`required_after_close` consistency.** The gate is stated identically on `task-edit` and `task-review`, with matching verification coverage.
- **Open questions hygiene.** Three open questions listed; none of them were resolved inline or made moot by review-1 decisions.
- **`_completed/` link paths.** All references to parts 15 and 19 use `../_completed/` consistently; non-completed parts (4, 13, 16, 18, 22, 24) use the direct path.
