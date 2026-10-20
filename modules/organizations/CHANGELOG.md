# @lowdefy/modules-mongodb-organizations

## 1.1.0

## 1.0.0

### Major Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

  To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

  - **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
  - **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
  - **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
  - **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
  - **Events:** `contact_page_url` is replaced by `contact_page_id`.
  - **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
  - **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.

### Minor Changes

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **New `organizations` module: the self-serve workspace for one organization** under `auth.organizations.policy: tenant`. Members see which organization they are working in and switch between theirs. Owners and admins name it and give it a logo, manage its members and invitations, and read its audit log. With `allow_create_organization`, anyone signed in can create a new one. Every read is scoped to the caller's active organization, and every write is a per-organization action the auth engine authorizes against the caller's role there. The build rejects the module under `policy: pinned`. See `docs/organizations/`.

  - **Pages:** `general`, `members`, `member` (one person's access, activity, ownership transfer, remove or leave), `audit-log`, `billing` and `security` share the exported `settings-page` frame. `my-organizations`, `create-organization`, `setup` (where a new organization's creator lands) and `switch-organization` sit outside it. Every change of the active organization goes through `switch-organization`.
  - **Roles:** the member page's access form saves app roles (`member.app_roles`, from the app's `auth.roles`) and organization authority (`member.role`: `owner` / `admin` / `member`) together through `update-member-access`. The engine's last-owner and creator guards apply.
  - **Invitations:** the invite form checks the address as it is typed. It sets authority, app roles and the app's own member fields (`invite_fields`), and re-issues a pending invitation for the same address. Before sending, `invite` mints or links the invitee's contact in the organization.
  - **MCP tokens:** with `mcp_tokens: true` the `security` page lists every MCP member token in the organization, and owners and admins can switch any of them off (`revoke-mcp-token`). It needs the app's MCP authorization server (`auth.oauthProvider`).
  - **Events:** every write logs an organization event, and the audit log and member page read them back. The module depends on `events`. Register its `event_types` component in the events module's `event_types` var, and list `organizations` before `events` and `layout` in `modules.yaml`. Titles can be overridden per type through `event_display`, and `label` / `label_plural` rename the organization (a team, a workspace) everywhere.
  - **Exports:** `org-switcher` and `org-switcher-requests` (wire both into the layout's `header_extra`), `restore-last-organization` (returns a person to the organization they last used in this browser), `settings-page`, `setup-step`, `member-join` (the members join as a pipeline for the app's own reads), `event_types`, the `default` menu and the `org-events-system` connection.
  - **Extension vars:** `settings_sections`, `settings_requests`, `general_facts`, `member_page_blocks`, `member_page_requests`, `member_page_on_mount`, `setup_steps`, `setup_requests`, `creator_app_roles`, `invitation_expiry_days`, `remove_confirmation_note`, `leave_confirmation_note`, `my_organizations_note`, `settings_back_title` and `settings_back_page_id`. See `docs/organizations/how-to/extend-settings.md`.

  The BetterAuth adapter database, the module's `MONGODB_URI` and the contacts connection must resolve to one MongoDB database. `settings-page` passes the layout a `shell: { mode: settings, ... }` var for drawing the settings sections in place of the side menu. The `layout` module does not read it yet, so settings pages show with the app's usual menu, and the `default` menu links to them.
