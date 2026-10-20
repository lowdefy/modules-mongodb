# @lowdefy/modules-mongodb-events

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

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **A person's contact links to their auth user through `user-contacts.user_id`.** A contact belongs to one organization, while the auth `user` is global, so the link lives on the contact and a person holds one contact per organization.

  - The caller's own contact is the one with `{ organization_id, user_id }`: the organization from the tenant wall and the user from the session. The shared `modules/shared/contact/resolve-own-contact.yaml` fragment resolves it. If the person has no linked contact there, it claims the unlinked contact for their verified address and stamps `user_id`. A contact already linked to someone else is never claimed. After the claim, identity is by id, so an email change does not break the link.
  - `modules/shared/contact/ensure-contact.yaml` makes sure a contact exists and is safe to run on every sign-in. It sets `user_id` only when there is an auth user, so a contact minted for an invitee who has no login yet is unlinked until they first sign in.
  - Joins from `users` to `user-contacts` match through `modules/shared/contact/contact-match-expr.yaml`: `user_id`, or the address while the contact is still unclaimed.
  - The events timeline (`GetEventsTimeline`) finds an author's picture through the contact's `user_id`. Under `policy: tenant` only the caller's organization's contact is read. An author whose contact has no `user_id` yet shows initials.
  - App config that needs the caller's contact should resolve it with `resolve-own-contact`, or match `{ organization_id, user_id }` in a join.

  **New required index** on `user-contacts`: `{ organization_id: 1, user_id: 1 }`, unique, partial on `user_id: { $exists: true }`, alongside the partial-unique `{ organization_id: 1, lowercase_email: 1 }`. Under `pinned` the single-field `{ user_id: 1 }` and `{ lowercase_email: 1 }` work too. See `docs/user-account/reference/indexes.md`. No backfill is needed: an existing contact is claimed on its person's next sign-in.

  Contacts are minted and claimed only for a verified email. Turn on `requireEmailVerification` so that an unverified signup holds no session.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Module links follow Lowdefy page paths and `basePath`.** No module builds a page URL by hand any more, so nothing breaks when a page has a `path` or the app has a `basePath`.

  - **Pages with paths.** The layout `page` component takes a `path` var, such as `tickets/{ticket_id}`, to serve the page at a URL pattern.
  - **Record links.** Links in HTML (company and contact lists, the activities timeline, the company hierarchy, the deal card and the deal's people, the workflow open-actions card and the overview subtitle) are `data-page-id` links, so they move within the app without a full page load. `DataDescriptions` and `SmartDescriptions` render contact and company links with Lowdefy's `Link`, and `ActionSteps`, `WorkflowProgress` and `EventsTimeline` pass a link's `pathParams` to it. The sign-in, sign-up, forgot-password and accept pages link to each other by page id.
  - **Workflows.** A workflow's `entity:` block takes `id_path_key`, the entity page's path placeholder for the entity id (for a page at `deals/{deal_id}`, `id_path_key: deal_id`); the entity link then carries the id in `pathParams`. `id_query_key` defaults to `_id` only when `id_path_key` is not set, so set both to also pass the id in the query. `tracker.start_link` and the custom-kind `status_map` `link:` / `view_link:` cells take `pathParams` next to `urlQuery`, with the same `action_id: true` / `entity_id: true` sentinels. Breadcrumbs, the return to the entity after a terminal signal, the events timeline and the deal's open items pass `pathParams` too.
  - **Breaking (events): `contact_page_url` is replaced by `contact_page_id`.** Set it to the contact page's id, such as `contacts/view`. The contact id goes in the query as `contact_id_query_key` (default `_id`), in the path value `contact_id_path_key` names when the page has a path like `contacts/{contact_id}`, or both. The events-timeline component takes the same three vars per call, and the `EventsTimeline` block takes `contactPageId`, `contactIdQueryKey` and `contactIdPathKey` in place of `contactPageUrl`. The timeline's avatar, timestamp and note @mentions link to the contact page; `note-capture` stores each @mention as a `#contact-<id>` link, and mentions in notes saved before this show unlinked.
  - **Breaking (ai-reporting): `generate-report`, `create-report` and `duplicate-report` return `{ ok, report_id }` without `url`.** Open a report with a `Link` to the `report` page and `urlQuery: { report_id }`. The reporting agent points the user to the panel's "Reports from this chat" list instead of replying with a link.
  - **Fix (deals):** deal event titles name the user as plain text. The old link pointed at `/contacts/view` with the user's id, which is not a contact id.

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

### Minor Changes

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Add exported `note-capture` — an `@mention` rich-text note-capture modal
  writing through this module's own `new-event` api, generalised from
  deals' original deal-only `add_note_modal`. Four seams keep this from
  being a lossy generalization: a `mentionable_users` options source (plus
  optional `mentionable_users_request_id` to refetch on open) so `events`
  never queries an app's users itself, an `entity_id` + `reference_field`
  pair naming the emitted event's primary reference array (e.g.
  `deal_ids`), an optional `company_id` for a secondary `company_ids`
  reference, and a `type` + `title_template` pair controlling the emitted
  event's type and Nunjucks display copy.

## 0.14.1

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.2

### Patch Changes

