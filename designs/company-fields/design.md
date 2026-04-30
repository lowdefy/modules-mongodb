# Company Fields

## Problem

The `companies` module ships a hardcoded set of fields that bake in a South African / Commonwealth view of what a company record looks like:

- `trading_name` — SA/UK/AU term; US says "Business Name" or "DBA"
- `registered_name`, `registration_number`, `vat_number` — region-specific identifiers (SA has VAT, US has EIN, UK has Companies House numbers, India has GSTIN/CIN, etc.)
- `address.registered.formatted_address` — uses "registered address" framing and a nested key from a multi-address model the module never actually uses

These fields are referenced from five places in the module:

- `components/fields/core.yaml`, `registration.yaml`, `contact.yaml`, `address.yaml` (form blocks)
- `components/form_company.yaml`, `view_company.yaml` (composition)
- `api/create-company.yaml`, `api/update-company.yaml` (per-field `$set`)
- `components/excel_download.yaml` (column list)

A consumer in another country who wants to remove `vat_number`, replace `registration_number` with EIN, or swap "Trading Name" for "Business Name" has to fork the module — there is no extension point for the standard sections. The only configurable slot today is `fields.attributes`, which appends an "Additional Details" section after the four hardcoded sections.

The `module-field-pattern` design (`designs/module-field-pattern/design.md`) already established the right shape for this — `fields.*` arrays + whole-payload `$mergeObjects` in the API — for `user-admin`, `user-account`, and `contacts`. Companies adopted only the extras-slot half. This design extends the pattern to companies' standard sections and removes the region-specific defaults.

## Solution at a glance

1. **Universal core**: `name`, `description` only. Hardcoded by the module. Label is configurable via the existing `label` var; section dividers stay opinionated.
2. **Configurable sections**: `fields.contact`, `fields.address`, `fields.registration`, `fields.attributes` — each defaults to `[]`. Section divider renders only when the section is non-empty.
3. **Shipped presets**: `field-presets/contact-default.yaml`, `field-presets/address-text.yaml`, `field-presets/address-places.yaml`, `field-presets/registration-sa.yaml`. Apps `_ref` what they want. The module itself ships nothing wired up.
4. **Whole-payload writes**: `create-company` and `update-company` stop enumerating fields. Each section saves as a sub-object via `$mergeObjects`. Adding a field becomes a one-line block change with no API edits.
5. **Places autocomplete is optional**: the autocomplete preset depends on `@lowdefy/plugin-places-autocomplete` (to be upstreamed from `@mrmtech/plugin-places-autocomplete`) and a Google API key. Apps that don't want it use the text preset or roll their own.

## Key decisions and rationale

### Universal core: `name` + `description`, nothing else

Renaming `trading_name` → `name` removes the SA-flavor at the field level. The display label defaults to `"{label} Name"` (where `label` defaults to "Company"), so the user-facing text stays "Company Name" out of the box. SA apps that want "Trading Name" override `label`. This is the "generic field names + regional labels" pattern you asked about.

`description` is genuinely universal and stays.

`name_field` var (used by selectors and event titles) defaults to `name` instead of `trading_name`.

**Why not keep `trading_name` and add a label override?** Because the field key leaks into MongoDB documents, queries, downstream apps, and migration scripts forever. The label is cosmetic; the key is permanent. Generic key + regional label is the cheaper long-term position.

### Sections default to empty, not to current SA defaults

`fields.registration: []`, `fields.contact: []`, `fields.address: []`, `fields.attributes: []` — all empty.

This makes the module work for any country out of the box: a brand new company app gets just `name` + `description` + the `Contacts` linker, with no fields the consumer didn't ask for. Anything more is opt-in via `_ref` to a preset or a custom block file.

The demo app's `lowdefy.yaml` will need to wire up the SA presets explicitly. That's fine — the demo is meant to *show* configuration, not hide it.

