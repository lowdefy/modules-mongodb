# Review 1

### 1. Decision 3 leaves the backup-code cluster gated on the stale `_user.two_factor_enrolled` it exists to eliminate

> **Resolved — and widened.** Confirmed, and it reaches further than the six blocks named here.
> `_user.two_factor_enrolled` drives **seventeen** blocks; the review's list of six misses
> `enrol_codes_copy` (`:366`), and — more consequentially — leaving the **ten pre-done** blocks on
> `_not: _user.two_factor_enrolled` while the done blocks move to `enrol.done` turns this finding's
> own stale-truthy population into a **blank page** (both clusters hidden on arrival), a strictly
> worse outcome than the loop. Decision 3 now replaces `_user.two_factor_enrolled` across the whole
> page: ten pre-done → `_not: enrol.done`, seven done-cluster → `enrol.done` (the five code blocks
> keeping their `enrol.backup_codes` conjunct, which is what stops the codes leaking into the scan
> phase). `enrol.done` seeded `false` onInit, set `true` in both success chains. The ambient fact
> is gone from the page entirely.

Decision 3 moves "the done message + Continue" onto a local `enrol.done` flag but says
"Backup-code visibility keeps its own `enrol.backup_codes` gate." Neither of the two readings of
that sentence is correct.

The four backup-code blocks — `enrol_codes_msg` (`two-factor-enrol.yaml:325`), `enrol_codes_grid`
(`:336`), `enrol_codes_alert` (`:357`), `enrol.codes_saved` (`:398`) — are each gated on
`_and: [_user.two_factor_enrolled, enrol.backup_codes]`.

- If Decision 3 **keeps** the `_user.two_factor_enrolled` conjunct on these four, they remain
  driven by the exact stale session fact the decision was written to stop trusting. In the
  post-verify render where the ambient fact hasn't refreshed, `enrol_done_msg` + `enrol_continue`
  show (via `enrol.done`) while the codes and the "I've saved my backup codes" switch stay hidden.
  `enrol_continue`'s `disabled` (`:421-426`) is `_and: [enrol.backup_codes, _not enrol.codes_saved]`
  — independent of `_user` — so Continue is disabled awaiting a checkbox the user cannot see:
  a deadlock that also strands the one-time codes.
- If Decision 3 instead gates them on **`enrol.backup_codes` alone** (dropping `_user`), the codes
  leak into the **scan** phase: `stash_enrol_totp` (`:125-133`) populates `enrol.backup_codes` at
  the _enable_ step, before the user has verified. The `_user.two_factor_enrolled` conjunct is
  currently the only thing keeping the code grid hidden while the user is still typing the
  confirmation code.

The correct fix is to move these four blocks onto the same completion signal as the done message:
gate them on `_and: [enrol.done, enrol.backup_codes]`. As written, Decision 3 reconciles 2 of the
6 `_user.two_factor_enrolled` blocks and leaves the 4 that carry the actual one-time secret on the
stale fact. Name all six in the design.

### 2. Decision 2 asserts an in-module fix is impossible; a `public`, `_user.id`-scoped request reaches `has_credential` on the enrol page

> **Resolved — reframed, and the mechanism changed.** Confirmed the "impossible" claim is false:
> `auth.public === true` returns `allow` before the enrolment branch, and `context.user` is
> populated independently, so a request _can_ run on the enrol page. But `public: true` is the
> wrong axis (it means _unauthenticated_; the caller here is authenticated, only the floor is
> unmet), so it is rejected. The chosen fix goes further than the design's old `_user.hasCredential`
> session fact, which is now dropped: the engine already exempts the enrol **page** from the floor
> and already stamps the invoking `pageId` onto `context` in `callRequest.js` — it just doesn't
> forward it into `authorizeRequest`. Forwarding it extends the page's existing exemption to its
> **requests**, so the enrol page runs a self-scoped `get_accounts` and reads `has_credential` the
> **same way the modals do** (one mechanism, no duplication, nothing to remember vs. a per-request
> flag). Self-bounding: `getRequestConfig` resolves by `pages/{pageId}/requests/{requestId}.json`,
> so the exemption reaches only enrol-page requests. Decision 2, the status line, and the Upstream
> section are rewritten; the "runs no request" page property is deleted as the workaround it was.
> (F34, raised alongside, shares this gate root but needs a separate handoff-UX fix — noted in Out
> of scope.)

