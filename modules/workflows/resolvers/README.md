# Workflows module — resolvers

Build-time Lowdefy `_ref` resolvers consumed by the workflows module. Each
resolver is a default-exported function that receives `(refPath, vars,
context)` from Lowdefy's build. They run during `pnpm ldf:b` either from
the module manifest (manifest scope), per-page page shells (dynamic-pages
scope), or from inside Nunjucks page templates (template scope).

## Resolver reference

### `makeWorkflowsConfig.js` (part 4)

- **Source:** [parts/04-workflow-config-schema/design.md](../../../../designs/workflows-module/parts/04-workflow-config-schema/design.md)
- **Inputs:** `{ workflows: WorkflowYaml[] }`
- **Output:** Normalized workflows-config — array of workflow objects narrowed to the engine-runtime fields the WorkflowAPI connection reads at runtime. Build-time-only fields (`form`, `form_review`, `form_error`, `pages`, `hooks`, `interactions`, `event`) are stripped.
- **Invocation:** Manifest scope, under the WorkflowAPI connection's `properties.workflowsConfig` (lands with part 20's manifest work).
- **Tests:** [makeWorkflowsConfig.test.js](makeWorkflowsConfig.test.js)

### `makeActionPages.js` (part 12)

- **Source:** [parts/12-resolver-pages/design.md](../../../../designs/workflows-module/parts/12-resolver-pages/design.md)
- **Inputs:** `{ workflows: WorkflowYaml[], app_name: string }`
- **Output:** Array of `{ id, definition }` page shells — one per `(workflow_type, action_type, verb)` for form actions, gated by `access.{app_name}`. Each shell `_ref`s a template at `templates/{verb}.yaml.njk` with `action_config`, `workflow_type`, `entity_collection`, `page_ids`, and `page_config` vars (the last is the per-verb slice of `action.pages.{verb}`).
- **Invocation:** Manifest scope, under the dynamic-pages resolver channel (task 3 blocked on upstream part 2 — see [part 12 tasks.md](../../../../designs/workflows-module/parts/12-resolver-pages/tasks/tasks.md)).
- **Tests:** [makeActionPages.test.js](makeActionPages.test.js)

### `makeActionsForm.js` (part 15)

- **Source:** [parts/15-resolver-form-builder/design.md](../../../../designs/workflows-module/parts/15-resolver-form-builder/design.md)
- **Inputs:** `{ form: FormEntry[], mode?: 'edit' | 'view' | 'review' | 'error' }` — `form` is one of `action.form` / `action.form_review` / `action.form_error` passed in by the caller. `mode` controls the `viewOnly` filter (see below).
- **Output:** Substituted Lowdefy block-tree array. Bare-name `component:` entries are replaced with a `_ref` to the matching library file (`components/fields/<name>.yaml`, resolved relative to this module's file root) carrying the author's vars. Namespaced `component:` entries (containing `:`) and raw inline blocks pass through unchanged. For the five structural components — `controlled_list`, `section`, `box`, `label`, `file_upload` — the author's `form:` key is renamed to `blocks:` before substitution and the sub-form is walked recursively.
- **Invocation:** **Template scope.** Part 16's `.yaml.njk` page templates render the form body by calling `_ref: { resolver: '../resolvers/makeActionsForm.js', vars: { form: <action_config.form|form_review|form_error>, mode: <verb> } }` at render time. Not registered in the module manifest.
- **Tests:** [makeActionsForm.test.js](makeActionsForm.test.js)

#### Mode-aware filtering (`mode` + `viewOnly`)

Authors can mark a field `viewOnly: true` to suppress it on the edit render and keep it on view / review / error. Templates pass `mode: 'edit' | 'view' | 'review' | 'error'` alongside `form`; the resolver drops `viewOnly: true` entries when `mode === 'edit'` and strips the `viewOnly` key from every emitted entry regardless of mode (so it never reaches Lowdefy as an unknown library var). The filter applies at every nesting depth — `viewOnly: true` inside a `controlled_list` sub-form drops on edit too.

`mode` is required only when the form (or any nested sub-form) contains a `viewOnly: true` entry; absent otherwise. An invalid `mode` value or a missing-when-required `mode` fails the build with a precise message.

```yaml
form:
  - component: text_input
    key: contact_name
    required: true
  - component: label
    key: form.validation.created
    title: Validated
    viewOnly: true
```

### `makeActionFormConfigs.js` (part 15)

- **Source:** [parts/15-resolver-form-builder/design.md](../../../../designs/workflows-module/parts/15-resolver-form-builder/design.md)
- **Inputs:** `{ workflows: WorkflowYaml[] }`
- **Output:** Object keyed by `action_type` (form actions only) carrying per-action metadata trees: `{ form, form_review?, form_error? }` where each value is an array of `{ component, key, required, title, validate, form? }` nodes. Structural components nest a recursive `form:` array. The output is metadata-only — the substituted block tree is rendered per-page by `makeActionsForm`, not stored here.
- **Invocation:** Manifest scope, under `global.action_form_configs` (see [module.lowdefy.yaml](../module.lowdefy.yaml)).
- **Tests:** [makeActionFormConfigs.test.js](makeActionFormConfigs.test.js)

## Patterns

- **Signature.** All resolvers default-export a function `(refPath, vars, context) => result`. Most ignore the first argument and read everything from `vars`.
- **Validation posture.** Each resolver throws with a `${resolverName}:` prefix on failure. Failure messages include the offending path / name / key.
- **No defensive checks for framework guarantees.** Resolvers assume `vars` arrives with `_ref`s expanded. No null-checks for shapes Lowdefy guarantees.
- **Tests.** Jest specs are colocated with the resolver, follow `xxx.test.js` naming, and drive the resolver with inline hand-rolled fixtures. Assertions target the output shape, not implementation details.
- **Dependencies.** No top-level deps — all four resolvers are pure JS. Missing library files and missing required vars fail at the framework's `_ref` / `_var` resolution step rather than via resolver-side pre-validation.
