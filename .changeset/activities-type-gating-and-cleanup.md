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
- New optional `references` payload on `create-activity` and `update-activity`: any keys passed in this object are `_object.assign`'d onto both the inserted/updated doc and the emitted event's `references:` block. Lets consumers link activities to entities the module doesn't know about (e.g. `deal_ids` from a CRM app) without forking the module — existing callers passing only `contact_ids` / `company_ids` are unaffected.
- `capture_activity` now forwards `prefill.references` through `onOpen` state seeding and into the create payload, and seeds `cycle_check_self_id` / `cycle_check_ids` so the embedded company-selector's `get_companies_for_selector` request doesn't `ConfigWarning` on hosts that don't otherwise declare those state keys. `pages/new.yaml` mirrors the same `references` state init and payload pass-through.

**Companies / contacts (temporary)**

- Adds `activities` as a module dependency and inlines the `tile_activities` block in the sidebar of each module's detail page. Pages now also init `cycle_check_self_id` / `cycle_check_ids` state to silence the ConfigWarning from `get_companies_for_selector.yaml`'s `_state` references that triggers anywhere `company-selector` is consumed.
- All three touchpoints (dep, inline ref, `cycle_check_*` init) carry cross-referenced `TEMPORARY` comments. The intended pattern is app-level slot wiring via `components.sidebar_slots` (per the activities module's `decisions.md §7`), currently blocked by a Lowdefy framework limitation in `parseLowdefyYaml` walking `modules.X.vars.*` before module registration. Revert all three together when the upstream fix lands.

**Demo app**

- Bumps `@lowdefy/community-plugin-mongodb` to `3.0.0` to match what every module already declares (`^3`).