**Alternative considered:** default `fields.contact` and `fields.address` to non-empty (since "every company has email and an address"), and only default `fields.registration` to empty. Rejected because (a) it's inconsistent — three slots with the same shape, two of which silently ship content — and (b) "contact" and "address" still vary by region (PhoneNumberInput formatting, address structure), so even the "universal" defaults aren't truly universal. Better to make the rule simple: all sections opt-in.

### Whole-payload writes via `$mergeObjects`

`create-company` and `update-company` stop hand-mapping each field. Each section becomes a sub-object on the document, and the API merges the whole payload:

```yaml
update:
  $set:
    name:
      _payload: name
    description:
      _payload: description
    contact:
      $mergeObjects:
        - $ifNull: ["$$ROOT.contact", {}]
        - { _payload: contact }
    address:
      $mergeObjects:
        - $ifNull: ["$$ROOT.address", {}]
        - { _payload: address }
    registration:
      $mergeObjects:
        - $ifNull: ["$$ROOT.registration", {}]
        - { _payload: registration }
    attributes:
      $mergeObjects:
        - $ifNull: ["$$ROOT.attributes", {}]
        - { _payload: attributes }
```

Adding a field to `fields.contact` no longer requires touching the API. This is exactly what `module-field-pattern` did for profile.

`$mergeObjects` (rather than `$set`-replace) preserves keys written outside the form — e.g. a `lowercase_email` derived field, or fields written by a separate flow. Same rationale as profile.

`lowercase_email` stays as a derived field computed in a second pipeline stage that reads from the merged `contact` sub-object.

### Registration moves under `registration.*`

Today `registered_name`, `registration_number`, `vat_number` sit flat at the document root. If we keep them flat, an app that overrides `fields.registration` with a different field set has to know which root keys "belong to" the registration section. By namespacing the section under `registration.*`, all registration data is contained in one sub-object that the API merges as a unit. This matches how `contact.*`, `address.*`, `attributes.*` already work.

**Cost:** schema change. No real consumers, so cheap.

### Address: drop the unused `.registered` nesting

Current shape: `address.registered.formatted_address`, `address.registered.extra`.

The `.registered` level implies a multi-address model (registered vs postal vs billing) that the module never wires up. Drop it: `address.formatted_address`, `address.extra`.

If a future app needs multiple addresses, it can either (a) add a second top-level field like `postal_address`, or (b) put extra addresses inside `attributes.*`. We don't pre-build that.

**Open question:** field key `address` vs `business_address`. See the open questions section.

### Optional places-autocomplete preset

For the address section we ship two presets:

- `field-presets/address-text.yaml` — plain `TextInput` for `formatted_address` + `TextInput` for `extra`. Zero dependencies.
- `field-presets/address-places.yaml` — `PlacesAutocomplete` block from `@lowdefy/plugin-places-autocomplete` (target after upstreaming) wired to write `formatted_address`, plus `TextInput` for `extra`.

The autocomplete preset depends on:
1. The plugin being upstreamed into Lowdefy (currently `@mrmtech/plugin-places-autocomplete` v2.1.6 — see `/Users/sam/Developer/mrm/prp/plugins/plugin-places-autocomplete`).
2. The consuming app providing a Google API key (env var) and rendering a `GoogleAPIProvider` block somewhere on the page tree.

Apps using `address-places.yaml` need to add the `GoogleAPIProvider` to their layout module (or directly on the relevant pages). The companies module does **not** auto-render it — the provider is page-level scaffolding, not a field.

**Why not embed `GoogleAPIProvider` in the address preset itself?** Because there can only be one provider per page, and the provider needs the API key. A preset that includes the provider would force every page using the preset to re-supply the API key and would conflict with other pages that have their own provider.

This work is partially blocked on upstreaming the plugin. The slot itself (`fields.address` accepting any block array) is not blocked — apps can wire their current `@mrmtech/...` plugin into the slot today, and the shipped preset lands once the plugin is upstreamed.

### Section dividers stay hardcoded

Sections render with hardcoded titles ("Registration", "Contact Details", "Address", "Additional Details") via dividers in `form_company.yaml`. Per your call: opinionated is fine, can add vars later if a real need shows up.

