# Part 15 — `makeActionsForm` + `makeActionFormConfigs`

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Compose an action's `form:` YAML into a full Lowdefy block tree by substituting library components ([part 14](../14-form-components-library/design.md)) by name. Ship two artifacts:

- **`makeActionsForm`** — a build-time resolver that templates call from inside their Nunjucks bodies via `_ref: { resolver: makeActionsForm.js, vars: { form: ... } }` to render the form block tree at template-render time.
- **`global.action_form_configs`** — per-action **metadata** (not substituted block trees) emitted once at build time by `makeActionFormConfigs`, so part 17's `workflow-overview` page can introspect field shape without re-parsing authored YAML.

v1 commits to template-scope invocation for `makeActionsForm` (per the "Two emission paths" section): part 16's `.yaml.njk` templates call `_ref: { resolver: makeActionsForm.js, vars: { form: ... } }` from inside their bodies. The concept docs flag this pattern as unverified for modules; v1 accepts the risk based on part 4's confirmation that `_ref: { resolver }` works at manifest scope and ships forward without a separate spike. JS-internal recursion inside `makeActionsForm` (the walker that handles structural components with nested `form:` arrays) is plain JavaScript and ships unconditionally — see "JS-internal recursion" below.

### Two emission paths (committed)

- **Form block tree (per page).** Part 12 lifts the raw, unsubstituted `form` / `form_review` / `form_error` blocks onto every emitted page's `action_config` template var (see [makeActionPages.js:18-20](../../../../modules/workflows/resolvers/makeActionPages.js)). Templates (part 16) pass the matching slice into `makeActionsForm` via `_ref: { resolver }` at render time; substitution happens once per page render. This is the canonical path for `edit` / `view` / `review` / `error` pages.
- **Form metadata (global).** `makeActionFormConfigs` walks the authored YAML once at build time and emits `global.action_form_configs.{action_type}` carrying a per-field metadata tree (each node carries `component`, `key`, `required`, `title`, `validate`, plus a recursive `form:` array on structural components — see `makeActionFormConfigs.js` below). Templates read this to render read-only summary views (part 17's overview cards) without re-running substitution. `action_form_configs` carries metadata only — never the substituted block tree.

## In scope

### `makeActionsForm.js`

For each form action's `form:` block (and `form_review:` and `form_error:` if present):

- Walk each entry. If `component:` is set, substitute with the matching internal component fragment from `components/fields/{component}.yaml`.
- Merge the entry's vars into the component's `vars:` declarations; validate required vars present.
- Recurse into nested blocks (e.g. `controlled_list` rows that themselves declare a sub-form).
- **Sub-form var name normalization.** Authors write the sub-form slot as `form:` (per the action-authoring spec); the shipped library declares the same slot as `blocks:` on the components that own one (`controlled_list`, `section`, `box`, `label`, `file_upload`). The resolver renames `form:` → `blocks:` on entries whose `component:` is in this allowlist before merging vars. Library YAML stays as the implementation truth; the spec's `form:` vocabulary stays as the authoring truth. Authors who write `blocks:` directly on a non-allowlisted component get the standard "unknown var" rejection (see Build-time validation).
- **No `form_error` defaulting.** When the author doesn't declare `form_error:`, the resolver does not synthesize one from `form:`. Templates handle the absent case by defaulting to `[]` (empty form body — the error page's failure-context banner stands alone). This matches v0's behavior in [`dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk`](../../../../dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk): `form: { _var: { key: action_config.form_error, default: [] } }`. The concept spec's wording at [action-authoring/spec.md:285](../../../workflows-module-concept/action-authoring/spec.md) ("The error form schema defaults to the action's `form:` block") is overridden by v0's actual behavior — the empty-form default is the v1 commitment.
- Output: a fully-substituted Lowdefy block tree the page template can render.

### `makeActionFormConfigs.js`