Decision 2 rests on "The enrol page cannot read `has_credential` (no request) … the engine's
enrolment gate refuses an unenrolled caller at every endpoint," and treats the upstream
`_user.hasCredential` fact as the _only_ route to hiding the field.

The first half is verified for **protected** requests: `authorizeRequest`
(`@lowdefy/api/dist/routes/request/authorizeRequest.js:18`) calls `authorize(requestConfig)` with
**no** `pageId`, and the enrol-page exemption in `createAuthorizeOutcome.js:68` is `pageId`-keyed
(`pageId === enrolPageId`), so it never fires for a request — an unenrolled caller gets
`enrol_required` (→ `TwoFactorEnrolmentRequiredError`). That much of the design is right.

But a request marked `auth: { public: true }` returns `allow` at `createAuthorizeOutcome.js:55`
**before** the enrolment branch is ever reached, and `context.user` is populated by
`resolveAuthentication` independently of any request's public flag (`createApiContext.js:20-22`).
So a `public: true` `get_accounts`-style read filtered to `_user.id` would run for the
authenticated-but-unenrolled caller and expose `has_credential` — the in-module signal the design
says cannot exist. Only the caller's own row is ever returned, so there is no cross-user leak.

This may still land on the upstream fact as the cleaner "one correct way" (a public accounts read
is bespoke per-page surface, and `_user.hasCredential` mirrors `_user.twoFactorEnrolled`
uniformly). But the design should **weigh and reject** that alternative on its merits, not declare
the in-module route impossible — the current framing forecloses a decision that is actually open,
and leaves passwordless TOTP blocked on the forced-enrol page pending upstream when it may not have
to be.

### 3. The `get_accounts.yaml` request comment repeats the exact false claim the design refutes, and isn't in Files-changed

> **Resolved.** Confirmed — `get_accounts.yaml:9-12` carries the same disproven "`twoFactor.*`
> would 400" rationale. Added the file to Files changed with the correction: `has_credential` gates
> the password-dependent controls, but only `changePassword` 400s for a passwordless caller;
> `twoFactor.*` waives per-user. The facet itself is unchanged.

The design's premise is that `twoFactor.*` endpoints do **not** 400 for a passwordless caller
(they waive per-user under `allowPasswordless`). Decision 1 corrects `tile_security.yaml`'s header
(`:8-11`) accordingly. But `requests/get_accounts.yaml:11-12` carries the same wrong rationale
verbatim — "an OAuth/magic-link-only user has no credential and `changePassword` / `twoFactor.*`
would 400" — as the documented purpose of the `has_credential` facet, and the "Files changed" list
does not touch that file. Per the repo's comment rule, a comment stating a now-disproven reason
reopens the closed decision for the next reader. Add `get_accounts.yaml` to Files changed and
correct `:11-12` to scope the 400 claim to `changePassword` only (the facet is still correctly the
password-row gate; only its stated reach over `twoFactor.*` is wrong).

### 4. Decision 1 hides the modal password field but leaves the password-phase copy and phase intact for a passwordless caller

> **Resolved.** Confirmed — `enroltotp_intro_setup` renders "enter your account password" on the
> `password` phase regardless of `has_credential`, and the tile seeds a first-time passwordless
> caller straight onto that phase. Decision 1 now gates the intro copy on `has_credential` too, so a
> passwordless caller sees the modal title + the primary action button and no password prompt. The
> phase is **not** skipped: it hosts the Generate/Replace/Get-codes button that fires the enable
> call, so for a passwordless caller it is simply a one-button start screen. (`modal_disable2fa`
> needs no copy change — its only body text is the "removes the second step" warning, correct for
> everyone.) The enrol page's equivalent intro copy rides on Finding 2's resolution.

