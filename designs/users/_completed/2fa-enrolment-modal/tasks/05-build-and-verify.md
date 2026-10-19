# Task 5: Build check and live verification pass

## Context

Tasks 1–4 changed eight `Validate` sites, three modals' state hygiene, the whole 2FA
enrolment flow, and the docs. **Build proves the config compiles and nothing else** —
every defect this design fixes is a runtime behaviour, and several of them (the reset
that repopulates an invisible input, the `Validate` that reports success while checking
nothing) are precisely the kind that compile perfectly.

This task runs the build gate, then hands the developer a verification checklist for the
auth-testing rig. **The live half needs real secrets, a reachable MongoDB, a credentialed
user and an authenticator app — it is a human step, not an autonomous one.** Run the
build, prepare the checklist, and report clearly which steps are outstanding rather than
claiming a verified flow.

## Task

### 1. Build gate

```
pnpm --filter @lowdefy/modules-demo ldf:b
```

Needs no secrets, no Infisical, and no network beyond npm. Failures here are real config
errors — act on them. Do **not** use the `:i` variants (they fetch from Infisical, which
the sandbox blocks), and do **not** start a dev server in the foreground — `lowdefy dev`
never exits.

Then inspect the generated artifacts under
`apps/demo/.lowdefy/server/build/pages/user-account/view*` and confirm:

- three `enroltotp.phase` gates resolved (`password`, `scan`, `codes`), none gating on
  `enroltotp.uri`;
- the trigger's seed `SetState` sits ahead of `CallMethod toggleOpen`;
- every `Validate` params object across all eight sites carries `blockIds` or `regex`,
  never a bare container id.

`grep -rn "params: modal_" modules/` is a fast backstop for the last one.

### 2. Live verification checklist

Hand these to the developer to run on the auth-testing rig as a credentialed user. Steps
No step here has an upstream dependency; the new-backup-codes check belongs to the [backup-codes-rotation design](../../backup-codes-rotation/design.md)
and is listed there.

1. **First-time enrolment, on a freshly loaded page** — the very first `Set up` of the
   session, so nothing has written `enroltotp.*` before the trigger does (the case an
   `onOpen` seed would have rendered as an empty body). It opens straight on the password
   phase with a **complete screen and no empty frame** → QR renders beside a monospace
   manual key that copies and is a **bare base32 secret, not an `otpauth://` URI** → a
   real TOTP code entered from an app set up by **that key** → the codes grid renders
   actual codes → Done is **disabled** → Copy reports success and the modal **stays
   open** → ticking "I've saved my backup codes" enables Done → Done closes it → the tile
   shows **On**.
2. **State hygiene** — after Done, `enroltotp.*` is empty in state; reopen and the
   password field is **blank** (F22(c), the case that failed before).
3. **Abandon the password phase** — close it, reopen: blank field, and the phase the
   caller's enrolment state calls for.
4. **Abandon the scan phase** — close after Generate; the tile still reads **Off** and a
   fresh Generate issues a new secret.
5. **Replace authenticator** — with 2FA on, Manage opens straight on the password phase
   with `intent: replace` and warns before the password is spent; completing it makes the
   new secret work and the old one fail.
6. **A replacement whose `enable` fails after the `disable` committed** — the catch
   branch. Hard to provoke; if it can be forced (a mangled request, a deliberately
   failing `enable`), the tile must drop to **Off** and the toast must say two-factor is
   now off rather than blaming the password. Otherwise verify the cheap half: submitting
   the replace branch with a **wrong** password takes the `:else` branch — the password
   toast, the field still holding what was typed, and the tile unchanged on **On**.
7. **Abandon a replacement mid-flow** — the transition D4's disable-first chain exists
   for, and the single most dangerous one in the change. With 2FA on: Manage → Replace →
   Generate → close the modal. The tile must read **Off**, and signing out and back in
   must ask for a **password only, with no second-factor challenge**. Then Set up again
   from the tile and confirm a fresh enrolment completes normally. (Under a bare `enable`
   this is the lockout: 2FA enforced against a secret never scanned.)
8. _(The new-backup-codes check moved to the [backup-codes-rotation design](../../backup-codes-rotation/design.md), which waits on the upstream action.)_
9. **`Validate` now bites** — submit each of the six broken forms with a required field
   empty and confirm a **red field-level error**, not a server-error toast:
   `modal_enroltotp` phase `scan`, `modal_changepw`, `modal_disable2fa`, `modal_profile`
   ×2 (clear a name field — `form_core` marks both required), and `invite_form` (clear a
   name — also the multi-pattern-regex proof, since its params span `^profile\.`,
   `^roles$` and `^member_attributes\.` and the error must come from the `profile.` half).
   `modal_global` and `modal_access` have **no** input that can fail a required check —
   `modal_access`'s `roles` is an inert `MultipleSelector` flag — so for each of those
   two, **mark one field required temporarily** and confirm the regex catches it, then
   revert. A passing form proves nothing there.

Also worth a pass while the rig is up: phase `password` no longer offers "Confirm &
enable" (F22(b)), and the password field is no longer flush against the Generate button
(F22(a)).

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` exits clean.
- The three built-artifact checks above hold.
- `grep -rn "params: modal_" modules/` returns nothing.
- The verification checklist is handed to the developer with the build result, and any
  step not actually run is reported as **outstanding** — not as passed.

## Files

None — verification only.

## Notes

- **A build check is not a smoke test.** Do not report this design as verified on a green
  build; steps 1–7 and 9 are what verify it, and they need the rig.
- If a live step fails, the finding belongs back in Task 1/2/3, not patched here.
- **Never change data on the rig.** Enrolment and replacement write to the user's
  `twoFactor` row through the normal UI, which is the flow under test — that is fine. Any
  direct database write to fix up state is not: report it as a needed change and let the
  developer decide.
