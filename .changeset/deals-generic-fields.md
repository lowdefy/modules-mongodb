---
"@lowdefy/modules-mongodb-deals": minor
---

Generalize the deals create/display surface: the module no longer bakes in
domain-specific fields (material/SKU, product, sector, sub-sector,
customer-type, project-type, packaging) or their taxonomy vars. Hosts now
inject their own domain fields through a single `fields` var — rendered as
inputs on the create form and read-only on the deal view via
`SmartDescriptions`, matching how `companies.fields.attributes` works. The
create-deal API writes a generic `attributes` passthrough, and `product`
(previously a top-level field with its own `products` var and list/header
rendering) becomes a plain `attributes.product` host field.

**Breaking (config):** consumers must move their domain fields to the new
`fields` var and drop the removed `products`/`product_hierarchy`/`sectors`/
`sub_sectors`/`customer_types` vars. Existing deals keep their stored
`attributes.*` — the generic passthrough and read side render whatever is
there. `form.name` no longer auto-prefills (the shared company-selector has
no onChange hook); hosts own any prefill via a `fields` block `onChange`.
