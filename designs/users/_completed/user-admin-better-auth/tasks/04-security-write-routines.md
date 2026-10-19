# Task 4: Security / lifecycle routines (suspend, reinstate, revoke, remove, delete)

## Context

The Security tile on the `view` page owns the access-lifecycle and auth
controls. The scaffold (task 1) stubbed these endpoints; this task implements
them. They drive sanctioned admin steps only — no raw writes. Each is role-gated
(`auth.api.roles` from the module admin-roles var) and step-floored by
`auth.userAdminRole`. The audit event is the final step of each routine.

Design sections: Decision 4 (two revocations; ban blast radius is global),
Decision 5 (Security tile). Use the `lowdefy-docs` MCP for API-routine /
request-type schemas and `docs/events/` first.

## Task

Implement five routine endpoints:

**`suspend`** — `BanUser`, **permanent** (pass no ban duration, so `banExpires`
is never set — timed bans are out of scope). Ban is user-level → blocks sign-in
across every app in the suite and revokes sessions. Gated behind the `suspension`
var (default `true`); when the var is off, the suspend/reinstate surface is
excluded. Final step: audit event ("Suspended").

**`reinstate`** — `UnbanUser`. Reversible counterpart to suspend. Same var gate.
Final step: audit event.

**`revoke-sessions`** — `RevokeUserSessions` ("sign out everywhere"). Does not
suspend or remove; the person can sign back in immediately. Final step: audit
event.

**`remove-member`** — `RemoveMember`. Deletes this app's member row only; the
person keeps other apps and their contact survives. Restore is a re-invite
(roles/attributes are not retained). Final step: audit event.

**`delete-user`** — `DeleteUser`. Offered only when the user holds **no other
memberships**; the routine must **re-check** that precondition server-side (a
native read over `user-members`) before deleting — app A's admin must not destroy
an identity app B depends on. The contact always survives (contact soft-delete
stays the contacts-side convention). Final step: audit event.

## Acceptance Criteria

- Each endpoint drives exactly its named admin step and fires its audit event as
  the final step (no event on partial failure).
- `suspend` issues a permanent ban (never sets `banExpires`) and, with `reinstate`,
  is excluded when the `suspension` var is `false`.
- `delete-user` server-side re-checks the no-other-memberships precondition and
  refuses otherwise.
- All endpoints are role-gated by the module admin-roles var.
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/api/suspend.yaml` — implement (`BanUser`, permanent)
- `modules/user-admin/api/reinstate.yaml` — implement (`UnbanUser`)
- `modules/user-admin/api/revoke-sessions.yaml` — implement (`RevokeUserSessions`)
- `modules/user-admin/api/remove-member.yaml` — implement (`RemoveMember`)
- `modules/user-admin/api/delete-user.yaml` — implement (`DeleteUser`, guarded)

## Notes

- These feed the `view` wire task (task 13) — the Security-tile buttons and their
  confirm modals call them. The suspend confirm dialog's blast-radius enumeration
  is a _read_ authored in task 13; this task is the write side only.
- No self-suspend / self-remove guards (Decision 4 — self-targeting allowed,
  lock-out recoverable).
- Impersonation (`ImpersonateUser`) is a **client action**, not a routine —
  it is wired in the `view` content/wire tasks behind the `impersonation` var,
  not here.
