# Task 9: Cross-page visual consistency verification

## Context

The design's core goal is _consistency across the whole auth flow_ — one card width, one heading
treatment, one brand treatment — which no single page task can confirm on its own. This final
task opens the running app and verifies the flow reads as one coherent set. Requires the Lowdefy
dev server (the MCP screenshot/inspect tools depend on it — ask the developer to start
`pnpm ldf:d` if it isn't up).

## Interfaces

- **Consumes:** all preceding shape changes — shell branch (2), demo minimal (3), enrol rebuild
  (4), onboarding restack (5), modal key chunks (6, verified via the modal), heading pass (8).

## Task

With the dev server running, use `lowdefy_screenshot_page` (and `lowdefy_get_page_config` /
`lowdefy_inspect_state` as needed) to verify:

1. **Uniform card width.** Every public auth page — `signup`, `login`, `verify-email`,
   `forgot-password`, `reset-password`, `two-factor`, `two-factor-enrol`, `onboarding`,
   `accept`, `logout` — renders the card at the same `420` width. No page is visibly wider or
   narrower; the width does not jump mid-flow.

2. **Consistent headings.** Headings across those pages sit at the same level (`Title` 3) and
   the same top margin — including `login` now using an in-block title.

3. **Brand treatment both ways.** The demo (set to `logo_style: minimal` in Task 3) renders the
   bandless small-logo-above-card treatment on every auth page. Confirm the `band` default still
   renders the cover band unchanged — render a page with the shell default (e.g. pass no
   `logo_style` override, or point at a band render) and compare against `mockups/logo-variation.html`.

4. **Enrol redesign.** `two-factor-enrol` shows the single-column scan step: QR primary, code
   below, manual key behind a collapsed "Can't scan?" disclosure rendered in 4-char chunks that
   wrap cleanly. Confirm the same chunked-key treatment in the Manage-modal
   (`modal_enroltotp`, reached from the `view` page).

5. **Enter-to-submit spot-check.** Confirm the code inputs on `two-factor-enrol`, `two-factor`
   (TOTP + backup), and `modal_enroltotp` carry `onPressEnter` wired to their verify chains
   (inspect the built config if not exercised live).

Note that role-gated pages render as a roleless user in the headless renderer — pass a `user`
where a page needs a session (per the `lowdefy-docs` MCP guidance).

## Acceptance Criteria

- All listed auth pages render at `420` with no mid-flow width jump.
- Headings are visually uniform (level 3, same margin) across pages.
- `minimal` (demo) and `band` (default) both render correctly and match the mockups.
- The enrol page and the Manage-modal both show the QR-first / chunked-key treatment.
- `pnpm ldf:b` from `apps/demo` succeeds with no errors; `lowdefy_build_status` is clean across
  the auth pages.
- Any discrepancy is filed back against the owning task, not patched blindly here.

## Files

- No source changes — verification only. (If a discrepancy is found, fix it in the owning
  task's file and note it.)

## Notes

- This is the "exercise the feature" step: the first task that actually runs the app against the
  finished changes. It needs real rendering, so keep it last.
