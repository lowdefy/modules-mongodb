# Phase 1 — Public auth pages (`user-account`)

> **Depends on:** Phase 0. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Signup & email verification

> **Posture for this run: `auth.organizations.signup: open`** (lowdefy.yaml). The
> default `invite-only` rejects uninvited self-signup with `MEMBERSHIP_REQUIRED` and
> writes nothing — so the first admin can't be created via the UI. `open` auto-joins
> the pinned org at signup. Requires a **dev-server restart** to take effect (auth
> config loads at boot, not on hot reload).

- [x] Signup (email+password) → **check-your-email** state, no session (`requireEmailVerification`); no `user-sessions` row until login
- [x] Verify in Compass: a `users` row (`emailVerified: false`), a `user-accounts` credential row, and — under `open` — a `user-members` row auto-joined (auto-join mints `role: 'member'`; `_user.roles = []` because roles read `appRoles`, not `role` — see Phase 5). **Note:** no `user-contacts` row exists at signup for the password path — the contact is created at **verify** (`email.verified` merge, Decision 7), not at signup — **PASS** (`test1@demo.test`, 2026-08-07): `users.email_verified: false`, one `user-accounts` `provider_id: credential`, `user-members` `{organization_id: demo, role: 'member'}` with no `appRoles`, and **no** `user-contacts` row (total contact count unchanged at 1)
- [x] Verification email lands in Mailpit; the verify link prints via `node scripts/auth-testing/mail-link.mjs` (the `pnpm mail-link` alias is not wired — run the script directly)
- [x] Open the link → verify-email **success** landing; `users.emailVerified` now `true`; `profile.contactId` linked on the user (hook); the contact is created with the correct `lowercase_email`/`email` (not `''`/`null`) and no `UpdateUserProfile` server error — contact row confirmed: `email`/`lowercase_email` both `admin@demo.test` (not `''`/`null`)
- [~] **Verify-email failure landing** — a tampered/expired/already-consumed verify link returns to the verify-email page in its **error** state (`&error=` branch), the email survives onto that state, and no second `users`/`user-contacts` row is written — **write-side PASS, landing FAIL** (`test1@demo.test`, 2026-08-07, logged out): tampered-signature link redirected to bare `/user-account/login` with **no `error=` param and no message**; the designed verify-email expired view was never reached. No second `users`/`user-contacts` row and `email_verified` still `false` (write-side clean). **→ [F40](../findings/F40-verify-email-failure-silent-login-redirect.md)** _(only the tampered case tested; a validly-signed expired/consumed token may still reach the expired view — see F40's open question)_
- [x] **Duplicate signup** — signing up with an email that already has a credential account does not mint a second `users`/`user-accounts` row; the user is told the account exists (or routed to login), not shown a raw server error — **invariant PASS** (`test1@demo.test`, 2026-08-07): no second `users`/`user-accounts` row, existing credential **untouched** (password hash + timestamps unchanged — no clobber), no raw error. Routes to the same **"check your email"** screen (enumeration-safe, an acceptable alternative to "account exists"). **UX nit:** that screen sends **no** new verification email (confirmed in Mailpit) → dead-end for a returning unverified user; folded into **[F2](../findings/_completed/F2-login-resend-verification.md)**
- [~] First login routes to **onboarding**; completing required `fields.profile` sets `profile.profile_created: true` and lands on the workspace — onboarding save works but the router bounces back to onboarding instead of the workspace (reached app via manual nav). **Bug → [F33](../findings/_completed/F33-onboarding-updatesession-stale-redirect.md)** (UpdateSession not fresh before routing)

### Login

- [x] Happy path (verified + member) → workspace
- [~] Wrong password → inline **INVALID_EMAIL_OR_PASSWORD** friendly message — **copy/mapping PASS, presentation is a design FINDING** (`test1@demo.test`, 2026-08-07): correct code-specific copy "Incorrect email or password. Please try again." (`toast_login_error` branch login.yaml:353 — proves `error.cause.code` resolves; no code leak, no session). But it renders as a **transient toast**, which auto-dismisses too fast for slower/older users → reporter's call: must be a **persistent inline alert**. → **[F42](../findings/_completed/F42-wrong-password-toast-should-be-inline.md)** _(a persistent notice alert already exists on the signin view — `login_notice_alert` — for retryable `INVALID_TOKEN`; route this code through it)_
- [~] Unverified email → **EMAIL_NOT_VERIFIED** (with resend affordance) — **message PASS, resend MISSING** (`test1@demo.test`, 2026-08-07): friendly `noaccess` copy ("Verify your email to continue / …Check your inbox for the verification link, then sign in again") with no raw code leak and no session minted; but **no resend control** → confirms **[F2](../findings/_completed/F2-login-resend-verification.md)**
- [ ] Verified but no membership → **MEMBERSHIP_REQUIRED** "no access" state — _not testable under `signup: open` (everyone auto-joins); flip to `invite-only` + restart to test just this item_
- [ ] An expired/unmapped code → generic "an error occurred" (default branch, not blank)

### Password reset

- [x] Forgot-password → send state; reset email in Mailpit (`mail-link` yields the link)
- [x] Reset-password page sets a new password; login with the new password succeeds
- [~] **Expired/consumed reset token** — an expired or already-used reset link → the reset page's inline "link expired or already used" notice, the form does not silently set a password, and the old password still works — **no-silent-set PASS, error presentation FAIL** (`test1@demo.test`, 2026-08-07): reusing a consumed link lands on `/user-account/reset-password?error=INVALID_TOKEN` but the page shows the **normal form with no notice** (`onInit` seeds `reset_view: form` unconditionally, never reads `?error`); submitting against the stale token fails (no silent set) but only via a **transient toast** ("We couldn't reset your password. Request a new reset link and try again"). → **[F43](../findings/_completed/F43-reset-password-ignores-error-param.md)**

### 2FA challenge _(enrol first in Phase 2)_

> ⚠️ **Security-critical bug found this run → [F36](../findings/_completed/F36-passkey-only-password-login-bypasses-2fa.md):** a user with a **passkey but no TOTP** signs in with email+password and gets **no 2FA challenge** — single-factor login despite `twoFactor.required`. The challenge is gated on `twoFactorEnabled` (TOTP), which a passkey never sets, while the passkey still satisfies the required-enrolment floor.

- [x] Enrolled user's login routes to the module's **two-factor** page (not an `authPages` role)
- [x] Valid TOTP code → workspace — standard TOTP login works
- [x] **Wrong TOTP code** → inline error, **no session minted** (Verify in Compass: no new `user-sessions` row); the challenge page stays — invalid TOTP errors as expected _(no-session-minted not separately Compass-checked)_
- [ ] A backup code is accepted → workspace — **FAILED: backup codes generated from the Manage modal are rejected as invalid at the challenge (tried twice). Challenge wiring is correct + TOTP works → displayed codes ≠ stored/accepted. ⚠️ recovery path broken → [F37](../findings/_completed/F37-backup-codes-do-not-verify.md)**
- [ ] **Wrong backup code** → inline error, no session — _blocked/confounded by F37 (even valid codes are rejected)_
- [ ] **Backup code is single-use** — the code just accepted is **consumed**: re-using it on a later challenge is rejected (Verify in Compass: the code is gone from / marked used on the `user-two-factors` row) — _blocked by F37 (no backup code is accepted at all)_
- [x] **Trust-device persists** — logging in with **trust-device ticked** skips the 2FA challenge on the **next** login from that browser; a fresh browser (or cleared cookies) is still challenged — 30-day trust-device works. **Enhancement: make it configurable/disable-able → [F38](../findings/F38-trust-device-configurable.md)**

### Passkey _(register first in Phase 2; Chrome DevTools → virtual authenticator)_

- [ ] Passkey button shown (`passkey.enabled`); `PasskeySignIn` completes the WebAuthn assertion → workspace

### Magic-link _(demo is a mixed deployment)_

- [x] Magic-link affordance shown when `magicLink.enabled` — below the "or" divider (mixed config). UX cluttered → **F10**. — **PASS** (2026-08-07): button shown below the "or" divider as designed (clutter tracked in F10)
- [x] Enter email → `link-sent` state, resend control present; email in Mailpit — **PASS** (2026-08-07, reporter ran happy path): send flips to check-your-email, **resend control present** on that state, and the email lands in Mailpit
- [~] **Empty-email submit** — clicking the magic-link button with the email field blank should raise a field-level required error and not send. **FAIL** (2026-08-07): no `Validate` on the form (`magic-link-send.yaml` `onClick` has none), so a blank email dispatches the send, flips to check-your-email, **then redirects to a GitHub 404**. → **[F41](../findings/_completed/F41-magic-link-empty-email-no-validation-github-redirect.md)** (validation gap confirmed; the GitHub mis-redirect not yet root-caused)
- [x] Emailed link: unknown email → user created `emailVerified: true` → **onboarding** — **PASS** (`test2@demo.test`, 2026-08-07): magic-link sign-in minted a `users` row with `email_verified: true` and **no credential account** (magic-link only), auto-joined `user-members` (`role: member`), created the contact, and routed to onboarding (completed — `profile_created: true`). Corollary confirmed: `test3@demo.test` requested a link but never clicked → **no `users` row** (row is minted at click, not at send)
- [x] Expired/consumed link → login page with inline notice ("This link has expired or was already used"), form still visible (`INVALID_TOKEN` → `login_view: signin`, dedicated notice alert — Decision 3) — **PASS** (`test3@demo.test`, 2026-08-07): step 1 (fresh click) created the user (`email_verified: true`, no credential, auto-joined member, contact linked) and routed to onboarding; step 2 (reuse same link) landed on the login page with the **persistent notice alert** — "Link expired / This link has expired or was already used — request a new one below." — form still visible, request-new affordance present. **Copy polish nit** (em-dash reads/word-breaks badly) → **[F32](../../_completed/auth-page-polish/F32-auth-page-visual-polish.md)**
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
