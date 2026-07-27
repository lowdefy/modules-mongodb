# Task 1: Scaffold `components/fields/` and port one canonical component as the template

## Context

The workflows module needs an internal library of 27 field components at `modules/workflows/components/fields/` that the form-builder resolver (part 15) substitutes by name into action `form:` blocks at build time. A starting point exists at `modules/workflows/components-current/edit/*.yaml.njk` (27 Nunjucks-templated YAML fragments), but it deviates from the action-authoring spec in four ways that affect every component:

1. **Location.** Spec: `modules/workflows/components/fields/{name}.yaml`. Current: `modules/workflows/components-current/edit/{name}.yaml.njk`.
2. **File shape.** Spec: each file is `vars: / config:` — `vars:` declares the author-facing parameter schema (`{ type, required, default }`), `config:` is the block-tree fragment to emit. Current: files start at `component:` and consume vars implicitly via `_var` inside the body.
3. **File extension.** Spec implies plain `.yaml` (the resolver in part 15 substitutes vars using Lowdefy operators). Current uses `.yaml.njk` with `{{ key }}` interpolations and `{% if %}` conditionals.
4. **Block IDs.** Several current components hardcode block IDs (`box.yaml.njk` → `container_box`, `section.yaml.njk` → `section_box`, `title.yaml.njk` → `title`). With more than one instance on a page these collide. The spec example for `controlled_list` uses `id: { _var: key }`.

The canonical spec example is **`controlled_list`** ([action-authoring/spec.md §"Component file shape"](../../../../workflows-module-concept/action-authoring/spec.md)):

```yaml
# components/fields/controlled_list.yaml
vars:
  key: { type: string, required: true }
  title: { type: string, required: false }
  required: { type: boolean, default: false }
  hideAddButton: { type: boolean, default: false }
  hideRemoveButton: { type: boolean, default: false }
  form: { type: array, required: true }

config:
  id: { _var: key }
  type: ControlledList
  required: { _var: required }
  properties:
    title: { _var: title }
    hideAddButton: { _var: hideAddButton }
    hideRemoveButton: { _var: hideRemoveButton }
  blocks:
    _var: form
```

This task lays the directory and ships **one** component (`text_input`) end-to-end against that shape so tasks 2–7 follow a worked template instead of relitigating decisions per category.

## Task

1. **Create the directory** `modules/workflows/components/fields/` (do not yet remove `components-current/` — task 9 retires it after the new set is verified).

2. **Settle the file shape**, conforming to the spec:
   - Top-level keys: `vars:` (parameter schema) and `config:` (block-tree fragment).
   - Plain `.yaml` (no Nunjucks). All var consumption uses `_var: <name>` or `_var: { key: <name>, default: <value> }`. Build-time branches use `_build.if` / `_build.eq` (already in use in `location.yaml.njk`).
   - **No hardcoded block IDs.** Where the spec example uses `id: { _var: key }`, follow that. For components whose current implementation produces a wrapper-plus-inner-block tree (e.g. `controlled_list` wraps a `Label` around the `ControlledList`), derive child IDs from `{ _var: key }` with a suffix via `_string.concat` (e.g. inner-label id = `_string.concat: [{ _var: key }, "_label"]`).

3. **Port `text_input` as the canonical example.** Source: `modules/workflows/components-current/edit/text_input.yaml.njk`. Target: `modules/workflows/components/fields/text_input.yaml`. The ported version must:
   - Declare a complete `vars:` block with every var the body consumes (`key`, `title`, `placeholder`, `visible`, `required`, `validate`, `label_inline`, `label_span`), each with `type`, plus `required: true` or a `default:`. `key` is required; the rest have defaults matching the current `_var: { default: ... }` behaviour.
   - In `config:`, replace `id: {{ key }}` with `id: { _var: key }`. Convert the `{% if label_span %}` Nunjucks branch into a build-time conditional using `_build.if` against `{ _var: label_span }`. All other `_var: { key, default }` patterns stay as-is.
   - Match the rendered block tree of the current `.yaml.njk` byte-equivalent semantics — the goal is a faithful port, not a redesign.

4. **Write a short porting checklist** at `modules/workflows/components/fields/PORTING.md` (a working note, not the user-facing README — that's task 8). It captures, for tasks 2–7:
   - The `vars: / config:` shape with the canonical `text_input.yaml` as a worked example.
   - Replacement table: `{{ key }}` → `{ _var: key }`; `{% if X %}...{% endif %}` → `_build.if: { test: { _var: X }, then: ..., else: ... }`.
   - Block-ID rule: derive from `{ _var: key }`, never hardcode.
   - **Open question to surface to tasks 2–7:** the design's open question on per-component `vars:` schema validation (deferred to part 15) — declaring `vars:` here is the precondition; part 15 chooses strictness.

5. **Decide the fate of `card_template.yaml`** (currently at `modules/workflows/components-current/card_template.yaml`, not on the spec's 27-component list). Document the call in `PORTING.md` — either it stays out (default — task 9 deletes it) or, if it surfaces a need, raise an "Open questions" follow-up referencing the design.

## Acceptance Criteria

- `modules/workflows/components/fields/` exists and contains exactly one ported component file: `text_input.yaml`.
- `text_input.yaml` has top-level `vars:` and `config:` keys; `vars:` declares `key`, `title`, `placeholder`, `visible`, `required`, `validate`, `label_inline`, `label_span` with `type` and `default`/`required` per the spec shape.
- `text_input.yaml` contains no Nunjucks syntax (`{{ }}` or `{% %}`).
- `text_input.yaml` parses as valid YAML (`node -e "require('js-yaml').load(require('fs').readFileSync('modules/workflows/components/fields/text_input.yaml','utf8'))"` exits 0, or equivalent).
- `PORTING.md` exists at `modules/workflows/components/fields/PORTING.md`, contains the replacement table and the worked example, and records the `card_template.yaml` decision.
- `modules/workflows/components-current/` is untouched (task 9 retires it).

## Files

- `modules/workflows/components/fields/text_input.yaml` — create — canonical ported component
- `modules/workflows/components/fields/PORTING.md` — create — internal porting note for tasks 2–7

## Notes

- Don't add or remove vars from `text_input` relative to the source `.yaml.njk` — a faithful port. Anything ambiguous goes in `PORTING.md` as an open question.
- The resolver in part 15 hasn't been written yet, so the `vars:` schema isn't load-bearing at runtime in this part. It's the contract part 15 reads against. Declare it conservatively (match the body's actual usage).
- `_build.if` runs at build time and is the right tool for `{% if %}` branches that gate config-tree shape. Runtime branches (e.g. `validate` enabled/disabled per submitted state) stay as `_if` / `_eq`.
