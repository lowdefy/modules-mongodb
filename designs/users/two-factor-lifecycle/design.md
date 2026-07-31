# Two-factor lifecycle: admin reset and required enrolment

Two capabilities that only make sense together. **Admin reset** gives an operator a route to
recover a person who has lost their authenticator — today there is none, at any layer of the
stack. **Required enrolment** (`auth.twoFactor.required`) lets a deployment insist every member
holds a second factor. Each is useful alone; together they compose into the shape every mature
identity product ships, where "reset" means _re-register_, not _exempt_.

Spans three surfaces, which is why this is a top-level design rather than a sub-design of
[user-admin-better-auth](../_completed/user-admin-better-auth/design.md):

| Surface                | Change                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Engine (`lowdefy`)     | `ResetUserTwoFactor` step; `auth.twoFactor.required`; two `authPages` keys; two sign-in hooks |
| `modules/user-admin`   | Reset action on the Security tile + `reset-two-factor` routine                                |
| `modules/user-account` | Forced-enrolment page; challenge page taught the redirect arrival path                        |

Platform-side changes are specified in [upstream-asks.md](upstream-asks.md). All three asks are
outstanding — nothing here ships without them.

---

## Proposed change

- **A `ResetUserTwoFactor` auth step** — adapter-direct, clears the `twoFactor` row, sets
  `user.twoFactorEnabled: false`, and deletes the user's trust-device verification records.
- **A `reset-two-factor` routine** in `user-admin`: reset → `RevokeUserSessions` → audit event,
  driven from a button on the Security tile beside the existing `MFA · TOTP` badge.
- **`auth.twoFactor.required: true`** — a deployment flag enforced by the engine, not by app config.
- **Satisfaction is `twoFactorEnabled || passkeyCount > 0`**, computed server-side and exposed as
  `_user.twoFactorSatisfied`. A passkey is phishing-resistant on its own; it counts.
- **Unsatisfied callers are redirected to enrolment**, via a new `authPages.twoFactorEnrol`.
- **Magic-link and OAuth sign-ins are challenged too**, via engine hooks that replicate BetterAuth's
  password-path interception and redirect to a new `authPages.twoFactor`.
- **Reset and required compose**: a reset user becomes unsatisfied, so the engine routes them
  straight into re-enrolment. "Require re-register" is not built; it emerges.

## Problem

### There is no admin 2FA reset, anywhere

Verified against `better-auth@1.6.23` and the engine at `Developer/lowdefy`:

- **The `twoFactor` plugin ships two management endpoints** — `/two-factor/enable` and
  `/two-factor/disable` — and both take their target from `ctx.context.session.user`. Self only,
  password-gated. The remaining endpoints (`get-totp-uri`, `verify-totp`, `verify-otp`,
  `verify-backup-code`, `generate-backup-codes`) are equally session-scoped. There is no admin
  variant of any of them.
- **The admin plugin has no 2FA verb.** Its statement list is
  `user: [create, list, set-role, ban, impersonate, impersonate-admins, delete, set-password, set-email, get, update]`,
  `session: [list, revoke, delete]` (`dist/plugins/admin/access/statement.mjs`).
- **`/admin/update-user` cannot backdoor it.** `twoFactorEnabled` is declared `input: false` in the
  plugin's user schema, and `parseInputData` (`dist/db/schema.mjs:59`) drops `input: false` keys on
  update — silently when falsy, with `FIELD_NOT_ALLOWED` when truthy. So even
  `data: { twoFactorEnabled: false }` is a no-op.
- **The Lowdefy step catalog has nothing.** Thirteen steps in
  `packages/plugins/plugins/plugin-better-auth/src/steps/`; none touch 2FA.

The module already _displays_ enrolment — `tile_security.yaml:198-206` renders an `MFA · TOTP` badge
off `get_user_detail.0.two_factor_enabled` — so an admin can see the problem and do nothing about it.

