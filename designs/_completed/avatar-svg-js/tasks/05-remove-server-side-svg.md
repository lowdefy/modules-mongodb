# Task 5: Remove Server-Side SVG Generation from All APIs

## Context

Tasks 2-4 updated all client forms to generate the SVG avatar client-side via SetState-before-CallAPI. The SVG data URI and avatar_color are now part of the client-sent payload. The server APIs can stop generating SVGs and simply pass through what the client sent.

Currently all 5 API files contain ~30 lines of nested `_nunjucks` that compute initials, build an SVG string, and URI-encode it. This all gets deleted and replaced with simple `_payload` references.

## Task

### 1. Update `modules/user-account/api/profile-set-fields.yaml`

This is the most complex file. It currently:

- Computes `profile.avatar_color` with `_if_none` falling back to a user-ID-hash into the palette (lines 14-27)
- Generates `profile.picture` as SVG via nested `_nunjucks` (lines 28-90)

Replace both with simple payload passthrough:

```yaml
profile.avatar_color:
  _payload: contact.profile.avatar_color
profile.picture:
  _payload: contact.profile.picture
```

The full `profile.avatar_color` block (lines 14-27) and `profile.picture` block (lines 28-90) should be replaced. Keep everything else unchanged — `profile.name` (lines 2-9), `profile.given_name` (lines 91-95), `profile.family_name` (lines 96-100), `updated` (lines 101-104), the `_build.if` for title (lines 105-111), and the module var injection (lines 112-114).

The result should look like:

```yaml
_build.object.assign:
  - profile.name:
      _string.trim:
        _string.concat:
          - _string.trim:
              _if_none:
                - _payload: contact.profile.given_name
                - ""
          - " "
          - _string.trim:
              _if_none:
                - _payload: contact.profile.family_name
                - ""
    profile.avatar_color:
      _payload: contact.profile.avatar_color
    profile.picture:
      _payload: contact.profile.picture
    profile.given_name:
      _string.trim:
        _if_none:
          - _payload: contact.profile.given_name
          - ""
    profile.family_name:
      _string.trim:
        _if_none:
          - _payload: contact.profile.family_name
          - ""
    updated:
      _ref:
        module: events
        component: change_stamp
  - _build.if:
      test:
        _module.var: show_title
      then:
        profile.title:
          _payload: contact.profile.title
      else: {}
  - _module.var:
      key: components.profile_set_fields
      default: {}
```

### 2. Update `modules/user-admin/api/invite-user.yaml`

Replace the `profile.avatar_color` (lines 57-59) and `profile.picture` (lines 60-98) blocks with payload passthrough:

```yaml
profile.avatar_color:
  _payload: user.profile.avatar_color
profile.picture:
  _payload: user.profile.picture
```

Current `profile.avatar_color` is hardcoded `from: "#37474f"`, `to: "#546e7a"`. Current `profile.picture` is the nested `_nunjucks` SVG template using those hardcoded colors.

Keep everything else unchanged — the surrounding `_object.assign`, `profile.name`, `profile.given_name`, `profile.family_name`, etc.

### 3. Update `modules/user-admin/api/update-user.yaml`

Same pattern as invite-user. Replace `profile.avatar_color` (lines 36-38) and `profile.picture` (lines 39-77) with:

```yaml
profile.avatar_color:
  _payload: user.profile.avatar_color
profile.picture:
  _payload: user.profile.picture
```

### 4. Update `modules/contacts/api/create-contact.yaml`

Replace `profile.avatar_color` (lines 63-65) and `profile.picture` (lines 66-102) with:

```yaml
profile.avatar_color:
  _payload: contact.profile.avatar_color
profile.picture:
  _payload: contact.profile.picture
```

### 5. Update `modules/contacts/api/update-contact.yaml`

Replace `profile.avatar_color` (lines 40-42) and `profile.picture` (lines 43-79) with:

```yaml
profile.avatar_color:
  _payload: contact.profile.avatar_color
profile.picture:
  _payload: contact.profile.picture
```

## Acceptance Criteria

- All 5 API files have `profile.avatar_color: _payload: ...` and `profile.picture: _payload: ...` (simple passthrough)
- No `_nunjucks` SVG templates remain in any API file
- All other fields in each API file are unchanged (name computation, given_name, family_name, updated, title conditional, etc.)
- Lowdefy build succeeds

## Files

- `modules/user-account/api/profile-set-fields.yaml` — **modify** — remove SVG + color hash generation (~75 lines), replace with 2-line passthrough
- `modules/user-admin/api/invite-user.yaml` — **modify** — remove SVG generation (~40 lines), replace with passthrough
- `modules/user-admin/api/update-user.yaml` — **modify** — remove SVG generation (~40 lines), replace with passthrough
- `modules/contacts/api/create-contact.yaml` — **modify** — remove SVG generation (~40 lines), replace with passthrough
- `modules/contacts/api/update-contact.yaml` — **modify** — remove SVG generation (~40 lines), replace with passthrough

## Notes

- This is the largest line-count reduction in the design: ~200 lines of nested `_nunjucks` templates deleted across 5 files.
- After this task, the server never generates SVGs. All avatar generation is client-side. If a client sends a payload without `profile.picture` (e.g., an old client or direct API call), the server will store `null` for the picture — the display fallback (task 6) handles this case.
- The `profile-set-fields.yaml` file is `_ref`'d by both `create-profile.yaml` and `update-profile.yaml`, so changes propagate to both API endpoints automatically.
