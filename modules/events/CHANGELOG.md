# @lowdefy/modules-mongodb-events

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
