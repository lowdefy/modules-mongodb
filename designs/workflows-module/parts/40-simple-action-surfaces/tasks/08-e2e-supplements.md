# Task 8: E2E + engine supplements on the demo `schedule-followup` check action

## Context

With the `allow_not_required` policy (Task 1), the surface (Task 3), rewritten pages (Task 4), modal (Task 5), and `actions-on-entity` wiring (Task 6) in place, this task adds end-to-end coverage exercising the full signal + FSM + `allow_not_required` + in-context-modal flow. These supplement the Part 22 E2E suite.

The demo's `schedule-followup` check action lives under `apps/demo/.../workflow_config/` — use it as the target. Generate Playwright specs with the project's `ldf` / `mdb` fixtures (see the `r:dev-playwright-gen` skill and existing Part 22 specs for harness conventions).

> Engine-unit coverage for the `allow_not_required` stamp + gate and the `makeWorkflowsConfig` validation ships **with Task 1** (co-located with the engine change). This task is the integration layer on top.

## Task

Add E2E coverage for these scenarios (design "Tests → E2E"):

- **(a) Mark Started (`progress`)** on an `action-required` action lands `in-progress` and persists the due-date without advancing past `in-progress` (no `Validate`, partial draft allowed).
- **(b) `submit`** resolves `in-review` vs `done` per the action's `review` verb — nullary payload, no `current_status`. (Use the demo action's actual `review` setting and assert the resulting stage.)
- **(c) Source-stage gating** — a button absent from a stage's source list is not rendered (e.g. `progress`, source `[action-required, in-progress]`, is gone once the action is `done`, while `submit` stays visible at `done`).
- **(d) Error recovery** — a cascaded `error` shows `resolve_error` on `workflow-action-view` (and in the modal `view` mode) and recovers to `in-review`.
- **(e) In-context modal** — clicking a check action in `actions-on-entity` opens the modal and submits **without navigation**, then the entity-workflows list refetches and reflects the new stage.
- **(f) `allow_not_required` gate** — `not_required` is **hidden by default** on the check edit surface (no authored flag); authoring `allow_not_required: true` on a demo action shows the button and the signal lands `not-required`. (Pairs with Task 1's server-side enforcement — confirm a forced `not_required` without the flag is rejected `access_denied`.)

## Acceptance Criteria

- Specs exist for scenarios (a)–(f) and pass against the demo app.
- (a) asserts `in-progress` + persisted due-date with no advance; (b) asserts the correct `in-review`/`done` resolution with a nullary payload; (c) asserts a stage-incoherent button is not rendered while a coherent one is; (d) asserts `resolve_error` appears at `error` and recovers to `in-review`; (e) asserts the modal opens, submits without URL change, and the list refetches; (f) asserts `not_required` hidden by default and shown + functional when authored.
- Tests use the `ldf` / `mdb` fixtures and follow the Part 22 harness conventions.

## Files

- `apps/demo/**` (Playwright specs) — create — the E2E scenarios. Place alongside the existing Part 22 E2E specs, following their naming/location convention.
- A demo workflow config carrying `allow_not_required: true` on one action (for scenario (f)) — add to the demo's `workflow_config` if no such action exists.

## Notes

- Confirm `schedule-followup`'s `kind: check`, its `review` verb, and its per-verb `access` gates before writing assertions — (b) and the role-gated visibility in (c)/(d)/(e) depend on them.
- (d) requires a cascaded `error` — seed the action at stage `error` via the `mdb` fixture rather than driving a pre-hook cascade through the UI, unless a demo cascade path exists.
- These are the integration check for the whole part — run after Tasks 1–6 are merged.
