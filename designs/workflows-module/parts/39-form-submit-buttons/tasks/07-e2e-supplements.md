# Task 7: E2E supplements (Part 22 suite) for the signal button bars

## Context

Part 22 owns the workflows e2e suite (Playwright, with `ldf` and `mdb` fixtures). Each shipping part lands its `.spec.js` coverage there. Part 39's template rewrites (tasks 2–5) change what buttons render and what they fire, exercised end-to-end through page → action → endpoint → engine → DB → re-render. Three behaviours need coverage, all on the demo app and all centered on the `edit` template.

These tests rely on Part 38's engine behaviour at runtime (the `update-action-{action_type}` endpoint accepting `signal`, the `progress` signal landing `in-progress`, and `submit` from `done` resolving to `in-review`).

## Task

Add Playwright e2e specs (in the Part 22 suite, following its `ldf`/`mdb` fixture conventions) covering:

**(a) Save Draft (`progress`) persists partial form data without validation.**
On an `action-required` form action, open the edit page, fill in *partial* form data (leave a required field empty), click **Save Draft**, and assert: no validation error blocks the save, the action lands `in-progress`, and the partial form data is persisted (re-open the page and the saved fields are present).

**(b) A button absent from a stage's source list is not rendered.**
Assert that a button whose signal is not coherent from the current stage does not render — e.g. `approve` (source list `[in-review]`) is **not** shown on the `edit` page, and `progress` (source list `[action-required, in-progress]`) is **not** shown once the action is `done`. Pick assertions that exercise the FSM source-stage gate, not just the role gate.

**(c) `submit` from `done` re-opens the action to `in-review`.**
On a `done` form action (one whose action declares a `review` verb), navigate `view → Edit` (the Edit-nav button sets `skip_status_redirect: true`, so the edit page's stale-URL guard lets the `done` action through), edit the form, click **Submit**, and assert the action lands `in-review`.

## Acceptance Criteria

- Three e2e specs exist in the Part 22 suite covering (a), (b), and (c).
- (a) confirms `progress` lands `in-progress`, persists partial data, and runs no form validation.
- (b) confirms at least one button is correctly hidden by the FSM source-stage gate (e.g. `approve` not on `edit`).
- (c) confirms `submit` from `done` (via the `view → Edit` re-open path) lands `in-review`.
- The specs pass against the demo app with the Part 39 templates and Part 38 engine in place.

## Files

- Part 22 e2e suite (per its location convention, e.g. `apps/demo/**/*.spec.js`) — create/extend — the three specs above.

## Notes

- (c) depends on the `view` template's Edit-nav button with `skip_status_redirect: true` (task 5) and the edit `submit` button being visible from `done` (task 2 — `submit` source list includes `done`).
- Use the demo's existing form actions; coordinate with Part 22 for the canonical fixture workflow/action types rather than inventing new ones.
- These are the "Part 22 supplements" called out in the design's Tests section.
