# Task 4: Module — new shared `action-description.yaml` leaf

## Context

Part 64 renders the authored `description` as **plain body content** — no tinted callout, no eyebrow label, no card chrome — on every surface where an action is worked. The current `components/universal-fields/universal-fields-callout.yaml` (a tinted, labelled `Html` callout) is being deleted (in Task 7) and replaced by a plain render.

The replacement is a new shared leaf, `components/action-description.yaml`. It is a single `Markdown` block whose content is passed in as a var, so each consuming surface binds its own source. Markdown is the field's authored type, and the built-in `Markdown` block (`@lowdefy/blocks-markdown`) renders markdown→HTML client-side (no server-side converter). See `modules/release-notes/pages/view.yaml` for an existing `type: Markdown` block usage.

The component lives **outside** the `universal-fields/` folder (directly under `components/`) because `description` is no longer a universal field. It mirrors how the deleted callout took its description via a var rather than a hard-coded state path.

## Task

Create `modules/workflows/components/action-description.yaml`:

- A `Markdown` block (`type: Markdown`), id e.g. `action_description`.
- Content comes from a var (e.g. `content`): `properties.content: { _var: content }`.
- `visible` only when that content is non-null:
  ```yaml
  visible:
    _ne:
      - _var: content
      - null
  ```
- A header comment documenting: this is the authored action `description` body (Part 64), rendered plain (no callout chrome), consumed via `_ref: { path, vars }` with an OPERATOR-valued `content` var (each surface binds its own source — `_state: current_action.description` on check, the form pages' envelope binding on form). Note that the upstream value is already nunjucks-rendered server-side by GetWorkflowAction; this block only does the markdown→HTML render.

Reference shape (adjust to match repo conventions):

```yaml
# Authored action description body (Part 64).
# Plain Markdown render of the workflow-author-authored `description` — no callout
# chrome, no eyebrow. The string arrives already nunjucks-rendered from
# GetWorkflowAction; this block only renders markdown→HTML. Consumed via
# `_ref: { path: components/action-description.yaml, vars: { content: <operator> } }`.
# Vars:
#   - content  operator leaf — the rendered description string (or null → hidden).
id: action_description
type: Markdown
visible:
  _ne:
    - _var: content
    - null
properties:
  content:
    _var: content
```

## Acceptance Criteria

- `modules/workflows/components/action-description.yaml` exists, is a `Markdown` block, takes `content` as a var, and self-hides when `content` is null.
- No callout chrome (no `Html`, no border/tint/eyebrow).
- The file is in `components/`, not `components/universal-fields/`.
- `cd apps/demo && pnpm ldf:b` still compiles (the new component is not yet referenced — it must at least parse if any test harness loads it; it will be wired in Tasks 6/7).

## Files

- `modules/workflows/components/action-description.yaml` — create — plain `Markdown` leaf, content via var, visible when non-null.

## Notes

- The `Markdown` block is already available app-wide: `modules/release-notes/pages/view.yaml` uses `type: Markdown` and its module manifest does **not** declare `@lowdefy/blocks-markdown` (the demo app registers the plugin). So no `module.lowdefy.yaml` change should be needed — only add a `plugins:` entry if `pnpm ldf:b` actually complains that `Markdown` is unknown.
- This component is the shared building block for Tasks 6 and 7; create it before swapping any callout refs.
