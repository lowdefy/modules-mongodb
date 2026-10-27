# @lowdefy/modules-mongodb-user-admin

## 1.3.0

## 1.2.0

### Patch Changes

- [#318](https://github.com/lowdefy/modules-mongodb/pull/318) [`12b46dc`](https://github.com/lowdefy/modules-mongodb/commit/12b46dcd4c66db0140c9cd0cd41ac5bf5ffa686a) Thanks [@machielvdw](https://github.com/machielvdw)! - Admins can now reinstate a suspended user from the user detail page. When a user is suspended, the Security tile shows **Reinstate access** in place of Suspend access. It opens a confirm, lifts the ban through the existing `reinstate` endpoint, and refreshes the page so the status goes back to Active. Like Suspend, it sits behind the `suspension` var.

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

- [#127](https://github.com/lowdefy/modules-mongodb/pull/127) [`b8a2ef6`](https://github.com/lowdefy/modules-mongodb/commit/b8a2ef697323f432926ba784b2e49ff88a599140) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the `app_name` module var is replaced by Lowdefy's `_app` operator.** Apps now declare their identity once, as `slug:` on the root of `lowdefy.yaml`, and every module reads it directly with `_build.app: slug`.

  Migration for consumers:

  - Add `slug: <your-app-slug>` to the root of `lowdefy.yaml` if it isn't there already. It must be kebab-case (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) — Lowdefy validates it, and referencing an undeclared slug fails the build.
  - Remove the `app_name:` var from every module entry. `activities`, `companies`, `contacts`, `deals`, `notifications`, `user-account`, `user-admin` and `workflows` no longer declare it.
  - `events.display_key` is now optional, defaulting to the app's own slug. Drop it unless the app deliberately renders another app's event display strings.
  - If a `change_stamp` override baked in an app-attribution literal (`app_name: my-app`), change the value to `{ _build.app: slug }`. The stamp field keeps the name `app_name`.
  - Any shared config file that existed only to hold `app_name` (e.g. an `app_config.yaml`) can be deleted.

  No data migration is required — the slug produces the same string the `app_name` var did, and no stored field or key is renamed. `created.app_name` keeps its name on event and notification documents.

  Connection schema changes in `@lowdefy/modules-mongodb-plugins`: the `WorkflowAPI` connection property `app_name` is renamed to `slug`, and the `EventsTimeline` connection property `app_name` is renamed to `display_key` (it carries the events module's `display_key`, which may legitimately differ from the slug). Apps wiring these connections directly must rename the property keys.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`240e981`](https://github.com/lowdefy/modules-mongodb/commit/240e981479be3a5747ad200a0ace8458d2c0c1c2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the profile name and avatar are derived on the server when a profile is written.** `contacts`' `create-contact` and `update-contact`, and the shared `write-profile` fragment that `user-account` and `user-admin` use, all call one derivation (`modules/shared/profile/derive-profile.js.njk`). It sets `profile.name`, `profile.avatar_color` and `profile.picture`.

  - **A payload's `profile.picture` is ignored.** The write computes it, so renames update the avatar on every path. The contacts create and edit forms do not render an avatar preview.
  - **`profile.name` is the non-empty given and family names joined by a space**, so a person with only one name part keeps their name. Initials are the first letter of each part, or the first two letters of the only part.
  - **A profile with no `avatar_color` is given one random palette entry, and it is stored** so it stays stable. Picking a colour still wins, and people who already have a stored colour keep it. Because the rendered avatar is stored too, existing people are recoloured on their next write, not at upgrade. To recolour everyone, clear `profile.avatar_color` in a migration. See `docs/shared/avatar-colors.md`.
  - **A profile with no name stores no `picture`**, so the Avatar block shows its person icon.
  - **Profile photos.** The new `AvatarUpload` plugin block is a round avatar that is also the upload control. It crops, downscales and compresses the image in the browser to a data URI, which is stored inline. The shared avatar picker (onboarding and the profile modals) binds it to `profile.photo`, and an uploaded photo becomes the stored `profile.picture`. Removing the photo goes back to the initials avatar. `update-profile` rejects a photo that is not an image data URI or is over about 512 KB.
  - **`create-contact` mints the contact `_id` on the server and ignores a payload `_id`.** Read the new id from the response's `contactId`. A payload carrying a known `_id` with a new email could otherwise overwrite that contact.
  - **Every payload value these writes put into an aggregation update is wrapped in `$literal`**, so a value that begins with `$` (a `given_name` of `$email`, or an email local part) is stored as written instead of being read as a field path.

  `request_stages.write` stages still run last, so a stage that overrides `profile.name` or `profile.picture` still wins.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **A person's contact links to their auth user through `user-contacts.user_id`.** A contact belongs to one organization, while the auth `user` is global, so the link lives on the contact and a person holds one contact per organization.

  - The caller's own contact is the one with `{ organization_id, user_id }`: the organization from the tenant wall and the user from the session. The shared `modules/shared/contact/resolve-own-contact.yaml` fragment resolves it. If the person has no linked contact there, it claims the unlinked contact for their verified address and stamps `user_id`. A contact already linked to someone else is never claimed. After the claim, identity is by id, so an email change does not break the link.
  - `modules/shared/contact/ensure-contact.yaml` makes sure a contact exists and is safe to run on every sign-in. It sets `user_id` only when there is an auth user, so a contact minted for an invitee who has no login yet is unlinked until they first sign in.
  - Joins from `users` to `user-contacts` match through `modules/shared/contact/contact-match-expr.yaml`: `user_id`, or the address while the contact is still unclaimed.
  - The events timeline (`GetEventsTimeline`) finds an author's picture through the contact's `user_id`. Under `policy: tenant` only the caller's organization's contact is read. An author whose contact has no `user_id` yet shows initials.
  - App config that needs the caller's contact should resolve it with `resolve-own-contact`, or match `{ organization_id, user_id }` in a join.

  **New required index** on `user-contacts`: `{ organization_id: 1, user_id: 1 }`, unique, partial on `user_id: { $exists: true }`, alongside the partial-unique `{ organization_id: 1, lowercase_email: 1 }`. Under `pinned` the single-field `{ user_id: 1 }` and `{ lowercase_email: 1 }` work too. See `docs/user-account/reference/indexes.md`. No backfill is needed: an existing contact is claimed on its person's next sign-in.

  Contacts are minted and claimed only for a verified email. Turn on `requireEmailVerification` so that an unverified signup holds no session.

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`b4aad44`](https://github.com/lowdefy/modules-mongodb/commit/b4aad4444fe14a4ad47dc22c2ec1e24c8cc4fe65) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: `request_stages.filter_match` takes plain MongoDB `$match` clauses instead of Atlas Search `compound` clauses.** In `contacts`, `companies` and `activities` the structural filters moved out of `$search` into a standard `$match`, so the consumer filter hook is now standard query syntax and applies in both search modes. The var stays an **array**; only each element's syntax changes, and the clauses are composed via `$and` rather than shallow-merged, so a clause using `$or` is safe.

  These modules also gain a boolean **`atlas_search`** var (default `true`). Leave it `true` and text search runs through Atlas `$search` as before. Set it `false` — on `contacts`, `companies`, `activities` and `deals` — and text search falls back to a case-insensitive `$regex` `$or` over the same fields, which runs on any MongoDB: identical substring matching, but no relevance ranking and an unindexed collection scan, so it suits development and small collections rather than production at scale.

  With `atlas_search: true` the `$search` stage is **unconditional** — it runs on every list load, empty search box included, and only its contents vary. This is required by the tenant wall rather than chosen: `$search` must be a pipeline's first stage, so the wall cannot prepend its organization filter and the request declares `tenant: authored` and carries the clause in `compound.filter` instead. That declaration is static per request while the search term is runtime, so a `$search` emitted only when a term happened to be present would be audited on the search path and refused on the browse path. The term clauses therefore sit in `compound.must` (a `should` alongside a `filter` clause ranks without narrowing, which would return every row for any term), and `compound.filter` always carries one clause — the audited `organizationId` equality under `tenant`, an `exists` match-all on `_id` under `pinned`, since Atlas refuses a compound whose clause lists are all empty. With `atlas_search: false` there is no `$search` at all and the wall scopes the leading `$match` mechanically.

  **This version changes the Atlas Search index contract**, so a consumer upgrading must update their cluster's `default` index to match the requirement documented in the version they move to. The mappings narrow to the text fields **plus the two paths `compound.filter` needs** — `organizationId` as a `token` (the authored tenant clause; a string `equals` requires that mapping specifically and no `dynamic` setting creates it) and `_id` (the `pinned` match-all). The structural filters are no longer evaluated by `mongot`, so their old `token`/`date` mappings are unused. `storedSource` now differs per collection: whole-document stored source is **required** on `user-contacts` and `companies`, and **not required** on `activities` and `deals`, whose requests read live documents so their post-write refetches do not show stale rows.

  Migration for consumers:

  - Rewrite any `request_stages.filter_match` clauses in MongoDB query syntax — `{ equals: { path: region, value: "x" } }` becomes `{ region: "x" }`, `{ range: { path: score, gte: 10 } }` becomes `{ score: { $gte: 10 } }`. The default `[]` is unaffected, so an app that never set the var has nothing to do.
  - For a non-Atlas deployment, set `atlas_search: false` on each searchable module entry (`contacts`, `companies`, `activities`, `deals`). Hold the value once in a shared app config file and `_ref` it from each entry, so the app has one source of truth for which mode it is in.
  - Create or update the `default` Atlas Search index per collection, following the module index references (`docs/{contacts,companies,activities}/reference/indexes.md` and `docs/deals/index.md`): whole-document `storedSource: true` on `user-contacts` and `companies`, no `storedSource` on `activities` and `deals`. **Map `organizationId` as a `token` and `_id` in every one of them**, whichever organizations policy the app runs — they are inert under `pinned`, and an index missing the `organizationId` mapping blanks every list page the moment a deployment flips to `tenant`, silently. **`deals` needs a `default` index created from scratch**: none existed before, so its search box has never worked, and the unconditional `$search` means the deal list now needs one to load at all. If `companies.name_field` is overridden, map that field in the companies index instead of `name` — otherwise Atlas `$search` silently returns no text matches on it while the regex fallback still works.
  - Before running the fallback at any size, add the regular `mongod` indexes the module index references list. They serve the filter, not the sort; without them a fallback deployment performs acceptably only at small scale.

  `user-admin` is not affected by the `filter_match` change — its clauses were already plain `$match`. Two non-breaking improvements land there: its **members and invitations** searches now treat regex metacharacters typed into the search box as literals (previously a `(` made MongoDB reject the regex and `.*` matched every row), and both filter stages compose their clauses with `$and` so no two can collide on a key.

  The same escaping fix lands on `deals`' task **Person Responsible** selector, whose contact search had the same defect. All four search boxes now route through one shared clause builder, so escaping has a single home.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: `user-admin` is rebuilt on Lowdefy 7's BetterAuth auth engine** as the operator console for a person's access to one organization. This is a rebuild, not an in-place upgrade: a person is now an app-owned contact plus the auth engine's `user`, `member`, `invitation` and `session` records, and every write to auth-owned data goes through the engine's admin steps. Expect to redo the module entry. Step-by-step upgrade: `docs/user-admin/how-to/migration.md`.

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

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.2

## 0.44.1

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

## 0.40.0

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.1

## 0.32.0

## 0.31.1

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.1

## 0.25.0

## 0.24.0

## 0.23.1

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.1

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

### Patch Changes

- [#96](https://github.com/lowdefy/modules-mongodb/pull/96) [`5742843`](https://github.com/lowdefy/modules-mongodb/commit/5742843c5be12cb2a67325efad52516bde5b1fc3) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Standardise the soft-delete read on the `deleted` change-stamp shape.

  `get_all_users` and `get_user_excel_data` matched live users with `deleted: null`. They now use `deleted.timestamp: { $exists: false }` so every module reads soft-delete identically (see the [soft-delete convention](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md)). Behaviour is unchanged — both predicates treat `null`/absent as live and exclude a real delete stamp.

## 0.9.2

## 0.9.1

## 0.9.0

### Patch Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`163529c`](https://github.com/lowdefy/modules-mongodb/commit/163529cd6063914ff715b37934feea595967ee86) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking:** the `layout` `floating-actions` component now lays its buttons out with `direction: row` + `justify: flex-end` + `wrap: nowrap` instead of `direction: row-reverse`. Buttons are now listed in natural left-to-right order (the last one renders rightmost), and the bar never wraps onto a second line.

  Migration: reverse the order of buttons in each `floating-actions` `actions:` array — what used to be listed first (and rendered rightmost under `row-reverse`) must now be listed last. Every action button must set `layout: { flex: 0 1 auto }` so it is content-sized rather than a full-width grid column; a button without it stretches full width and stacks onto its own line. Any `spacer` Box or `width` var previously used to coax right-alignment is no longer needed and should be removed.

  All in-repo callers (contacts, activities, companies, user-account, user-admin) have been updated to the new order. The workflows action-page templates (edit/view/review/error) and the shared `check-action-surface` signal bar (used by the in-context action modal and the `workflow-action-*` pages) now set `flex: 0 1 auto` on every signal button and order them so the primary action lands rightmost, fixing buttons that previously stacked onto multiple lines and left-aligned. The signal bar's `justify` was also corrected from the invalid `flex-end` token to `end` (Lowdefy's justify map only accepts `end`; `flex-end` silently fell back to left alignment).

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`c4e1000`](https://github.com/lowdefy/modules-mongodb/commit/c4e100087969a67336fc071a0183198c57fd46c2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - The shared page title bar (`modules/shared/layout/title-block.yaml`, threaded through the `layout` `page` component) gains three capabilities:

  - **`type` eyebrow** — a small uppercase entity-type label rendered directly above the title (e.g. `COMPANY`, `EDIT COMPANY`, `INVITE ACME USER`). The `title` prop now holds just the entity name; pages stop hand-concatenating `"{type}: {name}"` into the heading. The eyebrow renders immediately and is never skeletoned.
  - **`status` + `status_enum` pill** — the caller passes a status slug (runtime) and a status-enum map (build-time `_ref`); the title block resolves the label and the three-colour contract (`color`→fill, `borderColor`→border, `titleColor`→text) internally and renders a chunky, vertically-centred pill. Status resolution lives in the component now, not in each caller.
  - **opt-in `loading` skeleton** — when `loading` is truthy, the title, subtitle, and status pill render as shimmer skeletons (via Lowdefy's native `loading:`/`skeleton:` pair). Defaults to `false`, so static list/index titles are untouched.

  **Breaking:** the raw `badge_text` / `badge_color` props are **removed** (replaced by `status` + `status_enum`). Any external/consumer title-bar override that passed `badge_*` silently loses its badge and must migrate to a status enum with the standard `{ color, borderColor, titleColor, title }` entry shape. The wholesale `title_block` override path is unaffected — it replaces the block entirely and never used these props.

  All in-repo callers are migrated: workflow overview and group overview (badge → status pill), and contacts / activities / user-admin view, edit, and new pages (entity type split out of the title into the eyebrow; `loading` added on the request-backed view pages). A new `modules/workflows/enums/action_group_statuses.yaml` enum backs the group-overview rollup status (done / in-progress / blocked), preserving its previous green / blue / grey colours. The title-bar prop interface is now documented in the layout module README.

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`3dbbbdf`](https://github.com/lowdefy/modules-mongodb/commit/3dbbbdfd5c5fa930671c82dda7a8933d41feebb8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Follow-on to the title-block eyebrow/status-pill work: wire two modules the first pass missed, fix a title-bar layout bug, and relocate the user record stamp.

  - **layout** — the title bar's change-stamp subtitle now **wraps** instead of being a single `nowrap`/ellipsis line. The previous styling gave the title column a min-content width equal to the full subtitle, which on narrower bars pushed the page actions (e.g. the Edit button) onto a new row. The title column is now `flex: 1 1 0` and the page-actions block `flex: 0 0 auto`, so the actions always hold the right edge and the subtitle wraps within the remaining width. (Verified in a headless-browser render of the exact DOM.)
  - **user-admin** gains a status pill on the view and edit pages. A new `modules/user-admin/enums/user_statuses.yaml` enum (active / open invite / disabled) backs it, and `get_user` now emits a `status` slug derived the same way as the list table's `active` column (disabled > open invite > active). The enum uses the antd preset green / blue / red colour families so the title pill matches the existing AgGrid Tag in the list — the table tag mechanism is unchanged. The view page no longer renders the created/modified stamp as a title subtitle; that audit info moves into the **Access** sidebar card (next to "Signed up"), and the Access card's status Tag is removed since the title pill now shows status.
  - **companies** view / edit / new pages are migrated to the eyebrow + title shape (entity type moved out of the hand-concatenated `"{label}: {name}"` heading into the `type` eyebrow; `loading` added on the request-backed view page). These pages used the title bar before the redesign but were not migrated with the other modules.

## 0.8.1

## 0.8.0

## 0.7.0

## 0.6.0

### Minor Changes

- [`ad80095`](https://github.com/lowdefy/modules-mongodb/commit/ad800955415ff9e5858a0ce3d8fc6ddd5b241046) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Bump `@lowdefy/community-plugin-mongodb` peer requirement from `^2` to `^3` across all modules that depend on it (`activities`, `companies`, `contacts`, `notifications`, `user-account`, `user-admin`). Consumer apps must update their plugin install to the v3 line; module config and exports are otherwise unchanged.

## 0.5.2

### Patch Changes

- [#60](https://github.com/lowdefy/modules-mongodb/pull/60) [`53782fc`](https://github.com/lowdefy/modules-mongodb/commit/53782fc04ab84e9fa240f7c1de8e247f5ded0544) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `invite-user` API resolving `_id`, `email`, and `profile.name` from the upsert response.

  `MongoDBUpdateOne` does not return the document, so `_step: invite.value.*` was always `undefined` — the resulting event was logged with an empty title/contact reference, and the API returned `userId: null`. Added a `get-user` `MongoDBFindOne` step after the upsert that reads the user back by `lowercase_email`, and repointed the event display, `contact_ids` reference, and returned `userId` to it.

## 0.5.1

### Patch Changes

- [#57](https://github.com/lowdefy/modules-mongodb/pull/57) [`5685820`](https://github.com/lowdefy/modules-mongodb/commit/56858200668240719335ff4b32f254f69af4ee96) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix user-admin roles projection and events-timeline display_key filter.

  - `user-admin`: `get_user` now defaults the projected `roles` to `[]` when the user has no roles array for the app. Previously this returned `null`, which broke the multiple selector on the user edit page for users with undefined roles.
  - `events`: `events-timeline` now filters out events where the resolved `display_key` field is missing, preventing fetched rows that would render with unresolved `$<key>.title` placeholders for title/description/info.

## 0.5.0

## 0.4.2

### Patch Changes

- [#50](https://github.com/lowdefy/modules-mongodb/pull/50) [`2ea6148`](https://github.com/lowdefy/modules-mongodb/commit/2ea6148f1cdfd22e0a8059c598420dbd7daa7006) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Use the AgGrid block's native `loading` property for the list tables (`activities_table`, `companies_table`, `contacts_table`, `users_table`) instead of swapping the `overlayNoRowsTemplate` between `Loading...` and `No rows` via `_if`. The block now enters its built-in loading state while the list request is pending and falls back to a static `No rows` overlay once it resolves empty — the previous wiring conflated "loading" with "empty" through a single text overlay.

## 0.4.1

## 0.4.0

### Minor Changes

- [#45](https://github.com/lowdefy/modules-mongodb/pull/45) [`d64b5d2`](https://github.com/lowdefy/modules-mongodb/commit/d64b5d25183f77c0f9eae925765cfa858c742eaa) Thanks [@Yianni99](https://github.com/Yianni99)! - Change `event_display` defaulting and override semantics across all event-emitting modules. The default (no override) now renders titles under the consumer's `app_name` instead of a literal `default` key, and an override fully replaces the defaults instead of merging with them.

  **Behavior changes (potentially breaking for consumers):**

  - **Override fully replaces, no merge.** Whatever you write under `event_display` is exactly what's stored on the event document. Consumers that previously relied on partial overrides being merged with the module's defaults must now list every app and event type they want rendered.
  - **Defaults file shape changed.** `modules/{name}/defaults/event_display.yaml` is now a flat `{ event-type: template }` map. The previous top-level `default:` wrapper is gone — the build wraps the flat map under the consumer's `app_name` var. Consumers that `_ref` the defaults file directly will see the new shape.
  - **`companies` now requires `app_name`.** Every event-emitting module declares its app context the same way contacts/user-admin/user-account already did. Companies consumers must add `app_name` to their module vars (typically wired from `app_config.yaml`).

  **Migration:**

  - If you didn't override `event_display`, no action needed beyond setting `app_name` on companies.
  - If you overrode `event_display`, list every app and event type you want stored — defaults no longer fill the gaps. The override shape stays `{ [app_name]: { [event-type]: template } }`.

  See [`docs/shared/event-display.md`](../../docs/shared/event-display.md) for the updated reference.

## 0.3.0

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#28](https://github.com/lowdefy/modules-mongodb/pull/28) [`2c4aa70`](https://github.com/lowdefy/modules-mongodb/commit/2c4aa70f54840a33d5f21ea45539328a860d3525) Thanks [@Yianni99](https://github.com/Yianni99)! - Rename module pages from entity-prefixed IDs to semantic verbs to remove the redundant URL prefix (e.g. `/companies/companies` → `/companies/all`). Module pages now use `all`, `view`, `edit`, `new` consistently. Cross-module references via `_module.pageId:` and hardcoded scoped page IDs (`{entry-id}/{page-id}`) must be updated to the new IDs.

  Page ID changes per module:

  - `companies`: `companies` → `all`, `company-detail` → `view`, `company-edit` → `edit`, `company-new` → `new`
  - `contacts`: `contacts` → `all`, `contact-detail` → `view`, `contact-edit` → `edit`, `contact-new` → `new`
  - `user-admin`: `users` → `all`, `users-view` → `view`, `users-edit` → `edit`, `users-invite` → `new`, `check-invite-email` → `check`
  - `user-account`: `profile` → `view`, `edit-profile` → `edit`, `create-profile` → `new` (`login`/`logout`/`verify-email-request` unchanged)
  - `release-notes`: `release-notes` → `view`
  - `notifications`: `inbox` → `all` (`link`/`invalid` unchanged)

  Plugin defaults updated to match: `SmartDescriptions` now defaults `contactDetailPageId` to `contacts/view` and `companyDetailPageId` to `companies/view`; `EventsTimeline` schema example updated.

  Also includes two fixes to the contacts new page: removed a duplicate avatar render (the avatar block was included both directly and via `form_profile`), and fixed the post-create redirect that was navigating with a null `_id` because CallAPI return values are accessed at `_actions: <id>.response.response.<field>`, not `.response.<field>`. Same redirect fix applied to the companies new page.

### Patch Changes

- [#31](https://github.com/lowdefy/modules-mongodb/pull/31) [`a167d18`](https://github.com/lowdefy/modules-mongodb/commit/a167d18871d59b544cfaa546f65d31aa3250b0e4) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix Activity tile missing user-related events on contact-detail. user-account and user-admin events tagged the same shared `user-contacts` record under `references.user_ids`, while the Activity tile filters on `contact_ids` — so events like `update-profile`, `invite-user`, `update-user`, `resend-invite`, and `create-profile` never surfaced on the contact's timeline. Since contacts and users live in one collection with one `_id` space, a user IS a contact. Renamed the reference field on those 5 events from `user_ids` to `contact_ids` so the existing single-field timeline match returns them. Event semantics (user vs. plain contact) stay encoded in the event `type`. Migration for existing event docs is the consuming app's responsibility — `db.log-events.updateMany({ user_ids: { $exists: true } }, [{ $set: { contact_ids: '$user_ids' } }, { $unset: 'user_ids' }])`.

- [#27](https://github.com/lowdefy/modules-mongodb/pull/27) [`24b8dd1`](https://github.com/lowdefy/modules-mongodb/commit/24b8dd1e389ef6aaeab8d4fa56f7f393187db32c) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix silent empty `display` payload on every event-emitting endpoint. The `_build.array.map` callback that builds per-app event display titles returned `{key, value}` objects, which `_build.object.fromEntries` (native `Object.fromEntries`) silently rejected as `{}` — so events landed in MongoDB without `title` or `description`. Switched callback bodies to a 2-element `[key, value]` array tuple to match the spec, and quoted `"0.0"` so YAML parses it as a path string instead of the float `0`. Affects 9 endpoints: `contacts/api/{create,update}-contact`, `companies/api/{create,update}-company`, `user-admin/api/{invite,update}-user`, `user-admin/api/resend-invite`, `user-account/api/{create,update}-profile`. Also fixed two latent typos (`_result` → `_step`) in `user-account/api/{create,update}-profile.yaml` that were hidden by the silent failure.

- [#31](https://github.com/lowdefy/modules-mongodb/pull/31) [`fcd328b`](https://github.com/lowdefy/modules-mongodb/commit/fcd328b031df108450147a91b87d85a508c1f008) Thanks [@Yianni99](https://github.com/Yianni99)! - Small UX fixes across modules and the EventsTimeline block:

  - `release-notes`: Empty-state fallback now triggers when `content` is null OR an empty/whitespace-only string. The previous `_if_none` only caught null, so consumers with an empty `CHANGELOG.md` saw a blank Card instead of the "No release notes available yet" message.
  - `companies` / `contacts` / `user-admin` table components: Added a conditional `overlayNoRowsTemplate` that renders "Loading…" while the `get_all_*` request is in flight and "No rows" once the request completes empty. Previously AG Grid's default "No Rows To Show" appeared during the initial load, indistinguishable from a genuinely empty result.
  - `EventsTimeline` (plugin): Avatar hover swapped from `<Popover>` to `<Tooltip>` so it matches the timestamp's TimeAgo style — same name-on-hover, lighter dark-tooltip styling.

## 0.1.1

### Patch Changes

- [#20](https://github.com/lowdefy/modules-mongodb/pull/20) [`e4d608a`](https://github.com/lowdefy/modules-mongodb/commit/e4d608a664775a73737b75ea9ef7f9793a0eb7eb) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix plugin version constraints in module manifests. `@lowdefy/modules-mongodb-plugins` references updated from the invalid `^1` (no matching published version) to `^0.1.0`, and missing `version` declarations added for `@lowdefy/modules-mongodb-plugins` and `@lowdefy/community-plugin-xlsx` where the module validator required them.

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.
