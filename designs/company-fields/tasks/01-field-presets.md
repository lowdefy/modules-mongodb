# Task 1: Create field-preset files

## Context

The `companies` module ships hard-coded form blocks for `trading_name` / `registered_name` / `registration_number` / `vat_number` / `address.registered.*` / `website` / `contact.primary_email` / `contact.primary_phone` (see `modules/companies/components/fields/`). The new design moves all section-specific fields into opt-in **field presets** that apps `_ref` from their module-entry vars. This task creates the four preset files. **No deletions yet** — the old `components/fields/*.yaml` files stay in place until task 3 rewrites the form/view to stop referencing them.

The presets sit at the **module root**, not inside `components/`, because they're consumer-facing config templates rather than module-internal composition (matches `module-field-pattern`'s shape — see `designs/module-field-pattern/design.md`).

`PhoneNumberInput` is a native Lowdefy block — no plugin entry needed in `module.lowdefy.yaml`.

`PlacesAutocomplete` is **not** a Lowdefy core plugin. The `address-places.yaml` preset is shipped as a placeholder; it won't run until a custom plugin lands either inside `plugins/modules-mongodb-plugins/` or as a separate package in this monorepo. Apps that need autocomplete today supply their own block in the `fields.address` slot. Don't add a `plugins:` entry for it in `module.lowdefy.yaml`.

## Task

Create four files under `modules/companies/field-presets/`:

### `field-presets/contact-default.yaml`

```yaml
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

Note: `_ref: { path: validate/email.yaml }` resolves from the module root (see `MEMORY.md` — "Inside a module, `_ref: { path }` resolves from module root, not the referencing file"), so `modules/companies/validate/email.yaml` is the resolution target. That file already exists.

### `field-presets/address-text.yaml`

```yaml
- id: address.formatted_address
  type: TextInput
  properties:
    title: Address
- id: address.extra
  type: TextInput
  properties:
    title: Building / Unit / Floor
```

### `field-presets/address-places.yaml`

```yaml
# Depends on a custom PlacesAutocomplete block plugin that does not yet exist
# in this monorepo. Until that plugin ships, this preset is a placeholder —
# apps that need autocomplete today should supply their own block in fields.address.
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

The exact `onChange` wiring is TBD (the plugin's `resultMapping` may project directly into `address.*` keys, removing the need for a `SetState`). Treat the above as the documented contract; refine when the plugin actually lands.

### `field-presets/registration-sa.yaml`

```yaml
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

## Acceptance Criteria

- All four files exist at `modules/companies/field-presets/{contact-default,address-text,address-places,registration-sa}.yaml`.
- Each file is a flat YAML block array (no top-level wrapping object).
- Block IDs are namespaced under their section (`contact.*`, `address.*`, `registration.*`).
- `pnpm ldf:b:i` for the demo app still succeeds (no consumer references the new presets yet, so this just confirms the new files don't introduce any YAML/build errors on their own).
- No `plugins:` entry added to `module.lowdefy.yaml` for `PlacesAutocomplete`.

## Files

- `modules/companies/field-presets/contact-default.yaml` — create
- `modules/companies/field-presets/address-text.yaml` — create
- `modules/companies/field-presets/address-places.yaml` — create
- `modules/companies/field-presets/registration-sa.yaml` — create

## Notes

The old `modules/companies/components/fields/{contact,address,registration}.yaml` files are **not** deleted in this task — task 3 deletes them after the form and view stop referencing them.
