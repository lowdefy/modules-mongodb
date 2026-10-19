---
"@lowdefy/modules-mongodb-user-admin": minor
---

**Breaking: `user-admin` is rebuilt on Lowdefy 7's BetterAuth auth engine** as the operator console for a person's access to one organization. This is a rebuild, not an in-place upgrade: a person is now an app-owned contact plus the auth engine's `user`, `member`, `invitation` and `session` records, and every write to auth-owned data goes through the engine's admin steps. Expect to redo the module entry. Step-by-step upgrade: `docs/user-admin/how-to/migration.md`.

**Install shape:**

- **`org_slug` is required.** It names the organization the instance administers, and it is fixed into every read and write at build time. Set it to the app's `auth.organizations.org`. There is no default. Two admin surfaces in one app are two module entries with different `org_slug` values. An instance that administers another app's organization needs that organization to exist already. Until it does, the lists render empty with no error.
- **Gate each instance in the app's own `auth` block.** Name a role from `auth.roles` for the instance's pages and endpoints (`auth.pages.roles` and `auth.api.roles`, e.g. `user-admin/**`). An ungated endpoint answers with no session at all. The module has no var that gates it.
- The module runs under `auth.organizations.policy: pinned`. Self-service administration under `tenant` is the new `organizations` module.
- The adapter database, the `user-contacts` connection and the module's read connections must resolve to one MongoDB database. A cross-database `$lookup` reads as empty, and that shows up as blank contact data.
- Add `user-members { organization_id: 1, app_roles: 1 }` for the members-list role filter. The list works without the index, but more slowly.

**Pages.** `all` holds the Members and Invitations tabs with search, role filter and an optional Excel export (`download`, default `false`). `invite` (replacing `new` and `check`) checks the address first. It offers Resend for a live invitation, and for an expired one it prefills that invitation's roles, tier and attributes. It also reads an `?email=` query, which is how the Invitations tab's Re-invite opens it. `view` (replacing `view` and `edit`) is one detail page with tiles and edit modals for profile, access, user attributes and security (suspend and reinstate, sign out everywhere, reset two-factor, revoke passkeys, remove from app, delete login).

**Vars:**

- Removed: `app_name`, `roles` (the assignable roles come from the app's `auth.roles`) and `app_domain`.
- Renamed: `fields.global_attributes` is now `fields.user_attributes` (on the `user` row), and `fields.app_attributes` is now `fields.member_attributes` (on the `member` row). Conditions in `fields.member_attributes` can read `_state: member_attributes.*` and `_state: roles` on the view page and in the edit dialog.
- New gates, each default `true`: `org_authority` (granting and revoking organization `admin`), `suspension`, `remove_member` and `delete_user`. A gate set to `false` hides its control and makes its endpoint reject.

**Members rows are a documented, closed contract** (`docs/user-admin/reference/row-contract.md`). App roles are `member.app_roles` and resolve to `roles` on the row. `member.role` is the organization's `owner` / `admin` / `member` tier and is not on the row, so a column bound to `role` renders empty. Bind `roles` instead. Rows carry the `profile`, `user_attributes` and `member_attributes` bags under the same names as the `fields.*` vars, so a column path is the same string as the form block id. Raw `user.*` / `contact.*` join paths do not resolve. Lift anything else you need in a `request_stages.get_all_users` `$addFields`, which also runs on the Excel export.

**Audit events** are renamed to the new model (`member-invited`, `access-updated`, `org-role-updated`, `user-attributes-updated`, `profile-updated`, `member-removed`, `user-deleted`, `user-suspended`, `invitation-resent` and the rest). They record what the write changed under `metadata.before` and `metadata.after` (`docs/user-admin/reference/events.md`). `event_display` templates receive `user` (the acting admin) and `target`.

**Dependencies.** `notifications` is dropped: the invite email goes through the app's `auth.email` connection. Search is a plain `$match` over the joined rows, so the module needs no Atlas Search index.