Emits a build-time `global.action_form_configs` object keyed by `{action_type}` (the action_type is the schema identity; per-instance keys on keyed actions vary at runtime and don't affect schema, so they don't appear in this map). Each entry carries metadata only — the substituted block tree is **not** in this output; it's rendered per-page by `makeActionsForm` via the `_ref: { resolver }` path described above.

Each entry's shape:

```yaml
{action_type}:
  form:         <metadata tree>
  form_review:  <metadata tree>   # only when declared
  form_error:   <metadata tree>   # only when declared
```

`<metadata tree>` is an array of field nodes. Each node carries:

- `component` — the author's `component:` name (e.g. `text_input`, `controlled_list`).
- `key` — the author-supplied state path.
- `required` — boolean (defaults to `false`).
- `title` — display title (when authored).
- `validate` — author-supplied validate rules (when authored).
- `form` — recursive metadata tree, only present for structural components that own a sub-form (`controlled_list`, `section`, `box`, `label`, `file_upload`). Matches the authoring vocabulary — sub-form-bearing components nest a `form:` array under both the authored YAML and the emitted metadata.

Part 17 switches on `component` to pick the right read-only renderer per field. The tree shape preserves nesting; structural components render their nested `form` recursively.

### JS-internal recursion

The resolver walks the authored form tree in plain JavaScript. When it hits a structural component with a nested `form:` (`controlled_list`, `section`, `box`, `label`, `file_upload`), it recurses into its own walker to substitute the children before merging vars on the parent. No Lowdefy machinery involved; this is normal function recursion. Independent of the template-scope invocation question.

### Build-time validation

- **Bare `component:` names must match a library file.** A `component:` value with no `:` separator (e.g. `text_input`, `controlled_list`) is treated as a library reference; if the file at `components/fields/{component}.yaml` doesn't exist, the build fails with the action path and the offending name.
- **Namespaced `component:` names pass through.** A `component:` value containing `:` (e.g. `my-plugin:device_selector`) is Lowdefy plugin-component syntax; the resolver leaves the entry unchanged in the substituted tree — Lowdefy resolves the plugin at runtime.
- Required vars missing fail the build.
- Block id collisions within a single substituted form tree fail the build with the offending ids and their component names. Includes wrapper ids derived via `_string.concat` (e.g. `controlled_list`'s `{key}_label`) — two author-side keys that collide with another's wrapper-id pattern are still caught.

## Out of scope / deferred

- **Cross-form id deduplication** across `form:` / `form_review:` — concept says authors must pick non-colliding names; resolver doesn't reconcile.

## Depends on

[Part 4](../04-workflow-config-schema/design.md), [part 12](../12-resolver-pages/design.md) (templates pass `action_config.{form|form_review|form_error}` into `makeActionsForm` via `_ref: { resolver }`), [part 14](../14-form-components-library/design.md).

## Verification

- Unit tests on `makeActionsForm`:
  - Flat form composes correctly.
  - Nested form section (`controlled_list` with author-side `form:` sub-form) composes — the resolver renames `form:` → `blocks:` on the allowlisted component before substitution.
  - Bare unknown `component:` value (no `:` separator) fails the build with workflow + action path.
  - Namespaced `component:` value (`my-plugin:device_selector`) survives substitution unchanged.
  - Required-vars missing fails the build.
- Unit tests on `makeActionFormConfigs`:
  - Worked-example actions produce the expected `global.action_form_configs` shape — tree of `{ component, key, required, title, validate }` nodes with nested `form:` arrays on structural components.
  - Action with `form_error:` absent: the entry's `form_error` is absent from the metadata too (no resolver-side defaulting to `form:`).
  - Keyed action: `action_form_configs` carries one entry per `{action_type}` — no per-instance entries. Confirms per-key handling is a runtime concern.
- Both resolvers documented in `modules/workflows/resolvers/README.md` alongside the existing entries (parts 4, 12).
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Contract to neighbours

- **Part 12** emits page shells that `_ref` into the resolver this part ships.
- **Part 16** templates render the block tree this resolver emits.
- **Part 17 (shared-pages)** uses `global.action_form_configs` to render workflow-overview cards.
