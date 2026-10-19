# Consistency Review 2

## Summary

Checked the full design tree (`design.md` + `review-1.md`) for drift between review-1's resolved decisions and the design body. Found 2 inconsistencies, both stale phrasings left behind when review-1 finding #4 converted OQ1 into D5; both auto-resolved. No task or plan files exist yet.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`
- **Supporting / Tasks / Plans:** none present

## Inconsistencies Found

### 1. D3 still frames the Start/Cancel/Close convenience question as an open question

**Type:** Internal Contradiction (Review-vs-Design)
**Source of truth:** review-1 finding #4 — `> **Resolved.** OQ1 is converted to decision D5 … Updated proposed-change item 3 (dropped the "pending" hedge).`
**Files affected:** `design.md` (D3, line 50)
**Resolution:** Line 50 read "… is the open question below." D5 below now decides this question (per-workflow endpoints, accepted ergonomic regression). Updated to "… is taken up, and accepted as a deliberate regression, in D5 below." so D3 no longer calls open what D5 decides.

### 2. Dangling "second pending item" reference in D4

**Type:** Stale Reference
**Source of truth:** review-1 finding #4 — the enumerated OQ/"pending items" framing was retired when OQ1 became D5.
**Files affected:** `design.md` (D4, line 61)
**Resolution:** Line 61 read 'This resolves the second pending item ("allow internal signal overrides").' The ordinal "second pending item" pointed to a pending-items list that no longer exists in the doc. Rewrote to 'This closes the long-standing "allow internal signal overrides" gap.' — same claim, no dangling enumeration.

## No Issues

- **Finding #1 (event_overrides not on blob → two-mechanism reframe):** propagated correctly — intro ¶3/¶5, proposed-change item 1, D1, and Current state bullets all describe `status_map` as the sole de-bloat target and `event_overrides` as already-off-blob reach extension.
- **Finding #2 (merge-at-load seam):** propagated — proposed-change item 4 and D2 describe `loadWorkflowState` splicing the render slice onto every action; planners stay pure.
- **Finding #3 (D4 two concrete changes):** propagated — D4 names both the `planTrackerLevel` threading and the `planEventDispatch` `isSubmit` gate widening; `planSubmit` reads `actionConfig.event_overrides[signal]`.
- **Finding #5 (status_map second consumer):** propagated — D1 parenthetical scopes the separability claim and names `makeActionPages.js:19`.
- **Line-number citations** across Current state, D3, and D4: confirmed accurate by review-1; unchanged.
