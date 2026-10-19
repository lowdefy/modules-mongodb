# Review 1

### 1. The `Validate` rationale is wrong: container-scoped `Validate` validates nothing, here or in five sibling modals

> **Resolved.** Confirmed the mechanism end to end (exact-id matcher in
> `getBlockMatcher.js:47-49`; each block matches its own `blockId` in
> `Block.js:372-383`; container `required` defaults `false` at `Block.js:444`), and that
> none of the seven blocks carries a custom `validate:` array, so `required: true` is the
> only validation any would run. The wrong rationale is replaced by a new **D6**, which
> carries the mechanism, a table of all seven sites with their required-input counts, and
> the F22(b) second-cause note. F22(b)'s Cause column updated.
>
> **Scope:** all seven sites are fixed in this change, including the four in `user-admin`.
> **Mechanism:** the six single-phase forms take the namespace regex (`regex: ^changepw\.`
> etc.) rather than explicit id lists, because input block ids are their state paths, so
> the regex keeps matching when a field is added later — an explicit list is the opt-in
> correctness that produced these seven. `modal_enroltotp` is the exception and names its
> fields, since `enroltotp.*` spans three phases and `^enroltotp\.` would only pass by
> accident of which blocks are hidden. Sibling-fixes subsection and Files changed extended;
> verification step 6 added, including the note that the three sites with no required
> inputs need a field marked required temporarily to prove anything.
>
> **Re-resolved (second pass).** The first resolution took the "namespace regex" rule and
> derived each site's regex from its container id, which reproduced the very mistake the
> finding is about. Reading the actual input ids: `modal_global`'s inputs are
> `user_attributes.*` (not `global.*`) and `modal_access`'s required input is a bare
> `roles` (no namespace at all), so `^global\.` and `^access\.` would have matched zero
> blocks — a silent no-op swapped for a different silent no-op. `invite_form` spans three
> namespaces (`profile.*`, `roles`, `member_attributes.*`). D6 and the sibling-fixes
> subsection now carry a per-file table of input ids → `params`, plus two verified
> `getBlockMatcher` mechanics that make it workable: `regex` takes an array of patterns,
> and `regex` + `blockIds` may be combined in one params object
> (`getBlockMatcher.js:38-58`). Also recorded that three of these forms take their inputs
> from consumer-supplied `fields.*` module vars whose manifest mandates the prefix
> (`user-admin/module.lowdefy.yaml:88-105`) — which is a stronger argument for the regex
> than the original one, since no list authored here could enumerate those inputs at all.
> Counts corrected throughout: eight sites (seven Modal ids, one `Box`), five broken today
> rather than four. The "one line each" scope claim is withdrawn — it is a per-file read.
>
> **Scope confirmed by the author:** all eight stay in this change, `user-admin` included.
> Splitting the four `user-admin` sites out was weighed — different module, and three need a
> field temporarily marked required to prove the fix — and rejected because the per-file
> table is now written down, and two of those four (`modal_access`, `invite_form`) have a
> live required-field guard that does nothing today. The design records that reasoning in
> place of the earlier "strike this subsection" escape hatch.

Phase `scan` (design line 206, 213-214) says:

> `Validate` is scoped to the one field rather than the whole modal. Container-wide
> validation happens to work today only because the engine skips invisible blocks;
> naming the field states the intent instead of relying on that.

Container-wide validation does not work today, and invisible blocks are not why.
`Validate`'s params go through `getBlockMatcher`, which turns a string into
`blockIds: [<string>]` and returns an **exact-id** matcher
(`@lowdefy/engine/dist/getBlockMatcher.js:47-49`). `Slots.getValidateRec`
(`Slots.js:119-126`) walks every block and calls `block.getValidate(match)`, which
bails on `if (!match(this.blockId)) return null` (`Block.js:372-383`) — the match is
against each block's **own** id, never an ancestor's. There is no cascade. The
Lowdefy docs for the action say the same thing: "Only the matched blocks will be
validated."

So `params: modal_enroltotp` (`modal_enroltotp.yaml:30`) matches exactly one block —
the Modal container itself — which has `required` defaulted to `false`
(`Block.js:444`) and no `validate` entries, so `validateEval` builds an empty test
list (`Block.js:289`) and returns zero errors. `validate_totp` is a **no-op**. That
is also the missing half of F22(b)'s Cause column (design line 43): `okText` explains
why the button _renders_ in phase 1; the no-op `Validate` is why clicking it reaches
`TwoFactorVerify` with an empty code instead of being blocked.

