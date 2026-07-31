# Review 2 — Second pass on the reworked design

Review 1's eight findings are all annotated and settled; this pass reads the
revised design (the new D4 intent enum, D6, the `choose` phase, the `Paragraph`
manual key, the `codes_saved` gate) against the code.

The engine and platform mechanics the design leans on all check out, and are not
re-raised: the exact-id matcher and the `regex`-array / `regex`+`blockIds` OR
(`getBlockMatcher.js:16-58`), the invisible-input restore in `Block.reset`
(`Block.js:168-196`) and `evaluate`'s defined-only override (`Block.js:236-239`),
`createSetState`'s argument-less `RootSlots.reset()` resolving to current state
(`createSetState.js:24-26` + `Slots.js:64-69`), the invisible-block state delete
(`Slots.js:77-93`), `footer: false` → `extraProps.footer = null` and the absence of
`keyboard` from the Modal props (`blocks-antd/dist/blocks/Modal/Modal.js:47-119`),
`Button`'s self-disable + spinner on `onClick.loading` (`Button.js:79,81`),
`Paragraph`'s `code` / `copyable` (`Paragraph/meta.js:32-45`), `CheckboxSwitch`'s
`description` (`CheckboxSwitch/meta.js:52-55`), and every better-auth claim —
`enable`'s delete-and-recreate with `verified` carried over
(`two-factor/index.mjs:113-127`), `generate-backup-codes` touching only
`backupCodes` (`backup-codes/index.mjs:238-263`), `viewBackupCodes` being
`serverOnly` (`ibid:267-286`), and the `otpauth://…?secret=<base32>&issuer=…`
shape that the `_js` extraction depends on
(`@better-auth/utils/dist/otp.mjs:60-81`).

Six findings.

## Factual errors

### 1. D6's required-input counts are wrong for three sites: seven of eight are broken today, not five

> **Resolved (auto).** Confirmed: `modules/shared/profile/form_core.yaml:32-34,44-46`
> marks `profile.given_name` and `profile.family_name` `required: true`, and all three
> files compose it. D6's table now carries the corrected counts (2 / 2 / 3) with the
> `form_core` source named, and the framing is rewritten — **seven of eight broken
> today, `modal_global` the only dead guard**, with the two blank-name-accepting
> profile forms called out as the largest user-visible defect in the set. Verification
> step 8 (was 7) drops `modal_profile` ×2 from the temporarily-required list — clear a
> name field instead — leaving `modal_global` as the only site needing the trick, and
> the sibling-fixes scope paragraph's "three of them need a field temporarily marked
> required" is corrected to one.

D6's table (the "Required inputs today" column) gives `user-account/modal_profile`
**0**, `user-admin/modal_profile` **0**, and `invite_form` **1**. All three are
wrong, because all three compose `modules/shared/profile/form_core.yaml`
(`user-account/…/modal_profile.yaml:55`, `user-admin/…/modal_profile.yaml:52`,
`invite_form.yaml:39`), and `form_core` marks both name fields required:
`profile.given_name` (`form_core.yaml:32-34`) and `profile.family_name`
(`form_core.yaml:44-46`).

Corrected counts:

| Site                         | Design says | Actual                                       |
| ---------------------------- | ----------- | -------------------------------------------- |
| `user-account/modal_profile` | 0           | **2** — `profile.given_name`, `.family_name` |
| `user-admin/modal_profile`   | 0           | **2** — same, via `form_core`                |
| `invite_form`                | 1           | **3** — the two names + `roles`              |

Three consequences, in ascending order of how much they change the work:

- The design's framing — "The five with required inputs are broken now. The three
  with none are dead guards that will break silently the first time someone marks
  a field required" — is wrong in both halves. Seven of the eight are broken now;
  only `modal_global` is a dead guard (its only inputs come from
  `fields.user_attributes`, one non-required `TextArea` in the demo,
  `apps/demo/modules/user-admin/user_attributes_fields.yaml`).
- **Two live profile-edit forms currently accept a blank first or last name and
  save it** — one in each module, self-service and admin. That is a bigger
  user-visible defect than any of the five the design already counted, and it is
  the strongest single argument for the "all eight stay in this change" scope
  decision the design already made.
- Verification step 7 tells the implementer to temporarily mark a field required
  in `modal_profile` ×2 "since a passing form proves nothing there". Unnecessary
  for both — clear a name field and submit. Only `modal_global` needs the
  temporary-required trick.

