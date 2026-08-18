# Task 1: Extract the shared insert-document fragment and migrate generate-report onto it

## Context

`modules/reporting/api/generate-report.yaml` is currently the only report-creation path. Its
`insert_report` step builds the whole insert document inline: `_id`, `owner`, `title`,
`description`, `spec: { sections }`, `spec_version: 1`, `visibility: private`,
`favourite_of: []`, `conversation_id: null`, `deleted: null`, `created`, `updated`. Only
`owner` and the change stamp are already shared fragments (`defaults/owner.yaml`,
`defaults/change_stamp.yaml`).

Task 2 adds a second creation endpoint (`create-report`) that must write the **identical**
document, differing only in `conversation_id`. To keep "one stored shape" true rather than a
convention two files must remember, extract the whole document into a single parameterised
fragment and point both endpoints at it. This task does the extraction and migrates
`generate-report`; task 2 adds the new consumer.

This is a **behaviour-preserving refactor** of `generate-report`: after it, `generate-report`
must write exactly the same document it does today (including `conversation_id: null`).

## Interfaces

- **Produces:** `modules/reporting/defaults/new_report.yaml` — a `_ref`-able fragment taking two
  vars and emitting the full insert document:
  - `_var: validated` — the object returned by `_analytics.validateReportSpec` (carries
    `.title`, `.description`, `.sections`).
  - `_var: conversation_id` — the value to store in the doc's `conversation_id` field.

  Consumers `_ref` it as:

  ```yaml
  doc:
    _ref:
      path: defaults/new_report.yaml
      vars:
        validated:
          _state: validated
        conversation_id: null # generate-report
  ```

  The vars appear only in operator positions, so a plain `.yaml` fragment with `_var` is
  correct (not `.yaml.njk`).

## Task

**Create `modules/reporting/defaults/new_report.yaml`** emitting the full insert document,
lifting the current inline `doc:` from `generate-report.yaml` verbatim except that the two
parameterised fields read from vars:

```yaml
# The single source of a saved report document. Both creation endpoints (the agent's
# generate-report tool and the page's create-report) _ref this, so the stored shape lives
# in one place — see designs/reporting/ux/save-as-report/design.md ("Two authors, one
# stored shape"). Parameterised by the validated spec and a conversation_id; every other
# field is a fixed insert default.
_id:
  _uuid: true
owner:
  _ref: defaults/owner.yaml
# Off the VALIDATED object, not the payload: the validator caps title length and rejects a
# non-string description, so the payload would store a value already normalized past.
title:
  _var: validated.title
description:
  _var: validated.description
spec:
  sections:
    _var: validated.sections
spec_version: 1
visibility: private
favourite_of: []
conversation_id:
  _var: conversation_id
deleted: null
created:
  _ref: defaults/change_stamp.yaml
updated:
  _ref: defaults/change_stamp.yaml
```

Carry across the explanatory comments the current inline doc holds (why title/description come
off `validated`, what `spec_version` is for, `visibility`/`favourite_of`/`deleted` shape notes)
so no rationale is lost in the move. The `conversation_id` comment moves to the _consumer_ that
passes `null` (generate-report), since the fragment itself is now agnostic.

**Modify `modules/reporting/api/generate-report.yaml`:** replace the entire inline `doc:` map on
the `insert_report` step with the `_ref` shown in Interfaces, passing `validated` from
`_state: validated` and `conversation_id: null`. Leave the auth guard, the
`:set_state validated` step, and the `:return` unchanged. Keep the file's header comment about
storing the validator's output.

Confirm `_ref` var substitution reaches operator values: `_var: validated.sections` inside the
fragment must resolve to `{ _state: validated }`'s `.sections` at runtime (dot notation on the
passed operator). This is the documented `.yaml` + `_var` pattern for operator-position vars.

## Acceptance Criteria

- `modules/reporting/defaults/new_report.yaml` exists and emits every field the old inline doc
  did, in the same shapes.
- `generate-report.yaml`'s `insert_report` step is a single `_ref` to the fragment; no inline
  `doc:` field map remains.
- `pnpm ldf:b` from `apps/demo` builds clean.
- Inspect the generated build artifact for `generate-report` under
  `apps/demo/.lowdefy/server/build/api/reporting/**` and confirm the resolved insert document is
  byte-for-byte the pre-refactor shape (same fields, `conversation_id: null`, `spec: { sections }`).

## Files

- `modules/reporting/defaults/new_report.yaml` — create — the parameterised full insert document.
- `modules/reporting/api/generate-report.yaml` — modify — `insert_report.doc` becomes a `_ref` to
  the fragment with `conversation_id: null`.

## Notes

- Do not change what `generate-report` stores. This task's whole value is that the diff to the
  _stored document_ is empty while the _source_ collapses to one place.
- `owner.yaml` and `change_stamp.yaml` stay their own fragments and are `_ref`'d from inside
  `new_report.yaml` — don't inline them.
