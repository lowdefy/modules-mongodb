# Task 10: E2E supplements — check surfaces, modal, error recovery, `allow_not_required`

## Context

The Part 22 e2e suite lives at `apps/demo/e2e/` (Playwright, `fixtures.js` +
`mocks.yaml`, workflow specs under `e2e/workflows/` — e.g.
`onboarding-happy-path.spec.js`, `form-submit-buttons.spec.js`,
`error-push-and-resolve.spec.js`). The demo's onboarding workflow carries one
check action, `schedule-followup`
(`apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml`):
`kind: check`, `access.demo: { view: true, edit: true }` — **no `review`
verb and no `allow_not_required`**, so two of the design's test scenarios
need demo config additions.

The design (§ Tests) specifies supplements (a)–(g) plus the
`allow_not_required` scenario. The engine-unit coverage for
`allow_not_required` (config validation, load-phase gate, button resolution)
moved to Part 46 and is **not** in scope here.

## Task

1. **Demo config additions** (keep existing specs green — extend, don't
   mutate, the actions other specs assert on):
   - Add a `review`-verbed check action to the onboarding workflow (e.g.
     `confirm-details`: `kind: check`, `access.demo: { view, edit, review }`)
     so `submit → in-review → approve/request_changes` is exercisable on a
     check action.
   - Author `allow_not_required: true` on one check action (the new one, or
     `schedule-followup` if no existing spec asserts its button absence).
   - Update `status_map` messages and any fixtures/mocks the new action
     needs.
2. **New spec(s)** under `apps/demo/e2e/workflows/` (e.g.
   `check-action-surfaces.spec.js`, `check-action-modal.spec.js`) covering
   the design's list:
   - (a) **Mark Started**: on `schedule-followup` at `action-required`,
     `progress` lands `in-progress` and persists a due-date edit without
     advancing the stage.
   - (b) **Nullary submit**: `submit` on the review-verbed check action lands
     `in-review`; on the review-less `schedule-followup` it lands `done` —
     the engine resolves the target from the `review` verb; the client sends
     no target.
   - (c) **Server-resolved visibility**: a button whose
     `GetWorkflowAction` `buttons.{signal}` is `false` (wrong stage or
     missing verb) is not rendered — e.g. no Approve for an edit-only user;
     no Submit at `in-review`.
   - (d) **Error recovery**: cascade a check action to `error` (reuse the
     mechanism from `error-push-and-resolve.spec.js`), open
     `workflow-action-view` → `resolve_error` renders, fires, and lands
     `in-review`; repeat via the modal.
   - (e) **Modal open + submit**: clicking the check action in
     `actions-on-entity` opens `check_action_modal` (URL unchanged),
     submitting a signal closes it and the entity workflows list refetches
     (stage badge updates without reload).
   - (f) **Non-check navigates**: clicking a form-kind action in
     `actions-on-entity` navigates to its action page (no modal).
   - (g) **Timeline card**: an event-timeline action card opens the modal
     for a `check` action and navigates for other kinds — on a demo page
     composing the timeline with the modal. If no demo page wires the
     timeline yet, add the wiring on the demo entity page hosting
     `workflows-events-timeline`, passing the kind-branch actions via its
     `on_action_click` var (task 8 Part B). The page already has the modal
     instance if it embeds `actions-on-entity` — target that one; otherwise
     drop `check-action-modal` once (the design's host-composition contract).
   - **`allow_not_required` supplement**: Mark Not Required is hidden by
     default on the check edit surface; on the action authored
     `allow_not_required: true` it renders (server-resolved
     `buttons.not_required`) and firing it lands `not-required`.

## Acceptance Criteria

- The new specs pass locally via the suite's standard run (see
  `apps/demo/e2e/README.md`), and every pre-existing workflow spec still
  passes — including `onboarding-happy-path.spec.js` against the extended
  demo config.
- Scenarios (a)–(g) and the `allow_not_required` case are each covered by at
  least one assertion; (c) asserts non-rendering (not merely disabled).

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/confirm-details.yaml` — create — review-verbed check action (name indicative)
- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — modify — register the new action / `allow_not_required`
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml` — modify (if chosen for `allow_not_required`)
- `apps/demo/e2e/workflows/check-action-surfaces.spec.js` — create — (a)–(d) + not_required
- `apps/demo/e2e/workflows/check-action-modal.spec.js` — create — (e)–(g)
- demo entity page hosting the events timeline — modify (only if (g) needs the host wiring added)

## Notes

- Part 46 (including tasks 11–12, the events-timeline migration) is fully
  landed on `workflows-module` — run against the current tree; no worktree
  coordination needed.
- Universal-fields assertions ((a)'s due-date persistence) depend on
  **Part 24** shipping the real renderer. If Part 24 hasn't landed when this
  task runs, assert the stage/status outcomes and mark the field-persistence
  assertion `test.fixme` referencing Part 24 — don't silently drop it.
- The blocked → action-required ordering matters: `schedule-followup` is
  `blocked_by: [qualify]`; specs must drive the prerequisite first (see
  `onboarding-happy-path.spec.js` for the pattern).
