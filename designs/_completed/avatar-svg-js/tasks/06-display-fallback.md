# Task 6: Display Fallback for Missing Profile Pictures

## Context

With SVG generation moved to client-side forms, existing users who were created before this change (or users who haven't re-saved their profile) may have a null `profile.picture`. Display components need to render a fallback instead of a broken image.

This task is independent of the other tasks — it handles a pre-existing edge case that becomes more visible now that server-side generation is removed.

### Current state of files:

**`profile-avatar.yaml`** — Used in the PageHeaderMenu header. Currently reads `_user: profile.picture` as `src` and falls back to the first character of `profile.name` as `content` when picture is null (lines 4-17). The design says to remove this first-letter fallback and let the Avatar block render its default user icon.

**`view_profile.yaml`** — Shows profile details. Line 13: Img block with `src: _user: profile.picture`. No fallback — shows broken img if picture is null.

**`table_contacts.yaml`** — Lines 24-30: cellRenderer Nunjucks template renders `<img src="{{ profile.picture }}" .../>`. No fallback for missing picture.

**`table_users.yaml`** — Lines 24-30: same cellRenderer pattern. No fallback for missing picture.

## Task

### 1. Update `profile-avatar.yaml` — simplify to Avatar block default

Replace the entire file content. Remove the `content` property with its first-letter fallback. When `src` is null, the Avatar block renders a default user icon automatically:

```yaml
src:
  _user: profile.picture
```

This removes the `_if` + `_string.substring` fallback (lines 3-17). The Avatar block's built-in default handles the null case.

### 2. Update `view_profile.yaml` — add fallback for null picture

The `user_avatar` Img block (lines 4-14) currently shows `_user: profile.picture` with no fallback. Add conditional visibility so the Img only renders when a picture exists, and add a fallback placeholder when it doesn't.

Replace the `user_avatar` block:

```yaml
- id: user_avatar
  type: Img
  visible:
    _ne:
      - _user: profile.picture
      - null
  style:
    textAlign: center
    marginBottom: 42
    .element:
      width: 100px
      borderRadius: 50%
  properties:
    src:
      _user: profile.picture
- id: user_avatar_fallback
  type: Html
  visible:
    _eq:
      - _user: profile.picture
      - null
  style:
    textAlign: center
    marginBottom: 42
  properties:
    html: |
      <span style="display:inline-flex;align-items:center;justify-content:center;
        width:100px;height:100px;border-radius:50%;background:#d9d9d9;color:#8c8c8c;
        font-size:40px;">&#x1F464;</span>
```

### 3. Update `table_contacts.yaml` — add fallback in cellRenderer

Replace the cellRenderer Nunjucks template (lines 24-30) with a version that handles missing pictures:

```yaml
cellRenderer:
  _function:
    __nunjucks:
      template: |
        <span style="display: inline-flex; align-items: center;">{% if profile.picture %}<img src="{{ profile.picture }}" width="30px" height="30px" style="margin-right: 8px; border-radius: 50%; flex-shrink: 0;"/>{% else %}<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#d9d9d9;color:#8c8c8c;font-size:16px;margin-right:8px;flex-shrink:0;">&#x1F464;</span>{% endif %}{{ profile.name | safe }}</span>
      on:
        __args: 0.data
```

### 4. Update `table_users.yaml` — add fallback in cellRenderer

Same change as table_contacts. Replace the cellRenderer Nunjucks template (lines 24-30):

```yaml
cellRenderer:
  _function:
    __nunjucks:
      template: |
        <span style="display: inline-flex; align-items: center;">{% if profile.picture %}<img src="{{ profile.picture }}" width="30px" height="30px" style="margin-right: 8px; border-radius: 50%; flex-shrink: 0;"/>{% else %}<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#d9d9d9;color:#8c8c8c;font-size:16px;margin-right:8px;flex-shrink:0;">&#x1F464;</span>{% endif %}{{ profile.name | safe }}</span>
      on:
        __args: 0.data
```

## Acceptance Criteria

- `profile-avatar.yaml` only has `src: _user: profile.picture` — no `content` fallback
- `view_profile.yaml` shows the Img when picture exists, shows a grey circle with user icon when it doesn't
- `table_contacts.yaml` cellRenderer shows image when `profile.picture` exists, grey circle with user icon when it doesn't
- `table_users.yaml` cellRenderer shows image when `profile.picture` exists, grey circle with user icon when it doesn't
- No broken `<img>` tags render when `profile.picture` is null
- Lowdefy build succeeds

## Files

- `modules/user-account/components/profile-avatar.yaml` — **modify** — remove first-letter fallback, keep only src
- `modules/user-account/components/view_profile.yaml` — **modify** — add conditional visibility + Html fallback block
- `modules/contacts/components/table_contacts.yaml` — **modify** — add `{% if profile.picture %}` conditional in cellRenderer
- `modules/user-admin/components/table_users.yaml` — **modify** — add `{% if profile.picture %}` conditional in cellRenderer

## Notes

- The `&#x1F464;` entity is the "bust in silhouette" Unicode character (👤), used as a generic person icon.
- The grey circle fallback (`background:#d9d9d9;color:#8c8c8c`) matches Ant Design's default Avatar placeholder style.
- The `profile-avatar.yaml` component is consumed by the PageHeaderMenu layout. The Avatar block type handles null `src` gracefully by rendering a default icon — we don't need an explicit fallback here.
