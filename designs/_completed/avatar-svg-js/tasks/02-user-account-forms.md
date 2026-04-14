# Task 2: User-Account Forms — \_js Preview, Shuffle, Color Init, SetState-before-CallApi

## Context

Task 1 created the shared `.njk` template at `modules/shared/profile/generate-avatar-svg.js.njk` and the `avatar_colors` module var. This task updates the user-account module's forms to:

1. Replace the `_nunjucks` SVG preview in `form_profile.yaml` with `_js` + `_ref` to the shared template
2. Replace the shuffle button's `_json.parse` + `_nunjucks` with standard operators
3. Add `SetState` before `CallAPI` on `edit-profile.yaml` and `create-profile.yaml` to generate the SVG client-side before saving
4. Add default color initialization on `create-profile.yaml` for first-time profile creation

The prefix for user-account is `contact.profile`.

### Current state of files:

**`form_profile.yaml`** — Lines 9-60: `avatar_preview` Img block uses nested `_nunjucks` for SVG. Lines 72-98: `shuffle_color` Button uses `_json.parse` + `_nunjucks` with `palette[ms % count] | dump`.

**`edit-profile.yaml`** — Lines 47-59: onClick has Validate → CallAPI → Link. No SetState.

**`create-profile.yaml`** — Lines 13-33: onInit sets `contact.profile` and `contact.email` from `_user`, plus birthday handling. Lines 57-77: onClick has Validate → CallAPI → Reset → Link. No SetState and no color initialization.

## Task

### 1. Update `form_profile.yaml` — avatar preview

Replace the `_nunjucks` SVG generation in the `avatar_preview` Img block (lines 18-60) with the shared `_js` + `_ref` pattern.

Replace the entire `properties` block of `avatar_preview`:

```yaml
- id: avatar_preview
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
        - "User avatar for "
        - _string.concat:
            - _if_none:
                - _state: contact.profile.given_name
                - ""
            - " "
            - _if_none:
                - _state: contact.profile.family_name
                - ""
```

### 2. Update `form_profile.yaml` — shuffle button

Replace the shuffle button's `SetState` params (lines 86-98) to use standard operators instead of `_json.parse` + `_nunjucks`:

```yaml
events:
  onClick:
    - id: next_color
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
```

### 3. Update `create-profile.yaml` — add default color init

In the `onInit` events (line 14), add a SetState for `contact.profile.avatar_color` that assigns a random color. Add this as a new event after the existing `init` SetState:

```yaml
events:
  onInit:
    - id: init
      type: SetState
      params:
        contact.profile:
          _user: profile
        contact.email:
          _user: email
        contact.profile.birthday:
          _if:
            test:
              _ne:
                - _user: profile.birthday
                - null
            then:
              _date:
                _if_none:
                  - _user: profile.birthday
                  - 2099-01-01
            else: null
    - id: init_avatar_color
      type: SetState
      params:
        contact.profile.avatar_color:
          _if_none:
            - _state: contact.profile.avatar_color
            - _get:
                from:
                  _module.var: avatar_colors
                key:
                  _math.floor:
                    _product:
                      - _math.random: true
                      - _array.length:
                          _module.var: avatar_colors
```

This uses `_if_none` so it only assigns a color if one isn't already stored (e.g. from a prior admin-invite). Same random pattern as contacts and user-admin.

### 4. Update `create-profile.yaml` — add SetState before CallAPI

In the onClick events (line 57), add a `SetState` that generates the SVG **before** the `CallAPI`:

```yaml
events:
  onClick:
    - id: validate
      type: Validate
      params:
        regex: ^contact\.
    - id: generate_avatar
      type: SetState
      params:
        contact.profile.picture:
          _js:
            _ref:
              path: modules/shared/profile/generate-avatar-svg.js.njk
              vars:
                prefix: contact.profile
    - id: create_profile
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: create-profile
        payload:
          contact:
            _state: contact
      messages:
        success: Profile created.
    - id: reset
      type: Reset
    - id: link_to_router
      type: Link
      params:
        home: true
```

### 5. Update `edit-profile.yaml` — add SetState before CallAPI

In the onClick events (line 47), add a `SetState` between Validate and CallAPI:

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
    - id: update_profile
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: update-profile
        payload:
          contact:
            _state: contact
      messages:
        success: Profile updated.
    - id: link_to_profile
      type: Link
      params:
        pageId:
          _module.pageId: profile
```

## Acceptance Criteria

- `form_profile.yaml` avatar preview uses `_js` + `_ref` to the shared `.njk` template with `prefix: contact.profile`
- `form_profile.yaml` shuffle button uses `_get` + `_math.floor` + `_product` + `_math.random` instead of `_json.parse` + `_nunjucks`
- `create-profile.yaml` onInit assigns a random `avatar_color` from the palette (only when not already set)
- `create-profile.yaml` onClick generates SVG via SetState before CallAPI
- `edit-profile.yaml` onClick generates SVG via SetState before CallAPI
- The avatar preview in the form updates reactively as the user types their name
- Lowdefy build succeeds

## Files

- `modules/user-account/components/form_profile.yaml` — **modify** — replace nunjucks preview and shuffle with \_js/\_ref and standard operators
- `modules/user-account/pages/create-profile.yaml` — **modify** — add color init on onInit, add SetState before CallAPI
- `modules/user-account/pages/edit-profile.yaml` — **modify** — add SetState before CallAPI

## Notes

- The `_ref` path `modules/shared/profile/generate-avatar-svg.js.njk` resolves from the config root (`apps/demo/`).
- The `_js` operator in the preview evaluates reactively as state changes — the `state()` calls inside the JS read live values, so the preview updates as the user types.
- The create-profile color init uses `_if_none` because the profile may already have a color from a prior admin-invite. Only set it if it's null.
