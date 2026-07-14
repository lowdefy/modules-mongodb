# User Account — Upstream Asks

Platform-side changes the [user-account design](design.md) depends on, resolved in the **auth-upgrade designs** (`lowdefy-design/designs/auth-upgrade/`). **All five asks are now delivered upstream** — each keeps its problem statement for context, with a status line recording where it landed and any caveats. Ask 5 (contact `profile` on `_user`) is settled by the [user-profile design](../../../lowdefy-design/designs/auth-upgrade/user-profile/design.md) via denormalization, which also reshapes asks 1 and 3.

---

## 1. Self-service client action catalog (hard dependency)

> **Status: delivered** — engine ships the self-service action catalog (11 actions per the table, TOTP-only at launch, each a designed surface not a generic pass-through). `_actions` response-readability and the `Login` two-factor-required outcome are specified; per-session revoke is excluded for the token-exposure reason (matches Decision 5). The capabilities table and package list reference the catalog. **Caveat**: the self-service `UpdateUser` action is **excluded** from the catalog (user-profile design Decision 5) — the module owns profile edits server-side, so `image` has a home (`UpdateUserProfile`) and a contact-less avatar self-service is speculative. This design never depended on it (Decision 6 already dropped the name/image sync in favour of ask 5).

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

> **Status: delivered** — config-schema's _Module-contributed auth wiring_ section: the manifest declares auth-page roles + public pages, the build contributes the `authPages` map and `pages.public` entries (per-key merge — `authPages` app-wins, public a union), and **app config wins on collision**. The same section adds `_build.authConfig`, which Decisions 2 & 5 now read enablement from (retiring the `methods`/`two_factor`/`passkeys` mirror vars). The hand-wiring fallback is retired.

**Lands in**: [config-schema](../../../lowdefy-design/designs/auth-upgrade/config-schema/design.md) (`authPages`, `pages.public`), module-system build.

**Problem**: `auth.authPages.*` and `pages.public` are app-root config written with **module-scoped** page URLs/ids (`/user-account/login`, `user-account/login`). The app hand-writes both today, and every entry duplicates knowledge the module manifest already has — the same drift class as user-admin ask 6's hook bindings. A renamed module entry id silently breaks the sign-in redirect.

**Ask**: let the module manifest declare its auth-page roles — which exported page serves `signIn`, `signUp`, `forgotPassword`, `resetPassword`, `verifyEmail`, `error`, and which pages are public. The build resolves scoped ids and contributes the `authPages` map and `pages.public` entries; app-level config wins on collision.

**Fallback if declined**: today's documented hand-wiring (the demo app already does it) — workable, one more thing to misconfigure per app forever.

## 3. `contactId` on the session user

> **Status: delivered (superseded shape).** `contactId` is no longer a platform field — it lives inside the opaque `profile` bag as the module-defined `user.profile.contactId`, read on the client as `_user.profile.contactId` (user-profile design Decision 2). The resolved caller carries the whole `profile` bag (ask 5), so own-contact reads and the `update-profile` write both target `_user.profile.contactId`; the aggregate-from-`users` fallback is no longer needed. This also resolves review-1 finding #6a.

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (`resolveAuthentication` output / `_user` shape).

**Problem**: The workspace's every read starts from the caller's contact, but the designed `_user` carries `id, name, email, image, emailVerified, roles, attributes` — no `contactId`. Each own-contact read must first hop through `users` by `_user.id` to find it. The **write** pathway needs it too: `update-profile` must know which contact `_id` to write.

