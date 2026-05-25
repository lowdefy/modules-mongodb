# Consistency Review 1

## Summary

Scanned part 19's `design.md` and `review-1.md` annotations after the action-review pass. Found three drifts — one inside the part (stale forward-reference, answered "open question") and two cross-part (parts 22 and 23 still talked about part 19 as if the close-workflow addition hadn't landed). All three auto-resolved; one cross-part fix surfaced via AskUser before applying.

## Files Reviewed

- **Design (this part):** [`designs/workflows-module/parts/19-operational-apis/design.md`](../design.md)
- **Reviews:** [`designs/workflows-module/parts/19-operational-apis/review/review-1.md`](designs/workflows-module/parts/_completed/19-operational-apis/review/review-1.md)
- **Cross-part references checked:** [`designs/workflows-module/parts/17-shared-pages/design.md`](../../17-shared-pages/design.md), [`designs/workflows-module/parts/18-entity-components/design.md`](../../18-entity-components/design.md), [`designs/workflows-module/parts/20-module-manifest/design.md`](../../20-module-manifest/design.md), [`designs/workflows-module/parts/22-workflows-e2e-suite/design.md`](../../22-workflows-e2e-suite/design.md), [`designs/workflows-module/parts/23-close-workflow-handler/design.md`](../../23-close-workflow-handler/design.md)
- **Concept docs:** [`designs/workflows-module-concept/module-surface/spec.md`](../../../../workflows-module-concept/module-surface/spec.md) (already updated during action review)

No `tasks/` or `plan/` directories exist for part 19 yet.

## Inconsistencies Found

### 1. Stale "see #4" forward-reference inside design.md

**Type:** Internal contradiction (stale reference)
**Source of truth:** [review-1 #4](designs/workflows-module/parts/_completed/19-operational-apis/review/review-1.md#4-_userroles-source-not-specified--pulled-from-where) — the resolution added an anchor section under "Access enforcement"; the in-text cross-reference was meant to point at it.
**Files affected:** [`design.md:45`](../design.md) — the `get-entity-workflows` access-rule bullet ended with `(empty or missing access.roles = no gate; see #4)`. Numbered references are review-file convention, not design-file convention; readers of the design have no #4.
**Resolution:** Rewrote the tail to `(empty or missing access.roles = no gate; see [Access enforcement](#access-enforcement) below)`.

### 2. Answered question still listed under "Open questions"

**Type:** Review-vs-design drift
**Source of truth:** [`design.md:58`](../design.md) (in-scope commitment) — `get-workflow-overview` returns `{ workflow: null, actions: [] }` and the page redirects back; access-vs-existence is intentionally collapsed.
**Files affected:** [`design.md:102`](../design.md) — "Open questions" still listed the `get-workflow-overview` access-denial response as open, while spelling out the chosen answer in the same bullet ("Ship null-object so page-side redirect logic is simpler").
**Resolution:** Removed the open question, replaced with a one-line "None — decided here" note linking back to the API section. This was the only open question; the section now reads "_None — `get-workflow-overview` access-denial response is committed…_".

### 3. Cross-part: stale "Part 19's design needs updating" callout in part 23

**Type:** Cross-part stale status note (Phase 3f)
**Source of truth:** Part 19's [review-1 #12](designs/workflows-module/parts/_completed/19-operational-apis/review/review-1.md#12-close-workflow-api-not-yet-in-the-specs-api-list) resolution landed `close-workflow` in part 19's design (line 7), part 20's manifest (already there), and the concept spec.
**Files affected:** [`23-close-workflow-handler/design.md:61`](../../23-close-workflow-handler/design.md) — "Part 19's design and exports list need updating to include this fifth API." Now past tense.
**Resolution:** Rewrote to past tense with back-link to review-1 #12. User approved touching files outside the part 19 scope via AskUser.

### 4. Cross-part: stale spec-file-listing comment in part 22

**Type:** Cross-part stale reference
**Source of truth:** [`22-workflows-e2e-suite/design.md:72`](../../22-workflows-e2e-suite/design.md) (test-matrix table row 19) already lists `close-workflow end-to-end (from part 23)`; the inline comment at line 34 was lagging.
**Files affected:** [`22-workflows-e2e-suite/design.md:34`](../../22-workflows-e2e-suite/design.md) — the comment after `operational-apis.spec.js` listed only `start / cancel / get-entity-workflows / get-workflow-overview`.
**Resolution:** Added `close` to the inline comment so it matches the matrix row below.

## No Issues

- **Cross-references to part 19 from parts 5, 7, 17, 18, 20, 21** all still hold — they describe contracts (consume `get-entity-workflows`, consume `get-workflow-overview`, declare APIs in `exports.api`) that the current design still ships.
- **"Depends on"** correctly names parts 5, 7, 23 with rationale.
- **"Contract to neighbours"** correctly lists all five APIs and the four consuming parts (17, 18, 20, 23).
- **Concept-spec edits** for finding #12/#13 (close-workflow row in the API table + `exports.api` list) propagated correctly during action review.
- **"User-initiated" rename** propagated cleanly across part 19, part 23, and the top-level workflows-module `design.md`.
- **Verification section** unit-test list covers all five APIs; e2e cross-reference to part 22 holds.