The user's own escape hatches are backup codes, and they are thin. Codes are consumed one per use
with no remaining-count surface anywhere, so reaching zero is silent. Regenerating them
independently of the authenticator is itself an outstanding ask
([2fa-enrolment-modal ask 1](../users-fixes/2fa-enrolment-modal/upstream-asks.md)); until that
lands, "I need new codes" is only reachable through `TwoFactorEnable`, which rotates the secret and
destroys the working authenticator. So the self-service path is one that a person who has _already_
lost their phone cannot reach at all.

### There is no way to require 2FA

- **BetterAuth has no enforcement option.** The whole of `TwoFactorOptions` is `issuer`,
  `twoFactorTable`, `totpOptions`, `otpOptions`, `backupCodeOptions`, `skipVerificationOnEnable`,
  `allowPasswordless`, `schema`, `twoFactorCookieMaxAge`, `trustDeviceMaxAge`, `accountLockout`.
  Nothing about requiring it.
- **Lowdefy's `auth.twoFactor` accepts only `enabled`** (`packages/build/src/lowdefySchema.js:865`).
- **The challenge only fires on three paths.** The plugin's sign-in hook matches
  `/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number`
  (`dist/plugins/two-factor/index.mjs:192`) — so magic-link, OAuth, and passkey sign-ins walk past
  the second factor entirely. Since `user-account` ships magic-link login, an enrolled user in this
  suite can already avoid their own 2FA by requesting a magic link.

That last point is the one that makes a naive `required` flag misleading rather than merely
incomplete: it would advertise a guarantee the sign-in surface does not deliver.

## What the industry does

Worth stating because it settles several decisions below rather than leaving them to taste.

| Product            | Admin capability                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Okta               | **Reset Multifactor** — clears enrolled factors; user re-enrols at next sign-in                          |
| Microsoft Entra ID | **Require re-register MFA** — revokes methods, forces re-enrolment; _separately_ **Revoke MFA sessions** |
| Google Workspace   | Turn off 2SV for a user, **or** issue backup codes on their behalf                                       |
| AWS IAM            | Deactivate MFA device                                                                                    |
| GitHub (org)       | Owners **cannot** reset a member's 2FA — the user owns the factor                                        |

Four things are near-universal and are adopted wholesale here: the verb is **reset**, not
_disable_ (Decision 2); **reset revokes sessions** (Decision 3); **an audit event fires**; and
**out-of-band verification of the requester** is the control that actually matters — help-desk MFA
reset is the dominant social-engineering vector, and it is how the 2023 casino intrusions began
(Decision 4).

GitHub is the interesting dissent: in a consumer-ish setting where the account belongs to the
person, no admin reset exists at all. It does not apply here — under the `pinned` policy the org
_is_ the deployment and the trusted-operator premise of user-admin Decisions 4 and 6 already
licenses stronger cross-app authority than this.

On enforcement, Entra and Okta both treat **a passkey as satisfying MFA on its own**, because it is
possession plus biometric in one phishing-resistant ceremony. That is Decision 6.

---

## Decisions

### 1. `ResetUserTwoFactor` is an auth step, not a module write

The module cannot write auth-owned records directly — that is the hard wall the user-admin design is
built on. And every existing route into the 2FA data is session-scoped to the caller, so there is no
BetterAuth endpoint to call either. That leaves a step.

Cheap, as it turns out: steps run adapter-direct, and the raw `adapter.*` surface does **not** run
`parseInputData` (it is only reached through `internalAdapter` / with-hooks), so the `input: false`
guard that blocks `/admin/update-user` does not apply. `UpdateUserAttributes.js` is the shape to
copy. The step does three writes:

1. `adapter.deleteMany({ model: 'twoFactor', where: [{ field: 'userId', ... }] })` — the secret and
   the backup codes live on the same row, so one delete takes both.
2. `adapter.update({ model: 'user', ..., update: { twoFactorEnabled: false } })`.
3. Delete the user's `trust-device-*` verification records.

