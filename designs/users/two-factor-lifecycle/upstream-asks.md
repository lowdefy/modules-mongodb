# Two-factor lifecycle — Upstream Asks

Platform-side changes the [two-factor lifecycle design](design.md) depends on. This design's
sequence starts at ask 1; it is not a continuation of the user-account or user-admin ask numbering,
though ask 1 extends the same auth-step catalog the user-admin design's asks established, and asks 2
and 3 extend the engine's `auth:` config surface.

All three are outstanding. Ask 1 is independent and ships the recovery capability on its own; asks 2
and 3 are the enforcement half and only make sense together.

Everything below is verified against `better-auth@1.6.23` and the engine working tree at
`Developer/lowdefy`.

---

## 1. `ResetUserTwoFactor` auth step

> **Status: outstanding.** Independent of asks 2 and 3.

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/_completed/admin/design.md)
(the step catalog), `@lowdefy/plugin-better-auth`.

**Problem**: There is no route, at any layer, for an administrator to clear a user's second factor.
A person who loses their authenticator and has no backup codes left is locked out permanently.

- Both of BetterAuth's 2FA management endpoints — `/two-factor/enable`, `/two-factor/disable` —
  take their target from `ctx.context.session.user`. Self only, password-gated. Same for
  `get-totp-uri`, `verify-totp`, `verify-otp`, `verify-backup-code`, `generate-backup-codes`.
- The admin plugin has no 2FA statement:
  `user: [create, list, set-role, ban, impersonate, impersonate-admins, delete, set-password, set-email, get, update]`
  (`dist/plugins/admin/access/statement.mjs`).
- `/admin/update-user` cannot reach it either. `twoFactorEnabled` is declared `input: false` in the
  plugin's user schema; `parseInputData` (`dist/db/schema.mjs:59`) drops `input: false` keys on
  update — silently when the value is falsy, with `FIELD_NOT_ALLOWED` when truthy. So
  `data: { twoFactorEnabled: false }` is a no-op.
- The Lowdefy step catalog has thirteen steps and none touch 2FA.

**Ask** — one step, matching the catalog's existing pattern:

| Step                 | Properties | Notes                                                                                                 |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `ResetUserTwoFactor` | `userId`   | Adapter-direct; floored by `auth.userAdminRole` like every other admin step; no self-target exemption |

Implementation is the `UpdateUserAttributes.js` shape — `const { adapter } = await auth.$context`
— doing three writes:

1. `adapter.deleteMany({ model: 'twoFactor', where: [{ field: 'userId', value: userId }] })` — the
   secret and backup codes share a row.
2. `adapter.update({ model: 'user', where: [{ field: 'id', value: userId }], update: { twoFactorEnabled: false } })`.
3. Delete the user's `trust-device-*` verification records.

Three notes on the designed surface:

1. **The `input: false` guard does not apply here.** `parseInputData` is reached only through
   `internalAdapter` / with-hooks (`dist/db/schema.mjs:110-136` are its only call sites); the raw
   `adapter.*` surface the steps use does not run it. So the step can write `twoFactorEnabled`
   where `/admin/update-user` cannot. This is worth stating in the step's own comment, because the
   asymmetry is surprising.
2. **Step 3 is load-bearing, not tidying.** A device the user marked trusted holds a signed
   `trust_device` cookie backed by a verification record, good for `trustDeviceMaxAge` (default 30
   days). BetterAuth's own `/two-factor/disable` deletes that record. Skipping it would leave the
   most important reset case — a stolen device — with the thief's device still able to skip the
   challenge. The cookie cannot be expired from an admin's request, but deleting the record is
   sufficient: the sign-in hook looks it up and falls through to the challenge when absent.
3. **An unknown `userId` must throw**, mirroring `UpdateUserAttributes` and
   `UpdateMemberAttributes`. A silent no-op leaves the admin believing the person can now sign in.

The step deliberately does **not** revoke sessions. `RevokeUserSessions` already exists and the
consuming routine pairs them ([design](design.md) Decision 3) — a step that revokes sessions as an
undeclared side effect is the hidden blast radius the catalog's one-operation-per-step shape avoids.
Note that because `adapter.update` bypasses `internalAdapter.updateUser`, `refreshUserSessions` does
not fire, so the pairing is required for correctness as well as for security.

**Fallback if declined**: none that is acceptable. The module cannot write auth-owned records, and
there is no endpoint to call. A deployment would recover locked-out users by direct database
surgery, which is precisely what the step catalog exists to prevent.

---

## 2. `auth.twoFactor.required` and `_user.twoFactorSatisfied`

> **Status: outstanding.** Paired with ask 3.

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/concepts/engine/design.md) and
[config-schema](../../../lowdefy-design/designs/auth-upgrade/concepts/config-schema/design.md).

**Problem**: A deployment cannot require its members to hold a second factor. BetterAuth ships no
enforcement — the whole of `TwoFactorOptions` is `issuer`, `twoFactorTable`, `totpOptions`,
`otpOptions`, `backupCodeOptions`, `skipVerificationOnEnable`, `allowPasswordless`, `schema`,
`twoFactorCookieMaxAge`, `trustDeviceMaxAge`, `accountLockout`. Lowdefy's `auth.twoFactor` accepts
only `enabled` (`packages/build/src/lowdefySchema.js:865`).

