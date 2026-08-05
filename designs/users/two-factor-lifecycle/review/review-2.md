# Review 2

This is a re-review after the rewrite that pushed the engine half upstream and scoped this design to
the two module surfaces. The upstream contract
([`lowdefy-design/.../two-factor-lifecycle`](../../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md))
checks out against the module claims — the steps, permissions, `_user.twoFactorEnrolled`, the
protected `authPages.twoFactorEnrol`, and the notify-decline (its Decision 12) all land as the design
says. review-1's findings 1/3/4/6 have moved upstream and are resolved there; findings 2, 5, 7–9 are
addressed in the current text. What remains are module-side gaps the rewrite introduced or left open.

### 1. The per-key revoke dialog has no data to render, and no real `passkeyId` to send

> **Resolved (auto).** Confirmed: `close_row.yaml:42` `$unset`s `passkeys`, so only `passkey_count`
> survives on the wire. Decision 2 now specifies a dedicated `get_user_passkeys` read over the
> `user-passkeys` read connection (matched on the target `userId`, projecting `passkey_id` + device label —
> the admin-side mirror of self-service `get_passkeys`), and the Surface lists it. The picker lists those
> rows where `passkey_count > 1`, revoke-all otherwise.

Decision 2 and the Surface commit `modal_revoke_passkeys.yaml` to "offer the choice where the user
holds more than one passkey" — a per-credential picker — and `RevokeUserPasskeys({ userId, passkeyId? })`
needs a concrete `passkeyId` for the per-key case. But the admin surface never receives the individual
passkeys. `get_user_detail.yaml:30-34` `$lookup`s the `user-passkeys` rows into `passkeys`, computes
`passkey_count` from them (`:51-55`), and then `requests/stages/close_row.yaml:36` `$unset`s the whole
`passkeys` array before the row reaches the browser. All that survives on the wire is the integer
`passkey_count` (the tile reads exactly this at `tile_security.yaml:207-208`).

So there is nowhere for the dialog to list "YubiKey / iPhone / created 3 Jun" against a `passkey_id`,
and nowhere to source the id the step requires. The self-service side solves the same problem with
`user-account/requests/get_passkeys.yaml`, but that read is session-scoped to the caller's own
credentials and cannot be pointed at another user.

The fix is a module-side read the design doesn't mention: a request (e.g. `get_user_passkeys`) over the
existing `user-passkeys` **read** connection (`modules/user-admin/connections/user-passkeys.yaml`,
`write: false`), matched on the target `userId`, projecting per-credential `passkey_id` plus a human
label (device name / `createdAt`) for the dialog rows. The design should add it to the Surface and say
what fields the dialog displays — otherwise the per-key branch of Decision 2 is unbuildable and quietly
collapses to revoke-all.

### 2. The forced-enrolment page cannot tell whether the caller can even use TOTP

> **Resolved.** The premise the finding turns on — TOTP enable is password-gated unconditionally because
> Lowdefy never sets `allowPasswordless` — no longer holds. The platform now sets `allowPasswordless: true`
> on the twoFactor plugin (upstream Decision 4); `shouldRequirePassword` (`better-auth/dist/utils/password.mjs:26-30`)
> waives the password **per user** for anyone holding no password credential and still enforces it for a
> password user. So TOTP is reachable by an OAuth/magic-link caller too, the page presents it to everyone,
> and the "which caller is passwordless" distinction the finding asks for is simply not needed — no
> `_user.hasCredential` upstream ask is raised. Decision 6 is rewritten to say both routes work for every
> caller; passkey is offered as an alternative (it satisfies `required` on its own, Decision 5), not as the
> lockout escape it was.