**Why (3) is not optional.** A device the user previously ticked "trust this device" on holds a
signed `trust_device` cookie whose verification record lets it skip the challenge for up to 30 days
(`trustDeviceMaxAge`, default `2592000`). BetterAuth's own `/two-factor/disable` deletes that record
and expires the cookie. An admin reset that skipped it would leave the single most important reset
scenario — _this person's device was stolen_ — with the thief's device still trusted. The cookie
itself cannot be expired server-side from an admin's request (it lives in the target's browser), but
deleting the verification record is sufficient: the sign-in hook looks the record up and falls
through to the challenge when it is absent.

**Unknown `userId` fails loudly**, mirroring `UpdateUserAttributes` and `UpdateMemberAttributes` —
a reset that silently no-ops is worse than an error, because the admin walks away believing the
person can now get in.

### 2. Reset clears the factor; it never grants an exemption

The word matters. "Disable 2FA for this user" implies a persistent state — this person is now
exempt — and that state is exactly what a required-2FA deployment must not be able to reach by
accident. Reset returns the user to _unenrolled_, which under `required` is a state the engine
actively pushes them out of (Decision 7).

So the UI verb is **Reset two-factor authentication**, and there is deliberately no admin
"exempt from 2FA" control. If a deployment needs per-person exemptions, that is a policy feature
built on roles or attributes, not a side effect of a recovery action (Non-goals).

**Passkeys are not touched.** A reset clears TOTP and its backup codes only. "I lost my
authenticator" and "I lost my security key" are different incidents with different recovery, and
under Decision 6 a passkey independently satisfies `required` — folding them together would mean a
TOTP reset silently locked out someone whose passkey was working fine.

### 3. Reset revokes sessions, in the routine rather than the step

The module routine is:

```
ResetUserTwoFactor → RevokeUserSessions → audit event
```

This sits inside user-admin Decision 3's partial-failure rules without amending them: sequential,
halts on first error, no rollback, safe because both steps are idempotent and re-running converges,
audit event last so a partial failure emits no misleading event.

**Why session revocation is a separate step and not folded into the reset step.** Two reasons. It
keeps the step honest about what it does — the catalog already has `RevokeUserSessions` and a step
that quietly revokes sessions as a side effect is the kind of hidden blast radius the step catalog
exists to avoid. And there is a mechanical wrinkle that makes the pairing necessary either way:
`internalAdapter.updateUser` calls `refreshUserSessions`, but a raw `adapter.update` does not, so
the target's live sessions would keep serving a cached `twoFactorEnabled: true`. Revoking them
resolves that as a by-product of doing the right thing anyway.

Note this is the same reasoning Entra encodes by shipping "Require re-register MFA" and "Revoke MFA
sessions" as two adjacent buttons — except we always run both, because an admin who resets 2FA and
leaves the old sessions live has not actually recovered anything.

### 4. The confirm dialog carries the reach and the attestation

Two things the admin needs to see before confirming.

**The reach is suite-wide.** `twoFactorEnabled` is on the `user` row, not the `member` row, so a
reset by one app's admin removes the second factor everywhere in the suite — the same shape as ban
(user-admin Decision 4). The dialog says so, reusing the membership enumeration the suspend dialog
already runs, and collapsing to single-app copy when the person holds no other memberships (the
count-driven degradation of user-admin Decision 6).

**The requester must be verified out of band.** This is the control the whole industry leans on and
software cannot enforce, so the dialog makes it explicit: a confirmation checkbox reading roughly
_"I have verified this person's identity through a channel other than email."_ It is a speed bump
and a paper trail, not a guard — but the failure mode it addresses (a caller impersonating an
employee to a help desk) is the single most common way 2FA is defeated in practice, and a dialog
that just says "Are you sure?" trains the opposite instinct.

