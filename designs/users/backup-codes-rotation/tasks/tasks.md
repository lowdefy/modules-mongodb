# Implementation Tasks — Backup-codes rotation without re-enrolment

## Overview

Adds the safe half of the security tile's **Manage** button: a "Get new backup codes"
option that rotates recovery codes without touching the authenticator, reached through a
new choice screen rather than a password field. Derived from
[`../design.md`](../design.md).

**The whole design is one task, and it is blocked.** See Status.

## Status — blocked on an upstream action

`TwoFactorGenerateBackupCodes` does not exist in `@lowdefy/client` /
`@lowdefy/actions-core` ([`../upstream-asks.md`](../upstream-asks.md)). Do not start.

**Confirm the action is present before writing any YAML** — `lowdefy_list_types` with
`kind: actions`, or check `@lowdefy/client/dist/auth/createAuthMethods.js` for a
`twoFactorGenerateBackupCodes` entry. If it is absent, stop.

## Global Constraints

- **Phase and intent are explicit values, never inferred** from data presence, an input's
  state, or a live `get_account` read.
- **Resets set explicit leaf nulls, never `{}`** — a boolean resets to `false`, not `null`.
  The existing `onClose` clear already enumerates all eight leaves and needs no change.
- **`Validate` params match the namespace the form writes to, never a container id** — the
  phased modal names its input ids explicitly (`blockIds`), because `enroltotp.*` spans
  every phase and a namespace regex would sweep `password` into another phase's check.
- **Extend, do not restructure.** `phase` gains a fourth value and `intent` a third; the
  state contract, the `onClose` clear, and the title's `default` branch stay as they are.
- **Block ids are snake_case**, except input blocks whose id _is_ their state path.
- **Build check:** `pnpm --filter @lowdefy/modules-demo ldf:b` (no secrets, no Infisical;
  the `:i` variants fail in the sandbox). Never run `lowdefy dev` / `start` / `e2e` in the
  foreground — they never exit.
- **Block, operator and action contracts come from the `lowdefy-docs` MCP** — never guess
  a type or prop name. It needs `pnpm ldf:d` running; if it is down, stop and ask.
- **Running `pnpm` inside a git worktree prunes `pnpm-lock.yaml`** (~2,600 lines of
  `apps/demo/.lowdefy/dev` workspace entries, which exist only in the main tree). It is a
  build artifact — restore the file and never commit it.
- **`apps/demo/` needs no change** — the security tile already exercises the modal on the
  demo's account page.
- **Never change data on any environment** without an explicit instruction, including the
  auth-testing rig.

## Tasks

| #   | File                      | Summary                                                                             | Depends On     |
| --- | ------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| 1   | `01-codes-only-branch.md` | Phase `choose`, the `codes_only` button, Back, two copy branches, trigger arm, docs | upstream ask 1 |

## Ordering Rationale

**One task, deliberately.** Phase `choose`, the Back button and the `codes_only` intent
cannot be split: `choose` with only one option is not a choice, Back has nowhere to return
to without `choose`, and `codes_only` has no entry point without it. Any partial landing
leaves an intermediate state that is unverifiable and worse than what ships today.

The docs correction rides along in the same task because it is one sentence that becomes
false the moment the button exists — the parent design's docs task states plainly that
re-enrolment is the only route to fresh codes.

## Scope

**Source:** `designs/users-fixes/backup-codes-rotation/design.md`
**Parent design:** `designs/users-fixes/2fa-enrolment-modal/design.md` — shipped the
phased modal this extends (three phases, two intents, the trigger seed, the `onClose`
clear, the title's `default` branch).
**Context to read:** `../upstream-asks.md`;
`modules/user-account/components/view/modal_enroltotp.yaml`;
`modules/user-account/components/view/tile_security.yaml`;
`docs/user-account/concepts/auth-methods.md` (the **Two-factor enrolment** subsection);
`scripts/auth-testing/CHECKLIST.md` (Phase 2's 2FA items).
