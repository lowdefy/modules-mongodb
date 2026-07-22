---
title: User Account
module: user-account
type: index
concepts:
  [auth-pages, account-workspace, auth-methods, write-pathways, onboarding]
---

# User Account

The **self-service auth surface for one app**, rebuilt on the BetterAuth-based
auth engine. One package, two page families:

- **Public auth pages** — login, signup, forgot / reset password, verify email,
  two-factor challenge, accept invitation, logout. This module **is** the app's
  auth-pages module: the build points `auth.authPages.*` at these pages.
- **The signed-in account workspace** — a single `view` page with section-scoped
  tiles (profile, security, sessions), plus a chrome-less `onboarding` page for
  first-login profile completion.

It is the end-user counterpart to [`user-admin`](../user-admin/index.md) (the
operator console). Both run against the same `contact` / `user` / `member` /
`session` record model; one module instance serves **one pinned organization**
(org = app).

## What it does

- **Login** (`login` page) — renders whichever sign-in methods the deployment
  enables (email + password, magic link, OAuth buttons, passkey), read live from
  the app's auth config via `_build.authConfig` — **not** a module var. OAuth
  button label/icon/order come from the `providers` var. Also serves the
  `authPages.error` role: OAuth / magic-link failures redirect here and render as
  a login-page error state. A 2FA-enrolled sign-in routes to the `two-factor`
  page. See [Auth methods](concepts/auth-methods.md).
- **Signup** (`signup` page) — ships unconditionally, even under `invite-only`
  (an invitee signs up first, then accepts). Admission is engine policy, not the
  page's; with `requireEmailVerification` it shows the check-your-email state.
- **Password + verification flows** — `forgot-password`, `reset-password`, and
  `verify-email` (one page, two renders: the post-signup "check your email"
  prompt and the emailed-link landing).
- **Accept invitation** (`accept` page) — public, takes `?invitationId=…`, serves
  the `authPages.acceptInvitation` role so the invitation email's accept link
  targets it. Ensures a session, then fires one `AcceptInvitation` client action.
- **Account workspace** (`view` page) — one page, section-scoped edits:
  **Profile** (contact fields), **Security** (email + verification, change
  password, 2FA, passkeys, linked accounts — read-only), **Sessions** (active
  sessions + sign-out-others). Each tile writes through its own pathway. See
  [Write pathways](concepts/write-pathways.md).
- **Onboarding** (`onboarding` page) — chrome-less first-login profile
  completion; on save it sets `profile.profile_created: true`, the marker the
  app router reads to stop routing the user here.
- **Logout** (`logout` page) — signs out and offers a sign-in link.

## Dependencies

| Module                       | Why                                             |
| ---------------------------- | ----------------------------------------------- |
| [layout](../layout/index.md) | Page wrapper, auth-page shell, profile dropdown |
| [events](../events/index.md) | Audit logging and `change_stamp`                |

`notifications` is **not** a dependency. Every auth email (verification,
password-reset, magic-link, and the invitation sent by `user-admin`'s
`InviteMember`) dispatches through the platform's `auth.email` connection and
renders from the deployment's email theme — there is no module-shipped email
endpoint. An app that wants bespoke copy points `auth.email.templates.{flow}` at
one of its own `notifications:` entries — an app-level `auth:` override, not a
module dependency.

## Method enablement comes from the auth config

**Which** sign-in methods exist is the app's `auth:` config's call, read live via
`_build.authConfig` (`emailAndPassword.enabled`, `magicLink.enabled`,
`passkey.enabled`, `twoFactor.enabled`, and `providers` as `[{ id, type }]`).
There are **no `methods` / `two_factor` / `passkeys` mirror vars** — restating
`auth:` facts as vars is exactly the drift `_build.authConfig` exists to prevent.

The one thing the module owns is **OAuth display metadata** — label, icon, order
— which the auth config's provider projection deliberately omits. The `providers`
var supplies it, keyed by provider id; a configured provider with no metadata
entry falls back to its id. See [Auth methods](concepts/auth-methods.md).

## Write pathways

The person splits across app-owned contact data and auth-owned records, so writes
split by what they touch:

| Concern                              | Record                      | Write pathway                                                                                                              |
| ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Profile fields                       | `contact` (`user-contacts`) | `update-profile` API on the shared `write-profile` fragment — change-stamped contact write + `UpdateUserProfile` re-denorm |
| Login identity (password, 2FA, keys) | `user` + plugin collections | BetterAuth client actions against `/api/auth/*` (caller's own session)                                                     |
| Own sessions                         | `session` (`user-sessions`) | Native read for display; `RevokeOtherSessions` client action                                                               |
| Roles, attributes                    | `member` / `user`           | **Not self-service** — admin steps via [`user-admin`](../user-admin/index.md)                                              |

Reads stay native — the workspace aggregates over `users`, `user-sessions`,
`user-accounts`, `user-passkeys`, joined to `user-contacts` by
`profile.contactId`, all filtered to the caller. See
[Write pathways](concepts/write-pathways.md) for the profile → `_user`
denormalization and the shared fragments.

## Every user has a contact by first session

The module ships a **merge-on-signup hook** (`link-contact-on-signup`) bound at
`user.create.before` and `email.verified`: it links a new signup to an existing
`user-contacts` record by verified email, or mints a bare one when none matches.
So the workspace and onboarding pages never handle a missing contact. Match and
write run through the shared `create-or-link-contact` fragment (an upsert on
`lowercase_email`) — the same fragment `user-admin`'s invite flow uses, so the
two can't mint duplicate contacts for one email. This relies on the
[required indexes](reference/indexes.md).

## Prerequisites

- The app runs the BetterAuth-based auth engine with a **pinned** org policy and
  an authored `auth:` config (method gates, `providers`, `auth.email`).
- The [required indexes](reference/indexes.md) exist on `user-contacts` and
  `users`.
- **Same-database co-location** — the adapter database, the `user-contacts`
  connection, and the module's read connections must resolve to one MongoDB
  database (the workspace's `$lookup` joins cannot cross databases). See
  [`user-admin` → Same-database co-location](../user-admin/concepts/co-location.md).

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: user-account
    source: "github:lowdefy/modules-mongodb/modules/user-account@v1.0.0"
    vars:
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
      providers: # display metadata layered over _build.authConfig.providers
        - id: google
          label: Google
          icon: AiOutlineGoogle
```

There is **no `app_name` var** (per-app scoping by the old `apps.{app}` map is
gone) and **no method mirror vars** (`_build.authConfig` is the source). Drop the
`profile-default` menu into your app's `id: profile` menu for a zero-config
dropdown:

```yaml
# apps/{app}/menus.yaml
- id: profile
  links:
    _ref:
      module: user-account
      menu: profile-default
```

See `apps/demo/modules/user-account/vars.yaml` for a worked example, and the
[migration guide](how-to/migration.md) if upgrading from the v0.x surface. The
auth pages render through the `layout` module's auth-page shell — configure its
appearance on the `layout` module entry.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
- [Indexes](reference/indexes.md) — the host-app index requirements
- [Auth methods](concepts/auth-methods.md) — method enablement, the `providers` var, error handling, 2FA routing
- [Write pathways](concepts/write-pathways.md) — the record split, shared fragments, profile → `_user`
- [Migrating from v0.x](how-to/migration.md) — page/var renames and removals, dropped deps

## Shared idioms

- [Event display](../shared/event-display.md) — Nunjucks title templates (flat, non-app-keyed for this module)
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
