# Profile View Layouts

## Problem

The three "person view" pages — user profile, contact detail, and user-admin — share a common structure (avatar, name, email, profile fields) but render them inconsistently with several UX issues:

1. **Avatar feels disconnected.** A standalone 100px centered circle above everything. No visual connection to the person's name or identity.

2. **Email feels misplaced.** Wedged as a separate Descriptions block between the avatar and profile data. Email is identity — it should live with the avatar and name, not float as a data field.

3. **No attributes on view pages.** Global and app attributes are only visible on the user-admin edit form. The user profile page and contact detail page show no attributes — there's no read-only display.

4. **No read-only user view in user-admin.** The admin module only has an edit page (`users-edit.yaml`). There's no way to view a user's profile without entering edit mode.

5. **DataView label-above-value layout.** Profile views currently use DataView with `sectionCards: false` and `maxColumns: 2`. The vertical label stacking wastes horizontal space on these narrow (600px) views. DataDescriptions solves this with bordered horizontal labels.

## Current State

### User Profile Page (`user-account/profile.yaml`)

Card containing `view_profile.yaml`:

```
┌──────────────────────────────────────┐
│          [Avatar 100px]              │  ← centered, disconnected
│                                      │
│  Email: jb@apelectric.com           │  ← separate Descriptions block
│                                      │
│  First Name    Family Name           │  ← DataView, label-above-value
│  Jordan        Bell                  │
│  Work Number   Mobile Number         │
│  +1 403...     +27 82...             │
│  Department    Job Title             │
│  Procurement   Procurement Lead      │
└──────────────────────────────────────┘
```

Data source: `_user: profile`, `_user: email`

No attributes displayed. (`_user: global_attributes`, `_user: app_attributes`, and `_user: roles` are available via `userFields` config but not used on this page.)

### Contact Detail Page (`contacts/contact-detail.yaml`)

Two-column layout (14/10 span). Main column Card containing `view_contact.yaml`:

```
┌──────────────────────────────────────┐
│  Email: dave@sparkselectric.com      │  ← Descriptions
│                                      │
│  First Name    Family Name           │  ← DataView
│  Dave          Wilson                │
│  ...fields...                        │
│                                      │
│  Notes: Internal details text...     │  ← conditional Descriptions
└──────────────────────────────────────┘
```

Sidebar: company tiles + event tiles.

Data source: `_request: get_contact.0`. Full document available — `profile`, `email`, `global_attributes`, `apps.{app}.app_attributes` all accessible.

No avatar on contact detail. No attributes displayed.

### User-Admin Edit Page (`user-admin/users-edit.yaml`)

Single Card with mixed view + form content:

```
┌──────────────────────────────────────┐
│          [Avatar 100px]              │  ← SVG initials (see avatar-svg-js design)
│  Signed up at 2025-02-20 10:00      │  ← Paragraph
│  https://app.com/login?hint=email   │  ← copyable invite link
│  Email: [jb@apelectric.com]         │  ← disabled TextInput
│  ───── Profile ─────                │
│  [Title ▾] [First Name] [Last Name] │  ← form fields
│  [Phone]  [Department] [Job Title]  │
│  [Birthday]                          │
│  ───── Access ─────                 │
│  ── Global Attributes ──            │  ← divider (conditional)
│  [Language ▾] [Timezone ▾]          │  ← form fields
│  [Employee Number] [Notes]           │
│  ── App Attributes ──               │  ← divider (conditional)
│  [Cost Centre] [Region ▾]           │
│  [Access Level ▾] [Can Approve ◉]   │
│  [Invite ◉] [Roles ▾▾] [Disabled ◉]│
└──────────────────────────────────────┘
```

Data source: `_state: user` (full document in state after fetch).

Attributes ARE visible here — but only as editable form fields, not read-only display.

### Shared Profile Configuration

All three modules reference the same shared profile files (`apps/demo/modules/shared/profile/`):

