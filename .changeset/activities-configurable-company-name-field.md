---
"@lowdefy/modules-mongodb-activities": patch
---

Activities: make the linked-company display field configurable instead of hardcoding `trading_name`.

The `lookup_companies` read stage and the `company_list_items` / `table_activities` templates hardcoded `trading_name`, which matched neither the companies module's `name_field` default (`name`) nor any consumer that left that default in place — linked-company chips and list-table tags rendered blank (table fell back to `_id`).

- New `company_name_field` var (default `name`) mirrors the companies module's `name_field`. Set both to the same value when an app stores its company display name under a non-default field (e.g. `trading_name`).
- `lookup_companies.yaml` now projects the configured field under the stable alias `name` via `$getField`, so `company_list_items` and `table_activities` read `company.name` regardless of the source field.

No action needed for consumers on the `name` default. Apps that store the company display name under another field should set `company_name_field` to match their companies `name_field`.