**No new module var.** The action's visibility is gated by `_build.authConfig.twoFactor.enabled` —
if the deployment has no 2FA, there is nothing to reset. Restating that as a var would be exactly
the mirror-var drift `_build.authConfig` exists to prevent (user-account Decision 8), and the
suite-wide reach rides the trusted-operator premise Decisions 4 and 6 already establish rather than
needing its own switch. This is a deliberate departure from `suspension` / `impersonation`, which
are vars because they gate _authority a deployment might not want its app-admins to have_; a
deployment that does not want reset can simply not grant `auth.userAdminRole`, and one that has 2FA
enabled but no way to recover from a lost phone is not a configuration anyone wants.

### 5. `auth.twoFactor.required` is one engine feature, not app config

The tempting cheap version is a branch in each app's `router.yaml`, mirroring the
`_user: profile.profile_created` → onboarding branch that already exists at
`apps/demo/pages/router.yaml:19-26`. Rejected, for three reasons:

1. **It only gates navigation.** The router runs on page mount. APIs, requests, and direct URL
   entry to a non-router page do not pass through it. A thing described as a security requirement
   that any API call bypasses is worse than no thing at all.
2. **Passkey satisfaction is not computable there.** `context.user` is
   `{...session.user, roles, attributes, activeOrganizationId}` (`resolveAuthentication.js:92`) —
   `twoFactorEnabled` rides along because it is a returned user field, but nothing knows about
   passkeys. Decision 6 needs a server-side count.
3. **It is opt-in correctness.** Every consuming app must remember the branch, and one that forgets
   silently has no enforcement. "One correct way" says the mechanism should be mandatory, not
   remembered.

So `required` is a deployment flag the engine acts on: added to the `auth.twoFactor` schema
(`lowdefySchema.js`), defaulting `false`, and projected through `computeAuthConfigProjection` so
modules can read `_build.authConfig.twoFactor.required` for their own copy and control visibility.

### 6. Satisfaction is `twoFactorEnabled || passkeyCount > 0`

Computed server-side in `resolveAuthentication` and exposed as `_user.twoFactorSatisfied`, so both
the engine's own enforcement and any module UI read one value that cannot disagree with itself.

A passkey counts because it is a phishing-resistant possession factor with a user-verification
ceremony bound to it — the reason Entra and Okta both accept one as satisfying MFA outright. Telling
a user who has registered a hardware key that they must _also_ set up TOTP is security theatre that
pushes them toward the weaker factor.

The cost is a per-request passkey read for deployments with `required` on. The user-admin detail page
already reads the `user-passkeys` connection for its badge, so the collection and the access pattern
exist; this is a count on the caller's own `userId`, gated on `required === true` so deployments
without it pay nothing.

**The awkward case, resolved: a passkey-only user signing in with a password.** They satisfy
enrolment (a passkey), but the password path has no factor to challenge them with — there is no
`twoFactor` row and `twoFactorMethods` would come back empty. Letting them through would mean
`required` is trivially bypassed by choosing the password button; blocking them outright strands a
correctly-enrolled user. So they are **routed to enrolment**, where they can either register TOTP or
be told to sign in with their passkey. This is the same destination as an unenrolled user, which
keeps the engine's branch simple: _if the sign-in path cannot present a factor this user holds, send
them to enrol._

### 7. Challenge interception for redirect flows

The password path returns JSON (`{ twoFactorRedirect: true, twoFactorMethods }`) and the login page
routes on it — that is user-account Decision "2FA challenge routing is the module's own", and it
stays. Magic link and OAuth cannot work that way: `/magic-link/verify` and `/callback/:id` are GET
endpoints that terminate in `throw ctx.redirect(...)`. A browser mid-redirect has nothing to read a
JSON flag with.

So the engine adds `after` hooks on those two paths, replicating what the plugin's hook does on the
password path and then redirecting instead of returning. Precisely (all verified against
`dist/plugins/two-factor/index.mjs:186-275`):

