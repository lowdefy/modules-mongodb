# Task 3: One phased 2FA enrolment modal — replace the two-modal chain

## Context

Self-service TOTP enrolment currently spans two chained modals:
`modules/user-account/components/view/modal_enroltotp.yaml` (a two-phase password → QR
body, phases inferred from `enroltotp.uri == null`) and
`modules/user-account/components/view/modal_backupcodes.yaml`. Both are mounted on
`modules/user-account/pages/view.yaml:85-89` and opened from
`modules/user-account/components/view/tile_security.yaml:189` (`Manage` / `Set up`) and
from the enrol modal's `onOk` respectively.

Five defects, all fixed here:

| #      | Defect                                                                               | Cause                                                                                                         |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| F21    | Copy dismisses the codes modal                                                       | Copy is `cancelText`, and `CopyToClipboard` is wired to `onClose`                                             |
| F22(a) | Password field sits flush against the Generate button                                | No `layout.gap` on the modal, no margins                                                                      |
| F22(b) | "Confirm & enable" shows in phase 1 and fires `TwoFactorVerify` with an empty code   | It is the Modal's static `okText`, so it renders in both phases; and the `Validate` guarding it is a no-op    |
| F22(c) | The account password survives close/reopen                                           | `SetState: { enroltotp: {} }` cannot clear an input that was invisible last cycle; no `onClose` reset         |
| new    | "Manage" silently destroys a working authenticator; abandoning it locks the user out | BetterAuth's `enable` rotates the secret while leaving `twoFactorEnabled` on, and it is the only action wired |

Four decisions from the design govern the shape, and each rules out an obvious
alternative — read them before writing YAML:

**D1 — one modal owns every phase.** The backup codes are shown once and never
re-fetched, so they must not depend on state written by one modal and read by another.
Today `modal_enroltotp`'s `onOk` opens `modal_backupcodes` and _then_ the enrol modal
closes — so the moment an `onClose` cleanup is added for F22(c), it blanks the codes
while they are on screen. Folding the codes in as phase `codes` removes the boundary:
one namespace, one owner, one cleanup site.

**D2 — no native footer; phase is an explicit value.** The Modal's footer Ok
**auto-closes on success**, which is wrong for a multi-step dialog — the password
phase's Generate must not close, and the scan phase's Confirm must advance rather than
exit. With `footer: false` each phase owns its own body buttons. Nothing is lost: a
Lowdefy `Button` already disables itself and shows a spinner while its `onClick` chain
runs, which is what `confirmLoading` provided.
`modules/workflows/components/check-action-modal.yaml:62` is the existing precedent.

Each group gates on `_eq: [_state: enroltotp.phase, '<name>']`, with `phase` set
explicitly. **Do not infer phase from data presence.** `uri` and `backup_codes` are both
written by the same `TwoFactorEnable` and both set in phase `scan` _and_ phase `codes`,
so no presence check distinguishes them. Inferring from an **input's** state is worse
still: the engine deletes the state field of an invisible input, so a field's presence
flips back to absent the moment its own group hides — a gate that unsets itself by being
obeyed.

**D3 — resets set explicit leaf nulls, never `{}`.** `SetState` writes each param key
then calls `RootSlots.reset()`; in `Block.reset`, an input whose state field is now
undefined **and which was invisible in the previous eval cycle** has its remembered
in-memory value restored, and `evaluate` only overrides from state when the state value
is _defined_. So `SetState: { enroltotp: {} }` leaves `enroltotp.password` undefined and
the password input — invisible during phase `scan` — repopulates itself.
`SetState: { enroltotp.password: null }` leaves it defined and the input clears. Booleans
reset to `false`, their boolean zero.

**The seed runs before the modal mounts, so it cannot live on `onOpen`.**
`triggerSetOpen` fires `onOpen` without awaiting it and then calls `setOpen`
synchronously, so the dialog mounts and paints at least once before an `onOpen` `SetState`
resolves. No group gates on `null`, so a phase-less namespace renders an **empty modal
body** — and on the first open of a session that is exactly what an `onOpen` seed would
produce, because nothing else writes `enroltotp.*` at all. The one flow every user hits
exactly once would be the one that got the empty frame. **The seed therefore lives on the
trigger button, and the modal has no `onOpen` event at all.**

