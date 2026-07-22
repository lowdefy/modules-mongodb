# Task 2: Deal value/close-date as stored fields; volumes tile → host slot

## Context

The core generalization (Workstream A2). Today the deals module *computes* deal value inside its read aggregations from host-specific action fields — `pricing-qualification.unit_price × volumes.annual_volume` for value, `order-confirmation.completion_date` for close date, plus a `volumes`/`annual_volume` tile. That hardcoded math is exactly what over-fits the module to the host. It mirrors how `deal.outcome.{type,reason}` is *already* handled: stamped on write by the workflow's outcome action, read back as a plain field. Value/close should work the same way — the module reads plain stored fields; hosts stamp them from their own workflow hooks (that math belongs in host config, not the shared module).

## Task

In the deals module read aggregations, **stop computing** `deal_value` / `close_date` / volumes and instead **read stored fields** off the deal document:

- Replace the `deal_value` computation with a read of `$value` (with `$ifNull: [$value, 0]`) in `get_selected_deal.yaml:126,129`, `get_active_deals.yaml:129-132`, `get_deals_list.yaml:218-221`.
- Replace the `close_date` derivation with a read of `$close_date` (with `$ifNull` → null/`—` display) in `get_selected_deal.yaml:133`.
- Remove the `volumes.monthly_volume` rounding + `annual_volume` projection from `get_selected_deal.yaml:167`, `get_active_deals.yaml:125`, `get_deals_list.yaml:238`.
- The `product_volumes` info tile and the `annual_volume` render at `pages/view.yaml:268` move out of the module: the module ships no volumes tile. It is supplied by the host through the existing `components.info_grid_slots` var (the demo already passes `tiles/product_volumes.yaml` through it).

Preserve `value_label` display formatting (it can format the stored `$value`).

## Acceptance Criteria

- No module aggregation references the host's quantity/unit-price/close-date field identifiers (the exact names at the cited source lines — neutralized in these docs; grep the module for the real names after removal to confirm no residue — confirms both the generalization and finding #10's scrub cleanup).
- List/detail read `value`/`close_date` as stored fields with `$ifNull` fallbacks; an unstamped deal renders `0`/`—`, not an error.
- The module no longer defines a volumes tile of its own; `info_grid_slots` still works.
- `CI=true pnpm ldf:b` green (demo may show `0`/`—` for value until task 8 wires stamping — expected).
- Changeset for deals (minor); `docs/deals` regenerated; `pnpm docs:check` green.

## Files

- `modules/deals/requests/get_selected_deal.yaml` — modify — value/close/volumes reads → stored fields.
- `modules/deals/requests/get_active_deals.yaml` — modify — same.
- `modules/deals/requests/get_deals_list.yaml` — modify — same (value computed post-facet today; now read stored field).
- `modules/deals/pages/view.yaml` — modify — remove module volumes render (~:268); rely on info_grid_slots.
- `modules/deals/components/detail/*` + `tiles/product_volumes.yaml` (if module-owned) — modify/delete — volumes tile becomes host-supplied only.
- `.changeset/*.md` — create — deals minor.

## Notes

Do **not** add a read-time `value_expr` var (rejected alternative — re-derives on every read, needs a fixed injection point, inconsistent with `deal.outcome`). Stored field only. Between this task and task 8, the demo value shows the `$ifNull` fallback — acceptable; task 8's onboarding actions stamp `value`/`close_date`.
