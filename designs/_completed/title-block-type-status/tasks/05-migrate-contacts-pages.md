# Task 5: Migrate contacts view/edit/new — type out of the title

## Context

After task 2, the title bar has a `type` eyebrow and an opt-in `loading` skeleton. The contacts pages currently hand-concatenate the entity type (`label` module var) into the title string. The goal: `title` holds just the entity name; `type` carries the entity type, with the verb in the eyebrow on edit/new.

The `label` module var is the entity type (e.g. "Company"); `label_plural` is used in breadcrumbs. The view page loads via the `get_contact` request (`doc: { _request: get_contact.0 }`).

Current title strings:

- **view** (`modules/contacts/pages/view.yaml`): nunjucks `{{ label }}{% if profile %}: {{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}` (merges `get_contact.0` + `label`).
- **edit** (`modules/contacts/pages/edit.yaml`): `_string.concat: ["Edit ", {_module.var: label}, ": ", {_if_none: [{_request: get_contact.0.profile.name}, ""]}]`.
- **new** (`modules/contacts/pages/new.yaml`): `_string.concat: ["New ", {_module.var: label}]`.

## Task

### view.yaml

- Set `type: { _module.var: label }` (the eyebrow — e.g. "COMPANY").
- Reduce `title` to **just the entity name** (drop the `{{ label }}: ` prefix), preserving the honorific period:
  ```yaml
  title:
    _nunjucks:
      template: "{% if profile %}{{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}"
      on:
        _request: get_contact.0
  ```
  (No more `_object.assign` with `label` — the eyebrow owns the type now.)
- Add `loading: { _not: { _request: get_contact } }`.
- Leave `breadcrumbs`, `page_actions`, `doc`, and events unchanged.

### edit.yaml

- Set `type: { _string.concat: ["Edit ", { _module.var: label }] }` (eyebrow → "EDIT COMPANY").
- Reduce `title` to the name only: `title: { _request: get_contact.0.profile.name }` (drop the `"Edit … : "` prefix and the `_if_none` default — an empty title is fine while loading; the eyebrow carries context).
- Leave breadcrumbs/events/form unchanged. (Adding `loading` on edit is optional and not required by the design — skip it.)

### new.yaml

- Set `type: { _string.concat: ["New ", { _module.var: label }] }` (eyebrow → "NEW COMPANY").
- Remove the `title` entirely (or leave empty) — the eyebrow carries the context for a new record.
- Leave breadcrumbs/events/form unchanged.

## Acceptance Criteria

- No contacts page concatenates `label` into the `title` string anymore.
- view: eyebrow = label, title = name only, `loading` gated on `_request: get_contact`.
- edit: eyebrow = "Edit {label}", title = name only.
- new: eyebrow = "New {label}", no title.
- `pnpm ldf:b` builds successfully.

## Files

- `modules/contacts/pages/view.yaml` — modify — split type into eyebrow; title = name only; add `loading`.
- `modules/contacts/pages/edit.yaml` — modify — verb into eyebrow; title = name only.
- `modules/contacts/pages/new.yaml` — modify — verb into eyebrow; drop title.

## Notes

The breadcrumb labels already use `label`/`label_plural` independently — leave them alone. Only the title-bar `title`/`type` props change.
