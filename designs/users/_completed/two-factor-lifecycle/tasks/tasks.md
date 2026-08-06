# Implementation Tasks — Two-factor lifecycle (admin recovery + required enrolment)

## Overview

Implements the module side of the two-factor lifecycle (`designs/users/two-factor-lifecycle/design.md`):
`user-admin` gains admin **recovery** — reset-TOTP and revoke-passkeys controls on the Security tile,
each a routine + confirm dialog — and `user-account` gains a forced-**enrolment** page contributed as
`authPages.twoFactorEnrol`. The engine half (steps, the `required` flag, the enrolment gate,
`_user.twoFactorEnrolled`, the `twoFactorEnrol` role wiring) is owned upstream and consumed, not built here.

## Global Constraints

- **No new module vars** (Decisions 4, 9). Recovery controls gate on `_build.authConfig.twoFactor.enabled` / `_build.authConfig.passkey.enabled` (built at all) plus per-user `get_user_detail.0.two_factor_enabled` / `passkey_count > 0` (visible). No `vars.md` change; no manifest var additions.
- **Verbs verbatim** (Decision 2): "Reset two-factor authentication" and "Revoke passkeys". Never "disable", never "exempt" — there is no admin exemption control.
- **Attestation checkbox copy** (Decision 4), on both dialogs, gating the confirm button client-side only (not sent to the routine): "I have verified this person's identity through a channel other than email."
- **Routine shape** (Decisions 3, 8): `<recovery step>` → `RevokeUserSessions` → audit event (`new-event`) → notify (`CallApi` into `send-notification`). Sequential, halts on first error, no rollback (user-admin Decision 3). Audit event fires **before** notify; notify is fire-and-forget.
- **Enrolment fact name** is `twoFactorEnrolled` (never `twoFactorSatisfied`); read as `_user.twoFactorEnrolled` on client and server (Decision 5).
- **Enrolment copy must not imply a per-session challenge guarantee** — `required` is an enrolment floor, a passkey+password user is admitted on the password alone (Decision 6, Costs).
- **Routines pass `organizationId: { _module.var: org_slug }`** for the org-authority floor, mirroring `revoke-sessions.yaml` / `suspend.yaml` (Decision 4).
- **Repo naming**: kebab-case API ids, snake_case request/block/action ids.
- **Demo consumer ships with the capability** (repo rule): `apps/demo` exercises `required` + recovery + the send-notification dispatch.
- **Block/operator/action/step names come from the `lowdefy-docs` MCP** (`lowdefy_get_schema`, `lowdefy_get_examples`) — never guessed. The upstream steps `ResetUserTwoFactor` / `RevokeUserPasskeys` and the `auth.twoFactor.required` / `authPages.twoFactorEnrol` build schema are consumed from the running engine; verify they resolve there before asserting props.

## Tasks

| #   | File                             | Summary                                                                         | Depends On |
| --- | -------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 1   | `01-event-registries.md`         | Add `two-factor-reset` + `passkeys-revoked` to event_display and event_types    | —          |
| 2   | `02-get-user-passkeys-read.md`   | `requests/get_user_passkeys.yaml` — per-credential admin read for the picker    | —          |
| 3   | `03-recovery-routines.md`        | `reset-two-factor` + `revoke-passkeys` routines + manifest (notifications dep)  | 1          |
| 4   | `04-modal-reset-2fa.md`          | `modal_reset_2fa.yaml` — reset confirm dialog (reach + attestation)             | 3          |
| 5   | `05-modal-revoke-passkeys.md`    | `modal_revoke_passkeys.yaml` — revoke confirm dialog (per-key picker + attest)  | 2, 3       |
| 6   | `06-tile-controls-and-wiring.md` | Security-tile actions row + `view.yaml` wiring (modal refs, get_user_passkeys)  | 2, 4, 5    |
| 7   | `07-enrolment-page.md`           | `two-factor-enrol.yaml` page + user-account manifest `twoFactorEnrol` role      | —          |
| 8   | `08-docs.md`                     | Consumer docs for recovery, the send_routine obligation, enrolment + `docs:gen` | 3, 6, 7    |
| 9   | `09-demo-and-exercise.md`        | Demo `required: true`, send_routine branches, then build + exercise the feature | 3, 6, 7    |

## Ordering Rationale

Two independent surfaces. **user-admin** (tasks 1–6) is one dependency chain rooted on two
foundations that can start immediately: the event registries (task 1) and the per-credential read
(task 2). The recovery routines (task 3) need the registries' `event_display` default keys. Each
confirm dialog wires its `onOk` to a routine, so the dialogs (tasks 4, 5) follow task 3; the revoke
dialog also consumes the read (task 2). The tile controls + page wiring (task 6) opens both dialogs
and adds the read to the page's request set, so it comes last in the chain.

**user-account** (task 7) is fully independent of the user-admin chain — it builds the enrolment page
against upstream contracts only — and can run in parallel from the start.

**Docs (8)** and **demo + exercise (9)** are last: both describe/exercise shipped behaviour, so they
depend on the feature tasks (3, 6, 7). Task 9 is the one task that actually runs the app — it turns
`required` on and confirms the enrolment redirect, the recovery routines, and the notification dispatch
end-to-end.

Parallelizable at the start: **1, 2, 7**. After 1: **3**. After 3: **4**; after 2+3: **5**; after
2+4+5: **6**. Then **8** and **9**.

## Scope

**Source:** `designs/users/two-factor-lifecycle/design.md`
**Context read:** `design.md`, `upstream-asks.md`; reference code in `modules/user-admin/`, `modules/user-account/`, `modules/notifications/`, `modules/events/`, `modules/shared/enums/`, `apps/demo/`.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`.
