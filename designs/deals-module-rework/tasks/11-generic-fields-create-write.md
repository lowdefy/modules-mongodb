# Task 11: Module — `fields` var + generic create form + generic write

## Context

Workstream D generalizes the deals module so it ships only the **universal** deal fields (company, name, description + the value/close/people/stage/outcome/pipeline it already handles) and lets hosts inject domain fields via config — exactly the suite-standard pattern every other entity module already uses: a single `fields` object var whose blocks render as **inputs** in the create form and **read-only** on the view via `SmartDescriptions`. See `companies` for the reference implementation:
- Manifest var: `modules/companies/module.lowdefy.yaml:92-121` (`fields` object; block ids prefixed `attributes.` so they bind to `state.attributes.*`).
- Form rendering: `modules/companies/components/form_company.yaml` (`_build.array.concat` + `_build.if` on `_build.array.length` of each `fields.*` slot, divider + blocks).
- Write passthrough: `modules/companies/api/create-company.yaml` writes `attributes` straight from `_payload: attributes`.

Today the deals module bakes seven domain field blocks into `pages/new.yaml` (`material_code`, `product`, `customer_type`, `project_type`, `sector`, `sub_sector`, `package`), backed by five taxonomy vars (`products`, `product_hierarchy`, `sectors`, `sub_sectors`, `customer_types`) and a material-derivation step in `api/create-deal.yaml`. `product` is special-cased — stored top-level (`deal.product`) rather than under `attributes`.

This task does the **create + write** half of the round trip. The **display** half (SmartDescriptions on the view) and the `product` read-side removal (view header, list requests, list card, the `products` var) are Task 12. To keep every intermediate build green, this task leaves the `products` var and product's view/list usages intact — new deals simply stop writing `product`, which the view/list render as empty until Task 12 removes them.

## Task

**1. Manifest (`modules/deals/module.lowdefy.yaml`):**
- Add a `fields` object var (type object, default `[]`), documented like `companies.fields.attributes`: host-supplied field blocks appended after the core company/name/description on the create form and rendered read-only on the view; block ids must be prefixed `attributes.` so they bind to `state.attributes.*`.
- Remove the create-form-only taxonomy vars: `product_hierarchy`, `sectors`, `sub_sectors`, `customer_types`. **Keep `products`** for now (view header still references it — removed in Task 12).
- Remove the exported `fields` from nowhere else — it's a new var, not an export.

**2. Create form (`modules/deals/pages/new.yaml`):**
- Remove the seven domain field blocks: `form.material_code` (+ its `product_hierarchy` hierarchy-hint `extra`), `form.product`, `form.customer_type`, `form.project_type`, `form.sector`, `form.sub_sector`, `form.package`.
- After the core company/name/description blocks, render `_module.var: fields` as inputs using the `form_company.yaml` pattern (`_build.if` on array length, optional divider, then the blocks).
- Prefill: drop the material/product `prefill_deal_name` coupling. Module default — **no auto-prefill** (the shared company-selector has no `onChange` hook); `form.name` stays a plain **required**, user-editable field. Any prefill is host-owned via a `fields` block `onChange`.

**3. Write (`modules/deals/api/create-deal.yaml`):**
- Remove the `material` `:set_state` derivation (the `_get` against `product_hierarchy`).
- Replace the fixed `attributes.{...}` block with a generic passthrough from `form.attributes.*` (mirror `create-company.yaml`'s `attributes: _payload: attributes` shape; use `_if_none` to default to `{}`).
- Remove the top-level `product: _payload: form.product` write (product now flows through `attributes.product` from the host `fields` block).
- Leave the deal name/description/company_id/salesperson/status/outcome/tags/stamps writes unchanged.

**4. Delete now-unused create-form helpers** if fully unreferenced after the above: `modules/deals/components/new/options_enum.yaml`, `options_enum_parented.yaml.njk`, `prefill_deal_name.yaml`. Grep first to confirm no other referrer.

## Acceptance Criteria

- `modules/deals/module.lowdefy.yaml` has a `fields` object var (matching companies' doc style) and no longer declares `product_hierarchy`/`sectors`/`sub_sectors`/`customer_types`. `products` still present.
- `pages/new.yaml` renders only company/name/description + `_module.var: fields`; no `material_code`/`product`/`customer_type`/`project_type`/`sector`/`sub_sector`/`package` blocks; company-only prefill of `form.name`.
- `api/create-deal.yaml` writes a generic `attributes` passthrough, no material derivation, no top-level `product`.
- Deleted create-form helper files have no remaining referrers.
- `CI=true pnpm ldf:b` (from `apps/demo`) green. (The demo still supplies the old taxonomy vars — harmless extras — until Task 13; the create form renders an empty `fields` slot until then.)

## Files

- `modules/deals/module.lowdefy.yaml` — modify — add `fields` var; remove 4 taxonomy vars.
- `modules/deals/pages/new.yaml` — modify — strip 7 domain blocks; render `fields`; company prefill.
- `modules/deals/api/create-deal.yaml` — modify — generic `attributes` passthrough; drop material derivation + top-level product.
- `modules/deals/components/new/options_enum.yaml` — delete (if unreferenced).
- `modules/deals/components/new/options_enum_parented.yaml.njk` — delete (if unreferenced).
- `modules/deals/components/new/prefill_deal_name.yaml` — delete (if unreferenced).

## Notes

- Keep `products` and product's view/list usages until Task 12 — removing the var here would strand `view.yaml`'s header reference and break the build.
- The scrub constraint applies: the packaging values ("25 kg bags", "300 kg drums") and material/sector taxonomies leave the public module entirely here — grep the module after to confirm no residue.
- Do not add an `edit` page; deals has none (exports are `all`/`view`/`new`). The `fields` var only needs to render on `new.yaml` (inputs) and `view.yaml` (read-only, Task 12).
