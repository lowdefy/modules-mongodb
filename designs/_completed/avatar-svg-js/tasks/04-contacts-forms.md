# Task 4: Contacts Forms — Add Avatar Preview, Create Random Color, SetState-before-CallApi

## Context

Task 1 created the shared `.njk` template and `avatar_colors` module var. This task updates the contacts module's forms to generate SVGs client-side.

The prefix for contacts is `contact.profile`.

Unlike user-account and user-admin, the contacts module **does not currently have an avatar preview** in its form. This task adds one.

### Current state of files:

**`form_contact.yaml`** — A Box with `_build.array.concat` blocks: title selector (conditional), name fields, email field, extended profile fields injection, details section (notes), form_attributes injection, and companies section. No avatar preview exists. The form is used by both `contact-new.yaml` and `contact-edit.yaml` (with `email_disabled: true` var).

**`contact-new.yaml`** — Lines 63-88: create button onClick has Validate → CallAPI (create-contact) → Reset → Link. No `onInit` or `onMount` events — the page has no state initialization. No avatar color assignment.

**`contact-edit.yaml`** — Lines 48-52: onMount sets state from `get_contact.0` request. Lines 111-132: save button onClick has Validate → CallAPI (update-contact) → Reset → Link. The existing `contact.profile.avatar_color` will be loaded from DB into state.

## Task

### 1. Update `form_contact.yaml` — add avatar preview

Add an avatar preview block at the top of the form, before the title conditional. Insert it as the first item in the `_build.array.concat` array:

```yaml
id: form_contact
type: Box
blocks:
  _build.array.concat:
    # Avatar preview
    - - id: avatar_preview
        type: Img
        style:
          textAlign: center
          marginBottom: 16
          .element:
            width: 100px
            borderRadius: 50%
        properties:
          src:
            _js:
              _ref:
                path: modules/shared/profile/generate-avatar-svg.js.njk
                vars:
                  prefix: contact.profile
          alt:
            _string.concat:
              - "Avatar for "
              - _string.concat:
                  - _if_none:
                      - _state: contact.profile.given_name
                      - ""
                  - " "
                  - _if_none:
                      - _state: contact.profile.family_name
                      - ""
    # Title (conditional)
    - _build.if:
        test:
          _module.var: show_title
        ...rest of existing blocks unchanged...
```

Insert the avatar preview array item (`- - id: avatar_preview ...`) as the first element of the `_build.array.concat` list. All existing blocks shift down but remain unchanged.

### 2. Update `contact-new.yaml` — add random color on init and SetState before CallAPI

The page currently has no `events` section at the top level. Add `onInit` to assign a random avatar color:

In the `_ref` vars, add an `events` section:

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: contact-new
    title:
      _string.concat:
        - "New "
        - _module.var: label
    hide_title: true
    events:
      onInit:
        - id: init_avatar_color
          type: SetState
          params:
            contact.profile.avatar_color:
              _get:
                from:
                  _module.var: avatar_colors
                key:
                  _math.floor:
                    _product:
                      - _math.random: true
                      - _array.length:
                          _module.var: avatar_colors
    blocks: ...existing blocks unchanged...
```

Then in the create button onClick events (line 63), add a `generate_avatar` SetState between Validate and CallAPI:

```yaml
events:
  onClick:
    - id: validate
      type: Validate
    - id: generate_avatar
      type: SetState
      params:
        contact.profile.picture:
          _js:
            _ref:
              path: modules/shared/profile/generate-avatar-svg.js.njk
              vars:
                prefix: contact.profile
    - id: create_contact
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: create-contact
        payload:
          contact:
            _state: contact
      messages:
        success:
          _string.concat:
            - _module.var: label
            - " created."
    - id: reset
      type: Reset
    - id: go_detail
      type: Link
      params:
        pageId:
          _module.pageId: contact-detail
        urlQuery:
          _id:
            _actions: create_contact.response.contactId
```

### 3. Update `contact-edit.yaml` — add SetState before CallAPI

In the save button onClick events (line 111), add a `generate_avatar` SetState between Validate and CallAPI:

```yaml
events:
  onClick:
    - id: validate
      type: Validate
    - id: generate_avatar
      type: SetState
      params:
        contact.profile.picture:
          _js:
            _ref:
              path: modules/shared/profile/generate-avatar-svg.js.njk
              vars:
                prefix: contact.profile
    - id: update_contact
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: update-contact
        payload:
          contact:
            _state: contact
      messages:
        success:
          _string.concat:
            - _module.var: label
            - " updated."
    - id: reset
      type: Reset
    - id: back
      type: Link
      params:
        back: true
```

## Acceptance Criteria

- `form_contact.yaml` has an avatar preview Img block at the top using `_js` + `_ref` with `prefix: contact.profile`
- `contact-new.yaml` assigns a random `avatar_color` on init
- `contact-new.yaml` generates SVG via SetState before CallAPI
- `contact-edit.yaml` generates SVG via SetState before CallAPI
- The avatar preview in the form updates reactively as the user types names
- Lowdefy build succeeds

## Files

- `modules/contacts/components/form_contact.yaml` — **modify** — add avatar preview at top of form
- `modules/contacts/pages/contact-new.yaml` — **modify** — add random color init + SetState before CallAPI
- `modules/contacts/pages/contact-edit.yaml` — **modify** — add SetState before CallAPI

## Notes

- The contacts form doesn't need a shuffle button — the design specifies shuffle only on user-account edit-profile. Create-contact just gets a random color on init.
- On edit, `avatar_color` is loaded from the DB into state via the `set_state` event in `contact-edit.yaml` (line 48-52). The SetState-before-CallAPI regenerates the SVG using the stored color, so only initials change if the name changed.
