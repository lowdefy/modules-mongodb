# Activities — Vars

## `app_name`

`string` — **Required.** App identifier used to key the event display titles written to the `log-events` collection. When `event_display` is not overridden, the shipped defaults render under `display.{app_name}` on each event document, and the events module's `display_key` must match this value to read them back. See [App name scoping](../../docs/idioms.md#app-name).

## `label` / `label_plural`

`string` — Defaults `Activity` / `Activities`. Singular and plural display labels used in page titles, buttons, and selector placeholders.

## `activity_types`

`object` — Default `{}`. App-level additions to the built-in activity-type enum. Same shape as `event_types`: keys are type strings, values have `title`, `color`, `icon`, `default_stage`. Merged at build time with `enums/activity_types.yaml` via `_build.object.assign` — built-ins ship as `call`, `meeting`, `email`.

Consumers extend the enum from their `modules.yaml`:

```yaml
vars:
  activity_types:
    quote:
      title: Quote
      color: "#fa8c16"
      icon: AiOutlineFileText
      default_stage: open
```

## `event_display`

`object` — Per-app Nunjucks templates for the events this module emits (`create-activity`, `update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity`), keyed by app identifier. When unset, the shipped defaults in `defaults/event_display.yaml` render under `app_name`. When set, the override **fully replaces** the defaults — no merge — so list every app and event type you want rendered. The `target` shape is `{ title, type, type_label }`, where `type_label` is resolved from the merged `activity_types` enum at runtime. See [Event display](../../docs/idioms.md#event-display).

## `fields`

`object` — Field-block slots.

- **`attributes`** — `[]`. Custom field blocks appended after the built-in sections in the edit form and detail view. Block ids must be prefixed with `attributes.` so they bind to `state.attributes.*`.

## `components`

`object` — Component slot overrides.

- **`table_columns`** — `[]`. Extra columns on the activities list table.
- **`filters`** — `[]`. Extra filter blocks below the search bar (pair with `filter_requests`).
- **`main_slots`** — `[]`. Extra blocks appended to the main column on the activity-detail page.
- **`sidebar_slots`** — `[]`. Extra blocks appended to the sidebar.
- **`download_columns`** — `[]`. Extra columns on the Excel export.
- **`contact_card_extra_fields`** — `[]`. Extra `{ label, value }` rows under each linked contact's name/email on the activity-detail contact chips. `value` is a top-level key on the projected contact doc (extend `lookup_contacts.yaml`'s `$project` for nested source fields).
- **`company_card_extra_fields`** — `[]`. Extra `{ label, value }` rows under each linked company's name on the activity-detail company chips. `value` is a top-level key on the projected company doc (extend `lookup_companies.yaml`'s `$project` for additional fields).

## `request_stages`

`object` — Pipeline overrides.

- **`get_all_activities`** — `[{ $addFields: {} }]`. Stages appended after filtering on the activities list and Excel export aggregations.
- **`selector`** — `[]`. Stages appended to the activity-selector aggregation.
- **`filter_match`** — `[]`. Atlas Search compound clauses appended to the list `$search` query.
- **`write`** — `[]`. Update stages appended to both `create-activity` and `update-activity` flows.

## `filter_requests`

`array` — Default `[]`. Additional requests fetched alongside the custom `filters` blocks (e.g. dropdown option sources).

## `lookup_collections`

`object` — Real Mongo collection names used by the read-pipeline `$lookup` stages that enrich linked contacts and companies on activity detail/list pages. Override when an app points its contacts/companies connections at differently-named collections.

- **`contacts`** — `user-contacts`. Collection joined by `lookup_contacts.yaml` (`contacts.contact_id` → `_id`).
- **`companies`** — `companies`. Collection joined by `lookup_companies.yaml` (`company_ids` → `_id`).

## `company_name_field`

`string` — Default `name`. Field on company docs used as the display name in linked-company chips and the list-table company tags. Mirrors the companies module's `name_field` — set both to the same value when an app stores its company display name under a non-default field (e.g. `trading_name`). The `lookup_companies` stage projects this field under the stable alias `name`, so templates always read `company.name`.