Dividers render conditionally — only when the corresponding `fields.*` array is non-empty. This is already the pattern for `fields.attributes` (form_company.yaml:25-39).

### Excel download stops hardcoding registration columns

`excel_download.yaml` currently lists `registered_name`, `registration_number`, `vat_number` as fixed columns. After this design they're not part of the document root anymore. The fixed columns become just `id`, `name`, `description`, `created.timestamp`, `updated.timestamp`. Apps add registration / contact / address / attribute columns via the existing `components.download_columns` var.

## Configuration shape

### Module manifest vars (companies/module.lowdefy.yaml)

```yaml
vars:
  collection: { default: companies }
  label: { default: Company }
  label_plural: { default: Companies }
  name_field: { default: name }            # was: trading_name
  id_prefix: { default: "C-" }
  id_length: { default: 4 }
  event_display: { default: { _ref: defaults/event_display.yaml } }

  fields:
    type: object
    properties:
      contact:        { default: [] }
      address:        { default: [] }
      registration:   { default: [] }
      attributes:     { default: [] }      # already present

  components:
    type: object
    properties:
      table_columns:               { default: [] }
      filters:                     { default: [] }
      main_slots:                  { default: [] }
      sidebar_slots:               { default: [] }
      download_columns:            { default: [] }
      contact_card_extra_fields:   { default: [] }

  request_stages:
    type: object
    properties:
      filter_match:        { default: [] }
      get_all_companies:   { default: [{ $addFields: {} }] }
      selector:            { default: [] }
      write:               { default: [] }

  filter_requests: { default: [] }
```

### App config example: SA-flavored demo

```yaml
# apps/demo/lowdefy.yaml
- id: companies
  source: file:../../modules/companies
  vars:
    label: Company
    fields:
      registration:
        _ref: ../../modules/companies/field-presets/registration-sa.yaml
      contact:
        _ref: ../../modules/companies/field-presets/contact-default.yaml
      address:
        _ref: ../../modules/companies/field-presets/address-text.yaml
      attributes:
        - id: attributes.industry
          type: Selector
          properties:
            title: Industry
            options: [Manufacturing, Services, Retail]
```

### App config example: US-flavored

```yaml
- id: companies
  source: file:../../modules/companies
  vars:
    label: Company
    fields:
      registration:
        - id: registration.legal_name
          type: TextInput
          properties: { title: Legal Name }
        - id: registration.ein
          type: TextInput
          properties: { title: EIN }
        - id: registration.state_of_incorporation
          type: Selector
          properties:
            title: State of Incorporation
            options: [DE, CA, NY, TX, ...]
      contact:
        _ref: ../../modules/companies/field-presets/contact-default.yaml
      address:
        _ref: ../../modules/companies/field-presets/address-places.yaml
```

(Requires the Google API key + `GoogleAPIProvider` wired in the app.)

### App config example: minimal

```yaml
- id: companies
  source: file:../../modules/companies
  vars:
    label: Company
    # all fields.* default to []
    # company doc is just: { _id, id, name, description, attributes: {}, ... }
```

## Shipped presets

```
modules/companies/field-presets/
├── contact-default.yaml      # website, email (with validate), phone
├── address-text.yaml         # address.formatted_address (TextInput), address.extra
├── address-places.yaml       # PlacesAutocomplete + address.extra (depends on plugin)
└── registration-sa.yaml      # registered_name, registration_number, vat_number
                              #   keys namespaced as registration.*
```

Each preset is a plain block array consumable via `_ref`. Examples:

```yaml
# field-presets/contact-default.yaml
- id: contact.website
  type: TextInput
  properties:
    title: Website
    placeholder: "https://..."
- id: contact.primary_email
  type: TextInput
  properties:
    title: Email
    placeholder: "info@company.com"
  validate:
    _ref:
      path: validate/email.yaml
      vars:
        field_name: contact.primary_email
- id: contact.primary_phone
  type: PhoneNumberInput
  properties:
    title: Phone
```

