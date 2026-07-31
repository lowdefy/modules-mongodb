# Implementation Tasks — 2FA enrolment modal

## Overview

Collapses self-service TOTP enrolment into a single phased modal with no native footer,
stops "Manage" from destroying a working authenticator, fixes the account password that
lingers in client state, and repairs eight `Validate` actions across `user-account` and
`user-admin` that report success while validating nothing. Derived from
[`../design.md`](../design.md) (F21, F22 a/b/c, plus the rotation hazard found while
verifying them).

## Global Constraints

- **Resets set explicit leaf nulls, never `{}`** — enumerate every leaf on every reset;
  a boolean resets to `false`, not `null`. An `{}` reset cannot clear an input that was
  invisible in the previous eval cycle.
- **`Validate` params match the namespace the form writes to, never a container id** —
  `params` is an exact-id matcher with no cascade to descendants. Use
  `regex: '^ns\.'` (arrays allowed, combinable with `blockIds`) for flat forms and
  explicit `blockIds` for the multi-phase modal. Never omit `params` and never pass
  `blockIds: true` — both match every block on the page.
- **Phase and intent are explicit values, never inferred** from data presence, an input's
  state, or a live `get_account` read.
- **Block ids are snake_case**, except input blocks whose id _is_ their state path.
- **Build check:** `pnpm --filter @lowdefy/modules-demo ldf:b` (no secrets, no Infisical;
  the `:i` variants fail in the sandbox). Never run `lowdefy dev` / `start` / `e2e` in
  the foreground — they never exit.
- **Block, operator and action contracts come from the `lowdefy-docs` MCP** — never guess
  a type or prop name. It needs `pnpm ldf:d` running; if it is down, stop and ask.
- **`apps/demo/` needs no change** — the security tile already exercises the modal on the
  demo's account page.
- **Never change data on any environment** without an explicit instruction, including the
  auth-testing rig.

## Tasks

| #   | File                                | Summary                                                                                                          | Depends On     |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | `01-user-account-sibling-fixes.md`  | `onClose` clears + leaf-null rewrite + `Validate` regex on `modal_changepw`, `modal_disable2fa`, `modal_profile` | —              |
| 2   | `02-user-admin-validate-scoping.md` | `Validate` regex fix on the four `user-admin` sites, per the tabulated namespaces                                | —              |
| 3   | `03-enrolment-modal-rework.md`      | One phased modal (`password`/`scan`/`codes`), no footer, trigger seed, delete `modal_backupcodes`                | —              |
| 4   | `04-docs-two-factor-enrolment.md`   | **Two-factor enrolment** subsection in `auth-methods.md`; `pnpm docs:gen`                                        | 3              |
| 5   | `05-build-and-verify.md`            | Build gate, built-artifact checks, and the live verification checklist for the rig                               | 1, 2, 3, 4     |
| 6   | `06-codes-only-branch.md`           | **Blocked on the upstream ask** — phase `choose`, Back, `codes_only`, docs amendment                             | 3 (+ upstream) |

## Ordering Rationale

**Tasks 1, 2 and 3 are fully independent and can run in parallel.** They share no files:
Task 1 owns three `user-account` modals, Task 2 owns four `user-admin` files, Task 3 owns
the enrolment modal, its trigger tile, and the account page. That is why the two `Validate`
defect classes in `user-account` are merged into a single Task 1 rather than split by
decision (D3 vs D6) — splitting them would have put two tasks on the same two files and
forced a serial dependency for no benefit.

**Task 3 is deliberately one task, not three.** The modal, its trigger seed and the
deletion of `modal_backupcodes` are one atomic change: the modal renders an empty body
without the seed (D3 — `onOpen` fires after the dialog paints, so the seed has to be on
the trigger), and the codes phase only exists because the second modal goes away (D1 —
the codes must not cross a modal boundary that the new `onClose` cleanup would blank).
Split any of them out and the intermediate state is unverifiable.

**Task 4 follows Task 3** because it documents behaviour Task 3 creates — specifically
that an abandoned replacement leaves two-factor **off**, which is the fact a support flow
gets wrong.

**Task 5 gates on everything** because nothing in this design is provable by build alone.
The reset that repopulates an invisible input and the `Validate` that reports success
while checking nothing both compile perfectly; only the rig distinguishes them. Its live
half is a human step.

**Task 6 is deferred, not optional.** `intent: codes_only` needs a
`TwoFactorGenerateBackupCodes` action that `@lowdefy/client` does not wrap yet
([`../upstream-asks.md`](../upstream-asks.md)). Phase `choose` and the Back button ship
with it, since neither has anywhere to go without the second option. Until it lands the
trigger sends an already-enrolled user straight to `phase: password` with
`intent: replace` — the warned single-option flow — and the part that actually removes
the lockout (the disable-first replace chain) ships in Task 3 regardless. Nothing needs
redesigning when the action arrives: one phase, one button, one action call, two copy
branches.

**One cross-design ordering constraint.** `designs/users-fixes/role-editing` also edits
`modal_access.yaml` and `invite_form.yaml` (dropping the inert `required: true` on the
role selectors, and fixing the role picker). **role-editing lands first on those two
files**, and Task 2's `Validate` swap applies on top of it. The edits do not touch the
same lines, so Task 2 is safe to run either way — but it must not pre-empt role-editing's
changes. role-editing's Non-goals list all eight `Validate` sites as owed a follow-up
design; that non-goal is amended to point here, and all eight are fixed across Tasks 1,
2 and 3.

**Already in the working tree:** `CLAUDE.md`'s two new **Lowdefy Project Rules** entries
(D3's explicit-leaf-null reset rule, D6's `Validate`-scoping rule) and
`upstream-asks.md`. No task creates them; Task 4 confirms the `CLAUDE.md` pair is still
present.

## Scope

**Source:** `designs/users-fixes/2fa-enrolment-modal/design.md`
**Context read:** `upstream-asks.md`; the eight files under `Files changed`
(`modal_enroltotp.yaml`, `modal_backupcodes.yaml`, `view.yaml`, `tile_security.yaml`,
`modal_changepw.yaml`, `modal_disable2fa.yaml`, `user-account/modal_profile.yaml`,
`user-admin/{modal_profile,modal_global,modal_access}.yaml`, `invite_form.yaml`);
`actions/refetch_account.yaml`; `workflows/components/check-action-modal.yaml` (the
`footer: false` precedent); `docs/user-account/concepts/auth-methods.md`; `CLAUDE.md`;
`designs/users-fixes/role-editing/design.md` (ordering overlap); git history for
`modules/user-account/components/view/`.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`.
