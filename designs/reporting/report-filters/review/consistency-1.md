# Consistency Review 1

## Summary

Checked `design.md` against the eleven resolutions in `review-1.md` (all annotated: 4 `Resolved (auto)`, 7 `Resolved`). Seven inconsistencies found — mostly text that the action review's edits made stale elsewhere in the same document — all auto-resolved with no user input needed. No task or plan files exist yet, so there was no design-vs-task surface to check.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`
- **Supporting / tasks / plans:** none exist.
- **Cross-referenced (not modified in this pass):** `../ux/design.md`, `../open-query-engine/design.md` — both gained pointers during the action review; verified those pointers resolve and are reciprocated.

## Inconsistencies Found

### 1. The intro still claimed the design widens nothing

**Type:** Review-vs-Design
**Source of truth:** review-1 #1 resolution (raise `MAX_ARRAY_LITERAL_LENGTH` to 500) and the risk entry it added
**Files affected:** `design.md` (opening paragraph)
**Resolution:** "Nothing here widens what the agent may query, and no new security boundary is introduced" now separates the two claims: no new boundary and no widening of _what_ may be queried, with the one quantitative cap move named up front and pointed at the argument below. Leaving the absolute claim would have contradicted the design's own accepted risk.

### 2. `MAX_ARRAY_LITERAL_LENGTH` still annotated as 100

**Type:** Internal Contradiction
**Source of truth:** review-1 #1 resolution; §_Raising `MAX_ARRAY_LITERAL_LENGTH` to 500_
**Files affected:** `design.md` §_The connection needs no new value validation_
**Resolution:** Dropped the stale `(100)` parenthetical. The paragraph two below it already states the new number and the invariant, so the cap is named once, in the section that owns it. (The `(100)` in _Current state_ is correct and stays — that section describes today's code.)

### 3. "the same four files" undercounted after two files were added

**Type:** Stale Reference
**Source of truth:** review-1 #2 (`report.yaml`) and #3 (`verifyContract.js`), both of which added entries to _Files changed_
**Files affected:** `design.md` §_Why this, and why now_
**Resolution:** Changed to "the same files". The sentence's argument — that the three capabilities land in one place, so splitting them means touching it twice — never depended on the count.

### 4. The `optionsQuery` decision section read as if the contract keys survive `validateQuery`

**Type:** Review-vs-Design
**Source of truth:** review-1 #4 resolution
**Files affected:** `design.md` §_Query-sourced options_
**Resolution:** #4 was resolved in _Files changed_ only, leaving the decision section saying `validateQuery` "ignores the extra keys" without saying they must be re-attached — the exact reading that sets the trap. Added one clause stating the re-attachment and pointing at the fuller note.

### 5. Architecture step 1 omitted the allowed-key check

**Type:** Review-vs-Design
**Source of truth:** review-1 #8 resolution
**Files affected:** `design.md` §_Architecture / data flow_
**Resolution:** Step 1 now runs the key check before the per-key validation, matching the order the `validateReportSpec.js` bullet and the any/all decision section describe.

### 6. The verification list had drifted from the test list

**Type:** Internal Contradiction
**Source of truth:** review-1 #1, #3 and #11 resolutions (all of which extended _Files changed_ → Tests)
**Files affected:** `design.md` §_Demo consumer_ → "How this is verified"
**Resolution:** Two lists in the same document described different coverage. The verification list now matches: per-outcome Alert degradation and the dotted-field case under `compileReport.test.js`, the allowed-key rejection under `validateReportSpec.test.js`, plus the two test files the action review introduced — `verifyContract.test.js` and `validatePipeline.test.js`.

### 7. _Related_ omitted the UX design and left the wireframe deck unlinked

**Type:** Stale Reference
**Source of truth:** review-1 #6 resolution (the sheet named as a second author, cross-referenced from the UX design's proposal 8)
**Files affected:** `design.md` §_Related_
**Resolution:** Added a `../ux/design.md` bullet naming the reciprocal pointer, noted on the open-query-engine bullet that its cap entry records the raise, and pointed the wireframe-deck bullet at `../ux/wireframes.html` instead of leaving it as bare prose.

## No Issues

Checked and consistent:

- **Proposals 1–8 vs. the decision sections.** Each proposal's claims match the section that argues it, including the amended proposals 6 (three degradation outcomes) and 7 (both caps).
- **Wire format tables vs. `FILTER_OPS` and the triples.** `any | all` in the spec, `in | all` in the triples, with the naming sentence #10 added; the `FILTER_OPS` map matches `buildFilterMatch`'s described behaviour.
- **Resolved questions 1–8 vs. the decisions.** Question 3 carries the amended cap answer; the rest still match their sections.
- **Non-goals vs. the body.** The 500-option threshold in the autocomplete non-goal matches the cap; per-element filtering, post-`$group` binding and cross-filter dependency are each argued in exactly one place.
- **Risks vs. decisions.** Every risk points at the mitigation the design actually adopts, including #7's reordering (instructions first, sheet second) and #1's new widening entry.
- **_Current state_ vs. source.** Line references, constant values and current behaviour still describe the code as it stands, unchanged by this design's proposals.
- **Demo consumer vs. #11's decision.** The Companies filter stays on `demo_activities.company_ids`; the dotted field appears only as a unit-test case, which is what was decided.
