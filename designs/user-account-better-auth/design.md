# User Account on BetterAuth

Redesign of the `user-account` module for the BetterAuth-based auth engine (the auth-upgrade designs) — the self-service counterpart to [user-admin](../user-admin-better-auth/design.md). The module becomes two page families in one package: the app's **public auth pages** (login, signup, password reset, email verification, 2FA challenge, invitation accept, logout) and the signed-in **account workspace** (profile, security, sessions). A major breaking change — rebuilt against the `contact` / `user` / `member` model and BetterAuth's client surface, not adapted from the current interface.

## Proposed change

1. The module owns all of the app's auth pages — login, signup, forgot/reset password, verify email, 2FA challenge, accept invitation, logout — rendered method-driven from module vars; the auth-upgrade designs' "auth-page modules" resolve to this module.
2. Today's `view` / `edit` / `new` profile pages collapse into a single **account workspace** with section-scoped edits: a profile save is a contact request; every security action is a BetterAuth client call.
3. A new **security surface** adopts the engine's capabilities: change password, 2FA enrolment, passkeys, own-session management, linked-provider visibility — gated by reading the app's `auth:` config directly via `_build.authConfig` (no mirror vars), plus a per-user credential read for the password-dependent controls.
4. The module ships the **merge-on-signup hook endpoint** (link-or-create contact by verified email), replacing the old `create-profile` flow; a slim `onboarding` page survives for first-login profile completion.
5. The auth `user` carries an opaque `profile` bag the module denormalizes from the contact: the engine **surfaces `user.profile` on `_user`** (upstream ask 5, settled by denormalization), written server-side through the `UpdateUserProfile` step, so `_user.name` / `_user.image` / `_user.profile.*` resolve on the caller with no client-side sync (email never syncs — no v1 pathway exists).
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

Reads stay native — the workspace aggregates over `users`, `user-sessions`, `user-accounts`, `user-passkeys`, joined to `user-contacts` by `profile.contactId`, all filtered to the caller.

---

## Key decisions

### 1. One module owns both page families

Auth pages and account pages ship together, as they do today. Every app on this stack needs both; splitting them would buy composition freedom no concrete case asks for, at the cost of a second module entry and a cross-module dependency for every login ↔ logout ↔ account link. The user-admin design's non-goal ("auth-page modules own these") resolves here: **this module is the auth-pages module.** The invitation **accept page** therefore also lands here (user-admin Decision 7 pointed it this way).

URLs keep today's shape: `/{entry}/login`, `/{entry}/signup`, `/{entry}/view`, with `auth.authPages.*` pointing at them. The app currently hand-writes those scoped URLs and the `pages.public` list — upstream ask 2 asks the build to wire both from the module manifest; the fallback is today's documented hand-wiring.

### 2. Login is method-driven; enablement from `_build.authConfig`, errors split by method

The login page renders whichever sign-in methods the deployment enables. **Enablement is read from the app's auth config, not a module var**: `_build.authConfig` (config-schema) exposes `emailAndPassword.enabled`, `magicLink.enabled`, `passkey.enabled`, and `providers` (`[{ id, type }]`) at build time, so the page shows a password form, magic-link tab, passkey button, or OAuth button exactly when `auth:` configures it — no mirror var to drift out of sync (config-schema built `_build.authConfig` precisely to retire these mirror vars).

What the module _does_ own is **OAuth display metadata** — labels, icons, ordering — which the projection deliberately omits (`providers` carries only `{ id, type }`). A `providers` var supplies it, keyed by provider id:

```yaml
providers: # display metadata layered over _build.authConfig.providers
  - id: google
    label: Google
    icon: AiOutlineGoogle
```

The page cross-references the two: it renders a button for each provider `_build.authConfig` reports enabled, drawing label/icon/order from this var (a configured provider with no metadata entry falls back to its id). Display metadata is irreducibly module-var territory — the same shape as user-admin's `roles` var — but _which_ methods exist is the auth config's call, read live via `_build.authConfig`. All methods dispatch through the one `Login` action (engine Decision: dispatch by parameter).