- [`384da61`](https://github.com/lowdefy/modules-mongodb/commit/384da6108b4c5ef599ff075ea6368eb95d2da050) Thanks [@JohannMoller](https://github.com/JohannMoller)! - **Fix: events-timeline connection ConfigError on default vars** — `actions_collection` and `contacts_collection` defaulted to `null`, but the `EventsTimeline` connection schema requires strings, so `get-events` threw `[ConfigError] property "actionsCollection" must be type "string"` at request time whenever a consumer left the vars unset. The var defaults are now the real collection names (`actions`, `user-contacts`) so the connection resolves to valid strings out of the box.

## 0.9.1

## 0.9.0

## 0.8.1

## 0.8.0

### Minor Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`186049c`](https://github.com/lowdefy/modules-mongodb/commit/186049c9ff612340533605ff1354d36f1bbf1121) Thanks [@Saiby100](https://github.com/Saiby100)! - Events: render action cards in the timeline by looking up each event's `action_ids`.

  - `get-events` gains a `$lookup` stage (event `action_ids` → action `_id`) that reshapes each action into the shape the `EventsTimeline` block expects: `{ id, status, message, link }`. Status is the first element of the action's status array; `message` and `link` are read from the app-keyed display object (`{display_key}.message` / `{display_key}.link`), mirroring the per-app display scoping used for event titles. Actions whose current stage is `not-required` are dropped.
  - The block now receives `actionStatusConfig` (built-in `action_status` enum merged with the new `action_status` var), so action status badges and card colors render.
  - Link buttons: actions that store an app-scoped `link` (with a `pageId`) render a button; agenda-topic tasks have no link field so they render without one. An `onActionClick` handler is registered on the block — a `Link` action with `params: { _event: true }` — so clicking the button navigates to the action's `pageId`/`urlQuery`.
  - New `action_status` var (default `{}`) merged over the built-in `modules/shared/enums/action_status.yaml` stages (`action-required`, `in-progress`, `done`).
  - New `lookup_collections.actions` var (default `actions`) — the real collection name the timeline joins. Consumers mapping the actions collection to another name must set this to match the activities module's `actions-collection`.

## 0.7.0

## 0.6.0

## 0.5.2

## 0.5.1

### Patch Changes

- [#57](https://github.com/lowdefy/modules-mongodb/pull/57) [`5685820`](https://github.com/lowdefy/modules-mongodb/commit/56858200668240719335ff4b32f254f69af4ee96) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix user-admin roles projection and events-timeline display_key filter.

  - `user-admin`: `get_user` now defaults the projected `roles` to `[]` when the user has no roles array for the app. Previously this returned `null`, which broke the multiple selector on the user edit page for users with undefined roles.
  - `events`: `events-timeline` now filters out events where the resolved `display_key` field is missing, preventing fetched rows that would render with unresolved `$<key>.title` placeholders for title/description/info.

## 0.5.0

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#29](https://github.com/lowdefy/modules-mongodb/pull/29) [`f9a4078`](https://github.com/lowdefy/modules-mongodb/commit/f9a40783224b093c10727f64cdb62f7cb2b39838) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Remove the `collection` var from the `companies`, `events`, and `files` modules. Each module's MongoDB collection name is now hardcoded in its connection file (`companies`, `log-events`, `files` respectively). Consumers can no longer rename the underlying collection through `vars.collection` — to point a module at a different collection, remap its connection (`companies-collection`, `events-collection`, `files-collection`) via the module entry's `connections` mapping in `lowdefy.yaml`.

  **Breaking:** apps that previously set `vars.collection` on any of these modules must remove it. If a non-default collection name was in use, switch to a `connections` remap on the module entry.

### Patch Changes

- [#27](https://github.com/lowdefy/modules-mongodb/pull/27) [`4d3eff1`](https://github.com/lowdefy/modules-mongodb/commit/4d3eff1318b77870f680b679d1d2e0632e663bd5) Thanks [@Yianni99](https://github.com/Yianni99)! - Improve the `EventsTimeline` block and `events-timeline` component:

  - **New block properties**: `compact` (boolean, default `false`) renders smaller avatars and tighter padding, and applies an `events-timeline-compact` class on the root for additional dense styling; `contactPageUrl` (string) is a URL template for linking each user avatar and timestamp to a contact page, supporting `{id}` substitution and falling back to appending `?_id=<userId>`; `disableContactLink` (boolean, default `false`) opts out of the contact-page wrapping per call. Avatars are also wrapped in a Popover showing the user's name on hover.
  - **Component vars**: the `events-timeline` component exposes the new properties via `contact_page_url` module var and per-call `_var` overrides (`contact_page_url`, `disable_contact_link`, `compact`). All defaults are off, so existing consumers see no change.
  - **Fix: `get-events` request never fired** because the component declared the request but had no `onMount` Request action to trigger it. Added the trigger.
  - **Fix: Avatar didn't render** for events without a description — the React `EventTimelineItem` only included `<Avatar>` inside the `EventDescription` branch. Restructured so the title-only branch also renders the avatar.

## 0.1.1

### Patch Changes

- [#20](https://github.com/lowdefy/modules-mongodb/pull/20) [`e4d608a`](https://github.com/lowdefy/modules-mongodb/commit/e4d608a664775a73737b75ea9ef7f9793a0eb7eb) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix plugin version constraints in module manifests. `@lowdefy/modules-mongodb-plugins` references updated from the invalid `^1` (no matching published version) to `^0.1.0`, and missing `version` declarations added for `@lowdefy/modules-mongodb-plugins` and `@lowdefy/community-plugin-xlsx` where the module validator required them.

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.
