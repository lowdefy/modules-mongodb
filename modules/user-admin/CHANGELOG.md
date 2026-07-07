# @lowdefy/modules-mongodb-user-admin

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
