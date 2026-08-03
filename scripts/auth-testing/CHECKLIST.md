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

> **2FA enrolment rework has landed** (2026-07-31). The two-modal chain is gone —
> `modal_backupcodes.yaml` is deleted and enrolment is one modal with three phases
> (`password` → `scan` → `codes`), no native footer, and `phase`/`intent` held as
> explicit state. This closes **F21** and **F22 (a/b/c)**, so the pre-rework `[x]` 2FA
> items in Phase 2 are superseded — re-test them against the nested list there.
> **Replacing an authenticator now turns two-factor _off_ first**, so an abandoned
> replacement leaves the account with 2FA off (recoverable) rather than enforced against
> a secret the user never scanned (a DB fix). **Not in this build:** the "Get new backup
> codes" option, phase `choose`, and the Back button — deferred to
> `designs/users-fixes/backup-codes-rotation` pending an upstream action. Until it lands,
> Manage on an enrolled user opens straight on the password phase with `intent: replace`.

---

## Phase 0 — Environment & bootstrap

Two environments back this checklist ([README §8](./README.md#8-atlas--sendgrid--tester-facing-passes)
has the split), and they drive **different apps**: the **local rig** — `apps/demo`
under `policy: pinned`, docker Mongo + Mailpit, `demo-auth-test` — for dev
iteration, and **QA** — `apps/tenant-demo` under `policy: tenant`, Atlas
`modules-mongodb-demo-tenant-test` + SendGrid — for tester-facing passes. Run 0a
or 0b, not both. The ticks below were recorded on the local rig.

Phases 1–4 read against either app; where a step names a `userAdminRole` floor or
the pinned org, it is 0a-only (under `tenant` those writes refuse by design — see
[`qa-test-plan.md`](../../designs/auth-tenancy-verification/qa-test-plan.md) §6.1).

### Phase 0a — Local rig (`apps/demo`, `pinned`)

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

### Phase 0b — QA environment (`apps/tenant-demo`, `tenant`; Atlas + SendGrid)

- [ ] `apps/tenant-demo/.env` points at Atlas `modules-mongodb-demo-tenant-test` + SendGrid (README §8a)
- [ ] `AUTH_FROM_ADDRESS` is a sender SendGrid will send as — otherwise every auth email fails silently
- [ ] **Live send confirmed:** one signup delivers a verification email to a real inbox, and the link works
- [x] Both `user-contacts` partial-unique indexes present (README §8c) — confirmed on the Atlas DB; the 0a `createIndex` command is not used here
- [x] **Clean slate:** QA DB cleared before the pass (README §8f) — leftover orgs/invitations/sessions make the data-separation checks unreadable — cleared 2026-07-31: 85 documents across 14 collections, both `user-contacts` indexes retained
- [ ] Served from a production build of `apps/tenant-demo` (`pnpm ldf:b && pnpm ldf:s`, port 3003), not `ldf:d` — removes the "building page" artifact a tester reads as an app bug
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
- [x] ~~**2FA enrol**: QR renders, confirm code, backup codes displayed~~ — pre-rework run: enrolment confirmed (`users.twoFactorEnabled: true`, one `user-two-factors` row, codes shown), but backup-codes **Copy was broken and could lose the one-time codes** → **F21**. **Superseded by the nested list below.**
- [x] **2FA disable** (`TwoFactorDisable`) — confirmed (`users.twoFactorEnabled: false`, `user-two-factors` row removed). Enrol-modal UX/visual issues → **F22**, now addressed below
- [ ] **2FA enrolment — reworked phased modal** (F21 + F22 a/b/c). Nothing here is provable by build alone: the reset that repopulates an invisible input and the `Validate` that reports success while checking nothing both compile perfectly. Needs a real authenticator app.
  - [ ] **First-time enrolment, on a freshly loaded page** — the **very first** `Set up` of the session, so nothing has written `enroltotp.*` before the trigger does (this is the case an `onOpen` seed would have rendered as an empty body). It opens straight on the password phase with a **complete screen and no empty first frame**, and no `choose` step
  - [ ] QR renders beside a **monospace manual key that copies**, and that key is a bare **base32 secret — not an `otpauth://` URI** (F22: it used to render the whole URI in a non-selectable disabled input)
  - [ ] A real TOTP code from an app set up by **that manual key** (not the QR) is accepted — proves the key is the right value
  - [ ] The codes grid renders **actual codes** (F21's outstanding re-confirmation — the state path was never live-verified)
  - [ ] **Done is disabled** on arrival; **Copy reports success and the modal STAYS OPEN** (F21: Copy used to be `cancelText` wired to `onClose`, so copying dismissed the dialog and discarded the codes)
  - [ ] Ticking "I've saved my backup codes" **enables Done**; Done closes the modal; the tile shows **On**
  - [ ] **State hygiene** (F22c) — after Done, `enroltotp.*` is empty in state; reopen and the **password field is blank**. This is the case that failed before: an `{}` reset cannot clear an input that was invisible in the previous eval cycle
  - [ ] **Abandon the password phase** — close, reopen: blank field, and the phase the caller's enrolment state calls for
  - [ ] **Abandon the scan phase** — close after Generate; the tile still reads **Off** and a fresh Generate issues a **new** secret
  - [ ] **"Confirm & enable" does NOT appear on the password phase** (F22b — it used to be the Modal's static `okText`, so it rendered in both phases and fired `TwoFactorVerify` with an empty code)
- [ ] **Replace authenticator** — with 2FA on, Manage opens on the password phase with the **warning `Alert`** before the password is spent; completing it makes the **new** secret work and the **old one fail**
- [ ] **Abandon a replacement mid-flow** — the single most dangerous transition in the change, and the reason the disable-first chain exists. With 2FA on: Manage → Replace → Generate → **close the modal**. The tile must read **Off**; signing out and back in must ask for a **password only, with no second-factor challenge**; then Set up again from the tile and confirm a fresh enrolment completes normally. _(Under the old bare `enable` this was the lockout: 2FA left enforced against a secret never scanned, with no admin 2FA reset anywhere in the suite — a DB fix.)_
- [ ] **Replace with a WRONG password** — takes the catch's `:else` branch: the password toast, the field **still holding what was typed**, and the tile unchanged on **On**. (The `:then` branch — `enable` failing _after_ `disable` committed — is hard to provoke on the rig; if it can be forced, the tile must drop to **Off** and the toast must say two-factor is now off rather than blaming the password.)
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

### Required-field validation — `Validate` scoping _(landed 2026-07-31)_

One defect class across eight forms, so test them as a single pass. Every one of these
passed a container id (`params: modal_changepw`) to `Validate`, which is an **exact-id**
matcher with no cascade to descendants — it matched only the Modal container, which has no
validation of its own, so the action **reported success while validating nothing**. All
eight now match the namespace their inputs actually write to.

Submit each form with a required field **empty** and confirm a **red field-level error**
on the field, and that the request never reaches the server.

**Read this before running these, or a pass will look like a fail:** these `Validate`
actions carry no `messages` config, so a validation failure **also** raises a summary
toast — "2 fields are invalid" or similar. That is the engine's validation summary, **not**
the server-error toast these items are checking against. Red field + summary toast = pass.
Server error message = fail.

Six are live defects today — a blank first or last name currently saves:

- [ ] `modal_enroltotp` **phase `scan`** — empty confirmation code (F22b: this used to reach `TwoFactorVerify` with an empty code)
- [ ] `modal_enroltotp` **phase `password`** — empty password (new guard; previously an empty password round-tripped to BetterAuth and came back as "check your password", blaming the user for a blank field)
- [ ] `modal_changepw` — empty current/new password
- [ ] `modal_disable2fa` — empty password
- [ ] `user-account` → **Profile** modal — clear **one of the two name fields** (`form_core.yaml` marks both `profile.given_name` and `profile.family_name` required)
- [ ] `user-admin` → `view` → **Profile** modal — same two fields, admin-side. A live defect: an admin can currently save a member with a blank name
- [ ] `user-admin` → **invite form** — clear a name field. This is also the **multi-pattern-regex proof**: its params span `^profile\.`, `^roles$` and `^member_attributes\.`, and the error must come from the `profile.` half

Two are **dead guards** — they have no input that can fail a required check, so **a passing
form proves nothing**. For each, temporarily mark one field `required: true` and confirm the
regex catches it, then revert:

- [ ] `user-admin` → **Global attributes** modal (`modal_global`) — inputs are `user_attributes.*` only. Note `^global\.` (what the container id suggests) matches **zero** blocks
- [ ] `user-admin` → **Access/Attributes** modal (`modal_access`) — inputs are bare `roles` + `member_attributes.*`. Note `^access\.` matches **zero** blocks. Its `roles` `required: true` is **inert** and cannot be the test: `required` on an array input synthesises `pass: { _not: { _type: 'none' } }`, and an array input is seeded to `[]`, which is not `none`

---
