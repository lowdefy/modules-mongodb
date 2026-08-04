---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
---

PLACEHOLDER — do not add another changeset for the Better Auth migration.

This entry covers **all** user-account and user-admin work in the Better Auth
migration (`designs/user-account-better-auth/`, `designs/user-admin-better-auth/`,
and the `designs/users-fixes/` finding batches), including the layout and
`modules/shared/` changes made in service of it.

The migration is still in progress, so the release note is deliberately not
written yet — describing it commit by commit would produce a changelog of
intermediate states that never shipped. Rewrite this file as one coherent
consumer-facing note when the migration lands, and revisit the bump level then.

Until then: do not create per-commit changesets for this work. Add anything a
consumer will need to know here instead.

## Notes for the eventual release note

### `user-admin` — app roles and organization authority are separate facts

**Breaking: `org_slug` is required.** A `user-admin` entry now names the organization
it administers, and the slug is welded into every read `$match` and every write step at
build time. Set it to the app's own `auth.organizations.org` to keep existing
behaviour exactly; there is no default, because a defaulted slug would silently
administer the wrong organization where a missing one fails the build. **Two admin
surfaces in one app are two module entries** with different `org_slug` values — the
shape the whole change exists to enable. An instance administering another app's
organization needs that app to have booted against the same database first: this module
does not create organizations, and until one exists its reads render empty with no
error and `InviteMember` throws `ORGANIZATION_NOT_FOUND`.

**Breaking: `member.role` no longer ships on the members row.** App roles are now a
native `string[]` on `member.appRoles`, and `member.role` is left to BetterAuth's
`owner` / `admin` / `member` organization-authority tier — an administrative fact about
an organization, not a display column. `roles_arr` (the ids) and `roles` (resolved
`{ label, orphan }`) keep their names and their meanings, aliased from `appRoles`, so
only a column bound to `role` breaks: it blanks. The user detail read publishes the
tier under its own name, `org_role`. Add
`user-members { organizationId: 1, appRoles: 1 }` to serve the members-list role
filter — the list works without it, more slowly.

**New: granting organization authority, on by default.** The access modal and the
invite form carry an organization-authority control writing `member.role` through a new
`update-org-role` endpoint (`UpdateMemberOrgRole`, audited as `org-role-updated`), so an
admin who could previously only set app roles can promote a member to organization
`admin` or `owner`. Holding `admin` there is what lets a person administer an
organization, and that — not an app role — is what the engine floors every write
against. Set the new `org_authority` var to `false` in a deployment that grants
authority out of band; it hides the controls, and nothing more.

**Breaking: `admin_roles` is removed, and gating each instance is a required install
step.** The var was read nowhere and gated nothing. Each instance is gated by the app
itself, one picomatch pattern per instance per entity in the app's own `auth` block
(`pages.roles` and `api.roles`: `user-admin/**`), naming a role declared in
`auth.roles`. This is not defence in depth: an entity declaring neither `protected` nor
`public` — the usual shape of `auth.api` — resolves an endpoint matching no glob to
`{ public: true }`, so an ungated instance answers with no session at all.

**Breaking: the Security tile's "View as user" control and the `impersonation` var are
removed.** The engine no longer ships the `ImpersonateUser` / `StopImpersonating`
actions, so the control is unbuildable and the var would gate nothing. An app still
passing `impersonation` is **silently ignored** — the build does not flag an undeclared
top-level module var — so remove it by hand. The capability shipped off (the var
defaulted to `false`) and nothing builds on it; restoring it means restoring the whole
mechanism, and the model problem first: `user.role` is one field per deployment, so two
pinned apps sharing a database fight over the grant.

**Engine floor:** the module's steps pass `appRoles` arrays and `orgRole` and run
`UpdateMemberOrgRole`, all of which need the engine release carrying this design. Quote
the version here once it is known.

Consumer detail: `docs/user-admin/index.md` (install shape, both instances and both
gate blocks), `docs/user-admin/how-to/migration.md` (the upgrade, step by step),
`docs/user-admin/reference/row-contract.md` (the `role` breaking change).

### `user-admin` members rows are a documented, closed contract

Every members read (list, detail, Excel export) carries the three configurable field bags —
`profile`, `user_attributes`, `member_attributes` — under the same names as the
`fields.*` vars, so a `components.table_columns` `field:` and a
`components.download_columns` `value:` are the same path string as the form block id
that collects the field. `components.download_columns` works at all for the first
time, and `request_stages.get_all_users` now applies to the Excel export as the
manifest has always documented.

In exchange the rows no longer ship the raw `$lookup` payloads. Column paths that
resolve today and will go blank: anything under `user.*` / `contact.*`,
`attributes.*`, `createdAt`, `expiresAt`, `profile.picture`, and `picture` in the
export. The migration is one `request_stages.get_all_users` `$addFields` lifting the
value to a top-level key — it still runs before the row is closed. Full detail in
`docs/user-admin/reference/row-contract.md` and the Column paths section of
`docs/user-admin/how-to/migration.md`.
