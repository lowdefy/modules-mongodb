# Task 6: Create User-Admin Read-Only View Page

## Context

After tasks 1 and 2, the identity header component and shared attribute configs exist.

The user-admin module currently only has an edit page (`users-edit.yaml`). There's no way to view a user's profile without entering edit mode. The design adds a new read-only view page following the contacts detail pattern (list → detail → edit).

The contacts detail page (`modules/contacts/pages/contact-detail.yaml`) provides the structural template: two-column layout, main column with Card containing the view component, sidebar with tiles, edit button in page actions.

The user-admin edit page (`modules/user-admin/pages/users-edit.yaml`) shows the data-fetching pattern: `get_user` request, `onMount` events for redirect-if-no-id, fetch, redirect-if-not-found, and SetState.

## Task

### 1. Create `modules/user-admin/components/view_user.yaml`

The main view component — identity header + DataDescriptions for profile + optional attributes + view_extra:

```yaml
id: view_user_details
type: Box
blocks:
  _build.array.concat:
    # Identity header
    - - _ref:
          path: modules/shared/layout/identity-header.yaml
          vars:
            avatar_src:
              _state: user.profile.picture
            name:
              _state: user.profile.name
            email:
              _state: user.email
            # No extra — signed-up date and invite link are in the access sidebar tile
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
              - _state: user.profile
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
                  - _state: user.global_attributes
                  - {}
              - _if_none:
                  - _state: user.app_attributes
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

Data source is `_state: user` (set via the page's onMount SetState, same as users-edit). The identity header has no `extra` on the view page — signed-up date and invite link live only in the access sidebar tile to avoid duplication. The edit page uses `extra` since it has no sidebar.

### 2. Create `modules/user-admin/components/view_access.yaml`

The sidebar access card showing roles, status, signed-up date, and invite link:

```yaml
id: access_card
type: Card
properties:
  title: Access
blocks:
  - id: status_tag
    type: Tag
    properties:
      color:
        _if:
          test:
            _eq:
              - _state: user.disabled
              - true
          then: red
          else:
            _if:
              test:
                _eq:
                  - _state: user.invite.open
                  - true
              then: blue
              else: green
      content:
        _if:
          test:
            _eq:
              - _state: user.disabled
              - true
          then: Disabled
          else:
            _if:
              test:
                _eq:
                  - _state: user.invite.open
                  - true
              then: Open Invite
              else: Active
  - id: roles_label
    type: Paragraph
    style:
      marginBottom: 4
      marginTop: 16
    properties:
      type: secondary
      content: Roles
  - id: roles_tags
    type: Box
    style:
      display: flex
      flexWrap: wrap
      gap: 4px
    blocks:
      _build.array.map:
        on:
          _module.var: roles
        callback:
          _build.function:
            id:
              _build.string.concat:
                - "role_tag_"
                - __build.args: 1
            type: Tag
            visible:
              _array.includes:
                - _state: user.roles
                - __build.args: 0
            properties:
              content:
                __build.args: 0
  - id: signed_up
    type: Paragraph
    visible:
      _eq:
        - _state: user.is_user
        - true
    style:
      marginTop: 16
      marginBottom: 0
    properties:
      type: secondary
      content:
        _nunjucks:
          template: "Signed up {{ date | date('YYYY-MM-DD') }}"
          on:
            date:
              _state: user.sign_up.timestamp
  - id: invite_link
    type: Paragraph
    visible:
      _eq:
        - _state: user.invite.open
        - true
    style:
      marginTop: 8
      marginBottom: 0
    properties:
      type: secondary
      code: true
      copyable: true
      content:
        _nunjucks:
          template: "{{ origin }}/login?hint={{ hint }}"
          on:
            origin:
              _if_none:
                - _module.var: app_domain
                - _location: origin
            hint:
              _if_none:
                - _state: user.lowercase_email
                - ""