Decision 1 AND-s `has_credential` onto the `PasswordInput`'s `visible`, so a passwordless caller
sees no field. But the surrounding `password` phase is unchanged. `enroltotp_intro_setup`
(`modal_enroltotp.yaml:159-167`) still renders "Enter your account password to generate a new
authenticator secret" (and, for `codes_only`, "…to get a new set of backup codes"), and for a
first-time passwordless enrol caller `tile_security.yaml:216` seeds `phase: password`, so they land
on a screen that reads _enter your password_, shows no field, and offers a bare "Generate QR code"
button. That is the same confusing "password screen for someone with no password" UX the design
judges "unshippably bad" and refuses to ship on the enrol page (Decision 2) — yet ships it on the
modals. The design should say what the request-backed surfaces show a passwordless caller: at
minimum gate the intro copy on `has_credential` too, and consider whether such a caller should skip
the `password` phase entirely (the tile _can_ read `has_credential` at seed time).

### 5. The `replace` intent sends `password` twice; the coalesce must cover both calls

> **Resolved.** Confirmed — `enroltotp_replace_disable` (`:287`) and `enroltotp_replace_enable`
> (`:305`) both take `password`. Decision 1 now names all **four** coalesce sites explicitly (both
> `replace` calls plus `enrol` and `codes_only`), so the implementer can't treat "the replace
> password field" as one site.

Files changed says "`password` coalesce, across all three intents," but the `replace` chain passes
`password` to **two** endpoints — `enroltotp_replace_disable` (`modal_enroltotp.yaml:287`) and
`enroltotp_replace_enable` (`:305`). Coalescing only one reintroduces exactly the `null`→string
type-check failure F48 #1 documents on whichever call is missed (the untouched field is `null`, and
the action rejects `null` before BetterAuth sees it). Call out both params explicitly so the
implementer doesn't treat "the replace password field" as a single site.

### 6. The design's `has_credential` proxy is row-existence; BetterAuth's waiver is row-_with-password_

> **Accepted (documented).** Confirmed the divergence: `has_credential` tests row existence,
> `shouldRequirePassword` tests row-with-password. No path in this suite creates a password-less
> credential row (email/password signup always writes one), so the proxy is exact for the
> populations that occur. Added a paragraph to "The rule" recording this, and the precise upgrade
> if such a row ever becomes reachable: the test becomes `has_credential && has_password`.

The stated rule is "shown, required, and validated **iff the caller holds a password credential**."
The signal it uses, `get_accounts.0.has_credential`, tests only that a `provider_id: "credential"`
row exists (`get_accounts.yaml:31-32`). BetterAuth's `shouldRequirePassword`
(`better-auth/dist/utils/password.mjs:28`) tests `providerId === "credential" && account.password`
— the row **and** a password on it. For a credential row that carries no password these diverge:
the module would show a required password field (`has_credential` true) that the server waives
(`shouldRequirePassword` false), and the client `Validate` would block the empty submit the server
would have accepted. I could not find a path in this suite that creates a password-less credential
row, so this is likely not a real population — raising it as a question, not a blocker: is that
state reachable, and if not, is it worth a sentence in the design noting the proxy is exact for the
populations that occur?

### 7. Broken finding links and un-promoted finding status

> **Resolved (auto) — already fixed.** Verified against current files: the design header links are
> local `./F47-…` / `./F48-…` (the findings were moved into this folder and the links repointed),
> both resolve, and both findings now read `Status: promoted`. The `_promoted/` dead-links and
> `needs-design` status this finding describes no longer exist. Nothing to change.

The header links `[F47](../auth-testing/findings/_promoted/F47-…)` and the matching F48 link point
into a `_promoted/` directory that does not exist — both findings live at
`../auth-testing/findings/F47-…` / `F48-…`. Both files also still carry `Status: needs-design`, not
a promoted marker. Minor, but the design's traceability chain ("Promotes findings F47 and F48")
currently dead-links and disagrees with the findings' own status. Repoint the links and update the
finding status when this design is accepted.
