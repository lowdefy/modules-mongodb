# User Account on BetterAuth

Redesign of the `user-account` module for the BetterAuth-based auth engine (the auth-upgrade designs) — the self-service counterpart to [user-admin](../user-admin-better-auth/design.md). The module becomes two page families in one package: the app's **public auth pages** (login, signup, password reset, email verification, 2FA challenge, invitation accept, logout) and the signed-in **account workspace** (profile, security, sessions). A major breaking change — rebuilt against the `contact` / `user` / `member` model and BetterAuth's client surface, not adapted from the current interface.

## Proposed change

1. The module owns all of the app's auth pages — login, signup, forgot/reset password, verify email, 2FA challenge, accept invitation, logout — rendered method-driven from module vars; the auth-upgrade designs' "auth-page modules" resolve to this module.
2. Today's `view` / `edit` / `new` profile pages collapse into a single **account workspace** with section-scoped edits: a profile save is a contact request; every security action is a BetterAuth client call.
3. A new **security surface** adopts the engine's capabilities: change password, 2FA enrolment, passkeys, own-session management, linked-provider visibility — var-gated to mirror the app's `auth:` config.
4. The module ships the **merge-on-signup hook endpoint** (link-or-create contact by verified email), replacing the old `create-profile` flow; a slim `onboarding` page survives for first-login profile completion.
5. Profile saves **sync name/image** to the auth-owned `user` record via the self-service `UpdateUser` client action (email never syncs — no v1 pathway exists).
6. The extension surface carries over in kind (`fields.profile`, workspace slots, `request_stages.write`); the platform gaps this design depends on are recorded in [upstream-asks.md](upstream-asks.md) — chiefly a catalog of self-service client actions.

**Scope**: apps under the **`pinned` active-org policy**, matching the user-admin redesign. One module instance provides one app's auth pages and account pages.

