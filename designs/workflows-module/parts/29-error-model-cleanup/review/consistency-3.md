# Consistency Review 3

## Summary

Audited design.md, both reviews, and all eight task files for drift between the design's resolved decisions and the task instructions. Found two clear Design-vs-Task contradictions where the task files still encoded pre-review-resolution behaviour; both auto-resolved against the design + review-2 resolutions. No open questions.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-upstream-lowdefy-reject-flag.md`, `tasks/02-concept-spec-amendments.md`, `tasks/03-part-1-and-part-6-design-notes.md`, `tasks/04-types-cleanup.md`, `tasks/05-handlesubmit-remove-catch-converter.md`, `tasks/06-handlesubmit-new-failure-tests.md`, `tasks/07-part-13-no-trailing-reject-step.md`, `tasks/08-part-22-e2e-specs.md`

## Inconsistencies Found

### 1. Task 01's `runRoutine.js` patch shape predates the review-2 #1 resolution

**Type:** Design-vs-Task / Review-vs-Task drift
**Source of truth:** `design.md` lines 143–158 + `review-2.md` finding #1 (resolved with option 1 — branch on `isReject` *before* `context.handleError`)
**Files affected:** `tasks/01-upstream-lowdefy-reject-flag.md`

The design's Upstream-dependency section pins the catch rewrite as:

```js
} catch (error) {
  if (error.isReject) {
    return { status: 'reject', error };
  }
  if (!error.handled) {
    await context.handleError(error);
    error.handled = true;
  }
  return { status: 'error', error };
}
```

Review-2 #1 explicitly resolved that rejects must bypass `handleError` so production hosts wiring it to Sentry don't get noise from deliberate user-facing rejections. Task 01 instead carried the older shape that invokes `context.handleError(error)` unconditionally and then returns `{ status: error.isReject ? 'reject' : 'error', error }` — i.e. propagated rejects fired `handleError`, contradicting the resolution.

**Resolution:** Replaced the `runRoutine.js` code block, the file-list bullet, the acceptance criteria, and the PR-description guidance in Task 01 to match the design — branch on `isReject` before `handleError`, add an acceptance bullet asserting `handleError` is not called for `isReject` throws, and extend the PR-description note to call out the preserved `handleError` invariant.

### 2. Task 05 instructs implementer to keep per-step annotate-and-rethrow blocks that the design says to delete

**Type:** Design-vs-Task / Review-vs-Task drift
**Source of truth:** `design.md` lines 9 + 205–206 + `review-2.md` finding #2 (resolved with option 1 — delete the four per-step `try/catch` blocks outright)
**Files affected:** `tasks/05-handlesubmit-remove-catch-converter.md`

The design says the four per-step annotate-and-rethrow blocks at lines 216–218, 297–300, 339–341, and 347–349 of `handleSubmit.js` are deleted along with the catch-converter — their only consumer was `err.step` on the catch-converter's `reason` field, the lifecycle step is recoverable from the stack frame, and bare propagation preserves `isLowdefyError`. Review-2 #2 explicitly picked option 1 ("delete outright") over option 2 ("keep and document a Sentry consumer").

Task 05 contradicted this in three places: the Context section ("Per-step annotate-and-rethrow blocks ... stay as-is"), the Task body ("**Keep the per-step annotate-and-rethrow blocks**"), and the Notes ("The per-step annotate-and-rethrow blocks must stay"). Each justified retention with "tag the step name onto the error for Sentry context" — the option-2 framing the review rejected.

**Resolution:** Rewrote all three locations in Task 05 to instruct deletion. Replaced "keep" instructions with a bullet listing the four exact line ranges to delete and a one-line justification (bare propagation preserves the original error object, lifecycle step recoverable from stack frame, aligns with D6). Also folded in the missing JSDoc bullet from `design.md` line 206: `handleSubmit.js`'s `@returns` JSDoc at lines 60–70 — drop `error_transition?`, narrow `pre_hook_response` / `post_hook_response` from `any | null` to success-only.

## No Issues

The following areas were checked and found consistent:

- **`tasks/tasks.md` ordering and dependency graph** — matches the task numbering and the design's stated coupling.
- **Task 02 (concept-spec amendments)** — agrees with design's "What this changes → Concept specs" inventory across `engine/spec.md`, `submit-pipeline/spec.md`, `ui/spec.md`, and `action-authoring/spec.md` (no edit).
- **Task 03 (Part 1 + Part 6 design notes)** — Part 1 deviation note and Part 6 § Failure shape rewrite both match the design's review-1 #3 + #1 resolutions, including the `result.success`-isn't-a-callApi-envelope follow-up (review-2 #6).
- **Task 04 (types cleanup)** — `StatusEntry` shape and `error_transition` removal match D2a's resolved framing.
- **Task 06 (new unit tests)** — nine tests cover the design's listed unit-test scenarios; the `:reject` mock pattern (`UserError` with `isReject: true`) matches the upstream contract from Task 01.
- **Task 07 (Part 13 verification)** — no-trailing-`:reject`-step posture matches design's D5 + Contract-to-neighbours statements + review-1 #8 + review-2-confirmed contract.
- **Task 08 (Part 22 E2E specs)** — both new specs cover the design's E2E scenarios; the existing `resolve_error` slice is preserved.
- **Design's internal cross-references** — D1 ↔ D2 ↔ D2a ↔ D5 ↔ D6 cross-references all resolve to the same decisions; no internal contradictions surfaced.
- **Status / dependency notes** — Part 9 / Part 13 in-flight references match current branch state (per the original git status snapshot at session start); no stale "blocked on / deferred until" notes.
