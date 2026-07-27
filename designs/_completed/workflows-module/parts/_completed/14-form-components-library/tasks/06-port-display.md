# Task 6: Port display components

## Context

Task 1 settled the per-file shape (`vars: / config:` plain YAML, no Nunjucks, no hardcoded block IDs) and shipped `text_input.yaml` as the canonical worked example. `modules/workflows/components/fields/PORTING.md` carries the replacement table and rules for tasks 2–7.

This task ports the six **Display** components — read-only or static blocks used inside form trees:

- `label` — `Label` block with a `blocks:` slot for nested children. Already keyed off `{ _var: key }`.
- `label_value` — Read-only key-value pair rendered as `Html` using `_string.concat`.
- `title` — `Title` block (Ant Design title, level 5).
- `section_title` — `Divider` with a small `marginBottom: 4`.
- `alert` — `Alert` inside a `Box` wrapper, with `type` (default `warning`) and `show_icon` (default `true`).
- `html` — Raw `Html` block, passes through a `html` var.

**The "Display components on review pages" open question from `design.md`** flags that some of these (notably `label_value`) need to behave correctly when rendered on review pages. This task does **not** address that — verification is part 15's integration. But: don't introduce new behaviour in these components that would break the read-only path.

## Task

Port each component from `modules/workflows/components-current/edit/{name}.yaml.njk` to `modules/workflows/components/fields/{name}.yaml` following `PORTING.md`.

### Per-component notes

**`label`** — Source: `components-current/edit/label.yaml.njk`. Vars: `key` (required), `title`, `disabled`, `visible` (default `true`), `validate` (default `[]`), `blocks` (default `[]`). Port `id: {{ key }}` to `{ _var: key }`.

**`label_value`** — Source: `components-current/edit/label_value.yaml.njk`. Vars: `key` (required), `title` (required), `visible` (default `true`). The body uses `_string.concat` to build an HTML string. Inside that array, `_state: {{ key }}` becomes `_state: { _var: key }`. Block id derives from `{ _var: key }`.

**`title`** — Source: `components-current/edit/title.yaml.njk`. Vars: `title` (required). The current `id: title` is hardcoded — replace with a deterministic id that doesn't collide when the component is used twice. Options:

1. Derive from `{ _var: title }` via `_string.concat: [{ _var: title }, "_title"]` — but title strings may contain spaces / punctuation invalid in block ids.
2. **Recommended:** add a required `key` var and emit `id: { _var: key }`. This matches the convention every other component in the library uses (`key` is the author-facing identifier for the block; `id` is the emitted Lowdefy block id). Document this departure from the source in the PR description: it's an unavoidable consequence of the no-hardcoded-ids rule for components that don't have a natural state-path `key:`. Forms reuse `title` once per section without explicit ids today — surfacing the key requirement is a small ergonomics tax for correctness.

**`section_title`** — Source: `components-current/edit/section_title.yaml.njk`. Same hardcoded-id issue as `title`. Same resolution: add a required `key` var.

**`alert`** — Source: `components-current/edit/alert.yaml.njk`. Vars: `key` (required — drives wrapper + inner block ids), `visible` (default `true`), `message`, `description`, `type` (default `warning`), `show_icon` (default `true`), `label_span`. Wrapper `Box` id: `{ _string.concat: [{ _var: key }, "_container"] }`. Inner `Alert` id: `{ _var: key }`. Keep the literal `icon: AiOutlineAlert`.

**`html`** — Source: `components-current/edit/html.yaml.njk`. Vars: `key` (required), `html` (required), `visible` (default `true`). Same hardcoded-id issue as `title` — add a required `key` var. The body otherwise just passes `html` through to the `Html` block's `html` property.

## Acceptance Criteria

- All six files exist under `modules/workflows/components/fields/`: `label.yaml`, `label_value.yaml`, `title.yaml`, `section_title.yaml`, `alert.yaml`, `html.yaml`.
- Each has top-level `vars:` and `config:`, no Nunjucks syntax, no hardcoded block IDs.
- Each parses as valid YAML.
- `title.yaml`, `section_title.yaml`, `html.yaml` carry a required `key` var as the resolution to the hardcoded-id problem (consistent with every other component in the library). The PR description records this departure from the current source.

## Files

- `modules/workflows/components/fields/label.yaml` — create
- `modules/workflows/components/fields/label_value.yaml` — create
- `modules/workflows/components/fields/title.yaml` — create
- `modules/workflows/components/fields/section_title.yaml` — create
- `modules/workflows/components/fields/alert.yaml` — create
- `modules/workflows/components/fields/html.yaml` — create

## Notes

- The hardcoded-id resolution for `title` / `section_title` / `html` is a small API change: callers in existing apps that use these components today rely on the singleton id. Surface this in the PR description so part 15's resolver author and downstream apps see the change.
- The `label_value` HTML output uses an inline `<span class="secondary">` — keep that literal; styling lives in the theme.