```

Roles tags are built from the `roles` module var (plain string array, e.g. `["mrm", "user-admin-demo"]`) filtered by the user's assigned roles. Each role value is rendered directly as the tag content. Status derives from `user.disabled` and `user.invite.open`. The access tile is overridable via `components.view_access_tile` module var.

### 3. Create `modules/user-admin/pages/users-view.yaml`

A two-column read-only view page. Model the structure after `contacts/pages/contact-detail.yaml`:

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: users-view
    title:
      _nunjucks:
        template: |
          {% if app_title %}{{ app_title }} {% endif %}User{% if profile %}: {{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}
        on:
          _object.assign:
            - _request: get_user.0
            - app_title:
                _module.var: app_title
    content_width: 900
    breadcrumbs:
      - home: true
        icon: AiOutlineHome
      - label:
          _build.string.trim:
            _build.string.concat:
              - _module.var:
                  key: app_title
                  default: ""
              - " User Admin"
        pageId:
          _module.pageId: users
      - label:
          _if_none:
            - _request: get_user.0.profile.name
            - ""
    page_actions:
      - id: edit_button
        type: Button
        layout:
          flex: 0 1 auto
        properties:
          title: Edit
          icon: AiOutlineEdit
          type: default
        events:
          onClick:
            - id: go_edit
              type: Link
              params:
                pageId:
                  _module.pageId: users-edit
                urlQuery:
                  user_id:
                    _url_query: user_id
    doc:
      _request: get_user.0
    requests:
      - _ref: ../requests/get_user.yaml
    events:
      onMount:
        - id: redirect_if_no_id
          type: Link
          skip:
            _ne:
              - _input: user_id
              - null
          params:
            back: true
        - id: get_user
          type: Request
          skip:
            _eq:
              - _input: user_id
              - null
          params: get_user
        - id: redirect_if_no_user
          type: Link
          skip:
            _ne:
              - _request: get_user.0
              - null
          params:
            back: true
        - id: set_user
          type: SetState
          skip:
            _eq:
              - _input: user_id
              - null
          params:
            user:
              _request: get_user.0
    blocks:
      - id: detail_layout
        type: Box
        layout:
          gap: 16
        blocks:
          - id: main_column
            type: Box
            layout:
              span: 14
              sm:
                span: 24
            blocks:
              - _ref:
                  module: layout
                  component: card
                  vars:
                    title: User Information
                    doc:
                      _request: get_user.0
                    blocks:
                      - _ref: ../components/view_user.yaml
          - id: sidebar_column
            type: Box
            layout:
              span: 10
              sm:
                span: 24
            blocks:
              - _module.var:
                  key: components.view_access_tile
                  default:
                    _ref: ../components/view_access.yaml
```

Key structural decisions:

- Uses the same `get_user` request as users-edit (shared request definition)
- Same onMount event chain as users-edit: redirect-if-no-id → fetch → redirect-if-not-found → SetState
- Two-column layout matching contacts detail: main (14) + sidebar (10) with responsive sm: 24
- `content_width: 900` — wider than edit page (600) to accommodate the two-column layout
- Page title follows users-edit pattern with app_title prefix
- Edit button in page_actions links to users-edit with the same `user_id` URL query
- Sidebar defaults to the access card but is overridable via `components.view_access_tile`
- The `_input: user_id` pattern must match what the table sends (see task 8)

### 4. Update `apps/demo/modules/user-admin/vars.yaml`

Add `profile_view_config` and `attributes_view_config`:

```yaml
components:
  profile_fields:
    _ref: modules/user-admin/profile_form_fields.yaml
  profile_set_fields:
    _ref: modules/user-admin/profile_set_fields.yaml
  profile_view_config:
    _ref: modules/shared/profile/view_config.yaml
  global_attributes_fields:
    _ref: modules/user-admin/global_attributes_form_fields.yaml
  app_attributes_fields:
    _ref: modules/user-admin/app_attributes_form_fields.yaml
  attributes_view_config:
    _ref: modules/shared/profile/attributes_view_config.yaml
```

User-admin didn't previously need `profile_view_config` (it only had an edit page), but the new view page's DataDescriptions needs it.

## Acceptance Criteria

- `modules/user-admin/pages/users-view.yaml` renders a two-column read-only view page
- `modules/user-admin/components/view_user.yaml` shows identity header + profile DataDescriptions + optional attributes + view_extra
- `modules/user-admin/components/view_access.yaml` shows status tag, role tags, signed-up date, and invite link
- Identity header shows avatar, name, and email (no `extra` — signed-up and invite link are in the access sidebar)
- Access card status tag shows: green "Active" / red "Disabled" / blue "Open Invite"
- Role tags display only the roles assigned to the user
- Edit button in page_actions links to users-edit with the same user_id
- Page fetches user data and sets state on mount (same pattern as users-edit)
- View page is accessible by navigating to the users-view page ID with a `user_id` URL query
- Lowdefy build succeeds with no errors

## Files

- `modules/user-admin/pages/users-view.yaml` — **create** — two-column read-only view page
- `modules/user-admin/components/view_user.yaml` — **create** — identity header + DataDescriptions + attributes + view_extra
- `modules/user-admin/components/view_access.yaml` — **create** — sidebar access card with roles, status, dates
- `apps/demo/modules/user-admin/vars.yaml` — **modify** — add profile_view_config and attributes_view_config

## Notes

- The `get_user` request is reused from the existing edit page (same `_ref: ../requests/get_user.yaml`). Verify the request returns all needed fields (profile, email, global_attributes, apps, roles, disabled, invite, is_user, sign_up).
- The `roles` module var must be available for the view_access component — it's already required in the module definition and provided by the consumer.
- Check what URL query parameter users-edit expects (`user_id` based on `_input: user_id` in users-edit.yaml) and ensure consistency.
