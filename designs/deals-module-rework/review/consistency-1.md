# Consistency Review 1

## Summary

Checked `design.md` against the review-1 decision register (10 findings, all resolved) after the action-review edits. Found 2 internal inconsistencies — both stale references introduced by the edits — and auto-resolved both. No tasks/plan files exist yet, so this was a pure design-internal pass.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (10 findings, all `Resolved` / `Resolved (auto)`)
- **Supporting / tasks / plans:** none exist.

## Inconsistencies Found

### 1. B3 cross-reference to the note-capture open question was stale

**Type:** Stale Reference
**Source of truth:** design.md Open questions list (renumbered during action review)
**Files affected:** `design.md` B3 (§Workstream B)
**Resolution:** B3 pointed at "open question #2" for the note-capture home, but after findings #6 and #8 removed the outcome and PR-strategy open questions, note-capture home became open question **#1**. Updated the B3 reference #2 → #1.

### 2. Verification described the open-items widget as a single "open-actions widget"

**Type:** Internal Contradiction (Review-vs-Design)
**Source of truth:** review-1 finding #4 resolution (split by ownership)
**Files affected:** `design.md` Verification (§Verification)
**Resolution:** Finding #4 split the unified widget into an open-actions card (workflows) + open-tasks card (activities), but the Verification runtime step still said "the open-actions widget" (singular). Updated to "the open-actions and open-tasks cards render" so verification matches B1.

## No Issues

- **A1–A4 (Workstream A):** connection_id var, stored-field approach, hardcoded-string audit, and reconstitution mapping are internally consistent; the A2 rationale matches finding #1's resolution (consistency/de-couple/read-cost, sort-by-value as future benefit only).
- **B1–B5:** the split (B1), task seams (B2), note-capture seams (B3), gap closes (B4), and net-change list (B5) agree with findings #4, #3, #2; B5's deletion list matches the components extracted in B1–B3.
- **Workstream C:** the send-quote lightweight-page and carried-over deal-outcome decisions (findings #5, #6) are reflected in both the per-action table and the C-wiring section, consistent with each other.
- **Sequencing & PR strategy:** fold-in + commit boundaries match finding #8; the commit list matches the A/B/C workstream structure.
- **Hard constraint + A4 + Verification gate:** the host-reconstitution constraint, mapping, migration, and manual (non-CI) gate are mutually consistent.
- **Open questions:** the two remaining (note-capture home, value fallback) are correctly numbered after removals; no other section references the removed questions.
- **Client-scrub:** no client identifiers reintroduced; "the host" / "generalize" terminology consistent throughout.
