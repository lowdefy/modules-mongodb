# 2FA enrolment modal

Self-service TOTP enrolment currently spans two chained modals — `modal_enroltotp`
(a two-phase password → QR body) and `modal_backupcodes` — and both are confusing
in ways that can cost a user their access. This design collapses the flow into a
single modal with explicit phases and no native footer, so exactly one primary
action is offered at a time and the one-time backup codes can be copied without
dismissing anything. It also fixes a credential that lingers in client state, and
stops the routine maintenance operation — "I need new backup codes" — from being
reachable only through the one that destroys the user's authenticator.

Resolves **F21 (remainder)** and **F22 (a/b/c)** from
[`../04-planning/findings.md`](../04-planning/findings.md), plus a rotation hazard
found while verifying them.

One branch of D4 depends on a new platform action — see
[`upstream-asks.md`](upstream-asks.md). Everything else ships without it.

## Proposed change

- Collapse the flow into **one modal, phases gated on an explicit
  `enroltotp.phase` value** — password → scan/confirm → backup codes, plus a
  `choose` phase for an already-enrolled caller; delete `modal_backupcodes.yaml`.
- Drop the native footer (`footer: false`); each phase carries its **own body
  buttons**, so no action is ever offered before its phase and nothing auto-closes.
- **Copy no longer dismisses**: the codes phase has a Copy button that keeps the
  modal open, and a Done button whose `disabled` clears only once an "I've saved my
  backup codes" checkbox is ticked (D5).
- **Offer the safe operation first.** "Manage" opens on a choice — _get new backup
  codes_ (leaves the authenticator alone) or _replace authenticator_ (warns, then
  turns 2FA **off** before re-enrolling, so abandoning it leaves a visible gap rather
  than a lockout). Today it can only mean the second, unwarned (D4).
- **Clear the account password** the moment it is spent, and clear the whole
  `enroltotp` namespace on close, using **explicit leaf nulls** (an empty object does
  not clear an input — see D3). The phase is seeded by the **trigger**, before the
  dialog mounts, so no open ever paints a body with no phase set.
- Add `layout: { gap: 16 }` and `maskClosable: false` to the modal.

## Current state

`modules/user-account/components/view/modal_enroltotp.yaml` and
`modules/user-account/components/view/modal_backupcodes.yaml`, both mounted on
`modules/user-account/pages/view.yaml:87-88`, opened from `tile_security.yaml:189`
(`Manage` / `Set up`) and from the enrol modal's `onOk` respectively.

| #      | Defect                                                                                   | Cause                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F21    | Copy dismisses the codes modal                                                           | Copy is `cancelText`, and `CopyToClipboard` is wired to `onClose`                                                                                                     |
| F22(a) | Password field sits flush against the Generate button                                    | No `layout.gap` on the modal, no margins                                                                                                                              |
| F22(b) | "Confirm & enable" shows in phase 1 and fires `TwoFactorVerify` with an empty code       | Two causes: it is the Modal's static `okText`, so it renders in both phases; and the `Validate` guarding it is a no-op (see phase `scan`)                             |
| F22(c) | The account password survives close/reopen                                               | `SetState: { enroltotp: {} }` cannot clear an input that was invisible last cycle (D3); no `onClose` reset at all                                                     |
| new    | "Manage" silently destroys a working authenticator, and abandoning it locks the user out | BetterAuth's `enable` rotates the secret while leaving `twoFactorEnabled` on, and it is the only action wired, so wanting new codes costs you your authenticator (D4) |

Two things the findings asked to re-confirm are settled without a live run:

