# Task 8: Form + Field Components

## Context

After Task 1, the module skeleton + validate config exist. This task builds the shared form (`form_activity`) and its two field-block files (`fields/core.yaml`, `fields/links.yaml`). The form is consumed by:
- `pages/new.yaml` (Task 13)
- `pages/edit.yaml` (Task 13)
- `capture_activity` modal (Task 12)

Same form, three call sites. Decoupling fields into `fields/core` and `fields/links` mirrors `modules/companies/components/fields/`'s convention (which has `core.yaml`, `address.yaml`, `contact.yaml`, `registration.yaml`).

## Task

### `modules/activities/components/fields/core.yaml`

Field blocks for the activity's core fields: `type`, `title`, `description`. Renders a Selector, an Input, and a Tiptap rich-text block.

```yaml
- id: type
  type: Selector
  required: true
  layout:
    flex: 0 0 200px
  properties:
    title: Type
    options:
      _build.array.map:
        on:
          _build.object.entries:
            _build.object.assign:
              - _ref: ../../enums/activity_types.yaml
              - _module.var: activity_types
        callback:
          _build.function:
            value: __build.args: 0.0       # the type key (e.g. "call")
            label: __build.args: 0.1.title # the type's display title (e.g. "Call")

- id: title
  type: TextInput
  required: true
  properties:
    title: Title

- id: description
  type: Tiptap   # rich-text block, per design.md decision
  properties:
    title: Description
```

The `Selector` options come from the merged `activity_types` enum — built at build time, includes consumer-added types via `_module.var`. The `_build.array.map` over `_build.object.entries` produces `[{ value, label }]` shape from `{ <type>: { title, color, ... } }`.

### `modules/activities/components/fields/links.yaml`

Field blocks for linked entities: `contact_ids` (multi-select via `contacts.contact-selector`) and `company_ids` (multi-select via `companies.company-selector`).

```yaml
- id: contact_ids
  type: Box
  blocks:
    - _ref:
        module: contacts
        component: contact-selector
        vars:
          # Whatever vars contact-selector accepts — verify against modules/contacts/components/contact-selector.yaml.njk
          # At minimum: title "Linked contacts", multiple: true, value bound to state.contact_ids
          ...

- id: company_ids
  type: Box
  blocks:
    - _ref:
        module: companies
        component: company-selector
        vars:
          # Same — verify against modules/companies/components/company-selector.yaml
          ...
```

Read the actual selector files in companies/contacts to determine the exact var contract — what props they accept, how the value binding works, whether they default to single-select or multiple. Activities needs **multiple** on both.

### `modules/activities/components/form_activity.yaml`

The shared form. Composes the three field-block sources: `fields/core`, `fields/links`, and the consumer's `fields.attributes` var hook.

```yaml
id: form_activity
type: Box
layout:
  contentGutter: 16
blocks:
  _array.concat:
    - _ref: fields/core.yaml
    - _ref: fields/links.yaml
    - _module.var: fields.attributes  # consumer-defined extension blocks
```

State binding: each field's id is the doc field name (`type`, `title`, `description`, `contact_ids`, `company_ids`, `attributes.<custom>`). The form parent (page or modal) handles initial state, submit, and the `create-activity` / `update-activity` API call.

The form itself is **stateless** — it doesn't know whether it's creating or updating. The wrapping page/modal passes initial state (empty for create, loaded doc for edit) and wires the submit button.

## Acceptance Criteria

- `modules/activities/components/fields/core.yaml` exists. The `type` Selector renders all five built-in types plus any consumer-added types via the `activity_types` var.
- `modules/activities/components/fields/links.yaml` exists. The contact selector and company selector render and let the user pick multiple entities.
- `modules/activities/components/form_activity.yaml` exists. Renders all three field groups in order: core, links, attributes.
- A consumer setting `vars: { activity_types: { quote: { title: Quote, ... } } }` sees "Quote" in the type dropdown alongside the built-ins.
- The form's state shape matches the API's expected payload: `{ type, title, description, contact_ids: [], company_ids: [], attributes: {} }`.
- Build is clean.

## Files

- `modules/activities/components/fields/core.yaml` — create — type/title/description field blocks.
- `modules/activities/components/fields/links.yaml` — create — contact + company multi-selector blocks.
- `modules/activities/components/form_activity.yaml` — create — composed form.

## Notes

- **The `type` Selector's options must come from the merged enum** (`_build.object.assign` of `activity_types.yaml` + `_module.var: activity_types`). Don't hardcode the five built-ins — that breaks consumer extensibility.
- **`contact-selector` and `company-selector` are existing cross-module exports.** Read their source files (`modules/contacts/components/contact-selector.yaml.njk` and `modules/companies/components/company-selector.yaml`) to learn the exact var contract. They likely take `value`, `multiple: true`, `title`, etc.
- **`description` uses Tiptap.** The design pins this — rich-text HTML edited and rendered via the Tiptap block. Don't use a plain TextInput. Don't worry about URL prefilling for description — Task 13's pageId:new explicitly excludes `description` from URL prefill params (HTML doesn't round-trip through URLs cleanly).
- **Form is stateless re: create vs edit.** The page or modal that embeds the form sets initial state (empty for new, `_request: get_activity.0` for edit) and handles submit (`create-activity` for new, `update-activity` for edit). Form just renders fields and binds to state.
- **`fields.attributes` hook** at the bottom of the form's `_array.concat` lets consumers add custom attribute fields. Block ids must be prefixed with `attributes.` so they bind to `state.attributes.*` (mirrors companies'). This is a consumer-side responsibility — the form just appends whatever the var contains.
