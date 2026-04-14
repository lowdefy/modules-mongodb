# Module Field Pattern

## Problem

`user-admin`, `user-account`, and `contacts` each let consumers configure extended fields for user-side data objects — profile, global_attributes, app_attributes. Today the consumer writes three parallel overrides per data object:

1. **Form blocks** — input block array for the edit page
2. **View config** — `DataDescriptions` formConfig array for the view page
3. **Set fields** — `$set` operator map for the API write

Each module bakes its own state root into these overrides (`user.profile.*` vs `contact.profile.*`), so the same field definitions can't be shared across modules without duplication. Any divergence between the three overrides is a silent bug.

## Solution

1. **Flatten the state namespace.** Replace `user.profile.*` / `contact.profile.*` with `profile.*` across all modules.
2. **One block array per field group.** Consumer writes standard Lowdefy blocks once. Same file used in the edit form and in [SmartDescriptions](../smart-descriptions/design.md) for the view.
3. **Whole-object save.** API does `profile: _payload: profile` instead of per-field mapping.
4. **Pipeline stages for transforms.** Consumers who need data transformations provide MongoDB update pipeline stages.

## Non-Goals

- Unifying modules' internal page structure. Each module still owns its pages, layout, and components. This design unifies the field configuration interface only.
- Per-field save transforms. Use pipeline stages instead.
- Backwards compatibility. Nothing has shipped yet.

## Consumer Interface

### Field definitions

A field group is a standard Lowdefy block array. IDs include the state namespace prefix:

```yaml
# apps/demo/modules/shared/profile/fields.yaml
- id: profile.phone_number
  type: PhoneNumberInput
  properties:
    title: Phone Number

- id: profile.department
  type: TextInput
  properties:
    title: Department

- id: profile.job_title
  type: TextInput
  properties:
    title: Job Title
```

This file works in user-admin, user-account, and contacts without modification. No module-specific state root.

### Module vars

One var per field group, plus an optional pipeline stages var:

```yaml
# apps/demo/modules/user-admin/vars.yaml
profile:
  show_title: true
  fields:
    _ref: modules/shared/profile/fields.yaml
global_attributes:
  fields:
    _ref: modules/user-admin/global_attributes_fields.yaml
app_attributes:
  fields:
    _ref: modules/user-admin/app_attributes_fields.yaml
extra_update_stages: []
```

### What this replaces

| Old var                               | New var                    | Notes                          |
| ------------------------------------- | -------------------------- | ------------------------------ |
| `components.profile_fields`           | `profile.fields`           | Same blocks, new namespace     |
| `components.profile_set_fields`       | _eliminated_               | API does `_payload: profile`   |
| `components.profile_view_config`      | _eliminated_               | SmartDescriptions reads blocks |
| `components.global_attributes_fields` | `global_attributes.fields` |                                |
| `components.app_attributes_fields`    | `app_attributes.fields`    |                                |
| `components.attributes_view_config`   | _eliminated_               |                                |
| —                                     | `extra_update_stages`      | New: MongoDB pipeline stages   |

Six vars reduced to four. Three eliminated, one added.

### Extra update stages

For consumers who need data transformations beyond the whole-object save, expose one var for additional MongoDB update pipeline stages:

```yaml
# Consumer provides additional stages in aggregation syntax
extra_update_stages:
  - $set:
      profile.department:
        $trim:
          input: "$profile.department"
      profile.computed_display:
        $concat:
          - "$profile.given_name"
          - " ("
          - "$profile.department"
          - ")"
```

Standard MongoDB aggregation syntax. Appended after the module's core update stages. One escape hatch — flexible, well-understood, no Lowdefy-specific DSL to learn.

## State Namespace

### Before

```
user-admin:     user.profile.given_name    user.global_attributes.notes
user-account:   contact.profile.given_name
contacts:       contact.profile.given_name
```

State roots differ per module. Same field → different IDs → can't share files.

### After

```
All modules:    profile.given_name         global_attributes.notes
                profile.phone_number       app_attributes.team
```

Page state is flat at the root level. `profile`, `global_attributes`, `app_attributes` are subtrees alongside `email`, `roles`, `disabled`, etc.

### OnMount