1. Delete the session the sign-in just created and clear its cookie; `setNewSession(null)`.
2. Check the `trust_device` cookie first — a valid, unexpired trust record short-circuits the whole
   challenge, exactly as it does on the password path. Rotate it as the plugin does.
3. Create verification value `{ identifier: '2fa-' + random20, value: user.id, expiresAt: now + twoFactorCookieMaxAge }`.
4. **Create the attempts record** `{ identifier: '2fa-attempts-' + identifier, value: '0', expiresAt }`.
5. Set the signed `two_factor` cookie to the identifier.
6. `throw ctx.redirect(authPages.twoFactor)`.

**Step 4 is the one that will be forgotten.** `beginAttempt` in
`dist/plugins/two-factor/verify-two-factor.mjs` calls `consumeVerificationValue` on
`2fa-attempts-{identifier}` and throws `INVALID_TWO_FACTOR_COOKIE` when it is absent — so a hook
that creates only the challenge record produces a challenge page where _every_ correct code is
rejected, with an error message pointing at the cookie. It is called out here because the failure is
both total and misleading.

Cookies set before a thrown redirect do reach the browser — `/magic-link/verify` already calls
`setSessionCookie` and then redirects, so this is the established pattern in the same endpoint, not
an assumption.

**Precedent for the hook itself**: `createMagicLinkSendGate` already intercepts `/sign-in/magic-link`
as a core `hooks.before` (`getBetterAuthConfig.js:320`), and there is hook infrastructure in
`packages/api/src/routes/auth/hooks/`.

### 8. Two new `authPages` keys — which amends a user-account decision

`authPages` currently carries `signIn`, `signUp`, `error`, `forgotPassword`, `resetPassword`,
`verifyEmail`, `acceptInvitation`. Two more:

- **`twoFactor`** — the challenge page, needed because Decision 7's hooks must redirect a browser
  somewhere.
- **`twoFactorEnrol`** — the forced-enrolment page, needed because Decision 5's enforcement must
  send an unsatisfied caller somewhere.

This directly amends [user-account](../_completed/user-account-better-auth/design.md)'s statement that
"`authPages` has no 2FA key — this routing never leaves the module." That was correct for the
password path and remains so: the login page still routes on the JSON result. What changed is that
sign-in paths exist which the _engine_ terminates, and for those the engine has to know the address.
Both keys are optional; with `required` off and no OAuth/magic-link 2FA, neither is read. A
deployment that sets `required: true` without them should fail the build rather than redirect to
nowhere.

### 9. Reset and required compose without a mechanism between them

The question that started this: what does resetting 2FA do in a deployment that requires it?

Nothing special — and that is the point. Reset clears the factor (Decision 2), which makes the user
unsatisfied (Decision 6), which makes the engine route them to `twoFactorEnrol` on their next
request (Decision 5). Their sessions were revoked (Decision 3), so the next request is a fresh
sign-in. The user recovers by enrolling, exactly as Okta and Entra describe "reset" behaving, and
there is no third feature that implements it.

The corollary is worth stating explicitly because it constrains future work: **reset must never be
allowed to mean "exempt"**, or this composition breaks and an admin recovery action silently becomes
a policy override. That is the real reason Decision 2 rejects the "disable" verb.

With `required` **off**, reset leaves the person single-factor until they choose to re-enrol. That is
the honest behaviour of a deployment that has not asked for 2FA, and the revoked sessions plus the
audit event are what carry the weight there.

### 10. Costs, stated rather than hidden

- **`required` + OAuth means double-challenge.** A user signing in with Google who has already
  satisfied Google's own MFA will be challenged again by us. This is the correct default — we cannot
  see what the IdP enforced, and an IdP's MFA is not ours — but it is a real friction, and the
  deployment-level answer is to not enable `required` alongside a trusted enterprise IdP.
- **The invite path gets longer.** A new member now hits the accept page, then onboarding
  (`profile_created`), then enrolment. Three gates before the app. Ordering them so enrolment comes
  last is deliberate — a person who abandons at enrolment has at least a complete contact record.
