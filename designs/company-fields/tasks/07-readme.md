# Task 7: README updates

## Context

`modules/companies/README.md` is the canonical consumer-facing reference for the companies module. After tasks 1-6 the consumer surface has changed:

- New manifest vars: `fields.contact`, `fields.address`, `fields.registration` (alongside the existing `fields.attributes`).
- `name_field` default flipped from `trading_name` to `name`.
- Four shipped presets under `field-presets/`.
- The pointer at `apps/demo/modules/companies/index.yaml` (line 32) is broken — the file is gone (deleted in task 6), and even before deletion it didn't actually demonstrate connection remapping.

Per the project's documentation convention (`CLAUDE.md` → "Documentation"), the README's fixed template includes a `Vars` section that restates the manifest descriptions in narrative form. The manifest is the source of truth — the README mirrors it.

## Task

Edit `modules/companies/README.md`:

### 7.1 Vars section: `name_field` default

Update the existing `name_field` paragraph (`README.md:90-92`) to reflect the new default:

> **`name_field`**
>
> `string` — Default `name`. Top-level field on company documents used as the display name in selectors, table titles, and event templates. Override (e.g. `trading_name`) only if your collection genuinely uses a different display field.

### 7.2 Vars section: `fields` — add three new properties

Today the `fields` block (`README.md:102-106`) only documents `attributes`. Replace with:

> **`fields`**
>
> `object` — Field-block slots rendered in both the edit form and the SmartDescriptions view. See [Slots](../../docs/idioms.md#slots).
>
> - **`contact`** — Block array for the contact section (`contact.*`). Default `[]`. Apps typically `_ref` `field-presets/contact-default.yaml` (website / email / phone) or supply their own array. Block ids must be prefixed with `contact.`.
> - **`address`** — Block array for the address section (`address.*`). Default `[]`. Use `field-presets/address-text.yaml` for a zero-dependency text input, or `field-presets/address-places.yaml` (depends on a custom `PlacesAutocomplete` plugin — not yet shipped). Block ids must be prefixed with `address.`.
> - **`registration`** — Block array for the registration section (`registration.*`). Default `[]`. Region-specific; ship your own array or use `field-presets/registration-sa.yaml` (registered_name / registration_number / vat_number) for a South African setup. Block ids must be prefixed with `registration.`.
> - **`attributes`** — Custom field blocks appended after the built-in sections in the edit form and view page. Default `[]`. Block ids must be prefixed with `attributes.`.

### 7.3 Add a "Field presets" section

Insert a new section between **Vars** and **Secrets** (or wherever fits the README template best) listing the shipped presets:

> ## Field presets
>
> The module ships block-array presets under `field-presets/`. Apps `_ref` whichever sections they want; the module itself ships nothing wired up (all `fields.X` default to `[]`).
>
> | File                                 | Section               | What it provides                                                                                                                                                                                                                                            |
> | ------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `field-presets/contact-default.yaml` | `fields.contact`      | Website (text), email (text + email validator), phone (`PhoneNumberInput`).                                                                                                                                                                                 |
> | `field-presets/address-text.yaml`    | `fields.address`      | Plain `TextInput` for `address.formatted_address` and `address.extra`. Zero dependencies.                                                                                                                                                                   |
> | `field-presets/address-places.yaml`  | `fields.address`      | `PlacesAutocomplete` block writing `address.formatted_address`, plus a `TextInput` for `address.extra`. **Depends on a custom `PlacesAutocomplete` plugin that is not yet shipped** — apps that want autocomplete today supply their own block in the slot. |
> | `field-presets/registration-sa.yaml` | `fields.registration` | South African registration trio: registered name / registration number / VAT number.                                                                                                                                                                        |
>
> Wire from your app's module-entry vars:
>
> ```yaml
> # apps/your-app/modules/companies/vars.yaml
> fields:
>   contact:
>     _ref: ../../../../modules/companies/field-presets/contact-default.yaml
>   address:
>     _ref: ../../../../modules/companies/field-presets/address-text.yaml
>   registration:
>     _ref: ../../../../modules/companies/field-presets/registration-sa.yaml
> ```

### 7.4 Fix the stale `index.yaml` pointer

`README.md:32` reads:

> Defaults work out of the box. To add custom fields, table columns, sidebar tiles, or pipeline stages, see [Slots](../../docs/idioms.md#slots). To point the module at a different MongoDB collection, remap `companies-collection` via the entry's `connections` mapping. See `apps/demo/modules/companies/index.yaml` for a worked example.

`index.yaml` is gone (task 6) and didn't actually demonstrate connection remapping anyway. Either:

- Drop the trailing sentence (`See ... for a worked example.`) entirely if there's no other concrete example to point at; or
- Replace the pointer with `apps/demo/modules/companies/vars.yaml` if that file ends up demonstrating the remap pattern after task 6.

Pick whichever is accurate after task 6 lands. If `vars.yaml` doesn't show a `connections:` remap, drop the pointer rather than mislead readers.

### 7.5 Notes / sample doc shape (optional)

If the README documents the company doc shape elsewhere, update it to:

```js
{
  _id, id,
  name, description,
  contact:      { website, primary_email, primary_phone },
  address:      { formatted_address, extra },
  registration: { registered_name, registration_number, vat_number },  // when present
  attributes:   { …consumer-defined… },
  lowercase_email,                  // derived from contact.primary_email
  created, updated, removed
}
```

If there's no doc-shape section in the README today, skip this — don't add a new one beyond what the design's "Document shape (after)" block covers.

## Acceptance Criteria

- `name_field` Vars paragraph reflects the new `name` default.
- `fields` Vars section documents all four properties (`contact`, `address`, `registration`, `attributes`).
- A "Field presets" section lists the four shipped preset files with their target slot and content summary.
- The line referencing `apps/demo/modules/companies/index.yaml` is fixed (either repointed or dropped).
- `grep -n "trading_name\|index\.yaml" modules/companies/README.md` returns no stale references (the `trading_name` mention in the old `name_field` paragraph is gone; the `index.yaml` pointer is fixed).
- README still follows the project's fixed README template (Description, Dependencies, How to Use, Exports, Vars, Secrets, Plugins, Notes — per `CLAUDE.md`).

## Files

- `modules/companies/README.md` — modify (Vars section + new "Field presets" section + index.yaml pointer fix)

## Notes

The manifest is the source of truth for var descriptions (per `CLAUDE.md`). If anything in this task's wording disagrees with the descriptions written in `module.lowdefy.yaml` during task 2, the manifest wins — sync the README to the manifest, not vice versa.

Don't add emojis to the README. Don't add a "Migration notes" section — there are no real consumers to migrate (per design Non-goals).