```yaml
# users-edit.yaml onMount
- id: set_state
  type: SetState
  params:
    profile:
      _request: get_user.0.profile
    global_attributes:
      _request: get_user.0.global_attributes
    app_attributes:
      _request: get_user.0.app_attributes
    email:
      _request: get_user.0.email
    roles:
      _request: get_user.0.roles
    disabled:
      _request: get_user.0.disabled
    invite:
      _request: get_user.0.invite
```

No `user.` or `contact.` wrapper.

## Module Internals

### Edit form

The module defines its core fields inline. Consumer fields are injected via var:

```yaml
# form_profile.yaml
id: form_profile
type: Box
layout:
  gap: 8
blocks:
  _build.array.concat:
    # Core fields (shared across user-admin, user-account, contacts)
    - _ref:
        path: ../shared/profile/form_core.yaml
        vars:
          show_title:
            _module.var: show_title
    # Consumer extended fields
    - _module.var: profile.fields
```

```yaml
# modules/shared/profile/form_core.yaml
_build.array.concat:
  - _build.if:
      test:
        _var: show_title
      then:
        - id: profile.title
          type: Selector
          layout:
            span: 3
          properties:
            title: Title
            options:
              - Mr
              - Ms
              - Mrs
              - Dr
              - Prof
      else: []
  - - id: profile.given_name
      type: TextInput
      required: true
      layout:
        span:
          _build.if:
            test:
              _var: show_title
            then: 9
            else: 12
      properties:
        title: First Name
    - id: profile.family_name
      type: TextInput
      required: true
      layout:
        span: 12
      properties:
        title: Last Name
```

`profile.given_name` binds to `state.profile.given_name`. Consumer's `profile.phone_number` binds to `state.profile.phone_number`. All in the same `profile.*` subtree.

The shared `form_core.yaml` is used by all three modules. Same pattern for `global_attributes.fields` and `app_attributes.fields` — injected after a divider in the form.

### View page

SmartDescriptions receives the same block definitions. The data prop wraps the state subtree to match the field ID prefix:

```yaml
# view_profile.yaml
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
        # Same shared core fields
        - _ref:
            path: ../shared/profile/form_core.yaml
            vars:
              show_title:
                _module.var: show_title
        # Same consumer fields
        - _module.var: profile.fields
```

SmartDescriptions resolves `profile.phone_number` as a dot-notation path into `data` → `data.profile.phone_number`. PhoneNumberInput type → renders as phone. Selector with options → shows label. TextInput → plain text. Form-only properties like `required` and `layout` are silently ignored.

No separate view config. No `profile_view_config` var. The block definitions ARE the view config.

Only fields listed in `fields` are rendered — no need to null out `picture`, `name`, `profile_created`, or other internal fields.

### Combined attributes view

```yaml
- id: attributes_view
  type: SmartDescriptions
  visible:
    _build.or:
      - _build.ne:
          - _module.var: global_attributes.fields
          - null
      - _build.ne:
          - _module.var: app_attributes.fields
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
        - _module.var: global_attributes.fields
        - _module.var: app_attributes.fields
```

Fields with `id: global_attributes.notes` resolve to `data.global_attributes.notes`. Fields with `id: app_attributes.team` resolve to `data.app_attributes.team`. Mixed prefixes work because SmartDescriptions uses dot-notation paths, not a fixed prefix.

### API write

Switch from `$set` document to pipeline update syntax for composability:

```yaml
# update-user.yaml (simplified core pattern)
- id: update_user
  type: MongoDBUpdateOne
  connectionId: user-contacts-collection
  properties:
    filter:
      _id:
        _payload: _id
    update:
      _build.array.concat:
        # Stage 1: Core set
        - - $set:
              # Profile — merge, not replace (preserves fields like profile_created set elsewhere)
              profile:
                $mergeObjects:
                  - $ifNull:
                      - "$$ROOT.profile"
                      - {}
                  - _payload: profile
              # Recompute derived name field
              profile.name:
                $concat:
                  - $trim:
                      input: "$profile.given_name"
                  - " "
                  - $trim:
                      input: "$profile.family_name"
              # Global attributes — merge, not replace
              global_attributes:
                $mergeObjects:
                  - $ifNull:
                      - "$$ROOT.global_attributes"
                      - {}
                  - _payload: global_attributes
              # App-scoped fields
              apps.APP_NAME.roles:
                _payload: roles
              apps.APP_NAME.disabled:
                _payload: disabled
              apps.APP_NAME.app_attributes:
                $mergeObjects:
                  - $ifNull:
                      - "$$ROOT.apps.APP_NAME.app_attributes"
                      - {}
                  - _payload: app_attributes
              # Change stamp
              updated:
                _ref:
                  module: events
                  component: change_stamp
        # Consumer pipeline stages
        - _module.var: extra_update_stages
```