- **`onOpen` does fire on `toggleOpen`.** `blocks-antd/dist/blocks/Modal/Modal.js:20-45`
  triggers `onOpen` when the toggle opens and `onClose` on every close path
  (footer Cancel, the X, and mask-click all route through antd's `onCancel`). The
  F22(c) reset failure is not a missing event. It fires _after_ the dialog paints,
  though, which is why the seed ends up on the trigger rather than on `onOpen` (D3);
  `onClose` is unaffected by that ordering and carries the whole clear.
- **The backup-codes state path is correct.** The client's `unwrap()` returns
  BetterAuth's `data` directly
  (`@lowdefy/client/dist/auth/createAuthMethods.js:99-108`), so
  `_actions.enroltotp_enable.response.backupCodes` is the right shape. A live
  check that the codes render is still listed under Verification.

## Key decisions and rationale

### D1. One modal owning every phase — not two modals

The backup codes are shown once and never re-fetched, so they must not depend on
state written by one modal and read by another. That chain is what makes today's
flow fragile: `modal_enroltotp`'s `onOk` opens `modal_backupcodes` and _then_ the
enrol modal closes, so the moment we add the F22(c) `onClose` cleanup, it blanks
the codes while they are on screen. Folding the codes in as phase `codes` removes the
boundary entirely — one namespace, one owner, one cleanup site.

One deliberate exception to "one owner": the initial `phase`/`intent` seed is written
by the **trigger button**, not by the modal, because it has to land before the dialog
mounts (D3). The modal still owns every subsequent write and the single `onClose`
clear, and the tile is already the block that reads the caller's enrolment state for
its own label. The boundary that D1 exists to remove is the one the _codes_ would
have to cross; a seed written one instant before the modal opens crosses nothing.

A third option, splitting the password and scan steps into two chained modals so
each could use a native footer Ok, was rejected for the same reason in reverse: it
would make `enroltotp.uri` cross a modal boundary and have to survive the first
modal's close, reintroducing exactly the coupling that bit the codes.

### D2. No native footer; phase state is explicit

The Modal's footer Ok **auto-closes on success** (`Modal.js:93-105`), which is
correct for a single-action dialog and wrong for a multi-step one — phase `password`'s
Generate must not close, and phase `scan`'s Confirm must advance rather than exit. With
`footer: false` (`Modal.js:51-53`) each phase owns its buttons and the modal closes
only when we say so. Nothing is lost: a Lowdefy `Button` already disables itself
and shows a spinner while its `onClick` chain runs (`Button.js:76,81`), which is
what `confirmLoading` provided, and hold-open-on-failure is moot when the modal
never closes by itself. `workflows/components/check-action-modal.yaml:62` is the
existing precedent for `footer: false`.

This runs against `workflows/components/universal-fields/universal-fields-modal.yaml`,
which deliberately moved _from_ `footer: false` + a body button _to_ the native
footer Ok. That decision stands where it is — a single-action modal with one
completing write, where automatic close-on-success is a feature. It does not
generalize to a phased dialog whose middle step must stay open.

**Phase is a value, not an inference.** Each group gates on
`_eq: [_state: enroltotp.phase, '<name>']`, with `phase` set explicitly to one of
`choose`, `password`, `scan`, `codes`. Today's flow infers its two phases from data
presence (`uri == null`), which cannot extend past two: `uri` and `backup_codes`
are both written by the same `TwoFactorEnable` and are both set in phase `scan`
_and_ phase `codes`, so no presence check distinguishes them. Any derivation would
need a compound test that re-encodes the phase anyway, less legibly. D4's `choose`
phase makes the point twice over — it is entered before any data exists at all, so
there is nothing to infer it from.

Inferring from an **input's** state is worse still, and rules out
`confirmation_code` as a gate: the engine deletes the state field of an invisible
input (`Slots.updateState` via `Block.js:350-352`), so a field's presence flips back
to absent the moment its own group hides — a gate that unsets itself by being
obeyed. An explicit phase value is mutually exclusive by construction and immune to
that interaction.

### D3. Resets set explicit leaf nulls, never `{}`

F22(c)'s "the reset isn't taking effect" has a precise cause in the engine, and it
determines the shape of every reset in this modal.

`SetState` writes each param key then calls `RootSlots.reset()` with no state
argument (`engine/dist/actions/createSetState.js:16-24`). In `Block.reset`, an
input whose state field is now undefined **and which was invisible in the previous
eval cycle** has its in-memory value deliberately restored
(`engine/dist/Block.js:168-196`); `evaluate` then overrides `this.value` from state
only when the state value is _defined_ (`Block.js:238-239`). So:

- `SetState: { enroltotp: {} }` leaves `enroltotp.password` **undefined** → the
  password input, invisible during phase `scan`, has its remembered value restored and
  republished on the next update. The field repopulates itself.
- `SetState: { enroltotp.password: null }` leaves it **defined** → `evaluate` takes
  `null` and the input clears.

Every reset therefore enumerates leaves explicitly: `enroltotp.phase`, `.intent`,
`.password`, `.uri`, `.confirmation_code`, `.backup_codes`, `.codes_saved` and
`.twofa_off` (the last two to `false`, their boolean zero, rather than `null`). This
is a general Lowdefy rule (an empty-object reset only works for inputs that were
visible), and it is stated as a repo idiom in `CLAUDE.md` — see Files changed.

**The seed runs before the modal mounts, so it cannot live on `onOpen`.**
`triggerSetOpen` fires `onOpen` without awaiting it and then calls `setOpen`
synchronously (`blocks-antd/dist/blocks/Modal/Modal.js:20-32`), so the dialog mounts
and paints at least once before an `onOpen` `SetState` resolves. No group gates on
`null`, so a phase-less namespace renders an empty modal body — and on the first open
of a session that is exactly what an `onOpen` seed would produce, because nothing else
writes `enroltotp.*` at all (`view.yaml:34-35` mounts only `refetch_account`). The
one flow every user hits exactly once would be the one that got the empty frame.

So the seed moves onto the **trigger**, ahead of the mount, and the modal has no
`onOpen` event at all. Two reset sites remain:

- **`tile_security.yaml`'s `twofa_manage_btn` `onClick`** — one `SetState` writing
  `phase` and `intent` together from the caller's enrolment state (D4), plus every
  other leaf, then `CallMethod toggleOpen`. 2FA off → `phase: password`,
  `intent: enrol`; 2FA on → `phase: choose`, `intent: null` (no _body_ group gates on
  `intent == null`, so this is safe — it is the `choose` buttons that write it; the
  **title** does need an explicit fallback for it, see the Modal specification). The
  state is written before the dialog exists, so there is no empty first frame and no
  wrong-screen flash on any open. This is the one place
  `get_account.0.two_factor_enabled` is read, and the button already reads it for its
  own Manage/Set-up label (`tile_security.yaml:174-186`):

  ```
  SetState  phase: <_if two_factor_enabled then choose else password>,
            intent: <_if two_factor_enabled then null else enrol>,
            password: null, uri: null, confirmation_code: null,
            backup_codes: null, codes_saved: false, twofa_off: false
  CallMethod  blockId: modal_enroltotp, method: toggleOpen
  ```

  Before the upstream ask lands, the `choose` arm reads `phase: password` with
  `intent: replace` instead (see D4's Sequencing) — the warned single-option flow.

- **`onClose`** — nulls **every** leaf, `phase` and `intent` included, so no
  credential and no one-time codes sit in client state after dismissal. Nulling
  `phase` is safe precisely because the trigger is the only way back in: the sole
  references to `modal_enroltotp` outside its own file are the page's `_ref`
  (`view.yaml:87`) and that button (`tile_security.yaml:192`). There is no
  placeholder phase to justify, because there is no path that reaches a mounted modal
  without a seed in front of it:

  ```
  SetState  phase: null, intent: null, password: null, uri: null,
            confirmation_code: null, backup_codes: null,
            codes_saved: false, twofa_off: false
  ```

Plus one mid-chain clear that is not a reset: **after the enable/generate call
succeeds**, `password: null` in the same `SetState` that stashes the URI and codes
(and, on the replace branch's failure path, in the catch — see the Modal
specification). The credential is spent at that point; there is no reason for it to
outlive the request.

### D4. "Manage" offers the safe operation first; replacement turns 2FA off before re-enrolling

BetterAuth's `POST /two-factor/enable` deletes the caller's existing `twoFactor`
row and creates a new one with a fresh secret, carrying `verified: true` over when
the previous row was verified, and **never touches `user.twoFactorEnabled`** unless
`skipVerificationOnEnable` is set (better-auth 1.6.23,
`dist/plugins/two-factor/index.mjs:79-127`). The sign-in hook gates the second-factor
challenge on `user.twoFactorEnabled` alone, not on the row's `verified`
(`ibid:193-199`). For a user who already has 2FA on, a bare **Manage** → password →
**Generate** therefore leaves 2FA switched **on** and enforced against a secret the
user has not yet scanned. Abandon the modal there and they are locked out at the next
sign-in: their app's codes no longer verify, the replacement backup codes were
generated but — with phase `codes` sitting behind `TwoFactorVerify` — never rendered,
and `user-admin` has no 2FA reset (it only displays the flag,
`user-admin/components/view/tile_security.yaml:206`). That is a database fix.

**So replacement turns 2FA off first.** The replace branch runs
`TwoFactorDisable` then `TwoFactorEnable` on the same password, in one click. Because
`disable` deletes the `twoFactor` row and sets `twoFactorEnabled: false`
(`ibid:152-180`), the `enable` that follows sees no existing row and writes
`verified: false`, leaving the flag off until `TwoFactorVerify` flips both
(`dist/plugins/two-factor/totp/index.mjs:157-175`). Replacement therefore becomes
first-time enrolment, with the same abandonment semantics: **abandon and 2FA is
simply off** — the tile reads Off, the user signs in with their password, and they can
set up again. The lockout is not mitigated, it is removed.

What it costs is a window with no second factor, from Generate until Confirm, plus a
user who abandons and does not notice that 2FA went off. Both are strictly better
than the alternative: a deliberate, visible, self-recoverable gap in place of an
unrecoverable one needing DB surgery. Separate work on required-2FA and admin reset
shrinks the residual further — an enrolment gate turns "silently off" into "pushed
back into set-up" — but the replace path does not depend on either landing.

Two mechanics that make the chained call safe, both verified:
`disable` needs an authoritative session and rotates the session cookie
(`ibid:163-178`), while `enable` takes plain `sessionMiddleware` (`ibid:53-56`), so the
second call runs on the cookie the first one set. If `enable` fails anyway, 2FA is
off, and the branch's `catch` both refetches the account and says so in as many words
rather than blaming the password — recoverable by retrying, since a `disable` against
an already-disabled account deletes nothing and still succeeds. The catch is specified
with the replace chain in the Modal specification.

Both client actions already exist (`@lowdefy/client` wraps `enable` / `verify` /
`disable`, `dist/auth/createAuthMethods.js:474-538`), so this needs no upstream ask.

First-time enrolment was always safe for the same reason, which is what the replace
branch borrows: with no existing row, `enable` writes `verified: false`
(`skipVerificationOnEnable` defaults to `false`) and leaves the flag alone, so
abandoning leaves an unverified row that the next `enable` deletes.

**The deeper problem is that today "Manage" can only mean "replace".** The two
reasons a user opens it are not equally dangerous, and they are not equally common:

- _"I've lost or rotated my device"_ — genuinely needs a new secret. Rare.
- _"I need new backup codes"_ — needs nothing rotated at all. Much more common,
  since codes are consumed one per use with no remaining-count surface anywhere in
  the tile, so reaching zero is silent.

Routing the second through `enable` is the whole hazard. A user who wants recovery
codes pays for them with their authenticator app, and an interruption mid-flow
costs them their second factor. Warning them about that is treating a design
problem as a copy problem.

BetterAuth separates the two operations and Lowdefy does not expose the safe one:
`POST /two-factor/generate-backup-codes` is password-gated, requires
`twoFactorEnabled`, and updates **only** the `backupCodes` field on the existing
row — secret, `verified` and `user.twoFactorEnabled` untouched
(`dist/plugins/two-factor/backup-codes/index.mjs:212-265`). The client plugin
registers the path, but `@lowdefy/client` wraps only `enable` / `verify` / `disable`
(`dist/auth/createAuthMethods.js:516-538`). That is
**[upstream ask 1](upstream-asks.md)**, and separating recovery-code rotation from
second-factor re-enrolment is the standard pattern among identity providers for
exactly this reason.

So **Manage opens on a choice, not on a password field**:

| `intent`     | Reached from                       | Action                                 | Then      |
| ------------ | ---------------------------------- | -------------------------------------- | --------- |
| `enrol`      | `Set up` (2FA off) — set on open   | `TwoFactorEnable`                      | → `scan`  |
| `codes_only` | `Manage` → "Get new backup codes"  | `TwoFactorGenerateBackupCodes`         | → `codes` |
| `replace`    | `Manage` → "Replace authenticator" | `TwoFactorDisable` + `TwoFactorEnable` | → `scan`  |

The warning `Alert` and the title change now belong to `intent: replace` alone,
where they are the truth rather than a blanket caveat on maintenance. And the
warning gets its own screen instead of sitting beside the safe option — a red
alert next to "Get new backup codes" would make the harmless path look dangerous.

Replacement still warns before Generate, but the warning is now about a gap rather
than a lockout, so it states what the user must do and what happens if they stop:

> **Your current authenticator stops working now.** Two-factor is switched off while
> you set up the new one, and comes back on when you enter a code from it. If you
> stop partway, two-factor stays off and you can set it up again from here.

Removing replacement entirely was considered and rejected: it would force the user
through Turn off → Set up as two separate operations, which is the same no-second-factor
window this branch already opens, with more steps and no warning attached to it.

**Intent is an explicit choice, never a live read.** All the wording — title,
warning, button label — gates on `enroltotp.intent`, written once: by the trigger for
a first-time enrolment, by the chosen button in phase `choose` otherwise. Reading
`get_account.0.two_factor_enabled` directly instead would make the wording change
underneath the user, because phase `scan`'s chain ends with `refetch_account.yaml`
on purpose so the tile flips to **On** behind the modal
(`modules/user-account/actions/refetch_account.yaml:6-11` re-runs `get_account`).
On a first-time enrolment the flag therefore turns true while the modal is still
open on phase `codes` — which would retitle it to the replacement variant while it
shows the codes for the enrolment that just succeeded. The replace branch moves the
flag the other way for the same reason: its `TwoFactorDisable` turns
`two_factor_enabled` **false** at Generate, so a live read would relabel a
replacement as a first-time enrolment halfway through it. A written-once leaf is
immune to anything that refetches behind it. The leaf holds an enum rather than an
is-this-a-replacement boolean because a boolean cannot separate `enrol` from
`codes_only` — both are "not replacing" yet they call different actions and land on
different phases.

Moving `refetch_account` off the phase-`scan` chain and onto Done was the other way
to stop the flag changing mid-flow, and was rejected: the tile would sit on a stale
**Off** for as long as the user reads their codes, and the refetch would ride on a
button whose job is closing, where a failure is silent.

**Sequencing.** `intent: codes_only` is the one part of this design gated on the
upstream ask — phase `choose` and phase `password`'s Back button ship with it, since
neither has anywhere to go without the second option. The F21/F22 fixes — one modal,
explicit phases, no footer, state hygiene, the `Validate` fixes — carry no upstream
dependency and ship first, and so does the disable-first replace chain, which is the
part that removes the lockout. Until the action lands, the trigger's seed sends an
already-enrolled user straight to `phase: password` with `intent: replace`, which is
exactly the warned flow above. Nothing needs redesigning when it arrives: one phase,
one button, one action call.

### D5. Copy only, and one attention gate on the codes phase

There is no core download action — the only candidate is `DownloadXlsx` from the
xlsx community plugin, which is absurd for six short codes. The codes phase offers
Copy (`CopyToClipboard` with `messages.success`) and nothing else, and the alert
copy that currently promises "Download or copy them" is corrected to match what
the UI does.

**Every exit fires the `onClose` clear, so in phase `codes` every exit discards the
codes.** antd hands rc-dialog one `onClose` for the X, Esc _and_ the mask click
(`antd/lib/modal/Modal.js:221`); rc-dialog's Esc handler calls it with
`keyboard = true` by default (`@rc-component/dialog/lib/DialogWrap.js:32-48`); it
lands on antd's `handleCancel`, which invokes the block's `onCancel`
(`blocks-antd/dist/blocks/Modal/Modal.js:106-118`) and thence the Lowdefy `onClose`
event. Of the three, only the mask click is shut (`maskClosable: false`, which costs
nothing and closes the genuinely accidental one). **Esc cannot be blocked at all** —
`keyboard` is absent from the Modal block's property schema and `Modal.js` never
passes it, so rc-dialog's default stands.

The one guard is therefore an `enroltotp.codes_saved` `CheckboxSwitch` ("I've saved
my backup codes") above Done, with Done `disabled` until it is ticked. **It is an
attention device, not a lock.** The user cannot be prevented from leaving — Esc is
one keystroke — so the guard's only real job is to make someone in dismiss-the-dialog
mode read one sentence before they act. That it does, and it is the cheapest thing
that does it.

A checkbox rather than gating Done on the Copy click: Copy is the only save
affordance offered, while people legitimately save codes by screenshot, password
manager, or on paper. Mandating a clipboard write would block those users for
nothing and force a one-time secret onto a clipboard that syncs across devices.
Clicking Copy also does not evidence saving. The checkbox permits any method and
asks for the affirmation directly.

**Suppressing the X in phase `codes` was considered and rejected.** `closable` is a
real Modal property that accepts operators, so
`closable: { _ne: [_state: enroltotp.phase, 'codes'] }` would remove it for that
phase (`workflows/components/check-action-modal.yaml:67` sets it statically), and an
earlier draft did exactly that. Three reasons it goes:

- **It does not close the hole.** Esc remains, so the codes are one keystroke from
  gone either way. The X suppression converts an unrecoverable exit into a slightly
  less discoverable unrecoverable exit.
- **It makes the modal's chrome change between phases** — a dialog that sometimes
  has a close button and sometimes does not, for reasons invisible to the user. That
  is a real comprehension cost paid on every enrolment, against a misclick risk on
  the one button the user actually means to press.
- **The loss it guards is shrinking.** With D4's `codes_only` branch, a user who
  dismisses the codes can get a fresh set from Manage without touching their
  authenticator. The guard was priced against "gone forever", which was never quite
  true and will soon not be true at all.

The checkbox survives that reasoning and the X suppression does not, which is the
distinction worth keeping: one of them changes what the user _understands_, the
other only changes what they can _reach_.

Dismissing phase `codes` is **not** a lockout, and the design does not treat it as
one. Phase `codes` is only reachable after the second factor is already working, so
what is lost is the fallback for a later lost device. That is why the `backup_codes`
clear stays on `onClose` rather than moving off it — leaving them in state buys no
recovery (reopening goes through the trigger, which reseeds) and only leaves a
one-time secret in
client state, which is the hygiene problem D3 exists to fix.

With the native footer gone there is no Cancel button, so the X and Esc are the only
way out of every phase (plus phase `password`'s Back, when the caller arrived via
`choose`). That is intended and now uniform — no phase holds anything that cannot be
reissued by starting over.

That claim holds for `replace` only because D4 turns 2FA off before re-enrolling. Left
as a bare `enable`, abandoning phase `scan` on a replacement would leave 2FA enforced
against an unscanned secret with its replacement codes never rendered — the one real
lockout in the flow, and the reason the disable-first chain exists rather than a
sterner warning.

### D6. A container-scoped `Validate` validates nothing — eight sites, all fixed

`Validate`'s `params` go through `getBlockMatcher`, which turns a bare string into
an **exact-id** matcher (`engine/dist/getBlockMatcher.js:47-49`).
`Slots.getValidateRec` (`Slots.js:119-124`) then walks every block and calls
`block.getValidate(match)`, which bails on `if (!match(this.blockId)) return null`
(`Block.js:372-383`) — each block tests the matcher against its **own** id, never an
ancestor's. There is no cascade to descendants.

So `params: modal_enroltotp` matches exactly one block: the Modal container. It has
`required` defaulted to `false` (`Block.js:444`) and no `validate` entries, so its
test list is empty and it returns zero errors. The action runs, reports success, and
validates nothing. This is the second half of F22(b) — `okText` explains why
"Confirm & enable" _renders_ in phase 1, and the dead `Validate` is why clicking it
reaches `TwoFactorVerify` with an empty code instead of being blocked.

The bug is easy to write and impossible to notice: a container id reads like "the
form", the action executes without error, and nothing surfaces until a required
field is submitted empty and the server's rejection stands in for the field-level
error. Eight sites in this repo have it — seven passing a Modal id, one passing a
`Box` id — and none of the eight blocks carries a custom `validate:` array, so
`required: true` is the only validation any of them would ever run:

| Site                                           | `params`           | Required inputs today                    |
| ---------------------------------------------- | ------------------ | ---------------------------------------- |
| `user-account/…/view/modal_enroltotp.yaml:30`  | `modal_enroltotp`  | 2 (one per phase)                        |
| `user-account/…/view/modal_changepw.yaml:20`   | `modal_changepw`   | 2                                        |
| `user-account/…/view/modal_disable2fa.yaml:23` | `modal_disable2fa` | 1                                        |
| `user-account/…/view/modal_profile.yaml:32`    | `modal_profile`    | 2 — `profile.given_name`, `.family_name` |
| `user-admin/…/view/modal_access.yaml:27`       | `modal_access`     | 0 — see `roles` below                    |
| `user-admin/…/view/modal_global.yaml:22`       | `modal_global`     | 0                                        |
| `user-admin/…/view/modal_profile.yaml:26`      | `modal_profile`    | 2 — the same two                         |
| `user-admin/components/invite_form.yaml:147`   | `state_form`       | 2 — the same two                         |

**Neither `roles` block counts, because `required: true` on an array input is inert.**
`modal_access` and `invite_form` both mark their `roles` `MultipleSelector`
`required: true` (`modal_access.yaml:54-56`, `invite_form.yaml:48-50`), and that flag
can never fail a validation: the synthesised rule is `pass: { _not: { _type: 'none' } }`
(`Block.js:280-288`), `_type: 'none'` is `null`/`undefined` only
(`helpers/dist/type.js:160`), and an array input's value is seeded and re-seeded with
`enforceType('array', null)` → `[]` (`Block.js:190`, `type.js:188-189`). `[]` is not
`none`. This is independent of the matcher bug — it would be equally true with an
explicit `blockIds: [roles]`. **The flag is deleted rather than repaired, in
`designs/users-fixes/role-editing` D6**, which owns both files: a role-less member is a
supported state (`appRoles` is `required: false` and absent for a self-signed-up
member), so an array-aware rule would newly forbid something the platform supports.
Nothing about that is this design's business; the counts above just have to be right.
`^roles$` still appears in both regexes below — it buys nothing today, but `roles` is a
live input the form writes to, and the single rule is "validate the namespace the form
writes to". Dropping it would be the special case.

The three `profile.*` counts come from the shared `modules/shared/profile/form_core.yaml`,
which all three files compose (`user-account/…/modal_profile.yaml:55`,
`user-admin/…/modal_profile.yaml:52`, `invite_form.yaml:39`) and which marks both
name fields `required: true` (`form_core.yaml:32-34,44-46`). The required-input set
of a form is not readable from the file that carries the `Validate` — that is the
same lesson as the regex table below, one level up.

**Six of the eight are broken now**, including two live profile-edit forms — one
self-service, one admin — that currently accept a blank first or last name and save
it. Two are dead guards: `modal_global`, whose inputs come entirely from
`fields.user_attributes` with none required today, and `modal_access`, whose only
required-marked input is the inert `roles` and whose `member_attributes.*` are
consumer-supplied. Both will break silently the first time someone marks a field
required — the worse failure, because the config looks protected. All eight are fixed
here rather than left to a follow-up: leaving a
documented defect in files this design already opens is worse than the scope. It is
not a one-line mechanical swap, though — see the sibling-fixes subsection for why
each site needs its input ids read first.

**Namespace regex for single-phase forms; explicit ids for the phased modal.** Both
idioms already work in this repo — `regex: ^task_modal\.`
(`activities/components/task-modal.yaml:125`), `regex: ^form\.`
(`deals/components/detail/deal_outcome_modal.yaml:67-69`), and the explicit input id
(`events/components/note-capture.yaml:79`). Because this repo's input block ids
_are_ their state paths, a namespace regex matches exactly the form's fields, and it
keeps matching them when a field is added later. An explicit list is opt-in
correctness — add a required field, forget the list, and the guard quietly stops
covering it. That drift is how these eight happened, so the seven flat forms take the
regex form (`regex: ^changepw\.`, `^disable2fa\.`, and so on).

Two mechanics make that practical, both confirmed in `getBlockMatcher.js:38-58`:
`regex` accepts an **array** of patterns, and `blockIds` and `regex` may be given
**together** in one params object — the matcher ORs across both. So a form whose
inputs span more than one namespace still needs only one `Validate`. (Note also
that `params` omitted entirely, or `blockIds: true`, matches _every_ block — page
scope, not modal scope — which is presumably what the authors of these eight
thought they were getting. It is not a usable fix: it would mark required fields
elsewhere on the page.)

For three of these forms the regex is **not** derivable from the container id, and
the manifest is the place to check. `user-admin`'s `fields.profile`,
`fields.user_attributes` and `fields.member_attributes` vars mandate the `profile.`,
`user_attributes.` and `member_attributes.` prefixes
(`user-admin/module.lowdefy.yaml:88-105`), and some forms also carry a bare
top-level input beside them — `modal_access` has `roles` and `invite_form` has
`roles`, neither namespaced at all. That also settles _why_ the regex rather than an
explicit list for these: their input sets are partly **consumer-supplied** through
those vars, so no list authored here could enumerate them. The mandated prefix is
what makes the namespace knowable, and the regex is what tracks it.

`modal_enroltotp` is the exception, and names its fields explicitly, because its
namespace is not one form: `enroltotp.*` spans every phase. `regex: ^enroltotp\.`
would sweep `password` into phase `scan`'s validation. It would _happen_ to pass —
`getValidate` returns nothing for a block whose `visibleEval.output` is `false` — but
resting validation correctness on which blocks are hidden is the same accident this
decision exists to remove. Being explicit also costs nothing here: each phase has
exactly one field to check, `enroltotp.password` then `enroltotp.confirmation_code`.

The rule is therefore single: **validate the namespace the form writes to** — with a
multi-phase form naming its fields, because its namespace is not one form.

## Modal specification

One file: `modules/user-account/components/view/modal_enroltotp.yaml`.
`layout: { gap: 16 }` (matching `modal_profile.yaml:13`), `footer: false`,
`maskClosable: false`. `closable` is left at its default `true` in every phase (D5).
Title gated on `enroltotp.intent` (D4): "Set up two-factor authentication" for
`enrol`, "Replace your authenticator" for `replace`, "New backup codes" for
`codes_only`, and **"Two-factor authentication" as the fallback** — the neutral label
for phase `choose`, which is the one phase entered with `intent: null` and so matches
none of the three branches. It needs a default rather than a three-way `_if`:
`Modal.js` passes `title` straight through to antd
(`blocks-antd/dist/blocks/Modal/Modal.js:73-76`), so a null title renders an
unlabelled header on the screen that offers two consequential choices. D3's
"nothing gates on `intent == null`" holds for the _body_ gates only.

State, seeded by the trigger (D3) and thereafter owned by this modal, cleared together
on `onClose`:

| Key                           | Written by                    | Purpose                                                         |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `enroltotp.phase`             | the trigger, then each step   | `choose` \| `password` \| `scan` \| `codes` — the only gate     |
| `enroltotp.intent`            | the trigger or phase `choose` | `enrol` \| `replace` \| `codes_only` — wording + which action   |
| `enroltotp.password`          | PasswordInput                 | Spent by the enable/generate call, nulled immediately after     |
| `enroltotp.uri`               | enable's stash                | QR value; its `secret` param is the manual-entry key            |
| `enroltotp.confirmation_code` | TextInput                     | Verified by `TwoFactorVerify`                                   |
| `enroltotp.backup_codes`      | enable/generate stash         | Rendered once in phase `codes`                                  |
| `enroltotp.codes_saved`       | CheckboxSwitch                | Gates phase `codes`' Done button (D5); `false` on reset         |
| `enroltotp.twofa_off`         | the replace chain             | `true` once its `TwoFactorDisable` commits; read by its `catch` |

**Phase `choose`** — reached only when the caller already has 2FA on (D4). No inputs:
a line of intro copy and two buttons, each setting `phase: password` plus its
`intent` in one `SetState`, so no request runs here and nothing is spent:

```
"Get new backup codes"   → SetState { phase: password, intent: codes_only }
"Replace authenticator"  → SetState { phase: password, intent: replace }
```

The safe option is listed first and is the primary; replacement is secondary
(`variant: outlined`), with its consequence stated in its own supporting line rather
than an `Alert` — the red alert belongs on the phase where the destructive action is
actually about to fire.

**Phase `password`** — intro copy; the replacement warning `Alert` with D4's copy
(`visible: { _eq: [_state: enroltotp.intent, replace] }`); `enroltotp.password`; and
one of three primary block buttons, each `visible`-gated on `intent`. All wrap their
`onClick` in `try`/`catch` as today, so a wrong password toasts a friendly message
and stays put.

For `intent: enrol` — labelled "Generate QR code":

```
Validate  enroltotp.password        ← empty field errors here, not at the server
TwoFactorEnable (password)
SetState  phase: scan, uri: <_actions …totpURI>,
          backup_codes: <_actions …backupCodes>, password: null
```

For `intent: replace` — labelled "Replace authenticator". Same chain with the
2FA-off step in front of it, and a refetch behind it (D4):

```
try:
  Validate  enroltotp.password
  TwoFactorDisable (password)              ← 2FA off; the next enable writes verified: false
  SetState  twofa_off: true                ← the disable has committed; the catch reads this
  TwoFactorEnable  (password)
  SetState  phase: scan, uri: <_actions …totpURI>,
            backup_codes: <_actions …backupCodes>, password: null
  refetch_account.yaml                      ← the tile drops to Off behind the modal
catch:
  :if  _state: enroltotp.twofa_off
  :then
    SetState  password: null
    refetch_account.yaml                    ← 2FA really is off; the tile must say so
    DisplayMessage  "Two-factor is now off. Try again to finish setting up your
                     new authenticator."
  :else
    DisplayMessage  "Couldn't start two-factor setup. Check your password and try again."
```

The refetch is on the success path rather than only on Confirm because on this branch
the account really is 2FA-off from Generate onward, and a user who abandons at phase
`scan` needs the tile to say so. Leaving it stale on **On** is the dangerous lie — it
tells someone who just abandoned a replacement that they still have a second factor.
The modal's own wording is unaffected, because it gates on the written-once `intent`
(D4).

**The `catch` is where that lie would otherwise be told, so it branches.** Lowdefy's
event runner has no `finally`: the first throw abandons the rest of the try chain and
runs `catchActions` instead (`engine/dist/Actions.js:331-360`). A `TwoFactorEnable`
that fails after `TwoFactorDisable` has committed — and it commits hard:
`twoFactorEnabled: false`, row deleted, session rotated — would otherwise skip both the
`SetState` and the refetch, leaving the user on phase `password` with 2FA genuinely off,
the tile reading **On**, and a toast telling them to check their password. One blanket
message cannot cover two outcomes that differ by whether the user still has a second
factor.

`enroltotp.twofa_off` is an **explicit flag, not an inference from the `_actions`
response shape**, for the same reason `phase` and `intent` are (D2, D4) — and here also
because the obvious inference is wrong. A failed action records `{error, action, index}`
and a successful one `{type, response, index}` (`Actions.js:391,495-514`), so
`_not: { _actions: enroltotp_disable.error }` is _also_ true when the `Validate` failed
and the disable never ran, which is the most common way into this catch. `:if` / `:then`
/ `:else` work in `catch` lists with `_state` resolving in the condition
(`Actions.js:139-190,325`). No refetch on the `:else` branch: nothing changed, so it
would be a request that can only fail — the same argument the `codes_only` branch makes.
`password: null` sits on the disable-succeeded branch because that is where the
credential was actually spent; the retry needs it retyped either way, and a wrong
password should not clear the field the user is about to correct.

For `intent: codes_only` — labelled "Get new codes", and gated on the
[upstream ask](upstream-asks.md). It skips phase `scan` entirely, because nothing
about the authenticator changes:

```
Validate  enroltotp.password
TwoFactorGenerateBackupCodes (password)
SetState  phase: codes, backup_codes: <_actions …backupCodes>, password: null
```

No `refetch_account` on this branch: the tile already reads **On** and nothing it
displays has changed, so the refetch would be a request that can only fail.

Phase `password` needs its own `Validate` for the same reason phase `scan` does.
Without it an empty `enroltotp.password` round-trips to BetterAuth and returns as the
catch-all `catch` toast, "Couldn't start two-factor setup. Check your password and try
again." — a server rejection standing in for a client-side required check, telling the
user their password is wrong when they left it blank, and marking no field. Today's
body button has the same gap; it is not a regression, but a design that promises one
correct primary action per phase should not leave a phase submitting blanks.

**A secondary Back button**, `visible` when `intent` is `replace` or `codes_only`
— i.e. when the caller arrived via phase `choose`:

```
SetState  phase: choose, intent: null, password: null
```

The replacement warning is the one screen where the design is actively trying to get
the user to reconsider, and without a Back it sits one step _past_ the last point they
can change their mind: `footer: false` means no Cancel, so reading the alert and
thinking better of it costs them the whole dialog. Nothing is spent yet, so this is
comprehension rather than data loss, but it is one button. It is the second reason the
title's `intent: null` fallback is load-bearing — the trigger's seed is the first —
since Back returns the modal to that state deliberately. Ships with phase `choose`, so
it is gated on the upstream ask along with it.

**Phase `scan`** — reached from `intent` `enrol` or `replace` only. Intro copy; the
QR + manual-key + confirmation-code row; one primary button, "Confirm & enable":

```
Validate  enroltotp.confirmation_code     ← scoped to the field, not the modal
TwoFactorVerify (code)                    ← throws on a bad code; chain stops, modal stays open
SetState  phase: codes
refetch_account.yaml                       ← the tile flips to On behind the modal
```

`Validate` names the one input id rather than the modal id, which validates nothing
at all — see D6, which also carries the fix across the seven sibling sites with the
same bug.

**The manual-entry key is a copyable `Paragraph`, not a disabled input, and it shows
the secret rather than the URI.** Today it is a `TextInput` with `disabled: true`
(`modal_enroltotp.yaml:155-164`), which fails the "can't scan" user twice over:

- **Not copyable.** Chromium and WebKit do not allow text selection inside a
  disabled input (Firefox does), so the only fallback is to retype a base32 string
  out of greyed-out low-contrast text. Lowdefy's `TextInput` has no read-only-but-
  selectable option — the schema exposes `disabled` and nothing else in that family
  — so there is no prop to swap. Given F21 is precisely "the copy affordance should
  not cost the user the secret", the same defect one field over should not survive.
- **Wrong value.** It renders `enroltotp.uri`, which is BetterAuth's `totpURI` —
  a full `otpauth://totp/{issuer}:{email}?secret=…&issuer=…`, built by
  `createOTP(secret, …).url(…)` (better-auth 1.6.23,
  `dist/plugins/two-factor/index.mjs:129-132`). An authenticator app's manual-entry
  field wants the base32 secret; the whole URI generally fails there. A field
  labelled "Can't scan? Enter this key" has to show the key.

So the row becomes: the `QRCode` block on the full `enroltotp.uri` as now, beside a
`Paragraph` with `code: true` (monospace, so a hand-transcribed key is legible and
`1`/`l` and `0`/`O` are distinguishable) and `copyable: true`
(`blocks-antd/dist/blocks/Paragraph/meta.js:32-45`), whose content pulls the
`secret` param out of the URI:

```
_js: |
  const uri = state('enroltotp.uri');
  if (!uri) return null;
  return new URLSearchParams(uri.split('?')[1] || '').get('secret');
```

`_js` rather than operator chaining here because the operator form needs nested
`_string.split` plus array indexing to reach one query param, which is exactly the
"deeply nested or hard to read" case the repo rule carves out.

A side effect worth naming: `enroltotp.uri` stops being a block id. It becomes plain
`SetState`-written state that the engine never deletes on hide, so D3's leaf-null
reasoning does not apply to it (it is still nulled on reset — it carries the
secret).

**Phase `codes`** — shared by all three intents, unchanged between them but for one
line of copy, gated on `intent` — three branches, not two:

| `intent`     | Lead line                                                                  |
| ------------ | -------------------------------------------------------------------------- |
| `enrol`      | "Two-factor is on."                                                        |
| `replace`    | "Your new authenticator is active. These codes replace your previous set." |
| `codes_only` | "These replace your previous backup codes."                                |

`replace` needs both facts and can share neither branch. `enable` recreates the
`twoFactor` row with a fresh `backupCodes` array
(`dist/plugins/two-factor/index.mjs:119-127`), so a replacing user's previous codes are
dead too — the `codes_only` sentence is as true for them. And a bare "Two-factor is on"
reads as first-time-enrolment confirmation to someone for whom it was already on before
they opened the dialog. Then the
codes grid (unchanged `_nunjucks` + `_array.join`, reading `enroltotp.backup_codes`);
the warning `Alert` with corrected copy; a Copy button (`CopyToClipboard`,
`messages.success: Copied`, no close); the `enroltotp.codes_saved` `CheckboxSwitch`,
description "I've saved my backup codes"; and a primary Done button,
`disabled: { _not: { _state: enroltotp.codes_saved } }`, that self-closes via
`CallMethod: { blockId: modal_enroltotp, method: toggleOpen }`, which fires `onClose`
and clears the namespace. The X remains available in this phase (D5).

That reuse is the reason D4's `codes_only` branch is cheap: the screen that renders a
fresh set of codes already exists and needed no change beyond one gated line.

## Files changed

- `modules/user-account/components/view/modal_enroltotp.yaml` — the rework above.
- `modules/user-account/components/view/modal_backupcodes.yaml` — **deleted**; its
  body becomes phase `codes`.
- `modules/user-account/pages/view.yaml` — drop the `modal_backupcodes` `_ref`
  (line 88).
- `modules/user-account/components/view/tile_security.yaml` — `twofa_manage_btn`'s
  `onClick` gains the `phase`/`intent` seed and the leaf nulls ahead of its existing
  `CallMethod toggleOpen` (D3). It is the modal's only entry point and already reads
  `get_account.0.two_factor_enabled` for its own label.
- `docs/user-account/concepts/auth-methods.md` — a short **Two-factor enrolment**
  subsection beside the existing "Two-factor routing is internal": enrolment is
  password-gated; backup codes are shown once and are not re-fetchable, but a fresh
  set can be issued from Manage without touching the authenticator; and replacing the
  authenticator turns two-factor off, rotates the secret and invalidates the previous
  device, so an abandoned replacement leaves the account with two-factor **off** until
  the user enrols again (D4).
  Consumer-observable behaviour a support flow needs to know — and the distinction
  between the two Manage options is exactly what a support agent gets wrong.
- `designs/users-fixes/2fa-enrolment-modal/upstream-asks.md` — **new**. Ask 1,
  `TwoFactorGenerateBackupCodes`, which D4's `codes_only` branch depends on.
- `modules/user-account/components/view/` — `modal_changepw.yaml`,
  `modal_disable2fa.yaml`, `modal_profile.yaml`: `Validate` regex fix (D6), plus the
  `onClose` clear on the first two and the `onOpen` `{}` → leaf-null rewrite on
  `modal_disable2fa`. Leaves tabulated in the sibling-fixes subsection.
- `modules/user-admin/components/view/` — `modal_profile.yaml`, `modal_global.yaml`,
  `modal_access.yaml`, and `modules/user-admin/components/invite_form.yaml`:
  `Validate` regex fix only (D6).
- `CLAUDE.md` — two entries added to **Lowdefy Project Rules**: the explicit-leaf-null
  reset rule (D3) and the `Validate`-scoping rule (D6). Both are repo authoring
  conventions rather than consumer-observable module behaviour, so `CLAUDE.md` is the
  home, not `docs/` — an author writing a `SetState` reset or a `Validate` in an
  unrelated module has no reason to open `docs/user-account/`. This is where D3's
  "worth stating as a repo idiom the next author can find" is actually delivered.
- `apps/demo/` — no change. The security tile already exercises the modal on the
  demo's account page, and the warning copy lives in the modal rather than on the
  trigger; the tile's only edit is the seed above, in the module.

### Sibling fixes — the same two defect classes elsewhere

Outside F21/F22's scope but the same defect classes, a line or three each, and
awkward to leave inconsistent once D3 and D6 establish the rules.

**State hygiene (D3), in `user-account`:**

- `modal_changepw.yaml` has **no reset at all** — both password fields persist in
  client state indefinitely after the modal closes.
- `modal_disable2fa.yaml` resets on open but not on close, so the account password
  sits in state until the next open. Its `onOpen` is also
  `SetState: { disable2fa: {} }` (`modal_disable2fa.yaml:15-19`) — the exact shape
  D3's new `CLAUDE.md` rule forbids. It happens to work (the input is always
  visible), but shipping the rule and leaving a counter-example in a file this
  change already opens is the inconsistency the D6 scope argument rejects, so it
  converts to the leaf form too.

Both get an `onClose` clear, and the leaves are tabulated per file rather than left
to "explicit leaf nulls" — because one of them is not a null:

| Site               | Event              | `SetState` params                                                                                         |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `modal_changepw`   | `onClose` (new)    | `changepw.current_password: null`, `changepw.new_password: null`, `changepw.revoke_other_sessions: false` |
| `modal_disable2fa` | `onOpen` (rewrite) | `disable2fa.password: null`                                                                               |
| `modal_disable2fa` | `onClose` (new)    | `disable2fa.password: null`                                                                               |

`changepw.revoke_other_sessions` is a `CheckboxSwitch`
(`modal_changepw.yaml:55-66`), so it resets to `false`, its boolean zero, per D3.
Nulling it instead would flow into the next open's `ChangePassword` payload
(`modal_changepw.yaml:31-33`) — and `modal_changepw` has no `onOpen` reset either,
so nothing downstream would correct it. A reset set with a boolean in it is exactly
the trap D6's table exists to avoid, one section later.

(Both modals' inputs are always visible, so D3's invisible-input restore quirk never
bites them; the gap is only the missing `onClose` and the `{}` shape.)

**No-op `Validate` (D6), in `user-account` and `user-admin`:** the seven sibling
sites in D6's table each swap their container id for the namespace their inputs
actually write to. Read off each file's input ids rather than inferred from the
container id — the container id is exactly what is wrong with them now, and three of
these do not follow it:

| Site                         | Actual input ids                                    | `params`                                                   |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `modal_changepw`             | `changepw.*`                                        | `regex: ^changepw\.`                                       |
| `modal_disable2fa`           | `disable2fa.*`                                      | `regex: ^disable2fa\.`                                     |
| `user-account/modal_profile` | `profile.*` (`form_core.yaml` + `fields.profile`)   | `regex: ^profile\.`                                        |
| `user-admin/modal_profile`   | `profile.*`, plus a disabled `email` display field  | `regex: ^profile\.`                                        |
| `modal_global`               | `user_attributes.*` only                            | `regex: ^user_attributes\.`                                |
| `modal_access`               | `roles` (inert) + `member_attributes.*`             | `regex: ['^roles$', '^member_attributes\.']`               |
| `invite_form`                | `profile.*`, `roles` (inert), `member_attributes.*` | `regex: ['^profile\.', '^roles$', '^member_attributes\.']` |

`user-admin/modal_profile`'s `email` is deliberately left out: it is `disabled: true`
display, never required, so matching it buys nothing.

Worth noting what this table cost, because it is the same trap one level up:
`^global\.` and `^access\.` are the regexes a container-id reading suggests, and both
match **zero blocks** — `modal_global`'s inputs are `user_attributes.*` and
`modal_access`'s required input is bare `roles`. Shipping those would have swapped a
silent no-op for a different silent no-op, in the change whose entire purpose is
removing silent no-ops. Hence the mapping is tabulated per file here rather than left
as a rule to apply at code time.

This is the one part of the change that reaches into `user-admin`, and it stays here
— **all eight sites are fixed in this change**. Splitting the four `user-admin` ones
out was considered: they are a different module, and two of them (`modal_global`,
`modal_access`) need a field temporarily marked required just to prove the fix, so they
carry their own verification cost. It was rejected because the defect class is
identical, the per-file table above is the hard part and it is now written down, and
two of those four (`modal_profile`, `invite_form`) have a live required-field guard
that does nothing today. Deferring them means shipping the rule and leaving the two
worst instances of it broken.

`designs/users-fixes/role-editing` lists these eight under Non-goals as "owed a
follow-up design covering all eight". **That non-goal is amended to point here** rather
than at a third design. The two designs do overlap on two files — role-editing edits
`modal_access.yaml` and `invite_form.yaml` to drop the inert `required: true` and to
fix the role picker, while this design changes their `Validate` params — so
**role-editing lands first on those two files**, and the `Validate` swap applies on top
of it. The edits do not touch the same lines.

## Verification

Build (`pnpm ldf:b`) proves the config compiles but nothing here is provable by
build alone. On the auth-testing rig, as a credentialed user:

1. **First-time enrolment, on a freshly loaded page** — the very first `Set up` of the
   session, so nothing has written `enroltotp.*` before the trigger does (the case the
   `onOpen` seed would have rendered as an empty body). It opens straight on the password
   phase with a complete screen and no empty frame (no `choose`) → QR renders beside a
   monospace manual key that copies and is a bare
   base32 secret, not an `otpauth://` URI → a real TOTP code entered from an app set
   up by **that key** → the codes grid renders actual codes (F21's outstanding
   re-confirmation) → Done is disabled → Copy reports success and the modal **stays
   open** → ticking "I've saved my backup codes" enables Done → Done closes it → the
   tile shows **On**.
2. **State hygiene** — after Done, `enroltotp.*` is empty in state; reopen and the
   password field is blank (F22(c), the case that failed before).
3. **Abandon the password phase** — close it, reopen: blank field, and the phase the
   caller's enrolment state calls for.
4. **Abandon the scan phase** — close after Generate; the tile still reads **Off** and
   a fresh Generate issues a new secret.
5. **Replace authenticator** — with 2FA on, Manage warns before the password is spent,
   and completing it makes the new secret work and the old one fail. Before the
   upstream ask lands, Manage opens straight on the password phase with
   `intent: replace`; after it, Manage opens on `choose`, and this step also checks that
   Back returns to `choose` with a titled modal and a blank password.
6. **A replacement whose `enable` fails after the `disable` committed** — the catch
   branch. Hard to provoke on the rig; if it can be forced (a mangled request, a
   deliberately failing `enable`), the tile must drop to **Off** and the toast must say
   two-factor is now off rather than blaming the password. Otherwise verify the cheap
   half: submitting the replace branch with a **wrong** password takes the `:else`
   branch — the password toast, the field still holding what was typed, and the tile
   unchanged on **On**.
7. **Abandon a replacement mid-flow** — the transition D4's disable-first chain exists
   for, and the single most dangerous one in the change. With 2FA on, Manage → Replace
   → Generate → close the modal. The tile must read
   **Off**, and signing out and back in must ask for a password only, with **no**
   second-factor challenge. Then Set up again from the tile and confirm a fresh
   enrolment completes normally. (Under a bare `enable` this is the lockout: 2FA
   enforced against a secret never scanned.)
8. **New backup codes** (once the upstream action lands) — with 2FA on, Manage →
   "Get new backup codes" → password → codes render directly with no QR step; the
   **existing authenticator still verifies** afterwards, the tile still reads **On**,
   and a previously-issued backup code is now rejected. This is the case that proves
   the two Manage options are genuinely different operations.
9. **`Validate` now bites (D6)** — submit each of the six broken forms with a
   required field empty and confirm a red field-level error, not a server-error toast:
   `modal_enroltotp` phase `scan`, `modal_changepw`, `modal_disable2fa`,
   `modal_profile` ×2 (clear a name field — `form_core` marks both required), and
   `invite_form` (clear a name — this is also the multi-pattern-regex proof, since its
   params span `^profile\.`, `^roles$` and `^member_attributes\.` and the error must
   come from the `profile.` half). `modal_global` and `modal_access` have **no** input
   that can fail a required check — `modal_access`'s `roles` is an inert
   `MultipleSelector` flag (D6) — so for each of those two, mark one field required
   temporarily and confirm the regex catches it. A passing form proves nothing there.

Steps 1–7 and 9 have no upstream dependency. Step 8 waits on the ask.

## Non-goals

- **Not a non-goal any more**: regenerating backup codes without re-enrolling. An
  earlier draft listed it here on the grounds that BetterAuth rotates codes only
  through `enable`, which is **wrong** — `POST /two-factor/generate-backup-codes`
  does exactly this and leaves the secret alone. It is now D4's `codes_only` branch,
  gated on [upstream ask 1](upstream-asks.md). Recorded here rather than deleted
  because the false premise is what kept the destructive path as the only path, and
  a reader who remembers the old non-goal should see why it moved.
- A **remaining-codes count** in the security tile. Backup codes are consumed one per
  use and nothing surfaces how many are left, which is the other half of why users
  reach zero unaware. BetterAuth's `viewBackupCodes` is `serverOnly` and returns the
  codes themselves rather than a count
  (`dist/plugins/two-factor/backup-codes/index.mjs:267-286`), so a count needs a
  server-side endpoint of its own — a separate change, and one worth having once
  `codes_only` gives the tile something to send the user to.
- A custom plugin action hand-rolling `fetch` against
  `/api/auth/two-factor/generate-backup-codes` as a stopgap for the upstream ask.
  Rejected: it would duplicate `unwrap`, `basePath` resolution and error mapping
  outside the client that owns them (`getActionMethods` exposes no auth client to a
  custom action, so there is nothing to reuse), and it would be deleted the moment
  the real action lands. A second way to call auth is worse than waiting — see the
  ask's fallback section.
- 2FA methods beyond TOTP (OTP-over-email, trusted devices at enrolment time).
- Anything about the sign-in-time `two-factor` page, which is unaffected.