The design's chosen fix — `Validate: enroltotp.confirmation_code` — is correct, since
it names an input id. Only the rationale needs replacing. But the same mistake is
live in five more places, all silently validating nothing:

- `modules/user-account/components/view/modal_changepw.yaml:20` — `params: modal_changepw`
- `modules/user-account/components/view/modal_disable2fa.yaml:23` — `params: modal_disable2fa`
- `modules/user-account/components/view/modal_profile.yaml:32` — `params: modal_profile`
- `modules/user-admin/components/view/modal_profile.yaml:26`, `modal_global.yaml:22`, `modal_access.yaml:27`
- `modules/user-admin/components/invite_form.yaml:147` — `params: state_form`, a `Box` (`invite_form.yaml:10-11`)

The repo already has the correct idioms elsewhere: `regex: ^task_modal\.`
(`activities/components/task-modal.yaml:125`), `regex: ^form\.`
(`deals/components/detail/deal_outcome_modal.yaml:68`), and the explicit input id
(`events/components/note-capture.yaml:79`). For a namespace-wide validate,
`regex: ^enroltotp\.` is the one that actually matches a group.

**Decide:** does this design carry the sibling fix (the addendum already reaches into
`modal_changepw` / `modal_disable2fa` for the same "same defect class, three lines
each" reason), or does the no-op `Validate` become its own change with the
`user-admin` sites? Either way the D2/phase-`scan` rationale needs correcting, and
this is a better candidate for the "repo idiom the next author can find" than D3's
rule — an author reading `params: <modalId>` in six places has no reason to suspect
it does nothing.

### 2. Phase `codes`: `maskClosable: false` closes one accident and leaves two

> **Resolved.** The X/Esc/mask routing to `onClose` is confirmed as described. D5 is
> rewritten to enumerate all three exits, adopt `closable: { _ne: [phase, 'codes'] }`,
> and state that Esc is unblockable (`keyboard` absent from the Modal property schema).
> Phase `codes`' Done button now also gates on a new `enroltotp.codes_saved`
> `CheckboxSwitch` — chosen over gating on the Copy click, since Copy is the only save
> affordance while screenshot / password-manager / paper are legitimate, and mandating a
> clipboard write forces a one-time secret onto a cross-device clipboard for no
> evidence of saving. New leaf added to the state table and D3's reset list (to `false`);
> `closable` added to the modal spec; verification step 1 extended.
>
> **Partly rejected:** the finding's "for a re-enrolling user that is a lockout" does not
> hold — phase `codes` is only reachable after `TwoFactorVerify` succeeded, so the new
> authenticator already works; the loss is the later-lost-device fallback, and re-enrolling
> issues fresh codes. Its suggested move of the `backup_codes` clear off `onClose` is also
> rejected: it buys no recovery (reopening runs `onOpen`, which resets) and only leaves a
> one-time secret in client state. Both points are now stated in D5, along with the
> intended consequence that the X and Esc are the only exits in phases 1 and 2.
>
> **Re-resolved (second pass): the `closable` gate is dropped.** The `CheckboxSwitch` gate
> stays — it is an attention device (it makes someone in dismiss-the-dialog mode read one
> sentence), and that is worth one tick. Suppressing the X is not, for three reasons now
> recorded in D5: Esc is unblockable so the hole stays open either way; a modal whose chrome
> changes between phases costs comprehension on every enrolment, against a misclick risk on
> the one button the user means to press; and the loss it guards shrinks once D4's
> `codes_only` branch exists. `closable` is left at its default `true` in every phase, so
> exits are now uniform. Verification step 1 no longer checks for a missing X.

D5 (design lines 170-172) adds `maskClosable: false` because "an outside click should
not discard a one-time secret mid-enrolment", then: "The X and the phase-3 Done button
remain, so nobody is trapped — this closes an accident, not an exit."

The X **is** the accident, and so is Esc. Both route to the same place as the mask
click: antd's Modal passes `onClose: handleCancel` to rc-dialog
(`antd/lib/modal/Modal.js:221`), rc-dialog's Esc handler calls it
(`@rc-component/dialog/lib/DialogWrap.js:38-49`, `keyboard = true` by default), and
`handleCancel` invokes the block's `onCancel`
(`blocks-antd/dist/blocks/Modal/Modal.js:106-118`), which fires the Lowdefy `onClose`
event — the site D3 puts the full clear on. One stray Esc or one click on the X
permanently destroys backup codes that are never re-fetched. For a re-enrolling user
that is a lockout, since `enable` already deleted the previous row's codes along with
its secret.

Esc cannot be blocked: `keyboard` is not in the Modal block's property schema and
`Modal.js` never passes it, so rc-dialog's default stands. The X can be:
`closable` is a real property (default `true`) and block properties accept operators
(e.g. `user-admin/pages/all.yaml:326`), so `closable: { _ne: [_state: enroltotp.phase, 'codes'] }`
makes Done the only closer in phase 3 — `workflows/components/check-action-modal.yaml:64`
already sets `closable: false` statically.

**Decide** what actually protects the codes. `closable` gated on phase closes the X
hole; Esc remains, which argues for moving the `backup_codes` clear off `onClose`
(D3's hygiene case for clearing them there is weak — they are already rendered on the
user's own page, and `onOpen` already clears stale ones before a new enrolment). Note
also that `footer: false` removes today's Cancel button, so in phases 1 and 2 the X
becomes the only way out; if that's intended, say so, because it's the same X the
codes phase wants to suppress.

### 3. The modal title flips mid-flow, because phase `scan` re-fetches the request the title gates on

> **Resolved.** Confirmed — `refetch_account.yaml:6-11` re-runs `get_account`, so a
> first-time enrolment turns `two_factor_enabled` true while phase `codes` is on screen.
> Adopted the suggested fix: `onOpen` snapshots `enroltotp.replacing` from the flag, and
> the title, warning `Alert` and button label all gate on that leaf. Added to the state
> table, D3's reset list and the `onOpen` bullet; D4 now carries the rationale and records
> the rejected alternative (moving `refetch_account` onto Done, which would leave the tile
> stale while the user reads the codes and hide a refetch failure behind a close).
>
> **Re-resolved (second pass): `replacing` becomes `intent`.** The snapshot-not-live-read
> reasoning is unchanged and still correct, but a boolean cannot carry it any more. D4 now
> has three intents (`enrol` / `codes_only` / `replace`), and `enrol` and `codes_only` are
> both "not replacing" while running different actions, so the leaf holds an enum written
> once — by `onOpen` for a first-time enrolment, by the phase-`choose` button otherwise.
> State table, D3's reset list and every wording gate updated.

The Modal spec (design line 178) gates the title on `two_factor_enabled`, and D4
(lines 153-156) gates the phase-1 warning and button label on
`get_account.0.two_factor_enabled`. Phase `scan`'s chain (lines 205-210) ends with
`refetch_account.yaml`, which re-runs `get_account`
(`modules/user-account/actions/refetch_account.yaml:6-11`) — the design says so
explicitly: "the tile flips to On behind the modal".

So the instant a first-time enrolment advances to phase `codes`, `two_factor_enabled`
becomes `true` and the still-open modal retitles itself to the replace-an-authenticator
variant while showing the codes for the enrolment that just succeeded.

**Fix:** snapshot the decision instead of reading it live — have `onOpen` write
`enroltotp.replacing: <get_account.0.two_factor_enabled>` alongside `phase: password`,
and gate the title, the warning `Alert`, and the button label on that leaf. It adds one
leaf to D3's null list and makes the whole modal immune to a mid-flow refetch, which is
the same class of coupling D1 and D2 are already removing.

### 4. The manual-entry key is a `disabled` input, so the "Can't scan?" fallback isn't copyable

> **Resolved.** Confirmed: `TextInput`'s schema exposes only `disabled`, no read-only
> equivalent. Adopted the suggested `Paragraph` with `copyable: true` and `code: true`
> (monospace, so a transcribed key is legible), and recorded that `enroltotp.uri` thereby
> stops being a block id.
>
> **Extended beyond the finding:** the same field also shows the wrong value. It renders
> `totpURI`, which `createOTP(secret, …).url(…)` builds as a full
> `otpauth://totp/{issuer}:{email}?secret=…` (`better-auth/dist/plugins/two-factor/index.mjs:129-132`),
> while an authenticator app's manual-entry field wants the base32 secret. The `Paragraph`
> content now extracts the `secret` param via `_js`; the `QRCode` keeps the full URI.
> D2's phase-inference rationale was rewritten, since it had rested on `enroltotp.uri`
> being an input whose state the engine deletes on hide — no longer true. Verification
> step 1 now checks the key copies and is a bare secret.

The state table (design line 186) calls `enroltotp.uri` "QR value + **the copyable
manual-entry key**", and phase `scan` carries the row forward "unchanged" (line 202).
Unchanged means `modal_enroltotp.yaml:155-164`: a `TextInput` with `disabled: true`.
Text inside a disabled input cannot be selected in Chromium (Firefox allows it), so on
most browsers the only fallback for a user who can't scan the QR is to retype a base32
secret out of greyed-out low-contrast text. There is no `readOnly` on the Lowdefy
`TextInput` — the schema exposes `disabled` and nothing else in that family — so
swapping the prop is not an option.

Given F21's whole point is "the copy affordance shouldn't cost the user the secret",
this is the same defect one field over. **Fix:** render the key as a `Paragraph` with
`code: true` and `copyable: true` (`blocks-antd/dist/blocks/Paragraph/meta.js:32-45`),
content `_state: enroltotp.uri`. Bonus: `Paragraph` is not an input, so `enroltotp.uri`
stops being a block id — it becomes plain SetState-written state that the engine never
deletes on hide and that needs no D3 leaf-null reasoning at all.

### 5. Phase `password` has no `Validate`

> **Resolved.** `Validate enroltotp.password` added ahead of `TwoFactorEnable` in the
> phase-`password` chain, with the reason recorded beside it: without it an empty field
> returns as the catch-all `catch` toast, which tells the user their password is wrong
> when they left it blank and marks no field. Noted that today's body button has the same
> gap, so this is a gap closed rather than a regression fixed.

Phase `scan` gains `Validate enroltotp.confirmation_code` (design line 206), but phase
`password`'s chain (lines 197-200) goes straight to `TwoFactorEnable` even though
`enroltotp.password` is `required: true`. An empty password therefore round-trips to
BetterAuth and comes back as the catch-all toast "Couldn't start two-factor setup.
Check your password and try again." — a server error standing in for a client-side
required check, with no field-level error marker on the input.

Today's behaviour is the same (the body button has never had a `Validate`), so this
isn't a regression — but a design whose stated goal is "exactly one primary action per
phase, and it does the right thing" should not leave one of the two phases unguarded.
Add `Validate: enroltotp.password` ahead of `TwoFactorEnable`.

### 6. Nulling `phase` on close leaves the modal with no visible phase on reopen

> **Resolved (auto).** Confirmed against `blocks-antd/dist/blocks/Modal/Modal.js:20-32` —
> `triggerSetOpen` fires `onOpen` unawaited and calls `setOpen` synchronously, so the
> dialog paints before the reset resolves. D3 now states that `phase` is the one leaf
> always set to `password` and never nulled, with the reason, and the `onClose` bullet
> reflects it. Self-consistency fix within D3: no group gates on `null`, so nulling the
> gate contradicted D2.

D3 (line 120) lists `enroltotp.phase` among the leaves every reset nulls, including the
`onClose` "full clear" (line 131). Because D2 makes every group gate on an exact phase
value (`_eq: [_state: enroltotp.phase, '<name>']`, line 94), `phase: null` matches no
group — the modal's body is empty.

That state is observable on the next open. `triggerSetOpen` fires the `onOpen` event
without awaiting it and then calls `setOpen(state)` synchronously
(`blocks-antd/dist/blocks/Modal/Modal.js:20-32`), so the dialog mounts and renders at
least once before `onOpen`'s `SetState` resolves and `context.update()` re-renders. The
first frame of every open is a modal with a title and nothing in it. The open animation
may mask it, but it's a real gap and it costs nothing to remove: have `onClose` set
`phase: password` rather than `null`, so the namespace is never in a phase-less state.
`onOpen` still sets it for belt-and-braces.

### 7. D3's "repo idiom" has no home

> **Resolved.** Correct, and the same gap applied to D6's rule. Both are now written
> into `CLAUDE.md`'s **Lowdefy Project Rules** — "Resets set explicit leaf nulls,
> never `{}`" and "Scope `Validate` to input ids, never a container id" — and
> `CLAUDE.md` is listed under Files changed with the reason `docs/` is the wrong home
> (an author writing a reset in an unrelated module never opens
> `docs/user-account/`).

D3 closes (lines 122-123) with: "This is a general Lowdefy rule (an empty-object reset
only works for inputs that were visible), and it is worth stating as a repo idiom the
next author can find." Files changed (lines 223-237) then lists only
`docs/user-account/concepts/auth-methods.md`, whose subsection is scoped to
consumer-observable enrolment behaviour — an author writing a `SetState` reset in some
other module will never look there.

Per `CLAUDE.md`, `docs/` is for consumer-observable module behaviour and repo authoring
conventions live in the **Lowdefy Project Rules** section of `CLAUDE.md` — that's where
a rule like "resets enumerate explicit leaf nulls, never `{}`" belongs, next to the
existing entries on change stamps and input-block state paths. Either add that line to
the Files-changed list or drop the sentence; as written it's an intention with no
delivery. (If #1 lands here too, the same section is the home for the `Validate`
scoping rule.)

### 8. The "backup codes can only come from `enable`" premise is false, and it is what makes Manage dangerous

> **Resolved.** Raised during the second-pass resolution rather than by the review, and it
> reshaped D4. `POST /two-factor/generate-backup-codes` exists, is password-gated, requires
> `twoFactorEnabled`, and updates **only** the `backupCodes` field on the existing
> `twoFactor` row — secret, `verified` and `user.twoFactorEnabled` untouched (better-auth
> 1.6.23, `dist/plugins/two-factor/backup-codes/index.mjs:212-265`). The two-factor client
> plugin registers the path, so the client method exists; the gap is that
> `@lowdefy/client` wraps only `enable` / `verify` / `disable`
> (`createAuthMethods.js:516-538`) and `getActionMethods` has no matching entry.
>
> D4 was rewritten around it. "Manage" now opens on a **choice** — _get new backup codes_
> (safe) or _replace authenticator_ (destructive, warned) — because the two reasons a user
> opens it are neither equally dangerous nor equally common, and routing the common one
> through the destructive one was the actual defect. The warning and title change now
> belong to `intent: replace` alone. Phase `codes` is reused verbatim for both, so the new
> branch costs one phase, one button, one action call.
>
> `upstream-asks.md` (new, ask 1) carries the platform request. **Sequencing:** everything
> except the `codes_only` branch ships without it; until it lands, an already-enrolled
> caller goes straight to `phase: password` with `intent: replace`, which is the warned flow
> the design already specified.
>
> **Rejected:** a stopgap plugin action hand-rolling `fetch` against the auth route. It
> would duplicate `unwrap`, `basePath` resolution and error mapping outside the client that
> owns them — `getActionMethods` exposes no auth client to a custom action, so there is
> nothing to reuse — and would be deleted when the real action lands. Recorded under
> Non-goals with the reason.
>
> **Also noted, deferred:** there is no remaining-codes count anywhere, which is the other
> half of why users reach zero unaware. `viewBackupCodes` is `serverOnly` and returns the
> codes rather than a count, so a count needs its own server-side endpoint — logged as a
> Non-goal, worth having once `codes_only` gives the tile somewhere to send the user.

Raised by the user during resolution: _"is it a critical flaw if users can't generate?"_

The design's Non-goals asserted that BetterAuth rotates codes only through `enable`, and
that a codes-only refresh "would need its own flow". The first half is wrong. The practical
situation was described correctly — within Lowdefy today, fresh codes really do require
re-running `TwoFactorEnable`, which rotates the secret and forces a re-scan — but the stated
cause was the platform's capability rather than Lowdefy's wiring, and that difference
matters: it is the difference between "cannot be fixed here" and "one small upstream ask".

Not critical in the sense of a lockout — a user in this position still holds a working
authenticator. The real cost is structural: **the routine operation was only reachable
through the destructive one.** Backup codes are consumed one per use with no
remaining-count surface, so a user reaches zero silently and then has to risk their second
factor to recover. Separating recovery-code rotation from second-factor re-enrolment is the
near-universal pattern (GitHub, Google, Microsoft all expose it as its own operation) for
exactly that reason.