Error handling splits by method. **Password** sign-in returns errors inline on the `Login` call — the page maps the code to a friendly message in-place. **OAuth and magic-link** can't return inline (the user has left for the provider, or clicked an emailed link), so membership/verification failures arrive as a **redirect to `auth.authPages.error`**, which points at the login page (as the demo does today) — the page reads the code off the query string (today's `_url_query: error` path) and maps it through the same table. So NextAuth's `?error=` handling is **retained for the redirect methods**, not dropped. One error-code → message table serves both paths; codes covered: `MEMBERSHIP_REQUIRED` (the hard wall's "you have not been granted access"), `EMAIL_NOT_VERIFIED`, and `INVALID_EMAIL_OR_PASSWORD` (bad email/password — BetterAuth's `BASE_ERROR_CODES`, verified against source). There is **no dedicated error page** — the login page serves the `authPages.error` role, rendering the failure as a login-page state (e.g. the `login-no-access` mockup).

**2FA challenge routing is the module's own.** When a 2FA-enrolled user signs in, the `Login` result signals two-factor-required and the page routes to the module's `two-factor` page (TOTP code or backup code, optional trust-device). `authPages` has no 2FA key — this routing never leaves the module.

### 3. Signup ships unconditionally; admission is engine policy

The signup page exists even under the default `invite-only` policy: a brand-new invitee **signs up first** (the engine's pending-invitation carve-out admits their pre-accept session), then accepts. Whether an uninvited signup gets in is the engine's call (`organizations.signup`, the hard wall) — the page doesn't re-implement policy, it just renders the outcome's error codes. With `requireEmailVerification` the signup response carries no session and the page shows the check-your-email state instead of navigating.

Signup methods mirror the login var: email+password via `SignUp`, social/magic-link "signup" via `Login` (the only real signup endpoint is email/password — engine design).

### 4. Accept-invitation page — public, thin, engine-trusting

`accept` is a public page taking the invitation id from the URL. It reads the invitation natively (org name, inviter, expiry — display only), and:

- **No session** → offers login / signup with a callback back to itself.
- **Session, email matches** → `AcceptInvitation` client action; BetterAuth validates, the engine's accept hook merges the invitation's `profile` fragment (carrying `contactId`) onto `user.profile` and copies invite-time attributes onto the minted member row. The page then links into the app.
- **Expired / mismatch / already-member** → the corresponding message; recovery is re-invite (admin side).

The page holds no orchestration — the `profile` merge and attribute application are engine-tier (user-admin upstream ask 4); its job is session-ensuring plus one client call.

### 5. A single account workspace with section-scoped edits

One `view` page replaces view + edit. Tiles, each editing through its own modal and its own pathway:

- **Profile** — contact fields (`fields.profile` slot, binds `state.profile.*`). Save = `update-profile` API (contact write, change stamp, audit event, and an `UpdateUserProfile` step denormalizing `name` / `image` / `profile` onto `user.profile`) → `UpdateSession` refreshes `_user` so the header/avatar/menus pick up the new profile (surfaced via upstream ask 5 — no client-side sync; Decision 6).
- **Security** — email + verified badge (resend verification when unverified); **change password** (current + new, revoke-other-sessions option — shown when `_build.authConfig.emailAndPassword.enabled` **and** the caller holds a password credential, from a native read of `user-accounts` for a `provider: "credential"` row; the deployment gate is the auth config, the per-user gate is the credential read, because an OAuth/magic-link-only user has no credential and `changePassword` would 400); **2FA** (enrol TOTP with QR + confirm code, backup codes, disable — shown when `_build.authConfig.twoFactor.enabled` **and** the same credential read, since `twoFactor.enable`/`disable` are password-gated); **passkeys** (list from native read, register/delete — shown when `_build.authConfig.passkey.enabled`); **linked accounts** (provider list from `user-accounts` — read-only, visibility not management, mirroring user-admin's auth-methods tile). Credential presence comes from the same `user-accounts` read that feeds linked accounts — no extra query. There is no "set password" flow for credential-less users (out of scope), so the password-gated controls simply hide.
- **Sessions** — active sessions from a native read over `user-sessions` (created, expiry, IP, user-agent — **`token` projected out**, it's a bearer credential) with one action: **"sign out other sessions"** (`RevokeOtherSessions`). Per-session revoke is deferred: BetterAuth's `revokeSession` takes the session token, and shipping tokens to the browser to enable a per-row button is not worth it. If a concrete need appears, it needs a designed token-free pathway.

This mirrors user-admin Decision 3 and is the data model speaking: one "edit everything" form would smear a contact request and half a dozen session-gated auth calls behind one Save button. Per-section routines give crisp audit events and honest partial-failure behaviour.

The old `new` page becomes **`onboarding`** — chrome-less first-login profile completion (the contact already exists by then, Decision 7; the page only updates it, via `update-profile`). Onboarding owns what "complete" means: it renders its required `fields.profile` and, on a successful save, sets **`profile.profile_created: true`** — the onboarding-complete marker (semantically "onboarding done," since create-or-link, not this page, creates the record). Routing users to onboarding stays app/router territory, as today: the router reads `_user.profile.profile_created` (surfaced via ask 5) and sends users there until it is true. The marker is an **explicit flag, not a derived signal**, because the required-field set is deployment-configurable — a contact can arrive with a name (invite prefill, CRM, OAuth) yet still be missing deployment-specific onboarding fields (e.g. birthday), so no fixed field stands in for "done," and the flag keeps the router from having to know the module's field config.

### 6. Profile lives on the contact, surfaced on `_user`; email never syncs

Profile fields live only on the app-owned `contact` as the source of truth; the auth `user` carries a denormalized `profile` copy the module keeps in step. The layout header, avatar, and menus read `_user.name` / `_user.image` — but rather than a client-side `UpdateUser` sync after every profile save (the earlier plan), the engine **surfaces `user.profile` on `_user`** via upstream ask 5, settled by denormalization: the module writes `name` / `image` / `profile` onto `user.profile` server-side through the `UpdateUserProfile` step, in the same routine as the contact write, so `_user.name` / `_user.image` / `_user.profile.*` resolve on the caller. There is no client-side copy to drift, and freshness rides single-writer discipline — the module is the only writer of contact profile data (upstream user-profile Decision 1's accepted trade). A profile save refreshes `_user` (`UpdateSession`) so the change shows without a reload; display inside the module reads the contact directly regardless.

`user.email` is different in kind: email change is a verification flow, explicitly unexposed in v1 (config-schema stance), admin-side and self-side. Non-goal.

### 7. The module ships merge-on-signup — link or create the contact

The hooks design's flagship endpoint hook — match a new signup to an existing contact by verified email — is contact-domain logic, so it ships here (the same way user-admin ships `invitation.send`): an `InternalApi` endpoint running in system context, bound at `email.verified` (email/password signups) and `user.create.before` (verified-provider OAuth). That upstream hook is **link-only** (it `:return`s the record with `contactId` set against an existing contact); the **create** half is this module's extension: an open-signup user with no matching contact gets one minted (change-stamped, system context, **bare** — no name copied from the signup/OAuth payload, `profile.profile_created` unset — so first login routes through onboarding, Decision 5), so **every user has a contact by first session** and the workspace/onboarding pages never handle a missing record.

The two binding points write `profile.contactId` back by different mechanics, so the fragment's write-back step branches on which fired. `user.create.before` is a **pre-write** hook — it sets `profile.contactId` inline by returning the mutated record (`:return`). `email.verified` is a **synthetic post-write** point (it fires _after_ the user row is written), so the fragment can't mutate inline there; it writes `profile.contactId` through the `UpdateUserProfile` step (upstream user-profile Decision 4, retiring the direct-write exception).

Create-or-link is an **upsert keyed on `lowercase_email`**, not a bare check-then-insert: match the contact by its lowercased email, link (`contactId`) when found, insert when absent, and **reconcile to the existing row on a duplicate-key error**. This closes the race with the user-admin invite flow (its Decision 7), which create-or-links the same contact by the same key — two concurrent first-touches for one email would otherwise mint two contacts. The module's partial-unique `users` index on `profile.contactId` does **not** guard this: it enforces one `user` per `contact`, not one `contact` per email. The guard is a **unique index on the contact's `lowercase_email`** (schema requirement — the field and index continue the convention today's `user-contacts` already uses; the exact partial-unique shape is pinned down in the schema pass). Both callers run the same **shared `create-or-link-contact` fragment** — exported by this module, `_ref`'d by user-admin's invite — so the match-and-write semantics can't drift.

Under `invite-only` the binding is harmless-to-helpful: invited users usually match the invite-created contact, and the engine's accept-time `profile` merge (carrying `contactId`) remains authoritative. Uniform behaviour, no knob.

Bindings ride the module-exported hook mechanism (user-admin upstream ask 6, shared); fallback is documented app-side `auth.hooks` entries. The `create-profile` API is retired.

### 8. Extension surface — carried over, renamed to the model

- **`fields.profile`** + `show_honorific` — unchanged in kind; serve the profile tile, its edit modal, and `onboarding`.
- **`components.main_slots`** → workspace slots (extra tiles under the workspace main column); auth-page message vars (`login_message`, plus signup/verify equivalents) carry over.
- **`request_stages.write`** — appended to the profile write, as today (the only module-owned write pipeline left).
- **`event_display`, `avatar_colors`** carry over in kind; **`app_name` is retired** (per-app scoping dies with the `apps.{app}` map, matching user-admin).
- **New var**: `providers` (Decision 2) — OAuth display metadata (label/icon/order) layered over `_build.authConfig.providers`. Method **enablement** (password, magic link, passkey, 2FA, providers) reads from `_build.authConfig`, so there are **no `methods` / `two_factor` / `passkeys` mirror vars** — restating `auth:` facts as vars is exactly the drift `_build.authConfig` exists to prevent (config-schema).
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
| Components  | `profile-avatar`, `user-selector`, `user-multi-selector`, `user-avatar`, `create-or-link-contact` (shared upsert-on-`lowercase_email` fragment, `_ref`'d by user-admin's invite)          |
| Menus       | `default` (Account), `profile-default` (Profile + Divider + Logout)                                                                                                                       |

The `verify-email` page covers both states of the verification flow: the post-signup "check your email" prompt, and the landing after the emailed link (BetterAuth's `GET /api/auth/verify-email` redirects to its `callbackURL` with success or an error query) — one page, two renders.

Retired vs today: `edit` and `new` pages (workspace + `onboarding`), `verify-email-request` (renamed `verify-email` to match the `authPages` key), `create-profile` API, `app_name` var, NextAuth `?error=` handling, the adapter's invite-required gating (the hard wall owns admission now). A consumer migration guide (v0.9 → this surface) is an implementation task once the design is finalised.

Implementation note: TOTP enrolment renders the `totpURI` as a QR code — no built-in Lowdefy block does this, so `@lowdefy/modules-mongodb-plugins` gains a small QR block (with the URI shown as copyable text fallback).

---

## Upstream asks (feedback into the auth-upgrade designs)

Specified in **[upstream-asks.md](upstream-asks.md)**. **All five asks are delivered upstream.**

1. **Self-service client action catalog** (hard dependency) — **delivered**: named actions wrapping BetterAuth's session-gated client methods (`ChangePassword`, `RequestPasswordReset`, `ResetPassword`, `SendVerificationEmail`, `TwoFactorEnable` / `TwoFactorVerify` / `TwoFactorDisable`, `PasskeyRegister` / `PasskeyDelete`, `RevokeOtherSessions`, `AcceptInvitation`), plus `Login` surfacing the two-factor-required result and `_actions`-readable responses (TOTP URI, backup codes). TOTP-only at launch; per-session revoke excluded (token-exposure, Decision 5). The self-service `UpdateUser` action is **excluded** from the catalog (user-profile Decision 5) — never depended on (Decision 6 relies on ask 5 instead).
2. **Module-exported auth-page wiring** — **delivered**: the build contributes `auth.authPages.*` and `pages.public` from manifest declarations (app config wins on collision); `_build.authConfig` exposes the auth config to module pages (Decisions 2, 5).
3. **`contactId` on the session user** — **delivered (superseded shape)**: `contactId` lives inside the caller's `profile` bag as `_user.profile.contactId` (user-profile Decision 2), used for own-contact reads and the `update-profile` write target (resolves review-1 #6a).
4. **Module-exported hook bindings** — **delivered**: manifest-exported, one endpoint bindable at multiple points (this module binds `email.verified` and `user.create.before`); shared with user-admin ask 6.
5. **Contact `profile` on the session `_user`** — **delivered**: the user-profile design settles it by **denormalization** (Decision 1) — an opaque `user.profile` bag carried onto the caller, written by the module through the `UpdateUserProfile` step (Decision 4) and refreshed client-side by `UpdateSession`, so `_user.name` / `_user.image` / `_user.profile.*` and the router's completeness signal (`_user.profile.profile_created`, Decision 5) resolve on the caller. The proposed resolve-time enrichment hook was rejected for denormalization; the performance caveat is resolved by riding the existing user-row read (no join). Caveat: freshness relies on the module being the single writer of contact profile data.

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
