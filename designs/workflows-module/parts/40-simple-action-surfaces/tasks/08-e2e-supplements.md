# Task 8: E2E supplements on the demo `schedule-followup` simple action

## Context

With the surface (Task 3), rewritten pages (Task 4), modal (Task 5), and `actions-on-entity` wiring (Task 6) in place, this task adds end-to-end coverage exercising the full signal + FSM + in-context-modal flow. These supplement the Part 22 E2E suite.

The demo's `schedule-followup` simple action lives at `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml` — use it as the target. Generate Playwright specs with the project's `ldf` / `mdb` fixtures (see the `r:dev-playwright-gen` skill and existing Part 22 specs for the harness conventions).

## Task

Add E2E coverage for the five scenarios (design "Tests → E2E"):

- **(a) Mark Started (`progress`)** on an `action-required` action lands `in-progress` and persists the due-date without advancing past `in-progress` (no `Validate`, partial draft allowed).
- **(b) `submit`** resolves `in-review` vs `done` per the action's `review` verb — nullary payload, no `current_status`. (Pick the demo action's actual `review` setting and assert the resulting stage.)
- **(c) Source-stage gating** — a button absent from a stage's source list is not rendered (e.g. `progress`, source `[action-required, in-progress]`, is gone once the action is `done`, while `submit` stays visible).
- **(d) Error recovery** — a cascaded `error` shows `resolve_error` on `workflow-action-view` (and in the modal `view` mode) and recovers to `in-review`.
- **(e) In-context modal** — clicking a simple action in `actions-on-entity` opens the modal and submits **without navigation**, then the entity-workflows list refetches and reflects the new stage.

## Acceptance Criteria

- Specs exist for scenarios (a)–(e) and pass against the demo app.
- (a) asserts `in-progress` + persisted due-date with no advance; (b) asserts the correct `in-review`/`done` resolution with a nullary payload; (c) asserts a stage-incoherent button is not rendered while a coherent one is; (d) asserts `resolve_error` appears at `error` and recovers to `in-review`; (e) asserts the modal opens, submits without URL change, and the list refetches.
- Tests use the `ldf` / `mdb` fixtures and follow the Part 22 harness conventions.

## Files

- `apps/demo/**` (Playwright specs) — create — the five E2E scenarios. Place alongside the existing Part 22 E2E specs, following their naming/location convention.

## Notes

- Confirm `schedule-followup`'s `kind: simple`, its `review` verb, and its `access` per-verb gates before writing assertions — (b) and the role-gated visibility in (c)/(d)/(e) depend on them.
- (d) requires a cascaded `error` — set it up via the `mdb` fixture (seed the action at stage `error`) rather than trying to drive a pre-hook cascade through the UI, unless a demo cascade path exists.
- These are the integration check for the whole part — run after Tasks 1–6 are merged.
