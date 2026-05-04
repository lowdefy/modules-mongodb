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
4. **Whole-payload writes**: `create-company` and `update-company` stop enumerating fields. Sections save as whole sub-objects — literal insert for create, `$mergeObjects` per section for update. Adding a field becomes a one-line block change with no API edits.
5. **Places autocomplete is optional**: the autocomplete preset depends on a custom `PlacesAutocomplete` block plugin (to be implemented either inside this monorepo's `plugins/` directory or supplied by the consuming app) plus a Google API key. Apps that don't want it use the text preset or roll their own.

## Key decisions and rationale

### Universal core: `name` + `description`, nothing else

Renaming `trading_name` → `name` removes the SA-flavor at the field level. The display label defaults to `"{label} Name"` (where `label` defaults to "Company"), so the user-facing text stays "Company Name" out of the box. SA apps that want "Trading Name" override `label`. This is the "generic field names + regional labels" pattern you asked about.

`description` is genuinely universal and stays.

`name_field` var (used by selectors and event titles) defaults to `name` instead of `trading_name`.

**Why not keep `trading_name` and add a label override?** Because the field key leaks into MongoDB documents, queries, downstream apps, and migration scripts forever. The label is cosmetic; the key is permanent. Generic key + regional label is the cheaper long-term position.

### Sections default to empty, not to current SA defaults

`fields.registration: []`, `fields.contact: []`, `fields.address: []`, `fields.attributes: []` — all empty.

This makes the module work for any country out of the box: a brand new company app gets just `name` + `description` + the `Contacts` linker, with no fields the consumer didn't ask for. Anything more is opt-in via `_ref` to a preset or a custom block file.

The demo app's module-entry vars (`apps/demo/modules/companies/vars.yaml`, `_ref`'d from `apps/demo/modules.yaml`) will need to wire up the SA presets explicitly. That's fine — the demo is meant to _show_ configuration, not hide it.

**Alternative considered:** default `fields.contact` and `fields.address` to non-empty (since "every company has email and an address"), and only default `fields.registration` to empty. Rejected because (a) it's inconsistent — three slots with the same shape, two of which silently ship content — and (b) "contact" and "address" still vary by region (PhoneNumberInput formatting, address structure), so even the "universal" defaults aren't truly universal. Better to make the rule simple: all sections opt-in.

### Whole-payload writes

`create-company` and `update-company` stop hand-mapping each field. Each section becomes a sub-object on the document, and the API writes the whole payload section. The two APIs use different syntax because one is a literal insert and the other is a pipeline update.

**`create-company` (`MongoDBInsertConsecutiveId.doc`)** — literal insert. Each section is set from the payload, defaulting to `{}` so the form can omit a section without breaking the insert. The existing `contact` / `address` / `attributes` blocks already use this; add `registration` to match:

```yaml
doc:
  name:
    _payload: name
  description:
    _payload: description
  contact:
    _if_none:
      - _payload: contact
      - {}
  address:
    _if_none:
      - _payload: address
      - {}
  registration:
    _if_none:
      - _payload: registration
      - {}
  attributes:
    _if_none:
      - _payload: attributes
      - {}
  lowercase_email:
    _string.toLowerCase:
      _string.trim:
        _if_none:
          - _payload: contact.primary_email
          - ""
  removed: null
  created: { _ref: { module: events, component: change_stamp } }
  updated: { _ref: { module: events, component: change_stamp } }
```

`MongoDBInsertConsecutiveId` doesn't support pipeline-update syntax, so `$mergeObjects` doesn't apply here. Inserts have nothing to merge with.

**`update-company` (`MongoDBUpdateOne` pipeline)** — pipeline update. Each section is merged with `$mergeObjects` against the existing sub-object. The existing pipeline already does this for `contact` / `address` / `attributes`; add `registration` to match, and switch the previously-flat `name` / `description` / `registered_name` / `registration_number` / `vat_number` / `website` writes to the new shape:

