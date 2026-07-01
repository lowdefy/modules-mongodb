# Task 8: Part 22 E2E specs — transient-throw retry, author-driven `error` + `resolve_error`

## Context

Part 22 covers end-to-end specs for the workflows module. Two new specs land here:

1. The "transient infra failure → user retry → success" path: a mid-submit throw doesn't pollute the action's status with a synthetic `error` entry; the user retries the same submission and it succeeds.
2. The "author pushes `error` via pre-hook → user recovers via the `-error` page submit" path: status goes `action-required → error → in-review` (or `→ done`) with no `force` needed on the recovery leg; the `resolve_error` pre/post hooks fire on the recovery submit.

Keep the existing `resolve_error` spec slice from earlier work — it still exercises the interaction; only the priority semantics under it changed.

Reference design: [Part 29 § E2E (part 22)](../design.md#e2e-part-22) (lines 251-254).

## Task

Add two new spec files (or two new `test(...)` blocks in an existing file — match Part 22's conventions). Use the project's e2e harness; if Part 22 uses Playwright with `ldf` + `mdb` fixtures (per the `r:dev-playwright-gen` skill), follow that pattern.

### Spec 1 — "transient infra failure → user retry → success"

- **Setup.** Seed a workflow with one in-progress action. Configure the test harness so the first `handleSubmit` invocation throws inside step 5 (recompute summary) — e.g. by intercepting the workflow `MongoDBUpdateOne` call once.
- **Step 1.** Click the action's submit button in the UI. Assert that the submit fails — the user sees Lowdefy's standard error toast (no workflows-specific UI).
- **Step 2.** Inspect the action doc in Mongo via the `mdb` fixture. Assert: `status[0].stage` is **not** `error`; it's the original pre-submit stage (the step-4 transition either landed or didn't, but no synthetic `error` is layered).
- **Step 3.** Remove the throw injection. Click submit again. Assert: the submit succeeds, the action progresses to its target stage, the workflow summary updates correctly. No duplicate transitions (the priority rule self-exception keeps the audit history sane).

### Spec 2 — "pre-hook pushes `error` → recovery via `-error` page"

- **Setup.** Seed a workflow with one action whose `access.{app_name}` verb list includes `error` (so the `-error` page is emitted). Configure the pre-hook routine to return `actions: [{ action_id: '<id>', status: 'error' }]` on first submit — e.g. via a test-harness hook that conditionally rejects on a CRM duplicate check.
- **Step 1.** Click submit. Assert: the action's status array has `error` at the top of `status[]` (pushed via the **normal** priority path — no `force` needed because `error.priority = 1` is below every non-terminal stage). The events-log entry for the transition exists.
- **Step 2.** Navigate to the action's `-error` page. Assert: the page renders, the recovery submit button is visible.
- **Step 3.** Click the recovery submit. Assert: the interaction posted is `resolve_error`. The action's status array now has `in-review` (or `done`, per the interaction → target-status mapping) at the top, layered over the `error` entry via the handler-internal `force: true`. The `resolve_error` pre/post hooks (if configured) fired on this leg.

### Existing slice — `resolve_error` recovery

Don't delete. Verify it still passes — its semantics under Part 29 are unchanged at the interaction-shape level; only the engine-internal force-write story shifted (still `force: true` on the recovery leg, still invisible to authors).

## Acceptance Criteria

- Two new e2e specs land in Part 22's test surface, each as a complete pass-or-fail scenario.
- Both specs use the `ldf` + `mdb` fixtures (or the project's equivalent) and run under the project's e2e command.
- The existing `resolve_error` spec still passes.
- Spec 2's pre-hook `:reject` pathway is **not** exercised here (it's covered indirectly via the integration test once Task 1 upstream PR lands).

## Files

- `e2e/specs/workflows-module/transient-throw-retry.spec.ts` (or wherever Part 22's specs live) — create.
- `e2e/specs/workflows-module/error-push-and-resolve.spec.ts` — create.
- Existing `resolve_error` spec file — no change, just verify.

## Notes

- Depends on Task 5 (handler changes shipped) and Task 1 (upstream PR for integration-level `:reject`).
- If Part 22's harness uses different paths or fixture names, match those — the file paths above are illustrative.
- Coordinate with whoever is implementing Part 22 if it's still in-flight. These specs may merge into their task list rather than landing as a standalone PR.
