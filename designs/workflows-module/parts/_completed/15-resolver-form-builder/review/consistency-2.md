# Consistency Review 2

## Summary

Scanned part 15's design.md, tasks/, and review/ against review-2's three resolutions, plus part 16 (the only neighbour the review touched). Found **1 inconsistency**: task 4 (resolvers README) didn't reflect the new `mode` input var on `makeActionsForm` introduced by review-2 finding 1. Auto-resolved. Consistency-1's earlier propagations to parts 12 / 14 / 17 / top-level design / implementation-plan remain valid — review-2 didn't change any of those touchpoints.

## Files Reviewed

**Design (target):**

- [`designs/workflows-module/parts/15-resolver-form-builder/design.md`](../design.md)

**Reviews (target):**

- [`designs/workflows-module/parts/15-resolver-form-builder/review/review-1.md`](designs/workflows-module/parts/_completed/15-resolver-form-builder/review/review-1.md) — 12 findings, all resolved; propagation tracked in consistency-1.
- [`designs/workflows-module/parts/15-resolver-form-builder/review/review-2.md`](designs/workflows-module/parts/_completed/15-resolver-form-builder/review/review-2.md) — 3 findings: #1 Resolved (option 1, `mode` + `viewOnly` filter); #2 Resolved (part-15 contract note + part-16 verification bullet); #3 Accepted (no design change).
- [`designs/workflows-module/parts/15-resolver-form-builder/review/consistency-1.md`](designs/workflows-module/parts/_completed/15-resolver-form-builder/review/consistency-1.md) — previous consistency pass on review-1 propagation.

**Tasks:**

- [`tasks/tasks.md`](../tasks/tasks.md)
- [`tasks/01-make-actions-form.md`](../tasks/01-make-actions-form.md)
- [`tasks/02-make-action-form-configs.md`](../tasks/02-make-action-form-configs.md)
- [`tasks/03-manifest-wiring.md`](../tasks/03-manifest-wiring.md)
- [`tasks/04-resolvers-readme.md`](../tasks/04-resolvers-readme.md)
- [`tasks/05-view-only-filter.md`](../tasks/05-view-only-filter.md)

**Neighbouring designs scanned for drift:**

- [`designs/workflows-module/parts/16-page-templates/design.md`](../../16-page-templates/design.md) — only neighbour review-2 touched.

**Not re-scanned this pass:** parts 12, 14, 17, the top-level workflows-module design.md, and the implementation-plan. Review-2's three findings don't change any contract those files depend on; their consistency was already validated in consistency-1.

## Inconsistencies Found

### 1. Task 4 README spec didn't carry the new `mode` input on `makeActionsForm`

**Type:** Design-vs-Task drift
**Source of truth:** Review-2 finding 1 resolution and the updated [design.md "In scope" bullet](../design.md) — `makeActionsForm` accepts `mode: 'edit' | 'view' | 'review' | 'error'` alongside `form:`; the resolver drops `viewOnly: true` entries when `mode === 'edit'` and strips the `viewOnly` key from emitted entries in all modes.
**Files affected:** [`tasks/04-resolvers-readme.md`](../tasks/04-resolvers-readme.md), `makeActionsForm.js` subsection (Inputs / Output / Invocation lines).
**Resolution:** Updated the subsection to:

- **Inputs:** `{ form: FormEntry[], mode?: 'edit' | 'view' | 'review' | 'error' }` — `mode` required when any entry carries `viewOnly: true`, optional otherwise.
- **Output:** added the `viewOnly` filter semantics — dropped on `edit`, surviving with `viewOnly` stripped on the other three modes.
- **Invocation:** added `mode: <verb>` to the example template call.

## No Issues

- **Task 1** unchanged on purpose — task 5 is additive, lands the `viewOnly` filter on top of the v1 baseline. The split is auditable in tasks.md and called out in task 5's "Why this is a follow-up task and not folded into task 1" section.
- **Task 2** unchanged — `makeActionFormConfigs` is mode-agnostic; `viewOnly` is render-time, not metadata. Task 5's "Do not touch `makeActionFormConfigs`" note holds.
- **Task 3** unchanged — only `makeActionFormConfigs` is manifest-registered; the manifest wiring is unaffected by `viewOnly`.
- **Task 5** internally consistent — `VALID_MODES` array correct; acceptance criteria match the design bullet; the "follow-up rationale" section makes the v1-baseline-vs-parity split explicit.
- **Part 16 design.md** — review-2 finding 1 added a `mode` literal to the resolver call site; review-2 finding 2 added the form-card parity verification bullet. Both edits were made in the action-review pass and re-verified here.
- **Review annotations** — all three review-2 findings carry resolution blockquotes; no orphans.
- **Open questions in design.md** — no new ones introduced by review-2; the existing list (none on this part) is unchanged.
- **Verification list in design.md** — `viewOnly` filter test bullet added; no stale entries.
