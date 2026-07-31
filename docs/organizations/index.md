---
title: Organizations
module: organizations
type: index
concepts:
  [tenant-policy, per-org-roles, invitations, org-switcher, active-organization]
---

# Organizations

The **self-serve workspace for one organization**: see which organization you're
working in, switch between the ones you belong to, name it, and manage its
members. Everything here is per-organization — every read is scoped to the
caller's **active** organization, and every write is a per-org client action that
BetterAuth authorizes against the caller's member role in that organization.

This is not multi-tenant administration. Suite-wide powers over a person's
account — suspend, impersonate, password reset — stay in
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

## What it does

- **Members** (`/organizations/members`) — the organization's people, with the
  contact record joined in. Invite someone by email with one or more roles;
  change a member's roles; remove a member; leave the organization yourself.
  Pending invitations are listed with their expiry and can be cancelled.
- **Organization** (`/organizations/settings`) — rename the organization. A
  tenant organization is born named after its founder, so renaming is usually
  the first thing an owner wants.
- **`org-switcher`** — a header widget naming the active organization, with a
  dropdown to switch when the caller belongs to more than one.

## Adding it to an app

```yaml
# modules.yaml — list organizations BEFORE layout when wiring the switcher:
# the layout entry vars cross-module _ref its components, and the entry-vars
# resolve is order-sensitive.
- id: organizations
  source: "github:lowdefy/modules-mongodb/modules/organizations@v0.17.0"

- id: layout
  source: "github:lowdefy/modules-mongodb/modules/layout@v0.17.0"
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

The switcher is exported as **two** components that must be wired together: a
block cannot declare its own request, so `org-switcher-requests` goes into
`header_extra.requests` and `org-switcher` into `header_extra.blocks`.

Menu links come from the module's `default` menu:

```yaml
- id: organization-group
  type: MenuGroup
  properties:
    title: Organization
    icon: AiOutlineBank
  links:
    _ref:
      module: organizations
      menu: default
```

`apps/tenant-demo` in this repo carries all three pieces wired up — the module
entry, the `header_extra` switcher, and the menu group.

## Roles

The role picker offers the app's authored `auth.roles` catalog — the single
source of truth for role ids and labels — plus `admin`, which BetterAuth reads
to authorize the per-organization endpoints. Declare `admin` in your own
catalog to give it your label; otherwise it is appended as
"Admin (organization)".

`owner` is not assignable here. Ownership transfer is out of scope; the
engine's last-owner guard is authoritative and refuses any change that would
leave the organization without one.

## Invitations

Inviting does two things in order: it mints (or links) the invitee's **contact**
in this organization, then sends the invitation. The contact mint is why an
invited person shows up in the organization's contact lists immediately rather
than only once they accept. The upsert reconciles on duplicate key, so a failure
partway through leaves nothing to clean up and a retry converges.

The invitation email itself is the engine's — `auth.email` plus the invitation
template. This module ships no email wiring. Invitees land on `user-account`'s
accept page.

## Same-database co-location

The members read joins the auth collections to `user-contacts` in a single
aggregation, and MongoDB's `$lookup` cannot cross databases. The BetterAuth
adapter's database, this module's `MONGODB_URI`, and the contacts connection
must all resolve to **one** database. The failure mode is silent — a
cross-database `$lookup` yields empty rather than erroring — so a divergent
deployment shows blank contact data instead of failing loudly.

## Connections

| Connection                 | Walled | Access     | Why                                                                          |
| -------------------------- | ------ | ---------- | ---------------------------------------------------------------------------- |
| `user-members`             | no     | read-only  | Engine-owned; each read scopes itself on the active org or the caller's rows |
| `user-organizations`       | no     | read-only  | Engine-owned; renames go through `UpdateOrganization`, never this connection |
| `user-invitations`         | no     | read-only  | Engine-owned; invitations are written by the client actions                  |
| `user-contacts-collection` | yes    | read/write | App data — the wall stamps and filters the organization mechanically         |

See [organization scoping](../shared/org-scoping.md) for what walled means.