```yaml
update:
  - $set:
      name: { _payload: name }
      description: { _payload: description }
      contact:
        $mergeObjects:
          - { $ifNull: ["$$ROOT.contact", {}] }
          - { _payload: contact }
      address:
        $mergeObjects:
          - { $ifNull: ["$$ROOT.address", {}] }
          - { _payload: address }
      registration:
        $mergeObjects:
          - { $ifNull: ["$$ROOT.registration", {}] }
          - { _payload: registration }
      attributes:
        $mergeObjects:
          - { $ifNull: ["$$ROOT.attributes", {}] }
          - { _payload: attributes }
      updated: { _ref: { module: events, component: change_stamp } }
  - $set:
      lowercase_email:
        $toLower:
          $trim:
            input:
              $ifNull: ["$contact.primary_email", ""]
```

Adding a field to `fields.contact` no longer requires touching either API.

**Why `$mergeObjects` (not `$set`-replace) on the section:** to preserve `contact.*` (and `address.*`, `registration.*`, `attributes.*`) keys that aren't represented in the current form — either fields written by a separate flow, or fields a future form revision will add. `$set: { contact: _payload: contact }` would replace the whole sub-object and drop those keys.

**`lowercase_email`** is a denormalized search-index field at the document root (used by Atlas Search in `get_all_companies` and `get_company_excel_data` — see `requests/get_all_companies.yaml:38,48`). It's not inside any section, so it's not preserved by `$mergeObjects` on `contact` — it survives because the update doesn't touch unlisted root keys, and is recomputed from the merged `contact.primary_email` in pipeline stage 2 so it reflects the post-merge value.

### Registration moves under `registration.*`

Today `registered_name`, `registration_number`, `vat_number` sit flat at the document root. If we keep them flat, an app that overrides `fields.registration` with a different field set has to know which root keys "belong to" the registration section. By namespacing the section under `registration.*`, all registration data is contained in one sub-object that the API merges as a unit. This matches how `contact.*`, `address.*`, `attributes.*` already work.

**Cost:** schema change. No real consumers, so cheap.

### Address: drop the unused `.registered` nesting

Current shape: `address.registered.formatted_address`, `address.registered.extra`.

The `.registered` level implies a multi-address model (registered vs postal vs billing) that the module never wires up. Drop it: `address.formatted_address`, `address.extra`.

If a future app needs multiple addresses, it can either (a) add a second top-level field like `postal_address`, or (b) put extra addresses inside `attributes.*`. We don't pre-build that.

Field key is `address` (not `business_address`). Shorter, matches the field structure (`address.formatted_address`). If a future app needs additional address types, they live as siblings (`postal_address`, `billing_address`) at the document root rather than under a deeper nesting.

### Optional places-autocomplete preset

For the address section we ship two presets:

- `field-presets/address-text.yaml` — plain `TextInput` for `formatted_address` + `TextInput` for `extra`. Zero dependencies.
- `field-presets/address-places.yaml` — `PlacesAutocomplete` block (custom plugin — see below) wired to write `formatted_address`, plus `TextInput` for `extra`.

The autocomplete preset depends on:

1. A custom `PlacesAutocomplete` block plugin. There is no Lowdefy core plugin that provides this; it must be implemented either in this monorepo's `plugins/` directory (e.g. as a new package or as a block inside `modules-mongodb-plugins`) or be supplied by the consuming app.
2. The consuming app providing a Google API key (env var) and rendering a `GoogleAPIProvider` block somewhere on the page tree.

Apps using `address-places.yaml` need to add the `GoogleAPIProvider` to their layout module (or directly on the relevant pages). The companies module does **not** auto-render it — the provider is page-level scaffolding, not a field.

**Why not embed `GoogleAPIProvider` in the address preset itself?** Because there can only be one provider per page, and the provider needs the API key. A preset that includes the provider would force every page using the preset to re-supply the API key and would conflict with other pages that have their own provider.

This work is partially blocked on the plugin existing. The slot itself (`fields.address` accepting any block array) is not blocked — apps can wire any places-autocomplete block they have today into the slot, and the shipped `address-places.yaml` preset lands once a canonical plugin is available.

### Section structure (form and view)

