# Passwordless two-factor management

**Status:** partly blocked — Decisions 1 & 3 are in-module and shippable; Decision 2 (the
forced-enrol page) is a **hard blocker** on the upstream `_user.hasCredential` session fact and
cannot ship until it lands. See [Upstream](#upstream--blocking-dependency).

Promotes findings [F47](./F47-security-tile-hides-2fa-for-passwordless-users.md)
and [F48](./F48-forced-enrol-page-broken-for-passwordless.md) (moved into this folder),
and folds in two sibling surfaces that were never separately findinged
(`modal_enroltotp`, `modal_disable2fa`) because they carry the **same** open decision.

`user-account`'s 2FA management layer was built on an assumption that is false for magic-link /
OAuth-only members: **that every account holds a password, and that every 2FA operation
re-authenticates with it.** The [two-factor-lifecycle](../../../../lowdefy-design/designs/auth-upgrade/_completed/two-factor-lifecycle/design.md)
design set `allowPasswordless: true` on the twoFactor plugin _specifically so a TOTP passcode is
a valid standalone factor for a passwordless member_ (design lines 36–38, 351–364) — but the
module still gates and password-prompts as if a credential always exists. The result is a
population that `allowPasswordless` exists to serve being locked out of self-service 2FA at
every turn, and — under `twoFactor.required: true` — a **permanent lockout** the waiver was
meant to prevent.

## The mechanism the module got wrong

BetterAuth's four password-gated 2FA endpoints — `enable`, `disable`, `get-totp-uri`,
`generate-backup-codes` — each call `shouldRequirePassword(ctx, userId, allowPasswordless)`
(`better-auth/dist/utils/password.mjs:26-30`). With `allowPasswordless` set, that returns
`true` **only for a user who holds a `credential` account** and `false` for one who does not —
**per user, not globally** (two-factor-lifecycle design lines 351–364). So the password is
already waived server-side for exactly the passwordless population. Every place the module
_itself_ demands a password from a passwordless caller is a **module-side over-restriction**,
not a BetterAuth requirement.

## The rule — one correct way

> On any 2FA management surface, the password field is **shown, required, and validated iff the
> caller holds a password credential**; the `password` param is **always sent as a string**
> (empty when the caller holds none), letting `allowPasswordless` waive it server-side.

The signal for "holds a password credential" differs by surface, but the rule is identical:

- **Anywhere that can run a request** (the view page's tile and its modals) reads
  `get_accounts.0.has_credential` — the `$facet` flag already computed for the Security tile.
- **The forced-enrol page**, which by design runs **no Lowdefy request** (the engine's
  enrolment gate refuses an unenrolled caller at every endpoint), has no such signal today. That
  gap is the one piece this design cannot close in-module — see Decision 2.

## Blast radius

| Surface                                                                                                                                                                    | Broken behaviour                                                                               | Resolution            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| `tile_security.yaml:133` — 2FA row `visible: has_credential`                                                                                                               | Row hidden for passwordless; 2FA unreachable (**F47**)                                         | Decision 1            |
| `modal_enroltotp.yaml` — password `required` + `Validate` + param, on **all three intents** (enrol / replace / codes_only)                                                 | Manage, Replace, and New-codes all reject a passwordless caller the moment F47 unhides the row | Decision 1            |
| `modal_disable2fa.yaml` — password `required` + `Validate` + param                                                                                                         | A passwordless member who enrols TOTP can **never turn it off**                                | Decision 1            |
| `two-factor-enrol.yaml` — `TwoFactorEnable password` is `null` (untouched field), rejected by the action's own string type-check before it reaches BetterAuth (**F48 #1**) | TOTP enrol unreachable for passwordless under `required`                                       | Decision 2 (upstream) |
| `two-factor-enrol.yaml` — done-state + Continue gated on `_user.two_factor_enrolled`, which disagrees with the server gate → redirect loop (**F48 #2**)                    | Continue bounces back to the enrol page                                                        | Decision 3            |

Confirmed **not** affected, and left alone: the admin `reset-two-factor` API
(`ResetUserTwoFactor` + `RevokeUserSessions`, no target password), the Security tile's **passkey
row** (deployment-gated only, never `has_credential` — this answers F47's "does the passkey row
have the same over-gate?": no), and the `two-factor.yaml` challenge page (code-only, no
password).

## Decision 1 — request-backed surfaces gate on `has_credential`

The password row was always right to gate on `has_credential` (`:77`); the 2FA row and the two
management modals inherited the same gate and must not.

**`tile_security.yaml` (F47):** drop the `has_credential` gate on `twofa_row` (`:133`). The 2FA
row now shows whenever the deployment gate (`_build.authConfig: twoFactor.enabled`) passes,
matching the passkey row. Correct the header comment (`:8-11`), which currently claims both the
password _and_ two-factor rows require the credential gate.

**`modal_enroltotp.yaml` and `modal_disable2fa.yaml`:** apply the rule uniformly:

- **Field visibility** — the `PasswordInput`'s `visible` gains `_request: get_accounts.0.has_credential`
  (AND-ed with the existing phase gate). A passwordless caller never sees a password field.
- **Validation** — the `Validate` step gets `skip: { _not: { _request: get_accounts.0.has_credential } }`,
  so a hidden field is never validated. (`modal_disable2fa` validates `regex: '^disable2fa\.'`;
  `modal_enroltotp` validates the field id per intent — both skip the same way.)
- **Param** — the `password` param coalesces null→`''`:
  `{ _if_none: [ { _state: <ns>.password }, '' ] }`. An untouched or hidden field sends `''`,
  which `allowPasswordless` waives for a passwordless caller and BetterAuth rejects with
  `INVALID_PASSWORD` for a password caller who blanked it (surfaced by the existing catch). This
  preserves the "reset leaves to null" convention while satisfying the action's string
  type-check.

This covers **all three** `modal_enroltotp` intents in one change — `enrol` (`TwoFactorEnable`),
`replace` (`TwoFactorDisable` → `TwoFactorEnable`), and `codes_only`
(`TwoFactorGenerateBackupCodes`) — since every one of those endpoints waives per-user.

## Decision 2 — the forced-enrol page's TOTP fix is blocked on an upstream session fact

The enrol page cannot read `has_credential` (no request), so it cannot _hide_ the field. The
only in-module fix available there is the null→`''` coalesce — which leaves a passwordless
member staring at an "Account password — leave blank if you sign in without a password" field.
**That is unshippably bad UX, so we do not ship it.** The correct fix needs a signal the page can
read without a request:

**Hard blocker — the upstream `_user.hasCredential` session fact.** A boolean mirror of the
existing `_user.twoFactorEnrolled`, derived the same way in `resolveAuthentication` /
`normalizeCaller` and exposed on `context.user`. With it, the enrol page hides the password field
for a passwordless caller and applies Decision 1's rule identically — closing the TOTP route
without a request. **This design's forced-enrol-page resolution does not ship until that fact
lands** — there is no acceptable in-module substitute, so it is a blocking prerequisite, not a
follow-up. Decomposition orders it first (see [Upstream](#upstream)).

**Mitigation while it's outstanding — passwordless members are not fully locked out.** The enrol
page's **"Add a passkey"** branch (`PasskeyRegister`) needs no password and already works for a
passwordless caller; a passkey satisfies `required` on its own (`twoFactorEnrolled =
twoFactorEnabled || passkeyCount > 0`). So passkey is a working password-free enrol route under
`required` today, and — once Decision 1 ships — a passwordless member can also enrol **TOTP**
voluntarily from the Security-tile modal (which _can_ read `has_credential`). The **only** route
that stays blocked on the upstream fact is TOTP on the **forced-enrol page**.

## Decision 3 — the enrol-page done-state is driven by a local flag, not the ambient fact

F48 #2's loop is `_user.two_factor_enrolled` (a **session** fact, refreshed only on
`UpdateSession`) disagreeing with the engine's `required` gate (recomputed **per request** from
the DB). When the client fact reads truthy while the gate reads not-enrolled, the done-state and
Continue render, and `Link {home: true}` bounces straight back off the gate.

Rather than chase the staleness, **gate the done-state and Continue on a local `enrol.done`
flag** set only by this page's own successful enrolment chain — the `TwoFactorVerify`
(after `UpdateSession`) and `PasskeyRegister` (after `UpdateSession`) success paths. The page was
reached _because_ the gate said "not enrolled", so the only legitimate route to "done" is
completing an enrolment **here**; a flag set by that completion cannot disagree with a gate that
has, by then, been satisfied. This removes the dependence on the ambient fact for the
done/Continue affordance entirely. (Backup-code visibility keeps its own
`enrol.backup_codes` gate; only the done message + Continue move to `enrol.done`.)

## Files changed

- `modules/user-account/components/view/tile_security.yaml` — remove `has_credential` gate on
  `twofa_row`; correct header comment.
- `modules/user-account/components/view/modal_enroltotp.yaml` — field `visible` + `Validate`
  `skip` + `password` coalesce, across all three intents.
- `modules/user-account/components/view/modal_disable2fa.yaml` — same three edits.
- `modules/user-account/pages/two-factor-enrol.yaml` — Decision 3 (`enrol.done` flag drives
  done-state + Continue); correct header comment (`:19-24`) to record the Decision 2 upstream gap
  and the passkey mitigation. **No** password-param change here (Decision 2).
- Demo verification: `apps/demo`'s `user-account/view` and forced-enrol flow already exercise
  these surfaces; verify with `pnpm ldf:b`, then a passwordless demo member (no `credential`
  account) through the tile modals and the enrol page's passkey route. No new demo page needed.

## Upstream — blocking dependency

- **`_user.hasCredential` session fact** (hard blocker for Decision 2) — boolean, "caller holds a
  `credential` account", exposed on `context.user` alongside `_user.twoFactorEnrolled`, derived in
  `resolveAuthentication` / `normalizeCaller`. The forced-enrol page's TOTP-for-passwordless fix
  cannot be built without it and does not ship until it lands. Decisions 1 and 3 (tile, both
  modals, the Continue-loop fix) carry **no** upstream dependency and can ship ahead of it; the
  design is complete only when all three land. Until the fact ships, passkey is the passwordless
  enrol route on the forced-enrol page, and the Security-tile modal is the passwordless TOTP
  route.

## Out of scope

- **F34** (removing the last 2FA method dumps the user into forced re-enrolment) — a passwordless
  member turning off their only factor under `required` re-enters the enrol page; that transition
  is F34's decision, not this one.
- **F36** (passkey assertion as a second-factor _challenge_), **F37** (backup codes don't
  verify), **F45** (stale `_user` after tile mutations), **F44** (modal enrol redirect) — related
  2FA defects with their own findings; untouched here.

## Related

- [two-factor-lifecycle](../../../../lowdefy-design/designs/auth-upgrade/_completed/two-factor-lifecycle/design.md)
  — `allowPasswordless`, the `required` floor, and `_user.twoFactorEnrolled` (Decisions 4, 5).
- [auth-testing campaign](../auth-testing/design.md) — the findings' origin.
