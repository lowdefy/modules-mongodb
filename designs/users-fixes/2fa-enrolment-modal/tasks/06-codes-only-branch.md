# Task 6: The `codes_only` branch — phase `choose`, Back, and new backup codes

> **BLOCKED on [upstream ask 1](../upstream-asks.md) — do not start until
> `TwoFactorGenerateBackupCodes` ships in `@lowdefy/client` / `@lowdefy/actions-core`.**
> Confirm the action exists (`lowdefy_list_types` with `kind: actions`, or check
> `@lowdefy/client/dist/auth/createAuthMethods.js` for a `twoFactorGenerateBackupCodes`
> entry) before writing any YAML.

## Context

Task 3 shipped `modules/user-account/components/view/modal_enroltotp.yaml` as a
three-phase modal (`password` → `scan` → `codes`) with two intents, `enrol` and
`replace`, seeded by `tile_security.yaml`'s `twofa_manage_btn`.

That leaves **Manage able to mean only one thing: replace the authenticator.** The two
reasons a user opens it are neither equally dangerous nor equally common:

- _"I've lost or rotated my device"_ — genuinely needs a new secret. Rare.
- _"I need new backup codes"_ — needs nothing rotated at all. Much more common, since
  codes are consumed one per use with no remaining-count surface anywhere in the tile, so
  reaching zero is silent.

Routing the second through `enable` is the whole hazard: a user who wants recovery codes
pays for them with their authenticator app. BetterAuth separates the two operations —
`POST /two-factor/generate-backup-codes` is password-gated, requires `twoFactorEnabled`,
and updates **only** the `backupCodes` field on the existing row; secret, `verified` and
`user.twoFactorEnabled` are untouched. Lowdefy did not expose it, which is the upstream
ask this task waits on.

Separating recovery-code rotation from second-factor re-enrolment is the standard pattern
among identity providers, for exactly this reason.

## Interfaces

- **Consumes** (from Task 3): the `enroltotp.*` state contract —
  `phase` (`password` | `scan` | `codes`), `intent` (`enrol` | `replace`), `password`,
  `uri`, `confirmation_code`, `backup_codes`, `codes_saved`, `twofa_off`; the
  `onClose` `SetState` enumerating all eight leaves; the `intent`-gated title with its
  **"Two-factor authentication"** default branch; the `intent`-gated lead line in phase
  `codes`; and `tile_security.yaml`'s seed `SetState` ahead of `CallMethod toggleOpen`.
- **Produces:** a fourth phase value `choose` and a third `intent` value `codes_only`.
  Both extend existing enums — nothing is restructured.

## Task

### 1. Add phase `choose` to `modal_enroltotp.yaml`

Reached only when the caller already has 2FA on. **No inputs** — a line of intro copy and
two buttons, each setting `phase: password` plus its `intent` in one `SetState`, so no
request runs here and nothing is spent:

```
"Get new backup codes"   → SetState { enroltotp.phase: password, enroltotp.intent: codes_only }
"Replace authenticator"  → SetState { enroltotp.phase: password, enroltotp.intent: replace }
```

All blocks gate `visible: { _eq: [_state: enroltotp.phase, choose] }`.

**The safe option is listed first and is the primary; replacement is secondary**
(`variant: outlined`), with its consequence stated in its own supporting line rather than
an `Alert`. The red alert belongs on the phase where the destructive action is actually
about to fire — a red alert next to "Get new backup codes" would make the harmless path
look dangerous.

This phase is entered with `intent: null`, which is why the title's default branch is
load-bearing: it renders **"Two-factor authentication"**, the neutral label, on the one
screen that offers two consequential choices. Do not replace the default with a
three-way `_if`.

### 2. Add the `codes_only` primary button to phase `password`

A third `intent`-gated button, labelled **"Get new codes"**. It skips phase `scan`
entirely, because nothing about the authenticator changes:

```
try:
  Validate  params: { blockIds: [enroltotp.password] }
  TwoFactorGenerateBackupCodes (password: _state enroltotp.password)
  SetState  enroltotp.phase: codes
            enroltotp.backup_codes: <_actions: <id>.response.backupCodes>
            enroltotp.password: null
catch:
  DisplayMessage  error  <a friendly password message>
```

**No `refetch_account` on this branch** — the tile already reads **On** and nothing it
displays has changed, so the refetch would be a request that can only fail.

### 3. Add the Back button to phase `password`

A **secondary** button, `visible` when `intent` is `replace` **or** `codes_only` — i.e.
when the caller arrived via phase `choose`:

```
SetState  enroltotp.phase: choose, enroltotp.intent: null, enroltotp.password: null
```

