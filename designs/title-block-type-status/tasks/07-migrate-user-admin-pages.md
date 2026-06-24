# Task 7: Migrate user-admin view/edit/new — app_title/User prefix into the eyebrow

## Context

After task 2, the title bar has a `type` eyebrow and opt-in `loading`. user-admin differs from contacts/activities: it has **no per-entity `label` var**. The entity type is the literal word `User`, optionally prefixed by the `app_title` module var, and its create verb is **"Invite"** (not "New"). The view page loads via the `get_user` request.

Current title strings (all nunjucks, merging `get_user.0` + `app_title`):

- **view** (`modules/user-admin/pages/view.yaml`): `{% if app_title %}{{ app_title }} {% endif %}User{% if profile %}: {{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}`.
- **edit** (`modules/user-admin/pages/edit.yaml`): `Edit {% if app_title %}{{ app_title }} {% endif %}User{% if profile %}: …{% endif %}`.
- **new** (`modules/user-admin/pages/new.yaml`): `Invite {% if app_title %}{{ app_title }} {% endif %}User{% if profile %}: …{% endif %}`.

## Task

Split each page's title into a `type` eyebrow (the `{verb} {app_title} User` part) and a `title` holding just the user's name. Build the eyebrow with nunjucks per page, binding `app_title` from the module var. Preserve the honorific period in the name.

### view.yaml

```yaml
type:
  _nunjucks:
    template: "{% if app_title %}{{ app_title }} {% endif %}User"
    on:
      app_title: { _module.var: app_title }
title:
  _nunjucks:
    template: "{% if profile %}{{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}"
    on:
      _request: get_user.0
loading:
  _not:
    _request: get_user
```

(Eyebrow → "ACME USER", or just "USER" when `app_title` is unset.)

### edit.yaml

- `type` template: `"Edit {% if app_title %}{{ app_title }} {% endif %}User"` (bind `app_title` from the module var).
- `title`: the name only —
  ```yaml
  title:
    _nunjucks:
      template: "{% if profile %}{{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}"
      on:
        _request: get_user.0
  ```
- No `loading` required on edit.

### new.yaml

- `type` template: `"Invite {% if app_title %}{{ app_title }} {% endif %}User"` (bind `app_title`).
- Remove the `title` entirely (or leave empty) — the eyebrow carries context for an invite.

## Acceptance Criteria

- No user-admin page bakes `{app_title} User: ` into the title string anymore.
- view: eyebrow = "{app_title} User", title = user name only, `loading` gated on `_request: get_user`.
- edit: eyebrow = "Edit {app_title} User", title = user name only.
- new: eyebrow = "Invite {app_title} User", no title.
- The `{% if app_title %}` guard is preserved so the eyebrow degrades to "USER" / "EDIT USER" / "INVITE USER" when `app_title` is unset.
- `pnpm ldf:b` builds successfully.

## Files

- `modules/user-admin/pages/view.yaml` — modify — `app_title`/`User` → eyebrow; title = name only; add `loading`.
- `modules/user-admin/pages/edit.yaml` — modify — verb + `app_title`/`User` → eyebrow; title = name only.
- `modules/user-admin/pages/new.yaml` — modify — "Invite" verb → eyebrow; drop title.

## Notes

Breadcrumbs already build their own `{app_title} User Admin` label via `_build.string.concat` — leave them unchanged. Only the title-bar `title`/`type` props change.
