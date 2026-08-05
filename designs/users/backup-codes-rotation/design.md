# Backup-codes rotation without re-enrolment

A user who has burned through their backup codes, or never saved them, currently
has only one way to get a fresh set: re-run enrolment, which rotates the TOTP
secret and invalidates their working authenticator app. This design adds the safe
operation alongside it — **"Get new backup codes"**, which leaves the
authenticator alone — and turns the security tile's **Manage** button into a
choice between the two rather than a shortcut to the destructive one.

Split out of [`../2fa-enrolment-modal/design.md`](../../users/_completed/2fa-enrolment-modal/design.md),
which shipped everything that carries no upstream dependency. That design's D4
established _why_ the routing is a hazard and removed the lockout half of it (by
turning 2FA off before re-enrolling); what it could not ship is the second option,
because the platform action does not exist yet.

**Blocked on [upstream ask 1](upstream-asks.md)** —
`TwoFactorGenerateBackupCodes`, which `@lowdefy/client` does not wrap. Nothing
here can be built until it lands, and nothing here needs redesigning when it does:
one phase, one button, one action call, two copy branches. Re-checked against the
platform's landed [two-factor-lifecycle design](../../../../lowdefy-design/designs/auth-upgrade/features/two-factor-lifecycle/design.md):
it keeps this action out of scope (its Non-goals) and names this ask as the owner,
confirming rotation is "a Lowdefy gap, not an upstream defect" and that
`generate-backup-codes` leaves the secret, `verified` and `twoFactorEnabled`
untouched — the non-destructiveness D1 and D6 rest on. The block stands.

## What already ships

`modules/user-account/components/view/modal_enroltotp.yaml` is one modal with
three phases (`password` → `scan` → `codes`) and two intents (`enrol`,
`replace`), both held as explicit state values and seeded by
`tile_security.yaml`'s `twofa_manage_btn` **before the dialog mounts**. There is
no native footer; each phase owns its own body buttons.

This design consumes that contract and extends two enums. It restructures nothing:

| Key                | Today                           | After           |
| ------------------ | ------------------------------- | --------------- |
| `enroltotp.phase`  | `password` \| `scan` \| `codes` | \+ `choose`     |
| `enroltotp.intent` | `enrol` \| `replace`            | \+ `codes_only` |

The remaining leaves (`password`, `uri`, `confirmation_code`, `backup_codes`,
`codes_saved`, `twofa_off`), the `onClose` `SetState` enumerating all eight of
them, and the `intent`-gated title with its **"Two-factor authentication"**
default branch are all unchanged and already in place.

## Proposed change

- **Manage opens on a choice, not on a password field.** A new phase `choose`,
  reached only when the caller already has 2FA on: no inputs, a line of intro
  copy, and two buttons that each write `phase: password` plus their `intent`.
- **A third `intent`, `codes_only`**, with its own primary button on phase
  `password` ("Get new codes") that calls `TwoFactorGenerateBackupCodes` and jumps
  **straight to phase `codes`**, skipping `scan` entirely — nothing about the
  authenticator changes, so there is nothing to re-scan.
- **A Back button** on phase `password`, visible when the caller arrived via
  `choose` (`intent` is `replace` or `codes_only`).
- **Two copy branches** — the title (`New backup codes`) and the phase-`codes`
  lead line ("These replace your previous backup codes.").
- **The trigger's enrolled arm switches** from `phase: password, intent: replace`
  to `phase: choose, intent: null`.
- **A docs correction**: `auth-methods.md` currently states that re-enrolment is
  the only route to fresh codes. It stops being true.

## Key decisions and rationale

### D1. Why this is a separate operation and not a parameter

BetterAuth already separates the two, and the separation is the whole point.
`POST /two-factor/generate-backup-codes` is password-gated, requires
`twoFactorEnabled`, and updates **only** the `backupCodes` field on the existing
row — secret, `verified` and `user.twoFactorEnabled` untouched
(`dist/plugins/two-factor/backup-codes/index.mjs:212-265`). `POST
/two-factor/enable`, by contrast, deletes the existing `twoFactor` row and creates
a new one with a fresh secret.

Folding them behind a flag on `TwoFactorEnable` was considered and rejected, both
here and in the ask: **the two operations differ in blast radius, not in input.**
One rotates a shared secret and invalidates a device; the other rotates recovery
codes. Collapsing them puts the destructive path one typo away.

### D2. The two reasons a user opens Manage are not equally dangerous or equally common

- _"I've lost or rotated my device"_ — genuinely needs a new secret. **Rare.**
- _"I need new backup codes"_ — needs nothing rotated at all. **Much more common**,
  because codes are consumed one per use and nothing in the tile surfaces how many
  are left, so reaching zero is silent.

Routing the second through `enable` is the hazard: a user who wants recovery codes
pays for them with their authenticator app. The parent design's D4 already removed
the _lockout_ (replacement now turns 2FA off first, so abandoning leaves a visible,
self-recoverable gap instead of an unrecoverable one). It could not remove the
_cost_ — that needs the second option to exist. Warning someone about a price they
should not be paying is treating a design problem as a copy problem.

Separating recovery-code rotation from second-factor re-enrolment is the standard
pattern among identity providers — GitHub, Google and Microsoft all expose it as a
distinct self-service operation, for exactly this reason.

### D3. The safe option is primary, and the warning does not follow it onto that screen

