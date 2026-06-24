# Task 6: Migrate activities view/edit/new — type out of the title

## Context

Mirrors task 5 but for the activities module. After task 2, the title bar has a `type` eyebrow and opt-in `loading`. The `label` module var is the entity type; the view page loads via the `get_activity` request.

Current title strings:

- **view** (`modules/activities/pages/view.yaml`): nunjucks `{{ label }}{% if title %}: {{ title | safe }}{% endif %}` (with `label` and `title` from `get_activity.0.title`).
- **edit** (`modules/activities/pages/edit.yaml`): `_string.concat: ["Edit ", {_module.var: label}, ": ", {_if_none: [{_request: get_activity.0.title}, ""]}]`.
- **new** (`modules/activities/pages/new.yaml`): `_string.concat: ["New ", {_module.var: label}]`.

## Task

### view.yaml

- Set `type: { _module.var: label }`.
- Reduce `title` to just the activity title:
  ```yaml
  title:
    _nunjucks:
      template: "{% if title %}{{ title | safe }}{% endif %}"
      on:
        title:
          _if_none:
            - _request: get_activity.0.title
            - ""
  ```
  (Drop the `{{ label }}: ` prefix and the now-unneeded `label` binding.)
- Add `loading: { _not: { _request: get_activity } }`.
- Leave breadcrumbs/page_actions/events unchanged.

### edit.yaml

- Set `type: { _string.concat: ["Edit ", { _module.var: label }] }`.
- Reduce `title` to the name only: `title: { _request: get_activity.0.title }` (drop the `"Edit … : "` prefix and `_if_none` default).
- Leave the rest unchanged. (No `loading` required on edit.)

### new.yaml

- Set `type: { _string.concat: ["New ", { _module.var: label }] }`.
- Remove the `title` entirely (or leave empty).
- Leave the rest unchanged.

## Acceptance Criteria

- No activities page concatenates `label` into the `title` string anymore.
- view: eyebrow = label, title = activity title only, `loading` gated on `_request: get_activity`.
- edit: eyebrow = "Edit {label}", title = activity title only.
- new: eyebrow = "New {label}", no title.
- `pnpm ldf:b` builds successfully.

## Files

- `modules/activities/pages/view.yaml` — modify — split type into eyebrow; title = name only; add `loading`.
- `modules/activities/pages/edit.yaml` — modify — verb into eyebrow; title = name only.
- `modules/activities/pages/new.yaml` — modify — verb into eyebrow; drop title.

## Notes

Breadcrumbs already reference `label`/`label_plural` independently — leave them. Only the `title`/`type` props change.