**Dependency**: the auth-upgrade designs — [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (client actions, capabilities, `authPages`), [user-model](../../../lowdefy-design/designs/auth-upgrade/user-model/design.md) (records, hard wall, signup policies), [config-schema](../../../lowdefy-design/designs/auth-upgrade/config-schema/design.md) (auth method gates), [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md) (merge-on-signup binding), [mongodb](../../../lowdefy-design/designs/auth-upgrade/mongodb/design.md) (collection names, native reads).

---

## Problem

Today the module is passwordless-email login plus profile CRUD over the fused `user_contacts` collection, glued to NextAuth semantics: `?error=` query codes on the login page, adapter-enforced invite gating, a `create-profile` API that mints the profile record after first sign-in. The new engine replaces all of it: BetterAuth ships no UI (every auth page is module territory, wired through `auth.authPages.*`), sign-in is multi-method (password, magic link, OAuth, passkeys, 2FA), the person splits across app-owned `contact` and auth-owned `user` / `member` / `session` / `account` records, and self-service writes to auth-owned data go only through BetterAuth's mounted `/api/auth/*` endpoints — never raw MongoDB. The engine also brings capabilities the old module could never offer: password management, 2FA, passkeys, session revocation, linked-provider visibility. Every page and API is affected. Rebuild, don't port.

The write-pathway split, mirroring user-admin's reframe:

| Concern                              | Record                      | Write pathway                                                          |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------------------- |
| The person (profile fields)          | `contact` (`user-contacts`) | Normal request over app connection, change-stamped                     |
| Login identity (password, 2FA, keys) | `user` + plugin collections | BetterAuth client actions against `/api/auth/*` (caller's own session) |
| Own sessions                         | `session` (`user-sessions`) | Native read for display; `RevokeOtherSessions` client action           |
| Roles, attributes                    | `member` / `user`           | **Not self-service** — admin steps via the user-admin module           |

Reads stay native — the workspace aggregates over `users`, `user-sessions`, `user-accounts`, `user-passkeys`, joined to `user-contacts` by `contactId`, all filtered to the caller.

---

## Key decisions

### 1. One module owns both page families

Auth pages and account pages ship together, as they do today. Every app on this stack needs both; splitting them would buy composition freedom no concrete case asks for, at the cost of a second module entry and a cross-module dependency for every login ↔ logout ↔ account link. The user-admin design's non-goal ("auth-page modules own these") resolves here: **this module is the auth-pages module.** The invitation **accept page** therefore also lands here (user-admin Decision 7 pointed it this way).

URLs keep today's shape: `/{entry}/login`, `/{entry}/signup`, `/{entry}/view`, with `auth.authPages.*` pointing at them. The app currently hand-writes those scoped URLs and the `pages.public` list — upstream ask 2 asks the build to wire both from the module manifest; the fallback is today's documented hand-wiring.

### 2. Login is method-driven; errors are inline

The login page renders whichever sign-in methods the deployment enables, from a `methods` var:

```yaml
methods:
  password: true
  magic_link: false
  passkey: false # sign-in with passkey button
  providers: # OAuth buttons
    - id: google
      label: Google
      icon: AiOutlineGoogle
```

Display metadata (labels, icons, ordering) is irreducibly module-var territory — the same shape as user-admin's `roles` var — so the var is the source of truth for what the page shows; a method enabled in `auth:` but absent here simply isn't offered. All methods dispatch through the one `Login` action (engine Decision: dispatch by parameter).

NextAuth's `?error=` redirect handling dies. BetterAuth returns errors inline on the sign-in call — the page maps error codes (`MEMBERSHIP_REQUIRED` — the hard wall's "you have not been granted access", `EMAIL_NOT_VERIFIED`, invalid credentials) to friendly messages in-page. `auth.authPages.error` points at the login page (as the demo app does today); no dedicated error page.

**2FA challenge routing is the module's own.** When a 2FA-enrolled user signs in, the `Login` result signals two-factor-required and the page routes to the module's `two-factor` page (TOTP code or backup code, optional trust-device). `authPages` has no 2FA key — this routing never leaves the module.

### 3. Signup ships unconditionally; admission is engine policy

The signup page exists even under the default `invite-only` policy: a brand-new invitee **signs up first** (the engine's pending-invitation carve-out admits their pre-accept session), then accepts. Whether an uninvited signup gets in is the engine's call (`organizations.signup`, the hard wall) — the page doesn't re-implement policy, it just renders the outcome's error codes. With `requireEmailVerification` the signup response carries no session and the page shows the check-your-email state instead of navigating.

Signup methods mirror the login var: email+password via `SignUp`, social/magic-link "signup" via `Login` (the only real signup endpoint is email/password — engine design).

### 4. Accept-invitation page — public, thin, engine-trusting

`accept` is a public page taking the invitation id from the URL. It reads the invitation natively (org name, inviter, expiry — display only), and:

- **No session** → offers login / signup with a callback back to itself.
- **Session, email matches** → `AcceptInvitation` client action; BetterAuth validates, the engine's accept hook stamps `contactId` and copies invite-time attributes onto the minted member row. The page then links into the app.
- **Expired / mismatch / already-member** → the corresponding message; recovery is re-invite (admin side).

The page holds no orchestration — contactId stamping and attribute application are engine-tier (user-admin upstream ask 4); its job is session-ensuring plus one client call.

### 5. A single account workspace with section-scoped edits

One `view` page replaces view + edit. Tiles, each editing through its own modal and its own pathway:

- **Profile** — contact fields (`fields.profile` slot, binds `state.profile.*`). Save = `update-profile` API (contact write, change stamp, audit event) → `UpdateUser` syncs name/image to the auth-owned copies (Decision 6) → `UpdateSession` refreshes `_user`.
- **Security** — email + verified badge (resend verification when unverified); **change password** (current + new, revoke-other-sessions option — shown only when `methods.password`); **2FA** (enrol TOTP with QR + confirm code, backup codes, disable — behind `two_factor` var, default `false`); **passkeys** (list from native read, register/delete — behind `passkeys` var, default `false`); **linked accounts** (provider list from `user-accounts` — read-only, visibility not management, mirroring user-admin's auth-methods tile).
- **Sessions** — active sessions from a native read over `user-sessions` (created, expiry, IP, user-agent — **`token` projected out**, it's a bearer credential) with one action: **"sign out other sessions"** (`RevokeOtherSessions`). Per-session revoke is deferred: BetterAuth's `revokeSession` takes the session token, and shipping tokens to the browser to enable a per-row button is not worth it. If a concrete need appears, it needs a designed token-free pathway.

This mirrors user-admin Decision 3 and is the data model speaking: one "edit everything" form would smear a contact request and half a dozen session-gated auth calls behind one Save button. Per-section routines give crisp audit events and honest partial-failure behaviour.

The old `new` page becomes **`onboarding`** — chrome-less first-login profile completion (the contact already exists by then, Decision 7; the page only updates it). Routing users there is app/router territory, as today.

### 6. Profile saves sync name/image to the user record; email never

The platform does no mirroring between `contact` and `user.name` / `user.image`, and declares the sync module logic — this design settles it. After the contact write, the workspace calls `UpdateUser` (BetterAuth's session-gated self-update, name/image only) so `_user.name` / `_user.image` — which drive the layout header, avatar, and menus — match the profile. The sync is client-side best-effort: if it fails the contact save stands, and drift is corrected on the next successful save. Display inside the module always prefers the contact.

`user.email` is different in kind: email change is a verification flow, explicitly unexposed in v1 (config-schema stance), admin-side and self-side. Non-goal.

### 7. The module ships merge-on-signup — link or create the contact

The hooks design's flagship endpoint hook — match a new signup to an existing contact by verified email — is contact-domain logic, so it ships here (the same way user-admin ships `invitation.send`): an `InternalApi` endpoint running in system context, bound at `email.verified` (email/password signups) and `user.create.before` (verified-provider OAuth). The module extends it with **create-if-missing**: an open-signup user with no existing contact gets one minted (change-stamped, system context), so **every user has a contact by first session** and the workspace/onboarding pages never handle a missing record.

Under `invite-only` the binding is harmless-to-helpful: invited users usually match the invite-created contact, and the engine's accept-time `contactId` stamp remains authoritative. Uniform behaviour, no knob.

Bindings ride the module-exported hook mechanism (user-admin upstream ask 6, shared); fallback is documented app-side `auth.hooks` entries. The `create-profile` API is retired.

### 8. Extension surface — carried over, renamed to the model

- **`fields.profile`** + `show_honorific` — unchanged in kind; serve the profile tile, its edit modal, and `onboarding`.
- **`components.main_slots`** → workspace slots (extra tiles under the workspace main column); auth-page message vars (`login_message`, plus signup/verify equivalents) carry over.
- **`request_stages.write`** — appended to the profile write, as today (the only module-owned write pipeline left).
- **`event_display`, `avatar_colors`** carry over in kind; **`app_name` is retired** (per-app scoping dies with the `apps.{app}` map, matching user-admin).
- **New vars**: `methods` (Decision 2), `two_factor` (default `false`), `passkeys` (default `false`).
- **Shared components carry over**: `profile-avatar`, `user-selector`, `user-multi-selector`, `user-avatar` — they read `user-contacts` and survive the model change with pipeline updates only.

Events: profile writes stay audited through the `events` dependency, as today. Sign-in/sign-out and security-action audit trails are platform hook territory (`session.create.after` etc.), not module events — out of scope here.

**Dependencies**: `layout` (page + auth-page wrappers), `events`. `notifications` is **not** a dependency — reset/verification/magic-link emails dispatch through the platform's `auth.email` SMTP block, and the invitation email is user-admin's binding.

---

## Module surface (sketch)

| Export      | Contents                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages       | Public: `login`, `signup`, `forgot-password`, `reset-password`, `verify-email`, `two-factor`, `accept`, `logout`. Protected: `view` (workspace), `onboarding`                             |
| APIs        | `update-profile`, `link-contact-on-signup` (the merge-on-signup hook endpoint)                                                                                                            |
| Connections | `user-contacts-collection` (app connection, read-write), plus read-only per auth collection read natively: `users`, `user-sessions`, `user-accounts`, `user-passkeys`, `user-invitations` |
| Components  | `profile-avatar`, `user-selector`, `user-multi-selector`, `user-avatar`                                                                                                                   |
| Menus       | `default` (Account), `profile-default` (Profile + Divider + Logout)                                                                                                                       |

The `verify-email` page covers both states of the verification flow: the post-signup "check your email" prompt, and the landing after the emailed link (BetterAuth's `GET /api/auth/verify-email` redirects to its `callbackURL` with success or an error query) — one page, two renders.

Retired vs today: `edit` and `new` pages (workspace + `onboarding`), `verify-email-request` (renamed `verify-email` to match the `authPages` key), `create-profile` API, `app_name` var, NextAuth `?error=` handling, the adapter's invite-required gating (the hard wall owns admission now). A consumer migration guide (v0.9 → this surface) is an implementation task once the design is finalised.

Implementation note: TOTP enrolment renders the `totpURI` as a QR code — no built-in Lowdefy block does this, so `@lowdefy/modules-mongodb-plugins` gains a small QR block (with the URI shown as copyable text fallback).

---

## Upstream asks (feedback into the auth-upgrade designs)

Specified in **[upstream-asks.md](upstream-asks.md)**:

1. **Self-service client action catalog** (hard dependency) — named actions wrapping BetterAuth's session-gated client methods: `UpdateUser`, `ChangePassword`, `RequestPasswordReset`, `ResetPassword`, `SendVerificationEmail`, `TwoFactorEnable` / `TwoFactorVerify` / `TwoFactorDisable`, `PasskeyRegister` / `PasskeyDelete`, `RevokeOtherSessions`, `AcceptInvitation` — plus `Login` surfacing the two-factor-required result, and action responses readable via `_actions` for data-bearing calls (TOTP URI, backup codes).
2. **Module-exported auth-page wiring** — the build resolves `auth.authPages.*` and the `pages.public` list from module manifest declarations, instead of the app hand-writing scoped URLs (extends user-admin ask 6's mechanism).
3. **`contactId` on the session user** — expose `_user.contactId` so own-contact reads skip a `users` hop (fallback: aggregate from `users`).
4. **Module-exported hook bindings** — shared with user-admin ask 6; this module binds `email.verified` and `user.create.before`.

## Non-goals

- **Email change** — self-service and admin-side; explicitly unexposed upstream in v1. A wrong email is handled admin-side (re-invite).
- **Account deletion** — admin-only (`DeleteUser` step, user-admin's surface); no self-service delete in v1, per upstream stance.
- **Roles / attributes self-editing** — auth-owned authorization inputs, admin steps only.
- **Provider link/unlink management** — the linked-accounts tile is visibility only; linking flows (and unlink's last-method hazards) need their own design if a concrete need appears.
- **Org switching / multi-tenant account UI** — `SetActiveOrganization` and tenant self-serve are outside the `pinned` scope.
- **Per-session revoke** — deferred pending a token-free pathway (Decision 5).
- **Sign-in/security audit timeline** — platform hook territory, not module events.

## Open questions

- **Workspace tile granularity** — Security as one tile vs separate 2FA / passkeys / sessions tiles; decide when the page is real (the write pathways per section are fixed either way).

## Related

- [user-admin-better-auth](../user-admin-better-auth/design.md) — the operator-side counterpart; shares the record model, the native-read conventions, and upstream asks 4/6.
