---
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Restructure the `companies` module's data shape so registration / contact / address / attribute fields move into opt-in section sub-objects instead of being hardcoded at the document root. Consumers wire any combination of shipped field-presets — or their own block arrays — through new `fields.{registration,contact,address,attributes}` slot vars.

**Companies module — breaking shape changes:**

- **Document root**: `trading_name` / `registered_name` / `registration_number` / `vat_number` / `website` removed from the document root. Display name is now `name`; the registration trio plus website / phone / email move under `registration.*` / `address.*` / `contact.*` sub-objects.
- **`name_field` default**: flipped from `trading_name` to `name`. All read-side requests build `display_name` via `$getField` so the rename propagates without per-request edits. Apps whose collections genuinely use a different display field must set `name_field` explicitly.
- **New `fields.X` vars**: `fields.contact`, `fields.address`, `fields.registration` (alongside existing `fields.attributes`). Each defaults to `[]` — apps that don't opt in render an empty section. Block ids inside each array must be prefixed with the section name (`contact.`, `address.`, etc.) so they bind to the matching state subtree.
- **Field-preset library**: `field-presets/{contact-default,address-text,address-places,registration-sa}.yaml` ship under the module. `address-places.yaml` depends on a custom `PlacesAutocomplete` plugin that does not yet exist in this monorepo; consumers wiring it must supply the plugin themselves.
- **Excel export**: fixed columns trimmed to the universal core (`id`, `name`, `description`, `updated_at`, `created_at`). Section columns move through the existing `components.download_columns` slot.

**Migration (data):**

```
trading_name              →  name
registered_name           →  registration.registered_name
registration_number       →  registration.registration_number
vat_number                →  registration.vat_number
website                   →  contact.website
contact.primary_email     →  contact.primary_email   (unchanged)
contact.primary_phone     →  contact.primary_phone   (unchanged)
address.* (already nested)→  address.*               (unchanged)
```

Run a one-off migration on the `companies` collection; `update-company`'s `$set` does not unset the legacy keys, so old fields will coexist with the new shape until explicitly removed.

**Migration (apps wiring the module):**

Add `fields.{contact,address,registration}` to your module-entry `vars` to opt into the sections. Either `_ref` the shipped presets or supply your own block arrays:

```yaml
fields:
  contact:
    _ref: ../../modules/companies/field-presets/contact-default.yaml
  address:
    _ref: ../../modules/companies/field-presets/address-text.yaml
  registration:
    _ref: ../../modules/companies/field-presets/registration-sa.yaml
```

`_ref` paths resolve from the consuming app's config root.

**Contacts module:**

`get_contact_companies` now projects `name` + `company_id` instead of the legacy `trading_name`. The contact view's linked-companies tile renders the new shape. Apps that rely on the old projection must update any custom consumers reading from this request.

**Plugins (SmartDescriptions):**

The `company` field-type detector signature changes from `"trading_name" in value` to `("name" in value && "company_id" in value)`, and the renderer reads `value.name` instead of `value.trading_name`. Any custom value shape that used to match on `trading_name` alone will now fall through to default rendering — pass `company_id` (or use the updated `get_contact_companies` projection) to keep the company link + icon.
