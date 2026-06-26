# Task 11: Demo e2e cleanup

## Context

With the test app carrying coverage, the demo's role shrinks to executable documentation. Per the design's "The demo's role": the demo keeps `onboarding-happy-path.spec.js` (curated example smoke, already green) and does **not** grow exhaustive coverage. Two old skipped specs are deleted — their intent now lives elsewhere:

- `apps/demo/e2e/workflows/error-push-and-resolve.spec.js` → revived in the test app's `error-recovery` cluster (task 6 — hence the dependency).
- `apps/demo/e2e/workflows/transient-throw-retry.spec.js` → CAS-conflict coverage is **unit-only** by design decision ("Salvaged" section): the e2e revival was evaluated and dropped because two HTTP requests against a single server usually serialize and the conflict never fires, and any forcing seam would be a backdoor. Owned by `SubmitWorkflowAction.test.js` + `commitPlan.test.js`. No replacement needed.

One design open question lands here: **`form-submit-buttons.spec.js` disposition.** The design's lean: keep in demo while green, retire if it duplicates a test-app spine assertion.

## Task

1. Delete `apps/demo/e2e/workflows/error-push-and-resolve.spec.js` and `apps/demo/e2e/workflows/transient-throw-retry.spec.js`.
2. Run the demo suite (`pnpm --filter @lowdefy/modules-demo e2e`); `onboarding-happy-path.spec.js` must stay green.
3. **Resolve the `form-submit-buttons.spec.js` question now** (don't defer): run it. If green **and** its button-gating assertions are not subsumed by the test app's `access-verbs`/`form-lifecycle` spine assertions (compare what each actually asserts, not their topics), keep it and note the decision in the spec's header comment. If red, or if every one of its assertions has a test-app equivalent, delete it and note which test-app spec owns each assertion in the commit message.
4. Verify nothing else in the demo references the deleted specs (grep `apps/demo` for the filenames).

## Acceptance Criteria

- Both skipped specs deleted; demo suite green.
- `form-submit-buttons.spec.js` either kept-with-rationale (header comment) or deleted-with-mapping (commit message) — not left ambiguous.
- `apps/demo/` gains no `test` workflow, no `control` DSL, no `display_order: 99` admin-gating — the cleanup adds nothing, it only removes.

## Files

- `apps/demo/e2e/workflows/error-push-and-resolve.spec.js` — delete
- `apps/demo/e2e/workflows/transient-throw-retry.spec.js` — delete
- `apps/demo/e2e/workflows/form-submit-buttons.spec.js` — keep (modify header) or delete, per the resolution in step 3