Worth noting this is the third pass over the same table, and the same lesson:
the required-input set of these forms is not readable from the file that carries
the `Validate`. Fix the counts, drop `modal_profile` ×2 from step 7's
temporarily-required list, and reword the "three dead guards" sentence to one.

### 2. Phase `choose` renders with no title, because the title gates on `intent` and `choose` runs with `intent: null`

> **Resolved (auto).** Adopted as suggested: the title's `intent` gate gains
> **"Two-factor authentication"** as an explicit fallback branch, recorded in the Modal
> specification with the `Modal.js:73-76` pass-through reason. D3's `onOpen` bullet now
> says `intent: null` is safe for the _body_ gates only and points at the title. Note
> the timing caveat changed: finding 4's Back button returns the modal to
> `intent: null` deliberately, so the fallback is load-bearing rather than
> first-frame-only.

D3's `onOpen` bullet sets, for an already-enrolled caller, `phase: choose` with
`intent: null`, and justifies the null with "nothing gates on `intent == null`, so
this is safe — it is the `choose` buttons that write it."

Something does gate on it. The Modal specification says "Title gated on
`enroltotp.intent` (D4)" and enumerates exactly three cases: `enrol`, `replace`,
`codes_only`. `choose` matches none of them, so the one phase entered with
`intent: null` is the one phase with no title branch. `Modal.js` passes
`title: renderHtml({ html: properties.title, methods })`
(`blocks-antd/dist/blocks/Modal/Modal.js:73-76`) straight to antd, so a null title
renders the header empty — Manage opens on an unlabelled dialog offering two
consequential choices.

This is the same defect D3 already reasoned about one level up, and rejected
there: "no group gates on `null`, so a phase-less namespace renders an empty modal
body, and that state is observable" is why `phase` is never nulled. The identical
argument applies to `intent`, and the design waved it through.

**Fix:** give `choose` its own title as the fallback branch — "Two-factor
authentication" is the honest neutral label for a screen that has not yet chosen
between the two operations — and note in D3 that `intent: null` is safe for the
_body_ gates but not for the title, so the title needs a default rather than a
three-way `_if`. Note this only bites once the upstream ask lands and `choose` is
actually built; before then `onOpen` writes `intent: replace` and the title
resolves.

## Gaps in cases the design doesn't cover

### 3. Abandoning phase `scan` on a replacement is the design's one real lockout, and it is neither described nor verified

