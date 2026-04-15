# Avatar SVG: Replace Nunjucks with \_js and Shared \_ref

## Problem

Avatar SVG generation is duplicated across 8 files in 3 modules (user-account, user-admin, contacts). Each copy uses deeply nested `_nunjucks` templates (~30 lines each) to:

1. Compute initials from given_name + family_name
2. Build an SVG string with a gradient background
3. URI-encode it into a `data:image/svg+xml` URI

The nunjucks templates are hard to read and maintain. Adding a change (e.g. adjusting font size or SVG structure) requires editing every copy.

Additionally, some display components use the SVG template as a **fallback** when `profile.picture` is missing, rather than rendering a standard Avatar block with a user icon.

## Design Principles

1. **`profile.picture` is stored data, not a computed value.** It gets generated once (when the user saves the form) and stored in the DB. Every display point reads the stored value. This is identical to how a real profile photo upload would work -- if we add photo uploads later, everything just keeps working.

2. **Generate client-side only.** The SVG is generated on the client in edit forms, saved via the API, and read from DB everywhere else. No server-side SVG generation needed.

3. **Standard fallback for missing pictures.** When `profile.picture` is null (e.g. newly invited user who hasn't edited their profile), render a fallback (Avatar block default or HTML placeholder) -- never generate an SVG as fallback.

## Current State

### Server-side SVG generation (5 files -- to be removed)

These files generate `profile.picture` as an SVG data URI on every create/update:

| File                                               | Type                                                                          | Prefix            | Color                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- | ---------------------------- |
| `modules/user-account/api/profile-set-fields.yaml` | Shared fragment (`_ref`'d by `create-profile.yaml` and `update-profile.yaml`) | `contact.profile` | Hash of user ID into palette |
| `modules/user-admin/api/invite-user.yaml`          | API                                                                           | `user.profile`    | Hardcoded `#37474f/#546e7a`  |
| `modules/user-admin/api/update-user.yaml`          | API                                                                           | `user.profile`    | Hardcoded `#37474f/#546e7a`  |
| `modules/contacts/api/create-contact.yaml`         | API                                                                           | `contact.profile` | Hardcoded `#37474f/#546e7a`  |
| `modules/contacts/api/update-contact.yaml`         | API                                                                           | `contact.profile` | Hardcoded `#37474f/#546e7a`  |

Each contains ~30 lines of nested `_nunjucks`. All of this gets deleted.

### Client-side SVG preview (3 files -- to use shared \_ref)

| File                                                          | Prefix             | Purpose                             |
| ------------------------------------------------------------- | ------------------ | ----------------------------------- |
| `modules/user-account/components/form_profile.yaml`           | `contact.profile`  | Form preview while editing          |
| `modules/user-admin/components/view_user_avatar_preview.yaml` | `user.profile`     | Edit form avatar display            |
| `modules/user-account/components/avatar-svg-src.yaml`         | (inputs via \_var) | Reusable component -- to be deleted |

### Display components (read stored picture)

| File                                                  | Reads                             | Current Fallback          |
| ----------------------------------------------------- | --------------------------------- | ------------------------- |
| `modules/user-account/components/view_profile.yaml`   | `_user: profile.picture`          | None (broken img if null) |
| `modules/user-account/components/profile-avatar.yaml` | `_user: profile.picture`          | First letter of name      |
| Table renderers (contacts, user-admin)                | `profile.picture` from query data | None (broken img if null) |

## Proposed Solution

### 1. Shared `_js` operator via `.njk` template

Create `modules/shared/profile/generate-avatar-svg.js.njk` -- a nunjucks text template that produces JavaScript code at build time. The `_ref` renders the `.njk` with vars, producing a plain JS string that `_js` executes at runtime.

**Shared file** (`modules/shared/profile/generate-avatar-svg.js.njk`):

```javascript
// Build-time template: _ref renders this .njk with vars (e.g. prefix),
// producing a plain JS string that _js executes at runtime.
const gn = (state("{{ prefix }}.given_name") || "").trim();
const fn = (state("{{ prefix }}.family_name") || "").trim();
let initials;
if (gn && fn) initials = (gn[0] + fn[0]).toUpperCase();
else if (gn.length > 1) initials = gn.substring(0, 2).toUpperCase();
else if (gn) initials = gn.toUpperCase();
else initials = "?";
const from = state("{{ prefix }}.avatar_color.from") || "#37474f";
const to = state("{{ prefix }}.avatar_color.to") || "#546e7a";
const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${from}'/><stop offset='100%' stop-color='${to}'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><text x='64' y='64' dominant-baseline='central' text-anchor='middle' fill='white' font-family='sans-serif' font-size='48' font-weight='bold'>${initials}</text></svg>`;
return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
```

**Consumer usage**:

```yaml
# user-account form preview (Img src property)
src:
  _js:
    _ref:
      path: modules/shared/profile/generate-avatar-svg.js.njk
      vars:
        prefix: contact.profile

# user-admin form preview
src:
  _js:
    _ref:
      path: modules/shared/profile/generate-avatar-svg.js.njk
      vars:
        prefix: user.profile
```

**How it works:**

1. Build time: `_ref` renders the `.njk` template with `{ prefix: "contact.profile" }`, producing plain JS:
   ```javascript
   const gn = (state('contact.profile.given_name') || '').trim();
   ...
   ```
2. The YAML becomes `_js: "const gn = (state('contact.profile.given_name') ..."` -- a simple `_js` with a string literal.
3. Runtime: `_js` executes the code, reading live state values.

No `_string.concat`, no unusual operator nesting. The `.njk` file is just a build-time text template -- the resulting `_js` is a plain string.

### 2. Remove server-side SVG generation

Delete the ~30 lines of nested `_nunjucks` SVG template from each of the 5 API files. The APIs just pass through what the client sent:

```yaml
# Server API just passes through what the client sent
profile.picture:
  _payload: contact.profile.picture # or user.profile.picture
profile.avatar_color:
  _payload: contact.profile.avatar_color # or user.profile.avatar_color
```

### 3. Client forms: generate SVG on save

All edit forms that modify profile names use the same pattern: preview the SVG using the shared `_ref`, and run a SetState before the API call to include the generated SVG in the payload.

**Approach: SetState before API call**

On form submit, run a `SetState` action that generates the SVG and sets `profile.picture` before the API call:

```yaml
# user-account form (prefix: contact.profile)
events:
  onClick:
    - id: generate_avatar
      type: SetState
      params:
        contact.profile.picture:
          _js:
            _ref:
              path: modules/shared/profile/generate-avatar-svg.js.njk
              vars:
                prefix: contact.profile
    - id: save_profile
      type: CallApi
      params: ...
```

The Img preview and the SetState both use the same shared `_ref`, ensuring the preview matches what gets saved.

**Create flows — assign color and generate SVG:**

On create, the form assigns a random `avatar_color` on init and generates the SVG on save. Both `avatar_color` and `picture` are saved to the profile in the DB.

| Module       | Create form                      | Prefix            |
| ------------ | -------------------------------- | ----------------- |
| user-admin   | invite-user form                 | `user.profile`    |
| contacts     | create-contact form              | `contact.profile` |
| user-account | `form_profile.yaml` (first save) | `contact.profile` |

**Edit flows — preserve color, regenerate SVG:**

On edit, `avatar_color` is loaded from the DB into state. The SetState-before-CallApi regenerates the SVG using the existing color, so only the initials update if the name changed.

| Module       | Edit form                                     | Prefix            | Preview component                        |
| ------------ | --------------------------------------------- | ----------------- | ---------------------------------------- |
| user-account | `form_profile.yaml`                           | `contact.profile` | Existing preview in form                 |
| user-admin   | `view_user_avatar_preview.yaml` (parent form) | `user.profile`    | Existing `view_user_avatar_preview.yaml` |
| contacts     | `form_contact.yaml` (parent form)             | `contact.profile` | Add avatar preview                       |

Each form's save action includes the SetState-before-CallApi pattern.

### 4. Display fallback for missing pictures

Update display components to render a fallback when `profile.picture` is null:

**Header avatar** (`profile-avatar.yaml`):

```yaml
src:
  _user: profile.picture
# Remove the content/first-letter fallback
# Avatar block renders default user icon when src is null
```

**Table renderers** -- add conditional fallback for missing picture in the `__nunjucks` cell template:

```html
{% if profile.picture %}
<img
  src="{{ profile.picture }}"
  width="30"
  height="30"
  style="border-radius:50%"
/>
{% else %}
<span
  style="display:inline-flex;align-items:center;justify-content:center;
    width:30px;height:30px;border-radius:50%;background:#d9d9d9;color:#8c8c8c;
    font-size:16px;"
  >&#x1F464;</span
>
{% endif %}
```

### 5. Avatar color

All color selection uses standard Lowdefy operators -- no `_nunjucks` or `_js` needed.

**Shared palette:** Move `avatar_colors.yaml` to `modules/shared/profile/avatar_colors.yaml`. Each module that needs it defines `avatar_colors` as a module var with `_ref` to the shared file as default. Module consumers can override per-module if needed.

```yaml
# In each module's module.lowdefy.yaml (user-account, user-admin, contacts):
vars:
  avatar_colors:
    default:
      _ref: modules/shared/profile/avatar_colors.yaml
```

**Random color (for create-contact and invite-user forms):**

Assign a random palette color when the form initializes:

```yaml
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

**Default color (user-account create-profile):**

On first profile creation, assign a random color (same pattern as contacts/user-admin). Use `_if_none` so an existing color from a prior admin-invite is preserved:

```yaml
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

**Shuffle button (user-account edit-profile only):**

Keep the shuffle button on the profile edit form. Replace current `_json.parse` + `_nunjucks` with standard operators:

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

No shuffle button on create-contact or invite-user forms -- they just get a random color on init.

## Decisions

1. **Client-side only generation** -- The SVG is generated in edit forms and stored as data. Server APIs just pass through `profile.picture`. This eliminates 5 copies of the SVG template from server code.

2. **`profile.picture` is stored data** -- Generated on save in all edit forms (user-account, user-admin, contacts), read everywhere. Identical pattern to a future photo upload. Display components never generate SVGs -- they show the stored picture or a fallback.

3. **Shared via `.njk` text template** -- The JS code lives in a `.njk` file. `_ref` renders it at build time with vars (e.g. `prefix`), producing a plain JS string for `_js`. No `_string.concat`, no unusual operator patterns.

4. **Fallback everywhere** -- When `profile.picture` is null, display components render a fallback (Avatar block default icon, or HTML placeholder in tables). Never generate an SVG as fallback.

5. **Avatar generated at creation** -- All create flows (invite-user, create-contact, first profile save) assign a random `avatar_color` and generate the SVG client-side. `avatar_color` and `picture` are both persisted to the profile. On edit, the stored `avatar_color` is preserved and only the SVG is regenerated (so initials update but color stays).

6. **Color selection via standard operators** -- All color selection (shuffle, random init, create-profile default) uses `_get` + `_math.floor` + `_product` + `_math.random` + `_array.length` with `_module.var: avatar_colors`. No `_js` needed for color selection. Palette size is derived dynamically via `_array.length`, not hardcoded. All three modules use the same random pattern; user-account create-profile uses `_if_none` to preserve an existing color from a prior admin-invite. The palette defaults file moves to `modules/shared/profile/avatar_colors.yaml`; each module defines `avatar_colors` as a var with `_ref` to the shared default. Module consumers can override per-module.

7. **Shuffle on edit-profile only** -- The shuffle button stays on user-account edit-profile. Create-contact and invite-user forms auto-assign a random color on init, no shuffle needed.

## Files Changed

| File                                                          | Action     | Notes                                                                                                      |
| ------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `modules/shared/profile/generate-avatar-svg.js.njk`           | **New**    | Shared JS template for SVG data URI generation                                                             |
| `modules/shared/profile/avatar_colors.yaml`                   | **Move**   | Moved from `modules/user-account/defaults/avatar_colors.yaml`                                              |
| `modules/user-account/api/profile-set-fields.yaml`            | Modify     | Remove SVG + color hash generation, pass through `profile.picture` and `profile.avatar_color` from payload |
| `modules/user-admin/api/invite-user.yaml`                     | Modify     | Remove SVG generation, pass through `profile.picture` and `profile.avatar_color` from payload              |
| `modules/user-admin/api/update-user.yaml`                     | Modify     | Remove SVG generation, pass through `profile.picture` and `profile.avatar_color` from payload              |
| `modules/contacts/api/create-contact.yaml`                    | Modify     | Remove SVG generation, pass through `profile.picture` and `profile.avatar_color` from payload              |
| `modules/contacts/api/update-contact.yaml`                    | Modify     | Remove SVG generation, pass through `profile.picture` and `profile.avatar_color` from payload              |
| `modules/user-account/components/form_profile.yaml`           | Modify     | Replace nunjucks preview with `_ref` to `.njk`, add SetState on submit, add default color init             |
| `modules/user-admin/components/view_user_avatar_preview.yaml` | Modify     | Replace nunjucks with `_ref` to `.njk` for edit preview, add SetState-on-save                              |
| `modules/contacts/components/form_contact.yaml`               | Modify     | Add avatar preview and SetState-on-save pattern                                                            |
| `modules/user-account/components/profile-avatar.yaml`         | Modify     | Change fallback to default Avatar icon                                                                     |
| `modules/user-account/components/view_profile.yaml`           | Modify     | Add fallback for null `profile.picture`                                                                    |
| `modules/user-account/components/avatar-svg-src.yaml`         | **Delete** | Replaced by shared `.njk` file                                                                             |
| `modules/user-account/api/create-profile.yaml`                | No changes | Affected via `_ref: profile-set-fields.yaml`                                                               |
| `modules/user-account/api/update-profile.yaml`                | No changes | Affected via `_ref: profile-set-fields.yaml`                                                               |
| `modules/contacts/components/table_contacts.yaml`             | Modify     | Add fallback for null `profile.picture`                                                                    |
| `modules/user-admin/components/table_users.yaml`              | Modify     | Add fallback for null `profile.picture`                                                                    |

## Open Questions

None.
