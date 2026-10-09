---
title: Organizations
module: organizations
type: index
concepts:
  [
    tenant-policy,
    per-org-roles,
    invitations,
    org-switcher,
    active-organization,
    settings-pages,
    audit-log,
    ownership-transfer,
    organization-setup,
    mcp-tokens,
  ]
---

# Organizations

The **self-serve workspace for one organization**: see which organization you're
working in, switch between the ones you belong to, name it and give it a logo,
manage its members, read who changed what, and create a new one. Everything here
is per-organization: every read is scoped to the caller's **active**
organization, and every write is a per-org client action that BetterAuth
authorizes against the caller's member role in that organization.

This is not multi-tenant administration. Suite-wide powers over a person's
account (suspend, impersonate, password reset) stay in
[`user-admin`](../user-admin/index.md), which is pinned-only. Nobody here can
reach another organization's members, and no action crosses an org boundary.
The personal counterpart is [`user-account`](../user-account/index.md).

## Requires the tenant policy

Add this module only to an app running:

```yaml
auth:
  organizations:
    policy: tenant
```

Under `policy: pinned` the engine disables the per-organization client endpoints
this module drives, and **the build rejects the module outright**, naming the
action and the policy. That is deliberate: a pinned deployment has one
organization, so there is nothing to switch to and nothing to self-administer.
A pinned app simply does not add the entry.

The module needs Lowdefy `0.0.0-experimental-20261006081525` or later: its
tables are Lowdefy's `Table` block, with the avatar cell's `descriptionField`.

## Pages

The settings pages share one frame, the [`settings-page`](#settings-page)
component.

| Page                  | Who               | What                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `general`             | every member      | The organization's name and logo (owners and admins edit them) and its facts: members, pending invitations, the app's own `general_facts` and the caller's authority.                                                                                                     |
| `members`             | every member      | The members table (search, sort, a row opens the member page) and, for owners and admins, the pending invitations and the invite form.                                                                                                                                    |
| `member`              | every member      | One person, `member?user_id=<user id>`: identity; the access form (authority and app roles, one Save) for owners and admins; their activity; the app's own blocks (`member_page_blocks`); transfer ownership; remove, or leave on your own page. A former member shows their name and activity. |
| `audit-log`           | owners and admins | Every organization event, newest first, grouped by day, filterable by person and by kind.                                                                                                                                                                                 |
| `billing`             | owners and admins | A placeholder holding its place in the settings menu.                                                                                                                                                                                                                     |
| `security`            | owners and admins | A placeholder for the sign-in rules and a danger zone; with `mcp_tokens` on, the organization's [MCP tokens](#mcp-tokens) with Switch off.                                                                                                                              |
| `my-organizations`    | anyone signed in  | Every organization the caller belongs to, with their authority and the member count: Settings on the active one, Switch on the others, Leave (through the caller's own member page) except on their only membership, and Create when creation is on.                      |
| `create-organization` | anyone signed in  | Name a new organization and become its owner. Present only when `allow_create_organization` is true.                                                                                                                                                                      |
| `setup`               | the new owner     | Where the creator lands: mints the owner's contact in the new organization and logs its creation once, then optional steps (the app's `setup_steps`, a logo, inviting people) and Done to home.                                                                           |
| `switch-organization` | anyone signed in  | `switch-organization?org=<id>&to=<app path>`: checks the caller is a member, switches the session, records the organization as this browser's last, and goes on to `to` (a relative app path; anything else goes home).                                                 |

Every change of the active organization goes through `switch-organization`:
the switcher, the my-organizations page, the create page and
`restore-last-organization` all link to it.

## Adding it to an app

```yaml
# modules.yaml: list organizations BEFORE events and layout. Their entry vars
# cross-module _ref its components, and the entry-vars resolve is
# order-sensitive.
- id: organizations
  source: "github:lowdefy/modules-mongodb/modules/organizations@<ref>"
  vars:
    _ref: modules/organizations/vars.yaml

- id: events
  source: "github:lowdefy/modules-mongodb/modules/events@<ref>"
  vars:
    event_types:
      _build.object.assign:
        - _ref: modules/events/event_types.yaml
        - _ref:
            module: organizations
            component: event_types

- id: layout
  source: "github:lowdefy/modules-mongodb/modules/layout@<ref>"
  vars:
    header_extra:
      requests:
        _ref:
          module: organizations
          component: org-switcher-requests
      blocks:
        - _ref:
            module: organizations
            component: org-switcher
```

- **Events.** Every write logs an organization event through the events
  module, and the audit log and the member page read them back. Register the
  module's `event_types` component in the events module's `event_types` var so
  they show with their titles and icons.
- **Switcher.** The switcher is exported as **two** components that must be
  wired together: a block cannot declare its own request, so
  `org-switcher-requests` goes into `header_extra.requests` and `org-switcher`
  into `header_extra.blocks`. An app with its own account menu can wire only
  `org-switcher-requests` and draw the memberships itself (each row carries
  `organization_id`, `organization_name`, `organization_logo`, `role` and
  `is_active`), linking each to `switch-organization`.
- **Landing page.** `restore-last-organization` returns a person to the
  organization they last switched to in this browser (the engine starts every
  new session in their oldest membership). Put its actions first on the landing
  page, with `to` (where the landing page goes next) and `skip`; when it hands
  off it sets `last_organization_restore` in state, which the landing page's
  own routing skips on. `apps/tenant-demo/pages/router.yaml` is the example.
- **Menu.** The module's `default` menu links the members and general pages:

  ```yaml
  - id: organization-group
    type: MenuGroup
    properties:
      title: Organization
      icon: Landmark
    links:
      _ref:
        module: organizations
        menu: default
  ```

`apps/tenant-demo` in this repo wires all of it, and every extension point in
[Extending the settings pages](how-to/extend-settings.md).

## Settings page

`settings-page` is the frame of every settings page, and an app can build its
own settings pages on it. It is the layout's `page` with one header (the
`group` line, the `title` and a `description`), the organization read every
settings page needs, and a `shell` var:

```yaml
shell:
  mode: settings
  back: { title: <settings_back_title>, pageId: <settings_back_page_id> }
  settings_sections: <the organization's section, then settings_sections>
  selected: <the link to light>
```

A layout that reads `shell` draws the settings sections in place of the side
menu, under a Back row. The layout module in this repo does not read it yet, so
there the settings pages show with the app's usual menu, and the `default` menu
is the way in.

Vars: `id`, `title`, `description`, `group`, `blocks`, `requests`, `events`
(`onInit`, `onInitAsync`, `onMount`, `onMountAsync`, `onMountAsyncCatch`),
`page_actions`, `content_width` (default 960), `owners_and_admins_only`,
`selected` (default the page id), `breadcrumbs` and `subscriptions`. With
`owners_and_admins_only: true`, anyone else sees a no-access line and the
page's event actions are skipped; a request that returns owner-and-admin data
still checks the caller's authority itself.

## Roles

A member row carries two separate authorities, and the member page's access
form sets both with one Save (`update-member-access`):

- **App roles** (`member.app_roles`, a native array): what the app's UI shows
  this person. The picker offers the app's authored `auth.roles` catalog, the
  single source of truth for role ids and labels.
- **Organization authority** (`member.role`: `owner` / `admin` / `member`):
  who may administer the organization. Owners and admins change it, and only
  owners change an owner's access. It is written through the organization
  plugin, so the creator-protection and last-owner guards run.

**Ownership transfer** (`transfer-ownership`) makes another member an owner and
steps the calling owner down to admin. The engine's last-owner guard refuses any
change that would leave the organization without an owner, and `leave` refuses
the only owner.

## Invitations

The invite form checks the address as it is typed and says whether the person
is already a member, has a live invitation (Resend, Cancel, or Change it), has
an expired one (the form filled from it) or is new. It sets the invitee's
authority, app roles and the app's own member fields (`invite_fields`, under
`invite.attributes`); the engine copies the attributes onto the member row when
the invitation is accepted. Inviting an address with a pending invitation
re-issues that invitation.

The `invite` endpoint first mints (or links) the invitee's **contact** in this
organization, then sends the invitation. The contact mint is why an invited
person shows up in the organization's contact lists immediately. The upsert
reconciles on duplicate key, so a failure at the invitation step leaves nothing
to clean up and a retry converges.

The invitation email itself is the engine's: `auth.email` plus the invitation
template. This module ships no email wiring. Invitees land on `user-account`'s
accept page. Set `invitation_expiry_days` to match
`auth.organizations.invitationExpiresIn` so the form's hint names the expiry.

