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
- Description rendering reads `description.html` instead of the whole TiptapInput value object (fixes `[object Object]` in the view). Excel export reads `description.text` for plain output.
- `get_activities.yaml` now runs `lookup_contacts` + `lookup_companies` stages so the list table's Contacts/Companies columns populate. Dropped `returnStoredSource: true` so post-write refetches return the live doc immediately instead of waiting on Atlas Search index replication.
- `updated_at` / `created_at` date formatting moved into the shared `add_derived_fields.yaml` stage — every consumer (detail, list, tile, options) now gets the formatted strings, not just the list page.
- `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on every activity page that uses `company-selector` — silences the build-time `ConfigWarning` from companies' implicit `_state` references in `get_companies_for_selector.yaml`. Runtime unchanged (request `_if_none` defaults already covered it).

**Companies / contacts**

- `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on the view pages. Any sidebar slot that hosts a `company-selector` (e.g. via the activities `tile_activities` slot-wired from the app) triggers companies' `get_companies_for_selector` request, which reads those `_state` keys. The build's `_state` validator warns when keys are referenced but undeclared on the page; the init silences the warning. Runtime unchanged (`_if_none` defaults take over).