The replacement warning is the one screen where the design is actively trying to get the
user to reconsider, and without a Back it sits one step _past_ the last point they can
change their mind: `footer: false` means there is no Cancel, so reading the alert and
thinking better of it costs them the whole dialog. Nothing is spent yet, so this is
comprehension rather than data loss — and it is one button.

### 4. Add the two `intent: codes_only` copy branches

- **Title**: `New backup codes`.
- **Phase `codes` lead line**: "These replace your previous backup codes."

Phase `codes` is otherwise shared by all three intents unchanged. That reuse is why this
branch is cheap: the screen that renders a fresh set of codes already exists.

### 5. Switch the trigger's seed arm — `tile_security.yaml`

`twofa_manage_btn`'s seed currently sends an already-enrolled caller to
`phase: password, intent: replace`. Change that arm to `phase: choose, intent: null`:

```
SetState  enroltotp.phase: <_if two_factor_enabled then choose else password>
          enroltotp.intent: <_if two_factor_enabled then null else enrol>
          … the six other leaves unchanged …
```

`intent: null` is safe here because no **body** group gates on `intent == null` — it is
the `choose` buttons that write it. The **title** is the one thing that needs the null
case, and it already has its default branch.

### 6. Amend the docs

`docs/user-account/concepts/auth-methods.md`'s **Two-factor enrolment** subsection (Task 4) currently says the only route to fresh codes is re-enrolment. Correct it: **a fresh
set can be issued from Manage without touching the authenticator.** The distinction
between the two Manage options is exactly what a support agent gets wrong, so state both
plainly. Then `pnpm docs:gen` and `pnpm docs:check`.

## Acceptance Criteria

- `TwoFactorGenerateBackupCodes` is confirmed present in the installed action catalog
  before any YAML is written.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- Phase `choose` renders two buttons and **no inputs**, safe option first and primary.
- Phase `password` has three `intent`-gated primary buttons and one Back button visible
  for `replace` and `codes_only` only.
- The trigger seeds `choose` / `null` for an enrolled caller and `password` / `enrol`
  otherwise.
- The `onClose` clear is unchanged — it already covers `phase` and `intent`.
- `pnpm docs:check` passes.
- **Live (design Verification step 8):** with 2FA on, Manage → "Get new backup codes" →
  password → codes render **directly with no QR step**; the **existing authenticator
  still verifies** afterwards, the tile still reads **On**, and a previously-issued
  backup code is now rejected. This is the case that proves the two Manage options are
  genuinely different operations.
- **Live (Verification step 5, second half):** Manage now opens on `choose`, and Back
  returns to `choose` with a **titled** modal and a blank password.

## Files

- `modules/user-account/components/view/modal_enroltotp.yaml` — modify — phase `choose`,
  the `codes_only` button, the Back button, two copy branches.
- `modules/user-account/components/view/tile_security.yaml` — modify — the seed's
  enrolled arm.
- `docs/user-account/concepts/auth-methods.md` — modify — correct the fresh-codes claim.
- `docs/llms.txt` — modify (generated) — `pnpm docs:gen`.
- `designs/users-fixes/2fa-enrolment-modal/upstream-asks.md` — modify — mark ask 1
  delivered.

## Notes

- **Do not hand-roll a stopgap.** A custom plugin action calling `fetch` against
  `/api/auth/two-factor/generate-backup-codes` was considered and rejected: it duplicates
  `unwrap`, `basePath` resolution and error mapping outside the client that owns them
  (`getActionMethods` exposes no auth client to a custom action, so there is nothing to
  reuse), and it would be deleted the moment the real action lands. A second way to call
  auth is worse than waiting.
- **Do not fold this into `TwoFactorEnable` by parameter.** The two operations differ in
  blast radius, not in input; collapsing them behind a flag puts the destructive path one
  typo away.
- `intent` holds an **enum, not a boolean**, precisely because of this task: `enrol` and
  `codes_only` are both "not replacing" yet they call different actions and land on
  different phases.
- Called when the caller has no `twoFactor` row or `twoFactorEnabled` is false, BetterAuth
  throws `TWO_FACTOR_NOT_ENABLED`. The trigger gates on enrolment state, so this is a
  guard rather than a routine path — the `catch` toast covers it.
- Out of scope, and staying out: a **remaining-codes count** in the security tile.
  BetterAuth's `viewBackupCodes` is `serverOnly` and returns the codes themselves rather
  than a count, so a count needs a server-side endpoint of its own — a separate change,
  and one worth having once this branch gives the tile somewhere to send the user.