- **`required` cannot be enforced retroactively without lockout risk.** Turning it on in a live
  deployment sends every existing unenrolled user to enrolment at their next request, including
  admins. There is no grace period in this design (Non-goals); the operational advice is to enrol
  the admin accounts first.

---

## Surface

**Engine** (all in [upstream-asks.md](upstream-asks.md)):

| Piece                                     | Location                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `ResetUserTwoFactor` step                 | `packages/plugins/plugins/plugin-better-auth/src/steps/`                |
| `auth.twoFactor.required`                 | `packages/build/src/lowdefySchema.js`, `computeAuthConfigProjection.js` |
| `_user.twoFactorSatisfied`                | `packages/api/src/context/resolveAuthentication.js`                     |
| `authPages.twoFactor` / `.twoFactorEnrol` | `packages/build/src/lowdefySchema.js`                                   |
| Challenge hooks                           | `packages/api/src/routes/auth/hooks/`                                   |

**`modules/user-admin`**:

- `api/reset-two-factor.yaml` — the routine of Decision 3. Payload `{ user_id, target_name?, target_email? }`,
  matching `revoke-sessions.yaml`.
- `components/view/modal_reset_2fa.yaml` — the confirm dialog of Decision 4.
- `components/view/tile_security.yaml` — the action, beside the `MFA · TOTP` badge.
- `defaults/event_display.yaml` — `two-factor-reset: "{{ user.profile.name }} reset {{ target.name }}'s two-factor authentication"`.
- No new manifest vars (Decision 4).

**`modules/user-account`**:

- `pages/two-factor-enrol.yaml` — the forced-enrolment page, in the `onboarding.yaml` mould.
- `pages/two-factor.yaml` — taught to handle arrival by redirect (cookie already set) as well as the
  existing JSON `twoFactorRedirect` path.
- `module.lowdefy.yaml` — contributes both `authPages` roles.

**`apps/demo`** — `required: true` in `auth.twoFactor`, wiring both `authPages` keys, per the
repo rule that new capability ships with a demo consumer.

## Non-goals

- **Per-user or per-role 2FA exemptions.** A policy feature, and deliberately not reachable through
  the recovery action (Decision 2). If a concrete need appears it belongs on roles or attributes.
- **Grace periods on `required`.** No "enrol within 14 days" state; the flag is immediate
  (Decision 10).
- **Admin-issued backup codes.** Google Workspace offers this as an alternative to a full reset. It
  needs an admin-side wrapper around `generate-backup-codes` and a way to hand codes over securely;
  reset plus self-service re-enrolment covers the same incident.
- **Temporary Access Pass.** Entra's time-limited one-time credential for re-enrolment. A better
  answer than reset for high-security deployments, and a much larger feature.
- **OTP and SMS second factors.** TOTP and backup codes only, matching the engine catalog's stated
  launch scope.
- **Fixing backup-code rotation.** Tracked separately as
  [2fa-enrolment-modal ask 1](../users-fixes/2fa-enrolment-modal/upstream-asks.md); it makes the
  self-service path better but does not remove the need for admin reset.

## Open questions

- **Does the target get an email when their 2FA is reset?** Standard practice, and the deployment
  already has a unified send path (`auth.email`). But `auth.email.templates` currently accepts only
  `verifyEmail`, `resetPassword`, `magicLink`, `invitation` (`lowdefySchema.js:591-624`), so this
  would be a fifth template and a fourth upstream ask. Deferred pending a decision on whether the
  audit event plus the forced re-enrolment is sufficient notice.
- **Where the enrolment redirect is enforced** — inside `resolveAuthentication`, or as a separate
  gate that runs after it. Affects whether an unsatisfied caller gets a redirect or a 403 on an API
  call, which matters for how the enrolment page itself loads. Resolve when the ask is written up
  against the engine design.
