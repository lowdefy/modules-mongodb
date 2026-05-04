# Task 3: Form & view restructure + delete obsolete fields

## Context

After task 2 the manifest has `fields.contact`/`address`/`registration`/`attributes` slots (defaulting to `[]`) and `name_field` defaults to `name`. This task:

1. Renames the `trading_name` form block to `name` in `core.yaml`.
2. Rewrites `form_company.yaml` so each section's divider + fields are gated on `_build.array.length(fields.X) > 0` (the existing `attributes` pattern at `form_company.yaml:25-39` extended to all four sections).
3. Rewrites `view_company.yaml` to render one `SmartDescriptions` per section (`view_core`, `view_registration`, `view_contact`, `view_address`, `view_attributes`), each with a `title`, `visible:` gate, and full-doc `data:` — replacing today's single big SmartDescriptions + a separate attributes block (`view_company.yaml:5-33`).
4. Deletes the now-orphaned `components/fields/registration.yaml`, `contact.yaml`, `address.yaml`. `core.yaml` stays — it's the only file remaining under `components/fields/`.

After this task, runtime is **broken** (form binds to `state.name` but pages still set `state.trading_name` and the API still expects flat `trading_name`/`registered_name`/etc.). Task 4 lands the matching API + page payload changes to restore runtime.

## Task

### 3.1 Rename core block

Edit `modules/companies/components/fields/core.yaml`. Change the `id` of the first block from `trading_name` to `name`. The label expression and `description` block stay unchanged:

```yaml
- id: name
  type: TextInput
  required: true
  properties:
    title:
      _string.concat:
        - _module.var: label
        - " Name"
    placeholder:
      _string.concat:
        - "Enter "
        - _module.var: label
        - " name"
- id: description
  type: TextArea
  properties:
    title: Description
    rows: 3
```

### 3.2 Rewrite `form_company.yaml`

Replace today's hardcoded dividers + `_ref components/fields/{registration,contact,address}.yaml` with conditional sections that read `_module.var: fields.X`. The existing `attributes` block at lines 25-39 is the template — extend the same pattern to the other three sections. The Contacts linker stays unchanged at the bottom.

```yaml
id: form_company
type: Box
blocks:
  _build.array.concat:
    # Core: name + description
    - _ref: components/fields/core.yaml

    # Registration
    - _build.if:
        test:
          _build.gt:
            - _build.array.length:
                _module.var: fields.registration
            - 0
        then:
          _build.array.concat:
            - - id: divider_registration
                type: Divider
                properties:
                  title: Registration
            - _module.var: fields.registration
        else: []

    # Contact details
    - _build.if:
        test:
          _build.gt:
            - _build.array.length:
                _module.var: fields.contact
            - 0
        then:
          _build.array.concat:
            - - id: divider_contact
                type: Divider
                properties:
                  title: Contact Details
            - _module.var: fields.contact
        else: []

    # Address
    - _build.if:
        test:
          _build.gt:
            - _build.array.length:
                _module.var: fields.address
            - 0
        then:
          _build.array.concat:
            - - id: divider_address
                type: Divider
                properties:
                  title: Address
            - _module.var: fields.address
        else: []

    # Attributes (already conditional today — unchanged)
    - _build.if:
        test:
          _build.gt:
            - _build.array.length:
                _module.var: fields.attributes
            - 0
        then:
          _build.array.concat:
            - - id: divider_attributes
                type: Divider
                properties:
                  title: Additional Details
            - _module.var: fields.attributes
        else: []

    # Linked contacts (unchanged from today)
    - - id: divider_contacts
        type: Divider
        properties:
          title: Contacts
      - _ref:
          module: contacts
          component: contact-selector
          vars:
            id: contacts
            keyword: contact
            label:
              title: Linked Contacts
```

### 3.3 Rewrite `view_company.yaml`

Replace today's single SmartDescriptions + separate attributes block with one SmartDescriptions per section. Each non-core section gets a `title`, a `visible:` gate, and `data: { _request: get_company.0 }` — dot-notation field IDs (`registration.vat_number`, etc.) resolve into the doc directly, so no per-section data wrapping is needed.

```yaml
id: view_company
type: Box
blocks:
  _build.array.concat:
    - - id: view_core
        type: SmartDescriptions
        properties:
          column: 1
          size: small
          data:
            _request: get_company.0
          fields:
            _ref: components/fields/core.yaml

    - - id: view_registration
        type: SmartDescriptions
        visible:
          _build.gt:
            - _build.array.length:
                _module.var: fields.registration
            - 0
        properties:
          title: Registration
          column: 1
          size: small
          data:
            _request: get_company.0
          fields:
            _module.var: fields.registration

    - - id: view_contact
        type: SmartDescriptions
        visible:
          _build.gt:
            - _build.array.length:
                _module.var: fields.contact
            - 0
        properties:
          title: Contact Details
          column: 1
          size: small
          data:
            _request: get_company.0
          fields:
            _module.var: fields.contact

    - - id: view_address
        type: SmartDescriptions
        visible:
          _build.gt:
            - _build.array.length:
                _module.var: fields.address
            - 0
        properties:
          title: Address
          column: 1
          size: small
          data:
            _request: get_company.0
          fields:
            _module.var: fields.address

    - - id: view_attributes
        type: SmartDescriptions
        visible:
          _build.gt:
            - _build.array.length:
                _module.var: fields.attributes
            - 0
        properties:
          title: Additional Details
          column: 1
          size: small
          data:
            _request: get_company.0
          fields:
            _module.var: fields.attributes
```

### 3.4 Delete obsolete field files

Delete:

- `modules/companies/components/fields/registration.yaml`
- `modules/companies/components/fields/contact.yaml`
- `modules/companies/components/fields/address.yaml`

Keep `modules/companies/components/fields/core.yaml` — it's still referenced by `form_company.yaml` and `view_company.yaml`.

## Acceptance Criteria

- `core.yaml` first block has `id: name` (not `trading_name`).
- `form_company.yaml` has four `_build.if` gates around section dividers + field arrays for registration, contact, address, attributes.
- `view_company.yaml` has five top-level SmartDescriptions blocks (`view_core` plus the four section views), each non-core one with a `visible:` gate and a `title`.
- `components/fields/registration.yaml`, `contact.yaml`, `address.yaml` are deleted; `core.yaml` remains.
- `pnpm ldf:b:i` for the demo app succeeds. The demo's edit/view pages will load but **runtime data round-trip is broken** until task 4 lands (form sends `state.name`, API expects `_payload.trading_name`).
- No remaining references to `components/fields/registration.yaml` / `contact.yaml` / `address.yaml` anywhere in the module — `grep -rn "fields/registration\|fields/contact\|fields/address" modules/companies/` returns empty.

## Files

- `modules/companies/components/fields/core.yaml` — modify (one-line block id rename)
- `modules/companies/components/form_company.yaml` — rewrite (conditional sections)
- `modules/companies/components/view_company.yaml` — rewrite (per-section SmartDescriptions)
- `modules/companies/components/fields/registration.yaml` — delete
- `modules/companies/components/fields/contact.yaml` — delete
- `modules/companies/components/fields/address.yaml` — delete

## Notes

Block IDs `name` and `description` already match the document root — no extra wrapping needed in `view_core.data`.

The form's contact-selector (at the bottom) and the rest of the page chrome stay unchanged.

Runtime is intentionally broken at the end of this task; the next task (04) restores it.
