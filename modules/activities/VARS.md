# Activities — Vars

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

`object` — See `defaults/event_display.yaml` for the shipped defaults. Per-app Nunjucks templates for the events this module emits (`create-activity`, `update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity`). The `target` shape is `{ title, type, type_label }`, where `type_label` is resolved from the merged `activity_types` enum at runtime.

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

## `request_stages`

`object` — Pipeline overrides.

- **`get_all_activities`** — `[{ $addFields: {} }]`. Stages appended after filtering on the activities list and Excel export aggregations.
- **`selector`** — `[]`. Stages appended to the activity-selector aggregation.
- **`filter_match`** — `[]`. Atlas Search compound clauses appended to the list `$search` query.
- **`write`** — `[]`. Update stages appended to both `create-activity` and `update-activity` flows.

## `filter_requests`

`array` — Default `[]`. Additional requests fetched alongside the custom `filters` blocks (e.g. dropdown option sources).
