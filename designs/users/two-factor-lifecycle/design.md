# Two-factor lifecycle: admin recovery and required enrolment

The module side of a two-factor lifecycle whose engine half is now owned upstream. **Admin recovery**
gives an operator a route to recover a person who has lost their second factor — clearing a TOTP
authenticator, or revoking compromised passkeys — where today the module can display enrolment but do
nothing about it. **Required enrolment** (`auth.twoFactor.required`) lets a deployment insist every
member holds a second factor; the engine enforces it, and the module contributes the page an
unenrolled caller is sent to and reads the enrolment fact the UI must agree with.

The engine work is specified and owned by the platform's
[two-factor-lifecycle design](../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md),
which itself sits on two now-baseline platform designs —
[auth-hardening](../../../../lowdefy-design/designs/auth-upgrade/_completed/auth-hardening/design.md)
(closes the magic-link/OAuth 2FA bypass) and
[org-authority](../../../../lowdefy-design/designs/auth-upgrade/features/org-authority/design.md)
(retires `auth.userAdminRole`, sources authority from the caller's member row). This design owns the
two module surfaces those decisions land in.

| Surface                | Change                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `modules/user-admin`   | Reset-TOTP and revoke-passkeys controls on the Security tile, each with a routine and dialog |
| `modules/user-account` | Forced-enrolment page contributed as `authPages.twoFactorEnrol`; UI reads enrolment fact     |

---

## Proposed change

- **A `reset-two-factor` routine** in `user-admin`: `ResetUserTwoFactor` → `RevokeUserSessions` →
  audit event → notify target, driven from a button in the Security tile's Auth-methods area, shown per-user
  where the `MFA · TOTP` badge is (Decision 4).
- **A `revoke-passkeys` routine**: `RevokeUserPasskeys` → `RevokeUserSessions` → audit event → notify
  target, driven from a button shown per-user where the passkey badge is. All-or-per-key.
- **Both routines call adapter-direct engine steps**, floored by the caller's org role plus the new
  `user: ['reset-two-factor']` / `user: ['revoke-passkeys']` permissions — not by `auth.userAdminRole`,
  which org-authority retired.
- **A forced-enrolment page** contributed as `authPages.twoFactorEnrol`: protected (unlike every other
  auth page), self-sufficient on auth client actions, offering passkey registration as the route for a
  passwordless caller.
- **Module UI reads `_user.twoFactorEnrolled`** — `twoFactorEnabled || passkeyCount > 0`, computed
  server-side by the engine and symmetric on both sides — so the security tile agrees with the gate
  about who is compliant.
- **The target is notified** on both reset and revoke, through the `notifications` dispatch the module
  already owns — the platform declines to send it, so the module must.
- **Recovery and required compose**: a reset or fully-revoked user becomes unenrolled, so the engine
  routes them into re-enrolment. "Require re-register" is not built; it emerges.

## Problem

### The module can see the factor but cannot act on it

`tile_security.yaml` renders an `MFA · TOTP` badge off `get_user_detail.0.two_factor_enabled` and a
`Passkey` badge off `get_user_detail.0.passkey_count`, so an admin can see a person's second factors
and has no control that touches either. That gap is the whole recovery case: a person who loses their
authenticator with no backup codes left, or whose registered passkey was on a stolen device, is
locked out or compromised and no operator can help.

The engine analysis behind this — that BetterAuth's 2FA endpoints are all session-scoped to the
caller, the admin plugin has no 2FA verb, `/admin/update-user` cannot reach `twoFactorEnabled`, and
the step catalog had nothing — is documented in full in the platform design's Problem section. It
resolves to two adapter-direct steps, `ResetUserTwoFactor` and `RevokeUserPasskeys`, which this module
consumes. The module's own escape hatches for the user (backup codes, self-service re-enrolment) do
not reach a person who has no session to act from; that is
[Decision 2 of the platform design](../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md),
and it is why an admin route exists at all.

### The module cannot require 2FA, and must not pretend to

A deployment cannot insist on a second factor from module or app config: BetterAuth ships no
enforcement option and the router-branch workaround gates navigation only, cannot see passkeys, and is
opt-in correctness. So `required` is a deployment flag the **engine** acts on. The module's part is to
contribute the page an unenrolled caller is redirected to, and to read the same enrolment fact the gate
reads so the security tile never nags a caller the engine treats as compliant.

The honesty caveat is the platform's to state and the module's to not undercut: under
`auth-hardening` the magic-link/OAuth challenge bypass is closed, but `required` remains an **enrolment
floor, not a per-session challenge guarantee** — a user holding a passkey and a password can sign in
with the password alone and is admitted having presented one factor. The module's enrolment copy must
not imply more than the engine delivers.

## What the industry does

Worth stating because it settles the recovery verbs rather than leaving them to taste.

| Product            | Admin capability                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Okta               | **Reset Multifactor** — clears selected factors; user re-enrols at next sign-in                          |
| Microsoft Entra ID | **Require re-register MFA** — revokes _all_ methods including FIDO2 keys; separately **Revoke sessions** |
| Google Workspace   | Turn off 2SV for a user, or issue backup codes on their behalf                                           |
| AWS IAM            | Deactivate MFA device                                                                                    |
| GitHub (org)       | Owners **cannot** reset a member's 2FA — the user owns the factor                                        |

Four things are near-universal and adopted wholesale: the verb is **reset** (or **revoke**), not
_disable_ (Decision 2); **recovery revokes sessions** (Decision 3); **an audit event fires** and
**the target is notified** (Decision 8); and **out-of-band verification of the requester** is the
control that actually matters — help-desk MFA reset is the dominant social-engineering vector
(Decision 4). Entra revoking FIDO2 keys on re-register is the direct precedent for shipping passkey
revocation alongside TOTP reset (Decision 2). Entra and Okta both treating **a passkey as satisfying
MFA on its own** is why enrolment counts a passkey (Decision 5).

GitHub is the interesting dissent: where the account belongs to the person, no admin reset exists. It
does not apply here — under the `pinned` policy the org _is_ the deployment, and org-authority's
trusted-operator premise already licenses this authority.

---

## Decisions

### 1. Recovery runs through upstream steps, not module writes

The module cannot write auth-owned records directly — the `user-passkeys` connection is `write: false`
and the `twoFactor` and `user` rows are equally off-limits. That is the hard wall the user-admin design
is built on, and it is why recovery is two engine steps the module calls rather than a module write:

- `ResetUserTwoFactor({ userId })` clears the TOTP secret and its backup codes (one row), sets
  `user.twoFactorEnabled: false`, and deletes the user's trust-device verification records so a
  previously-trusted stolen device cannot skip the challenge after re-enrolment.
- `RevokeUserPasskeys({ userId, passkeyId? })` clears registered passkeys — all of them, or one when
  `passkeyId` is given.

Both are adapter-direct and their internals — the exact `where` clauses, why the trust-device sweep
carries a second `starts_with` clause, why the `input: false` guard does not apply — are the platform
design's
[Decision 1](../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md),
not this module's to re-specify. The module's concern is that both steps **throw on an unknown
`userId`**: a silent no-op leaves the admin believing the person can now sign in, which is worse than
an error.

### 2. Reset clears TOTP; revoke clears passkeys; neither grants an exemption

The word matters. "Disable 2FA for this user" implies a persistent exempt state, and that state is
exactly what a required-2FA deployment must not reach by accident. Recovery returns the user to
_unenrolled_ for the factor cleared, which under `required` is a state the engine actively pushes them
out of (Decision 7). So the UI verbs are **Reset two-factor authentication** and **Revoke passkeys**,
and there is deliberately no admin "exempt from 2FA" control. Per-person exemptions, if ever needed,
are a policy feature on roles or attributes, not a side effect of a recovery action (Non-goals).

**Two controls, not one, because they are two incidents.** "I lost my authenticator" and "my security
key was stolen" have different recovery, and under Decision 5 a passkey independently satisfies
`required` — so folding them together would mean a TOTP reset silently stripping a working passkey, or
a passkey revoke needlessly clearing a working authenticator. The platform ships them as two steps
precisely so an operator can address the incident they have (its Decision 1); the module mirrors that
with two controls. This reverses the earlier scoping of this design, which treated passkeys as out of
scope — the platform's argument for `RevokeUserPasskeys` is _this module's own badge_: a stolen passkey
both authenticates and satisfies the requirement, and no operator could revoke it.

**`passkeyId` is optional; omitted revokes all.** Both incidents are real — "my bag was stolen, I don't
know which credential is where" wants all; "I lost my YubiKey but my phone passkey is fine" wants one.
The module's revoke dialog offers the choice where the user holds more than one passkey, and revokes
all where they hold one. This matches the self-service `PasskeyDelete`, which already takes a single
passkey, keeping the two surfaces legible together.

The per-key picker needs per-credential data the detail read does not carry: `get_user_detail` `$lookup`s
the `user-passkeys` rows only to count them, and `close_row.yaml` `$unset`s the whole `passkeys` array
before the row reaches the browser — only the integer `passkey_count` survives. So the dialog is fed by a
dedicated read, `get_user_passkeys`, over the same `user-passkeys` **read** connection
(`write: false`), matched on the target `userId` (urlQuery), projecting `passkey_id` plus a device label
(`name` / `deviceType` / `createdAt`) — the admin-side mirror of self-service `get_passkeys`, which reads
the identical shape scoped to `_user.id`. The dialog lists those rows against their `passkey_id` where the
user holds more than one, and skips the read's picker where `passkey_count` is 1.

### 3. Both routines revoke sessions

The routines are:

```
reset-two-factor:  ResetUserTwoFactor  → RevokeUserSessions → audit event → notify target
revoke-passkeys:   RevokeUserPasskeys  → RevokeUserSessions → audit event → notify target
```

Each sits inside user-admin Decision 3's partial-failure rules without amending them: sequential,
halts on first error, no rollback, safe because the steps are idempotent and re-running converges,
audit event before the notify so a partial failure emits no misleading record and no misleading email.

**Why session revocation is a separate step and not folded into the recovery step.** It keeps the step
honest about what it does — a step that quietly revokes sessions as a side effect is the hidden blast
radius the catalog's one-operation-per-step shape avoids. And revocation is not tidying: clearing
`twoFactorEnabled` or deleting a passkey **does not end a session**. The scenario the recovery exists
for is a stolen device or a compromised credential, and the thief keeps the session they already hold
until it is revoked. Revoking is what actually recovers the account. (An earlier draft argued this from
`refreshUserSessions` not firing on a raw `adapter.update`; the platform design established that
argument is inert here — Lowdefy configures no `secondaryStorage`, so the function is a no-op — and the
plain reason above is the real one.)

### 4. The confirm dialogs carry the reach and the attestation

Two things the admin needs before confirming, on both dialogs.

**The reach is suite-wide.** `twoFactorEnabled` and the `passkey` rows are keyed to the `user`, not the
`member`, so a reset or revoke by one app's admin removes the factor everywhere in the suite — the same
shape as ban (user-admin Decision 4). The dialog says so, reusing the membership enumeration the
suspend dialog already runs, and collapsing to single-app copy when the person holds no other
memberships. **Who may perform it is now bounded** by org-authority: the step declares `org` authority
with `targetUser: 'userId'`, so the floor additionally requires the target to hold a member row in the
admin's organization. The effect stays suite-wide; the bound governs _who_ may be recovered, not _how
far the recovery reaches_ — the identical trade org-authority accepts for ban.

**The requester must be verified out of band.** This is the control the whole industry leans on and
software cannot enforce, so the dialog makes it explicit: a confirmation checkbox reading roughly
_"I have verified this person's identity through a channel other than email."_ It is a speed bump and a
paper trail, not a guard — but the failure mode it addresses (a caller impersonating an employee to a
help desk) is the most common way 2FA is defeated in practice.

**No new module var.** Whether the reset control is _built at all_ is gated by
`_build.authConfig.twoFactor.enabled` — no 2FA in the deployment, no reset routine or button shipped. Its
_per-user visibility_ then keys on the same runtime fact its badge reads, `get_user_detail.0.two_factor_enabled`:
a user in a 2FA deployment who never enrolled TOTP carries no `MFA · TOTP` badge, and must get no reset
control beside an absent badge acting on nothing. The revoke control mirrors this exactly — built where
passkeys are possible, visible per-user on `passkey_count > 0`. Restating either gate as a var would be exactly the mirror-var drift
`_build.authConfig` exists to prevent (user-account Decision 8). This is a deliberate departure from
`suspension` / `impersonation`, which are vars because they gate _authority a deployment might not want
its app-admins to have_. The escape hatch for a deployment that wants member management without
recovery is now a per-action org role: because `reset-two-factor` and `revoke-passkeys` are distinct
permissions (org-authority Decision 5 makes narrower roles possible the moment anyone registers one), a
deployment can grant member management and withhold recovery — no var needed, and nothing to remove
later. (This replaces the earlier third ground for shipping no var — _"can simply not grant
`auth.userAdminRole`"_ — since org-authority retired that key.)

**Where the controls render.** "Beside the badge" is the intent, not the mechanism: the `MFA · TOTP` and
`Passkey` badges are static spans inside one read-only `_nunjucks` `Html` block (`auth_methods`), so a
`Button` cannot be interleaved among them. The two controls instead sit in their own actions row beneath the
Auth-methods badges, each carrying the `visible` gate above (`two_factor_enabled` / `passkey_count > 0`) so
each appears only where the method it recovers is present — the same badge-plus-control pairing, expressed as
a sibling row rather than inline markup. This is the tile's only structural change; the existing
`security_actions` row (access: suspend / remove / sign-out / delete) is untouched.

### 5. The module reads `_user.twoFactorEnrolled`

Enrolment is `twoFactorEnabled || passkeyCount > 0`, computed by the engine in `resolveAuthentication`
and exposed on `context.user`, so it is `_user.twoFactorEnrolled` in app config on both client and
server. The module reads exactly this value, and reads no other — a UI that agreed with the gate about
who is compliant, computed from a different expression, would be a value that can disagree with itself.

**A passkey counts** because it is a phishing-resistant possession factor with a user-verification
ceremony bound to it — the reason Entra and Okta accept one outright. Telling a user who registered a
hardware key that they must _also_ set up TOTP is theatre that pushes them toward the weaker factor.
The field means **holds a factor that satisfies `auth.twoFactor.required`**, which is why it reads
`twoFactorEnrolled: true` for a passkey-only user; the docs say so.

**The name is `twoFactorEnrolled`, not `twoFactorSatisfied`.** This is a rename from the earlier draft
of this design. The platform reserves "satisfied" for the session-scoped successor (did _this session_
present a factor — the step-up feature), which must not find the name already taken; "enrolled" is what
this measures. The field is computed **always** (not only under `required`): `twoFactorEnabled` already
rides `session.user`, so the expression short-circuits for an enrolled caller at no cost, and only an
unenrolled caller costs a passkey read — gated engine-side on the passkey plugin being configured. So a
module reading it in a deployment without `required` sees a correct value, not the `undefined` an
earlier `required`-gated computation would have returned.

The concrete consumer is the security tile: with only `twoFactorEnabled` available, a passkey-holding
caller reads as unenrolled and the UI nags someone the engine treats as compliant — the theatre the
passkey rule prevents, leaking back one layer up. Reading `twoFactorEnrolled` closes that.

### 6. The forced-enrolment page

`user-account` contributes `pages/two-factor-enrol.yaml`, in the `onboarding.yaml` mould (the
`layout/auth-page` shell). It is where the engine's enforcement sends an unsatisfied caller, and three
of its properties are not the defaults:

**It is protected, not public — the first auth page that is.** Every other `authPages` role implies
public, on the reasoning that a sign-in page behind the wall is a bootstrap paradox. Enrolment is the
opposite case: the caller arriving holds a complete valid session and is missing a factor, not an
identity, so there is no paradox. The engine marks it `public: false` and exempts it from the enrolment
gate alone (platform Decision 8). The module's part is simply to contribute the page under the
`twoFactorEnrol` role and not add an `auth.public` entry for it.

**It must be self-sufficient on auth client actions.** An unenrolled caller is refused at every Lowdefy
endpoint by the gate, so the page cannot call one — no server-side request to fetch copy, log an event,
or check anything. This is fine: `TwoFactorEnable`, `TwoFactorVerify` and `PasskeyRegister` are client
actions hitting `/api/auth/*` directly, and the page is built from those, mirroring the self-service
enrolment modal (`modal_enroltotp.yaml`).

**It must offer the passkey route for a passwordless caller.** TOTP enrolment (`/two-factor/enable`) is
password-gated unconditionally, because Lowdefy does not expose BetterAuth's `allowPasswordless`. So an
OAuth-only or magic-link-only member cannot enrol TOTP at all — and under `required` that would be a
permanent lockout no admin reset can fix. The passkey disjunct in Decision 5 is what keeps the gate
satisfiable for them: `/passkey/generate-register-options` is session-gated, not password-gated, so
registering a passkey is their enrolment route. The page therefore presents **both** TOTP enrolment and
passkey registration, and a caller with no password reaches compliance through the passkey. (This
resolves the lockout that review finding 2 raised: the fix is the page offering the passkey path, not a
new upstream ask.)

### 7. Recovery and required compose without a mechanism between them

What does resetting 2FA — or revoking the last passkey — do in a deployment that requires it? Nothing
special, and that is the point. Recovery clears the factor (Decision 2), which makes the user
unenrolled (Decision 5), which makes the engine route them to `twoFactorEnrol` on their next request.
Their sessions were revoked (Decision 3), so the next request is a fresh sign-in. The user recovers by
enrolling, exactly as Okta and Entra describe "reset" behaving, and there is no third feature that
implements it.

The corollary constrains future work: **recovery must never be allowed to mean "exempt"**, or this
composition breaks and an admin recovery silently becomes a policy override. That is the real reason
Decision 2 rejects the "disable" verb.

With `required` **off**, recovery leaves the person short one factor until they choose to re-enrol —
the honest behaviour of a deployment that has not asked for 2FA, where the revoked sessions, the audit
event and the notification carry the weight.

### 8. The module notifies the target

The target gets told their second factor was removed. The industry treats this as non-negotiable on
MFA changes, and it is the module's to send, not the engine's.

**The engine cannot send it.** A step is called with no context; the `auth.email` send path is a
closure inside `getBetterAuthConfig`, never exposed, and its renderer throws on any flow outside its
four stock templates. So a fifth `auth.email.templates` key was never the small ask it looked like — it
needs mail-send threaded into every step's signature plus a new stock template — and the platform
design records this and declines it
([its Decision 12](../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md)).
This answers the earlier open question about the reset email: no upstream template, no step mail-send,
the notice is the module's.

**The module's existing plumbing covers it.** Each routine already emits an audit event through
`events`, and `notifications` exposes `send-notification` — an `InternalApi` whose routine the
deployment binds. The dispatch shape is not new: the `send_routine` contract is `{ event_ids }` — an
array of just-committed event ids — the identical payload the `workflows` engine hands `send-notification`
after every event, and the one every existing `send_routine` `$match`es on (`_id: { $in: event_ids }`). So
each recovery routine ends in a final `CallApi` into `send-notification` with `{ event_ids: [ <the audit
step's returned eventId> ] }`. This is the first Lowdefy `Api` routine to call `send-notification` (the
`workflows` precedent dispatches engine-side, from its connection's endpoint map), but mechanically it is an
ordinary `CallApi` to an `InternalApi` endpoint. The target is addressable because the audit event carries
`references.user_ids`, which `new-event` flattens onto the event doc's top level (`_object.assign`), so the
deployment's `send_routine` reads it as a top-level `user_ids` field on the row it re-reads by id. The
notice is dispatched **after** the audit event so a failed dispatch never suppresses the record, and it is
fire-and-forget: the writes have committed, and a bounced address must not leave the admin believing the
recovery failed.

**The exposure this creates, and what the module owes.** `notifications.send_routine` defaults to `[]`,
so a deployment that never binds it sends nothing and no layer notices — opt-in correctness on a
security notification. The module cannot close it (a dispatch is the deployment's own mail
infrastructure), so it carries the obligation in the docs: **a deployment enabling `auth.twoFactor`
must bind `send_routine`**, and the dialog is the wrong place to imply a notice was sent.

### 9. Both events need a display default and a type entry

Each routine emits an audit event, and the timeline reads **two** registries — `event_display` for the
title template and `enums/event_types.yaml` for colour, icon and type label. An earlier draft listed
only `event_display`, which would render the reset in the Activity timeline with no icon or type label
(review finding 5). So both events get both:

- `defaults/event_display.yaml` — `two-factor-reset` and `passkeys-revoked` title templates.
- `enums/event_types.yaml` — `two-factor-reset` and `passkeys-revoked` entries beside the existing
  eleven (e.g. `sessions-revoked`), reaching the timeline through
  `modules/shared/enums/event_types.yaml`.

Neither needs a manifest change: `event_display` is a bare `type: object` var with no per-type
sub-properties, so new keys need no `docs:gen` run (Decision 4's "no new manifest vars" holds).

---

## Surface

**`modules/user-admin`**:

- `api/reset-two-factor.yaml` — the routine of Decisions 3 and 8. Payload
  `{ user_id, target_name?, target_email? }`, matching `revoke-sessions.yaml`, ending in a `CallApi` into
  `send-notification` with `{ event_ids: [ <audit eventId> ] }` (Decision 8).
- `api/revoke-passkeys.yaml` — the passkey routine. Payload adds an optional `passkey_id`; omitted
  revokes all.
- `requests/get_user_passkeys.yaml` — the per-credential read the revoke picker needs (Decision 2), over
  the `user-passkeys` read connection, matched on the target `userId`, projecting `passkey_id` + device
  label. The detail read only counts passkeys; this lists them.
- `module.lowdefy.yaml` — a `notifications` dependency, for the Decision 8 dispatch.
- `components/view/modal_reset_2fa.yaml` — the reset confirm dialog (Decision 4).
- `components/view/modal_revoke_passkeys.yaml` — the revoke confirm dialog (Decision 4), listing
  `get_user_passkeys` rows for per-key vs all where the user holds more than one.
- `components/view/tile_security.yaml` — the two controls, in an actions row beneath the Auth-methods
  badges, each `visible`-gated to the method it recovers (Decision 4).
- `defaults/event_display.yaml` and `enums/event_types.yaml` — the two events (Decision 9).
- No new manifest vars (Decision 4).

**`modules/user-account`**:

- `pages/two-factor-enrol.yaml` — the forced-enrolment page (Decision 6), TOTP + passkey, no Lowdefy
  requests.
- `module.lowdefy.yaml` — contributes the `twoFactorEnrol` `authPages` role.

**`apps/demo`** — `required: true` in `auth.twoFactor`, wiring `authPages.twoFactorEnrol`, and binding
`notifications.send_routine`, per the repo rule that new capability ships with a demo consumer. Enrol
the demo admin/owner accounts before turning `required` on (Costs).

## What this consumes from upstream

Baseline, not work to sequence — all owned and specified by the platform designs. Named so the module
surfaces above have a contract to build against.

| Engine piece the module consumes                                    | Platform owner                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `ResetUserTwoFactor`, `RevokeUserPasskeys` steps                    | two-factor-lifecycle Decision 1                           |
| `user: ['reset-two-factor', 'revoke-passkeys']` org permissions     | two-factor-lifecycle Decision 3, on org-authority's model |
| `auth.twoFactor.required` flag + `_build.authConfig.twoFactor.*`    | two-factor-lifecycle Decision 11                          |
| `_user.twoFactorEnrolled`                                           | two-factor-lifecycle Decision 4                           |
| `authPages.twoFactorEnrol` (protected, gate-exempt) + build wiring  | two-factor-lifecycle Decision 8                           |
| Enrolment gate (`authorizeOutcome`, checked last, enumeration-safe) | two-factor-lifecycle Decisions 5–7                        |
| Magic-link/OAuth challenge interception (closes the bypass)         | auth-hardening (baseline)                                 |

## Non-goals

- **The engine enforcement and challenge machinery.** The enrolment gate, `authorizeOutcome`, the
  signed-out fork, and the magic-link/OAuth challenge hooks are owned upstream (table above), not
  re-specified here.
- **Per-user or per-role 2FA exemptions.** A policy feature, deliberately not reachable through the
  recovery action (Decision 2).
- **Admin-issued backup codes.** Google Workspace offers this as an alternative to a full reset; reset
  plus self-service re-enrolment covers the same incident.
- **OTP and SMS second factors.** TOTP, backup codes and passkeys only, matching the engine catalog's
  launch scope.
- **Self-service backup-code rotation and remaining-count surfacing.** Tracked separately as
  [backup-codes-rotation](../backup-codes-rotation/upstream-asks.md); it improves the self-service path
  but does not remove the need for admin recovery.

## Costs

- **`required` cannot be enforced retroactively without lockout risk.** Turning it on in a live
  deployment sends every unenrolled user to enrolment at their next request, including admins. There is
  no grace period and no break-glass in the platform design — the operational advice is to enrol the
  admin/owner accounts first, and more than one.
- **The invite path gets longer.** A new member hits the accept page, then onboarding
  (`profile_created`), then enrolment. The platform orders enrolment last deliberately so an abandoning
  invitee leaves a complete contact record; the module's part is only to contribute a page that loads
  without a Lowdefy request (Decision 6).
- **`required` is an enrolment floor, not a challenge guarantee** (platform Decision 4). A user holding
  a passkey and a password signs in with the password and is admitted having presented one factor. The
  module's enrolment copy must not imply otherwise.
- **A trusted-IdP-only deployment enrols factors nothing challenges.** Same root cause; the enrolled
  factor is still what a password or magic-link sign-in would challenge, and what admin reset restores
  the user to.
