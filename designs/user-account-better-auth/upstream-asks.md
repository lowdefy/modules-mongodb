# User Account — Upstream Asks

Platform-side changes the [user-account design](design.md) depends on, to be resolved in the **auth-upgrade designs** (`lowdefy-design/designs/auth-upgrade/`). Ask 1 is a hard dependency — most of the security surface is unbuildable without it. Ask 2 removes hand-wiring; ask 3 is a convenience with a clean fallback; ask 4 is shared with user-admin.

---

## 1. Self-service client action catalog (hard dependency)

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (client section, `@lowdefy/actions-core`).

**Problem**: The engine designs ship `Login`, `SignUp`, `Logout`, `UpdateSession`, `SetActiveOrganization`, `ImpersonateUser` — but no actions for the self-service surface BetterAuth already exposes on `/api/auth/*`: password change/reset, email verification resend, 2FA enrolment and challenge, passkey registration (which **requires** the client SDK — WebAuthn is a browser ceremony), session revocation, self `updateUser`, invitation accept. Without wrappers, module config has no sanctioned way to call any of it.

**Ask** — a curated set of named actions (matching the `Login`/`SignUp` precedent; each a designed surface rather than a generic SDK pass-through), wrapping the caller-session-gated client methods:

| Action                  | Wraps                                | Notes                                                                              |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `UpdateUser`            | `updateUser`                         | `name` / `image` only — the self-service fields BetterAuth allows                  |
| `ChangePassword`        | `changePassword`                     | `currentPassword`, `newPassword`, `revokeOtherSessions`                            |
| `RequestPasswordReset`  | `requestPasswordReset`               | public; `redirectTo` the module's reset page                                       |
| `ResetPassword`         | `resetPassword`                      | public; token from the emailed link                                                |
| `SendVerificationEmail` | `sendVerificationEmail`              | resend for an unverified email                                                     |
| `TwoFactorEnable`       | `twoFactor.enable`                   | password-gated; **returns** `totpURI` + backup codes                               |
| `TwoFactorVerify`       | `twoFactor.verifyTotp` / backup code | serves both enrolment confirmation and the sign-in challenge; `trustDevice`        |
| `TwoFactorDisable`      | `twoFactor.disable`                  | password-gated                                                                     |
| `PasskeyRegister`       | `passkey.addPasskey`                 | WebAuthn ceremony inside the action                                                |
| `PasskeyDelete`         | `passkey.deletePasskey`              |                                                                                    |
| `RevokeOtherSessions`   | `revokeOtherSessions`                | per-session revoke deliberately not asked for (token-exposure — design Decision 5) |
| `AcceptInvitation`      | `organization.acceptInvitation`      | public accept page; BetterAuth gates session-email ↔ invitation-email itself       |

Two cross-cutting requirements:

1. **`Login` surfaces the two-factor-required result** — when a 2FA-enrolled user signs in, the action must expose that outcome (not swallow it) so the login page can route to the module's challenge page.
2. **Action responses are readable** (via `_actions` in the same event chain) — `TwoFactorEnable` is data-bearing (TOTP URI, backup codes rendered once); the pattern should be stated for the catalog generally.

The exact catalog can be trimmed upstream (e.g. OTP-mode 2FA deferred), but password management, `RevokeOtherSessions`, `AcceptInvitation`, and the `Login` 2FA signal are the floor the module cannot ship without.

## 2. Module-exported auth-page wiring

**Lands in**: [config-schema](../../../lowdefy-design/designs/auth-upgrade/config-schema/design.md) (`authPages`, `pages.public`), module-system build.

**Problem**: `auth.authPages.*` and `pages.public` are app-root config written with **module-scoped** page URLs/ids (`/user-account/login`, `user-account/login`). The app hand-writes both today, and every entry duplicates knowledge the module manifest already has — the same drift class as user-admin ask 6's hook bindings. A renamed module entry id silently breaks the sign-in redirect.

**Ask**: let the module manifest declare its auth-page roles — which exported page serves `signIn`, `signUp`, `forgotPassword`, `resetPassword`, `verifyEmail`, `error`, and which pages are public. The build resolves scoped ids and contributes the `authPages` map and `pages.public` entries; app-level config wins on collision.

**Fallback if declined**: today's documented hand-wiring (the demo app already does it) — workable, one more thing to misconfigure per app forever.

## 3. `contactId` on the session user

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (`resolveAuthentication` output / `_user` shape).

**Problem**: The workspace's every read starts from the caller's contact, but the designed `_user` carries `id, name, email, image, emailVerified, roles, attributes` — no `contactId`. Each own-contact read must first hop through `users` by `_user.id` to find it.

**Ask**: include `contactId` in the resolved caller (it's already on the `user` record `resolveAuthentication` reads). Cheap, removes a `$lookup` from every self-service read.

**Fallback if declined**: aggregations start from `users` and join `user-contacts` — works, marginally slower, more pipeline in every request.

## 4. Module-exported `auth.hooks` bindings (shared with user-admin ask 6)

**Lands in**: [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md).

Same mechanism user-admin ask 6 specifies. This module ships the merge-on-signup endpoint (`link-contact-on-signup`) and needs it bound at **two points** — `email.verified` and `user.create.before` — so the manifest surface must allow one endpoint bound at multiple points (still one binding per point deployment-wide). Fallback: two documented app-side `auth.hooks` entries with the scoped endpoint id.
