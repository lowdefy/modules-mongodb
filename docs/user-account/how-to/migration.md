---
title: Migrating from the v0.x surface
module: user-account
type: how-to
concepts: [migration, breaking-change, betterauth, magic-link, passwordless]
---

# Migrating from the v0.x surface

`user-account` was **rebuilt** on the BetterAuth-based auth engine — a major
breaking change, not an in-place upgrade. The old module was passwordless-email
login plus profile CRUD over the fused `user_contacts` collection, glued to
NextAuth semantics (`?error=` query codes, adapter-enforced invite gating, a
`create-profile` API that minted the profile after first sign-in). The new engine
replaces all of it: BetterAuth ships no UI, so every auth page is now this
module's; sign-in is multi-method; the person splits across app-owned `contact`
and auth-owned `user` / `member` / `session` / `account` records; and
self-service writes to auth-owned data go only through BetterAuth's
`/api/auth/*` client actions.

Expect to re-do your module configuration rather than tweak it.

## Prerequisite

The app must run the BetterAuth-based auth engine with a **pinned** org policy
(`auth.organizations.policy: pinned`) and an authored `auth:` config — method
gates (`emailAndPassword`, `magicLink`, `passkey`, `twoFactor`), `providers`, and
the `auth.email` connection. The [required indexes](../reference/indexes.md) must
exist on `user-contacts` and `users`, and the adapter database, the
`user-contacts` connection, and the module's read connections must all resolve to
**one MongoDB database** (see
[Same-database co-location](../../user-admin/concepts/co-location.md)).

## Magic-link is the passwordless migration path

The old module was passwordless-email login, so the closest match on the new
engine is a **passwordless deployment**: `emailAndPassword.enabled: false` and
`magicLink.enabled: true`. The login page then renders email-only (no password
field, no "Forgot?"), sign-up collapses into sign-in behind one email → link
action, and there is **no `/signup` route**. Because the module still declares a
static `authPages.signUp: signup` it cannot gate module-side, a passwordless app
**must** set `auth.authPages.signUp: login` in its own `auth:` config, or the
`signUp` role 404s at runtime. See
[Passwordless-primary](../concepts/auth-methods.md#passwordless-primary-sign-up-collapses-into-sign-in)
for the full shape. Enabling password alongside magic-link (a mixed deployment)
is the additive path — it keeps `/signup` and adds a password form.

## Pages

| v0.x                   | Now                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `login`                | `login` (method-driven; also serves the `authPages.error` role)                                                                               |
| `view` + `edit`        | `view` (single account workspace with section-scoped edit modals)                                                                             |
| `new`                  | `onboarding` (chrome-less first-login profile completion)                                                                                     |
| `verify-email-request` | `verify-email` (renamed to match the `authPages` key; one page, both the "check your email" and emailed-link-landing states)                  |
| —                      | `signup`, `forgot-password`, `reset-password`, `two-factor`, `accept`, `logout` (new — BetterAuth ships no UI, so these are the module's now) |

The **`accept` page moves into this module** — it is the auth-pages module, and
the invitation-accept page belongs with the auth pages (it was never
`user-admin`'s).

## Vars

| v0.x       | Now         | Notes                                                                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `app_name` | **removed** | Per-app scoping by the `apps.{app}` map is gone; one instance = one pinned org. `event_display` is now a **flat** map, no app keying. |
| —          | `providers` | OAuth display metadata (label / icon / order) layered over `_build.authConfig.providers`.                                             |

There are **no `methods` / `two_factor` / `passkeys` mirror vars** — method
enablement is read live from the app's `auth:` config via `_build.authConfig`, not
restated as module vars. See [Auth methods](../concepts/auth-methods.md).

`login_message`, `signup_message`, `verify_email_message`, `fields.profile` /
`fields.show_honorific`, `components.main_slots`, `request_stages.write`,
`event_display`, and `avatar_colors` carry over in kind. `event_display` is now a
flat `{ event-type: template }` map (no `app_name` key) and its templates receive
`user` (the acting user).

## APIs

- **`create-profile` is removed.** The record is no longer minted after first
  sign-in. Instead the module ships a **merge-on-signup hook**
  (`link-contact-on-signup`, bound at `user.create.before` and `email.verified`)
  that links a new signup to an existing contact by verified email, or mints a
  bare one — so every user has a contact by first session. The `onboarding` page
  only **updates** that contact.
- **`update-profile` is new** in kind — it writes the contact through the shared
  `write-profile` fragment and re-denormalizes onto the caller's `user.profile`.
  See [Write pathways](../concepts/write-pathways.md).

## Dependencies

- `notifications` is **not** a dependency. Every auth email (verification,
  password-reset, magic-link, invitation) rides the deployment's `auth.email`
  connection. An app that wants bespoke copy points
  `auth.email.templates.{flow}` at one of its own `notifications:` entries — an
  app-level `auth:` override, not a module dependency.
- `layout` and `events` are unchanged.

## Behaviour changes

- **NextAuth `?error=` handling is retained only for the redirect methods.**
  Password sign-in returns errors inline; OAuth / magic-link failures still
  redirect to `authPages.error` (the login page) and are read off the query
  string. One error-code → message table serves both paths, with a catch-all
  `default` branch. See [Auth methods](../concepts/auth-methods.md).
- **Admission is engine policy, not the adapter.** The old adapter's
  invite-required gating is gone — the engine's hard wall owns admission now.
  Signup ships unconditionally even under `invite-only`; the page just renders the
  engine's outcome codes.
- **The account workspace is section-scoped.** Profile save is a contact request;
  every security action (change password, 2FA, passkeys) is a BetterAuth client
  call gated on both `_build.authConfig` and a per-user credential read; sessions
  offers sign-out-others only.
- **New engine capabilities**: change password, 2FA (TOTP) enrolment, passkey
  register / delete, session listing + sign-out-others, and read-only
  linked-provider visibility — none of which the old passwordless module could
  offer.
- **Profile freshness is denormalized, not synced.** The contact stays the source
  of truth; the module re-denormalizes `user.profile` (and `name` / `image`) in
  the same routine as the contact write, so `_user.*` resolves without a
  client-side sync. **Email never syncs** — email change is out of scope in v1.
