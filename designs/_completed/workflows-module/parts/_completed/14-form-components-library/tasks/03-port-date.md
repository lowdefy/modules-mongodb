# Task 3: Port date components

## Context

Task 1 settled the per-file shape (`vars: / config:` plain YAML, no Nunjucks, no hardcoded block IDs) and shipped `text_input.yaml` as the canonical worked example. `modules/workflows/components/fields/PORTING.md` carries the replacement table and rules for tasks 2–7.

This task ports the **Date** category:

- `date_selector` — `DateSelector` block with a default `format: DD MMMM YYYY`, inline-label support, and an `extra` slot on the label.
- `date_range_selector` — `DateRangeSelector` with the same label/format shape plus a `validate` block that fires when `required: true` and the selected range array is empty (`_array.length` check). The source file uses `_build.if` already.

## Task

Port each from `modules/workflows/components-current/edit/{name}.yaml.njk` to `modules/workflows/components/fields/{name}.yaml` following `PORTING.md`:

- Declare full `vars:` (`key`, `title`, `extra`, `visible`, `required`, `label_inline`, `label_span` for both; `date_range_selector` also has the implicit `required` driving `validate`).
- Replace `{{ key }}` with `{ _var: key }`. Convert the `{% if label_span %}` build-time branch to `_build.if: { test: { _var: label_span }, then: ..., else: ... }` (or omit the `else` if the current source emits nothing in the else branch — match emission exactly).
- Preserve the `_build.if` validate scaffold in `date_range_selector` as-is; that already uses build-time semantics.

### Per-component notes

**`date_selector`** — vars: `key` (required), `title`, `extra`, `visible` (default `true`), `required` (default `false`), `label_inline` (default `false`), `label_span` (no default — controls conditional emission). Source: `components-current/edit/date_selector.yaml.njk`. The `format: DD MMMM YYYY` is a literal — keep it.

**`date_range_selector`** — same var set. The current source's `validate` uses `_build.if` against `_var: { key: required, default: false }`, with a `then:` branch that checks `_gt: [_array.length: _state: {{ key }}, 0]`. After porting, the `_state` reference becomes `_state: { _var: key }`. Source: `components-current/edit/date_range_selector.yaml.njk`.

## Acceptance Criteria

- `modules/workflows/components/fields/date_selector.yaml` and `date_range_selector.yaml` exist.
- Both have top-level `vars:` and `config:`, no Nunjucks syntax, no hardcoded block IDs.
- Both parse as valid YAML.
- Rendered block-tree shape matches the source `.yaml.njk` semantics for the default var values.

## Files

- `modules/workflows/components/fields/date_selector.yaml` — create
- `modules/workflows/components/fields/date_range_selector.yaml` — create

## Notes

- The `validate` rule in `date_range_selector` is the canonical pattern for "required array-valued field" — `box`-style and `controlled_list`-style components in tasks 6 and 7 reuse the same pattern. Don't refactor it into a shared helper here; the spec keeps each component as a single self-contained file.
