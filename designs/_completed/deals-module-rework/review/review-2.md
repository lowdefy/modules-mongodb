# Review 2

Scoped to **Workstream D** (generic create form + host-supplied domain fields), added since review-1. A–C findings are all annotated resolved in review-1 and not revisited. Verified D's hardcode audit against the module source on `feat/deals-module`.

The strategy is right — the module should ship only universal deal fields and let hosts inject domain fields the way `companies` does. But D's audit (design lines 187–192) is materially inaccurate about the **detail/read side**: several surfaces it lists as "module-baked" are already var-driven, and two genuinely-baked surfaces are missing. The create/write side of the audit is accurate. The net effect is that D's blast radius is mis-estimated — smaller on the view, larger and differently-shaped on `product` and on the create form.

## Audit accuracy (Workstream D)

### 1. The detail view is already generic — `section_company` does not hardcode `sector`, and `get_selected_deal` projects nothing

> **Resolved.** Audit corrected: `section_company` (Name + `company_fields` var) and `get_selected_deal` (whole-doc read, no `$project`) are already generic; only `product` in `view.yaml` is baked. Per the user's point, D's detail-view obligation is reframed from a strip to the **create→display round trip** — a field declared as host create-config must render on the view as host display-config (data path already exists via whole-doc read + the display slots; demo must wire both ends). Single-var-vs-two-vars declaration deferred to #4.

D (line 189) claims "`components/detail/section_company.yaml` hardcodes the **sector** row" and (line 190) that "`get_selected_deal.yaml` project domain fields." Both are false against the source:

- `section_company.yaml:34-45` renders exactly two things: the company **Name**, and `_module.var: company_fields` (default `[]`). Sector is not baked — it appears on the deal view *only because the demo passes it through the `company_fields` var*. The inline comment (`:43`) even names "sector/sub-sector/size" as *examples of app-injected fields*. This is already the target state.
- `get_selected_deal.yaml` uses `$addFields`/`$unset`/`$lookup` and **no restrictive `$project`** on the deal document (`:116-134`) — so `attributes.*` already flow through wholesale. The detail read is already attribute-generic.

This inverts D's premise ("the view shows them only because the module bakes them in") for everything except `product`. The detail-view portion of D reduces to removing the `product` bits from `view.yaml` (below); there is no sector row to remove and no `get_selected_deal` projection to change. **Fix:** correct the audit — mark section_company and get_selected_deal as already-generic, and drop them from the "must move" list.

### 2. `product` is special-cased and its real surface is under-counted (misses `deal_list_card`, over-counts the options request)

> **Resolved.** Audit gains a dedicated `product` row: stored top-level (`deal.product`, not `attributes.product`), owns the `products` var + `view.yaml` header lookup, renders on `deal_list_card.yaml` (was missing). Handled as a normal domain field — routed to `attributes.product`; module drops the top-level field, `products` var, header `product_name` derivation, and list-card product render; header subtitle degrades to description-only. List row corrected (`get_deals_list_options` is already generic — options come from the `filters` var).

D folds `product` into the generic-`attributes` passthrough, but `product` is not stored or rendered like the other domain fields:

- **It is a top-level `deal.product` field, not an `attributes.*` key** — `create-deal.yaml:33-34` writes `product` at the document root (unlike `material_code`/`sector`/etc. under `attributes`, `:35-55`). A generic `form.attributes.*` passthrough (design line 196) would *not* capture it. Either the host moves `product` under `attributes`, or the write keeps a top-level passthrough — the design must say which.
- **It has its own `products` var** driving a label lookup in `view.yaml:523-535` (pipeline header) — so `product` display is coupled to a var the manifest section (line 192) does list for removal, but the *rendering* coupling in `view.yaml` needs the var kept or the header simplified.
- **`deal_list_card.yaml:48,61,71` renders `product` on the list card** — this surface is **absent from D's audit entirely**. It must be in the strip.
- **`get_deals_list_options.yaml` does NOT filter/project `product`** — contrary to D line 190. Its own comment (`:6-8`) states stage/product options come from the app-level `filters` var, not this request. So the options request is already generic; only `get_deals_list.yaml` (`filter.product` `:80,86`; `product: 1` `:193-194`) and `get_active_deals.yaml` (`:83-84`) carry the real `product` coupling.