Phase `choose` lists **"Get new backup codes" first, as the primary**; replacement
is secondary (`variant: outlined`), with its consequence stated in its own
supporting line rather than an `Alert`.

The red warning `Alert` stays on phase `password` gated to `intent: replace`,
where the destructive action is actually about to fire. A red alert sitting next to
"Get new backup codes" would make the harmless path look dangerous, which is the
opposite of what the choice screen is for.

### D4. Phase `choose` is entered with `intent: null`, which is why the title's default is load-bearing

The parent design deliberately shipped the title as a `_switch` with a
**`default: Two-factor authentication`** branch rather than a three-way
conditional, precisely so this phase has a neutral label. `Modal.js` passes
`title` straight through to antd, so a null title renders an **unlabelled header** —
on the one screen that offers two consequential choices.

`intent: null` is otherwise safe because no **body** group gates on `intent ==
null`; it is the `choose` buttons that write it. Do not replace the default with a
three-way conditional, and do not invent a placeholder `intent`.

### D5. Back exists because the warning screen is past the last point of reconsideration

With `footer: false` there is no Cancel, so a user who reads the replacement
warning and thinks better of it would otherwise have to dismiss the whole dialog.
Nothing is spent at that point, so this is comprehension rather than data loss —
and it is one button.

Back ships **with** phase `choose` rather than separately, because without a
`choose` phase it has nowhere to go.

### D6. No `refetch_account` on the `codes_only` branch

The tile already reads **On** and nothing it displays has changed — secret,
`verified` and `twoFactorEnabled` are all untouched by this call. A refetch here
would be a request that can only fail.

This is the same argument the parent design makes for the `:else` branch of the
replace chain's `catch`.

### D7. The choose/codes affordance gates on the TOTP flag, not `_user.twoFactorEnrolled`

The trigger reads `get_account.0.two_factor_enabled` — the per-account TOTP flag — to
pick its enrolled arm (`tile_security.yaml`), and this design's `choose` and
`codes_only` branches ride that same read. The platform's two-factor-lifecycle design
adds `_user.twoFactorEnrolled` (`twoFactorEnabled || passkeyCount > 0`) for the tile's
enrolment nag, and the two must not be conflated here: a passkey-only user is
`twoFactorEnrolled: true` but holds no TOTP secret and no backup codes, so offering
them "Get new backup codes" would fire `TwoFactorGenerateBackupCodes` into a
`TWO_FACTOR_NOT_ENABLED` throw. Backup codes are a TOTP artifact; their rotation stays
keyed to `two_factor_enabled`, even as the surrounding tile's enrolment nag migrates
to `twoFactorEnrolled`.

## Verification

Build (`pnpm ldf:b`) proves the config compiles; nothing here is provable by build
alone. On the auth-testing rig, as a credentialed user with 2FA already on — see the
auth-testing campaign ([`../auth-testing/tasks/02-account-workspace.md`](../auth-testing/tasks/02-account-workspace.md), Phase 2's 2FA items):

1. **The action exists.** Confirm `TwoFactorGenerateBackupCodes` is in the installed
   catalog (`lowdefy_list_types` with `kind: actions`) **before writing any YAML**.
2. **New backup codes** — Manage → "Get new backup codes" → password → codes render
   **directly, with no QR step**. Afterwards the **existing authenticator still
   verifies**, the tile still reads **On**, and a **previously-issued backup code is
   now rejected**. This is the case that proves the two Manage options are genuinely
   different operations.
3. **Manage opens on `choose`** for an enrolled caller — two buttons, no inputs, safe
   option first and primary, and a **titled** modal (the `intent: null` default).
4. **Back** returns to `choose` with a titled modal and a **blank password**.
5. **The replace path still behaves** — the parent design's replacement and
   abandon-mid-flow checks must still pass, since this change moves the trigger's
   enrolled arm and adds a button beside the existing ones.
6. **A caller with 2FA off never sees `choose`** — Set up still opens straight on the
   password phase with `intent: enrol`.

## Non-goals

- **A remaining-codes count in the security tile.** Backup codes are consumed one
  per use and nothing surfaces how many are left, which is the other half of why
  users reach zero unaware. BetterAuth's `viewBackupCodes` is `serverOnly` and
  returns the codes themselves rather than a count
  (`dist/plugins/two-factor/backup-codes/index.mjs:267-286`), so a count needs a
  server-side endpoint of its own — a separate change, and one worth having now that
  this design gives the tile somewhere to send the user.
- **A custom plugin action hand-rolling `fetch`** against
  `/api/auth/two-factor/generate-backup-codes` as a stopgap. Rejected: it would
  duplicate `unwrap`, `basePath` resolution and error mapping outside the client that
  owns them (`getActionMethods` exposes no auth client to a custom action, so there is
  nothing to reuse), and it would be deleted the moment the real action lands. A second
  way to call auth is worse than waiting — see the ask's fallback section.
- **Anything else in the enrolment modal.** The phased rework, the state hygiene, the
  `Validate` scoping and the disable-first replace chain all shipped in the parent
  design and are not revisited here.
- **The forced-enrolment page.** The platform's two-factor-lifecycle design adds a
  standalone `authPages.twoFactorEnrol` page, where the engine redirects an
  _unenrolled_ caller under `auth.twoFactor.required`. That is a different surface for a
  different population — this design's modal is voluntary management for an
  _already-enrolled_ caller — and it neither supersedes nor touches the modal.
