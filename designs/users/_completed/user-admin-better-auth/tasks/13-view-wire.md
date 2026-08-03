# Task 13: `view` screen — wire (detail reads, sessions/accounts/cross-app, tile edits, security)

## Context

Final phase for the `view` page: resolve every `TODO(request-substitute)` marker
(task 12) into real reads, state, events, and action bindings. Use the
`lowdefy-docs` MCP (or `/lowdefy-config`), including the aggregation pipelines
(`connections/mongodb`, `MongoDBAggregation`).
The detail-edit routines (task 3) and security routines (task 4) are already
built; this task binds the tile modals and Security buttons to them and authors
the native reads that hydrate the page.

Design sections: Decisions 3, 4, 5, 6.

## Task

**Detail read** — native aggregation rooted on the target's `user-members` row
(scoped by `_organization: id`), `$lookup` → `users`, `user-contacts`. Provides
title-block (name, status from `user.banned`), Profile fields, Attributes (roles
via `$split` of the CSV `member.role`; member attributes), Global attributes
(user attributes). Flag roles absent from the `auth.roles` catalog as orphaned.

**Sessions read** — native read over `user-sessions` for the target: created,
expiry, IP/user-agent. **`$project` out `token`** (and any bearer/secret fields)
— never return another user's session credential. "Sign out everywhere" →
`revoke-sessions` (task 4); per-session Revoke as available.

**Auth methods read** — native reads over `user-accounts` (linked providers) +
passkey/MFA/email-verified. Read-only.

**Cross-app read** — native read over `user-members` + `user-organizations` for
the target's **other** memberships. This single read drives (a) the Apps-tile
badges, (b) the suspend-dialog blast-radius enumeration, and (c) the
membership-count switch for Decision 6 degradation.

**Decision 6 degradation, keyed on the other-membership count** (no separate
flag): count 0 → hide Apps tile; suspend dialog drops the blast-radius
enumeration and reads plain **Suspend** (not "Suspend across N apps"); **Delete
identity** enabled (precondition met); "suite"/"every app" copy collapses to this
app. Count > 0 → full multi-app framing.

**Activity read** — events timeline for the target (events module), rendered via
`event_display`.

**Tile edits** — Profile modal → `update-profile`; Attributes modal →
`update-access` (submit only catalog-valid role ids); Global attrs modal →
`update-user-attributes` (all task 3). Refetch the page on success.

**Security actions** — Suspend → `suspend`; Reinstate → `reinstate` (both behind
`suspension` var); Remove → `remove-member`; Sign out → `revoke-sessions`; Delete
→ `delete-user` (button enabled only at membership-count 0; routine re-checks).
Impersonation "View as user" → `ImpersonateUser` client action, behind the
`impersonation` var. Refetch/redirect appropriately after each.

## Acceptance Criteria

- All tiles hydrate from native `$lookup` reads scoped by `_organization: id`;
  roles come from `$split`.
- The sessions read projects out `token`; auth methods are read-only.
- One `user-members`/`user-organizations` read powers Apps badges + suspend
  enumeration + the membership-count switch; count-0 degradation matches Decision 6
  (Apps hidden, plain Suspend, Delete enabled, copy collapsed).
- Tile modals call the task-3 routines; Security buttons call the task-4 routines;
  impersonation is a client action behind the `impersonation` var.
- Every task-12 marker resolved; `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/view.yaml` — add `requests:` / state / events; resolve markers
- `modules/user-admin/requests/*.yaml` — detail, sessions, accounts, cross-app, activity reads (stages in `requests/stages/`)
- `modules/user-admin/components/*.yaml` — bind tile modals + Security actions

## Notes

- All reads depend on the same-database co-location precondition (Decision 1).
- `banExpires` is never read (permanent bans only — Suspended is simply
  `banned === true`).
- The public accept page is not this module's concern (auth-page modules own it).
