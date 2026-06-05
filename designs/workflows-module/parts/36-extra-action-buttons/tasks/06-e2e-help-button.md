# Task 6: E2E — Help-button assertion in the onboarding happy-path spec

## Context

Task 3 added an `open_help` extra button (a `Link` to `https://docs.lowdefy.com`, `newTab: true`) to the demo qualify action's edit page. The design self-owns the e2e coverage (no Part 22 coordination — Part 22 is design-only in `parts/_next/`, and its rebased plan keeps the example-workflow specs in place as tier 1, so it absorbs the assertion untouched when it lands): add one assertion to the **existing** `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`, which already drives the onboarding workflow whose `qualify` edit page carries the demo Help button.

**Deferred-verification caveat (from the design's Verification section):** the happy-path spec is itself written ahead of its engine prerequisites (Part 38 task 17, Parts 43, 44) and doesn't run yet — see the `NOTE:` header in the spec. This assertion rides the same deferred-verification flag and verifies nothing at ship time; the live verification for this part is the build-passes and demo-renders checks (tasks 2–3).

## Task

In `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`, at the step that drives the qualify **edit** page:

1. Assert the floating bar contains both the primary Submit (signal) button and the "Help" button.
2. Click "Help" and assert navigation to `https://docs.lowdefy.com` in a new tab (Playwright: wait for the `popup` page event and assert its URL). Assert no call to the per-action engine endpoint fires (e.g. no request to `update-action-qualify` during the click, if the harness makes that practical — otherwise the popup-URL assertion alone satisfies the design's intent).

Keep it minimal — the design scopes this to a single supplementary assertion inside the existing spec. Don't build new harness machinery for it, and don't restructure the spec's step flow.

## Acceptance Criteria

- The spec asserts the "Help" button is visible in the floating bar on the qualify edit page, and that clicking it opens the configured URL in a new tab.
- The assertion lives inside the existing `onboarding-happy-path.spec.js` and inherits its deferred-verification `NOTE:` (the spec is not yet runnable pending Part 38 task 17 / Parts 43 / 44) — no new spec file, no new skip convention.
- The spec file still parses/lints cleanly (`npx playwright test --list` or the repo's equivalent).

## Files

- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — modify — add the Help-button visibility + navigation assertion at the qualify edit step.

## Notes

- Depends on task 3 (the demo config) being merged and the demo build green.
- The button's block id is `open_help`; the bar is the layout module's `floating-action-card`. Prefer role/name selectors (`getByRole('button', { name: 'Help' })`) over block-id selectors unless the existing spec uses id-based selectors — follow the surrounding spec style.
