# 11 — forgot-password page

**Context**: Forgot-password (request reset link) page (design.md — Decision 2,
Module surface). Mock: `mockups/screens/forgot-password.html`. Serves
`authPages.forgotPassword`.

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/forgot-password.html` (frame → layout → content), reusing the
   auth-page wrapper. Slots: email input, submit, post-submit confirmation, back-to-
   login link. Write into `modules/user-account/pages/forgot-password.yaml`. Frame to
   `mockups/frames/forgot-password.*`.
2. **Wire it**: submit → public **`RequestPasswordReset`** action with `redirectTo` =
   the module's `reset-password` page (`_module.pageId: reset-password`) so the
   emailed link lands there. Always show the confirmation on success regardless of
   whether the email exists (no account enumeration).

**Acceptance Criteria**:

- Page matches the mock; request + confirmation states render.
- Submit calls `RequestPasswordReset` with `redirectTo` → `reset-password`;
  enumeration-safe confirmation.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/forgot-password.yaml`
- `designs/user-account-better-auth/mockups/frames/forgot-password.*`

**Notes**:

- Depends on 01. `RequestPasswordReset` delivered upstream (ask 1). Email rendering
  is platform `auth.email` territory (Decision 8) — no module email work.
