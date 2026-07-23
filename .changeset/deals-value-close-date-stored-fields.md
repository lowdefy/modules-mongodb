---
"@lowdefy/modules-mongodb-deals": minor
---

Stop computing `deal_value`/`close_date` from host-specific workflow action
fields in the list/detail aggregations (get_selected_deal, get_active_deals,
get_deals_list) — read them as plain stored fields (`$value`/`$close_date`,
each with an `$ifNull` fallback) the same way `deal.outcome` is already
read back after being stamped on write. Also drops the module's inline
volumes rounding/projection; the module ships no volumes tile of its own —
hosts supply one through the existing `components.info_grid_slots` var. An
unstamped deal now renders `0`/`—` for value/close date instead of an
app-specific computed number.
