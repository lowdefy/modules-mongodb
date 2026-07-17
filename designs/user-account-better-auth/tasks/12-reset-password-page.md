# 12 — reset-password page

**Context**: Reset-password (choose new password) page (design.md — Decision 2,
Module surface). Mock: `mockups/screens/reset-password.html`. Serves
`authPages.resetPassword`. Landed on from the emailed reset link (task 11's
`redirectTo`).

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/reset-password.html` (frame → layout → content), reusing the
   auth-page wrapper. Slots: new-password + confirm-password inputs, submit, success
   state. Consider password-match validation (the `Validate` action + input `validate` props — see the `lowdefy-docs` MCP). Write
   into `modules/user-account/pages/reset-password.yaml`. Frame to
   `mockups/frames/reset-password.*`.
2. **Wire it**: submit → public **`ResetPassword`** action, reading the reset
   **token from the URL** and passing the new password. On success show the success
   state + a link to `login`. Map invalid/expired-token errors to friendly messages
   with a `default` fallback.

**Acceptance Criteria**:

- Page matches the mock; form + success states render.
- Submit calls `ResetPassword` with the URL token + new password; token errors
  mapped; success links to login.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/reset-password.yaml`
- `designs/user-account-better-auth/mockups/frames/reset-password.*`

**Notes**:

- Depends on 01. `ResetPassword` delivered upstream (ask 1).