```yaml
# field-presets/registration-sa.yaml
- id: registration.registered_name
  type: TextInput
  properties: { title: Registered Name }
- id: registration.registration_number
  type: TextInput
  properties: { title: Registration Number }
- id: registration.vat_number
  type: TextInput
  properties: { title: VAT Number }
```

```yaml
# field-presets/address-places.yaml (depends on @lowdefy/plugin-places-autocomplete)
- id: address.places
  type: PlacesAutocomplete
  properties:
    apiKey:
      _secret: GOOGLE_PLACES_API_KEY
    fetchFields: [formattedAddress, addressComponents]
    resultMapping:
      formattedAddress: formatted_address
    labelField: formatted_address
  events:
    onChange:
      - id: copy_formatted
        type: SetState
        params:
          address.formatted_address:
            _state: address.places.formatted_address
- id: address.extra
  type: TextInput
  properties:
    title: Building / Unit / Floor
```

(Exact onChange wiring TBD during implementation — the autocomplete value object can be projected directly into `address.*` keys via `resultMapping` instead of a SetState; see plugin readme.)

Note that `contact.website` is namespaced under `contact.*` rather than left at the root (current state has `website` flat). Same rationale as registration: keep a section's fields contained.

## Document shape (after)

```js
{
  _id: ObjectId,
  id: "C-0001",
  name: "Acme Limited",
  description: "...",
  contact: {
    website: "https://acme.com",
    primary_email: "info@acme.com",
    primary_phone: "+27...",
  },
  address: {
    formatted_address: "...",
    extra: "Unit 5",
  },
  registration: {
    registered_name: "Acme Limited",
    registration_number: "12345",
    vat_number: "GB123456789",
  },
  attributes: {
    industry: "Manufacturing",
  },
  lowercase_email: "info@acme.com",   // derived in stage 2
  created: {...},
  updated: {...},
  removed: null,
}
```

All section-scoped fields under their section sub-object. `name`, `description`, derived fields, and metadata at the root. Any section can be empty `{}` (or absent) without breaking other sections.

## Files changed

### Module (`modules/companies/`)

