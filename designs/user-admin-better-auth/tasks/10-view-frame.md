# Task 10: `view` screen — pipeline phase 1 (frame)

## Context

The `view` page is the single user detail page (Decision 3) — a classic
two-column console (span-14 main + span-10 sidebar). Main column: Profile,
Attributes (roles + member attributes), Global attributes tiles. Sidebar:
Security (access/sign-in actions, sessions, auth methods), Apps (cross-app
badges), Activity (event timeline). Each editable tile opens its own modal.
First phase of the `mock-to-lowdefy` pipeline for this screen. Mock is
pipeline-ready — **skip `lowdefy-mock`**.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/01-frame.md`.
**Mock:** `designs/user-admin-better-auth/mockups/screens/view.html`
**Design behaviour:** `design.md` Decisions 3, 4, 5, 6.

## Task

Follow `phases/01-frame.md` exactly — geometry derived from `view.html`'s CSS.
Capture: the page shell, the title-block (avatar + status pill + name +
page-actions slot), the two-column grid, each card tile in both columns, and the
interaction-state layers (the seven modal overlays: profile edit, attributes edit,
global attrs edit, suspend confirm, remove confirm, revoke confirm, delete
confirm) as separable layers. Render at 1440px and verify beside the mock.

## Acceptance Criteria

- HTML frame (+ preview PNG) in `designs/user-admin-better-auth/mockups/frames/`.
- Two-column grid with span 14 / 10 reproduced; every tile and modal-overlay area
  carries a descriptive id.
- Modal overlays represented as separable interaction-state layers, triggers in
  the base.

## Files

- `designs/user-admin-better-auth/mockups/frames/view.html` (+ preview PNG) — create

## Notes

- The mock encodes multi-app vs single-app scenarios via `data-scenario` and a
  `.mockbar` switcher — that is mock-only chrome (the real switch is the person's
  other-membership count, Decision 6). Frame the resting multi-app layout; the
  scenario branching is a wire concern (task 13).
- No app source in this phase.
