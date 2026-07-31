# Task 14: `invite` screen — pipeline phase 1 (frame)

## Context

The `invite` page is email-first (Decision 7): one email field + Check button,
then the check resolves to one of four states (unknown → blank form; existing
contact → prefilled form; already a member → link to `view`; pending invitation →
resend/cancel) before the invitation-details form opens. First phase of the
`mock-to-lowdefy` pipeline for this screen. Mock is pipeline-ready — **skip
`lowdefy-mock`**.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/01-frame.md`.
**Mock:** `designs/user-admin-better-auth/mockups/screens/invite.html`
**Design behaviour:** `design.md` Decision 7.

## Task

Follow `phases/01-frame.md` — geometry derived from `invite.html`'s CSS. Capture:
the page shell, title-block, the email-entry card (email input + Check; and the
resolved/locked variant with "use a different email"), the resolution slot with
its separable layers (resting hint, checking spinner, unknown form, existing form,
already-member panel, pending panel), and the cancel-invitation confirm modal.
Render at 1440px and verify beside the mock.

## Acceptance Criteria

- HTML frame (+ preview PNG) in `designs/user-admin-better-auth/mockups/frames/`.
- Email-entry area, resolution slot, and its layers each carry descriptive ids;
  the cancel confirm modal is a separable layer.
- Rendered frame reproduces `invite.html`'s 1440px layout.

## Files

- `designs/user-admin-better-auth/mockups/frames/invite.html` (+ preview PNG) — create

## Notes

- The `.mockbar` state switcher and email-lock/resolution JS are mock-only chrome
  (the real trigger is the Check button). Frame the resting entry state; the state
  machine is a content/wire concern.
- No app source in this phase.