The app-config workaround — a `router.yaml` branch on the session user, mirroring the existing
`_user: profile.profile_created` → onboarding branch at `apps/demo/pages/router.yaml:19-26` — fails
on three counts, which is why this is an engine ask rather than a module pattern:

- It gates page navigation only. APIs and requests do not pass through the router.
- It cannot see passkeys. `context.user` is
  `{...session.user, roles, attributes, activeOrganizationId}`
  (`resolveAuthentication.js:92`); `twoFactorEnabled` rides along as a returned user field, but
  there is nothing to evaluate a passkey against.
- It is opt-in correctness — every app must remember the branch, and one that forgets has silently
  no enforcement.

**Ask** — three pieces:

| Piece                      | Shape                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `auth.twoFactor.required`  | boolean, default `false`; schema + `computeAuthConfigProjection` so modules read `_build.authConfig.twoFactor.required` |
| `_user.twoFactorSatisfied` | computed in `resolveAuthentication` as `twoFactorEnabled === true \|\| passkeyCount > 0`                                |
| `authPages.twoFactorEnrol` | new optional key; where an unsatisfied caller is sent                                                                   |

**Why a passkey satisfies the requirement.** It is a phishing-resistant possession factor with a
user-verification ceremony bound to it, and both Entra ID and Okta accept one as satisfying MFA
outright. Requiring a hardware-key user to _also_ register TOTP pushes them toward the weaker
factor.

The passkey count is a read on the caller's own `userId` against the passkey collection, gated on
`required === true` so deployments without it pay nothing per request. The collection and access
pattern already exist — `user-admin`'s detail page reads it for its passkey badge.

Two notes:

1. **`required: true` with no `authPages.twoFactorEnrol` should fail the build**, not redirect to
   nowhere.
2. **Where the redirect is enforced is an open question** — inside `resolveAuthentication` or as a
   gate after it. It determines whether an unsatisfied caller hitting an API gets a redirect or a
   403, and how the enrolment page itself loads without tripping its own gate. Flagged in the
   design's open questions; the engine design should settle it.

**Fallback if declined**: the router-gate version, accepted as navigation-only with a documented
hole for API access and no passkey satisfaction. Workable for a low-stakes deployment, but it should
not then be described as a requirement.

---

## 3. Challenge interception for magic-link and OAuth sign-ins

> **Status: outstanding.** Paired with ask 2; ask 2 is largely hollow without it.

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/concepts/engine/design.md).

**Problem**: BetterAuth's 2FA challenge fires on three paths only —
`/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number`
(`dist/plugins/two-factor/index.mjs:192`). Magic-link, OAuth, and passkey sign-ins bypass the second
factor entirely.

This is already true today, before any `required` flag: `user-account` ships magic-link login, so a
2FA-enrolled user in this suite can avoid their own second factor by requesting a magic link. With
`required: true` it becomes a correctness problem, because the flag would advertise a guarantee the
sign-in surface does not deliver.

`/magic-link/verify` and `/callback/:id` are GET endpoints terminating in `throw ctx.redirect(...)`,
so the plugin's approach — returning `{ twoFactorRedirect: true }` for the login page to read — does
not transfer. The browser is mid-redirect with nothing to read JSON with.

**Ask** — engine `after` hooks on `/magic-link/verify` and `/callback/:id` that replicate the
plugin's interception and then redirect. Precisely, mirroring
`dist/plugins/two-factor/index.mjs:186-275`:

1. Delete the session the sign-in just created, clear its cookie, `setNewSession(null)`.
2. Honour the `trust_device` cookie first — a valid unexpired record short-circuits the challenge
   and is rotated, exactly as on the password path.
3. Create verification value `{ identifier: '2fa-' + generateRandomString(20), value: user.id, expiresAt: now + twoFactorCookieMaxAge }`.
4. Create the attempts record `{ identifier: '2fa-attempts-' + identifier, value: '0', expiresAt }`.
5. Set the signed `two_factor` cookie to the identifier.
6. `throw ctx.redirect(authPages.twoFactor)` — a new optional `authPages` key.

**Step 4 is the trap.** `beginAttempt`
(`dist/plugins/two-factor/verify-two-factor.mjs`) calls `consumeVerificationValue` on
`2fa-attempts-{identifier}` and throws `INVALID_TWO_FACTOR_COOKIE` when it is missing. A hook that
creates only the challenge record yields a page where every correct code is rejected with an error
blaming the cookie.

Two things that are already settled rather than assumptions:

- **Cookies survive the thrown redirect.** `/magic-link/verify` itself calls `setSessionCookie` then
  `throw ctx.redirect(callbackURL)`, so this is the established pattern inside the very endpoint
  being hooked.
- **There is precedent for hooking these paths.** `createMagicLinkSendGate` already intercepts
  `/sign-in/magic-link` as a core `hooks.before` (`getBetterAuthConfig.js:320`), and hook
  infrastructure lives in `packages/api/src/routes/auth/hooks/`.

**On `authPages.twoFactor`**: this amends
[user-account](../_completed/user-account-better-auth/design.md)'s "`authPages` has no 2FA key — this routing
never leaves the module." That holds for the password path and stays as-is; what changed is that
some sign-in paths are terminated by the engine, and for those the engine needs the address.

**Fallback if declined**: `required` means enrolment only, and the design must say plainly that a
magic-link or OAuth sign-in presents no second factor. A deployment wanting a real challenge
guarantee would have to disable those methods — which is a legitimate configuration, but it should
be a stated consequence rather than a discovered one.