Key points:

- All data objects use `$mergeObjects` — merge, not replace. This preserves fields set outside the form (e.g. `profile_created` on profile, fields set by other apps on global_attributes).
- `profile.name` is recomputed server-side in the same `$set` stage, overriding whatever the form sent.
- Consumer `extra_update_stages` are appended as additional pipeline stages.

## Cross-Module Sharing

The same field file works in all modules because the state namespace is identical:

| Module       | State path  | Form field ID          | SmartDescriptions data         |
| ------------ | ----------- | ---------------------- | ------------------------------ |
| user-admin   | `profile.*` | `profile.phone_number` | `{ profile: _state: profile }` |
| user-account | `profile.*` | `profile.phone_number` | `{ profile: _state: profile }` |
| contacts     | `profile.*` | `profile.phone_number` | `{ profile: _state: profile }` |

One `fields.yaml`, shared via `_ref`, used in all three modules. No resolvers, no `root`/`subtree` parameters.

### Attributes sharing

Same pattern:

```yaml
# modules/shared/global_attributes/fields.yaml
- id: global_attributes.notes
  type: TextArea
  properties:
    title: Internal Notes
```

Wired the same way in any module that surfaces global attributes.

## Key Decisions

**Flat namespace.** `profile.*` instead of `user.profile.*` / `contact.profile.*`. This is what makes cross-module sharing work — same field IDs, same state paths, same `_ref` file across all modules.

**Merge-object save.** All data objects (profile, global_attributes, app_attributes) use `$mergeObjects` to overlay form data onto the existing document. Preserves fields set outside the form (e.g. `profile_created`, fields set by other apps).

**Pipeline stages for transforms.** Consumers who need data transformations provide standard MongoDB update pipeline stages via `extra_update_stages`. Flexible, well-understood, no custom DSL.

**Internal fields stay in `profile`.** `given_name`, `family_name`, `title`, `avatar_color`, `picture` all live in `profile.*` alongside consumer fields. The API recomputes derived fields (like `name`) in a `$set` pipeline stage. No separate namespace needed.

**Core profile fields as shared component.** `given_name`, `family_name`, `title` extracted into `modules/shared/profile/form_core.yaml`. All three modules `_ref` it.

## Implementation Scope

### Module changes

| Module       | Changes needed                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| user-admin   | Rename state root (`user.*` → flat), update form components, update view to SmartDescriptions, switch API to pipeline syntax, update module manifest vars |
| user-account | Same state root change, update form and view components, update API                                                                                       |
| contacts     | Same state root change (`contact.*` → flat), update form and view components, update API                                                                  |

### Shared resources

| Resource                                | Change                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `modules/shared/profile/form_core.yaml` | New: shared core profile fields (given_name, family_name, title) referenced by all three modules |
| Demo app consumer files                 | Rewrite field files with new namespace, remove set_fields and view_config files                  |

### Dependency: SmartDescriptions

The view page changes depend on the [SmartDescriptions block](../smart-descriptions/design.md) being implemented first. The form and API changes can proceed independently.

## Resolved Questions

1. **All data objects merge, not replace.** Profile uses `$mergeObjects` same as global/app attributes. Fields like `profile_created` are set outside the form and must be preserved.

2. **Core fields extracted to shared component.** `given_name`, `family_name`, `title` go in `modules/shared/profile/form_core.yaml`. All three modules `_ref` it.

3. **Contacts modal overlay.** No modal is currently implemented. If a future modal needs the contact form inside another page that also uses `profile.*`, the modal can remap field IDs into a namespaced prefix (e.g. `contact_modal.profile.*`) at that point. Not a concern for this design.
