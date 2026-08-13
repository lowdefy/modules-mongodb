# Passwordless two-factor management

**Status:** Decisions 1 & 3 are in-module and shippable now. Decision 2 (the forced-enrol page)
depends on **one small upstream engine change** — forwarding the invoking `pageId` into request
authorization so the enrol page's existing gate exemption extends to its requests — after which the
page reads `has_credential` from `get_accounts` exactly like the modals. Not a hard blocker: the
change is a couple of lines in `@lowdefy/api` and lands alongside this work. See
[Upstream](#upstream--engine-dependency).

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

- **Every surface reads the same signal** — `get_accounts.0.has_credential`, the `$facet` flag
  already computed for the Security tile. The view page's tile and modals run it today; the
  forced-enrol page runs it too **once the engine forwards `pageId` into request authorization**
  (see Decision 2). One mechanism for the fact on every surface — no bespoke per-page channel.

`has_credential` is an **exact proxy for the populations this suite produces, not a universal one.**
It tests only that a `provider_id: "credential"` row exists (`get_accounts.yaml:30-33`); BetterAuth's
`shouldRequirePassword` waives on `providerId === "credential" && account.password` — the row **and**
a password on it (`better-auth/dist/utils/password.mjs:28`). The two diverge only for a
credential row that carries **no** password, where the module would show a required field the server
would waive. No path in this suite creates a password-less credential row (email/password signup
always writes one), so the proxy is exact here; if such a row ever becomes reachable, the field
gains this exact-signal gap and the rule's `has_credential` test would need to become
`has_credential && has_password`.

## Blast radius

| Surface                                                                                                                                                                    | Broken behaviour                                                                               | Resolution          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| `tile_security.yaml:133` — 2FA row `visible: has_credential`                                                                                                               | Row hidden for passwordless; 2FA unreachable (**F47**)                                         | Decision 1          |
| `modal_enroltotp.yaml` — password `required` + `Validate` + param, on **all three intents** (enrol / replace / codes_only)                                                 | Manage, Replace, and New-codes all reject a passwordless caller the moment F47 unhides the row | Decision 1          |
| `modal_disable2fa.yaml` — password `required` + `Validate` + param                                                                                                         | A passwordless member who enrols TOTP can **never turn it off**                                | Decision 1          |
| `two-factor-enrol.yaml` — `TwoFactorEnable password` is `null` (untouched field), rejected by the action's own string type-check before it reaches BetterAuth (**F48 #1**) | TOTP enrol unreachable for passwordless under `required`                                       | Decision 2 (engine) |
| `two-factor-enrol.yaml` — done-state + Continue gated on `_user.two_factor_enrolled`, which disagrees with the server gate → redirect loop (**F48 #2**)                    | Continue bounces back to the enrol page                                                        | Decision 3          |

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
- **Intro copy** — the password-phase intro that reads _enter your account password_
  (`modal_enroltotp.yaml:147` `enroltotp_intro_setup`, both the enrol/replace and `codes_only`
  branches) gains the same `has_credential` gate. A passwordless caller on the `password` phase
  then sees the modal title plus the primary action button (Generate QR / Replace / Get codes) and
  **no** password prompt. The phase is not skipped — it hosts that action button, which is the
  only way to fire the enable/replace/rotate call — so for a passwordless caller it is simply a
  one-button "start" screen. (`modal_disable2fa` needs no equivalent: its only body copy is the
  "removes the second step" warning, which is correct for every caller.)

The coalesce touches **four** param sites across the three `modal_enroltotp` intents, not three —
the `replace` chain sends `password` to **both** `enroltotp_replace_disable` (`:287`, on
`TwoFactorDisable`) **and** `enroltotp_replace_enable` (`:305`, on `TwoFactorEnable`); coalesce
both or the untouched-field `null` re-breaks whichever call is missed. The full set: `enrol`
(`TwoFactorEnable`, one), `replace` (`TwoFactorDisable` → `TwoFactorEnable`, **two**), `codes_only`
(`TwoFactorGenerateBackupCodes`, one) — every one waives per-user.

## Decision 2 — the forced-enrol page reads `has_credential`, via a page-scoped gate exemption

The enrol page needs the same `has_credential` signal the modals use, to hide the password field
and its intro copy from a passwordless caller. Its problem was never that it _shouldn't_ run a
request — it is that it _can't_: the engine's `required` gate refuses an unenrolled caller at every
Lowdefy endpoint, so any request the page fires trips `enrol_required`. The page's documented
"runs no Lowdefy request" property is a **workaround for that gap, not a design goal** — and the gap
is an engine inconsistency worth fixing directly.

**The engine already exempts the enrol _page_ from the gate; it should exempt that page's _requests_
too.** `authorizeOutcome` (`@lowdefy/api/.../createAuthorizeOutcome.js`) already carries the
predicate `pageId === enrolPageId → allow`, and `callRequest.js` already stamps the invoking
`pageId` onto `context` (the client sends it with every request). The only gap is that
`authorizeRequest.js` calls `authorize(requestConfig)` **without forwarding `{ pageId }`**, so the
exemption — which fires for the page route — never fires for a request. Forward it, and requests
invoked from the enrol page inherit the page's own exemption: _the page is allowed to skip the
floor, so are its requests._ This is the upstream change, and it is small (see
[Upstream](#upstream--engine-dependency)).

**Why page-scoped, not a per-request flag or a session fact.**

- **vs. a per-request `enrolExempt` flag** — a flag is opt-in convention, and the next request the
  enrol page needs is one forgotten flag away from the raw gate error again. Page-scoping is
  mechanical ("one correct way"): nothing to remember, nothing to drift.
- **vs. a `_user.hasCredential` session fact** (this design's earlier plan) — that adds a _second_
  channel for a fact `get_accounts` already computes; the modals would read it one way and the page
  another. Page-scoping lets the enrol page read `has_credential` from `get_accounts` **identically
  to the modals** — one mechanism everywhere — and deletes the duplication instead of adding to it.
- **A `public: true` request is the wrong axis and is rejected** — `public` means _unauthenticated_,
  and it would make the read literally reachable without a session. The caller here _is_
  authenticated; only the enrolment floor is unmet. Exempting the floor is the correct axis; dropping
  authentication is not.

**Security.** The enrolment floor runs _after_ authentication and roles (the ordering the engine
comment calls security-critical), so it is not a data boundary — it only forces a second factor at
sign-in. Exempting an enrol-page request exposes nothing a caller couldn't reach once enrolled; it
only lets an already-authenticated, already-role-authorized caller run a **self-scoped read of their
own account** one step before enrolling. And the exemption is self-bounding: `getRequestConfig`
resolves a request by `pages/{pageId}/requests/{requestId}.json`, so a spoofed `pageId` can only
reach requests that actually live on the enrol page — exactly the ones meant to be exempt.

**With the exemption in place, the enrol page applies Decision 1's rule identically to the modals:**
a self-scoped `get_accounts` runs on load, its `has_credential` gates the password field
(`enrol.password`) and the "confirm your account password" intro (`enrol_totp_intro`), and the
`TwoFactorEnable` `password` param coalesces null→`''`. A passwordless caller sees a clean
"Generate QR code" screen with no password mention; a password caller sees the field as before.

**Mitigation before the engine change lands — passwordless members are not locked out.** The enrol
page's **"Add a passkey"** branch (`PasskeyRegister`) needs no password and works for a passwordless
caller today; a passkey satisfies `required` on its own (`twoFactorEnrolled = twoFactorEnabled ||
passkeyCount > 0`). And once Decision 1 ships, a passwordless member can enrol **TOTP** voluntarily
from the Security-tile modal. So the only route waiting on the engine change is forced-enrol-page
TOTP, and it is a short wait, not a hard gate.

## Decision 3 — the enrol-page done-state is driven by a local flag, not the ambient fact

F48 #2's loop is `_user.two_factor_enrolled` (a **session** fact, refreshed only on
`UpdateSession`) disagreeing with the engine's `required` gate (recomputed **per request** from
the DB). When the client fact reads truthy while the gate reads not-enrolled, the done-state and
Continue render, and `Link {home: true}` bounces straight back off the gate.

Rather than chase the staleness, **replace `_user.two_factor_enrolled` across the whole page with a
local `enrol.done` flag** set only by this page's own successful enrolment chain — the
`TwoFactorVerify` (after `UpdateSession`) and `PasskeyRegister` (after `UpdateSession`) success
paths, seeded `false` in `seed_enrol` onInit. The page was reached _because_ the gate said "not
enrolled", so the only legitimate route to "done" is completing an enrolment **here**; a flag set
by that completion cannot disagree with a gate that has, by then, been satisfied.

**It is the whole page, not just the done message + Continue.** `_user.two_factor_enrolled`
currently drives **seventeen** blocks, and moving only two leaves the rest inconsistent — one of
which turns the loop into a worse bug:

- **Ten pre-done blocks** are gated `_not: _user.two_factor_enrolled` (title, lead, the TOTP
  intro/password/generate trio, the passkey divider + button, the scan intro/row, and confirm).
  If these stay on the ambient fact while the done blocks move to `enrol.done`, a **stale-truthy
  arrival** — a member who disabled 2FA in another session, whose session fact still reads
  enrolled, force-routed here by the per-request gate — renders **`_not: true` → every pre-done
  block hidden** _and_ `enrol.done` still false → every done block hidden: a **blank page**, which
  is F48 #2's exact population (fact truthy, gate not-enrolled) turned from a redirect loop into
  nothing at all. They must move to `_not: enrol.done`, which reads correctly on arrival (`enrol.done`
  false → form shows).
- **Seven done-cluster blocks** are gated on positive `_user.two_factor_enrolled`: `enrol_done_msg`,
  the five backup-code blocks — `enrol_codes_msg`, `enrol_codes_grid`, `enrol_codes_alert`,
  **`enrol_codes_copy`** (`:366`), `enrol.codes_saved` — and `enrol_continue`. All move to
  `enrol.done`; the five code blocks **keep** their existing `enrol.backup_codes` conjunct
  (`_and: [enrol.done, enrol.backup_codes]`). Gating the code blocks on `enrol.backup_codes` _alone_
  is wrong: `stash_enrol_totp` populates `enrol.backup_codes` at the **enable** step, before verify,
  so the one-time codes would leak into the scan phase — the completion signal, not code-presence,
  is what keeps them hidden until verified.

Passkey leaves `enrol.backup_codes` null, so its done state shows the message + Continue and no
codes; TOTP shows codes too. `enrol_continue.disabled` (`:421`) already keys off
`enrol.backup_codes` / `enrol.codes_saved` only and is unchanged. This removes
`_user.two_factor_enrolled` from the page **entirely**.

## Files changed

- `modules/user-account/components/view/tile_security.yaml` — remove `has_credential` gate on
  `twofa_row`; correct header comment.
- `modules/user-account/components/view/modal_enroltotp.yaml` — field `visible` + `Validate`
  `skip` + intro-copy `visible` + `password` coalesce across **four** param sites (both `replace`
  calls, plus `enrol` and `codes_only`).
- `modules/user-account/components/view/modal_disable2fa.yaml` — field `visible` + `Validate`
  `skip` + `password` coalesce (the field has no phase gate, so `visible` becomes
  `has_credential` alone; no intro copy to gate).
- `modules/user-account/requests/get_accounts.yaml` — correct the `:9-12` comment: `has_credential`
  gates the password-dependent controls, but only **`changePassword`** 400s for a passwordless
  caller; `twoFactor.*` waives per-user under `allowPasswordless` (the false claim this design
  refutes). The facet itself is unchanged — still the correct password-row gate.
- `modules/user-account/pages/two-factor-enrol.yaml` — two changes:
  - **Decision 3** (ships now, no engine dependency): replace `_user.two_factor_enrolled` on **all
    seventeen** blocks with `enrol.done` (ten pre-done → `_not: enrol.done`, seven done-cluster →
    `enrol.done`, code blocks keep the `enrol.backup_codes` conjunct); seed `enrol.done: false`
    onInit and set it `true` in both success chains.
  - **Decision 2** (rides the engine change): add a self-scoped `get_accounts` request to the page;
    gate `enrol.password` + `enrol_totp_intro` on `has_credential` and coalesce the
    `TwoFactorEnable` `password` param null→`''`, exactly as Decision 1 does on the modals.
  - Rewrite the header comment (`:1-24`): drop the "runs no Lowdefy request" framing — the page now
    runs `get_accounts` under the page-scoped gate exemption — and record the `enrol.done`
    completion signal.
- `apps/demo` / engine — the page-scoped exemption is an `@lowdefy/api` change (see Upstream); the
  demo's forced-enrol flow verifies it end-to-end once it lands.
- Demo verification: `apps/demo`'s `user-account/view` and forced-enrol flow already exercise
  these surfaces; verify with `pnpm ldf:b`, then a passwordless demo member (no `credential`
  account) through the tile modals and the enrol page's passkey route. No new demo page needed.

## Upstream — engine dependency

- **Forward the invoking `pageId` into request authorization** (`@lowdefy/api`) — the enabler for
  Decision 2. `callRequest.js` already sets `context.pageId` from the pageId the client sends with
  every request; `authorizeOutcome` already exempts `pageId === enrolPageId`. The only change is
  `authorizeRequest.js` passing `{ pageId: context.pageId }` into the authorize call so a request
  invoked from the enrol page inherits the page's existing exemption. Naturally bounded:
  `getRequestConfig` resolves requests by `pages/{pageId}/requests/{requestId}.json`, so the
  exemption reaches only requests registered on the enrol page. Small and self-contained; a test
  should cover that a non-enrol page's request is _not_ exempted and that an enrol-page request is.
- **Not a hard blocker.** Decisions 1 and 3 (tile, both modals, the Continue-loop fix) carry **no**
  engine dependency and ship independently. Decision 2's forced-enrol-page fix rides the engine
  change; until it lands, passkey is the passwordless enrol route on the forced-enrol page and the
  Security-tile modal is the passwordless TOTP route. The design is complete when all three land.
- **Superseded plan.** An earlier draft added a `_user.hasCredential` session fact for this. It is
  dropped: it duplicated a fact `get_accounts` already computes and split the read across two
  mechanisms. The page-scoped exemption lets the enrol page use the same `get_accounts` read as the
  modals instead.

## Out of scope

- **F34** (removing the last 2FA method dumps the user into forced re-enrolment) — **same engine
  root as Decision 2, different fix.** F34 is the `required` gate biting a _normal_ page: deleting
  the last factor on the Security tile leaves the caller unenrolled mid-session, and the tile's
  `refetch_account` → `get_account` trips the gate with a raw error + loading hang. The page-scoped
  exemption here does **not** (and must not) touch it — the view page _should_ gate an unenrolled
  caller into enrolment. F34's fix is a **handoff-UX** one: the client catching the engine's typed
  `TwoFactorEnrolmentRequiredError` and doing a deliberate in-app redirect (killing the raw string
  and hang), and/or blocking last-factor deletion up front. That is F34's decision, not this one;
  noted here only because the two share the gate.
- **F36** (passkey assertion as a second-factor _challenge_), **F37** (backup codes don't
  verify), **F45** (stale `_user` after tile mutations), **F44** (modal enrol redirect) — related
  2FA defects with their own findings; untouched here.

## Related

- [two-factor-lifecycle](../../../../lowdefy-design/designs/auth-upgrade/_completed/two-factor-lifecycle/design.md)
  — `allowPasswordless`, the `required` floor, and `_user.twoFactorEnrolled` (Decisions 4, 5).
- [auth-testing campaign](../auth-testing/design.md) — the findings' origin.
