# Task 9: Demo wiring + exercise the feature end-to-end

## Context

Per the repo rule, every new capability ships with a demo consumer that exercises it. This task turns on
`required` in `apps/demo`, binds the recovery notification dispatch, and is the one task that actually
**runs the app** to confirm the enrolment redirect, the recovery routines, and the notification dispatch
resolve end-to-end.

Relevant existing demo wiring:

- `apps/demo/lowdefy.yaml` — `auth.twoFactor: { enabled: true }`, `auth.passkey: { enabled: true, … }`
  already set. Add `required: true` to `auth.twoFactor`.
- `apps/demo/modules.yaml` — has a `notifications` entry and two `user-admin` entries (`user-admin`,
  `customer-user-admin`). The user-admin `notifications` dependency (task 3) **auto-wires** because an
  entry named `notifications` exists — no explicit `dependencies:` mapping needed. Confirm this resolves.
- `apps/demo/modules/notifications/send-routine.yaml` — the deployment's `send_routine`, currently
  `$match`-branching on other event types (`action-approve` / `send-quote`). An unmatched event type is a
  silent no-op, so the two recovery events need their own branches to actually dispatch.

## Task

- **`apps/demo/lowdefy.yaml`:** add `required: true` under `auth.twoFactor`. Confirm `authPages.twoFactorEnrol`
  resolves from the user-account manifest contribution (task 7) — add an app-level `auth.authPages`
  override only if the build needs it (the module contributes the role; app config wins on collision).
- **`apps/demo/modules/notifications/send-routine.yaml`:** add dispatch branches for `two-factor-reset`
  and `passkeys-revoked`, modelled on the existing branches — `$match` on `_id: { $in: { _payload: event_ids } }`
  and `type: two-factor-reset` / `passkeys-revoked`, `$merge`-ing a notification doc addressed via the
  top-level `user_ids` field (`new-event` flattens `references.user_ids`). Keep them production-shaped like
  the existing branches.
- **Enrolment precondition (operational, Costs):** turning `required` on redirects every unenrolled user
  — including admins — to enrolment at their next request, with no grace period or break-glass. The demo
  admin/owner accounts must be enrolled **before** `required` takes effect in any run. This is an
  operational data step, **not** a code change and **not** something to script as a data mutation here —
  document it in the task hand-off and leave the actual enrolment to the developer running the app (per
  CLAUDE.md: no data writes without an explicit request).
- **Exercise (needs the dev server + real secrets — a developer / `/r:dev-test` step, not the autonomous
  build gate):**
  - `pnpm ldf:b` from `apps/demo` compiles with `required: true` and both surfaces wired.
  - Open the user-admin `view` page for a user with TOTP and/or passkeys: both recovery controls render
    (build-gated on twoFactor/passkey enabled, visible per `two_factor_enabled` / `passkey_count`), open
    their dialogs, and running each dialog revokes sessions, writes the audit event (visible in the
    Activity timeline with icon + label), and dispatches a notification.
  - Confirm an unenrolled caller is redirected to the `two-factor-enrol` page and can complete TOTP or
    passkey enrolment, then continue into the app.

## Acceptance Criteria

- `apps/demo/lowdefy.yaml` sets `auth.twoFactor.required: true` and the build resolves
  `authPages.twoFactorEnrol`.
- `send-routine.yaml` has branches dispatching `two-factor-reset` and `passkeys-revoked`.
- `pnpm ldf:b` from `apps/demo` compiles.
- The exercise checklist above is confirmed against a running dev server (developer step); the enrolment
  precondition is documented in the hand-off.

## Files

- `apps/demo/lowdefy.yaml` — modify — `auth.twoFactor.required: true` (+ authPages override only if needed).
- `apps/demo/modules/notifications/send-routine.yaml` — modify — two recovery dispatch branches.

## Notes

- **`required` build-schema gotcha:** whether `required` (and `_build.authConfig.twoFactor.*`) is schema-
  valid on `ldf:b` depends on the engine version this repo builds against (platform Decision 11 owns it).
  If `ldf:b` errors on the unknown key, confirm the engine version via the `lowdefy-docs` MCP; treat it
  as pending-upstream (like the `twoFactorEnrol` role) rather than removing the wiring — stop and report
  if genuinely blocked.
- **Do not enrol accounts by writing to the database** from this task. Enrolment is a user action; the
  precondition is a note for the developer, not a migration or a `deleteMany`/`updateOne` here.
