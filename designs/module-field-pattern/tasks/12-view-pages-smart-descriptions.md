# Task 12: Replace DataDescriptions with SmartDescriptions on View Pages

## Context

Tasks 2-11 have flattened state namespaces, rewritten APIs, and updated consumer vars. View pages still use `DataDescriptions` with `formConfig` arrays. The design calls for replacing these with `SmartDescriptions`, which reads the same block definitions used in the edit form.

**Dependency:** This task requires the [SmartDescriptions block](../smart-descriptions/design.md) to be implemented first. If SmartDescriptions is not yet available, defer this task.

## Task

### 1. Update `modules/user-admin/components/view_user.yaml`

Replace `DataDescriptions` blocks with `SmartDescriptions`.

**Current profile section:**

```yaml
- id: profile_data
  type: DataDescriptions
  properties:
    bordered: true
    column: 1
    size: small
    title: Profile
    data:
      _object.assign:
        - _state: user.profile
        - profile_created: null
        - picture: null
        - name: null
    formConfig: ...
```

**New profile section:**

```yaml
- id: profile_view
  type: SmartDescriptions
  properties:
    title: Profile
    column: 1
    size: small
    data:
      profile:
        _state: profile
    fields:
      _build.array.concat:
        - _ref:
            path: ../shared/profile/form_core.yaml
            vars:
              show_title:
                _module.var: fields.show_title
        - _module.var: fields.profile
```

Key changes:

- `type: SmartDescriptions` replaces `type: DataDescriptions`
- `data` wraps the state subtree with a `profile` key to match field ID prefixes
- `fields` replaces `formConfig` — uses the same `_ref` and `_module.var` as the edit form
- No need to null-out `profile_created`, `picture`, `name` — SmartDescriptions only renders listed fields
- `_state: user.profile` → `_state: profile` (flat namespace from Task 2)

**Current attributes section:**

```yaml
- id: attributes_data
  type: DataDescriptions
  visible:
    _build.ne:
      - _module.var: components.attributes_view_config
      - null
  properties:
    data:
      _object.assign:
        - _if_none:
            - _state: user.global_attributes
            - {}
        - _if_none:
            - _state: user.app_attributes
            - {}
    formConfig:
      _module.var: components.attributes_view_config
```

**New attributes section:**

```yaml
- id: attributes_view
  type: SmartDescriptions
  visible:
    _build.or:
      - _build.ne:
          - _module.var: fields.global_attributes
          - null
      - _build.ne:
          - _module.var: fields.app_attributes
          - null
  properties:
    title: Attributes
    column: 1
    size: small
    data:
      global_attributes:
        _state: global_attributes
      app_attributes:
        _state: app_attributes
    fields:
      _build.array.concat:
        - _module.var: fields.global_attributes
        - _module.var: fields.app_attributes
```

Key changes:

- Visibility based on `fields.global_attributes` / `fields.app_attributes` (not `components.attributes_view_config`)
- `data` maps both subtrees so field IDs like `global_attributes.notes` resolve via dot notation
- `fields` concatenates both field arrays — mixed prefixes work because SmartDescriptions uses dot-notation paths

Remove `_module.var: components.view_extra` if it's no longer needed, or keep it as an additional content slot.

### 2. Update `modules/contacts/components/view_contact.yaml`

Same pattern as user-admin view.

**New profile section:**

```yaml
- id: profile_view
  type: SmartDescriptions
  properties:
    title: Profile
    column: 1
    size: small
    data:
      profile:
        _request: get_contact.0.profile
    fields:
      _build.array.concat:
        - _ref:
            path: ../shared/profile/form_core.yaml
            vars:
              show_title:
                _module.var: fields.show_title
        - _module.var: fields.profile
```

Note: contacts view reads from `_request:` not `_state:`, so `data` uses `_request: get_contact.0.profile`.

**New attributes section:**

```yaml
- id: attributes_view
  type: SmartDescriptions
  visible:
    _build.ne:
      - _module.var: fields.global_attributes
      - null
  properties:
    title: Attributes
    column: 1
    size: small
    data:
      global_attributes:
        _request: get_contact.0.global_attributes
    fields:
      _module.var: fields.global_attributes
```

Contacts doesn't have `app_attributes` in the view, so only `global_attributes` is mapped.

### 3. Update `modules/user-account/components/view_profile.yaml`

Same pattern. User-account view reads from `_user:` context:

**New profile section:**

```yaml
- id: profile_view
  type: SmartDescriptions
  properties:
    title: Profile
    column: 1
    size: small
    data:
      profile:
        _user: profile
    fields:
      _build.array.concat:
        - _ref:
            path: ../shared/profile/form_core.yaml
            vars:
              show_title:
                _module.var: fields.show_title
        - _module.var: fields.profile
```

Remove the `attributes_divider`, `attributes_data` DataDescriptions, and `profile_divider` — SmartDescriptions renders its own title.

### 4. Clean up eliminated var references

After converting to SmartDescriptions, verify no references to these eliminated vars remain in any module:

- `components.profile_view_config`
- `components.attributes_view_config`

These were only used by the DataDescriptions `formConfig` prop and should now be completely gone.

## Acceptance Criteria

- All view components use `SmartDescriptions` instead of `DataDescriptions`
- `data` prop wraps state/request subtrees with keys matching field ID prefixes
- `fields` prop uses the same `_ref` to `form_core.yaml` and `_module.var: fields.*` as edit forms
- No `formConfig` prop remains
- No `components.profile_view_config` or `components.attributes_view_config` references remain
- SmartDescriptions correctly resolves field types (PhoneNumberInput → phone display, Selector → label display, TextInput → plain text)
- Fields not in the `fields` array are not rendered (no need to null-out internal fields)

## Files

- `modules/user-admin/components/view_user.yaml` — **modify** — replace DataDescriptions with SmartDescriptions
- `modules/contacts/components/view_contact.yaml` — **modify** — replace DataDescriptions with SmartDescriptions
- `modules/user-account/components/view_profile.yaml` — **modify** — replace DataDescriptions with SmartDescriptions

## Notes

- This task depends on the SmartDescriptions block being implemented (see `designs/smart-descriptions/design.md`). If SmartDescriptions is not yet available, defer this task. The DataDescriptions view pages continue to work with the flat namespace in the interim.
- The SmartDescriptions block must support dot-notation path resolution into the `data` prop, and must handle mixed prefixes (e.g., `global_attributes.notes` and `app_attributes.team` in the same fields array).
- Form-only properties like `required`, `layout`, and `validate` should be silently ignored by SmartDescriptions.