Both pages render one logical block per section, and each section is gated on its `fields.*` array being non-empty. The form already does this for `attributes` via a divider; the design extends the same pattern to `registration` / `contact` / `address`, and mirrors it in the view.

**Form (`components/form_company.yaml`)** — section dividers with hardcoded titles ("Registration", "Contact Details", "Address", "Additional Details"). Each divider + its field array is wrapped in `_build.if(_build.array.length(fields.X) > 0)` so a section that the consumer didn't wire up disappears entirely. Section titles stay hardcoded — opinionated is fine; can add vars later if a real need shows up.

**View (`components/view_company.yaml`)** — one `SmartDescriptions` per section instead of today's single big one + a separate attributes block. Each section's `data:` is the full `get_company.0` (dot-notation field IDs like `registration.vat_number` resolve into it directly — no per-section data wrapping needed), and each has a `visible:` gate matching the form:

```yaml
- id: view_core
  type: SmartDescriptions
  properties:
    column: 1
    size: small
    data: { _request: get_company.0 }
    fields: { _ref: components/fields/core.yaml }
- id: view_registration
  type: SmartDescriptions
  visible:
    _build.gt:
      - _build.array.length: { _module.var: fields.registration }
      - 0
  properties:
    title: Registration
    column: 1
    size: small
    data: { _request: get_company.0 }
    fields: { _module.var: fields.registration }
# …same shape for view_contact, view_address, view_attributes
```

This keeps the form and view in lockstep: configure a section once via `fields.X`, both surfaces show or hide together.

### Excel download keeps only universal-core columns

`excel_download.yaml` currently hard-codes columns for every standard field: `registered_name`, `registration_number`, `vat_number`, `website`, `email` (`contact.primary_email`), `phone` (`contact.primary_phone`). After this design those keys all live inside opt-in sections, so the fixed-column list collapses to the same universal-core surface as the rest of the design: `id`, `name` (the existing `display_name` alias), `description`, `updated_at`, `created_at`.

Apps that want any registration / contact / address / attribute columns add them through the existing `components.download_columns` slot. This is consistent with the "all sections opt-in" stance — the export shouldn't ship section-specific columns the consumer didn't ask for.

## Configuration shape

### Module manifest vars (companies/module.lowdefy.yaml)

```yaml
vars:
  collection: { default: companies }
  label: { default: Company }
  label_plural: { default: Companies }
  name_field: { default: name } # was: trading_name
  id_prefix: { default: "C-" }
  id_length: { default: 4 }
  event_display: { default: { _ref: defaults/event_display.yaml } }

  fields:
    type: object
    properties:
      contact: { default: [] }
      address: { default: [] }
      registration: { default: [] }
      attributes: { default: [] } # already present

  components:
    type: object
    properties:
      table_columns: { default: [] }
      filters: { default: [] }
      main_slots: { default: [] }
      sidebar_slots: { default: [] }
      download_columns: { default: [] }
      contact_card_extra_fields: { default: [] }

  request_stages:
    type: object
    properties:
      filter_match: { default: [] }
      get_all_companies: { default: [{ $addFields: {} }] }
      selector: { default: [] }
      write: { default: [] }

  filter_requests: { default: [] }
```

### App config example: SA-flavored demo

