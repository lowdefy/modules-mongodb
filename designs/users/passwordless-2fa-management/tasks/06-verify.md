# Task 6: Verify — build check, then passwordless smoke test

## Context

Tasks 2-5 change the Security tile, both 2FA modals, `get_accounts`, the forced-enrol page, and
one concept doc. This task confirms the config compiles and — as a human/`/r:dev-test` step —
that the passwordless flows actually work once the engine bump (Task 1) is installed. The design
notes the demo's `user-account/view` and forced-enrol flows already exercise these surfaces, so
**no new demo page is needed.**

## Task

**1. Build check (autonomous, no secrets/network beyond npm).**
From `apps/demo`, run `pnpm ldf:b` (or `pnpm --filter @lowdefy/modules-demo ldf:b` from root).
Confirm it compiles clean. Inspect the generated artifacts under
`.lowdefy/server/build/pages/**` for the changed surfaces (the enrol page, the view page's
security tile and its two modals) to confirm the gates and requests resolved as intended:

- the enrol page now carries a `get_accounts` request;
- `has_credential` gates appear on the modal + enrol password fields;
- the enrol page no longer references `_user.two_factor_enrolled`.

Also run `pnpm docs:check` to confirm no docs front-matter / generated-file drift from Task 5.

**2. Passwordless smoke test (human / `/r:dev-test` — needs the engine bump installed + a running
server with real secrets + a reachable MongoDB).** With Task 1's `@lowdefy/api` bump installed,
sign in as a passwordless demo member (a member with **no** `credential` account — magic-link /
OAuth only) and confirm:

- **Security tile:** the two-factor row is visible (F47 fixed).
- **Enrol modal (`modal_enroltotp`):** Manage / Replace / New-codes each proceed with no password
  field and succeed (`password: ''` waived).
- **Disable modal (`modal_disable2fa`):** turning 2FA off proceeds with no password field.
- **Forced-enrol page:** under `twoFactor.required`, the TOTP route shows a clean "Generate QR
  code" screen (no password field/intro) and completes; the passkey route completes; Continue
  navigates home without bouncing (F48 #1 and #2 fixed).
- **Regression check — password member:** a member holding a `credential` account still sees and
  must fill the password field on every surface, and a blank field is caught by `Validate`.

## Acceptance Criteria

- `pnpm ldf:b` builds clean; generated artifacts for the changed surfaces reflect the new gates
  and the enrol-page request.
- `pnpm docs:check` passes.
- (Human step) Every passwordless flow above succeeds and the password-member regression check
  passes, against a server running the engine bump.

## Files

- None (verification only).

## Notes

- The build check is **not** the smoke test: `pnpm ldf:b` proves the YAML/config compiles and
  needs no secrets, but it cannot prove the passwordless BetterAuth waiver works — that requires
  a live server, real secrets, and the installed engine bump. Report the smoke test as an
  outstanding human/`/r:dev-test` step if the bump is not yet installed.
- The `:i` (Infisical) build variants do not work in the sandbox; use plain `pnpm ldf:b`.
