# Review 3 — Third pass on the disable-first / `codes_only` design

Reviews 1 and 2 are fully annotated; nothing settled there is re-raised. This pass
reads the current design against the code, concentrating on what the second
resolution added: the disable-first replace chain, the `choose` phase and its
`intent` enum, the Back button, and D6's per-file `Validate` table.

Most of what the design leans on checks out and is not re-raised. Verified fresh
this pass: `triggerSetOpen` fires `onOpen`/`onClose` on `toggleOpen` and calls
`setOpen` synchronously, and `footer: false` → `extraProps.footer = null`
(`blocks-antd/dist/blocks/Modal/Modal.js:20-32,47-53`); `disable` takes
`sensitiveSessionMiddleware` — an _authoritative_, not a _fresh_, session
(`better-auth/dist/api/routes/session.mjs:328-335`), so the chained call is not
exposed to `SESSION_NOT_FRESH`, and it rotates the session cookie before `enable`
runs on plain `sessionMiddleware` (`two-factor/index.mjs:53-56,163-178`);
`generate-backup-codes` is `sessionMiddleware` + password + `twoFactorEnabled`,
touching only `backupCodes` (`backup-codes/index.mjs:212-265`); `Block.reset`'s
invisible-input restore does _not_ resurrect a typed password across the new Back
button, because Back nulls it while the input is still visible
(`Block.js:168-196,236-239`); a body button closing its own Modal via `CallMethod`
has a precedent (`workflows/components/check-action-modal.yaml:150-160`);
`Paragraph.content` is a real property rendered through `renderHtml`
(`Paragraph/meta.js:37-42`, `Paragraph.js:21-27`); the `_js: |` inline-string form
the manual-key extraction uses is an existing repo idiom
(`user-admin/pages/invite.yaml:195-197`); and both user-account and user-admin
manifests mandate the `profile.` prefix on consumer-supplied field blocks
(`user-account/module.lowdefy.yaml:70-75`, `user-admin/module.lowdefy.yaml:88-105`),
so D6's namespace regexes are sound for those sites.

Three findings.

### 1. `required: true` on a `MultipleSelector` can never fail, so D6's fix does not make either `roles` guard bite

> **Resolved.** Confirmed independently: the synthesised required test is
> `pass: { _not: { _type: 'none' } }` (`engine/dist/Block.js:280-288`), `_type: 'none'`
> reads `get(state, blockId)` (`operators-js/…/shared/type.js:20-24,44`), and
> `Block.reset` seeds an undefined array input with `enforceType('array', null)` → `[]`
> and writes it to state (`Block.js:168-196`, `helpers/dist/type.js:188-189`). `[]` is
> not `none`, so the rule cannot fail. Both `roles` guards are inert.
>
> **The product question is already answered elsewhere, so no new `validate:` rule is
> added here.** `designs/users-fixes/role-editing` D6 deletes `required: true` from
> both role selectors outright, on the grounds that a role-less member is a supported
> state (`appRoles` is `required: false` and simply absent for a self-signed-up
> member), and it owns both files. Adding an array-aware rule here would newly forbid
> something the platform supports, and would collide with that design.
>
> D6 is corrected in this design: `modal_access` has **0** required inputs and joins
> `modal_global` as a dead guard, `invite_form` has **2** (the names, not `roles`), and
> the count becomes **six of eight broken today**, not seven. The scope paragraph keeps
> its "two of those four" claim with the identity fixed — the live user-admin guards are
> `modal_profile` and `invite_form`'s `profile.*` half, not `modal_access`. Verification
> step 8 repoints the multi-pattern-regex proof onto `invite_form`, and `modal_access`
> joins `modal_global` as a site needing a temporarily-required field to prove anything.
> `^roles$` **stays** in both regexes: it buys nothing today, but it is a live input the
> form writes to, and the single rule is "validate the namespace the form writes to" —
> dropping it would be the special case. (Contrast `user-admin/modal_profile`'s `email`,
> which is `disabled: true` display and never an input the user fills.)
>
> Also settled while here: role-editing's Non-goals called the eight dead `Validate`
> actions "owed a follow-up design covering all eight". **All eight stay in this
> design** — the per-file regex table is the hard part and it is written down. That
> non-goal is amended to point here.