**D4 — replacement turns 2FA off before re-enrolling.** BetterAuth's
`POST /two-factor/enable` deletes the caller's existing `twoFactor` row and creates a new
one with a fresh secret, carrying `verified: true` over when the previous row was
verified, and **never touches `user.twoFactorEnabled`**. The sign-in hook gates the
second-factor challenge on `user.twoFactorEnabled` alone. So a bare Manage → password →
Generate on an already-enrolled user leaves 2FA **on** and enforced against a secret the
user has not scanned; abandon there and they are locked out at the next sign-in, with no
admin 2FA reset anywhere in the suite. That is a database fix.

Running `TwoFactorDisable` first deletes the row and sets `twoFactorEnabled: false`, so
the `enable` that follows sees no existing row and writes `verified: false`, leaving the
flag off until `TwoFactorVerify` flips both. Replacement becomes first-time enrolment:
**abandon and 2FA is simply off** — the tile reads Off, the user signs in with their
password, and they can set up again. `disable` needs an authoritative session and rotates
the session cookie, while `enable` takes plain `sessionMiddleware`, so the second call
runs on the cookie the first one set.

## Scope boundary — the `codes_only` branch is Task 6

`intent: codes_only` needs a `TwoFactorGenerateBackupCodes` action that `@lowdefy/client`
does not yet wrap (see `../upstream-asks.md`). Phase `choose` and phase `password`'s Back
button ship **with** it, since neither has anywhere to go without the second option.

**This task therefore ships two intents — `enrol` and `replace` — and three phases:
`password`, `scan`, `codes`.** Do not author phase `choose`, the Back button, the
`codes_only` primary button, or its title/lead-line branches. Do include the `phase` and
`intent` leaves in every reset exactly as specified below, and the title's `intent: null`
fallback — Task 6 adds branches to those, it does not restructure them.

## Task

### 1. Rewrite `modules/user-account/components/view/modal_enroltotp.yaml`

**Block-level:**

```yaml
id: modal_enroltotp
type: Modal
layout:
  gap: 16 # F22(a) — matches modal_profile.yaml:13
properties:
  title: <see below>
  width: 560
  footer: false # D2
  maskClosable: false # D5
```

`closable` is left at its **default `true` in every phase** — do not set it. Suppressing
the X in phase `codes` was considered and rejected: Esc cannot be blocked at all
(`keyboard` is absent from the Modal block's property schema and `Modal.js` never passes
it), so X-suppression only converts an unrecoverable exit into a less discoverable
unrecoverable exit, while making the modal's chrome change between phases for reasons
invisible to the user.

Drop `okText`, `cancelText`, and the whole `onOk` event — there is no native footer.

**Title**, gated on `enroltotp.intent`:

| `intent`  | Title                              |
| --------- | ---------------------------------- |
| `enrol`   | `Set up two-factor authentication` |
| `replace` | `Replace your authenticator`       |
| _default_ | `Two-factor authentication`        |

The fallback is **load-bearing, not defensive**: `Modal.js` passes `title` straight
through to antd, so a null title renders an unlabelled header. Task 6 adds a
`codes_only` branch and relies on this fallback for phase `choose`.

**`onClose`** — nulls **every** leaf, `phase` and `intent` included, so no credential and
no one-time codes sit in client state after dismissal:

```yaml
events:
  onClose:
    - id: reset_enroltotp
      type: SetState
      params:
        enroltotp.phase: null
        enroltotp.intent: null
        enroltotp.password: null
        enroltotp.uri: null
        enroltotp.confirmation_code: null
        enroltotp.backup_codes: null
        enroltotp.codes_saved: false
        enroltotp.twofa_off: false
```

Nulling `phase` is safe precisely because the trigger is the only way back in — the sole
references to `modal_enroltotp` outside its own file are the page's `_ref`
(`view.yaml:87`) and that button (`tile_security.yaml:192`). There is no path that
reaches a mounted modal without a seed in front of it, so there is no placeholder phase
to justify. **Do not add an `onOpen`.**

