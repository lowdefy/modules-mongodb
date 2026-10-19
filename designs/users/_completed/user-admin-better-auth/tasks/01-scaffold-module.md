# Task 1: Scaffold the rebuilt user-admin module

## Context

The `user-admin` module is being rebuilt (not ported) against the BetterAuth
auth engine. The current module (`modules/user-admin/`) owns everything about a
user as raw MongoDB writes to a fused `user_contacts` collection. The new model
splits that record across `contact` (`user-contacts`, app-owned) and auth-owned
records (`user`/`users`, `member`/`user-members`, `invitation`/`user-invitations`,
`session`/`user-sessions`, `account`/`user-accounts`, `organization`/`user-organizations`),
and the auth-owned side may only be written through admin-routine steps.

This task establishes the skeleton so every `_ref` resolves and there is a
buildable target for the UI pipeline. It does **not** implement page bodies,
routines, or reads — those are later tasks. Use the `lowdefy-docs` MCP
(`concepts/modules`, `concepts/module-authoring`) before editing manifests.

Design sections: **Module surface (sketch)**, Decisions 1, 3, 8, and the
"Retired vs today" paragraph.

## Task

Rewrite `modules/user-admin/module.lowdefy.yaml` and lay down the skeleton:

**Vars** (design Decision 8; the manifest is the source of truth for var schema —
every var needs `description`/`type`/`default`/`required`/`enum` as applicable):

- **Remove**: `app_name` (per-app scoping dies with the `apps.{app}` map,
  Decision 1), `roles` (retired — roles now come from the platform role catalog
  via `_build.authConfig.roles`, Decision 8), `app_domain` (invite links are
  built by the engine, Decision 7).
- **Keep / carry over**: `app_title`, `event_display`, `avatar_colors`,
  `fields` (rename the nested keys to the model: `fields.profile`,
  `fields.user_attributes` (was `global_attributes`), `fields.member_attributes`
  (was `app_attributes`); keep `show_honorific`), `components.*`
  (`table_columns`, `download_columns`, `filters` + `filter_requests`,
  `main_slots`, `sidebar_slots`, tile overrides), `request_stages.*` for reads
  (`get_all_users`/list pipeline, `filter_match`, export) and for the contact
  write (`request_stages.write` on the profile routine). Note `filter_match` now
  takes plain `$match` clauses (no `$search` — Decision 2).
