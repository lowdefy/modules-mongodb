# Phase 1 — Public auth pages (`user-account`)

> **Depends on:** Phase 0. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Signup & email verification

> **Posture for this run: `auth.organizations.signup: open`** (lowdefy.yaml). The
> default `invite-only` rejects uninvited self-signup with `MEMBERSHIP_REQUIRED` and
> writes nothing — so the first admin can't be created via the UI. `open` auto-joins
> the pinned org with the inert `member` role at signup. Requires a **dev-server
> restart** to take effect (auth config loads at boot, not on hot reload).

- [x] Signup (email+password) → **check-your-email** state, no session (`requireEmailVerification`) — confirmed (no `user-sessions` row until login)
- [x] Verify in Compass: `users` row (`emailVerified: false`), a `user-accounts` credential row, and — under `open` — a `user-members` row auto-joined with an **empty role** (`role: ''`, so `_user.roles = []`; role-catalog Decision 3) — all confirmed. **Note:** no `user-contacts` row exists at signup for the password path — the contact is created at **verify** (`email.verified` merge, Decision 7), not at signup; checklist previously mis-stated a "bare contact at signup"
- [x] Verification email lands in Mailpit; `pnpm mail-link` prints the verify link — confirmed (`node scripts/auth-testing/mail-link.mjs`; the `pnpm mail-link` alias is not wired — run the script directly)
- [x] Open the link → verify-email **success** landing; `users.emailVerified` now `true`; `profile.contactId` linked on the user (hook) — **confirmed, F3/F4 resolved**: contact created with correct `lowercase_email`/`email` (not `''`/`null`), `users.profile.contactId` linked, no `UpdateUserProfile` server error
- [ ] First login routes to **onboarding**; completing required `fields.profile` sets `profile.profile_created: true` and lands on the workspace — routing to onboarding confirmed via `/` (router), but direct-login navigation no-ops → **F11**; onboarding completion not yet exercised this run

### Login

- [ ] Happy path (verified + member) → workspace
- [ ] Wrong password → inline **INVALID_EMAIL_OR_PASSWORD** friendly message
- [ ] Unverified email → **EMAIL_NOT_VERIFIED** (with resend affordance)
- [-] Verified but no membership → **MEMBERSHIP_REQUIRED** "no access" state — _not testable under `signup: open` (everyone auto-joins); flip to `invite-only` + restart to test just this item_
- [ ] An expired/unmapped code → generic "an error occurred" (default branch, not blank)

### Password reset

- [x] Forgot-password → send state; reset email in Mailpit (`mail-link` yields the link) — confirmed
- [x] Reset-password page sets a new password; login with the new password succeeds — confirmed (logged-out reset flow works end-to-end)

### 2FA challenge _(enrol first in Phase 2)_

- [ ] Enrolled user's login routes to the module's **two-factor** page (not an `authPages` role)
- [ ] Valid TOTP code → workspace; trust-device option behaves
- [ ] A backup code is accepted

### Passkey _(register first in Phase 2; Chrome DevTools → virtual authenticator)_

- [ ] Passkey button shown (`passkey.enabled`); `PasskeySignIn` completes the WebAuthn assertion → workspace

### Magic-link _(build landed 2026-07-24; demo is a mixed deployment)_

- [x] Magic-link affordance shown when `magicLink.enabled` — confirmed below the "or" divider (mixed config). UX cluttered → **F10**.
- [x] Enter email → `link-sent` state, resend control present; email in Mailpit — confirmed working
- [x] Emailed link: unknown email → user created `emailVerified: true` → **onboarding** — routing confirmed. ⚠️ contact data written wrong (empty-email / shared contact) — **F3/F4**, not a magic-link fault
- [ ] Expired/consumed link → login page with inline notice ("This link has expired or was already used"), form still visible (`INVALID_TOKEN` → `login_view: signin`, dedicated notice alert — Decision 3)
- [~] Passwordless-primary shape when `emailAndPassword` is off (separate config run + `authPages.signUp: login` app override)

### OAuth _(needs real Google secrets)_

- [-] Google button shown with label/icon from the `providers` var
- [-] Sign-in works; a membership/verification failure redirects to `authPages.error` (login) with the code on the query string

### Accept invitation _(needs an invite from Phase 3)_

- [ ] `accept?invitationId=…` with **no session** → offers login/signup with a callback back to accept
- [ ] **Session + email match** → `AcceptInvitation`; member row minted with the invite's roles/attributes; `profile` merge carries `contactId`; page links into the app
- [ ] Expired / email-mismatch / already-member → the corresponding message

### Logout

- [x] Logout clears the session; header shows signed-out; session gone from `user-sessions` (Compass) — confirmed: the current session row was removed on logout (other, older sessions correctly persist until revoked/expired)
