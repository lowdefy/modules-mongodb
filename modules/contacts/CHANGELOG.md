# @lowdefy/modules-mongodb-contacts

## 0.8.0

### Patch Changes

- [#68](https://github.com/lowdefy/modules-mongodb/pull/68) [`b7f8ca8`](https://github.com/lowdefy/modules-mongodb/commit/b7f8ca83a3fb553bb7b68aca0a3bbd79b02823b0) Thanks [@Yianni99](https://github.com/Yianni99)! - Activities: add basic/complex type gating, clean up the detail view, and fix runtime + warning issues surfaced by demo testing.

  **Activities**

  - New `type: basic | complex` field on each `activity_types` entry. Basic activities (built-in: `call`, `email`) are created in `default_stage` and have no transition UI; complex activities (built-in: `meeting`) keep the full Mark done / Reopen / Cancel lifecycle. Existing consumer-defined types without an explicit `type` default to `complex` (full UI).
  - Type gating enforced at three layers: table action-column cell renderers (em-dash for basic), CallAPI skip conditions (defence in depth for empty-cell clicks), and view-page button visibility. Stage chip on the detail view header is also hidden for basic activities.
  - **Breaking: linked contacts are now stored as reference objects.** Activity docs store a `contacts` array of `{ contact_id, name, email, verified }` reference objects (written by the contacts module's `contact-selector`) instead of the old `contact_ids` plain-id array. `create-activity` / `update-activity` accept a `contacts` payload in place of `contact_ids`, and the `activities-timeline` component's `reference_field` var takes `contacts` (matched internally on `contacts.contact_id`) instead of `contact_ids`. Emitted events still flatten the references to plain ids under `references.contact_ids`, so event reverse-lookups are unchanged. Existing data written with `contact_ids` needs a migration to the new shape.
  - Read pipelines join contact docs into a separate `contacts_enriched` field (`lookup_contacts` now matches on `contacts.contact_id`), keeping the stored reference objects intact for the edit form to round-trip back into the selector. The list table's Contacts column, detail-page contact chips, and view pages all read the enriched docs.
  - New `lookup_collections` var configures the real Mongo collection names used by the read-pipeline `$lookup` stages: `lookup_collections.contacts` (default `user-contacts`) and `lookup_collections.companies` (default `companies`). Override when an app points its connections at differently-named collections (`$lookup` `from` takes a collection name, not a connectionId).
  - New `components.contact_card_extra_fields` / `components.company_card_extra_fields` vars: extra `{ label, value }` rows rendered under each linked contact's name/email and each linked company's name on the activity-detail chips. `value` is a top-level key on the projected doc — extend the lookup stage's `$project` to surface nested source fields.
  - Form rework: the type picker is now a `SegmentedSelector` (was a dropdown `Selector`), and the linked-contacts selector relabels per type — Attendees (meeting), CC (email), Participants (otherwise). The "Additional Details" divider above consumer `fields.attributes` is removed; attribute fields now render directly after the built-in fields.
  - View detail page main column: removed the Status History section (duplicates the events timeline in the History card) and the inline Linked Contacts / Linked Companies sections (duplicates the dedicated sidebar cards).
  - View detail header: collapsed the separate type-chip / title / description blocks into a single header (title + rich-text description) with refined typography, and moved the type + current-stage pills into the wrapping card's `extra` slot. Captured date, duration (call / meeting), and direction (email) now render via a field-driven `SmartDescriptions` block whose `fields` config is the form's meta-row field defs, extracted to the shared `components/activity_meta_fields.yaml` so the form and the read-only view stay in sync.
  - Description rendering reads `description.html` instead of the whole TiptapInput value object (fixes `[object Object]` in the view). Excel export reads `description.text` for plain output.
  - `get_activities.yaml` now runs `lookup_contacts` + `lookup_companies` stages so the list table's Contacts/Companies columns populate. Dropped `returnStoredSource: true` so post-write refetches return the live doc immediately instead of waiting on Atlas Search index replication.
  - `updated_at` / `created_at` date formatting moved into the shared `add_derived_fields.yaml` stage — every consumer (detail, list, tile, options) now gets the formatted strings, not just the list page.
  - New optional `references` payload on `create-activity` and `update-activity`: any keys passed in this object are `_object.assign`'d onto both the inserted/updated doc and the emitted event's `references:` block. Lets consumers link activities to entities the module doesn't know about (e.g. `deal_ids` from a CRM app) without forking the module — existing callers passing only `contacts` / `company_ids` are unaffected.
  - `capture_activity` now forwards `prefill.references` through `onOpen` state seeding and into the create payload, and seeds `cycle_check_self_id` / `cycle_check_ids` so the embedded company-selector's `get_companies_for_selector` request doesn't `ConfigWarning` on hosts that don't otherwise declare those state keys. `pages/new.yaml` mirrors the same `references` state init and payload pass-through.
  - **Fix event display app_name keying.** Activities was writing per-event display titles under a hard-coded `display.default.title` instead of `display.{app_name}.title`, so the events module's `display_key` could never read them back (blank timeline titles). The module now declares a required `app_name` var and follows the same pattern as `companies` / `contacts`: `defaults/event_display.yaml` ships bare event-type keys, and the four write APIs wrap them under `app_name` via `_build.if_none` (override fully replaces — no merge) instead of the old `_build.object.assign`. **Breaking:** consumers must now pass `app_name` to the activities module entry.
  - `get_activities.yaml` stage filter targets `status.stage` instead of `status.0.stage` — Atlas Search can't address array elements by position, so the old path never matched and a stage filter returned zero rows.
  - Edit page fetches the activity in `onInit` instead of `onMount`, so block-level mount fetches (e.g. the file-manager's files request) see `activity_id` seeded before they fire.
  - View page mirrors the loaded activity's `type` into `_state: type` (init `null` in onInit, set on hydrate). Consumer `fields.attributes` `visible` conditions are written against `_state: type` (e.g. meeting-only fields); the key existed on the form pages via the type input block but was never set on the view page, so those conditions always evaluated false once `SmartDescriptions` started honoring `visible: false`.
  - `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on every activity page that uses `company-selector` — silences the build-time `ConfigWarning` from companies' implicit `_state` references in `get_companies_for_selector.yaml`. Runtime unchanged (request `_if_none` defaults already covered it).

  **Companies / contacts**

  - `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on the view pages. Any sidebar slot that hosts a `company-selector` (e.g. via the activities `tile_activities` slot-wired from the app) triggers companies' `get_companies_for_selector` request, which reads those `_state` keys. The build's `_state` validator warns when keys are referenced but undeclared on the page; the init silences the warning. Runtime unchanged (`_if_none` defaults take over).

## 0.7.0

### Patch Changes

- [#67](https://github.com/lowdefy/modules-mongodb/pull/67) [`7d05a46`](https://github.com/lowdefy/modules-mongodb/commit/7d05a46109ae47e614baec5f4d5a1aef90f2efc1) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix `contact-selector` validation reading from the wrong state path.

  The `pass` rule was looking up state at `id | replace(".", "_")`, but state is bound at the dotted `id`. For nested IDs (e.g. `contact.user`), validation always saw `null` and failed/passed incorrectly. Uses the raw `id` for both `_state` lookups now.

## 0.6.0

### Minor Changes

- [`ad80095`](https://github.com/lowdefy/modules-mongodb/commit/ad800955415ff9e5858a0ce3d8fc6ddd5b241046) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Bump `@lowdefy/community-plugin-mongodb` peer requirement from `^2` to `^3` across all modules that depend on it (`activities`, `companies`, `contacts`, `notifications`, `user-account`, `user-admin`). Consumer apps must update their plugin install to the v3 line; module config and exports are otherwise unchanged.

## 0.5.2

## 0.5.1

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

  See `docs/idioms.md#event-display` for the updated reference.

## 0.3.0

### Minor Changes

- [#34](https://github.com/lowdefy/modules-mongodb/pull/34) [`cbe3d6d`](https://github.com/lowdefy/modules-mongodb/commit/cbe3d6d40c724c76da084cbb15fc7ac4bcc9cfa2) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Restructure the `companies` module's data shape so registration / contact / address / attribute fields move into opt-in section sub-objects instead of being hardcoded at the document root. Consumers wire any combination of shipped field-presets — or their own block arrays — through new `fields.{registration,contact,address,attributes}` slot vars.

  **Companies module — breaking shape changes:**

  - **Document root**: `trading_name` / `registered_name` / `registration_number` / `vat_number` / `website` removed from the document root. Display name is now `name`; the registration trio plus website / phone / email move under `registration.*` / `address.*` / `contact.*` sub-objects.
  - **`name_field` default**: flipped from `trading_name` to `name`. All read-side requests build `display_name` via `$getField` so the rename propagates without per-request edits. Apps whose collections genuinely use a different display field must set `name_field` explicitly.
  - **New `fields.X` vars**: `fields.contact`, `fields.address`, `fields.registration` (alongside existing `fields.attributes`). Each defaults to `[]` — apps that don't opt in render an empty section. Block ids inside each array must be prefixed with the section name (`contact.`, `address.`, etc.) so they bind to the matching state subtree.
  - **Field-preset library**: `field-presets/{contact-default,address-text,address-places,registration-sa}.yaml` ship under the module. `address-places.yaml` depends on a custom `PlacesAutocomplete` plugin that does not yet exist in this monorepo; consumers wiring it must supply the plugin themselves.
  - **Excel export**: fixed columns trimmed to the universal core (`id`, `name`, `description`, `updated_at`, `created_at`). Section columns move through the existing `components.download_columns` slot.

  **Migration (data):**

  ```
  trading_name              →  name
  registered_name           →  registration.registered_name
  registration_number       →  registration.registration_number
  vat_number                →  registration.vat_number
  website                   →  contact.website
  contact.primary_email     →  contact.primary_email   (unchanged)
  contact.primary_phone     →  contact.primary_phone   (unchanged)
  address.* (already nested)→  address.*               (unchanged)
  ```

  Run a one-off migration on the `companies` collection; `update-company`'s `$set` does not unset the legacy keys, so old fields will coexist with the new shape until explicitly removed.

  **Migration (apps wiring the module):**

  Add `fields.{contact,address,registration}` to your module-entry `vars` to opt into the sections. Either `_ref` the shipped presets or supply your own block arrays:

  ```yaml
  fields:
    contact:
      _ref: ../../modules/companies/field-presets/contact-default.yaml
    address:
      _ref: ../../modules/companies/field-presets/address-text.yaml
    registration:
      _ref: ../../modules/companies/field-presets/registration-sa.yaml
  ```

  `_ref` paths resolve from the consuming app's config root.

  **Contacts module:**

  `get_contact_companies` now projects `name` + `company_id` instead of the legacy `trading_name`. The contact view's linked-companies tile renders the new shape. Apps that rely on the old projection must update any custom consumers reading from this request.

  **Plugins (SmartDescriptions):**

  The `company` field-type detector signature changes from `"trading_name" in value` to `("name" in value && "company_id" in value)`, and the renderer reads `value.name` instead of `value.trading_name`. Any custom value shape that used to match on `trading_name` alone will now fall through to default rendering — pass `company_id` (or use the updated `get_contact_companies` projection) to keep the company link + icon.

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#14](https://github.com/lowdefy/modules-mongodb/pull/14) [`1c912ee`](https://github.com/lowdefy/modules-mongodb/commit/1c912eebc030b951ceb402a0d74a855982a37005) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Add `ContactSelector` block and wire it into the `contacts` module as a reusable picker (`contacts.contact-selector` component). Search runs against an Atlas `$search` + `$match` pipeline (`search_contacts`), enrichment via `get_contacts_data`, and add/edit go through the existing `create-contact` / `update-contact` APIs (patched to accept the picker's payload shape). The `companies` form now consumes the picker for linked contacts.

  **Breaking — contacts module vars renamed:**

  - `all_contacts` (module, default `false`, company-scoped) → per-call `company_only_contacts` (default `false`, **unscoped**). The default flipped: callers that relied on the old company-scoped default must now pass `company_only_contacts: true` explicitly.
  - `verified` (module enum `off|trusted|untrusted`) → `use_verified` (module boolean, default `false`) + per-call `verified` (boolean). The module flag toggles the verification UI/payload writes globally; per-call `verified` decides the value each picker instance writes.
  - Removed: module-level `phone_label` (no-op since Task 4) and the per-call `payload` var (deprecated by per-key var pass-through).

  **Migration:**

  ```
  all_contacts: false       →  company_only_contacts: true   (per-call)
  all_contacts: true        →  company_only_contacts: false  (per-call, or omit)
  verified: trusted         →  use_verified: true (module) + verified: true  (per-call)
  verified: untrusted       →  use_verified: true (module) + verified: false (per-call)
  verified: off             →  use_verified: false (module, default)
  ```

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

- [#27](https://github.com/lowdefy/modules-mongodb/pull/27) [`24b8dd1`](https://github.com/lowdefy/modules-mongodb/commit/24b8dd1e389ef6aaeab8d4fa56f7f393187db32c) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix silent empty `display` payload on every event-emitting endpoint. The `_build.array.map` callback that builds per-app event display titles returned `{key, value}` objects, which `_build.object.fromEntries` (native `Object.fromEntries`) silently rejected as `{}` — so events landed in MongoDB without `title` or `description`. Switched callback bodies to a 2-element `[key, value]` array tuple to match the spec, and quoted `"0.0"` so YAML parses it as a path string instead of the float `0`. Affects 9 endpoints: `contacts/api/{create,update}-contact`, `companies/api/{create,update}-company`, `user-admin/api/{invite,update}-user`, `user-admin/api/resend-invite`, `user-account/api/{create,update}-profile`. Also fixed two latent typos (`_result` → `_step`) in `user-account/api/{create,update}-profile.yaml` that were hidden by the silent failure.

- [#19](https://github.com/lowdefy/modules-mongodb/pull/19) [`46234e1`](https://github.com/lowdefy/modules-mongodb/commit/46234e1fc925c64a848a660bb7bf16629114f946) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Rewrite the two linked-record sidebar tiles — contacts on company-detail and companies on contact-detail — from a broken antd-style `List` (`properties.dataSource` + `properties.renderItem`) to a plain `Html` block. Both tiles previously rendered blank; both now list the linked records with name + email / display name and link through to the record's detail page using `_module.pageId`.

  Adds an optional `{ label, value }` extension slot per tile under each module's `components` var group:

  - `components.contact_card_extra_fields` on the companies module — appends rows under each contact's name/email on the company-detail tile.
  - `components.company_card_extra_fields` on the contacts module — appends rows under each company's display name on the contact-detail tile.

  `value` must be a top-level key on the document as projected by `get_company_contacts` / `get_contact_companies`. Falsy primitives (`0`, `false`, `""`) render; only `null`/`undefined` are skipped.

  Plugin housekeeping: declare `@lowdefy/nunjucks` as a peer dependency of `@lowdefy/modules-mongodb-plugins`. The plugin's `parseNunjucks.js` imports it but the package wasn't declared anywhere — Turbopack failed to resolve it on fresh installs.

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
