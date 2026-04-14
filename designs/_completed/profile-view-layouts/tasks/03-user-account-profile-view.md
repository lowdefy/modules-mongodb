# Task 3: Update User-Account Profile View

## Context

After tasks 1 and 2, the identity header component exists in the layout module and the shared attribute config files exist in `apps/demo/modules/shared/profile/`.

The current user-account profile page (`modules/user-account/pages/profile.yaml`) renders a Card containing `view_profile.yaml`. The view component (`modules/user-account/components/view_profile.yaml`) currently has:

- A standalone centered 100px `Img` avatar
- A separate `Descriptions` block for email
- A `DataView` for profile fields

The page has no requests — it relies entirely on `_user:` context (profile, email, global_attributes, app_attributes, roles — all available via `userFields` config). To show the signed-up date, the page needs a `get_my_profile` request (`sign_up.timestamp` is not in `userFields`).

The consumer vars are at `apps/demo/modules/user-account/vars.yaml`, which currently provides `profile_fields`, `profile_set_fields`, and `profile_view_config`.

## Task

### 1. Add `get_my_profile` request to `modules/user-account/pages/profile.yaml`

The profile page currently has no `requests` or `events`. Add an unconditional request that fetches the current user's document. This provides `sign_up.timestamp` for the identity header's signed-up date (not available via `_user:`). Attributes come from `_user:` directly and don't depend on this request.

Add a `requests` section and `events.onMount` to the page vars:

```yaml
requests:
  - id: get_my_profile
    type: MongoDBFindOne
    connectionId:
      _module.connectionId: user-contacts-collection
    properties:
      query:
        sub:
          _user: sub
events:
  onMount:
    - id: get_my_profile
      type: Request
      params: get_my_profile
```

This request is defined inline in the page (not a separate file) since it's a simple `findOne` by `sub`. The user-account module already has a `user-contacts-collection` connection.

### 2. Rewrite `modules/user-account/components/view_profile.yaml`

Replace the entire content with the new layout: identity header + DataDescriptions for profile + optional DataDescriptions for attributes + view_extra slot.

```yaml
id: view_contact_profile
type: Box
blocks:
  _build.array.concat:
    # Identity header
    - - _ref:
          path: modules/shared/layout/identity-header.yaml
          vars:
            avatar_src:
              _user: profile.picture
            name:
              _user: profile.name
            email:
              _user: email
            extra:
              - id: signed_up
                type: Paragraph
                visible:
                  _ne:
                    - _request: get_my_profile.0.sign_up.timestamp
                    - null
                style:
                  marginBottom: 0
                properties:
                  type: secondary
                  content:
                    _nunjucks:
                      template: "Signed up {{ date | date('YYYY-MM-DD') }}"
                      on:
                        date:
                          _request: get_my_profile.0.sign_up.timestamp
    # Profile DataDescriptions
    - - id: profile_data
        type: DataDescriptions
        properties:
          bordered: true
          column: 1
          size: small
          title: Profile
          data:
            _object.assign:
              - _user: profile
              - profile_created: null
              - picture: null
              - name: null
          formConfig:
            _build.if:
              test:
                _build.ne:
                  - _module.var:
                      key: components.profile_view_config
                      default: null
                  - null
              then:
                _build.array.concat:
                  - _build.if:
                      test:
                        _module.var: show_title
                      then:
                        - key: title
                          title: Title
                      else: []
                  - - key: given_name
                      title: First Name
                    - key: family_name
                      title: Last Name
                  - _module.var:
                      key: components.profile_view_config
                      default: []
              else: null
    # Attributes DataDescriptions (optional)
    - - id: attributes_data
        type: DataDescriptions
        visible:
          _build.ne:
            - _module.var:
                key: components.attributes_view_config
                default: null
            - null
        properties:
          bordered: true
          column: 1
          size: small
          title: Attributes
          data:
            _object.assign:
              - _if_none:
                  - _user: global_attributes
                  - {}
              - _if_none:
                  - _user: app_attributes
                  - {}
          formConfig:
            _module.var:
              key: components.attributes_view_config
              default: []
    # Extra content slot
    - _module.var:
        key: components.view_extra
        default: []
```

Key changes from current file:

- Removed: standalone `Img` avatar block (`user_avatar`)
- Removed: separate `Descriptions` email block (`email_display`)
- Added: `_ref: { path: modules/shared/layout/identity-header.yaml }` with `_user:` bindings and signed-up date in `extra`
- Changed: `DataView` → `DataDescriptions` with `bordered: true`, `column: 1`, `size: small`, `title: Profile`
- Added: optional attributes `DataDescriptions` section (visible only when `attributes_view_config` provided)
- Added: `components.view_extra` injection point
- The `formConfig` logic is identical to the current DataView — same `_build.if` / `_build.array.concat` pattern
- The top-level `blocks` changes from a plain array to `_build.array.concat` to support the extra slot

### 3. Update `apps/demo/modules/user-account/vars.yaml`

Add `attributes_view_config` to the components section:

```yaml
components:
  profile_fields:
    _ref: modules/shared/profile/form_fields.yaml
  profile_set_fields:
    _ref: modules/shared/profile/set_fields.yaml
  profile_view_config:
    _ref: modules/shared/profile/view_config.yaml
  attributes_view_config:
    _ref: modules/shared/profile/attributes_view_config.yaml
```

### 4. Update `modules/user-account/module.lowdefy.yaml`

Update the `components` var description to include the new vars:

```yaml
components:
  description: "Overrides: form_profile, view_profile, profile_fields, profile_set_fields, profile_view_config, attributes_view_config, view_extra"
```

## Acceptance Criteria

- Profile page fetches the full user document via `get_my_profile` request on mount
- Identity header shows avatar (80px), name, and email in a horizontal row
- Signed-up date displays below email when available
- Profile fields render in a bordered DataDescriptions table with "Profile" title
- Attributes section appears when `attributes_view_config` is provided in consumer vars
- Attributes section is hidden when `attributes_view_config` is not provided
- `components.view_extra` injection point renders consumer blocks after attributes
- Lowdefy build succeeds with no errors

## Files

- `modules/user-account/pages/profile.yaml` — **modify** — add `get_my_profile` request and onMount event
- `modules/user-account/components/view_profile.yaml` — **modify** — full rewrite with identity header + DataDescriptions + attributes + view_extra
- `apps/demo/modules/user-account/vars.yaml` — **modify** — add `attributes_view_config` ref
- `modules/user-account/module.lowdefy.yaml` — **modify** — update components var description
