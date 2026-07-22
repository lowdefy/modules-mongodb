# Task 13: Demo — re-supply domain fields as host `fields` config

## Context

Tasks 11–12 stripped the seven domain fields and five taxonomy vars from the module. This task re-supplies them from the demo (the host), proving the first-class-consumer obligation: the demo reconstitutes its exact create/display behaviour through the single `fields` var + the existing display slots, owning the enums itself.

The demo's deals config is `apps/demo/modules/deals/vars.yaml`. Today it already defines the five domain enums inline (`customer_types` ~:79, `sectors` ~:87, `sub_sectors` ~:93, `products` ~:104, `product_hierarchy` ~:112) and passes them as the (now-removed) module vars, plus a `company_fields` var that renders the stored `sector` on the view. Those enum definitions stay in the demo as **option sources** for the field blocks; the module vars they fed are gone.

## Task

Rewrite `apps/demo/modules/deals/vars.yaml` so the seven domain fields come through the module's new `fields` var:

- **Build the `fields` array** — one field block per domain field, ids prefixed `attributes.` (so they bind to `state.attributes.*` and are written by the generic passthrough and rendered read-only by the view's SmartDescriptions):
  - `attributes.material_code` — the Material/SKU selector, including its `product_hierarchy`-driven hierarchy hint + any onChange behaviour (recreate what `new.yaml` used to do, now as a demo block).
  - `attributes.product` — the coarse product selector (options from the demo `products` enum).
  - `attributes.customer_type` — ButtonSelector with the `customer_types` definitions.
  - `attributes.project_type` — ButtonSelector (project / additional-volume).
  - `attributes.sector` — Selector (options from `sectors`), resetting `attributes.sub_sector` onChange.
  - `attributes.sub_sector` — parented Selector filtered by `attributes.sector`.
  - `attributes.package` — ButtonSelector with the packaging options (25 kg bags / 20 kg bags / 300 kg drums / bulk) inline.
- **Keep the enum definitions** (`customer_types`/`sectors`/`sub_sectors`/`products`/`product_hierarchy`) in the demo vars as the option sources these blocks reference; they are no longer passed as module vars.
- **Sector display** — sector currently shows on the view via `company_fields`. Now that `attributes.sector` is a round-trip `fields` block (rendered read-only via SmartDescriptions), remove sector from `company_fields` to avoid double-display; keep `company_fields` for any genuine display-only extras.
- **Product as a list column/filter** — if the demo wants product visible on the deals list (it was before), re-add it via the demo's `filters` var (filter) and/or a `card_fields`/table-columns slot (column), reading `attributes.product`. Optional but preserves prior demo UX.
- **Richer tiles** (e.g. a volumes tile) stay via `info_grid_slots` as before — unchanged by this task.

## Acceptance Criteria

- `apps/demo/modules/deals/vars.yaml` passes a `fields` array of the seven domain field blocks (ids `attributes.*`), with the five enums retained as their option sources.
- No `products`/`product_hierarchy`/`sectors`/`sub_sectors`/`customer_types` passed as **module vars** (they'd be ignored now, but clean them up).
- `company_fields` no longer duplicates `sector`.
- Creating a deal in the demo writes the domain values under `attributes.*`; the deal view renders them read-only via SmartDescriptions; the list still shows product (if the column/filter was re-added).
- `CI=true pnpm ldf:b` (from `apps/demo`) green.

## Files

- `apps/demo/modules/deals/vars.yaml` — modify — add `fields` array; retain enums as option sources; de-dup sector from `company_fields`; optional product column/filter.

## Notes

- The field-block definitions are lifted from the pre-Task-11 `modules/deals/pages/new.yaml` (git history) — same blocks, now ids `attributes.*` and living in demo config.
- This is the host-reconstitution proof for Workstream D: everything the module dropped is rebuildable from config with no UX loss. Any field that *can't* be reconstituted here is a design defect to surface, not a demo workaround.
