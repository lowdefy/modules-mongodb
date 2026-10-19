# Task 3: User-detail edit routines (profile / access / global attributes)

## Context

The user detail page (`view`) edits each tile through its own modal and its own
routine (Decision 3 — per-section routines give crisp audit events and line up
with per-capability permission gating). The scaffold (task 1) stubbed these API
endpoints; this task implements their bodies. The `write-profile` shared fragment
(task 2) is required for the profile save.

Every routine endpoint is role-gated by the hosting endpoint's `auth.api.roles`
(supplied by the module admin-roles var, Decision 3), and every auth-owned step
is additionally floored by the platform's `auth.userAdminRole` (defense in depth).
Partial-failure semantics: a routine halts on first error with no rollback; every
step is an idempotent set/upsert so retry converges; the **audit event is the
final step** so it fires only on full success (Decision 3).

Use the `lowdefy-docs` MCP for API-routine / request-type schemas, and
`docs/events/` + `docs/shared/change-stamps.md` first. Confirm step names/shapes against the
admin design's step catalog via the reframe table in `design.md`.

## Task

Implement three routine endpoints (targeting the **edited** user throughout):

**`update-profile`** — runs the shared `write-profile` fragment (`_ref` by
relative path from `modules/shared/contact/write-profile.yaml`): change-stamped
`contact` write **+ `UpdateUserProfile` re-denorm** of the target's `user.profile`
bag. Pass the fragment's `_var` inputs (task 2 contract) from this routine —
`connection_id: {_module.connectionId: user-contacts-collection}`,
`write_stages: {_module.var: request_stages.write}` (the seam), plus the target
`user_id` / `contact_id` / `profile` from the payload. Final step: audit event
("Profile updated").

**`update-access`** — chains `UpdateMemberRoles` + `UpdateMemberAttributes`
(both **set**, not append — idempotent). Roles submitted must be catalog-valid
ids only (Decision 8): an untouched orphaned role (held in data, absent from the
catalog) must not be re-submitted, so it can't fail the write with
`ROLE_NOT_FOUND`; the admin may **remove** an orphan. Final step: audit event
("Roles changed" / access updated). The two-step chain's benign partial state
(new roles, old attributes) is resolved by retry.

**`update-user-attributes`** — `UpdateUserAttributes` (global/user attributes,
applied across every app). Final step: audit event.

## Acceptance Criteria

- All three endpoints are role-gated by the module admin-roles var
  (`auth.api.roles`) and drive only sanctioned admin steps (no raw writes to
  auth-owned data).
- `update-profile` uses the `write-profile` fragment (contact write +
  `UpdateUserProfile` re-denorm) and fires its audit event as the final step.
- `update-access` sets (not appends) roles and member attributes and submits only
  catalog-valid role ids; the audit event is the final step.
- `update-user-attributes` writes via `UpdateUserAttributes` with a final audit
  event.
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/api/update-profile.yaml` — implement (uses `write-profile` fragment)
- `modules/user-admin/api/update-access.yaml` — implement (`UpdateMemberRoles` + `UpdateMemberAttributes`)
- `modules/user-admin/api/update-user-attributes.yaml` — implement (`UpdateUserAttributes`)
- request/stage sub-files under `modules/user-admin/api/` or `requests/` as needed

## Notes

- These routines feed the `view` wire task (task 13) — the tile edit modals call
  them.
- Do not add self-target guards (self-edit is allowed; lock-out is recoverable —
  Decision 4).
- Event titles render through the `event_display` var / events module — keep the
  event payload shape consistent with what the timeline expects (task 13 reads it).