D6's table gives `user-admin/modal_access` **1** required input and `invite_form`
**3** (the two names plus `roles`), and the scope paragraph that keeps the four
`user-admin` sites in this change rests on it: _"two of those four (`modal_access`,
`invite_form`) have a live required-field guard that does nothing today."_
Verification step 8 then nominates `modal_access` as the proof case — "its required
input is bare `roles`, so this is the one that proves the multi-pattern regex".

Both `roles` blocks are `MultipleSelector` with `required: true`
(`user-admin/components/view/modal_access.yaml:54-56`,
`user-admin/components/invite_form.yaml:48-50`), and a `MultipleSelector` cannot
hold a value that fails a required check:

- The required test the engine synthesises is `pass: { _not: { _type: 'none' } }`
  (`engine/dist/Block.js:280-288`), and `_type: 'none'` is `null` or `undefined`
  only (`helpers/dist/type.js:160`).
- `MultipleSelector`'s `valueType` is `'array'`
  (`blocks-antd/dist/blocks/MultipleSelector/meta.js:28`), and
  `enforceType('array', …)` returns `[]` for anything that is not already an array
  (`helpers/dist/type.js:188-189`). An unselected or cleared selector is `[]`, never
  `null`.

So `[]` passes `_not: {_type: 'none'}`. Swapping the container id for
`regex: ['^roles$', '^member_attributes\.']` makes the matcher _match_ `roles`,
and the block then contributes zero errors anyway. This is independent of the
matcher bug D6 fixes — it would be equally true with an explicit `blockIds: [roles]`.

Three consequences, all in this design's own claims:

- **`modal_access` becomes a second dead guard, not a repaired live one.** Its only
  other inputs are the consumer-supplied `fields.member_attributes` blocks, none
  required in the demo (`apps/demo/modules/user-admin/member_attributes_fields.yaml`
  is one non-required `Selector`). So after the fix it sits exactly where
  `modal_global` sits, and the scope argument loses one of its two strongest
  instances. `invite_form` keeps a genuine repair — `profile.given_name` /
  `.family_name` are `TextInput`s, whose `''` enforces to `null` — but its `roles`
  guard stays inert, so the invite form will still send an invitation with an empty
  roles array.
- **Verification step 8's `modal_access` case cannot fail.** Submitting it with roles
  cleared will pass and prove nothing — the exact vacuous-pass failure mode the
  design already calls out for `modal_global`. As written, the step will read as
  confirmation that the multi-pattern regex works.
- The claim that "none of the eight blocks carries a custom `validate:` array, so
  `required: true` is the only validation any of them would ever run" is right, and
  is precisely why `roles` is unprotected.

**Fix:** if an empty roles list should be rejected, `required: true` is the wrong
tool and the matcher change does not save it — the `roles` blocks need a real
`validate:` entry (e.g. `pass: { _gt: [{ _array.length: { _state: roles } }, 0] }`,
message "Select at least one role"), in both files. Then correct D6's counts and the
scope paragraph, and repoint verification step 8 (either `modal_access` proves the
multi-pattern regex only once `roles` has a working validation, or `invite_form`
becomes the proof case via its `profile.*` half). If instead an empty roles list is
acceptable, drop `required: true` from both blocks rather than leaving a flag that
reads as a guard and is not one — that is the same "config looks protected" defect
D6 exists to remove, one layer down.

### 2. The replace chain's `catch` leaves the tile reading **On** after 2FA has actually been turned off

