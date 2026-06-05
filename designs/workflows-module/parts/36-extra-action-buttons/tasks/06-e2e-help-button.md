# Task 6: E2E supplement — Help button visible and navigates

## Context

Task 3 added an `open_help` extra button (a `Link` to `https://docs.lowdefy.com`, `newTab: true`) to the demo qualify action's edit page. The design asks for one e2e assertion as a supplement to Part 22's demo smoke coverage: the extra button renders in the floating bar alongside the signal buttons, and clicking it navigates — no engine call.

Demo e2e specs live under `apps/demo/e2e/workflows/` (Playwright, using the repo's `fixtures.js` — `import { test, expect } from '../fixtures.js'`). Some Part 22 specs are currently skipped pending harness wiring (see the `STATUS:` comments in e.g. `error-push-and-resolve.spec.js`); coordinate ordering with Part 22.

## Task

Add the Help-button assertion to whichever Part 22 spec exercises the onboarding qualify edit page (or, if none does yet, the spec Part 22 designates for the onboarding happy path):

1. On the qualify **edit** page (`onboarding-qualify-edit?action_id=...`), assert the floating bar contains both the primary Submit (signal) button and the "Help" button.
2. Click "Help" and assert navigation to `https://docs.lowdefy.com` in a new tab (Playwright: wait for the `popup` page event and assert its URL). Assert no call to the per-action engine endpoint fires (e.g. no request to `update-action-qualify` during the click, if the harness makes that practical — otherwise the popup-URL assertion alone satisfies the design's "single line in the spec" intent).

Keep it minimal — the design scopes this to "single line in the spec; coordinate ordering with Part 22". Don't build new harness machinery for it; if the qualify-edit flow has no live spec yet, add the assertion in a clearly-marked skipped block following the existing `STATUS:` comment convention.

## Acceptance Criteria

- The spec asserts the "Help" button is visible in the floating bar on the qualify edit page.
- Clicking it opens the configured URL in a new tab.
- The spec passes locally against the running demo (or is committed skipped with a `STATUS:` comment if Part 22's harness pieces it depends on aren't live yet — matching the existing convention in `apps/demo/e2e/workflows/`).

## Files

- One spec under `apps/demo/e2e/workflows/` — modify (or create, per Part 22's spec layout) — add the Help-button visibility + navigation assertion.

## Notes

- Depends on task 3 (the demo config) being merged and the demo build green.
- The button's block id is `open_help`; the bar is the layout module's `floating-action-card`. Prefer role/name selectors (`getByRole('button', { name: 'Help' })`) over block-id selectors unless the existing specs use id-based selectors — follow the surrounding spec style.
