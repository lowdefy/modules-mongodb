# @lowdefy/modules-mongodb-companies

## 0.4.2

### Patch Changes

- [#50](https://github.com/lowdefy/modules-mongodb/pull/50) [`2ea6148`](https://github.com/lowdefy/modules-mongodb/commit/2ea6148f1cdfd22e0a8059c598420dbd7daa7006) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Use the AgGrid block's native `loading` property for the list tables (`activities_table`, `companies_table`, `contacts_table`, `users_table`) instead of swapping the `overlayNoRowsTemplate` between `Loading...` and `No rows` via `_if`. The block now enters its built-in loading state while the list request is pending and falls back to a static `No rows` overlay once it resolves empty — the previous wiring conflated "loading" with "empty" through a single text overlay.

## 0.4.1

## 0.4.0

### Minor Changes

- [#42](https://github.com/lowdefy/modules-mongodb/pull/42) [`cb7b574`](https://github.com/lowdefy/modules-mongodb/commit/cb7b57469249d46fdd6c7b8a1b5c94636e3a3f68) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Add opt-in parent/child hierarchy to the `companies` module. Companies form a directed acyclic graph (DAG) over a new top-level `parent_ids: string[]` field — each company can have multiple parents and multiple children. Gated by a single `hierarchy.enabled` var (default `false`); when disabled, the module behaves exactly as today and the `parent_ids` field is omitted from new documents.

  **What enabling `hierarchy.enabled: true` adds:**

  - **Edit form** — a new "Parent {label_plural}" multi-select section appended to the form. Self is filtered out of the options entirely; descendants render as disabled options with a "(child of this company)" suffix so users see why they can't be picked. The selector reads `state.cycle_check_self_id` and `state.cycle_check_ids`, populated by the page's `set_state` action after `get_descendant_company_ids` resolves on mount.
  - **View page** — a new "Company Hierarchy" sidebar tile with two stacked sections (Parents above, Children below) rendered as inline anchor links. Empty sections collapse; the whole tile self-hides when there's nothing to show. Soft-deleted parents are filtered out via the `$lookup` sub-pipeline; soft-deleted children are filtered out via the children request.
  - **Cycle prevention** — `update-company` runs a `$graphLookup`-based pre-check (walks upward from each candidate parent through `parent_ids`). If self appears anywhere in the ancestor closure, `:reject:` aborts the routine with the message "Selected parents would create a cycle in the company hierarchy." — surfaces to the calling form's `onError` handler.

  **New module vars (under `hierarchy`):**

  - `enabled` (bool, default `false`) — master flag.
  - `parent_label` (string, optional) — override for the parent multi-select label and parents heading.
  - `children_label` (string, optional) — override for the children heading.
  - `max_depth` (number, default `20`) — defensive cap on every `$graphLookup` in the module's pipelines (descendants resolution + cycle check). Backstops runaway traversal in the unlikely case a cycle leaks past the API check.

  **New collection field:** `parent_ids: string[]` (top-level, only emitted when `hierarchy.enabled: true`). No data migration needed — existing companies without the field behave as roots (no parents) under MongoDB multikey index semantics.

  **New module exports:**

  - `parent_selector` component — `MultipleSelector` wrapper used on the edit form (no own `onMount`; the consuming page sequences the options fetch).
  - `tile_hierarchy` component — referenced internally by the view page's sidebar.
  - `get_descendant_company_ids` request — shared by edit form (cycle-check exclusion list) and the deferred list filter; reads `_state.filter.parent_scope` with fallback to `_state._id` so one request file serves both consumers.
  - `get_company_children` request — direct-children-only multikey `$match` for the view-page tile.

  **Cleanup bundled in this release** (verified against `@lowdefy/blocks-antd@4.7.1` schemas):

  - Dropped the vestigial `optionConfig` block from `company-selector.yaml` — not in `Selector/schema.json`, not consumed by any plugin in `plugins/`. The schema's option shape (`{ label, value, disabled, ... }`) already matches the projection's output natively.
  - Switched `label: <string>` to `title: <string>` on `company-selector.yaml` — `label:` is an object on the antd schema (label-area styling), `title:` is the string-typed displayed label.

  **MongoDB version requirement.** The new `$lookup` in `get_company.yaml` uses the `localField + foreignField + pipeline` combination, which requires **MongoDB 5.0+**. Apps on older MongoDB versions need to upgrade before deploying this version.

  **Out of scope for this release:** hierarchy filter on the list page (`tasks/10-list-filter.md` spec retained for a future implementation when needed); cross-module hierarchy roll-ups (e.g. "all contacts under any descendant of X"); hierarchical permissions; bulk re-parent / drag-and-drop graph editor.

  The list filter and the related no-op Atlas Search soft-delete cleanup (`mustNot exists path: removed.timestamp` in `get_all_companies.yaml` and `get_company_excel_data.yaml`) are documented in the design's "Related cleanup" section and remain pending.

- [#43](https://github.com/lowdefy/modules-mongodb/pull/43) [`6167087`](https://github.com/lowdefy/modules-mongodb/commit/61670879121524df84b202f512c6c5bfcbf9804a) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Add a `short_name` top-level field to the companies module for narrow display contexts (reports, chart axes, dense tables). The field is **required** on the create/edit form and is surfaced on the view-page core descriptions, the list table (between Name and Description), the Excel export, and the create/update API payloads.

  Toggled by a new `short_name.enabled` var (default `true`, opt-out). When set to `false`, every surface referencing `short_name` — form input, view row, table column, Excel column, API payload — is omitted at build time and the field is absent from new documents. Existing documents that already carry `short_name` keep the value on disk but won't render or be written until re-enabled.

  Apps that want `short_name` to drive selectors, table titles, and event templates can additionally set `name_field: short_name` on the module entry — the existing escape hatch already supports it.

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

- [#29](https://github.com/lowdefy/modules-mongodb/pull/29) [`f9a4078`](https://github.com/lowdefy/modules-mongodb/commit/f9a40783224b093c10727f64cdb62f7cb2b39838) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Remove the `collection` var from the `companies`, `events`, and `files` modules. Each module's MongoDB collection name is now hardcoded in its connection file (`companies`, `log-events`, `files` respectively). Consumers can no longer rename the underlying collection through `vars.collection` — to point a module at a different collection, remap its connection (`companies-collection`, `events-collection`, `files-collection`) via the module entry's `connections` mapping in `lowdefy.yaml`.

  **Breaking:** apps that previously set `vars.collection` on any of these modules must remove it. If a non-default collection name was in use, switch to a `connections` remap on the module entry.

- [#29](https://github.com/lowdefy/modules-mongodb/pull/29) [`2855113`](https://github.com/lowdefy/modules-mongodb/commit/28551131d91fd863b979212ce0c53d3e4da2485d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Remove the `data-upload` module. The module has been deleted from the repo along with its pages, components, requests, connections, menus, and event-type enums. Consumers using `data-upload` should pin to the previous release tag or vendor the module locally. Cross-references from `modules/shared/enums/event_types.yaml`, `apps/demo/modules.yaml`, the root `README.md`, `docs/idioms.md`, and the demo `.claude/guides/*.md` have been removed. The `SYNC_S3_*` secrets are no longer documented.

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
