# Org Workspace — upstream asks (lowdefy repo)

Both asks extend surfaces that already exist; neither changes engine behavior.

## Ask 1 — first-class per-org client actions

The engine mounts the per-org BetterAuth endpoints under `tenant`
(`ORG_CLIENT_PATHS_DISABLED_WHEN_PINNED` disables them under `pinned`), each
authorized server-side by the caller's member role in the target org. Only
`SetActiveOrganization` and `AcceptInvitation` have first-class actions; the
org-workspace module needs the remaining mutations as actions with the same
conventions (authMethods wrapper, BetterAuth error unwrap, no navigation):

| Action               | Params                | Endpoint                          |
| -------------------- | --------------------- | --------------------------------- |
| `InviteMember`       | `email`, `role`       | `/organization/invite-member`     |
| `CancelInvitation`   | `invitationId`        | `/organization/cancel-invitation` |
| `RemoveMember`       | `memberIdOrEmail`     | `/organization/remove-member`     |
| `UpdateMemberRole`   | `memberId`, `role`    | `/organization/update-member-role`|
| `UpdateOrganization` | `name`                | `/organization/update`            |
| `LeaveOrganization`  | —                     | `/organization/leave`             |

All operate on the caller's **active** organization. Under `pinned` the paths
are disabled, so the actions fail loudly there — consistent with the existing
policy wall; no extra guards needed.

Why not the generic `Fetch` action: hand-rolled paths/error-shapes/basePath per
call site, and two generations of call sites once actions exist. Rejected in
design Decision 2.

**Status: open.**

## Ask 2 — project `organizations.policy` into `_build.authConfig`

`computeAuthConfigProjection` projects `organizations.signup` but not
`organizations.policy`. Org-surface config (and potentially onboarding) needs
to branch pinned/tenant at build time — e.g. render a "single-organization
deployment" empty state instead of dead controls when a pinned app consumes the
organizations module. One projected field: `organizations.policy`
(`'pinned' | 'tenant'`, defaulted the way the engine defaults it).

**Status: open.**
