# 10 — signup page

**Context**: Signup page (design.md — Decision 3). Mock:
`mockups/screens/signup.html` (states: `form`, `check-email`). Serves
`authPages.signUp`. Ships unconditionally; admission is engine policy.

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/signup.html` (frame → layout → content), reusing the layout
   module's auth-page wrapper. Both states as page/block state. Write into
   `modules/user-account/pages/signup.yaml` (+ `components/*`). Frame to
   `mockups/frames/signup.*`.
2. **Wire it**:
   - **Enablement from `_build.authConfig`** (same as login) + the `providers` var
     for OAuth display metadata.
   - **Dispatch**: email/password via `SignUp`; social/magic-link "signup" via
     `Login` (the only real signup endpoint is email/password).
   - **Admission is engine policy** — do not re-implement it; render the outcome's
     error codes through the shared code→message mapping (reuse login's table).
   - **`requireEmailVerification`**: when the `SignUp` response carries no session,
     show the `check-email` state instead of navigating; otherwise navigate to
     `callbackUrl`.
   - Footer link to login.

**Acceptance Criteria**:

- Page matches the mock; both states render; enablement per `_build.authConfig`.
- `SignUp`/`Login` dispatch correct per method; no-session → `check-email`,
  session → navigate; admission errors mapped with a `default` fallback.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/signup.yaml` (+ `components/*`)
- `designs/user-account-better-auth/mockups/frames/signup.*`

**Notes**:

- Depends on 01. `SignUp`/`Login` delivered upstream (ask 1).
