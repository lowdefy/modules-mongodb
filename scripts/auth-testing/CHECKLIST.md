# Auth flows — manual test checklist

Systematic pass over the `user-account` (auth pages + account workspace) and
`user-admin` (operator console) modules against the local test infra. Work
top-to-bottom: Phase 0 stands the rig up, later phases depend on it (and on each
other — e.g. the 2FA-challenge test needs enrolment from Phase 2, the accept-invite
test needs an invite from Phase 3).

Infra, env, and the helper scripts (`bootstrap-admin`, `reset-db`, `mail-link`) are
documented in [`README.md`](./README.md).

**Legend:** `[ ]` to do · `[x]` done · `[~]` pending build · `[-]` skipped/N-A this run
**Verify in Compass** = check the document state in your environment's DB
(`demo-auth-test` on the local rig, `modules-mongodb-demo-tenant-test` on QA).

> **Magic-link build has landed** (2026-07-24). The demo runs a **mixed** deployment
> (`emailAndPassword` + `magicLink` both enabled), so magic-link renders as an
> alternative-method button below the "or" divider (not a tab); the passwordless-primary
> shape needs a separate `emailAndPassword: false` run.
> **Google OAuth** items need real `GOOGLE_*` secrets and a redirect URI; tagged
> `(oauth)` and left `[-]` unless you're testing the provider this run.

---

## Phase 0 — Environment & bootstrap

