# Task 7: Port structure + actions components

## Context

Task 1 settled the per-file shape (`vars: / config:` plain YAML, no Nunjucks, no hardcoded block IDs) and shipped `text_input.yaml` as the canonical worked example. `modules/workflows/components/fields/PORTING.md` carries the replacement table and rules for tasks 2–7.

This task ports the four remaining components: the **Structure** category (containers for grouping fields) and the lone **Actions** component (an inline button).

- `box` — Plain `Box` container with `blocks:` slot. Current source hardcodes `id: container_box` — needs a required `key` var (consistent with the rest of the library), same pattern as task 6's display components.
- `section` — `Box` containing a conditional `Divider` (rendered only when `title` is non-null) and a `Card` wrapping the `blocks:` slot. Hardcoded ids (`section_box`, `section_title`, `section_card`) need to derive from a required `key` var.
- `controlled_list` — The canonical worked example from the spec. The source implementation is more elaborate than the spec snippet — it wraps the `ControlledList` in a `Label` that owns the required-validation rule. Port the **current** behaviour, not the simplified spec snippet (the spec snippet is illustrative).
- `button` — Inline `Button` with `onClick` event hook, `type` (default `default`), `icon`, `disabled`, and a span/push layout derived from `label_span`.

## Task

Port each component from `modules/workflows/components-current/edit/{name}.yaml.njk` to `modules/workflows/components/fields/{name}.yaml` following `PORTING.md`.

### Per-component notes

**`box`** — Source: `components-current/edit/box.yaml.njk`. Vars: `key` (required — replaces the hardcoded `container_box`), `visible` (default `true`), `blocks` (default `[]`). Keep the literal `layout: { contentGutter: 16, contentJustify: center }`. Port `id: container_box` to `{ _var: key }`.

**`section`** — Source: `components-current/edit/section.yaml.njk`. Vars: `key` (required), `title`, `visible` (default `true`), `blocks` (default `[]`). The current source has three hardcoded inner ids — derive each from `{ _var: key }`:

- Outer `Box`: `{ _var: key }`.
- Inner `Divider`: `{ _string.concat: [{ _var: key }, "_title"] }`.
- Inner `Card`: `{ _string.concat: [{ _var: key }, "_card"] }`.

The `Divider`'s `visible` clause uses `_and` + `_ne` to gate on both the parent's `visible` var and `title != null`. Preserve verbatim; just change `_var: title` references to their ported equivalents.

**`controlled_list`** — Source: `components-current/edit/controlled_list.yaml.njk`. Vars: `key` (required), `title`, `visible` (default `true`), `required` (default `false`), `hideAddButton` (default `false`), `hideRemoveButton` (default `false`), `minItems` (default `0`), `blocks` (default `[]`).

- Outer `Label` id: `{ _string.concat: [{ _var: key }, "_label"] }`. Inner `ControlledList` id: `{ _var: key }`.
- The source's `{# required: TODO ... #}` Nunjucks comment in the outer `Label` reflects a known issue ("With this required in, the validation always fails"). **Keep the validate-on-the-outer-Label pattern** (the working solution). Drop the comment.
- The validate rule uses `_build.if` against `{ _var: required }` and the rule pass uses `_gt: [{ _array.length: { _state: { _var: key } } }, 0]`. Standard pattern, already in use in `date_range_selector` and `multiple_selector`.
- The spec's simplified snippet (action-authoring/spec.md §"Component file shape") doesn't include the wrapper `Label` — **that's a simplification, not a target**. The shipped component uses the wrapper; the spec snippet is purely illustrative of file shape.

**`button`** — Source: `components-current/edit/button.yaml.njk`. Vars: `key` (required), `title` (required), `visible` (default `true`), `align` (default `left`), `type` (default `default`), `icon` (default `null`), `disabled` (default `false`), `label_span` (default `0`), `on_click` (default `[]`). The layout uses `_subtract: [24, { _var: label_span }]` — keep verbatim.

## Acceptance Criteria

- All four files exist under `modules/workflows/components/fields/`: `box.yaml`, `section.yaml`, `controlled_list.yaml`, `button.yaml`.
- Each has top-level `vars:` and `config:`, no Nunjucks syntax, no hardcoded block IDs.
- Each parses as valid YAML.
- `controlled_list.yaml` preserves the wrapper-`Label`-around-`ControlledList` pattern from the source (the spec's simpler `vars: / config:` snippet was illustrative, not a redesign target).

## Files

- `modules/workflows/components/fields/box.yaml` — create
- `modules/workflows/components/fields/section.yaml` — create
- `modules/workflows/components/fields/controlled_list.yaml` — create
- `modules/workflows/components/fields/button.yaml` — create

## Notes

- After this task lands, all 27 components are ported. Task 8 (README) consumes the final set; task 9 retires the staging directory.
- The "wrapper-around-real-block" pattern in `controlled_list`, `file_upload`, `alert`, and (visually) `section` is consistent. If you spot a way to factor it during the port, **don't** — the spec keeps each component self-contained and the form-builder resolver in part 15 doesn't currently flatten wrappers. Keep faithfulness.
