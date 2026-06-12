---
"@lowdefy/modules-mongodb-activities": minor
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
---

Activities: add basic/complex type gating, clean up the detail view, and fix runtime + warning issues surfaced by demo testing.

**Activities**

- New `type: basic | complex` field on each `activity_types` entry. Basic activities (built-in: `call`, `email`) are created in `default_stage` and have no transition UI; complex activities (built-in: `meeting`) keep the full Mark done / Reopen / Cancel lifecycle. Existing consumer-defined types without an explicit `type` default to `complex` (full UI).
- Type gating enforced at three layers: table action-column cell renderers (em-dash for basic), CallAPI skip conditions (defence in depth for empty-cell clicks), and view-page button visibility. Stage chip on the detail view header is also hidden for basic activities.
- View detail page main column: removed the Status History section (duplicates the events timeline in the History card) and the inline Linked Contacts / Linked Companies sections (duplicates the dedicated sidebar cards).
- View detail header: collapsed the separate type-chip / title / description blocks into a single header (title + rich-text description) with refined typography, and moved the type + current-stage pills into the wrapping card's `extra` slot. Captured date, duration (call / meeting), and direction (email) now render via a field-driven `SmartDescriptions` block whose `fields` config is the form's meta-row field defs, extracted to the shared `components/activity_meta_fields.yaml` so the form and the read-only view stay in sync.
- Description rendering reads `description.html` instead of the whole TiptapInput value object (fixes `[object Object]` in the view). Excel export reads `description.text` for plain output.
- `get_activities.yaml` now runs `lookup_contacts` + `lookup_companies` stages so the list table's Contacts/Companies columns populate. Dropped `returnStoredSource: true` so post-write refetches return the live doc immediately instead of waiting on Atlas Search index replication.
- `updated_at` / `created_at` date formatting moved into the shared `add_derived_fields.yaml` stage — every consumer (detail, list, tile, options) now gets the formatted strings, not just the list page.
- New optional `references` payload on `create-activity` and `update-activity`: any keys passed in this object are `_object.assign`'d onto both the inserted/updated doc and the emitted event's `references:` block. Lets consumers link activities to entities the module doesn't know about (e.g. `deal_ids` from a CRM app) without forking the module — existing callers passing only `contact_ids` / `company_ids` are unaffected.
- `capture_activity` now forwards `prefill.references` through `onOpen` state seeding and into the create payload, and seeds `cycle_check_self_id` / `cycle_check_ids` so the embedded company-selector's `get_companies_for_selector` request doesn't `ConfigWarning` on hosts that don't otherwise declare those state keys. `pages/new.yaml` mirrors the same `references` state init and payload pass-through.
- **Fix event display app_name keying.** Activities was writing per-event display titles under a hard-coded `display.default.title` instead of `display.{app_name}.title`, so the events module's `display_key` could never read them back (blank timeline titles). The module now declares a required `app_name` var and follows the same pattern as `companies` / `contacts`: `defaults/event_display.yaml` ships bare event-type keys, and the four write APIs wrap them under `app_name` via `_build.if_none` (override fully replaces — no merge) instead of the old `_build.object.assign`. **Breaking:** consumers must now pass `app_name` to the activities module entry.
- `get_activities.yaml` stage filter targets `status.stage` instead of `status.0.stage` — Atlas Search can't address array elements by position, so the old path never matched and a stage filter returned zero rows.
- Edit page fetches the activity in `onInit` instead of `onMount`, so block-level mount fetches (e.g. the file-manager's files request) see `activity_id` seeded before they fire.
- `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on every activity page that uses `company-selector` — silences the build-time `ConfigWarning` from companies' implicit `_state` references in `get_companies_for_selector.yaml`. Runtime unchanged (request `_if_none` defaults already covered it).

**Companies / contacts**

- `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on the view pages. Any sidebar slot that hosts a `company-selector` (e.g. via the activities `tile_activities` slot-wired from the app) triggers companies' `get_companies_for_selector` request, which reads those `_state` keys. The build's `_state` validator warns when keys are referenced but undeclared on the page; the init silences the warning. Runtime unchanged (`_if_none` defaults take over).
