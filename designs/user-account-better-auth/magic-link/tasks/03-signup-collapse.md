# Task 3: Collapse signup into the login email→link flow for passwordless

## Context

`modules/user-account/pages/signup.yaml` is already built (parent task 10). It
serves `authPages.signUp` and has two renders driven by `signup_view`
(`form` | `check`): an email/password form (gated on
`_build.authConfig: emailAndPassword.enabled`) that dispatches through `SignUp`,
OAuth "signup" buttons that dispatch through `Login`, and a "check your email"
verification state for `requireEmailVerification`.

The magic-link design (Decision 4) establishes that in a **passwordless
deployment** there is no separate credential to register, so **sign-up and sign-in
are the same action**: enter your email, get a link. An unknown-but-admittable
email is created at verify time and routed to onboarding via `newUserCallbackUrl`.
This means the passwordless login page (task 2) **is** the signup page — a distinct
`/signup` render is redundant when `emailAndPassword.enabled` is false.

Task 2 has already added the magic-link send + `link-sent` state to the login
page. This task resolves how signup behaves once that exists.

## Task

1. **Passwordless collapse.** When `_build.authConfig: emailAndPassword.enabled` is
   **false** and `magicLink.enabled` is **true**, the signup page must not present
   a redundant second email→link form. Route it onto the login flow — the simplest
   correct shape is a **build-time redirect / reuse**: when password is off, the
   signup page either navigates to the login page (`_module.pageId: login`,
   preserving any inbound `?callbackUrl=`) or renders the same magic-link send
   affordance the login page uses. Prefer the redirect (one canonical page, per
   "one correct way") unless the `authPages.signUp` role requires a distinct page
   to exist — see step 3. Gate this behaviour on the config (`_build.if` on
   `emailAndPassword.enabled`), so the existing email/password + OAuth signup form
   is untouched when password is enabled.

2. **Preserve the existing form when password is enabled.** When
   `emailAndPassword.enabled` is true, the current `SignUp` form + OAuth +
   check-email state must render exactly as today. Do not regress the password
   signup path.

3. **Confirm `authPages.signUp` role wiring.** Verify the module manifest
   (`modules/user-account/module.lowdefy.yaml`) contributes the `signUp` role to
   the `authPages` map pointing at this page, and that the collapse (redirect vs
   reuse) is consistent with that role still resolving. If the role must point at a
   real page, the redirect approach keeps a thin `signup` page that immediately
   forwards to login — acceptable. Document the chosen shape in a page comment
   stating the constraint (not the history).

## Acceptance Criteria

- Passwordless config (`emailAndPassword` off, `magicLink` on): the signup route
  does not show a second email form — it forwards to / reuses the login
  magic-link flow, preserving `?callbackUrl=`.
- Password-enabled config: the existing `SignUp` form, OAuth buttons, and
  check-email state render unchanged.
- `authPages.signUp` still resolves to a valid page in both configs.
- `pnpm ldf:b` from `apps/demo` succeeds.

## Files

- `modules/user-account/pages/signup.yaml` — modify — add the passwordless
  collapse (redirect to / reuse the login magic-link flow) gated on
  `emailAndPassword.enabled` being false; preserve the password path.
- `modules/user-account/module.lowdefy.yaml` — verify (modify only if wiring is
  wrong) — `authPages.signUp` role points at the signup page.

## Notes

- **Open question to settle (design Open questions): `authPages.signUp` in _mixed_
  deployments.** The design leaves open whether one config-driven page serves both
  `signIn` and `signUp` roles, or a distinct signup render exists when password is
  _also_ enabled. **Recommendation:** keep the distinct signup render for the
  **mixed** (password + magic-link) case — it already exists and password signup
  genuinely differs from sign-in (name fields, `SignUp` dispatch, verification
  state) — and only collapse for the **pure passwordless** case (this task's
  scope). If the implementer or design owner wants full collapse in mixed mode too,
  that is a broader change; flag it rather than expanding scope silently. Confirm
  the intended answer with the design owner if unclear — do not invent a mixed-mode
  collapse not asked for.
- This task depends on task 2: the login page must already expose the magic-link
  send + `link-sent` state for the redirect/reuse to land somewhere real.
- Use the `lowdefy-docs` MCP (`/lowdefy-config`) for the `Link` action and
  `_module.pageId` usage.