> **Resolved.** Confirmed: `callActions` has no `finally` — the first throw abandons
> the rest of the try chain and runs `catchActions` instead
> (`engine/dist/Actions.js:331-360`), so both the `SetState` and `refetch_account` are
> skipped while `disable`'s commit stands.
>
> The catch now branches, and it branches on an **explicit flag, not on the `_actions`
> response shape**. A `SetState { enroltotp.twofa_off: true }` goes in the try chain
> immediately after a successful `TwoFactorDisable`, and the catch's `:if` reads
> `_state: enroltotp.twofa_off`. Inferring from `_actions` was rejected: the only
> available test is that a failed action records `{error, action, index}` while a
> successful one records `{type, response, index}` (`Actions.js:391,495-514`), so
> `_not: { _actions: enroltotp_disable.error }` is **wrong** — it is also true when the
> `Validate` failed and the disable never ran at all, which is the most common way into
> this catch. Beyond the bug, an explicit value is what D2 and D4 already decided for
> `phase` and `intent`.
>
> On that branch the catch runs `refetch_account` and toasts "Two-factor is now off. Try
> again to finish setting up your new authenticator."; otherwise it keeps today's
> "Couldn't start two-factor setup. Check your password and try again." and runs no
> refetch, since nothing changed (the same argument the `codes_only` branch already
> makes). `password: null` moves into the disable-succeeded branch too — spent means
> spent — and the retry needs it retyped either way. `enroltotp.twofa_off` joins the
> state table and the leaf list, resetting to `false` as a boolean zero per D3.
>
> `:if` / `:then` / `:else` are confirmed available in `catch` lists, with `_actions`
> and `_state` resolving in the condition (`Actions.js:139-190,325`, and the
> events-and-actions concept doc: "controls can be used in both `try` and `catch`
> action lists").

The `intent: replace` chain in the phase-`password` spec is
`Validate → TwoFactorDisable → TwoFactorEnable → SetState → refetch_account.yaml`,
all inside the branch's `try`, with a `catch` that toasts. The design puts
`refetch_account` on this branch deliberately, and says why: _"a user who abandons at
phase `scan` needs the tile to say so. Leaving it stale on **On** is the dangerous lie
— it tells someone who just abandoned a replacement that they still have a second
factor."_

That lie is exactly what the `catch` path produces. Lowdefy's event runner has no
`finally`: `callActions` runs the try-chain, and on the first throw abandons the rest
of it and runs `catchActions` instead
(`engine/dist/Actions.js:331-360`). So if `TwoFactorEnable` throws after
`TwoFactorDisable` has already committed — and `disable` commits hard: `twoFactorEnabled:
false`, `twoFactor` row deleted, session rotated (`two-factor/index.mjs:152-180`) — the
`SetState` and the `refetch_account` both never run. The user is left on phase
`password` with a toast, 2FA genuinely off, and the security tile still reading **On**
with a "Turn off" button beside it.

D4 acknowledges the state ("If `enable` fails anyway, 2FA is off and the user sees the
branch's `catch` toast — recoverable by retrying") but not the stale tile, which is the
one thing the design elsewhere calls dangerous.

**Fix:** put `_ref: actions/refetch_account.yaml` in the replace branch's `catch` as
well as its `try`. Worth specifying the catch copy separately too, while that block is
open: one generic "Couldn't start two-factor setup. Check your password and try again."
covers two materially different outcomes — the wrong-password case where nothing
happened, and the enable-failed case where the user's second factor is now off. The
second needs to say so ("Two-factor is now off. Try again to finish setting up your new
authenticator."), which means the branch wants the failure distinguished rather than a
single blanket toast. `enroltotp.password` also survives that path, since the `SetState`
that nulls it is on the success side; `onClose` still catches it, so this is hygiene
rather than a leak, but it is the same "clear the credential the moment it is spent"
rule one branch over.

### 3. The very first open of the modal renders an empty body — the case D3's never-null-`phase` rule exists to prevent

> **Resolved — the seed moves onto the trigger, and the design gets smaller for it.**
> Confirmed: `view.yaml:34-35` mounts only `refetch_account`, nothing writes
> `enroltotp.*`, and `triggerSetOpen` paints before `onOpen`'s `SetState` resolves
> (`blocks-antd/…/Modal/Modal.js:20-32`). The finding's own preferred fix is taken.
>
> `tile_security.yaml`'s `twofa_manage_btn` `onClick` now writes the `phase`/`intent`
> pair **and** the leaf nulls, then calls `toggleOpen`. It is the only entry point —
> the sole references to `modal_enroltotp` outside its own file are the page's `_ref`
> (`view.yaml:87`) and that button (`tile_security.yaml:192`) — and it already reads
> `get_account.0.two_factor_enabled` for its own Manage/Set-up label.
>
> Four things fall out, all subtractions:
>
> - **`onOpen` goes away entirely.** The seed and the reset are one `SetState` on the
>   trigger, ahead of the mount.
> - **D3's never-null-`phase` exception goes away.** `onClose` nulls `phase` and
>   `intent` with every other leaf, because nothing can reach the modal without passing
>   through the trigger that seeds them.
> - **The `phase: password, intent: enrol` placeholder goes away**, and with it the
>   paragraph justifying a "transient valid-but-wrong screen". There is no wrong-screen
>   flash on any open now, first or subsequent.
> - The `triggerSetOpen` paint-order fact stays in D3, recast: it is why `onOpen` cannot
>   be the seed site, rather than why `phase` must never be null.
>
> The cost is real and is recorded in D1: the phase decision leaves the modal. The modal
> still owns every subsequent write and the `onClose` clear, and the tile is already the
> block that knows the enrolment state. `tile_security.yaml` joins Files changed — it had
> been listed as needing no edit. The title's `intent: null` fallback is unaffected and
> still load-bearing (phase `choose` and the Back button).

D3 makes `phase` the one leaf never nulled, and pays for it: `onClose` sets
`phase: password` with `intent: enrol`, which the design concedes is a
"valid-but-wrong screen" for an already-enrolled caller, justified because "a
transient valid-but-wrong screen beats a transient broken one". The reasoning is
right, and the mechanism is confirmed — `triggerSetOpen` fires `onOpen` without
awaiting it and calls `setOpen` synchronously
(`blocks-antd/dist/blocks/Modal/Modal.js:20-32`).

But that only covers the _second and later_ opens. On first page load nothing has
written `enroltotp.*` at all: `user-account/pages/view.yaml:34-35` sets `onMount` to
`_ref: actions/refetch_account.yaml` and nothing else, and no reset has run. So
`enroltotp.phase` is `undefined`, every group's `_eq: [phase, '<name>']` is false, and
the first open of the session paints a titled modal with no body — precisely the state
D3 calls "observable" and legislates against. It is also the worst case to leave
uncovered: a first-time enrolment is the one flow every user hits exactly once, and it
is the one that gets the empty frame.

**Fix — and there is a better one available than seeding another default.** The
cleanest option the design does not weigh is to move the seed onto the _trigger_:
`tile_security.yaml`'s `twofa_manage_btn` already reads
`get_account.0.two_factor_enabled` for its own Manage/Set-up label
(`tile_security.yaml:174-186`), so its `onClick` can `SetState` the `phase`/`intent`
pair and _then_ `CallMethod toggleOpen`. The state is written before the dialog mounts,
so there is no empty first frame and no wrong-screen flash on any open, first or
subsequent — which also lets `onClose` stop setting `phase: password, intent: enrol`
as a placeholder it does not mean.

The cost is that the phase decision leaves the modal, against D1's "one namespace, one
owner, one cleanup site" — though the modal still owns every subsequent write and both
resets, and the tile is already the block that knows the enrolment state. The cheaper
alternative is to seed `enroltotp.phase` on the page's `onMount` alongside
`refetch_account`, which keeps `onOpen` as the decision site and costs one `SetState`.
Either closes the gap; the current design closes it only for reopens.
