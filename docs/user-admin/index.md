---
title: User Admin
module: user-admin
type: index
concepts: [access-lifecycle, pinned-org, roles, invitations, suspend]
---

# User Admin

The **operator console for a person's access lifecycle in one app**. Rebuilt on
the BetterAuth-based auth engine: it composes app-owned contact data, the
sanctioned admin-step write surface, and audit events into per-concern routines —
it is no longer CRUD over one fused collection.

One module instance administers **one pinned organization** (org = app). The word
"organization" never appears in the UI: the pinned org _is_ the app, and the
admin sees "this app's users". Multi-tenant administration is a separate future
module. The self-service counterpart is [`user-account`](../user-account/index.md).

## What it does

- **Members + Invitations list** (`all` page) — two tabs, one menu entry. Members
  reads `user-members` joined to `users` and `user-contacts`; Invitations shows
  pending rows split into **Invited** / **Expired** (derived on `expiresAt` — there
  is no `expired` status in BetterAuth) with a pending-count badge. Server-side
  filter / sort / pagination; a merged Excel export behind the `download` var.
- **User detail** (`view` page) — one page with section-scoped edits: **Profile**
  (contact fields), **Attributes** (this app's roles + member attributes),
  **Global attributes** (user attributes), **Security** (suspend/reinstate,
  sign-out-everywhere, remove, delete, sessions, auth methods, impersonation),
  **Apps** (cross-app badges), **Activity** (event timeline). Each tile edits
  through its own modal and its own routine. The **auth methods** block is
  read-only visibility of how the user can sign in — email-verified, OAuth
  providers, MFA, and **passkeys** (a badge when the user has ≥ 1 enrolled;
  enrolment/removal is `user-account` self-service, never this module).
- **Invite** (`invite` page) — email-first: the admin enters an email, a check
  resolves it to already-a-member / pending-invitation / existing-contact /
  unknown before the form opens. The form then captures the invitee's **canonical
  profile** (first/last name — both required — an optional honorific when
  `fields.show_honorific`, and the configured `fields.profile`), identical to the
  Profile edit modal. That profile is **persisted to the contact record at invite
  time**, so the name shows on the Members list the moment the invitation is
  accepted — without waiting for the invitee to onboard. The invitation email is
  sent by BetterAuth via the deployment's `auth.email` — the module ships no email
  endpoint or hook.

## The access lifecycle

```
Invited ──accept──► Active ◄──unban──── Suspended (ban: global, reversible,
   │                  │    ──ban─────►             sessions revoked)
cancel / expire       │
                 Remove from app (member row deleted; re-invite to restore)
                      │
                 Delete login identity (user row hard-deleted; contact survives)
```

**Suspend is user-level, so it applies across every app in the suite.** The
confirm dialog enumerates the user's other memberships so the admin sees the
blast radius. This rests on the deployment premise that the pinned suite is
administered by one trusted operator group; it sits behind the `suspension` var
(default on). **Remove from app** (`RemoveMember`) is the app-scoped alternative.
**Delete login identity** is offered only when the user holds no other memberships.

## Dependencies

| Module                       | Why                              |
| ---------------------------- | -------------------------------- |
| [layout](../layout/index.md) | Page wrapper                     |
| [events](../events/index.md) | Audit logging and `change_stamp` |

`notifications` is **not** a dependency — the invite email rides `auth.email`, so
the module no longer depends on notifications for dispatch.

## Write pathways

Every auth-owned write goes through a sanctioned admin step (raw writes bypass
BetterAuth's invariants); each routine endpoint is role-gated by the `admin_roles`
var and floored by the engine's `auth.userAdminRole`.

| Concern                       | Record       | Write pathway                                                                                                                  |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Profile / CRM data            | `contact`    | Shared `write-profile` fragment: change-stamped `contact` write + `UpdateUserProfile` re-denorm of the target's `user.profile` |
| Login identity + global attrs | `user`       | `UpdateUserAttributes`, `BanUser` / `UnbanUser`, `DeleteUser`, `RevokeUserSessions`                                            |
| This app's access             | `member`     | `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember`                                                                  |
| Pending access                | `invitation` | `InviteMember`, `CancelInvitation`                                                                                             |

The two shared write-path fragments — `write-profile` and `create-or-link-contact`
— live in `modules/shared/contact/` and are `_ref`'d by relative path (also by
`user-account`). They are **shared files, not module exports**, and add no module
dependency.

## Prerequisite: same-database co-location

Every list and detail read is a single aggregation that `$lookup`-joins the auth
collections to `user-contacts`, and MongoDB's `$lookup` cannot cross databases.
**The BetterAuth adapter database, the `user-contacts` connection, and the
module's read connections must all resolve to one MongoDB database** — the natural
shape being a single shared `_secret` (e.g. `MONGODB_URI`). The failure mode is
silent: a cross-database `$lookup` returns empty rather than erroring, so a
divergent deployment shows **blank contact data everywhere**. See
[Same-database co-location](concepts/co-location.md).

## Roles come from the platform role catalog

The assignable role set, labels, and help text come from the app's authored
`auth.roles` catalog (exposed to the module via `_build.authConfig.roles`), not a
module var — the old `roles` var is retired. A role held in data but no longer in
the catalog is displayed as a flagged "no longer configured" chip and can be
removed, but never silently stripped.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v0.13.0"
    vars:
      app_title: Team
      admin_roles:
        - user-admin
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
        user_attributes:
          _ref: modules/user-admin/user_attributes_fields.yaml
        member_attributes:
          _ref: modules/user-admin/member_attributes_fields.yaml
```

`admin_roles` should name the same administering role as the app's
`auth.userAdminRole`. There is **no `app_name` var** (per-app scoping by the old
`apps.{app}` map is gone) and **no `roles` var** (the catalog replaces it). See
`apps/demo/modules/user-admin/vars.yaml` for a worked example, and the
[migration guide](how-to/migration.md) if upgrading from the v0.x surface.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
- [Same-database co-location](concepts/co-location.md) — the hard read precondition
- [Migrating from v0.x](how-to/migration.md) — var renames/removals, page renames, dropped deps

## Shared idioms

- [Event display](../shared/event-display.md) — per-type Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