| File               | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `form_fields.yaml` | Form input definitions (phone, department, job_title, birthday) |
| `set_fields.yaml`  | API transformation rules for save                               |
| `view_config.yaml` | DataView formConfig items for display                           |

Wired via module vars: `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_config`.

### Attribute Handling

Attributes are currently **edit-only** in user-admin:

- `components.global_attributes_fields` → form fields for `user.global_attributes.*`
- `components.app_attributes_fields` → form fields for `user.apps.{app}.app_attributes.*`
- Template components (`form_global_attributes.yaml`, `form_app_attributes.yaml`) conditionally show a Divider + injected fields

No view equivalent exists. User profile and contact detail pages have no attribute display at all.

## Solution

### Design Principles

1. **Identity header** — avatar + name + email form a single cohesive block
2. **DataDescriptions for data** — bordered horizontal-label layout for profile fields and attributes
3. **Optional sections** — attributes only appear when the consumer provides a view config
4. **Same pattern across pages** — all four view pages follow the same visual structure
5. **Extra content slot** — consumers can inject arbitrary blocks after the standard sections

### Page Layout Pattern

All person view pages follow this structure:

```
┌──────────────────────────────────────────┐
│  [Avatar]  Name Surname                  │
│            email@example.com             │
├──────────────────────────────────────────┤
│  Profile                                 │
│  ┌─────────────┬─────────────────────┐   │
│  │ First Name  │ Jordan              │   │
│  ├─────────────┼─────────────────────┤   │
│  │ Last Name   │ Bell                │   │
│  ├─────────────┼─────────────────────┤   │
│  │ Work Number │ 🇨🇦 +1 403 555 0101 │   │
│  ├─────────────┼─────────────────────┤   │
│  │ Department  │ Procurement         │   │
│  └─────────────┴─────────────────────┘   │
│                                          │
│  Attributes                (optional)    │
│  ┌──────────────┬────────────────────┐   │
│  │ Language     │ English            │   │
│  ├──────────────┼────────────────────┤   │
│  │ Timezone     │ Africa/JHB         │   │
│  ├──────────────┼────────────────────┤   │
│  │ Cost Centre  │ ENG-001            │   │
│  └──────────────┴────────────────────┘   │
│                                          │
│  [consumer extra content slot]           │
└──────────────────────────────────────────┘
```

### 1. Profile Identity Header (Shared Component)

Replace the disconnected avatar and separate email with a horizontal identity block. Implemented as a shared `_ref` component at `modules/shared/layout/identity-header.yaml` — alongside existing shared layout components (`card.yaml`, `floating-actions.yaml`, `auth-page.yaml`).

**Template:** `modules/shared/layout/identity-header.yaml`

```yaml
# shared layout component — accepts vars for data binding
id: profile_header
type: Box
style:
  display: flex
  alignItems: center
  gap: 16px
  marginBottom: 16
blocks:
  - id: avatar
    type: Avatar
    layout:
      flex: 0 0 auto
    properties:
      size: 80
      src:
        _var: avatar_src
      icon: UserOutlined
  - id: identity_text
    type: Box
    layout:
      flex: 1 1 auto
    blocks:
      _build.array.concat:
        - - id: display_name
            type: Title
            style:
              marginBottom: 0
            properties:
              level: 4
              content:
                _var: name
          - id: email
            type: Paragraph
            style:
              marginBottom: 0
            properties:
              type: secondary
              content:
                _var: email
        - _var:
            key: extra
            default: []
```

The `extra` var accepts an array of blocks rendered below the email line. This is where modules place contextual secondary info (signed-up date, invite link, etc.).

**Usage per module:**