**Ask**: include `contactId` in the resolved caller (it's already on the `user` record `resolveAuthentication` reads). Cheap, removes a `$lookup` from every self-service read/write.

**Relation to ask 5**: on the **read** side this is subsumed by ask 5 (if the profile itself is on `_user`, own-contact reads need no `contactId` hop). It remains independently useful for the **write** side (targeting the contact to update) and as the fallback path if ask 5 is declined.

**Fallback if declined**: aggregations start from `users` and join `user-contacts` — works, marginally slower, more pipeline in every request.

## 4. Module-exported `auth.hooks` bindings (shared with user-admin ask 6)

> **Status: delivered** — hooks Decisions 6 & 7: manifest-exported bindings, one endpoint bindable at multiple points, engine → module → app tier order. The module's two-point binding (`email.verified` + `user.create.before`) is a supported export; the app-side `auth.hooks` fallback is retired.

**Lands in**: [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md).

Same mechanism user-admin ask 6 specifies. This module ships the merge-on-signup endpoint (`link-contact-on-signup`) and needs it bound at **two points** — `email.verified` and `user.create.before` — so the manifest surface must allow one endpoint bound at multiple points (and, per hooks Decision 6, any number of hooks may bind a single point — the build no longer enforces per-point uniqueness). Fallback: two documented app-side `auth.hooks` entries with the scoped endpoint id.

## 5. Contact `profile` on the session `_user`

> **Status: delivered** — the [user-profile design](../../../lowdefy-design/designs/auth-upgrade/user-profile/design.md) settles it via **denormalization** (Decision 1): `user` gains an opaque `profile` additionalField that `resolveAuthentication` carries onto the resolved caller, so `_user.profile.*` resolves on the server and, via `GET /api/user`, on the client. The module writes it through the new **`UpdateUserProfile`** step (Decision 4) — which also sets the `user.name` / `user.image` display copies — and `UpdateSession` refreshes it client-side. The performance caveat below is resolved: `resolveAuthentication` already reads the user row, so the projection rides an existing read at zero added per-request cost — no join. The enrichment-hook mechanism this ask proposed was **rejected** in favour of denormalization (Decision 1's rejected-alternative paragraph: a new read-path hook category, an authorization hole over `roles`/`attributes`, and a contact read on every request's hot path). **Caveat**: freshness relies on every contact-profile write going through a module endpoint that pairs it with `UpdateUserProfile` re-denorm — enforced across the suite by the shared `write-profile` fragment (design Decision 8), since two modules write contact profile data (self-service here, operator edits in user-admin). The bag drifts only if a `contact` is edited entirely outside the module suite (raw DB, external sync) until the next module write (Decision 1's accepted freshness trade).

**Lands in**: [user-profile](../../../lowdefy-design/designs/auth-upgrade/user-profile/design.md) (Decisions 1 & 4), revising [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (`resolveAuthentication` output / `_user` shape).

**Problem**: The old fused `user_contacts` model made the profile part of the session user for free — the app router reads `_user.profile.profile_created`, the layout reads `_user.name` / `_user.image`. The split model drops the profile subtree from `_user`: it now carries only `id, name, email, image, emailVerified, roles, attributes`, where `name`/`image` are the **auth** user's (populated at signup/OAuth), not the contact's. So (a) the layout has no contact-driven name/image without a per-page contact read, and (b) the onboarding router has no completeness signal at all. The design's first plan patched (a) with a client-side `UpdateUser` name/image sync — a second copy that can drift.

**Ask**: a mechanism to **add fields to the `_user` object** — a hook at `resolveAuthentication` time — that the module uses to project the caller's contact `profile` onto `_user`, so `_user.name` / `_user.image` / `_user.profile.*` resolve from the contact directly. This removes the sync (Decision 6: no `UpdateUser`, no drift) and restores the router's `_user.profile.profile_created` completeness read (Decision 5).

**Performance caveat**: projecting the contact on every request adds a read/join to session resolution. If that proves too costly, the alternative is to **denormalize the needed fields onto the `users` collection** (written by the same create-or-link / profile-save paths) so they ride the existing `users` read — a storage-vs-freshness trade to settle upstream.

**Fallback if declined**: read the profile via a contact request keyed on `contactId` (ask 3) on the pages that need it, and keep name/image display module-internal (contact-sourced) rather than on `_user`.