**State contract** (seeded by the trigger, thereafter owned by this modal):

| Key                           | Written by                  | Purpose                                                       |
| ----------------------------- | --------------------------- | ------------------------------------------------------------- |
| `enroltotp.phase`             | the trigger, then each step | `password` \| `scan` \| `codes` — the only gate               |
| `enroltotp.intent`            | the trigger                 | `enrol` \| `replace` — wording + which action chain           |
| `enroltotp.password`          | PasswordInput               | Spent by the enable call, nulled immediately after            |
| `enroltotp.uri`               | enable's stash              | QR value; its `secret` param is the manual-entry key          |
| `enroltotp.confirmation_code` | TextInput                   | Verified by `TwoFactorVerify`                                 |
| `enroltotp.backup_codes`      | enable's stash              | Rendered once in phase `codes`                                |
| `enroltotp.codes_saved`       | CheckboxSwitch              | Gates phase `codes`' Done button; `false` on reset            |
| `enroltotp.twofa_off`         | the replace chain           | `true` once its `TwoFactorDisable` commits; read by its catch |

---

**Phase `password`** — every block gated
`visible: { _eq: [_state: enroltotp.phase, password] }`:

- Intro copy (keep the existing `Html` block's styling idiom).
- The **replacement warning `Alert`**, additionally gated
  `_eq: [_state: enroltotp.intent, replace]`, `type: warning`, `showIcon: true`, with
  this copy verbatim:

  > **Your current authenticator stops working now.** Two-factor is switched off while
  > you set up the new one, and comes back on when you enter a code from it. If you stop
  > partway, two-factor stays off and you can set it up again from here.

- `enroltotp.password` — `PasswordInput`, `required: true`, label
  `Account password` (carry the existing block over unchanged apart from its `visible`).
- **Two primary block buttons, each `visible`-gated on `intent`.** Both wrap their
  `onClick` in `try`/`catch`, as today, so a wrong password toasts a friendly message and
  stays put.

`intent: enrol` — labelled **"Generate QR code"**:

```
try:
  Validate     params: { blockIds: [enroltotp.password] }
  TwoFactorEnable (password: _state enroltotp.password)   messages.error: false
  SetState  enroltotp.phase: scan
            enroltotp.uri: <_actions: enroltotp_enable.response.totpURI>
            enroltotp.backup_codes: <_actions: enroltotp_enable.response.backupCodes>
            enroltotp.password: null
catch:
  DisplayMessage  error  "Couldn't start two-factor setup. Check your password and try again."
```

`intent: replace` — labelled **"Replace authenticator"**. Same chain with the 2FA-off
step in front and a refetch behind it:

```
try:
  Validate     params: { blockIds: [enroltotp.password] }
  TwoFactorDisable (password)     ← 2FA off; the next enable writes verified: false
  SetState  enroltotp.twofa_off: true    ← the disable has committed; the catch reads this
  TwoFactorEnable  (password)
  SetState  enroltotp.phase: scan, enroltotp.uri: …, enroltotp.backup_codes: …,
            enroltotp.password: null
  _ref: actions/refetch_account.yaml     ← the tile drops to Off behind the modal
catch:
  :if  _state: enroltotp.twofa_off
  :then
    SetState  enroltotp.password: null
    _ref: actions/refetch_account.yaml   ← 2FA really is off; the tile must say so
    DisplayMessage  error  "Two-factor is now off. Try again to finish setting up your
                            new authenticator."
  :else
    DisplayMessage  error  "Couldn't start two-factor setup. Check your password and try again."
```

Three things about that catch, all load-bearing:

- **Lowdefy's event runner has no `finally`** — the first throw abandons the rest of the
  try chain and runs `catchActions` instead. A `TwoFactorEnable` that fails after
  `TwoFactorDisable` has committed (and it commits hard: `twoFactorEnabled: false`, row
  deleted, session rotated) would otherwise skip both the `SetState` and the refetch,
  leaving the user on phase `password` with 2FA genuinely off, the tile reading **On**,
  and a toast telling them to check their password.
- **`enroltotp.twofa_off` is an explicit flag, not an inference from the `_actions`
  response shape.** A failed action records `{error, action, index}` and a successful one
  `{type, response, index}`, so `_not: { _actions: <disable_id>.error }` is _also_ true
  when the `Validate` failed and the disable never ran — the most common way into this
  catch. `:if` / `:then` / `:else` work in `catch` lists, with `_state` resolving in the
  condition.
- **No refetch on the `:else` branch** — nothing changed, so it would be a request that
  can only fail. And `password: null` sits only on the disable-succeeded branch, because
  that is where the credential was actually spent; a wrong password should not clear the
  field the user is about to correct.

Phase `password` needs its own `Validate` for the same reason phase `scan` does: without
it an empty password round-trips to BetterAuth and returns as the catch-all toast — a
server rejection standing in for a client-side required check, telling the user their
password is wrong when they left it blank, and marking no field.

---

**Phase `scan`** — reached from `intent` `enrol` or `replace`. Gated
`_eq: [_state: enroltotp.phase, scan]`:

- Intro copy (existing `enroltotp_intro_scan` text is fine).
- The QR + manual-key + confirmation-code row — carry `enroltotp_row` / `enroltotp_qr` /
  `enroltotp_scancol` over, with the manual-key field replaced (below).
- One primary button, **"Confirm & enable"**:

```
Validate  params: { blockIds: [enroltotp.confirmation_code] }   ← the field, not the modal
TwoFactorVerify (code: _state enroltotp.confirmation_code)      ← throws on a bad code;
                                                                   chain stops, modal stays open
SetState  enroltotp.phase: codes
_ref: actions/refetch_account.yaml                              ← the tile flips to On behind the modal
```

Keep the existing `TwoFactorVerify` messages (`loading: Confirming…`,
`success: Two-factor authentication is on.`,
`error: That code is incorrect or has expired. Try again.`).

**The manual-entry key becomes a copyable `Paragraph`, not a disabled input, and it shows
the secret rather than the URI.** Today it is `id: enroltotp.uri`, a `TextInput` with
`disabled: true` (`modal_enroltotp.yaml:155-164`), which fails the "can't scan" user
twice over:

- **Not copyable.** Chromium and WebKit do not allow text selection inside a disabled
  input, so the only fallback is retyping a base32 string out of greyed-out low-contrast
  text. Lowdefy's `TextInput` has no read-only-but-selectable option.
- **Wrong value.** `enroltotp.uri` is BetterAuth's `totpURI` — a full
  `otpauth://totp/{issuer}:{email}?secret=…&issuer=…`. An authenticator app's
  manual-entry field wants the base32 **secret**; the whole URI generally fails there.

So the row becomes the `QRCode` block on the full `enroltotp.uri` as now, beside a
`Paragraph` with `code: true` (monospace, so `1`/`l` and `0`/`O` are distinguishable when
hand-transcribed) and `copyable: true`, under the same "Can't scan? Enter this key"
label, whose content pulls the `secret` param out of the URI:

```yaml
_js: |
  const uri = state('enroltotp.uri');
  if (!uri) return null;
  return new URLSearchParams(uri.split('?')[1] || '').get('secret');
```

`_js` rather than operator chaining because the operator form needs nested
`_string.split` plus array indexing to reach one query param — the "deeply nested or hard
to read" case the repo rule carves out.

A side effect worth knowing: `enroltotp.uri` **stops being a block id**. It becomes plain
`SetState`-written state that the engine never deletes on hide. It is still nulled on
reset — it carries the secret.

---

**Phase `codes`** — the body of the deleted `modal_backupcodes.yaml`, gated
`_eq: [_state: enroltotp.phase, codes]`:

- A **lead line gated on `intent`** (two branches in this task; Task 6 adds a third):

  | `intent`  | Lead line                                                                  |
  | --------- | -------------------------------------------------------------------------- |
  | `enrol`   | "Two-factor is on."                                                        |
  | `replace` | "Your new authenticator is active. These codes replace your previous set." |

  `replace` can share neither branch: `enable` recreates the `twoFactor` row with a fresh
  `backupCodes` array, so a replacing user's previous codes are dead too; and a bare
  "Two-factor is on" reads as first-time-enrolment confirmation to someone for whom it
  was already on. Keep the rest of the existing message ("Store these one-time codes
  somewhere safe — each works once if you lose your authenticator.") after the gated
  line.

- The **codes grid** — carry `backupcodes_grid` over unchanged (`_nunjucks` template
  reading `_state: enroltotp.backup_codes`).
- The **warning `Alert`** — carry `backupcodes_alert` over, but **correct the copy**: it
  currently promises "Download or copy them before closing", and there is no download.
  (There is no core download action — the only candidate is `DownloadXlsx` from the xlsx
  community plugin, absurd for six short codes.) Make it say copy only.
- A **Copy button** — `CopyToClipboard` on
  `_array.join: [_state: enroltotp.backup_codes, "\n"]`, with `messages.success: Copied`,
  wired to `onClick` and **not** to any close path. This is F21: today Copy is
  `cancelText` and the copy fires on `onClose`.
- `enroltotp.codes_saved` — `CheckboxSwitch`, `description: I've saved my backup codes`,
  `label: { disabled: true }` (see `modal_changepw.yaml:55-66` for the idiom — without
  `label.disabled` the form-item label falls back to rendering the block id).
- A primary **Done** button, `disabled: { _not: { _state: enroltotp.codes_saved } }`,
  self-closing via `CallMethod: { blockId: modal_enroltotp, method: toggleOpen }`, which
  fires `onClose` and clears the namespace.

The checkbox is **an attention device, not a lock** — Esc is one keystroke and cannot be
blocked, so its only real job is to make someone in dismiss-the-dialog mode read one
sentence before they act. Gating Done on the **Copy click** instead was rejected: people
legitimately save codes by screenshot, password manager, or on paper, and mandating a
clipboard write would force a one-time secret onto a clipboard that syncs across devices.
Clicking Copy also does not evidence saving.

Dismissing phase `codes` is **not** a lockout — it is only reachable after the second
factor already works, so what is lost is the fallback for a later lost device. That is
why the `backup_codes` clear stays on `onClose`: leaving them in state buys no recovery
(reopening goes through the trigger, which reseeds) and only leaves a one-time secret in
client state.

### 2. Seed the phase on the trigger — `tile_security.yaml`

In `modules/user-account/components/view/tile_security.yaml`, `twofa_manage_btn`'s
`onClick` (lines 187-193) gains a `SetState` **ahead of** its existing
`CallMethod toggleOpen`:

```
SetState  enroltotp.phase: password
          enroltotp.intent: <_if get_account.0.two_factor_enabled then replace else enrol>
          enroltotp.password: null, enroltotp.uri: null,
          enroltotp.confirmation_code: null, enroltotp.backup_codes: null,
          enroltotp.codes_saved: false, enroltotp.twofa_off: false
CallMethod  blockId: modal_enroltotp, method: toggleOpen
```

This is the **one** place `get_account.0.two_factor_enabled` is read for the modal, and
the button already reads it for its own Manage/Set-up label
(`tile_security.yaml:178-184`) — use the same `_boolean`-wrapped `_request` shape. The
state is written before the dialog exists, so there is no empty first frame and no
wrong-screen flash on any open.

**Intent is an explicit choice, never a live read.** All the wording — title, warning,
lead line — gates on this written-once leaf rather than on
`get_account.0.two_factor_enabled` directly, because phase `scan`'s chain ends with
`refetch_account.yaml` on purpose so the tile flips behind the modal. On a first-time
enrolment the flag turns true while the modal is still open on phase `codes`, which
would retitle it to the replacement variant while it shows the codes for the enrolment
that just succeeded. The replace branch moves the flag the other way at Generate, so a
live read would relabel a replacement as a first-time enrolment halfway through it. The
leaf holds an **enum, not a boolean**, because Task 6 adds a third value that a boolean
cannot separate.

Moving `refetch_account` off the phase-`scan` chain and onto Done was the other way to
stop the flag changing mid-flow, and was rejected: the tile would sit on a stale **Off**
for as long as the user reads their codes, and the refetch would ride on a button whose
job is closing, where a failure is silent.

### 3. Delete the second modal

- Delete `modules/user-account/components/view/modal_backupcodes.yaml`.
- Drop its `_ref` from `modules/user-account/pages/view.yaml:88` (the comment above the
  modal list says "5 modals" — make it four).
- Confirm no other reference survives: `grep -rn "modal_backupcodes" modules/ apps/`
  must come back empty.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- `grep -rn "modal_backupcodes" modules/ apps/` returns nothing; the file is deleted and
  `view.yaml` mounts four modals.
- `modal_enroltotp.yaml` has `footer: false`, `maskClosable: false`, `layout.gap: 16`, no
  `okText`/`cancelText`/`onOk`, and **no `onOpen`**.
- Every body block carries a `visible` gate of the form
  `_eq: [_state: enroltotp.phase, <password|scan|codes>]`; no block gates on
  `enroltotp.uri` presence.
- Both `Validate` actions name input ids (`enroltotp.password`,
  `enroltotp.confirmation_code`); neither names `modal_enroltotp`.
- The `onClose` `SetState` enumerates all eight leaves, with `codes_saved` and
  `twofa_off` set to `false` and the rest to `null`.
- `tile_security.yaml`'s `twofa_manage_btn` writes the seed before `toggleOpen`, reading
  `get_account.0.two_factor_enabled` exactly once.
- No `enroltotp.uri` **block id** remains anywhere; the manual key is a `Paragraph` with
  `code: true` and `copyable: true`.
- Inspect the built artifact under
  `apps/demo/.lowdefy/server/build/pages/user-account/view*` and confirm the three phase
  gates and both button chains resolved.
- Live verification is Task 5 — nothing here is provable by build alone.

## Files

- `modules/user-account/components/view/modal_enroltotp.yaml` — modify — the full rework
  above.
- `modules/user-account/components/view/modal_backupcodes.yaml` — **delete** — its body
  becomes phase `codes`.
- `modules/user-account/pages/view.yaml` — modify — drop the `modal_backupcodes` `_ref`
  (line 88) and fix the modal-count comment.
- `modules/user-account/components/view/tile_security.yaml` — modify — `twofa_manage_btn`
  `onClick` gains the seed ahead of `toggleOpen`.

## Notes

- **Use the `lowdefy-docs` MCP for every block contract you touch** — `Modal`
  (`footer`, `maskClosable`, `title`), `Paragraph` (`code`, `copyable`), `Button`
  (`disabled`, `block`, `color`, `variant`), `CheckboxSwitch` (`description`,
  `label.disabled`), `CopyToClipboard` (`messages.success`), `QRCode`, `Validate`
  (`params.blockIds` / `params.regex`). Never guess a prop name. The MCP needs
  `pnpm ldf:d` running; if it is down, stop and ask rather than guessing.
- **`onOpen` does fire on `toggleOpen`** — it is not a missing event. It fires _after_
  the dialog paints, which is the whole reason the seed is on the trigger. `onClose` is
  unaffected by that ordering and fires on every close path (the X, Esc, and mask-click
  all route through antd's `onCancel`), so it carries the whole clear.
- **The backup-codes state path is correct** — the client's `unwrap()` returns
  BetterAuth's `data` directly, so `_actions.<enable_id>.response.backupCodes` is the
  right shape. A live check that the codes actually render is still owed (Task 5).
- Keep block ids **snake_case** except where the id _is_ a state path
  (`enroltotp.password`, `enroltotp.confirmation_code`, `enroltotp.codes_saved`), which
  is the repo's input-id convention and is what makes the state contract work.
- `apps/demo/` needs **no change**: the security tile already exercises this modal on the
  demo's account page, and the warning copy lives in the modal rather than on the
  trigger. The tile's only edit is the seed, and it is in the module.
- Do **not** touch `CLAUDE.md` here — its two new rules (D3's leaf-null reset, D6's
  `Validate` scoping) are already present under **Lowdefy Project Rules**.