```yaml
# apps/demo/modules.yaml
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
├── address-places.yaml       # PlacesAutocomplete + address.extra (depends on a custom plugin)
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
# field-presets/address-places.yaml (depends on a custom PlacesAutocomplete plugin)
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

Note that `contact.website` is namespaced under `contact.*` rather than left at the root (current state has `website` flat). Same rationale as registration: keep a section's fields contained. The derived `lowercase_email` index field reads from `contact.primary_email` and stays at the document root.

`PhoneNumberInput` is a native Lowdefy block — no plugin dependency added to the module for the contact preset.

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

| File                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.lowdefy.yaml`                 | Add `fields.contact`, `fields.address`, `fields.registration`. Change `name_field` default to `name`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `components/fields/core.yaml`         | Rename `trading_name` block to `name` (label `"{label} Name"` stays). `description` block unchanged. Only file remaining under `components/fields/` after this design.                                                                                                                                                                                                                                                                                                                                                |
| `components/fields/registration.yaml` | Delete. Content moves to `field-presets/registration-sa.yaml` with `registration.*` prefix.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `components/fields/contact.yaml`      | Delete. Content moves to `field-presets/contact-default.yaml` with `contact.*` prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `components/fields/address.yaml`      | Delete. Content moves to `field-presets/address-text.yaml` with `address.*` prefix (no `.registered` nesting).                                                                                                                                                                                                                                                                                                                                                                                                        |
| `components/form_company.yaml`        | Render core + four conditional sections (registration, contact, address, attributes), each with divider gated on non-empty.                                                                                                                                                                                                                                                                                                                                                                                           |
| `components/view_company.yaml`        | Replace today's single SmartDescriptions + separate attributes block with one SmartDescriptions per section (`view_core`, `view_registration`, `view_contact`, `view_address`, `view_attributes`). Each non-core section gets a `title`, a `visible:` gate on `_build.array.length(fields.X) > 0`, and `data: { _request: get_company.0 }`. See "Section structure (form and view)".                                                                                                                                  |
| `api/create-company.yaml`             | Literal `MongoDBInsertConsecutiveId.doc`: replace flat `trading_name`/`registered_name`/`registration_number`/`vat_number`/`website` keys with `name`, plus `registration: _if_none: [_payload: registration, {}]` alongside the existing `contact`/`address`/`attributes` `_if_none` blocks. `lowercase_email` is still computed inline at insert time from `_payload: contact.primary_email`. (Insert, not pipeline — `$mergeObjects` doesn't apply here.)                                                          |
| `api/update-company.yaml`             | `MongoDBUpdateOne` pipeline: rename stage-1 `trading_name` → `name`, drop the flat `registered_name`/`registration_number`/`vat_number`/`website` `$set`s, add `registration: $mergeObjects [$ifNull: $$ROOT.registration, _payload: registration]` alongside the existing `contact`/`address`/`attributes` merges. Stage-2 derived `lowercase_email` already reads from `$contact.primary_email` — unchanged.                                                                                                        |
| `components/excel_download.yaml`      | Strip **all** section-specific fixed columns (`registered_name`, `registration_number`, `vat_number`, `website`, `email`/`contact.primary_email`, `phone`/`contact.primary_phone`). Keep only `id`, `name` (uses the `display_name` alias), `description`, `updated_at`, `created_at`. Apps add registration/contact/address/attribute columns via `components.download_columns`.                                                                                                                                     |
| `pages/edit.yaml`                     | `onMount` `SetState`: collapse flat field reads into `name` + per-section reads (`contact: _request: get_company.0.contact`, `address: _request: get_company.0.address`, `registration: _request: get_company.0.registration`, plus existing `attributes`). `update-company` `CallAPI` payload: send `name`, `description`, `contact`, `address`, `registration`, `attributes` as section sub-objects (replacing today's flat `trading_name`/`registered_name`/`registration_number`/`vat_number`/`website` mapping). |
| `pages/new.yaml`                      | `create-company` `CallAPI` payload: same collapse as `edit.yaml`. `onInit` `SetState`: add `registration: {}` alongside `contact: {}`, `address: {}`, `attributes: {}`.                                                                                                                                                                                                                                                                                                                                               |
| `pages/view.yaml`                     | `onInit` `SetState`: add `registration: {}` alongside `contact: {}`, `address: {}`, `attributes: {}` for symmetry with the new section.                                                                                                                                                                                                                                                                                                                                                                               |
| `components/table_companies.yaml`     | No direct change. Table column already uses the `display_name` alias derived in `get_all_companies` via `$getField` on `name_field`; flipping the `name_field` default carries the rename through automatically.                                                                                                                                                                                                                                                                                                      |
| `components/filter_companies.yaml`    | No direct change. Search path is built from `name_field` in `get_all_companies`, so the default search automatically targets `name` once `name_field` flips. `lowercase_email` is already in the search path.                                                                                                                                                                                                                                                                                                         |
| `components/company-selector.yaml`    | Display field reads from `_module.var: name_field` (already does — just needs default change).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `components/tile_contacts.yaml`       | Audit references to `trading_name`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `requests/get_*.yaml`                 | No direct change. Search paths, sort, and the `display_name` projection all read `_module.var: name_field`, so the `name_field` default flip carries through automatically.                                                                                                                                                                                                                                                                                                                                           |
| `field-presets/contact-default.yaml`  | New.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `field-presets/address-text.yaml`     | New.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `field-presets/address-places.yaml`   | New (depends on a custom `PlacesAutocomplete` plugin — see Plugin work below).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `field-presets/registration-sa.yaml`  | New.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `README.md`                           | Rewrite the fields/sections section. Also update the line that points readers at `apps/demo/modules/companies/index.yaml` (now removed) — point at `apps/demo/modules/companies/vars.yaml` instead, or drop the pointer if it was only there for connection-remap docs and `vars.yaml` doesn't demonstrate that.                                                                                                                                                                                                      |

### Demo app (`apps/demo/`)

| File                           | Change                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/companies/vars.yaml`  | Wire `fields.contact`, `fields.address`, `fields.registration` to the shipped SA presets. Update any `trading_name` references. (`vars.yaml` is what `apps/demo/modules.yaml` actually `_ref`s.)                                                                                                                                                    |
| `modules/companies/index.yaml` | Delete. Stale snapshot of var defaults from before `vars.yaml` existed; nothing in the build references it.                                                                                                                                                                                                                                         |
| any seed data                  | Drop and reseed the demo `companies` collection with sample docs in the new shape (root-level `name`, sections under `contact.*`/`address.*`/`registration.*`/`attributes.*`). In-place migration via `update-company` would leave the legacy `address.registered` sub-object behind because `$mergeObjects` is shallow — reseeding sidesteps that. |

### Plugin work (parallel, not in this design's scope)

A canonical `PlacesAutocomplete` block plugin needs to exist before `address-places.yaml` is functional. Two options for where it lives:

- A new block inside `plugins/modules-mongodb-plugins/`, alongside `ContactSelector`, `EventsTimeline`, etc.
- A separate plugin package in this monorepo's `plugins/` directory.

Either is fine; the choice doesn't affect this design. Until the plugin lands, apps that need autocomplete can either supply their own implementation in the slot or stick with `address-text.yaml`.

## Non-goals

- **Multi-address support** (registered vs postal vs billing). If needed later, add a second top-level field or use `attributes`.
- **Region selector** (e.g. `vars.region: sa | us | uk`). Adds an indirection for what is already a one-line `_ref`. Skip.
- **Field-level toggles** (e.g. `show_vat: false`). Sections are arrays — to omit a field, don't include it. No toggle layer needed.
- **Migration scripts.** No real consumers. Demo app gets rewritten in the same PR.
- **Custom validators per region.** Validation lives on the field block (`validate:` property). Apps choose validators when they pick or write the preset.
- **Section reordering.** Order is fixed: core → registration → contact → address → attributes → contacts linker. If apps need a different order, that's a future design.

## Resolved decisions

- **Address field key: `address`.** Sibling root fields (`postal_address`, `billing_address`) cover any future multi-address need.
- **`contact.*` nesting confirmed.** `website`, `primary_email`, `primary_phone` all live under `contact.*`. Derived `lowercase_email` at the document root reads from `contact.primary_email`.
- **`PhoneNumberInput` is a native Lowdefy block.** No plugin entry needed in `module.lowdefy.yaml` for the contact preset.
- **No `show` toggles.** Apps that don't want a field omit it from the relevant `fields.*` array. `description` is the one universal-core exception and stays.
- **Default table stays as today: ID, Name (`display_name` derived from `name_field`), Description, then the `components.table_columns` slot, then Updated At / Created At.** No registration columns are shipped by default — they were already not in the default table. Apps add per-section columns via `components.table_columns`.

## Next steps

1. Run `/r:design-review company-fields`.
2. Break into tasks: core rename, section split, write API, presets, demo wiring, places-autocomplete plugin (separate track).
