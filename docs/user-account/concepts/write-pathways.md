---
title: Write pathways
module: user-account
type: concept
concepts:
  [
    write-pathways,
    contact,
    betterauth-actions,
    denormalization,
    onboarding,
    passwordless,
  ]
---

# Write pathways

A "user" in this module is really two records: the app-owned **contact** (the
person's profile / CRM data) and the auth-owned **user** (login identity, plus
its `session` / `account` / `passkey` / `member` rows). Self-service writes go to
different places depending on which they touch — there is no single "save
everything" button, because one form can't honestly straddle a change-stamped
contact write and half a dozen session-gated auth calls.

| Concern                              | Record                      | Write pathway                                                                    |
| ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------- |
| Profile fields                       | `contact` (`user-contacts`) | `update-profile` API on the shared `write-profile` fragment                      |
| Login identity (password, 2FA, keys) | `user` + plugin collections | BetterAuth client actions against `/api/auth/*` (caller's own session)           |
| Own sessions                         | `session` (`user-sessions`) | Native read for display; `RevokeOtherSessions` client action                     |
| Roles, attributes                    | `member` / `user`           | **Not self-service** — admin steps via [`user-admin`](../../user-admin/index.md) |

Reads stay native: the workspace aggregates over `users`, `user-sessions`,
`user-accounts`, `user-passkeys`, joined to `user-contacts` by
`profile.contactId`, all filtered to the caller.

## Profile writes: contact-first, re-denormalized onto `_user`

Profile fields live only on the app-owned `contact` — that is the source of
truth. But the layout header, avatar, and menus read `_user.name` / `_user.image`
/ `_user.profile.*`, so a bare contact write would leave those stale.

The fix is the shared **`write-profile`** fragment, which pairs two writes in one
routine:

1. A **change-stamped contact write** to `user-contacts` (the `update-profile`
   API, with any `request_stages.write` appended).
2. An **`UpdateUserProfile`** step that re-denormalizes the contact's `profile`
   fragment onto the auth `user.profile` bag, plus the `name` / `image` display
   copies onto top-level `user.name` / `user.image`.

Because the two are inseparable in one fragment, contact profile data can never be
written without the denormalized `user.profile` bag being refreshed in the same
routine. A caller's own save additionally runs `UpdateSession` so the change shows
without a reload. `user.email` is **not** part of this — email change is a
verification flow, unexposed in v1.

### Why a shared fragment and not a module export

Contact profile data is written by **two** modules — this one (self-service) and
`user-admin` (an operator editing another user's profile). If only one re-denorm'd
its bag, the other's writes would leave the target's `_user` stale. So the
`write-profile` fragment lives var-free in `modules/shared/contact/` and is
`_ref`'d by **relative path** from both modules — not a manifest export. A shared
file resolves in any consumer with no dependency edge; a cross-module `_ref` would
force a needless `user-admin → user-account` dependency. Each caller passes its own
target ids, audit event, and write-stage extensions as `_ref` vars.

Freshness is therefore a **cross-module invariant enforced mechanically**, not
single-writer discipline: the bag drifts only if a contact is edited entirely
outside the module suite (raw DB, external sync) until the next module write.

## Security writes go to BetterAuth, gated two ways

Every Security-tile action is a BetterAuth client call against the caller's own
session — never a raw write to auth-owned data. Controls are gated on **two**
conditions:

- **The deployment gate** — the relevant `_build.authConfig` flag
  (`emailAndPassword.enabled`, `twoFactor.enabled`, `passkey.enabled`).
- **The per-user gate** — for password-dependent controls (change password, 2FA
  enable / disable), a native read of `user-accounts` for a `provider:
"credential"` row. An OAuth / magic-link-only user has no credential, so
  `changePassword` / `twoFactor.*` would 400 — those controls simply hide. A user
  in a **passwordless** deployment is exactly this "no credential" case: password
  and 2FA controls hide, while passkeys, linked accounts, and sessions remain.
  There is no "set password" flow for credential-less users in v1.

The linked-accounts block is **visibility only** (provider list from
`user-accounts`), and its read is the same one that feeds the credential check —
no extra query. Sessions offers one action, **sign out other sessions**
(`RevokeOtherSessions`); per-session revoke is deferred because BetterAuth's
`revokeSession` needs the session token, and shipping bearer tokens to the browser
isn't worth it.

## Onboarding and the completeness marker

The `onboarding` page is chrome-less first-login profile completion. The contact
already exists by then (the merge-on-signup hook guarantees it), so onboarding
only **updates** it — via the same `update-profile` pathway. On a successful save
it sets `profile.profile_created: true`.

That flag is the **onboarding-complete marker** the app router reads (surfaced on
`_user.profile.profile_created`) to decide whether to route a user to onboarding.
It is an **explicit flag, not a derived signal**, because the required-field set
is deployment-configurable: a contact can arrive with a name (invite prefill, CRM,
OAuth) yet still be missing deployment-specific fields, so no fixed field stands in
for "done". The flag keeps the router from having to know the module's field
config.