```yaml
# user-account/components/view_profile.yaml
- _ref:
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

# contacts/components/view_contact.yaml
- _ref:
    path: modules/shared/layout/identity-header.yaml
    vars:
      avatar_src:
        _request: get_contact.0.profile.picture
      name:
        _request: get_contact.0.profile.name
      email:
        _request: get_contact.0.email
      # no extra — contacts don't have sign_up

# user-admin/components/view_user.yaml (view page)
# No extra — signed-up date and invite link are in the access sidebar tile
- _ref:
    path: modules/shared/layout/identity-header.yaml
    vars:
      avatar_src:
        _state: user.profile.picture
      name:
        _state: user.profile.name
      email:
        _state: user.email
```

The `_ref` vars are build-time substitutions — the operator expressions (`_user:`, `_request:`, `_state:`) are substituted as-is and resolved at runtime. Updates to the header layout propagate to all modules automatically.

The avatar uses the `Avatar` block (Ant Design), which renders a `UserOutlined` icon as fallback when `src` is null. This handles newly invited users or profiles that haven't been saved yet — `profile.picture` is generated client-side on form save (see `designs/avatar-svg-js/design.md`) and may not exist until the user edits their profile.

The signed-up date is rendered on any page where the data is available — user-account (via `get_my_profile` request) and user-admin (via `_state: user`). Contacts don't have sign-up data.

### 2. Profile Data with DataDescriptions

Replace DataView with DataDescriptions on all view pages. Same `data` and `formConfig` — just a different renderer.

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
        - <profile_object>
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
```

This is the same two-mode behavior from the profile-view-config design:

- **No config:** DataDescriptions auto-renders all non-null fields from the profile object
- **With config:** Only listed fields render with explicit order and labels

The shared `view_config.yaml` (`apps/demo/modules/shared/profile/view_config.yaml`) works unchanged — it provides the same formConfig items.

### 3. Attributes Section

A new optional section below profile data. Displays both global and app attributes in a single DataDescriptions block. Only appears when the consumer provides an `attributes_view_config` module var.

```yaml
- id: attributes_data
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
        - <global_attributes_object>
        - <app_attributes_object>
    formConfig:
      _module.var:
        key: components.attributes_view_config
        default: []
```

**Data source per module:**

| Module       | Global Attributes                           | App Attributes                                      |
| ------------ | ------------------------------------------- | --------------------------------------------------- |
| user-account | `_user: global_attributes`                  | `_user: app_attributes`                             |
| contacts     | `_request: get_contact.0.global_attributes` | `_get` from `_request: get_contact.0` with app path |
| user-admin   | `_state: user.global_attributes`            | `_state: user.app_attributes`                       |

**User-account data access:** The `_user` context provides `global_attributes` and `app_attributes` via the `userFields` config in `lowdefy.yaml`. No request is needed for attributes on the user's own profile page.

An unconditional `get_my_profile` request is still present — it provides `sign_up.timestamp` for the identity header's signed-up date (not available via `_user:`). A single `findOne` by `sub` is negligible cost.

**App attributes path resolution:**

```yaml
# Contacts
_get:
  key:
    _string.concat:
      - "apps."
      - _module.var: app_name
      - ".app_attributes"
  from:
    _request: get_contact.0
```

The consumer's `attributes_view_config` provides a flat list of keys from the merged object. Since global and app attribute keys are defined by the consumer, key collisions are the consumer's responsibility (and unlikely in practice — different domains).

**Consumer configuration:**

```yaml
# apps/demo/modules/shared/profile/attributes_view_config.yaml
# Global attributes
- key: preferred_language
  title: Preferred Language
- key: timezone
  title: Timezone
- key: employee_number
  title: Employee Number
- key: internal_details
  title: Notes
  component: text_area
# App attributes
- key: cost_centre
  title: Cost Centre
- key: region
  title: Region
- key: access_level
  title: Access Level
- key: can_approve
  title: Can Approve
```

**Module var wiring:**

```yaml
# apps/demo/modules/user-account/vars.yaml
components:
  attributes_view_config:
    _ref: modules/shared/profile/attributes_view_config.yaml

