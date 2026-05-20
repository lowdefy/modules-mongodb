# Task 4: Port choice components + resolve `enum_selector` enum path

## Context

Task 1 settled the per-file shape (`vars: / config:` plain YAML, no Nunjucks, no hardcoded block IDs) and shipped `text_input.yaml` as the canonical worked example. `modules/workflows/components/fields/PORTING.md` carries the replacement table and rules for tasks 2–7.

This task ports the eight **Choice** components — the largest single category — plus resolves a real-but-out-of-scope reference in `enum_selector`:

- `selector` — single-select dropdown (`Selector` block) with options, extra slot, onChange event hook.
- `multiple_selector` — multi-select dropdown (`MultipleSelector`); validate composed via `_build.array.concat` of caller-supplied validate plus a `_build.if` rule for required arrays.
- `radio_selector` — radio group (`RadioSelector`).
- `checkbox_selector` — checkbox group (`CheckboxSelector`).
- `button_selector` — button-group selector (`ButtonSelector`) with `colon` (default `true`).
- `checkbox_switch` — toggle switch (`CheckboxSwitch`) with `description` and a commented-out historical `span: 8` note that should remain dropped.
- `yes_no_selector` — `ButtonSelector` with literal `[{ label: Yes, value: true }, { label: No, value: false }]` options.
- `enum_selector` — `Selector` whose options are sourced from an enum via `_ref: { path: ../shared/enums/options_enum.yaml, vars: { enum: <enum> } }`. **The referenced file doesn't exist in the repo.** See "Open question" below.

## Task

Port each component from `modules/workflows/components-current/edit/{name}.yaml.njk` to `modules/workflows/components/fields/{name}.yaml` following `PORTING.md`:

- Declare full `vars:` matching the body's actual usage. Common var set: `key` (required), `title`, `visible`, `required`, `options`, `extra`, `label_inline`, `label_span`, `on_change`, `validate`.
- Replace `{{ key }}` with `{ _var: key }`. Convert `{% if label_span %}` build-time branches to `_build.if`. Preserve runtime operators (`_var`, `_array.length`, `_gt`) as-is.

### Per-component notes

**`selector`** — vars include `on_change` (default `[]`) for the `events.onChange` slot. Source: `components-current/edit/selector.yaml.njk`.

**`multiple_selector`** — vars include `renderTags` (default `false`), `validate` (default `[]`). The `validate` block uses `_build.array.concat` to merge caller-supplied validate with a required-fires-on-empty-array rule. Source: `components-current/edit/multiple_selector.yaml.njk`.

**`radio_selector`** — Note: source has `align: right` and `colon: false` hardcoded on the label. Keep them. Source: `components-current/edit/radio_selector.yaml.njk`.

**`checkbox_selector`** — Source hardcodes `span: 12 / align: right / colon: false` on the label. Keep them. Source: `components-current/edit/checkbox_selector.yaml.njk`.

**`button_selector`** — `colon` defaults `true`. Source: `components-current/edit/button_selector.yaml.njk`.

**`checkbox_switch`** — The commented `{# layout: I'm not sure why this component has a span of 8? #}` block in the source is debt; **drop the comment entirely** in the port. Vars: `key`, `title`, `visible`, `required`, `validate`, `label_inline`, `label_span`, `extra`, `label_disabled` (default `false`), `description`. Source: `components-current/edit/checkbox_switch.yaml.njk`.

**`yes_no_selector`** — Renders as a `ButtonSelector` (note: not `YesNoSelector`). The `options` are a hardcoded literal — keep them inline as `[{ label: Yes, value: true }, { label: No, value: false }]`, not a var. Source: `components-current/edit/yes_no_selector.yaml.njk`.

**`enum_selector`** — Source references `_ref: { path: ../shared/enums/options_enum.yaml, vars: { enum: { _var: { key: enum, default: [] } } } }`. **`options_enum.yaml` does not exist anywhere in the repo** (verified via `find . -name options_enum.yaml`). The `modules/shared/enums/` folder exists with `event_types.yaml` but no options helper. **Resolve as follows for this task:**

1. Inline the enum-to-options conversion directly in `enum_selector.yaml`'s `config.properties.options`. The conversion is `_array.map`-style: each enum entry `{ value, title, ... }` becomes `{ label: <title>, value: <value> }`. Use `_array.map` or `_object.entries` per the way `_ref` would have done it — produce a plain options array consumable by `Selector`.
2. Vars: `key` (required), `title`, `visible` (default `true`), `required` (default `false`), `enum` (type `array`, default `[]`). Keep the hardcoded `label.align: right / span: 12` on the label.
3. If inlining proves clumsy and a shared helper is needed, **stop and raise it as an open question on this task's PR** rather than creating `modules/shared/enums/options_enum.yaml` unilaterally — that decision belongs to whoever owns `modules/shared/`.

Source: `components-current/edit/enum_selector.yaml.njk`.

## Acceptance Criteria

- All eight files exist in `modules/workflows/components/fields/`: `selector.yaml`, `multiple_selector.yaml`, `radio_selector.yaml`, `checkbox_selector.yaml`, `button_selector.yaml`, `checkbox_switch.yaml`, `yes_no_selector.yaml`, `enum_selector.yaml`.
- Each has top-level `vars:` and `config:`, no Nunjucks syntax, no hardcoded block IDs (other than the deliberate literal label hardcodes called out per-component).
- Each parses as valid YAML.
- `enum_selector.yaml` does **not** reference the non-existent `../shared/enums/options_enum.yaml`; the enum-to-options conversion is either inlined or, if inlining isn't feasible, documented as an open question on the PR.

## Files

- `modules/workflows/components/fields/selector.yaml` — create
- `modules/workflows/components/fields/multiple_selector.yaml` — create
- `modules/workflows/components/fields/radio_selector.yaml` — create
- `modules/workflows/components/fields/checkbox_selector.yaml` — create
- `modules/workflows/components/fields/button_selector.yaml` — create
- `modules/workflows/components/fields/checkbox_switch.yaml` — create
- `modules/workflows/components/fields/yes_no_selector.yaml` — create
- `modules/workflows/components/fields/enum_selector.yaml` — create

## Notes

- The `yes_no_selector` rendering as `ButtonSelector` is intentional in the source — don't switch the block type.
- The hardcoded label config (`align: right / span: 12 / colon: false`) in `radio_selector`, `checkbox_selector`, and `enum_selector` is currently inconsistent across the choice family; do **not** harmonise it in this task. Preserve current behaviour; consistency is a follow-up.