| File                                       | Change                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.lowdefy.yaml`                      | Add `fields.contact`, `fields.address`, `fields.registration`. Change `name_field` default to `name`.                                               |
| `components/fields/core.yaml`              | Replace with `name`, `description` only. Field id is `name`, label is `"{label} Name"`.                                                             |
| `components/fields/registration.yaml`      | Delete. Content moves to `field-presets/registration-sa.yaml` with `registration.*` prefix.                                                         |
| `components/fields/contact.yaml`           | Delete. Content moves to `field-presets/contact-default.yaml` with `contact.*` prefix.                                                              |
| `components/fields/address.yaml`           | Delete. Content moves to `field-presets/address-text.yaml` with `address.*` prefix (no `.registered` nesting).                                      |
| `components/form_company.yaml`             | Render core + four conditional sections (registration, contact, address, attributes), each with divider gated on non-empty.                         |
| `components/view_company.yaml`             | SmartDescriptions reads `fields.*` directly (already does this for `attributes`). Pass each section's data as a sub-object.                         |
| `api/create-company.yaml`                  | Replace per-field `$set` with section-level `$mergeObjects`. `name` instead of `trading_name`.                                                      |
| `api/update-company.yaml`                  | Same: per-section `$mergeObjects`. Stage-2 derived `lowercase_email` reads from merged `contact`.                                                   |
| `components/excel_download.yaml`           | Strip the registration columns from the fixed list. Keep `id`, `name`, `description`, timestamps. Apps add per-section columns via `download_columns`. |
| `components/table_companies.yaml`          | Default columns reference `name` (was `trading_name`).                                                                                              |
| `components/filter_companies.yaml`         | Default name/keyword filter targets `name` and `lowercase_email`.                                                                                   |
| `components/company-selector.yaml`         | Display field reads from `_module.var: name_field` (already does — just needs default change).                                                      |
| `components/tile_contacts.yaml`            | Audit references to `trading_name`.                                                                                                                 |
| `requests/get_*.yaml`                      | Audit projections — switch any `trading_name` references to `name`. Same for selector/match/sort.                                                   |
| `field-presets/contact-default.yaml`       | New.                                                                                                                                                |
| `field-presets/address-text.yaml`          | New.                                                                                                                                                |
| `field-presets/address-places.yaml`        | New (depends on upstreamed plugin).                                                                                                                 |
| `field-presets/registration-sa.yaml`       | New.                                                                                                                                                |
| `README.md`                                | Rewrite the fields/sections section.                                                                                                                |

### Demo app (`apps/demo/`)

| File             | Change                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `lowdefy.yaml`   | Wire `fields.contact`, `fields.address`, `fields.registration` to the shipped SA presets. Update any `trading_name` references. |
| any seed data    | Migrate sample docs to new shape.                                                                                     |

### Plugin upstreaming (parallel work, not in this design's scope)

Move `@mrmtech/plugin-places-autocomplete` into the Lowdefy monorepo as `@lowdefy/plugin-places-autocomplete`. The `address-places.yaml` preset references this final name.

## Non-goals

- **Multi-address support** (registered vs postal vs billing). If needed later, add a second top-level field or use `attributes`.
- **Region selector** (e.g. `vars.region: sa | us | uk`). Adds an indirection for what is already a one-line `_ref`. Skip.
- **Field-level toggles** (e.g. `show_vat: false`). Sections are arrays — to omit a field, don't include it. No toggle layer needed.
- **Migration scripts.** No real consumers. Demo app gets rewritten in the same PR.
- **Custom validators per region.** Validation lives on the field block (`validate:` property). Apps choose validators when they pick or write the preset.
- **Section reordering.** Order is fixed: core → registration → contact → address → attributes → contacts linker. If apps need a different order, that's a future design.

## Open questions

1. **Address field key: `address` or `business_address`?**
   `address` is shorter and matches the field structure (`address.formatted_address`). `business_address` is more semantically explicit and leaves room for a future `postal_address` / `billing_address` at the same nesting level. I lean `address` for simplicity, with the understanding that future address types live as siblings (`postal_address`, `billing_address`) rather than under a deeper nesting.

2. **Should `contact.website` actually live under `contact.*`, or stay at the root as `website`?**
   The current schema has `website` flat. Moving it under `contact.*` is cleaner (whole-section merge), but a website isn't really "contact info" in the same way email/phone are — it's more like a company property. Similarly, primary email is also used for `lowercase_email` indexing. Leaning: keep all three (`website`, `primary_email`, `primary_phone`) under `contact.*` for section coherence, and the derived `lowercase_email` reads from `contact.primary_email`.

3. **`PhoneNumberInput` plugin dependency.** The contact preset uses `PhoneNumberInput`. Is this already a hard dep of the companies module, or only via the contact preset? If the latter, the `plugins:` list in `module.lowdefy.yaml` may need adjustment (or the preset documents its own plugin dependency).

4. **Does any preset need a "show" toggle var?**
   For example, `fields.show_description: false` to hide description for an app that doesn't want it. The pattern exists in `user-account` (`fields.show_honorific`). I'd say no for now — apps that don't want description can ignore the field; it'll just be empty. Hiding the input would need a real use case.

5. **What about list page filters and table columns by default?**
   Today the table shows `trading_name`, `registered_name`, `registration_number`, `vat_number`, etc. After this design, those don't exist by default. Default columns become: `id`, `name`, `description`. Apps add registration / address columns via `components.table_columns`. Confirming this is acceptable — the list page becomes notably sparser out of the box.

## Next steps

1. Review and resolve open questions (especially #1 and #5).
2. Run `/r:design-review company-fields`.
3. Break into tasks: core rename, section split, write API, presets, demo wiring, plugin upstreaming (separate track).