# apps/demo/modules/contacts/vars.yaml (if contacts module is configured for this app)
components:
  attributes_view_config:
    _ref: modules/shared/profile/attributes_view_config.yaml
```

### 4. Extra Content Slot

All view pages include a `components.view_extra` module var injection point after the standard sections (identity header, profile, attributes). This lets consumers place arbitrary Lowdefy blocks without overriding the entire view component.

```yaml
# Inside the view component, after attributes
- _module.var:
    key: components.view_extra
    default: []
```

The injection point is inside the card, below attributes. Consumers can add:

- Additional DataDescriptions sections (e.g., project-specific data)
- Custom display blocks
- Conditional content with their own visibility logic

This is additive — it doesn't replace any standard section. For full control, consumers can still override the entire view component via existing vars (`components.view_profile`, `components.detail_fields`).

Contacts also retains its existing `components.main_tiles` (after the card) and `components.sidebar_tiles` (sidebar column) injection points.

### 5. Page-Specific Details

#### User Profile Page (`user-account`)

```
┌──────────────────────────────────────┐
│  [Avatar]  Jordan Bell               │
│            jb@apelectric.com         │
│                                      │
│  Profile                             │
│  ┌─────────────┬────────────────┐    │
│  │ First Name  │ Jordan         │    │
│  │ Last Name   │ Bell           │    │
│  │ Work Number │ +1 403 555..   │    │
│  │ Department  │ Procurement    │    │
│  │ Job Title   │ Proc. Lead     │    │
│  │ Birthday    │ 1988-03-15     │    │
│  └─────────────┴────────────────┘    │
│                                      │
│  Attributes              (optional)  │
│  ┌──────────────┬───────────────┐    │
│  │ Language     │ English       │    │
│  │ Timezone     │ Africa/JHB    │    │
│  │ Cost Centre  │ ENG-001       │    │
│  │ Region      │ Gauteng        │    │
│  └──────────────┴───────────────┘    │
│                                      │
│  [consumer extra content]            │
└──────────────────────────────────────┘
  [Edit Profile]  [Logout]
