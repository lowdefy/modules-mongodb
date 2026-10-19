# Task 2: Port text + numeric components

## Context

Task 1 settled the per-file shape (`vars: / config:` plain YAML, no Nunjucks, no hardcoded block IDs) and shipped `text_input.yaml` as the canonical worked example. `modules/workflows/components/fields/PORTING.md` carries the replacement table and rules for tasks 2–7.

This task ports the **Text** and **Numeric** categories:

- `text_input` — already ported in task 1; **skip**.
- `text_area` — single-line `TextArea` input with title, placeholder, validate, inline-label support.
- `tiptap_input` — rich-text editor with conditional `validate` derived from `_string.length` on `state.{key}.text`; depends on an `s3PostPolicyRequestId` var.
- `number` — `NumberInput` with `precision`, `min`, `placeholder` defaults.

## Task

For each component, port the corresponding file under `modules/workflows/components-current/edit/` to `modules/workflows/components/fields/{name}.yaml`:

- Add a complete `vars:` block — every var the body reads, with `type` and either `required: true` or a `default:` that matches the current `_var: { default: ... }`.
- In `config:`, replace `{{ key }}` interpolations with `{ _var: key }`. Replace `{% if X %}...{% endif %}` build-time branches with `_build.if: { test: { _var: X }, then: ..., else: ... }`.
- Compose child block IDs from `{ _var: key }` using `_string.concat` where the current file would have used `{{ key }}_suffix`.
- Preserve runtime operators (`_var`, `_state`, `_string.length`, `_gt`, `_array.length`) as-is.

Follow `PORTING.md`. The worked template is `modules/workflows/components/fields/text_input.yaml`.

### Per-component notes

**`text_area`** — Mirrors `text_input` minus the explicit `validate` slot. Source: `components-current/edit/text_area.yaml.njk`.

**`tiptap_input`** — The source uses a Nunjucks `{% if required %}` block to gate the `validate` array. Port this to `_build.if` against `{ _var: required }`. Vars: `key`, `title`, `placeholder`, `visible`, `required`, `label_inline`, `label_span`, `s3PostPolicyRequestId` (default `upload_files`). Source: `components-current/edit/tiptap_input.yaml.njk`.

**`number`** — Vars include `precision` (default `0`), `min` (default `0`), `placeholder` (default `0`). Source: `components-current/edit/number.yaml.njk`.

## Acceptance Criteria

- `modules/workflows/components/fields/text_area.yaml`, `tiptap_input.yaml`, `number.yaml` exist.
- Each file has top-level `vars:` and `config:`, no Nunjucks syntax, no hardcoded block IDs.
- Each parses as valid YAML.
- Rendered block-tree shape matches the source `.yaml.njk` semantics for the default var values (mental-model verification — there is no mechanical smoke test; the demo build in part 20 is the integration check).
- The corresponding source files in `components-current/edit/` are untouched (task 9 retires the whole directory).

## Files

- `modules/workflows/components/fields/text_area.yaml` — create
- `modules/workflows/components/fields/tiptap_input.yaml` — create
- `modules/workflows/components/fields/number.yaml` — create

## Notes

- `tiptap_input`'s required-validation rule uses `_state: {{ key }}.text`, which becomes `_state: { _string.concat: [{ _var: key }, ".text"] }` after porting — operator-composed paths are supported in Lowdefy (CLAUDE.md: "Operator dot notation and composition").
