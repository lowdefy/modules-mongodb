---
title: User Admin
module: user-admin
type: index
concepts:
  [access-lifecycle, org-slug, roles, org-authority, invitations, suspend]
---

# User Admin

The **operator console for a person's access lifecycle in one organization**. Rebuilt on
the BetterAuth-based auth engine: it composes app-owned contact data, the
sanctioned admin-step write surface, and audit events into per-concern routines —
it is no longer CRUD over one fused collection.

One module instance administers **one organization — the one named by its required
`org_slug` var**. Under the `pinned` organizations policy an organization's id _is_
its slug, and the slug is welded into every read `$match` and every write step at
build time: the instance never picks an organization at request time. The list and
detail pages read as "this app's users"; "organization" surfaces in the UI only on
the authority control that grants it.

**Two admin surfaces in one app are two module instances** — same module source,
two entries, two `org_slug` values. See
[Installing an instance](#installing-an-instance). The self-service counterpart is
[`user-account`](../user-account/index.md).

## What it does

- **Members + Invitations list** (`all` page) — two tabs, one menu entry. Members
  reads `user-members` joined to `users` and `user-contacts`; Invitations shows
  pending rows split into **Invited** / **Expired** (derived on `expiresAt` — there
  is no `expired` status in BetterAuth) with a pending-count badge. Server-side
  filter / sort / pagination; a merged Excel export behind the `download` var.
- **User detail** (`view` page) — one page with section-scoped edits: **Profile**
  (contact fields), **Attributes** (this app's roles + member attributes, plus — behind
  the `org_authority` var, and with its own submit — the member's organization-authority
  tier), **Global attributes** (user attributes), **Security** (suspend/reinstate,
  sign-out-everywhere, remove, delete, sessions, auth methods),
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
  Profile edit modal. It also carries the invitee's app roles and — behind the
  `org_authority` var — their organization-authority tier, seeded to `member` (no
  authority), so a form nobody touches invites app roles and no authority. That
  profile is **persisted to the contact record at invite
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
BetterAuth's invariants). Authorization has two independent halves:

1. **The endpoint is gated app-side**, by the app's own `auth.api.roles` — see
   [Installing an instance](#installing-an-instance). Nothing in the module gates it.
2. **Every step names the organization it acts in** — `org_slug`, explicitly, never
   the engine's absent-means-the-app's-pinned-organization fallback — and the engine
   floors the step against **the caller's own member row in that organization**. So
   the write lands only for someone holding `admin` there. For the steps that reach a
   deployment-wide `user` row (`BanUser`, `UnbanUser`, `DeleteUser`,
   `RevokeUserSessions`, `UpdateUserAttributes`) the floor additionally requires the
   **target** to hold a member row in the same organization.

| Concern                       | Record        | Write pathway                                                                                                                    |
| ----------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Profile / CRM data            | `contact`     | Shared `write-profile` fragment: change-stamped `contact` write + `UpdateUserProfile` re-denorm of the target's `user.profile`   |
| Login identity + global attrs | `user`        | `UpdateUserAttributes`, `BanUser` / `UnbanUser`, `DeleteUser`, `RevokeUserSessions`                                              |
| This organization's access    | `member`      | `UpdateMemberRoles` (the `appRoles` array), `UpdateMemberAttributes`, `RemoveMember`                                             |
| Organization authority        | `member.role` | `UpdateMemberOrgRole` — the `owner` / `admin` / `member` tier, on its own `update-org-role` endpoint (UI behind `org_authority`) |
| Pending access                | `invitation`  | `InviteMember` (app roles **and** the org tier), `CancelInvitation`                                                              |

Organization authority is a separate endpoint rather than a fourth step on
`update-access`: the two writes take different paths (app roles adapter-direct, the
tier through the organization plugin so its creator-protection and last-owner guards
run), they are separately audited, and a refused tier write must not leave an
app-role write applied with nothing to roll it back. `org_authority: false` removes the
two controls that reach it and makes the endpoint reject, so a deployment granting
organization authority out of band closes the surface rather than only hiding it.

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

These are the member's **app roles**, stored as a native `string[]` on
`member.appRoles`. They are a different fact from `member.role` — the organization's
`owner` / `admin` / `member` authority tier — and the module never derives one from
the other. The [install step below](#2-gate-each-instance-from-the-app-config) says
what each one buys.

## Installing an instance

An instance needs two things, and both are the app's job: a module entry naming the
organization it administers, and a gate on the pages and endpoints that entry
contributes. Neither has a default.

### 1. The module entries

```yaml
# lowdefy.yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v0.17.0"
    vars:
      # Required. The organization this surface administers — the same slug as this
      # app's own `auth.organizations.org` for the app's own users.
      org_slug: team
      app_title: Team
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
        user_attributes:
          _ref: modules/user-admin/user_attributes_fields.yaml
        member_attributes:
          _ref: modules/user-admin/member_attributes_fields.yaml

  # A second admin surface, administering ANOTHER app's organization: one module
  # source, two entries, two `org_slug` values. Auto-scoping keeps them apart —
  # `customer-user-admin/all` beside `user-admin/all`.
  - id: customer-user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v0.17.0"
    vars:
      org_slug: customer-portal
      app_title: Customer
```

**Deployment ordering: this module does not create the organization.** The app whose
`auth.organizations.org` names a slug is what creates it, at startup. So a second
instance administering another app's organization requires **that app to have booted
against the same database first** — until it has, the surface's reads render **empty
with no error** and its invite throws `ORGANIZATION_NOT_FOUND`. Either boot the owning
app before administering its organization from elsewhere, or insert the organization
row alongside the bootstrap invitation. And never rename a slug in place: the engine's
startup ensure is by slug, so a rename mints a fresh organization and strands every
member row in the old one.

There is **no `app_name` var** (per-app scoping by the old `apps.{app}` map is gone)
and **no `roles` var** (the catalog replaces it). See
`apps/demo/modules/user-admin/vars.yaml` and `apps/demo/modules.yaml` for a worked
two-instance example, and the [migration guide](how-to/migration.md) if upgrading.

### 2. Gate each instance from the app config

**Required, not defence in depth.** Each instance is gated by the app itself, with
**one picomatch pattern per instance per entity** in the app's own `auth` block:

```yaml
auth:
  # Every role a gate names must be declared here. A gate naming an undeclared id
  # fails the build: [ConfigError] Auth gate references role "…", which is not
  # declared in auth.roles.
  roles:
    - id: user-admin
      label: User Admin
      description: Administers users across the pinned suite (ban, invite, roles, sessions).
    - id: customer-user-admin
      label: Customer User Admin
      description: Administers the users of the customer portal organization.
  pages:
    protected: true
    public:
      - "404"
      - router
    roles:
      user-admin:
        - user-admin/**
      customer-user-admin:
        - customer-user-admin/**
  api:
    roles:
      user-admin:
        - user-admin/**
      customer-user-admin:
        - customer-user-admin/**
```

Two entities, because that is what the demo declares — add a third block only if the
app declares `auth.websockets`.

`**` is what makes one line enough: it covers every page and endpoint the instance
ships now and every one a later module version adds, while stopping at the instance
boundary (`*` does not cross a slash, `**` does), so neither surface can reach the
other organization's members.

**Omit a block and the instance is public.** An entity that declares neither
`protected` nor `public` resolves an item matching no glob to `{ public: true }` — so
an ungated instance's endpoints answer **with no session at all**, handing that
organization's members, emails and Excel export to anyone who knows the path. It is
the absence of those keys that decides, not the entity: in the config above
`auth.pages` sets `protected: true`, so an ungated _page_ still demands a session,
while `auth.api` sets neither key, so an ungated _endpoint_ is public. Most apps
declare neither on either.

**Two facts, not one.** This gate is the read side's whole authorization — the
organization an instance administers is welded into its reads at build time, so no
per-request check remains, and there is no module var and no deployment-wide admin
role behind it. It is also _only_ the read side. Holding the gate role says "show me
this UI"; holding `admin` in `org_slug`'s organization is what makes a write land (see
[Write pathways](#write-pathways)). The platform makes **no attempt to keep the two in
agreement** — they are two facts, neither derived from the other, and a deployment
that wants them aligned aligns them itself.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
- [Members row contract](reference/row-contract.md) — the row keys a `table_columns` or `download_columns` entry may bind
- [Same-database co-location](concepts/co-location.md) — the hard read precondition
- [Migrating from v0.x](how-to/migration.md) — var renames/removals, page renames, dropped deps, and the per-organization upgrade (`org_slug`, app-side gates, `role` off the row)

## Shared idioms

- [Event display](../shared/event-display.md) — per-type Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Text search and the Atlas fallback](../shared/search.md) — this module takes **no** `atlas_search` flag: its members search is always a plain-`$match` regex over the post-`$lookup` name and email fields, so it needs no Atlas Search index and behaves the same on Atlas and on a local `mongod`
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