```

**Changes to `view_profile.yaml`:**

- Remove standalone `Img` avatar block
- Remove separate `email_display` Descriptions block
- Add identity header via `_ref: modules/shared/layout/identity-header.yaml`
- Replace DataView with DataDescriptions
- Add optional attributes DataDescriptions section
- Add `components.view_extra` injection point

**New request:** Add an unconditional `get_my_profile` request that fetches by `_user: sub`. This provides `sign_up.timestamp` for the identity header's signed-up date (not available via `_user:`). Attributes come from `_user:` directly and don't depend on this request. A single `findOne` by `sub` is negligible cost, and making the request unconditional keeps the identity header self-contained.

#### Contact Detail Page (`contacts`)

```
┌─────────────────────────────┐  ┌────────────────┐
│  [Avatar]  Dave Wilson      │  │  Companies     │
│            dave@sparks.com  │  │  ┌──────────┐  │
│                             │  │  │ Sparks   │  │
│  Profile                    │  │  │ Electric │  │
│  ┌──────────┬───────────┐   │  │  └──────────┘  │
│  │ Name     │ Dave      │   │  │                │
│  │ Phone    │ +1 403... │   │  │  Events        │
│  │ Job Title│ Estimator │   │  │  ┌──────────┐  │
│  └──────────┴───────────┘   │  │  │ Created  │  │
│                             │  │  │ Updated  │  │
│  Attributes      (optional) │  │  └──────────┘  │
│  ┌──────────┬───────────┐   │  └────────────────┘
│  │ Language │ English   │   │
│  │ Notes    │ Internal..│   │
│  └──────────┴───────────┘   │
│                             │
│  [consumer extra content]   │
└─────────────────────────────┘
```

**Changes to `view_contact.yaml`:**

- Add identity header via `_ref: modules/shared/layout/identity-header.yaml`
- Remove separate `email_display` Descriptions block
- Replace DataView with DataDescriptions
- Add optional attributes DataDescriptions section
- **Remove hardcoded notes section** — `internal_details` is a consumer-defined global attribute, not a core contacts concept. Consumers include it in `attributes_view_config` if they want it displayed (e.g., `{key: "internal_details", title: "Notes"}`). DataDescriptions auto-detects long text as `longText` type and renders with `span: "filled"`.
- Add `components.view_extra` injection point

#### User-Admin View Page (New: `users-view.yaml`)

A new read-only page in user-admin, following the same two-column pattern as contact-detail.

```
┌─────────────────────────────┐  ┌────────────────┐
│  [Avatar]  Jordan Bell      │  │  Access        │
│            jb@apelectric.com│  │  ┌──────────┐  │
│                             │  │  │ Roles:   │  │
│  Profile                    │  │  │ admin    │  │
│  ┌──────────┬───────────┐   │  │  │ proc-lead│  │
│  │ Name     │ Jordan    │   │  │  │          │  │
│  │ Phone    │ +1 403... │   │  │  │ Status:  │  │
│  │ Dept     │ Procure.. │   │  │  │ Active ● │  │
│  │ Job Title│ Proc Lead │   │  │  │          │  │
│  │ Birthday │ 1988-03-15│   │  │  │ Signed Up│  │
│  └──────────┴───────────┘   │  │  │ 2025-02  │  │
│                             │  │  └──────────┘  │
│  Attributes      (optional) │  │                │
│  ┌──────────┬───────────┐   │  │  Events        │
│  │ Language │ English   │   │  │  ┌──────────┐  │
│  │ Timezone │ Africa/JHB│   │  │  │ ...      │  │
│  │ Cost Ctr │ ENG-001   │   │  │  └──────────┘  │
│  │ Region   │ Gauteng   │   │  └────────────────┘
│  │ Access Lv│ Elevated  │   │
│  │ Approve  │ Yes       │   │
│  └──────────┴───────────┘   │
└─────────────────────────────┘
  [Edit]
```

**New files:**

- `modules/user-admin/pages/users-view.yaml` — page definition (two-column layout)
- `modules/user-admin/components/view_user.yaml` — identity header + DataDescriptions + attributes + `view_extra`

**Sidebar tiles:**

- **Access card** — roles (as tags), active/disabled status, signed-up date, invite link (if pending)
- **Events tile** — audit events (reuse from contacts or create user-admin equivalent)

**Template:** `modules/user-admin/components/view_access.yaml`

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

The roles tags are built from the `roles` module var (plain string array, e.g. `["mrm", "user-admin-demo"]`) filtered by the user's assigned roles. Each role value is rendered directly as the tag content. Status derives from `user.disabled` and `user.invite.open` — same logic as `get_all_users` status projection. Signed-up date and invite link reuse the same patterns as the identity header `extra` but with `_state:` bindings.

**Navigation:** Clicking a user in the table goes to the view page. An "Edit" button on the view page links to the edit page. This matches the contacts pattern (list → detail → edit).

**Module var for access tile:** The access sidebar content is a default component that consumers can override via a `components.view_access_tile` var.

**Extra content:** `components.view_extra` injection point after attributes, same as other view pages.

### 6. Module Var Summary

**New vars (all modules):**

| Var                                 | Type                      | Description                                                                                     |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `components.attributes_view_config` | Array of formConfig items | Optional. When provided, shows an "Attributes" section with merged global + app attributes.     |
| `components.view_extra`             | Array of blocks           | Optional. Arbitrary Lowdefy blocks injected after the standard view sections (inside the card). |

**Existing vars (unchanged):**

| Var                              | Used by                             |
| -------------------------------- | ----------------------------------- |
| `components.profile_view_config` | Profile DataDescriptions formConfig |
| `components.profile_fields`      | Profile edit form fields            |
| `components.profile_set_fields`  | API save field mapping              |

**New vars (contacts only):**

| Var                                | Type                        | Description                                                                                                              |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `components.attributes_set_fields` | Array of set field mappings | Optional. API set fields for consumer-defined attributes (e.g., `internal_details`). Used in create/update contact APIs. |

**New vars (user-admin only):**

| Var                           | Type           | Description                                   |
| ----------------------------- | -------------- | --------------------------------------------- |
| `components.view_access_tile` | Block override | Optional override for the access sidebar card |

### 7. Shared Attributes View Config

```yaml
# apps/demo/modules/shared/profile/attributes_view_config.yaml
# Global attributes
- key: preferred_language
  title: Preferred Language
