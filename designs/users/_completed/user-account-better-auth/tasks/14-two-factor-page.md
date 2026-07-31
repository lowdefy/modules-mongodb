# 14 — two-factor page

**Context**: 2FA challenge page (design.md — Decision 2: 2FA routing is the module's
own; `authPages` has no 2FA key). Mock: `mockups/screens/two-factor.html` (states:
`authenticator code`, `backup code`). This is the sign-in challenge (routed to by
login), not the enrolment flow (that's in the account security tile, task 18).

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/two-factor.html` (frame → layout → content), reusing the
   auth-page wrapper. Slots: TOTP code input, verify button, optional trust-device
   toggle, backup-code alternate state. Write into
   `modules/user-account/pages/two-factor.yaml`. Frame to
   `mockups/frames/two-factor.*`. (No QR here — QR is enrolment, task 18.)
2. **Wire it**: verify → **`TwoFactorVerify`** (serves both TOTP and backup code;
   pass the code + `trustDevice`). The authenticator/backup toggle drives which
   credential is submitted. On success navigate to `callbackUrl` (complete sign-in).
   Map invalid-code errors with a `default` fallback.

**Acceptance Criteria**:

- Page matches the mock; both states (authenticator / backup code) render.
- Verify calls `TwoFactorVerify` with the code + `trustDevice`; success completes
  sign-in and navigates.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/two-factor.yaml`
- `designs/user-account-better-auth/mockups/frames/two-factor.*`

**Notes**:

- Depends on 01. `TwoFactorVerify` delivered upstream (ask 1). Login routes here via
  `_module.pageId: two-factor` (task 09).