- **Add new vars**: `impersonation` (boolean, default `false`, Decision 5),
  `suspension` (boolean, default `true`, Decision 4), `download` (boolean,
  default `false`, Decision 2), and an admin-roles var naming the catalog role
  that gates the routine endpoints (Decision 3 — the endpoint `auth.api.roles`
  gate; aligns with the app's `auth.userAdminRole`).

**Exports / pages**: pages become `all`, `view`, `invite`. Retire `edit` and
`check`; rename `new` → `invite`. Stub each page as a minimal `layout` `page`
wrapper (title-block + empty body) so the build resolves — real bodies come from
the pipeline tasks.

**Connections**: keep `user-contacts-collection` (app connection). Add one
read-only connection per auth collection the module reads natively: `users`,
`user-members`, `user-invitations`, `user-sessions`, `user-accounts`,
`user-organizations`. Names are adapter-fixed (mongodb Decision 2). Add a
manifest/consumer-doc note on the **same-database co-location precondition**
(Decision 1): the auth adapter DB, `user-contacts`, and these read connections
must resolve to one MongoDB database (natural shape: one shared `_secret`, e.g.
`MONGODB_URI`) or the `$lookup`s to `user-contacts` silently return empty.

**APIs**: declare the endpoints (bodies land in tasks 3–5): `invite`,
`check-invite-email`, `cancel-invitation`, `resend-invitation`, `update-profile`,
`update-access`, `update-user-attributes`, `suspend`, `reinstate`,
`revoke-sessions`, `remove-member`, `delete-user`. Stub each so it resolves.

**Dependencies**: `layout`, `events`. **Drop `notifications`** (the invite email
rides `auth.email` — Decision 7). The two shared fragments are `_ref`'d by
relative path, not dependencies.

**Plugins**: keep the xlsx plugin (for the export) and `@lowdefy/modules-mongodb-plugins`.
Do **not** pin `@lowdefy/community-plugin-mongodb` — its `MongoDBCollection`
connection and `MongoDB*` request types are provided by the built-in
`@lowdefy/connection-mongodb` (the vendored adapter, `supportsJSON: true` for
native-BSON attributes — mongodb Decision 5), which also supplies the
`MongoDBAuthAdapter` the app's `auth.database` uses. The community plugin, when
pinned, **overrides** the built-in, so it must be dropped app-wide (see the demo
step below) — the built-in is auto-included and needs no pin. Note: the
`@lowdefy/connection-mongodb` adapter is the auth **storage** layer, distinct
from the module's Lowdefy read connections; both resolve from the same built-in
package, so there is nothing extra to pin.

**Menus**: `default` (Users) — one entry.

**Retire**: delete the old `pages/edit.yaml`, `pages/check.yaml`, `pages/new.yaml`,
and the now-obsolete components/requests/actions/enums that the new pipeline will
replace (the pipeline tasks author fresh ones). Do not delete anything a later
task still needs; when unsure, leave it and note it for the pipeline task.

**Demo consumer** (CLAUDE.md mandatory rule): update
`apps/demo/modules/user-admin/vars.yaml` to the new surface (drop `app_name`,
`roles`, `app_domain`; rename the `fields.*` keys; add the new toggle vars as
needed). `vars.yaml` pulls its values in via `_ref` from three sibling files that
the var rename/removal orphans — reconcile them too: **delete**
`apps/demo/modules/user-admin/roles.yaml` (backs the retired `roles` var), and
**rename** `global_attributes_fields.yaml`→`user_attributes_fields.yaml` and
`app_attributes_fields.yaml`→`member_attributes_fields.yaml`, updating the
`_ref` paths under the renamed `fields.user_attributes` / `fields.member_attributes`
keys to match. (`fields.profile` `_ref`s the shared
`modules/shared/profile/fields.yaml` — leave it.) Ensure the demo's BetterAuth
config declares an `auth.roles` catalog
(`{ id, label, description }` — the role picker reads it) and a pinned org, and
that the user-admin connections resolve to the same database as the auth
adapter. The demo already migrated to better-auth config (commit `0b8123de`) —
extend it, don't re-create it.

Also **remove the `@lowdefy/community-plugin-mongodb` pin from
`apps/demo/lowdefy.yaml`** (the app-wide drop). The built-in
`@lowdefy/connection-mongodb` then serves every MongoDB connection/request in the
demo — including the consecutive-id requests the `companies` module uses
(`modules/companies/api/create-company.yaml`), which the built-in now provides.
No consumer config changes: the `type:` names are unchanged, only the providing
package. The community plugin is fully superseded and leaves the tree.

## Acceptance Criteria

- `pnpm ldf:b` (from `apps/demo`) compiles with the rewritten manifest, the
  three stub pages, all twelve stub APIs, and the seven connections.
- The manifest carries no `app_name` / `roles` / `app_domain` vars and no
  `notifications` dependency; it carries `impersonation`, `suspension`,
  `download`, and the admin-roles var with full schema.
- `edit`/`check` pages are gone; `new` is renamed `invite`; `all`/`view`/`invite`
  resolve as layout page stubs.
- The co-location precondition is stated in the manifest comments and flagged for
  the consumer docs (task 18).
- The demo consumer wires the new vars and builds.
- Neither the module manifest nor `apps/demo/lowdefy.yaml` pins
  `@lowdefy/community-plugin-mongodb`; all MongoDB connections/requests (incl.
  `companies`' consecutive-id inserts) resolve from the built-in
  `@lowdefy/connection-mongodb`, and the app's `auth.database` uses its
  `MongoDBAuthAdapter`.

## Files

- `modules/user-admin/module.lowdefy.yaml` — rewrite (vars, exports, connections, deps, apis, plugins)
- `modules/user-admin/pages/all.yaml`, `pages/view.yaml`, `pages/invite.yaml` — create stubs
- `modules/user-admin/pages/edit.yaml`, `pages/check.yaml`, `pages/new.yaml` — delete
- `modules/user-admin/connections/*.yaml` — add the six read-only auth connections
- `modules/user-admin/api/*.yaml` — create twelve endpoint stubs
- `modules/user-admin/menu.yaml` — keep/update the single Users entry
- `apps/demo/modules/user-admin/vars.yaml` — update to the new surface (+ repoint the renamed `_ref`s)
- `apps/demo/modules/user-admin/roles.yaml` — delete (backs retired `roles` var)
- `apps/demo/modules/user-admin/global_attributes_fields.yaml` → `user_attributes_fields.yaml` — rename
- `apps/demo/modules/user-admin/app_attributes_fields.yaml` → `member_attributes_fields.yaml` — rename
- `apps/demo/lowdefy.yaml` — remove the `@lowdefy/community-plugin-mongodb` plugin pin (app-wide drop)
- `apps/demo/` auth config + role catalog — extend to declare `auth.roles` and the pinned org

## Notes

- Do not implement page bodies, reads, or routine steps here — later tasks own
  those. This task is purely the resolvable skeleton.
- The shared fragments (task 2) are `_ref`'d by relative path from routines, not
  declared as module dependencies — no `user-admin → user-account` edge.
- If the demo's better-auth config is incomplete for the new module (missing role
  catalog or pinned org), add the minimum to make the module resolve and note the
  gap for the verify task.