- key: timezone
  title: Timezone
- key: employee_number
  title: Employee Number
- key: internal_details
  title: Notes
  component: text_area
# App attributes
- key: cost_centre
  title: Cost Centre
- key: region
  title: Region
- key: access_level
  title: Access Level
- key: can_approve
  title: Can Approve
```

Note: `internal_details` (previously hardcoded as "Notes" in the contacts view) is now just another consumer-defined attribute. The consumer controls whether it appears and what it's labelled. The `component: text_area` hint forces `longText` rendering with `span: "filled"` in DataDescriptions, regardless of content length — without it, short notes (under 200 chars with no newlines) would render as inline `string` type.

This file is referenced by all three modules via their vars:

```yaml
# In each module's app vars
components:
  attributes_view_config:
    _ref: modules/shared/profile/attributes_view_config.yaml
```

The consumer decides which attributes to show and in what order. If a consumer doesn't provide `attributes_view_config`, no attributes section appears.

### 8. User-Admin Edit Page Updates

The edit page (`users-edit.yaml`) also uses the shared identity header with `extra` for signed-up date and invite link. Replace the current vertical stack of avatar + signed-up + invite link + email with:

```
┌──────────────────────────────────────┐
│  [Avatar]  Jordan Bell               │
│            jb@apelectric.com         │
│            Signed up: 2025-02-20     │
│            Invite: https://app.com/..│
│  ───── Profile ─────                │
│  [Title ▾] [First Name] [Last Name] │
│  ...form fields...                   │
│  ───── Access ─────                 │
│  ...attribute fields + access form.. │
└──────────────────────────────────────┘
```

Uses the same `_ref: modules/shared/layout/identity-header.yaml` with signed-up and invite link passed via `extra` (same blocks as the view page). The disabled email TextInput is removed — email is in the header. The rest of the form is unchanged.

## File Changes

### Shared: modules/shared/layout

| File                   | Change                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `identity-header.yaml` | **New.** Shared identity header component (avatar + name + email). Accepts `avatar_src`, `name`, `email`, `extra` vars. |

### Module: user-account

| File                           | Change                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `module.lowdefy.yaml`          | Add `attributes_view_config`, `view_extra` to components var description                                                                               |
| `components/view_profile.yaml` | Replace avatar + email + DataView with `_ref: modules/shared/layout/identity-header.yaml` + DataDescriptions + optional attributes + `view_extra` slot |
| `pages/profile.yaml`           | Add unconditional `get_my_profile` request (provides signed-up date for identity header and full document for optional attributes section)             |

### Module: contacts

| File                           | Change                                                                                                                                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.lowdefy.yaml`          | Add `attributes_view_config`, `view_extra`, `attributes_set_fields` to components var description                                                                                                                                                                                  |
| `components/view_contact.yaml` | Add `_ref: modules/shared/layout/identity-header.yaml`, replace DataView with DataDescriptions (change `column` from 2 to 1), add optional attributes, remove hardcoded notes section, add `view_extra` slot                                                                       |
| `components/form_contact.yaml` | Remove hardcoded `internal_details` TextArea and "Details" divider. Add conditional "Details" divider wrapping `components.form_attributes` (divider shows only when consumer provides `form_attributes`). Consumer injects attribute fields via `components.form_attributes` var. |
| `api/create-contact.yaml`      | Remove hardcoded `global_attributes.internal_details` set field. Consumer provides attribute set fields via a new `components.attributes_set_fields` var.                                                                                                                          |
| `api/update-contact.yaml`      | Same as create — remove hardcoded `internal_details`, use `attributes_set_fields` var.                                                                                                                                                                                             |

