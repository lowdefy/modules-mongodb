# @lowdefy/modules-mongodb-activities

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

### Minor Changes

- [#93](https://github.com/lowdefy/modules-mongodb/pull/93) [`ce955c2`](https://github.com/lowdefy/modules-mongodb/commit/ce955c285e9abdec66ba059ae5c292c99862a3e4) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Six backwards-compatible extension points in the activities module:

  - **Type behavior flags** — the meeting-specific form behavior is no longer keyed to the literal `meeting` type id. Activity-type enum entries (built-in or registered via the `activity_types` var) now carry optional flags: `agenda: true` renders the Agenda Topics section, `duration: true` / `direction: true` show those meta fields in the form and view, and `contact_label` titles the linked-contacts selector (default "Participants"). The built-ins keep their previous behavior as defaults (`call`: duration; `email`: direction + CC; `meeting`: agenda + duration + Attendees), so a consumer type can now be fully meeting-like.
  - **Per-type attribute fields** — new `fields.attributes_by_type.<type_id>` var. A type with an entry renders that block list (form and detail view) instead of the global `fields.attributes` array; types without an entry fall back to the global array.
  - **Attachment slots** — the attachments UI is now a pair of overridable block-array slots: `components.form_attachments` (defaults to the files module's file-manager at the bottom of the form) and `components.view_attachments` (defaults to the files file-card sidebar tile on the detail page). Apps that don't wire the files module can supply their own blocks or `[]`.
  - **Post-create hook** — new `hooks.on_created` var: actions run after every successful create (new page and `capture_activity` modal) with the new activity's id at `state.activity_id` and the captured fields still in state. On the new page, setting `state.on_created_handled: true` in the hook skips the built-in reset + navigate-to-view tail so the hook can route elsewhere.
  - **Agenda origin marker** — task docs created from activity agenda topics are stamped `metadata.task_type: agenda` (create flow, and backfilled by the edit flow's upsert), so host apps can distinguish them from adhoc tasks without relying on the `activity_ids` back-link.
  - **Form option requests** — new `form_requests` var: request configs spliced into the new/edit page request lists and fired on page init, so request-backed consumer `fields.*` blocks (e.g. a selector whose options come from an app collection) have their option sources available. The pages set a `state.activity_form_context` marker (`page` on new/edit, `view` on the detail page, `modal` in the `capture_activity` modal) so such fields can gate themselves to the full-page form and stay out of the modal, where page requests aren't available.

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

## 0.8.1

### Patch Changes

- [#80](https://github.com/lowdefy/modules-mongodb/pull/80) [`c079a0d`](https://github.com/lowdefy/modules-mongodb/commit/c079a0d8e143b0b0764d1c7b79a1024ef836d855) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities list: stop scoping the table via url-query params, and fix free-text search over the rich-text description.

  - The list page (`pages/all.yaml`) no longer hydrates `contact_id` / `company_id` from `_url_query`. The page renders no visible entity (contact/company/deal) filter control, so url-driven scoping produced a silently filtered, uncloseable table — and the `activities-timeline` "View all" link, when mounted on a deal (`reference_field: deal_ids`), passed neither branch so both resolved to `null`. "View all" now navigates to the full list with a clean url; the entity-scoped subset is already shown in the timeline tile itself.
  - `get_activities.yaml` still honours `state.filter.contact_id` / `company_id` as a request-side extension point for consumers that add their own _visible_ picker via `components.filters`; only the hidden url hydration is removed.
  - `get_activities.yaml` free-text search now targets `description.text` instead of `description`. The description field is Tiptap rich text stored as `{ html, text }`, so the previous path against the object never matched; searching the plain-text subpath (not the html markup) keeps results free of tag noise.

## 0.8.0

### Minor Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`2e9c67c`](https://github.com/lowdefy/modules-mongodb/commit/2e9c67cc77215032f059d597371866c9783ce001) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: built-in meeting agenda topics, stored as tasks in the actions collection.

  - New built-in Agenda Topics section on the activity form (meeting only): topic, details, action, person responsible (options from the activity's attendees), and due date, with an info alert explaining that agenda changes create/update tasks. Previously this lived in consumer `fields.attributes` config writing to `attributes.agenda_topics`.
  - Topics are no longer stored on the activity doc. `create-activity` and `update-activity` accept a new `agenda_topics` payload array and persist each topic as a task document in the actions collection — `kind: task`, `title` = topic, `description` = details, `attributes.action`, `assignees` = [person responsible], `due_date`, app-keyed `{app_name}.message`, initial stage `action-required` — linked back via `activity_ids` and stamped with the activity's `company_ids` + `references` payload (e.g. `deal_ids`) so they surface in host-app task lists.
  - `update-activity` diffs incoming topics against the activity's existing tasks by `_id`: new rows insert (upsert), existing rows get field edits only (status untouched), and removed rows get a `not-required` status entry pushed — never deleted. `delete-activity` marks the activity's open (`action-required`) tasks `not-required`.
  - No per-task events: the existing `create-activity` / `update-activity` / `delete-activity` events carry affected task ids in `references.action_ids`, and task status entries reference that event's id.
  - `get_activity` gains a `lookup_agenda_tasks` stage (`_id` → `activity_ids`, excluding `not-required`) feeding a new read-only Agenda Topics section on the view page and the edit form's seeded rows (hidden task `_id` per row round-trips through the ControlledList).
  - New `actions-collection` connection (default collection `actions`, write enabled) and `lookup_collections.actions` var (default `actions`) — consumers mapping the actions collection to another name must set both.
  - Activity docs now also store the create `references` payload verbatim under a `references` field, so tasks added later from the edit page inherit the same references.

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`f2d1386`](https://github.com/lowdefy/modules-mongodb/commit/f2d138632a0afa03f440ab6e17be4c14b939aa8e) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: built-in file upload on the activity form.

  - The activity form (new page, edit page, and quick-capture modal) now renders an Attachments section with the files module's `file-manager`, so users can attach files while logging an activity. Files bind to `entity_type: activity`, `entity_id: activity_id`, `file_category: activity-attachment` — the same keys the detail view's file sidebar reads.
  - To give uploads a stable id before the activity exists, `activity_id` is minted (`_uuid`) on form open — capture-modal `onOpen` and new-page `onInit` — and reused as the create payload's `_id` instead of minting a fresh id at submit. The modal's `onClose` reset clears it; the edit page seeds it from the loaded `_id` so the file-manager resolves identically on new, edit, and capture. This also gives consumer attachment-style `fields.attributes` blocks a stable `_state: activity_id` to bind against.
  - The form embeds the file-manager unconditionally, so hosts must wire the module's `files` dependency (previously only needed for the optional detail-page file sidebar).

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

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`a56d14a`](https://github.com/lowdefy/modules-mongodb/commit/a56d14aff3bf01dc014871ee51f38a30e96288e6) Thanks [@Saiby100](https://github.com/Saiby100)! - Lock linked-company edits on the activity edit page.

  - Companies: `company-selector` accepts a new `disabled` var (default `false`) that renders the selector read-only.
  - Activities: new `disable_company_edit` var (default `false`). When `true`, the edit page renders the linked-companies selector disabled, so linked companies stay visible but can't be changed after creation. The new page and quick-capture prefill still set companies; detail-page chips and list-table tags are unaffected.

### Patch Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`0f2f9a3`](https://github.com/lowdefy/modules-mongodb/commit/0f2f9a3abaa8680edca433cdde3d816655b4e659) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: make the linked-company display field configurable instead of hardcoding `trading_name`.

  The `lookup_companies` read stage and the `company_list_items` / `table_activities` templates hardcoded `trading_name`, which matched neither the companies module's `name_field` default (`name`) nor any consumer that left that default in place — linked-company chips and list-table tags rendered blank (table fell back to `_id`).

  - New `company_name_field` var (default `name`) mirrors the companies module's `name_field`. Set both to the same value when an app stores its company display name under a non-default field (e.g. `trading_name`).
  - `lookup_companies.yaml` now projects the configured field under the stable alias `name` via `$getField`, so `company_list_items` and `table_activities` read `company.name` regardless of the source field.

  No action needed for consumers on the `name` default. Apps that store the company display name under another field should set `company_name_field` to match their companies `name_field`.

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`f2d1386`](https://github.com/lowdefy/modules-mongodb/commit/f2d138632a0afa03f440ab6e17be4c14b939aa8e) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: restyle the `activities-timeline` rows for scannability.

  Rows are restructured into a column layout: the activity title leads, with a smaller type-label pill on its right (the pill previously sat left of the title). The activity description renders as muted two-line-clamped text under the title (Tiptap HTML stripped, empty `<p></p>` docs hidden). The stage pill is replaced by plain stage-coloured text bottom-left, and the date bottom-right now shows the activity's scheduled date (`attributes.date`) instead of `updated.timestamp`. Rows get horizontal padding, rounded corners, and a hover background (theme-token based, works in light and dark).

## 0.7.0

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

## 0.1.0

### Minor Changes

- Initial activities module.
