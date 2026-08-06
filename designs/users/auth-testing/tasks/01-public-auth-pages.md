# Phase 1 — Public auth pages (`user-account`)

> **Depends on:** Phase 0. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Signup & email verification

> **Posture for this run: `auth.organizations.signup: open`** (lowdefy.yaml). The
> default `invite-only` rejects uninvited self-signup with `MEMBERSHIP_REQUIRED` and
> writes nothing — so the first admin can't be created via the UI. `open` auto-joins
> the pinned org at signup. Requires a **dev-server restart** to take effect (auth
> config loads at boot, not on hot reload).

- [ ] Signup (email+password) → **check-your-email** state, no session (`requireEmailVerification`); no `user-sessions` row until login
- [ ] Verify in Compass: a `users` row (`emailVerified: false`), a `user-accounts` credential row, and — under `open` — a `user-members` row auto-joined (auto-join mints `role: 'member'`; `_user.roles = []` because roles read `appRoles`, not `role` — see Phase 5). **Note:** no `user-contacts` row exists at signup for the password path — the contact is created at **verify** (`email.verified` merge, Decision 7), not at signup
- [ ] Verification email lands in Mailpit; the verify link prints via `node scripts/auth-testing/mail-link.mjs` (the `pnpm mail-link` alias is not wired — run the script directly)
- [ ] Open the link → verify-email **success** landing; `users.emailVerified` now `true`; `profile.contactId` linked on the user (hook); the contact is created with the correct `lowercase_email`/`email` (not `''`/`null`) and no `UpdateUserProfile` server error
- [ ] **Verify-email failure landing** — a tampered/expired/already-consumed verify link returns to the verify-email page in its **error** state (`&error=` branch), the email survives onto that state, and no second `users`/`user-contacts` row is written
- [ ] **Duplicate signup** — signing up with an email that already has a credential account does not mint a second `users`/`user-accounts` row; the user is told the account exists (or routed to login), not shown a raw server error
- [ ] First login routes to **onboarding**; completing required `fields.profile` sets `profile.profile_created: true` and lands on the workspace

### Login

- [ ] Happy path (verified + member) → workspace
- [ ] Wrong password → inline **INVALID_EMAIL_OR_PASSWORD** friendly message
- [ ] Unverified email → **EMAIL_NOT_VERIFIED** (with resend affordance)
- [ ] Verified but no membership → **MEMBERSHIP_REQUIRED** "no access" state — _not testable under `signup: open` (everyone auto-joins); flip to `invite-only` + restart to test just this item_
- [ ] An expired/unmapped code → generic "an error occurred" (default branch, not blank)

### Password reset

- [ ] Forgot-password → send state; reset email in Mailpit (`mail-link` yields the link)
- [ ] Reset-password page sets a new password; login with the new password succeeds
- [ ] **Expired/consumed reset token** — an expired or already-used reset link → the reset page's inline "link expired or already used" notice, the form does not silently set a password, and the old password still works

### 2FA challenge _(enrol first in Phase 2)_

- [ ] Enrolled user's login routes to the module's **two-factor** page (not an `authPages` role)
- [ ] Valid TOTP code → workspace
- [ ] **Wrong TOTP code** → inline error, **no session minted** (Verify in Compass: no new `user-sessions` row); the challenge page stays
- [ ] A backup code is accepted → workspace
- [ ] **Wrong backup code** → inline error, no session
- [ ] **Backup code is single-use** — the code just accepted is **consumed**: re-using it on a later challenge is rejected (Verify in Compass: the code is gone from / marked used on the `user-two-factors` row)
- [ ] **Trust-device persists** — logging in with **trust-device ticked** skips the 2FA challenge on the **next** login from that browser; a fresh browser (or cleared cookies) is still challenged

### Passkey _(register first in Phase 2; Chrome DevTools → virtual authenticator)_

- [ ] Passkey button shown (`passkey.enabled`); `PasskeySignIn` completes the WebAuthn assertion → workspace

### Magic-link _(demo is a mixed deployment)_

- [ ] Magic-link affordance shown when `magicLink.enabled` — below the "or" divider (mixed config). UX cluttered → **F10**.
- [ ] Enter email → `link-sent` state, resend control present; email in Mailpit
- [ ] Emailed link: unknown email → user created `emailVerified: true` → **onboarding**
- [ ] Expired/consumed link → login page with inline notice ("This link has expired or was already used"), form still visible (`INVALID_TOKEN` → `login_view: signin`, dedicated notice alert — Decision 3)
- [ ] Passwordless-primary shape when `emailAndPassword` is off (separate config run + `authPages.signUp: login` app override)

### OAuth _(needs real GitHub secrets)_

- [ ] GitHub button shown with label/icon from the `providers` var
- [ ] Sign-in works; a membership/verification failure redirects to `authPages.error` (login) with the code on the query string

### Accept invitation _(needs an invite from Phase 3)_

- [ ] `accept?invitationId=…` with **no session** → offers login/signup with a callback back to accept
- [ ] **Session + email match** → `AcceptInvitation`; member row minted with the invite's roles/attributes; `profile` merge carries `contactId`; page links into the app
- [ ] Expired / email-mismatch / already-member → the corresponding message

### Logout

- [ ] Logout clears the session; header shows signed-out; the current session row is gone from `user-sessions` (Compass) while other, older sessions correctly persist until revoked/expired