**Fix:** give `product` its own audit row covering the top-level storage decision, the `products`-var display coupling in `view.yaml`, and `deal_list_card.yaml`; correct the get_deals_list_options claim.

### 3. The `package` field is domain-specific but omitted from the audit

> **Resolved.** `package` added to the strip list across the Problem statement, create-form audit row, and write audit row — moves to a host create-field like the rest. Also flagged as consumer-specific.

`form.package` (`new.yaml:236-252` — a concrete packaging size/unit taxonomy) and its write `attributes.package` (`create-deal.yaml:44-45`) are as domain-specific as `material_code` — a services or software deal has no packaging. It is not in D's six-field list (design line 188). Either add `package` to the strip (move to a host `create_fields` block) or state explicitly why it stays. As a bonus, those concrete packaging values are exactly the consumer-specific content that should not live in the public repo.

## API shape (Workstream D)

### 4. `create_fields` diverges from the `companies` `fields` precedent it cites — hosts would declare domain fields twice

> **Resolved.** Dropped the two-var `create_fields` approach for the **suite-standard single `fields` var + SmartDescriptions** pattern. Survey confirmed it's the convention across five modules (companies, contacts, activities, user-account, user-admin) — one `fields` object rendered as inputs on the form and read-only on the view via SmartDescriptions; deals was the lone outlier. Approach section rewritten (manifest/create/view/write/list/demo); host declares each domain field once. Existing `company_fields`/`meta_fields`/`info_grid_slots` retained for display-only extras (computed rows, richer tiles).

D cites companies' `fields.attributes` as the model (line 185) but then (a) invents a *different* var name, `create_fields`, and (b) splits create vs display: fields injected via `create_fields` for the form, re-declared via the existing `company_fields`/`meta_fields`/`info_grid_slots` for display (lines 195-197). In `companies`, one `fields` object (sub-slots `contact`/`address`/`registration`/`attributes`, `module.lowdefy.yaml:92-121`) renders in **both** the edit form and the view — a single declaration, two render sites. Deals has no edit page (exports are `all`/`view`/`new` only), so the create form is the only write form, but the same DRY principle applies: under D as written, a host supplies "Sector" as a form block in `create_fields` **and again** as a display block in `company_fields`. Consider a single `fields`-style object var whose blocks render in both `new.yaml` and the detail view (matching companies), or at minimum reconcile the naming (`create_fields` vs `fields`) so the two modules read consistently. This is the core API-shape decision for D and should be settled before tasks.

## Minor

### 5. D's read-side open question is already answerable from the source

> **Resolved.** Open question replaced with a decision: generic projection stays module-owned — `get_selected_deal` unchanged (whole-doc read), `get_deals_list` swaps `product: 1` for `attributes: 1`; `request_stages` remains available but unneeded for the common case.

The open question (line 204 — "a single generic `attributes` projection in `get_selected_deal`/`get_deals_list` vs. host-appended `request_stages`") is resolvable now, given finding #1: `get_selected_deal` has no restrictive projection, so it needs **no change** (attributes already flow); `get_deals_list` uses an inclusive `$project` inside its `$facet` (`:193`) where removing `product: 1` and adding `attributes: 1` is a one-line, module-owned change — no host `request_stages` needed for the common case. Recommend resolving this in D's design rather than deferring it to implementation.

### 6. `prefill_deal_name` fallback and `form.name required` need a concrete default

> **Resolved.** Module default pinned: prefill `form.name` from the company on company selection; `form.name` stays required + user-editable; richer prefill owned by the host's `fields` block `onChange`.
>
> **Revised at implementation (task 11):** the shared company-selector has no `onChange` hook (adding one is a cross-module change, out of scope for D), so "prefill on company select" is unreachable. Module ships **no auto-prefill** — `form.name` is a plain required field; any prefill is host-owned via its `fields` block `onChange`.

D says prefill "becomes company-only or host-owned" (line 196) — vague. `form.name` is `required` (`new.yaml:143`) and today's prefill derives the name from product/material (`prefill_deal_name.yaml:16-22`). After stripping product/material, pick the module default: company-name-only prefill (keeping `form.name` required and user-editable) is the natural choice, with any product-in-name behaviour owned by the host's `create_fields` block. State it so the implementer doesn't guess.
