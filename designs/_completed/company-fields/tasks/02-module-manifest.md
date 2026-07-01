# Task 2: Update module manifest

## Context

The companies module manifest at `modules/companies/module.lowdefy.yaml` declares the consumer-facing API: vars, dependencies, plugins. It already has `fields.attributes` (for the existing extras slot) and a `name_field` var defaulting to `trading_name`. This design adds three more `fields.X` slots and flips `name_field` to a generic default.

Today (`module.lowdefy.yaml:22-44`):

```yaml
name_field:
  default: trading_name
fields:
  type: object
  properties:
    attributes:
      default: []
```

The new schema lives under root-level `name`, with sections under `contact.*`/`address.*`/`registration.*`/`attributes.*`. Selectors and event titles read whichever field `name_field` points at via `$getField` (`requests/get_company.yaml:18-19`, `requests/get_all_companies.yaml:60-66`), so flipping the default is the entire change for read-side wiring — no request edits needed.

## Task

Edit `modules/companies/module.lowdefy.yaml`:

1. **Flip `name_field` default** from `trading_name` to `name`:

   ```yaml
   name_field:
     default: name
     description: Field used as the display name in selectors and titles
   ```

2. **Add three new `fields.X` properties** alongside the existing `attributes`:

   ```yaml
   fields:
     type: object
     description: "Field block arrays rendered in both the edit form and SmartDescriptions view."
     properties:
       contact:
         default: []
         description: >-
           Field blocks for the contact section. Block ids must be prefixed with
           `contact.` so they bind to `state.contact.*`. Apps typically `_ref`
           `field-presets/contact-default.yaml` or supply their own array.
       address:
         default: []
         description: >-
           Field blocks for the address section. Block ids must be prefixed with
           `address.` so they bind to `state.address.*`. Apps typically `_ref`
           `field-presets/address-text.yaml` (zero-dep) or `field-presets/address-places.yaml`
           (depends on a custom PlacesAutocomplete plugin).
       registration:
         default: []
         description: >-
           Field blocks for the registration section. Block ids must be prefixed
           with `registration.` so they bind to `state.registration.*`. Apps
           typically `_ref` a region-specific preset such as
           `field-presets/registration-sa.yaml`.
       attributes:
         default: []
         description: >-
           Custom field blocks appended after the built-in company sections in
           the edit form and view page. Block ids must be prefixed with
           `attributes.` so they bind to `state.attributes.*`.
   ```

3. **Do not add a `plugins:` entry** for `PlacesAutocomplete`. The plugin doesn't exist yet, and `PhoneNumberInput` is a Lowdefy native block — neither needs adding.

Leave the rest of the manifest (`components`, `request_stages`, `connections`, `pages`, `plugins`, etc.) untouched.

## Acceptance Criteria

- `name_field.default` is `name`.
- `fields.properties` has four entries: `contact`, `address`, `registration`, `attributes`, each with `default: []` and a `description`.
- Manifest descriptions match the wording in this task (consumers see them in tooling and the README).
- `pnpm ldf:b:i` for the demo app still succeeds. The demo's table will visibly show empty name cells for the existing seeded companies (because `$getField: name` returns `null` on documents that still have `trading_name`); that's expected — the demo gets reseeded in task 6. No production consumers exist (per design Non-goals).
- No `plugins:` entry added for `PlacesAutocomplete`.

## Files

- `modules/companies/module.lowdefy.yaml` — modify (vars block only)

## Notes

This task lands cleanly without task 3, but the demo's tables and selectors will show empty names for existing seeded docs until task 6 reseeds them. If you're testing locally, expect that gap.
