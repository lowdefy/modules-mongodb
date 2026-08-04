---
title: Migrating from the v0.x surface
module: user-admin
type: how-to
concepts: [migration, breaking-change, betterauth]
---

# Migrating from the v0.x surface

`user-admin` was **rebuilt** on the BetterAuth-based auth engine — this is a major
breaking change, not an in-place upgrade. The old module owned a person as raw
writes against the fused `user_contacts` collection (`apps.{app}` map, `is_user`,
`disabled`, `global_attributes`); the new model splits that record across
app-owned `contact` data and auth-owned `user` / `member` / `invitation` /
`session` records, written only through sanctioned admin steps.

Expect to re-do your module configuration rather than tweak it.

> Already running the rebuilt module? The per-organization change is a second,
> smaller upgrade — skip to
> [Upgrading to the per-organization surface](#upgrading-to-the-per-organization-surface).

## Prerequisite

The app must run the BetterAuth-based auth engine with a **pinned** org policy
(`auth.organizations.policy: pinned`), an authored `auth.roles` catalog, and a
role gate for each module instance in its own `auth.pages.roles` /
`auth.api.roles` — see [Installing an instance](../index.md#installing-an-instance).
The adapter database, the `user-contacts` connection, and the module's read
connections must all resolve to **one MongoDB database** — see
[Same-database co-location](../concepts/co-location.md).

## Vars

| v0.x                       | Now                        | Notes                                                                                              |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `app_name`                 | **removed**                | Per-app scoping by the `apps.{app}` field path is gone; one instance administers one organization. |
| `roles`                    | **removed**                | The assignable set comes from the app's authored `auth.roles` catalog (single source).             |
| `app_domain`               | **removed**                | No longer used.                                                                                    |
| `fields.global_attributes` | `fields.user_attributes`   | Renamed to the model: global attributes live on the `user` row.                                    |
| `fields.app_attributes`    | `fields.member_attributes` | Renamed to the model: this app's attributes live on the `member` row.                              |
| —                          | `org_slug`                 | **Required.** The organization this instance administers. No default.                              |
| —                          | `suspension`               | Gates suspend/reinstate (default `true`).                                                          |
| —                          | `org_authority`            | Gates the organization-authority grant control (default `true`).                                   |
| —                          | `download`                 | Gates the Excel export (default `false`).                                                          |

There is **no var that gates the module's pages or endpoints**. Each instance is
gated by the app itself, one pattern per instance per entity, and writing those
lines is a required install step — see
[Installing an instance](../index.md#installing-an-instance).

`app_title`, `event_display`, `components.*`, `request_stages.*`, `filter_requests`,
and `avatar_colors` carry over in kind. `event_display` templates now receive
`user` (acting admin) and `target` (edited/invited user).

## Column paths

The rows every members read returns are now a
[documented, closed set of keys](../reference/row-contract.md). A
`components.table_columns` `field:` or `components.download_columns` `value:`
outside that set renders an empty column. Four kinds of path stop resolving:

1. **Raw join paths** — `user.emailVerified`, `contact.updated.by`, and anything
   else under `user.*` or `contact.*`. The reads used to ship both whole source
   documents on every row, so these resolved with no configuration at all.
2. **Alias duplicates** — `attributes.*` (bind `member_attributes.*`), `createdAt`
   (bind `signed_up`, or `created` on invitation rows), `expiresAt` (bind
   `expires_at` on the Invitations tab, `expires` in the export), and
   `profile.picture` (bind the top-level `picture`).
3. **`picture` in the export** — dropped there, kept on the list.
4. **Contact fields** are now reachable directly: bind `profile.<field>` rather
   than lifting it through a stage.

One migration covers 1–3 — lift the value to a top-level key in a
`request_stages.get_all_users` `$addFields`, which still runs before the row is
closed in every read:

```yaml
request_stages:
  get_all_users:
    - $addFields:
        email_verified: "$user.emailVerified"
```

Note that `get_all_users` now also runs on the **Excel export**, over member and
invitation rows alike — the manifest always documented this; the request never
applied it. A stage reading `$contact.*` yields nulls on the invitation half, and a
`$project` or `$replaceRoot` in that slot will break the export. Use `$addFields`.

`request_stages.filter_match` is unaffected: it still runs before the row is closed
and can keep matching raw `user.*` / `contact.*` paths.

## Pages

| v0.x                      | Now                                                         |
| ------------------------- | ----------------------------------------------------------- |
| `all`                     | `all` (Members + Invitations tabs)                          |
| `view` + `edit` + `check` | `view` (single detail page with section-scoped edit modals) |
| `new`                     | `invite` (email-first check-then-invite)                    |

The public **accept page is not this module's** — it belongs to the auth-page
modules (`user-account`).

## Dependencies

- `notifications` is **dropped**. The invite email now rides the deployment's
  `auth.email` (the same path as verification / password-reset / magic-link
  emails). An app that wants bespoke invite copy points
  `auth.email.templates.invitation` at one of its own `notifications:` entries —
  an app-level `auth:` override, not a module dependency.
- `layout` and `events` are unchanged.

## Behaviour changes

- **Search is plain `$match` regex/text** over the joined shape — the Atlas
  `$search` stage and its index requirement are gone. Sized for pinned orgs in the
  low thousands of members.
- **The role filter matches exact elements of the member's `appRoles` array** — a
  filter for `admin` does not also match `super-admin`. It matches on the member root
  ahead of the read's `$lookup`s, so a
  [`{ organizationId: 1, appRoles: 1 }` index](../../user-account/reference/indexes.md#user-members-collection)
  can serve it; without the index the filter still returns correct rows, it just scans
  the organization's whole membership.
- **Two revocations, honestly labelled**: **Suspend** (`BanUser`) is permanent,
  user-level, and reaches every app in the suite; **Remove from app**
  (`RemoveMember`) is app-scoped. **Delete login identity** (`DeleteUser`) is
  offered only when the user belongs to no other apps.
- **New engine capabilities**: session listing + sign-out-everywhere, and
  read-only auth-method visibility (email-verified, OAuth providers, MFA,
  passkeys).
- **All raw writes to auth-owned data are gone** — every auth write goes through a
  sanctioned admin step. The endpoint is gated by the app's own `auth.api.roles`; the
  step then names `org_slug` explicitly and the engine floors it against the caller's
  member row in that organization, so the write lands only for someone holding `admin`
  there.

## Upgrading to the per-organization surface

The module used to administer whichever organization the app pinned, keep app roles in
`member.role`, and rely on a single app-wide administering role. It now administers the
organization named by a required `org_slug` var, keeps app roles as a native `string[]`
in `member.appRoles`, and authorizes each write against the caller's own member row in
the organization the write names.

### 1. Set `org_slug` — the one mandatory change

```yaml
vars:
  org_slug: acme # the value of this app's `auth.organizations.org`
```

There is no default: a defaulted slug would silently administer the wrong
organization, where a missing one fails the build. Setting it to the app's own
`auth.organizations.org` keeps today's behaviour **exactly**. A second surface
administering another app's organization is a **second module entry** with a different
`org_slug`; that organization is not created by this app, so read
[Installing an instance](../index.md#installing-an-instance) before wiring one — the
deployment ordering bites, and the symptom is an empty list with no error.

### 2. Remove `impersonation` by hand — the build will not tell you

The Security tile's "View as user" control and the `impersonation` var are **gone**.
The engine no longer ships the `ImpersonateUser` / `StopImpersonating` actions, so the
control is unbuildable and the var would gate nothing.

> **An undeclared top-level var is silently ignored, not rejected.** The build
> validates the manifest's declared vars against what you passed; it never walks your
> keys. So an app still passing `impersonation: false` builds green and the value is
> simply discarded — there is no warning to notice. Delete it yourself.
>
> An undeclared **nested** key inside a var declared with properties (`fields.*`,
> `components.*`, `request_stages.*`) is the opposite: a hard build error,
> `ConfigError … has undeclared property "<key>"`.

### 3. Gate each instance app-side, and delete `admin_roles`

`admin_roles` is **gone**. It was read nowhere and gated nothing, so an app relying on
it was relying on nothing. Remove it, and make sure the app's own
`auth.pages.roles` / `auth.api.roles` name a pattern for each module instance:

```yaml
auth:
  pages:
    roles:
      user-admin:
        - user-admin/**
  api:
    roles:
      user-admin:
        - user-admin/**
```

This is not tidying. An entity that declares neither `protected` nor `public` — the
usual shape of `auth.api` — resolves an endpoint matching no glob to `{ public: true }`,
so an ungated instance answers **with no session at all**. Full failure mode and the
two-instance shape: [Installing an instance](../index.md#installing-an-instance).

An app that hand-wrote gates naming the module's scoped ids can collapse them to
`<instance>/**`, which also covers every page and endpoint a later module version adds.
Every role named must be declared in `auth.roles`; one that isn't fails the build.

### 4. A column bound to `role` blanks

`member.role` now holds the organization's `owner` / `admin` / `member` tier, so it is
no longer shipped on the members row. A `table_columns` `field: role` or a
`download_columns` `value: role` renders empty. Bind `roles_arr` (the app-role ids) or
`roles` (the resolved `{ label, orphan }` objects) instead — both kept their names and
their meanings. See
[the row contract's breaking-change note](../reference/row-contract.md#the-two-role-keys-and-the-organization-tier).

### 5. Create the members-list role-filter index

The role filter now matches `member.appRoles` on the member root. Add
[`user-members { organizationId: 1, appRoles: 1 }`](../../user-account/reference/indexes.md#user-members-collection)
— multikey compound, not unique. The list works without it, just more slowly: every
role filter scans the organization's whole membership.

### 6. Decide whether admins may grant organization authority

New surface, **on by default**. The access modal and the invite form now carry an
organization-authority control, so an admin who could previously only set app roles can
promote a member to organization `admin` or `owner` — and `admin` in an organization is
what lets a person administer it. Revoking writes `member`, the no-authority value;
there is no empty value, and the endpoint refuses one.

Set `org_authority: false` in a deployment that grants organization authority out of
band. Note what that does and does not do: it **hides the two controls, and nothing
more**. The `update-org-role` endpoint is still registered and still answers a caller
holding the instance's gate role — this var is weaker than `suspension`, which also
makes `suspend` / `reinstate` reject when it is false. The write remains floored by the
engine against the caller's member row in the administered organization, which is what
actually stops it.

### 7. Bump the engine

The module's steps now pass `appRoles` arrays and `orgRole`, and run
`UpdateMemberOrgRole`. All three need the engine release that carries this work.
**The version floor is not yet known** — the engine changes are unreleased at the time
of writing, so no floor can be quoted here. Until they ship, the symptom of building
against an engine that predates them is a build failure of the form:

```
[ConfigError] Step connectionId missing at endpoint "user-admin/update-org-role".
```

— the engine does not recognise `UpdateMemberOrgRole` as an auth step type and falls
through to validating it as a request step.