> **Resolved — and the fix is not the one suggested.** The lockout is confirmed in full:
> `enable` leaves `user.twoFactorEnabled` untouched
> (`two-factor/index.mjs:79-127`, the `skipVerificationOnEnable` branch is the only
> writer) and the sign-in hook gates the challenge on that flag alone, never on the
> row's `verified` (`ibid:193-199`). So a replacing user is enforced against an
> unscanned secret, with codes generated and never rendered. There is also no admin
> escape: `user-admin` reads `two_factor_enabled` for display and exposes no reset
> (`tile_security.yaml:206`). It is a database fix.
>
> The finding proposed better warning copy plus a verification step, i.e. accepting the
> lockout and describing it. **Rejected in favour of removing it.** Put to the author,
> who chose to turn 2FA off first: the replace branch now runs `TwoFactorDisable` then
> `TwoFactorEnable` on the same password in one click. Because `disable` deletes the row
> and clears the flag (`ibid:152-180`), the following `enable` writes `verified: false`
> and leaves the flag off until `TwoFactorVerify` flips both
> (`totp/index.mjs:157-175`) — so replacement becomes first-time enrolment and
> abandoning it leaves 2FA **off**: tile reads Off, password-only sign-in, set up again.
> Recoverable without support. D4 rewritten around this; D5's "no phase holds anything
> that cannot be reissued" is now true rather than aspirational, with a note recording
> that it holds only because of the disable-first chain.
>
> **What the trade buys and costs.** A deliberate, visible, self-recoverable
> no-second-factor window replaces an unrecoverable lockout. Separate work on
> required-2FA and admin reset (author, in flight) shrinks the residual further — an
> enrolment gate turns "silently off" into "pushed back into set-up" — but this branch
> depends on neither. Two mechanics verified so the chained call is not a guess:
> `disable` needs an authoritative session and rotates the session cookie
> (`ibid:163-178`) while `enable` takes plain `sessionMiddleware` (`ibid:53-56`), so the
> second call runs on the cookie the first set; and if `enable` fails anyway the account
> is 2FA-off with the branch's `catch` toast, retryable because `disable` against an
> already-disabled account still succeeds. Both client actions are already wrapped
> (`createAuthMethods.js:474-538`), so **no upstream ask**.
>
> **Both of the finding's "missing" items land, reshaped.** The warning `Alert` copy is
> now specified verbatim in D4, but about a gap rather than a lockout ("Two-factor is
> switched off while you set up the new one… if you stop partway, two-factor stays off
> and you can set it up again from here"). Verification gains **step 6**, which asserts
> the opposite of what the finding's step would have: after abandoning, sign-out and
> sign-in must ask for a password **only**, with no second-factor challenge.
>
> One consequence the finding didn't reach: the replace branch now changes
> `two_factor_enabled` at Generate, so `refetch_account` is added to that chain — a tile
> stale on **On** is the dangerous lie to someone who just abandoned a replacement. D4's
> written-once-`intent` argument covers the modal's own wording, and gains a second
> instance (the flag moves both directions now, depending on branch).

D5 closes with "no phase holds anything that cannot be reissued by starting over",
and D5's earlier defence of clearing `backup_codes` on `onClose` rests on "phase
`codes` is only reachable after the second factor is already working, so what is
lost is the fallback for a later lost device." Both hold for `enrol`. Neither
holds for `replace`, and the gap is on phase `scan`, not phase `codes`:

- `enable` deletes the old row and creates a new one with
  `verified: existingTwoFactor != null && existingTwoFactor.verified !== false`
  (`better-auth 1.6.23, dist/plugins/two-factor/index.mjs:113-127`), so for a
  previously-verified user the new row is verified immediately and
  `user.twoFactorEnabled` is never touched. 2FA is live and enforced at sign-in
  against a secret the user has not yet scanned.
- The replacement backup codes are stashed in `enroltotp.backup_codes` by the same
  `SetState`, but phase `codes` is downstream of `TwoFactorVerify`, so on this path
  they have **never been rendered**.
- `onClose` nulls them. So a user who is interrupted between Generate and Confirm
  holds a 2FA requirement, no authenticator that satisfies it, and no codes.

D4 does describe this hazard, but in the present tense about today's flow ("the
replacement backup codes were only ever shown in the modal they closed") — under
the new design they were never shown at all. Recovery exists, but only while the
current session survives: reopen Manage → Replace → Generate → scan → Confirm.
Past session expiry there is no recovery.

Two things are missing rather than wrong:

- **Copy.** The phase-`password` `Alert` for `intent: replace` is specified only as
  "the replacement warning `Alert`". The warning that matters is not "this rotates
  your secret" but "finish this in one sitting — until you scan the new code you
  can only recover while you stay signed in." Specify the copy in the design; it is
  the difference between a warning the user can act on and one they can't.
- **Verification.** Step 4 covers abandon-at-scan for first-time enrolment only,
  and says so explicitly ("the tile still reads **Off**"). Step 5 covers replacement
  happy-path only. The single most dangerous transition in the change has no step.
  Add one: with 2FA on, Manage → Replace → Generate → close; confirm the tile still
  reads **On**, the old authenticator no longer verifies, and reopening →
  Replace → complete recovers.

### 4. `choose` → `password` is one-way, and the red warning is only shown after it

> **Accepted as specified.** A secondary Back button is added to phase `password`,
> `visible` when `intent` is `replace` or `codes_only`, doing
> `SetState { phase: choose, intent: null, password: null }`. One button, and the
> warning becomes something the user can act on without losing the dialog. Recorded in
> the phase-`password` spec, in D5's "the X and Esc are the only way out" sentence, and
> in verification step 5. It ships with phase `choose`, so it is gated on the upstream
> ask along with it — nothing to go back _to_ before then. Its interaction with #2 is
> noted in both places: Back is what makes the title fallback load-bearing.

D4 deliberately keeps the `Alert` off the `choose` screen — "a red alert next to
'Get new backup codes' would make the harmless path look dangerous" — and puts
replacement's consequence there as a plain supporting line, with the `Alert` on
phase `password`.

That is the right call about where the alert goes, but it puts the real warning
one step _past_ the last point the user can change their mind. With `footer: false`
there is no Cancel and no Back, so a user who takes "Replace authenticator", lands
on phase `password`, reads the red alert and thinks better of it can only leave by
dismissing the whole dialog and starting over from the tile. Nothing is spent yet,
so this is not a data-loss bug — it just makes "offer the safe operation first"
weaker than it needs to be, on the one screen where the design is actively trying
to get the user to reconsider.

**Fix:** a secondary Back button on phase `password`, `visible` when `intent` is
`replace` or `codes_only` (i.e. when the caller arrived via `choose`), doing
`SetState { enroltotp.phase: choose, enroltotp.intent: null, enroltotp.password: null }`.
One button, one action, and it makes the warning something the user can act on
without losing the dialog. Note it interacts with #2 — with a Back the modal
returns to `intent: null`, so the title fallback is load-bearing rather than
first-frame-only.

### 5. Phase `codes`' lead line for `replace` doesn't tell the user their old backup codes are gone

> **Resolved (auto).** Correct — `enable` recreates the row with a fresh `backupCodes`
> array (`two-factor/index.mjs:119-127`), so `replace` needs both facts and can share
> neither branch. Phase `codes`' lead line becomes a three-row table gated on `intent`:
> `enrol` → "Two-factor is on."; `replace` → "Your new authenticator is active. These
> codes replace your previous set."; `codes_only` → "These replace your previous backup
> codes."

Phase `codes` is specified as two lines of lead copy gated on `intent`: "Two-factor
is on" for `enrol`/`replace`, "These replace your previous backup codes" for
`codes_only`.

`replace` is on the wrong side of that split. `enable` recreates the `twoFactor`
row with a fresh `backupCodes` array (`two-factor/index.mjs:119-127`), so a
replacing user's previous codes are dead too — the second sentence is as true for
`replace` as for `codes_only`. And the first sentence is actively misleading for
them: "Two-factor is on" reads as first-time-enrolment confirmation to someone for
whom it was already on before they opened the dialog.

**Fix:** three lines rather than two — `enrol` keeps "Two-factor is on";
`codes_only` keeps "These replace your previous backup codes"; `replace` gets both
facts ("Your new authenticator is active. These codes replace your previous set.").
The design already gates this line on `intent`, so the cost is one more branch.

## Scope consistency

### 6. The sibling `onClose` resets aren't enumerated, and one of their leaves is a boolean

> **Resolved (auto).** Both halves confirmed in the files —
> `changepw.revoke_other_sessions` is a `CheckboxSwitch` (`modal_changepw.yaml:55-66`)
> feeding `revokeOtherSessions` (`ibid:31-33`) with no `onOpen` reset anywhere in that
> modal, and `modal_disable2fa`'s `onOpen` is `SetState: { disable2fa: {} }`
> (`modal_disable2fa.yaml:15-19`). The sibling-fixes subsection now tabulates the reset
> leaves per file and per event, the way D6 tabulates `Validate` params:
> `changepw.current_password: null`, `changepw.new_password: null`,
> `changepw.revoke_other_sessions: **false**`; `disable2fa.password: null` on both
> `onOpen` and `onClose`, converting the `{}` form. Files changed updated to name the
> `onOpen` rewrite.

The sibling-fixes subsection says `modal_changepw` and `modal_disable2fa` "both get
an `onClose` clear with explicit leaf nulls", and leaves it there. Two problems with
stopping at the rule:

- `modal_changepw`'s third input is `changepw.revoke_other_sessions`, a
  `CheckboxSwitch` (`modal_changepw.yaml:55-66`). D3's own rule is "reset a boolean
  to `false` rather than `null`, its boolean zero" — so a literal reading of "explicit
  leaf nulls" produces exactly the wrong reset for one of the three leaves, and it
  would flow into the `ChangePassword` payload's `revokeOtherSessions` on the next
  open (`modal_changepw.yaml:31-33`), since that modal has no `onOpen` reset either.
- `modal_disable2fa`'s existing `onOpen` is `SetState: { disable2fa: {} }`
  (`modal_disable2fa.yaml:15-19`) — the exact shape the new `CLAUDE.md` rule
  forbids, left in place in a file this change already opens. It happens to work
  (the input is always visible, which the design correctly notes), but shipping the
  rule and leaving a counter-example in one of the two files the rule's own design
  touches is the same inconsistency the D6 scope argument rejected.

**Fix:** tabulate the reset leaves per file the way D6 tabulates `Validate` params —
`changepw.current_password: null`, `changepw.new_password: null`,
`changepw.revoke_other_sessions: false`; `disable2fa.password: null` — and convert
`modal_disable2fa`'s `onOpen` to the same leaf form. The per-file table is the
lesson review 1 already paid for twice; a reset set with a boolean in it is the
same shape of trap one section later.
