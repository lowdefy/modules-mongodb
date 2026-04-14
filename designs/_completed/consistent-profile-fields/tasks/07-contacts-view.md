# Task 7: Refactor contacts View to Core + Injection Pattern

## Context

`modules/contacts/components/view_contact.yaml` is a `Descriptions` component (column: 2) that hardcodes items: Title, Name, Email, Work Phone, Mobile Phone, Department, Job Title, Birthday, Notes. All values come from `_request: get_contact.0.*`.

After this task, the view will use `_build.array.concat` for items: conditional title, core items (Name, Email), injected extended items via `_module.var: components.profile_view_fields` mapped with `_array.map` + `_get`, and Notes at the bottom.

The component is referenced from `pages/contact-detail.yaml:99`.

## Task

Rewrite `modules/contacts/components/view_contact.yaml`:

```yaml
id: contact_details
type: Descriptions
properties:
  column: 2
  items:
    _build.array.concat:
      # Title (conditional)
      - _build.if:
          test:
            _module.var: show_title
          then:
            - label: Title
              value:
                _request: get_contact.0.profile.title
          else: []
      # Core items
      - - label: Name
          value:
            _request: get_contact.0.profile.name
        - label: Email
          value:
            _request: get_contact.0.email
      # Extended items (injected by consumer)
      - _array.map:
          on:
            _module.var:
              key: components.profile_view_fields
              default: []
          callback:
            _function:
              label:
                __args: 0.label
              value:
                _get:
                  key:
                    __args: 0.key
                  from:
                    _request: get_contact.0
      # Contacts-specific items
      - - label: Notes
          value:
            _request: get_contact.0.global_attributes.internal_details
          span: 2
```

Key changes:

1. **Replace** hardcoded items with `_build.array.concat`
2. **Make title conditional** on `_module.var: show_title`
3. **Core items:** Name and Email with values from `_request: get_contact.0.*`
4. **Extended items:** `_array.map` over `_module.var: components.profile_view_fields`, using `_get` with `from: _request: get_contact.0`
5. **Keep Notes** at the bottom with `span: 2` (contacts-specific)
6. **Remove** hardcoded Work Phone, Mobile Phone, Department, Job Title, Birthday items

## Acceptance Criteria

- `items` uses `_build.array.concat` with four parts: conditional title, core, mapped extended, Notes
- Title conditional on `_module.var: show_title`
- Core items: Name (`get_contact.0.profile.name`), Email (`get_contact.0.email`)
- Extended items use `_array.map` + `_function` + `_get` with `from: _request: get_contact.0`
- Notes item preserved at bottom with `span: 2`
- No hardcoded Work Phone, Mobile Phone, Department, Job Title, Birthday items
- `column: 2` preserved

## Files

- `modules/contacts/components/view_contact.yaml` — modify — replace hardcoded items with core + injection pattern