Decision 6 says the page "presents **both** TOTP enrolment and passkey registration, and a caller with
no password reaches compliance through the passkey." Two facts from the upstream contract collide here:
TOTP enable is password-gated unconditionally (`shouldRequirePassword` returns `true` unless
`allowPasswordless`, which Lowdefy never sets — upstream Decision 4), and the enrolment page **cannot
call any Lowdefy request** because an unenrolled caller is refused at every endpoint (upstream Decision
8, restated in the design's own Decision 6).

The self-service enrolment path decides whether to show the password/TOTP flow by reading
`get_accounts.0.has_credential` — a Lowdefy request the forced-enrolment page is structurally barred
from making. And `_user` carries no credential-account fact to substitute for it. So the page has no
signal for whether the arriving caller is a password user (TOTP is available) or an OAuth/magic-link-only
user (TOTP will throw `INVALID_PASSWORD` and passkey is the only route). As written it must render the
TOTP form to everyone, and a passwordless caller sees a form they cannot complete on the one page they
cannot leave until they do.

This is the module-side residue of review-1 finding 2, which explicitly punted "whether to render the
password field at all" to this design as "a design question worth settling here rather than at code
time." It is still unsettled. Settle it: either accept rendering both unconditionally and specify how
the TOTP block signals "needs a password" / steers the passwordless user to passkey, or establish that a
client-readable signal is needed (which would be a new upstream ask, since `_user` doesn't carry it).

### 3. The reset control's visibility gate is specified deployment-wide but the intent is per-user

> **Resolved (auto).** Correct — the badge reads `two_factor_enabled` (`tile_security.yaml:205-206`) while
> the design gated the control deployment-wide. Decision 4 now splits the two: `_build.authConfig.twoFactor.enabled`
> gates whether the control is _built_ (no reset API shipped into a non-2FA deployment); per-user `visible`
> keys on `get_user_detail.0.two_factor_enabled`, mirroring the badge and the revoke control's `passkey_count > 0`.

Decision 4 gates the reset control on `_build.authConfig.twoFactor.enabled` — "no 2FA, nothing to
reset." That is a **deployment**-level fact: it is true for every user in a 2FA-enabled deployment,
including those who never enrolled TOTP. But the same decision, and the Proposed-change bullet, place the
control "beside the `MFA · TOTP` badge" — and that badge renders on the **per-user** fact
`get_user_detail.0.two_factor_enabled` (`tile_security.yaml:198-199, 205-206`). The two gates are not the
same. Under the stated deployment gate, a user with no TOTP row still gets a "Reset two-factor
authentication" button sitting next to an absent badge, acting on nothing.

Gate the reset control on the per-user `get_user_detail.0.two_factor_enabled` instead (mirroring the
badge). It subsumes the deployment gate — if 2FA is disabled no user carries `two_factor_enabled: true`
— and it is the honest "there is a factor here to reset" condition. The revoke control already gets this
right: Decision 4 gates it on `passkey_count > 0`, the per-user fact its badge uses.

### 4. The `send-notification` dispatch is new routine-level wiring with no precedent and an unstated payload contract

> **Resolved (auto).** The payload shape isn't unknowable — it's documented. `send_routine` receives
> `{ event_ids }` (an array), the shape the `workflows` engine hands `send-notification` and the one every
> existing `send_routine` `$match`es on (`_id: { $in: event_ids }`; see the demo/workflows-test routines and
> `docs/notifications`). Decision 8 now pins it: each routine ends in a `CallApi` into `send-notification`
> with `{ event_ids: [ <audit eventId> ] }`, and notes `new-event` flattens `references.user_ids` onto the
> event doc's top level so the deployment routine reads `user_ids` there. The "first `Api` routine to call
> it" point stands and is called out, but it's an ordinary `CallApi` to an `InternalApi` endpoint.

Decision 8 leans on "`notifications` exposes `send-notification` … which dispatches from event ids, the
way `workflows` already dispatches." The analogy is looser than it reads. `workflows` dispatches
`send-notification` **engine-side**, from the workflow engine's connection endpoint map
(`modules/workflows/connections/workflow-api.yaml:43-46`) — not from a Lowdefy `Api` routine. No
existing user-admin routine calls `send-notification` at all; `revoke-sessions.yaml` (the payload/shape
template the design copies) ends at the audit `CallApi` with no notify step. So the reset/revoke routines
would be the first `Api` routine to `CallApi` into `send-notification`, and there is no routine-level
example to copy.

That matters because `send-notification` is `type: InternalApi` with `routine: _module.var: send_routine`
(`send-notification.yaml:1-4`) — a fully deployment-defined body. The module therefore _defines_ the
input contract by whatever it passes, and a deployment's single `send_routine` has to serve every
dispatcher. `new-event` returns `{ eventId }` (`events/api/new-event.yaml`, the `:return`), so the design
presumably passes `{ eventId }` and expects the deployment routine to re-read the event for
`references.user_ids` — but the design never states this, nor confirms it is the same shape `workflows`
hands to `send-notification`. If the two dispatchers pass different payloads, one `send_routine` cannot
handle both and the 2FA notice silently no-ops — which is exactly the opt-in-correctness exposure
Decision 8 already frets about. Pin the payload the routines pass, and confirm it matches the existing
dispatcher's shape.

### 5. The two controls can't live "beside the badge" without restructuring the read-only badge block

> **Resolved (auto).** Confirmed: the badges are static spans inside one `_nunjucks` `Html` block
> (`auth_methods`, `tile_security.yaml:179-208`), not blocks a `Button` can sit among. Decision 4 now states
> the controls render in their own actions row beneath the Auth-methods badges, each `visible`-gated to its
> method (finding 3's per-user gates), and the Surface names `tile_security.yaml` as reworked. "Beside the
> badge" is kept only as intent in the Proposed-change summary.

Both badges are rendered as static markup inside a single `_nunjucks` `Html` block (`auth_methods`,
`tile_security.yaml:179-208`) — the `MFA · TOTP` and `Passkey` spans are string fragments, not blocks.
A Lowdefy `Button` that opens a confirm modal cannot be placed "beside" a badge that only exists as HTML
inside that template. The existing action buttons all live in a separate `security_actions` row
(`:24-138`), structurally divorced from the badges.

So "a button on the Security tile beside the `MFA · TOTP` badge" / "a button that appears where the
passkey badge already does" (Proposed change, Decision 4) can't be built as literally described. The
design should say where the controls actually render — most likely each auth-method row becomes
badge-plus-control, or a dedicated controls row carries per-button `visible` conditions matching the
badge gates (`two_factor_enabled`, `passkey_count > 0`; see finding 3). Either way the read-only
`auth_methods` block gets reworked, which the Surface should name rather than imply.