## Events and the audit log

Every write endpoint logs an organization event: `org-invited`,
`org-invitation-resent`, `org-invitation-cancelled`, `org-app-roles-changed`,
`org-authority-changed`, `org-member-removed`, `org-member-left`,
`org-renamed`, `org-logo-changed`, `org-ownership-transferred` and
`org-created` (`org-member-joined` is saved by `user-account`'s accept page).
The audit log also shows `org-mcp-token-created` and `org-mcp-token-revoked`
([MCP tokens](#mcp-tokens)), whichever module saved them.
Their titles are Nunjucks templates that the `event_display` var overrides type
by type. The `label` var names the organization in every page, message and
event title, so an app can call it a team or a workspace.

`org-member-left` is written after the caller has left, so the walled events
connection would stamp the wrong organization. It goes through the module's
`org-events-system` connection (`tenant: shared`), which stamps the
organization left explicitly and change-logs into `log-changes-system`.

## MCP tokens

With `mcp_tokens: true` the `security` page gets an **Access tokens** section:
every MCP member token in the active organization, with its member, name,
start (its first 12 characters), created, expires ("Never" for a token that
does not expire) and last used, newest first. Owners and admins switch any of
them off; it stops working on its next call.

```yaml
# modules/organizations/vars.yaml
mcp_tokens: true
```

It needs the app's MCP authorization server (`auth.oauthProvider`): member
tokens live in its `user-mcp-tokens` collection, and switching one off
(`RevokeOrgMcpToken`) fails without it. It also needs Lowdefy
`0.0.0-experimental-20261009120232` or later. Members create and switch off
their own tokens elsewhere, for example in `user-account`; this section is the
organization's overview. With the var off (the default) the section, its read,
the `user-mcp-tokens` connection and the `revoke-mcp-token` endpoint are left
out of the build, and the security page is unchanged.

The list reads `user-mcp-tokens` through a walled, read-only connection,
without the token hash, and takes each member's name, picture and email from
the members read. `revoke-mcp-token` (payload `{ token_id }`) runs
`RevokeOrgMcpToken`, which needs `member: [update]` authority in the
organization, so the step refuses anyone but owners and admins whatever the
page shows.

The switch-off is logged as `org-mcp-token-revoked`, with the admin as actor and
the token's member as subject. Token events carry `metadata.token_name` and
`metadata.token_start`, never the token. A member's own create and switch-off
(`org-mcp-token-created`, `org-mcp-token-revoked`, saved by the module that
offers them) show in the same audit log; the `MCP tokens` kind filters to both.

## Same-database co-location

The members read joins the auth collections to `user-contacts` in a single
aggregation, and MongoDB's `$lookup` cannot cross databases. The BetterAuth
adapter's database, this module's `MONGODB_URI`, and the contacts connection
must all resolve to **one** database. The failure mode is silent: a
cross-database `$lookup` yields empty rather than erroring, so a divergent
deployment shows blank contact data instead of failing loudly.

`member-join` exports the same join as a pipeline for the app's own reads on
the `user-members` connection: the active organization's members as flat rows
`{ member_id, user_id, name, email, picture, org_role, app_roles, joined }`,
with vars `match` (extra member-row `$match` fields) and `project` (extra row
fields). `apps/tenant-demo/pages/team-directory.yaml` is the example.

## Connections

| Connection                 | Walled | Access     | Why                                                                           |
| -------------------------- | ------ | ---------- | ----------------------------------------------------------------------------- |
| `user-members`             | no     | read-only  | Engine-owned; each read scopes itself on the active org or the caller's rows  |
| `user-organizations`       | no     | read-only  | Engine-owned; renames and logos go through the `update-organization` endpoint |
| `user-invitations`         | no     | read-only  | Engine-owned; invitations are written by the module's endpoints               |
| `user-contacts-collection` | yes    | read/write | App data; the wall stamps and filters the organization mechanically           |
| `org-events-system`        | no     | write      | The left event, stamped with the organization left; change-logs on its own    |
| `user-mcp-tokens`          | yes    | read-only  | Engine-owned; rows carry `organization_id`. Only with `mcp_tokens` on         |

See [organization scoping](../shared/org-scoping.md) for what walled means, and
[vars](reference/vars.md) for every module var.
