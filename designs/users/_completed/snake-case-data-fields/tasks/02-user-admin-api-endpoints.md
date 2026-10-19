# Task 2: Audit `user-admin/api/**` — flip native pipeline halves only

## Context

The `user-admin` API endpoints are **mixed-plane** files: most pass camelCase params to
better-auth actions (the API contract, which stays camelCase), but a few also run a **native
aggregation half** directly against the auth collections (which must move to snake*case). The
trap is that both planes can appear in the same file (`invite.yaml` has a native `$match`
\_and* an `InviteMember` action call), so this is an audit, not a find-replace.

Rule: flip a ref **only** if it is a native `$match`/`$set`/`$lookup`/`$project` on a physical
column. Leave every better-auth **action param** (`memberId`, `organizationId`, `appRoles`,
`userId`, sign-in `providerId`, …) camelCase — those are the action's I/O contract, mapped by
the adapter.

Look up any request/operator contract via the `lowdefy-docs` MCP if unsure.

## Task

**Flip the native aggregation halves** in these three endpoints:

- `invite.yaml` — the "find pending rows" aggregation: `$match organizationId → organization_id`,
  `expiresAt → expires_at`. **Keep** the `InviteMember` action params camelCase.
- `check-invite-email.yaml` — the native aggregation: `organizationId → organization_id`,
  `userId → user_id`, `appRoles → app_roles`, `expiresAt → expires_at`, `inviterId → inviter_id`.
- `resend-invitation.yaml` — `find_invitation` `$match organizationId → organization_id`, and
  the read of `find_invitation.appRoles → find_invitation.app_roles`.

**Audit the remaining endpoints and confirm no change** (they pass camelCase action params
only — flip nothing unless the audit finds a native `$match`/`$set` on a physical column):
`update-access.yaml`, `suspend.yaml`, `reinstate.yaml`, `revoke-sessions.yaml`,
`revoke-passkeys.yaml`, `reset-two-factor.yaml`, `delete-user.yaml`, `remove-member.yaml`,
`update-org-role.yaml`, `cancel-invitation.yaml`, `update-user-attributes.yaml`,
`update-profile.yaml`.

Update any **comment reference** to a renamed column that sits beside a flipped native half.

## Acceptance Criteria

- The native aggregation halves in `invite.yaml`, `check-invite-email.yaml`, and
  `resend-invitation.yaml` are snake_case; their better-auth action params remain camelCase.
- No action param in any endpoint was flipped.
- The audited-no-change endpoints are unchanged (or the audit's finding of a native ref is
  documented and flipped).

## Files

- `modules/user-admin/api/invite.yaml` — modify (native half only)
- `modules/user-admin/api/check-invite-email.yaml` — modify (native aggregation)
- `modules/user-admin/api/resend-invitation.yaml` — modify (native `$match` + read)
- `modules/user-admin/api/{update-access,suspend,reinstate,revoke-sessions,revoke-passkeys,reset-two-factor,delete-user,remove-member,update-org-role,cancel-invitation,update-user-attributes,update-profile}.yaml`
  — audit, expected no change

## Notes

- The distinguishing test: does the ref sit inside a MongoDB pipeline stage (native), or is it
  a key in the object passed to a better-auth action call (API param)? Native flips; param
  stays.