Two environments back this checklist ([README §8](./README.md#8-atlas--sendgrid--tester-facing-passes)
has the split): the **local rig** — docker Mongo + Mailpit, `demo-auth-test` — for
dev iteration, and **QA** — Atlas `modules-mongodb-demo-tenant-test` + SendGrid —
for tester-facing passes. Run 0a or 0b, not both. The ticks below were recorded on
the local rig.

### Phase 0a — Local rig

- [x] Mongo + Mailpit up (dev's own setup, not the compose stack); mongo reachable at `mongodb://localhost:27017`
- [x] Compass connected; `demo-auth-test` DB visible (only this DB on local mongo — old cluster untouched)
- [x] `apps/demo/.env` present with `LOWDEFY_SECRET_*` values (README §3a)
- [x] Email → Mailpit via `.env` `SMTP_*` — config is env-driven (host `localhost`, port `1025`, secure `false`); live send verified in Phase 1
- [x] Partial-unique index present on `user-contacts.{organizationId, lowercase_email}` (`unique` + `$exists` partial)
- [x] Build green — the `lowdefy-docs` dev server reports `build.status: ok`
- [x] `pnpm ldf:d` dev server up (it backs the MCP); pinned `demo` org row exists in `user-organizations` (UUID `_id`, engine-ensured at startup)
- [x] Script deps OK — `mongodb` resolves via the root dep (the local `pnpm install` is a no-op; see FINDINGS)
- [x] **First admin bootstrapped:** sign up + verify email (Phase 1), then `pnpm bootstrap-admin <email>`; log in and reach the user-admin console — bootstrap confirmed: `admin@demo.test`'s `user-members.role` is now `user-admin` (reaching the console verified in Phase 3)

Index creation (run once per fresh DB — survives `reset-db`, lost on `down -v`):

```sh
docker exec demo-auth-mongo mongosh mongodb://localhost:27017/demo-auth-test --quiet --eval '
  db["user-contacts"].createIndex({ organizationId: 1, lowercase_email: 1 }, { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } });
  print("indexes created");
'
```

### Phase 0b — QA environment (Atlas + SendGrid)

- [ ] `apps/demo/.env` points at Atlas `modules-mongodb-demo-tenant-test` + SendGrid (README §8a)
- [ ] `AUTH_FROM_ADDRESS` is a sender SendGrid will send as — otherwise every auth email fails silently
- [ ] **Live send confirmed:** one signup delivers a verification email to a real inbox, and the link works
- [x] Both `user-contacts` partial-unique indexes present (README §8c) — confirmed on the Atlas DB; the 0a `createIndex` command is not used here
- [ ] **Clean slate:** QA DB cleared before the pass (README §8f) — leftover orgs/invitations/sessions make the data-separation checks unreadable
- [ ] Served from a production build (`pnpm ldf:b && pnpm ldf:s`), not `ldf:d` — removes the "building page" artifact a tester reads as an app bug
- [ ] Roles granted from `/organizations/members` (`bootstrap-admin` is unused under `tenant`; `mail-link` is Mailpit-only)

---

## Phase 1 — Public auth pages (`user-account`)

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

---

## Phase 2 — Account workspace (signed-in, `user-account`)

### Profile tile

- [ ] Edit profile → `update-profile`; `user-contacts.profile` updated with a fresh change stamp (Compass)
- [ ] Re-denorm landed: `users` row's `profile` bag + top-level `name`/`image` updated (write-profile) (Compass)
- [ ] Header/avatar/menus reflect the change **without a reload** (`_user` refreshed via `UpdateSession`)

### Security tile

- [ ] Email shown with verified badge; resend verification appears when unverified
- [x] **Change password** shown (has credential + `emailAndPassword.enabled`) → `ChangePassword` — password change succeeds (confirmed working). ⚠️ the revoke-other-sessions toggle renders with no visible label → **F20**, and was left unticked, so "revoke-other-sessions works" is **not yet verified** (re-test once F20's caption is fixed); the Security tile also throws a non-blocking `_if` render error → **F15**
- [ ] Negative: for a **credential-less** user (OAuth/magic-link only) the password + 2FA controls are **hidden** (per-user credential read)
- [x] **2FA enrol**: QR renders (plugin QR block), confirm code (`TwoFactorEnable`/`TwoFactorVerify`), backup codes displayed — enrolment confirmed (`users.twoFactorEnabled: true`, one `user-two-factors` row, codes shown). ⚠️ backup-codes **Copy is broken + can lose the one-time codes** → **F21**
- [x] **2FA disable** (`TwoFactorDisable`) — confirmed (`users.twoFactorEnabled: false`, `user-two-factors` row removed). Enrol-modal UX/visual issues → **F22**
- [ ] **Passkeys**: register (`PasskeyRegister`, virtual authenticator), list (native read), delete (`PasskeyDelete`)
- [ ] **Linked accounts**: provider list from `user-accounts` (read-only, visibility not management)

### Sessions tile

- [~] Active sessions listed (created, expiry, IP, user-agent) — confirmed rendering (raw UA/IP → **F18**); **`token` absent** from the payload still needs a network-response check (not yet inspected)
- [x] "Sign out other sessions" (`RevokeOtherSessions`) → other rows gone from `user-sessions` (Compass), current session survives — confirmed: dropped from 2 rows to 1 (only the current session `537ac812` remains)

---

## Phase 3 — User-admin console (`user-admin`)

### Page role gate

- [ ] **`user-admin/*` page gate holds:** a signed-in user **without** the `user-admin` role is denied the console pages (redirect/403), not just the endpoints — `auth.pages.roles.user-admin: [user-admin/*]`. Test by visiting `/user-admin/all` as a plain member (a second account, or temporarily strip the role) and confirming access is refused; then confirm the bootstrapped admin is admitted. (Admin reached the page this run, but the negative case — non-admin blocked — wasn't confirmed.)

### `all` page

- [~] **Members** tab: name/email/roles/status + created/updated/signed-up dates; joined contact name renders — list renders **only with a filter applied** (no-filter load crashes → **F24**); custom Department column empty → **F26**; core fields (name/email/roles-label/status/dates) pending visual confirmation
- [ ] **Invitations** tab with pending-count badge; **Invited** vs **Expired** derived correctly (`pending` + `expiresAt` vs now)
- [ ] Filters: name/email are regex; **role filter matches exact split elements** (`admin` does not match `super-admin`)
- [ ] Sort via `sort-filters` is server-side (orders across pages); direction toggle flips order
- [ ] Excel export (`download: true`) merges members + invitations into one sheet with a `status` column

### Invite flow (`invite` page — email-first check)

- [ ] **Unknown email** → blank form → creates contact + `InviteMember`; branded invitation email in Mailpit; accept link carries `?invitationId=`
- [ ] **Existing contact, no membership** → prefilled from `contact.profile`
- [ ] **Pending invitation** → shown with resend / cancel
- [ ] **Already a member** → links to their user detail page
- [ ] Captured profile is **persisted** to the contact (write-profile); the members list shows a name pre-onboarding
- [ ] **Re-invite an Expired row** → cancel-then-invite; **no duplicate `pending`** row (Verify in Compass: `user-invitations`)
- [ ] Member attributes captured on the invite are applied to the member at accept-time

### `view` (user detail)

- [x] **Profile** tile edit (admin editing the target) → write-profile → **target's** `users.profile` re-denormed (Verify in Compass) — confirmed: `job_title`/honorific `title` written to `user-contacts.profile` + re-denormed to `users.profile`; change stamp now carries `updated.user {name, id}`. (Self-edit here since admin is the only user; target = admin. Form UX → **F27**.)
- [x] **Attributes** tile: roles from the catalog (labels + descriptions in the picker); save → `UpdateMemberRoles` + `UpdateMemberAttributes` — confirmed: role `manager` added (`user-members.role: "user-admin,manager"`) and `attributes.team: "beta"` written
- [~] **Orphaned role** (in `member.role` but not in the catalog) → shown as a flagged "no longer configured" chip, removable, never silently stripped — **display** confirmed (card chip renders); **edit** broken → **F29**: selector shows a label-less tag, and saving with the orphaned role throws `ROLE_NOT_FOUND` (uninformative; conflicts with "removable, never silently stripped")
- [x] **Global attributes** tile → `UpdateUserAttributes` — confirmed: `users.attributes.notes` written
- [ ] **Security** tile: sessions (token projected out), "sign out everywhere" (`RevokeUserSessions`); auth methods read-only (linked providers, passkey count, MFA, email-verified)
- [ ] **Suspend** (`BanUser`) → `users.banned: true`, sessions revoked, status → Suspended; blast-radius dialog enumerates other memberships (when any exist)
- [ ] **Reinstate** (`UnbanUser`) → back to Active
- [ ] Suspend/reinstate surface **hidden** when `suspension: false` (separate config run)
- [ ] **Remove from app** (`RemoveMember`) → member row deleted; contact survives
- [ ] **Delete login identity** (`DeleteUser`) — available **only** when the user has no other memberships; user row hard-deleted, contact survives
- [x] **Apps** tile: cross-app badges from other memberships; **hidden** when the user belongs only to this app — confirmed hidden (single-app membership)
- [ ] **Activity** tile: event timeline renders module audit events — **empty despite events existing** (8 `log-events`, 4 matching the target); read-side schema mismatch → **F28**
- [x] Impersonation **off** by default (`impersonation: false`) — confirmed off; (enabled-path `ImpersonateUser` not exercised)

---

## Phase 4 — Cross-cutting invariants

- [ ] **Freshness across modules**: admin edits a target's profile → the target's **next request** shows the fresh header/avatar (re-denorm on the target's `users` row; no target-side `UpdateSession` needed)
- [ ] **Contact uniqueness**: a signup and an invite racing on the same email yield **one** `user-contacts` row (partial-unique `lowercase_email` reconcile) — not two
- [ ] **Co-location (negative)**: temporarily point one module connection at a different DB → contact data goes **blank everywhere** (the silent `$lookup` failure); then revert
- [ ] **Endpoint gate**: a non-admin caller hitting a `user-admin/*` routine is rejected (`auth.api.roles` + the `userAdminRole` step-floor)
- [ ] **Change stamps**: every contact write carries `created`/`updated` stamps (Verify in Compass)

---
