# Org Workspace

Self-serve organization surface for tenant deployments: see which organization
you're working in, switch between the organizations you belong to, name your
organization, and manage its members (invite, remove, change member role). This
is the tenant-shape user surface that [org-aware-modules](../org-aware-modules/design.md)
declared a non-goal — the data layer it required is now shipped and verified
(two live tenants, walled reads, org-stamped mints).

**Not multi-tenant administration.** The user-admin module's suite-wide powers
(Suspend = global ban, Impersonate, password reset) stay pinned-only per
org-aware-modules Decision 6. Everything here is **per-org**: authorized by the
caller's member role *in the active organization* and scoped to it. Nobody can
reach another organization's members, and no action here crosses an org
boundary.

## Problem

Under `auth.organizations.policy: tenant` the engine already does the hard
parts — a fresh signup mints its own organization (caller becomes `owner`),
invited users join the inviter's org via the accept page, the tenant wall
isolates every module collection. But the deployment is headless around it:

- An organization is born named after its founder (`name: <user.name>`,
  `slug: org-<userId>`) with **no way to rename it**.
- There is **no UI to invite someone into an organization** — the engine's
  invitation machinery (branded email, accept page, pending-invitation
  carve-out) is fully built but unreachable. A tenant deployment cannot grow an
  org past one member without hand-calling the auth API.
- A user who belongs to several organizations has **no way to see which org is
  active or switch** — the active org is silently the oldest membership.

## Engine surface (verified against lowdefy `feat/mongodb-tenant-wall`, 2026-07-24)

What the auth engine already provides, confirmed in source:

1. **Per-org HTTP endpoints, enabled under tenant only.** Under `pinned` the
   engine disables every mounted `/api/auth/organization/*` path except
   `accept-invitation` (`ORG_CLIENT_PATHS_DISABLED_WHEN_PINNED`,
   `getBetterAuthConfig.js`). Under `tenant` the full per-org surface is
   mounted and **BetterAuth itself authorizes each call by the caller's member
   role in the target org**: `invite-member`, `cancel-invitation`,
   `remove-member`, `update-member-role`, `update` (rename), `leave`,
   `set-active`, plus reads. `create` stays off under both policies
   (`allowUserToCreateOrganization: false`) — orgs are engine-minted.
2. **Client actions**: `SetActiveOrganization` (id or slug) and
   `AcceptInvitation` exist as first-class actions. The other per-org
   operations have **no first-class action** — only the generic raw `Fetch`
   action could reach them today.
3. **Invitation delivery is engine-owned**: the branded `InvitationEmail`
   (auth.email connection, `templates.invitation` override) carries the accept
   URL; the accept page (user-account module) and the pending-invitation
   carve-out (invited signups don't mint their own org) already work.
4. **Org member roles are BetterAuth's** (`owner` / `admin` / `member`) — a
   separate axis from the app's `auth.roles` catalog (endpoint gates, menus).
   This module surfaces the BetterAuth axis only.
5. **Reads**: the auth collections (`user-members`, `user-organizations`,
   `user-invitations`) are engine-owned and unwalled; org-scoped reads filter
   explicitly on `_user: organizationId` — the exact pattern user-admin's list
   requests use after the policy-portability fix.
6. **Gap — policy invisible to config**: `_build.authConfig` projects
   `organizations.signup` but **not `organizations.policy`**, so module config
   cannot branch pinned/tenant at build time. Upstream ask 2.

## Decisions

### 1. A new `organizations` module owns this surface

Not user-account (that module is the *person's* surface: auth flows, profile,
sessions) and not user-admin (suite administration, pinned-only). The org
workspace is the *organization's* surface with its own audience (org
owners/admins for members and settings; every member for the switcher).
Dependencies: `layout` (page shell), `user-account` (accept page cross-link on
invitations). Pages: `members`, `settings`. Components: `org-switcher`.
Connections: `user-members`, `user-organizations`, `user-invitations` — all
**unwalled** (engine-owned collections; explicit `_user: organizationId`
scoping per Engine surface 5).

### 2. Writes go through first-class actions — upstream ask, not `Fetch`

Every mutation (invite, cancel invitation, remove member, change member role,
rename org, leave org) uses a first-class client action mirroring
`SetActiveOrganization`'s shape, unwrapping BetterAuth errors the way `Login`
does. These actions do not exist yet — **upstream ask 1** requests them:

- `InviteMember({ email, role })` → `/organization/invite-member`
- `CancelInvitation({ invitationId })` → `/organization/cancel-invitation`
- `RemoveMember({ memberIdOrEmail })` → `/organization/remove-member`
- `UpdateMemberRole({ memberId, role })` → `/organization/update-member-role`
- `UpdateOrganization({ name })` → `/organization/update`
- `LeaveOrganization()` → `/organization/leave`

All target the caller's **active** organization; BetterAuth enforces the member
role server-side, so a forged call from a plain member fails there — the module
UI gates are convenience, not security.

Rejected: building on the raw `Fetch` action. It works today (the endpoints are
mounted, same-origin cookies ride along), but hand-rolls paths, error shapes,
and `basePath` handling per call site — exactly the "filter you write is a
filter you can write wrongly" class the platform avoids, and it would leave two
generations of call sites once actions land. The actions are thin (each is
`SetActiveOrganization` with a different method call), the upstream release
loop is same-day, and the module is not time-critical.

### 2b. Consolidation with the existing modules

The surface overlaps user-admin and user-account deliberately; the
consolidation rule is **share the reads and the contact mint, never the write
mechanism**:

- **Shared read stages.** user-admin's `members_base` / `invitations_base`
  stages (user-members ⨝ users ⨝ contacts join, org-scoped by
  `_user: organizationId`) are exactly the reads the members page needs. They
  move to `modules/shared/org/` fragments consumed by both modules — one
  canonical join, same precedent as `shared/contact/create-or-link-contact`.
- **Shared contact mint at invite.** user-admin's invite pairs the auth
  invitation with the shared `create-or-link-contact` fragment so the invitee
  has an org-stamped contact immediately. The organizations invite does the
  same — and *simpler*: the inviter is a logged-in caller with the target org
  active, so the mint runs on the **walled** contacts connection and the wall
  stamps the org mechanically (no system-context/`organization_id` variant
  needed). Sequence on the members page: `CallAPI` (module endpoint mints the
  contact via the shared fragment) → `InviteMember` action. The upsert is
  idempotent, so a failed second step retries cleanly. Without this, an
  invited user who already has a contact in another org would be invisible in
  the joined org's contact lists until upstream ask 2 (per-membership
  contactId) lands — the mint closes that for the common case.
- **Write mechanisms stay separate by engine necessity.** user-admin mutates
  through auth-owned **admin steps** (userAdminRole floor — works under
  pinned, where the per-org HTTP paths are disabled). The organizations module
  mutates through **per-org client actions** (member-role-gated — mounted
  under tenant only). Same wall, two doors; forcing one mechanism through the
  other's door is exactly what the engine refuses.
- **The accept page stays in user-account.** It is an auth-flow page (chrome
  -less shell, `authPages.acceptInvitation` manifest contribution, used by
  people who are *not yet* members) — the organizations module is for people
  managing an org they already belong to. Cross-linked, not moved.

### 3. Members page (`members`) — per-org management

One page, active org only:

- **Members table**: joined from `user-members` (filter
  `organizationId: {_user: organizationId}`) + `users` (name, email, avatar) +
  `user-contacts` linkage where present. Columns: person, email, member role,
  joined date.
- **Invite**: email + member role (`member` default; `admin` assignable by
  owner/admin; `owner` transfer out of scope v1). Calls `InviteMember`; the
  engine sends the branded invitation email.
- **Pending invitations list**: from `user-invitations` (same org filter,
  status pending) with cancel (`CancelInvitation`) and the expiry visible.
- **Member actions**: remove (`RemoveMember`), change role
  (`UpdateMemberRole`). UI-gated to owner/admin callers (read own member row);
  self-remove is `LeaveOrganization` with a confirm (the engine's last-owner
  guard is authoritative).

### 4. Settings page (`settings`) — name your organization

v1 is deliberately small: rename the active organization (`UpdateOrganization`,
owner/admin-gated by the engine). The founding flow stays untouched — a new
org keeps its engine-minted name until its owner renames it here; folding a
"name your workspace" step into onboarding is a possible later enhancement
once the policy projection (upstream ask 2) allows onboarding to branch by
policy without new module vars.

### 5. Switcher (`org-switcher`) — exported component, app-wired

A compact header widget: shows the active org's name (read
`user-organizations` by `_user: organizationId`); when the caller has more
than one membership (read `user-members` by `_user: id`), a dropdown lists the
others and switching runs `SetActiveOrganization` → `UpdateSession` → `Link`
home. Exported as a component and wired by the app into the layout's existing
`header_extra` seam — **no layout-module change**. Single-membership callers
see just the org name (still valuable context in a tenant app).

### 6. Behavior under `pinned`: not consumed, and safe if consumed

The natural pinned deployment simply doesn't add the `organizations` module
entry — the surface is meaningless there (one org, endpoints disabled). If a
pinned app consumes it anyway, reads still work (the pinned org resolves via
`_user: organizationId`) and every mutation fails loudly at the engine's
disabled-path wall — fail-closed, no misbehavior. Once upstream ask 2 lands,
the pages can additionally render a "single-organization deployment" empty
state via `_build.authConfig.organizations.policy`; this is polish, not a
blocker.

### 7. Demo consumer

Per repo rule, the demo app (already `policy: tenant`) consumes everything in
the same change: module entry, menu links to `members`/`settings`,
`org-switcher` in `header_extra`. Manual verification extends the existing
runtime checklist: rename the founder org, invite the second tenant's email
into it, accept, confirm the invitee's membership + contact mint in the
inviter's org, switch orgs with the widget, and confirm walled lists follow
the active org.

## Upstream asks

Tracked in [upstream-asks.md](upstream-asks.md):

1. **Per-org client actions** (Decision 2's list) — thin wrappers over the
   already-mounted, already-authorized BetterAuth org endpoints, matching
   `SetActiveOrganization`'s conventions.
2. **Project `organizations.policy` into `_build.authConfig`** — one field in
   `computeAuthConfigProjection`; lets org-surface config branch by deployment
   shape at build time (Decision 6 polish, onboarding enhancement in
   Decision 4).

## Non-goals

- Multi-tenant administration (suite-wide user admin under tenant) — its own
  future design; user-admin stays pinned-only.
- Org creation UI (`allowUserToCreateOrganization` stays false; orgs are
  engine-minted at signup), org deletion, owner transfer.
- Per-membership contact linkage (org-aware-modules upstream ask 2) — the
  documented v1 fallback stands: an invited user's contact in the second org
  comes from the invite flow.
- Teams, dynamic access control (BetterAuth options the engine doesn't mount).
