# Task 1: Ship placeholder Nunjucks templates

## Context

Part 12's `makeActionPages` resolver emits page shells that `_ref` four templates at `modules/workflows/templates/{edit,view,review,error}.yaml.njk`. The full template bodies (form rendering, button vocabulary, layout-module composition, stale-URL guards) land in part 16, which is in Wave 6 — far downstream from part 12 in Wave 2. Without these placeholder files, every Lowdefy build between Waves 2 and 6 fails because the emitted `_ref` paths don't resolve.

This task creates four minimal stub files so the resolver has something to reference. Part 16 will replace the bodies; the paths stay the same.

## Task

Create the directory `modules/workflows/templates/` and four `.yaml.njk` files inside it. Each file is a tiny Nunjucks-renderable Lowdefy block tree — minimal but valid YAML so a Lowdefy build doesn't error when it `_ref`s one.

### `templates/edit.yaml.njk`

A single `Html` block carrying a "form goes here" placeholder so the page is visually inspectable in dev before part 15 wires the real form body:

```yaml
id: edit-placeholder
type: Box
blocks:
  - id: heading
    type: Html
    properties:
      html: "<h2>Edit (placeholder — replaced by part 16)</h2>"
  - id: form_placeholder
    type: Html
    properties:
      html: "<p><em>Form body will be rendered here once part 15 wires <code>makeActionsForm</code>.</em></p>"
```

### `templates/view.yaml.njk`

```yaml
id: view-placeholder
type: Box
blocks:
  - id: heading
    type: Html
    properties:
      html: "<h2>View (placeholder — replaced by part 16)</h2>"
```

### `templates/review.yaml.njk`

```yaml
id: review-placeholder
type: Box
blocks:
  - id: heading
    type: Html
    properties:
      html: "<h2>Review (placeholder — replaced by part 16)</h2>"
```

### `templates/error.yaml.njk`

```yaml
id: error-placeholder
type: Box
blocks:
  - id: heading
    type: Html
    properties:
      html: "<h2>Error (placeholder — replaced by part 16)</h2>"
```

Keep the bodies stable so part 16 can replace them wholesale. Don't add `_var`s or render-time logic — those land with the real templates.

## Acceptance Criteria

- All four files exist at `modules/workflows/templates/{edit,view,review,error}.yaml.njk`.
- Each file is valid YAML (parses without error).
- Each file declares a distinct page-kind via the heading text so a build that wires them in renders four visibly-different placeholders.
- No `.gitkeep` or README needed — the four files themselves are the only contents of `templates/`.

## Files

- `modules/workflows/templates/edit.yaml.njk` — create
- `modules/workflows/templates/view.yaml.njk` — create
- `modules/workflows/templates/review.yaml.njk` — create
- `modules/workflows/templates/error.yaml.njk` — create

## Notes

The `.yaml.njk` extension is deliberate even though no Nunjucks templating happens in the placeholders — part 16's real templates use Nunjucks interpolation against template vars, and keeping the placeholder extension consistent means part 16 replaces bodies in-place without rename or `_ref` updates from part 12's resolver. Path stability is the whole point of shipping placeholders.
