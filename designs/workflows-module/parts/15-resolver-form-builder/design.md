# Part 15 — `makeActionsForm` + `makeActionFormConfigs`

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Compose an action's `form:` YAML into a full Lowdefy block tree by substituting library components ([part 14](../14-form-components-library/design.md)) by name. Emit per-action form metadata as `global.action_form_configs` so templates can read field types, validation, and defaults without re-parsing YAML.

This part also runs the concept's flagged spike: confirm `_ref: { resolver }` works from inside a Nunjucks template at module scope. If it fails, fall back to a flat (non-recursive) emitter.

## In scope

### `makeActionsForm.js`

For each form action's `form:` block (and `form_review:` and `form_error:` if present):

- Walk each entry. If `component:` is set, substitute with the matching internal component fragment from `components/fields/{component}.yaml`.
- Merge the entry's vars into the component's `vars:` declarations; validate required vars present.
- Recurse into nested blocks (e.g. `controlled_list` rows that themselves declare a sub-form).
- Output: a fully-substituted Lowdefy block tree the page template can render.

### `makeActionFormConfigs.js`

Emits a build-time `global.action_form_configs` object keyed by `{action_type}` (or `{action_type}.{key}` for keyed actions). Each entry carries:

- `form` block tree.
- `form_review` block tree (when declared).
- `form_error` block tree (when declared).
- Field metadata (id, type, required) flat list for templates to introspect — used by overview pages (part 17) to render read-only field values.

### Resolver-recursion spike

Concept flags `_ref: { resolver }` from inside a Nunjucks template at module scope as unverified. Run the spike here:

- Build a minimal fixture: a workflows template that calls `_ref: { resolver: './makeActionsForm.js' }`.
- Confirm the resolver runs and the path resolves correctly.
- If it works, ship the recursive form-building path (concept's intended design).
- If it fails, ship a flat emitter that doesn't recurse: nested sub-forms require apps to extract them into separate components or override the per-action template. Document the limitation in [part 14's README](../14-form-components-library/design.md).

### Build-time validation

- Unknown `component:` value fails the build with a precise message.
- Required vars missing fail the build.
- Block id collisions within a form fail the build.

## Out of scope / deferred

- **Custom (non-library) component support** — apps can use `component: <plugin-name>:foo` per Lowdefy patterns; this resolver passes them through unchanged.
- **Cross-form id deduplication** across `form:` / `form_review:` — concept says authors must pick non-colliding names; resolver doesn't reconcile.

## Depends on

[Part 4](../04-workflow-config-schema/design.md), [part 14](../14-form-components-library/design.md).

## Verification

- Unit tests on `makeActionsForm`:
  - Flat form composes correctly.
  - Nested form section (`controlled_list` with sub-form) composes — assuming the spike passes.
  - Unknown `component:` value fails the build.
  - Required-vars missing fails the build.
- Unit tests on `makeActionFormConfigs`:
  - Worked-example actions produce the expected `global.action_form_configs` shape.
- Spike outcome documented in `modules/workflows/components/fields/README.md`.

## Open questions

- **Spike outcome.** Recursive vs. flat emitter. Decision lands here.
- **Whether to ship the universal-fields renderer in this part or in templates.** Concept assigns universal fields to page templates ([part 16](../16-page-templates/design.md)), not the form library. Confirm.

## Contract to neighbours

- **Part 12** emits page shells that `_ref` into the resolver this part ships.
- **Part 16** templates render the block tree this resolver emits.
- **Part 17 (shared-pages)** uses `global.action_form_configs` to render workflow-overview cards.