### Module: user-admin

| File                                       | Change                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `module.lowdefy.yaml`                      | Add `profile_view_config`, `attributes_view_config`, `view_extra` to components var description. Add `users-view` page export. |
| `pages/users-view.yaml`                    | **New.** Two-column read-only view page.                                                                                       |
| `components/view_user.yaml`                | **New.** `_ref: modules/shared/layout/identity-header.yaml` + DataDescriptions + attributes + `view_extra` slot.               |
| `components/view_access.yaml`              | **New.** Read-only access sidebar (roles, status, dates).                                                                      |
| `pages/users-edit.yaml`                    | Replace avatar + email section with `_ref: modules/shared/layout/identity-header.yaml`.                                        |
| `components/view_user_avatar_preview.yaml` | Remove (replaced by identity header).                                                                                          |
| `components/view_email.yaml`               | Remove (email moves into identity header).                                                                                     |
| `components/view_signed_up.yaml`           | Remove (content moved into identity header extra and access tile).                                                             |
| `components/view_invite_link.yaml`         | Remove (content moved into identity header extra and access tile).                                                             |
| `pages/users.yaml`                         | Link table row click to users-view instead of users-edit.                                                                      |

### Consumer: apps/demo

| File                                                 | Change                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `modules/shared/profile/attributes_view_config.yaml` | **New.** Shared attributes formConfig items (includes `internal_details` as "Notes").                                    |
| `modules/shared/profile/attributes_form_fields.yaml` | **New.** Contacts form fields for `internal_details` (moved from hardcoded in contacts module).                          |
| `modules/shared/profile/attributes_set_fields.yaml`  | **New.** API set fields for `internal_details` (moved from hardcoded in contacts API).                                   |
| `modules/user-account/vars.yaml`                     | Add `components.attributes_view_config` ref.                                                                             |
| `modules/user-admin/vars.yaml`                       | Add `components.profile_view_config` and `components.attributes_view_config` refs.                                       |
| `modules/contacts/vars.yaml`                         | **New.** Add `components.attributes_view_config`, `components.form_attributes`, `components.attributes_set_fields` refs. |

### Dependencies

- **DataDescriptions** — Implemented. Profile and attribute sections use `DataDescriptions` for bordered horizontal-label layout.
- **Avatar SVG** — See `designs/avatar-svg-js/design.md`. The identity header's `Avatar` block handles null `profile.picture` with a `UserOutlined` fallback. SVG generation is client-side on form save, so pictures may be null for users who haven't yet edited their profile.

## Decisions

1. **Identity header as shared layout component with `extra` var.** The avatar, name, and email form a single horizontal block, implemented as a `_ref` component at `modules/shared/layout/identity-header.yaml` — alongside existing shared layout components. Uses the `Avatar` block (Ant Design) which renders a `UserOutlined` icon when `profile.picture` is null — handles newly invited users gracefully without generating SVGs as fallback (see `designs/avatar-svg-js/design.md`). An `extra` var accepts additional blocks below the email (signed-up date, invite link, etc.). Email is identity information — it belongs with the person's name, not as a data field. A shared component ensures consistency and propagates layout updates to all modules.

2. **Single "Attributes" section merging global + app.** The consumer defines one `attributes_view_config` that covers both global and app attributes. The data is merged via `_object.assign`. This is simpler than two separate sections. Key collisions are the consumer's responsibility but unlikely since they define both sets.

