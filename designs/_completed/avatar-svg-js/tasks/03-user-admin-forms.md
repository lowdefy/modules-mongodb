# Task 3: User-Admin Forms — \_js Preview, Invite Random Color, SetState-before-CallApi

## Context

Task 1 created the shared `.njk` template and `avatar_colors` module var. This task updates the user-admin module's forms to generate SVGs client-side.

The prefix for user-admin is `user.profile`.

### Current state of files:

**`view_user_avatar_preview.yaml`** — An Img block (id: `user_avatar`) that renders an SVG preview using nested `_nunjucks`. Used on both `users-edit.yaml` (line 75) and `users-invite.yaml` (line 70). Reads from `_state: user.profile.*`.

**`users-edit.yaml`** — Lines 139-158: save button onClick has Validate → CallAPI (update-user) → Reset → Link. The onMount (lines 32-65) fetches the user and sets state from the request. The existing `user.profile.avatar_color` will already be loaded from DB into state.

**`users-invite.yaml`** — Lines 98-117: invite button onClick has Validate → CallAPI (invite-user) → Reset → Link. The onMount (lines 32-60) either sets user from request data (existing invite) or creates a new user object with just email. No avatar_color initialization.

## Task

### 1. Update `view_user_avatar_preview.yaml` — replace nunjucks with \_js

Replace the entire file content. The current file has nested `_nunjucks` for SVG generation. Replace with `_js` + `_ref`:

```yaml
id: user_avatar
type: Img
style:
  textAlign: center
  marginBottom: 42
  .element:
    width: 100px
    borderRadius: 50%
properties:
  src:
    _js:
      _ref:
        path: modules/shared/profile/generate-avatar-svg.js.njk
        vars:
          prefix: user.profile
  alt:
    _string.concat:
      - "User avatar for "
      - _string.concat:
          - _if_none:
              - _state: user.profile.given_name
              - ""
          - " "
          - _if_none:
              - _state: user.profile.family_name
              - ""
```

### 2. Update `users-invite.yaml` — add random color init

In the `onMount` events, add a new SetState after the existing `set_user` event (line 60) to assign a random avatar color when creating a new invite (not when editing an existing one):

```yaml
- id: init_avatar_color
  type: SetState
  skip:
    _ne:
      - _state: user.profile.avatar_color
      - null
  params:
    user.profile.avatar_color:
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

The `skip` condition ensures this only runs when `avatar_color` is null (new invite). For existing invites loaded from DB, the color is already set.

### 3. Update `users-invite.yaml` — add SetState before CallAPI

In the invite button onClick events (line 98), add a `generate_avatar` SetState between Validate and CallAPI:

```yaml
events:
  onClick:
    - id: validate
      type: Validate
    - id: generate_avatar
      type: SetState
      params:
        user.profile.picture:
          _js:
            _ref:
              path: modules/shared/profile/generate-avatar-svg.js.njk
              vars:
                prefix: user.profile
    - id: invite_user
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: invite-user
        payload:
          user:
            _state: user
      messages:
        success: New invite created.
    - id: reset
      type: Reset
    - id: back
      type: Link
      params:
        pageId:
          _module.pageId: users
```

### 4. Update `users-edit.yaml` — add SetState before CallAPI

In the save button onClick events (line 140), add a `generate_avatar` SetState between Validate and CallAPI:

```yaml
events:
  onClick:
    - id: validate
      type: Validate
    - id: generate_avatar
      type: SetState
      params:
        user.profile.picture:
          _js:
            _ref:
              path: modules/shared/profile/generate-avatar-svg.js.njk
              vars:
                prefix: user.profile
    - id: update_user
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: update-user
        payload:
          user:
            _state: user
      messages:
        success: User updated.
    - id: reset
      type: Reset
    - id: back
      type: Link
      params:
        back: true
```

## Acceptance Criteria

- `view_user_avatar_preview.yaml` uses `_js` + `_ref` with `prefix: user.profile` (no `_nunjucks`)
- `users-invite.yaml` assigns a random `avatar_color` on init for new invites (skipped when editing existing invite)
- `users-invite.yaml` generates SVG via SetState before CallAPI
- `users-edit.yaml` generates SVG via SetState before CallAPI
- The avatar preview on both pages updates reactively as names are typed
- Lowdefy build succeeds

## Files

- `modules/user-admin/components/view_user_avatar_preview.yaml` — **modify** — replace nunjucks with \_js + \_ref
- `modules/user-admin/pages/users-invite.yaml` — **modify** — add random color init + SetState before CallAPI
- `modules/user-admin/pages/users-edit.yaml` — **modify** — add SetState before CallAPI
