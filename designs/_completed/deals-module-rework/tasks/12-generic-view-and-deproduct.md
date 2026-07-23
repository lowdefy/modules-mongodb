# Task 12: Module — generic display (SmartDescriptions) + remove `product` from read side

## Context

Task 11 added the `fields` var and made the create form + write generic, but left the **display** half of the round trip and the `product` read-side coupling in place. This task completes both, and owns every remaining `view.yaml`/list edit for Workstream D (single-task ownership of `view.yaml` avoids churn).

The display pattern is `SmartDescriptions` reading the same `fields` defs read-only — see `modules/companies/components/view_company.yaml` (each section is a `SmartDescriptions` block with `fields: _module.var: fields.<slot>`; a `_build.if` on array length hides the empty section).

`product` is handled as a normal domain field (per the design's `product` audit row): it moves to `attributes.product` via the host `fields` block (Task 11/13), so the module drops every remaining `product` reference — the `products` var, the `view.yaml` pipeline-header `product_name` derivation, the list-request projections/filter, and the list-card render. The deal-subtitle header degrades to description-only.

`get_selected_deal` needs **no** projection change — it returns the whole deal doc, so `attributes.*` already reach the view. `get_deals_list`'s `$facet` projection swaps `product: 1` for `attributes: 1`.

## Task

**1. Detail view (`modules/deals/pages/view.yaml`):**
- Add a `SmartDescriptions` section rendering `_module.var: fields` read-only (the `view_company.yaml` pattern — `_build.if` on `_build.array.length` to hide when empty). Place it where the deal's host attributes belong in the detail layout (alongside the existing company/info sections).
- Remove the pipeline-header `product_name` derivation (the `_get` against the `products` var and the `get_selected_deal.0.product` / `product_name_freetext` reads). The header subtitle becomes description-only.

**2. Manifest (`modules/deals/module.lowdefy.yaml`):**
- Remove the `products` var (now unreferenced after step 1).

**3. List requests:**
- `modules/deals/requests/get_deals_list.yaml` — remove the `filter.product` match clause and the `product: 1` / `product_name_freetext: 1` projections; add `attributes: 1` to the projection so host columns can read `attributes.*`.
- `modules/deals/requests/get_active_deals.yaml` — remove the `product: 1` / `product_name_freetext: 1` projections (add `attributes: 1` if the active-deals surface needs host fields).

**4. List card (`modules/deals/components/deal_list_card.yaml`):**
- Remove the `product` render (the `_get`/label lookup around lines 48/61/71). If a host wants product on the card, it re-adds it via `card_fields`/`card_slots`.

## Acceptance Criteria

- `view.yaml` renders host `fields` read-only via `SmartDescriptions`; no `products`/`product` references remain; header subtitle is description-only.
- `module.lowdefy.yaml` no longer declares `products` (nor any of the five domain-taxonomy vars — all gone after Tasks 11+12).
- `get_deals_list.yaml` has no `product` filter/projection and projects `attributes`; `get_active_deals.yaml` has no `product` projection.
- `deal_list_card.yaml` renders no `product`.
- `grep -rn "product\|sector\|customer_type\|material\|package\|_module.var: products" modules/deals/` returns only incidental matches (e.g. `product_name_freetext` fully gone; no domain-field or taxonomy-var residue).
- `CI=true pnpm ldf:b` (from `apps/demo`) green.

## Files

- `modules/deals/pages/view.yaml` — modify — add SmartDescriptions `fields` section; remove product header bits.
- `modules/deals/module.lowdefy.yaml` — modify — remove `products` var.
- `modules/deals/requests/get_deals_list.yaml` — modify — drop product filter/projection; add `attributes: 1`.
- `modules/deals/requests/get_active_deals.yaml` — modify — drop product projection.
- `modules/deals/components/deal_list_card.yaml` — modify — remove product render.

## Notes

- `get_selected_deal.yaml` is intentionally **not** modified — it has no restrictive `$project`, so `attributes.*` already flow. Confirm this rather than adding a projection.
- The existing `company_fields`/`meta_fields`/`info_grid_slots` slots stay — they're for display-only extras (computed rows, richer tiles like volumes), not the round-trip `fields`. Do not remove them.
- After this task the module has zero knowledge of any domain field — verify with the grep above before handing off.