3. **Attributes only shown when config provided.** The `attributes_view_config` var is optional. When not provided, no attributes section appears. Modules work out of the box without attributes — consumers opt in by providing the config. The `_build.ne` visibility check handles this at build time.

4. **`internal_details` fully de-coupled from contacts module.** The contacts module currently hardcodes `global_attributes.internal_details` in the view, form, and APIs. This is a consumer-defined global attribute — the module shouldn't have special knowledge of it. Changes: (a) view — removed, consumer includes it in `attributes_view_config` (e.g., `{key: "internal_details", title: "Notes"}`), (b) form — removed, consumer injects via existing `components.form_attributes` var, (c) APIs — removed from hardcoded set fields, consumer provides via new `components.attributes_set_fields` var. The `component: text_area` hint in the view config forces `longText` rendering with `span: "filled"` in DataDescriptions — auto-detection alone is insufficient for short notes. This is a breaking change for existing consumers — any consumer that relies on `internal_details` working out of the box must migrate by providing the attribute via `attributes_view_config`, `form_attributes`, and `attributes_set_fields` vars.

5. **User-admin gets a read-only view page.** Following the contacts pattern (list → detail → edit). Admins can review a user's information without entering edit mode. The table links to view; view has an Edit button. This is a better UX for review workflows and matches the contact-detail pattern.

6. **User-account profile page fetches `sign_up.timestamp` via request.** The `_user` context provides `profile`, `email`, `global_attributes`, `app_attributes`, and `roles` via `userFields` — but not `sign_up.timestamp`. An unconditional `get_my_profile` request fetches this for the identity header's signed-up date. Minor cost (`findOne` by `sub`), and keeping it unconditional avoids coupling the header's signed-up date to other feature flags.

7. **DataDescriptions for all view sections.** Both profile data and attributes use DataDescriptions with `bordered: true`, `column: 1`, `size: small`. The `title` prop provides section headers. Single-column bordered tables across all view pages — horizontal label-value layout fits narrow (600px) view cards without needing multi-column.

8. **Signed-up date always rendered where available.** On user-account, the signed-up date is shown via the identity header's `extra` var (via `get_my_profile` request). On user-admin, the view page places signed-up date and invite link in the access sidebar tile (not in the identity header `extra`) to avoid duplication — the edit page uses `extra` since it has no sidebar. Contacts don't have sign-up data.

9. **formConfig items for attributes (same format as profile).** The `attributes_view_config` uses the same `{key, title?, component?}` format as `profile_view_config`. Consistent format, leverages DataDescriptions' preprocessing for type detection.

10. **Extra content slot for consumers.** All view pages include a `components.view_extra` injection point after standard sections. Consumers can add custom DataDescriptions, display blocks, or conditional content without overriding the entire view component. This complements existing full-replacement vars (`components.view_profile`, `components.detail_fields`).

## Non-Goals

- **Changing attribute edit forms.** The user-admin edit page keeps its existing form fields for attributes (`global_attributes_fields`, `app_attributes_fields`). This design only adds read-only display.
- **Editable attributes on profile page.** Users don't self-manage attributes — those are admin-controlled.
- **Custom identity header structure.** The header is a fixed pattern (Avatar + name + email + optional extra) in `modules/shared/layout`. Consumers who need a radically different layout can override the entire view component.

## Resolved Questions

1. **`company_ids` stays hardcoded in contacts.** It's a core contacts module concept — powers the company sidebar tile, has a MongoDB index, uses `_ref: module: companies, component: company-selector`, and the contacts module declares `companies` as a dependency. Unlike `internal_details` (a plain text field with no module-level behavior), `company_ids` has structural significance.

2. **Conditional divider pattern for `form_attributes`.** The module wraps `form_attributes` with a conditional "Details" divider — same pattern as `form_global_attributes.yaml` in user-admin. Divider shows only when the consumer provides `form_attributes` fields. Consumer provides just the field blocks (e.g., `internal_details` TextArea). Module owns the divider.
