# Task 4: Write the resolvers README

## Context

Tasks 1–3 ship two new build-time resolvers in `modules/workflows/resolvers/`. Currently the directory holds [makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) (part 4) and [makeActionPages.js](../../../../modules/workflows/resolvers/makeActionPages.js) (part 12) plus their tests — no README.

This task creates `modules/workflows/resolvers/README.md` as the single home for the resolver-package reference.

The README's audience is two-way:

1. **Module maintainers** adding a new resolver or modifying an existing one — they need to know the patterns the existing resolvers follow (input shape, error posture, test style, naming convention).
2. **Downstream-design authors** (parts 16, 17, 20) who reference these resolvers' outputs — they need to know each resolver's emission shape and where to consume it.

The README is **not** an author-facing reference for the form-components library. That's [components/fields/README.md](../../../../modules/workflows/components/fields/README.md), shipped by part 14.

## Task

Create `modules/workflows/resolvers/README.md` with the following sections.

### 1. Overview

One short paragraph: what the resolvers directory is, that all entries are pure build-time Lowdefy `_ref` resolvers, and where they're invoked from (the manifest, page shells, and templates).

### 2. Resolver reference

A subsection per resolver. Order: by part number (4, 12, 15). Each subsection covers:

- **Source part** (with a link to the design).
- **Inputs** — the `vars` shape (concrete object, not prose).
- **Output** — what the resolver returns (shape + downstream consumer).
- **Invocation site** — manifest scope (`module.lowdefy.yaml`'s `global:` or `components:`), per-page shell, or template scope.
- **Tests** — pointer to the `.test.js` file.

Required entries:

#### `makeWorkflowsConfig.js` (part 4)

- Source: [parts/04-workflow-config-schema/design.md](../../04-workflow-config-schema/design.md).
- Inputs: `{ workflows: WorkflowYaml[] }`.
- Output: a normalized workflows-config object read by the WorkflowAPI connection at runtime (engine-runtime slice).
- Invocation: manifest scope, under the connection's `properties.workflowsConfig` (lands with part 20's manifest work).
- Tests: [makeWorkflowsConfig.test.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.test.js).

#### `makeActionPages.js` (part 12)

- Source: [parts/12-resolver-pages/design.md](../../12-resolver-pages/design.md).
- Inputs: `{ workflows: WorkflowYaml[], app_name: string }`.
- Output: an array of `{ id, definition }` page shells — one per (workflow_type, action_type, verb) for form actions, gated by `access.{app_name}`. Each shell `_ref`s a template at `templates/{verb}.yaml.njk` with `action_config`, `workflow_type`, `entity_collection`, `page_ids`, and chrome vars.
- Invocation: manifest scope, under the dynamic-pages resolver channel (blocked on upstream part 2; see [part 12 tasks.md](../../12-resolver-pages/tasks/tasks.md)).
- Tests: [makeActionPages.test.js](../../../../modules/workflows/resolvers/makeActionPages.test.js).

#### `makeActionsForm.js` (part 15)

- Source: [parts/15-resolver-form-builder/design.md](../design.md).
- Inputs: `{ form: FormEntry[], mode?: 'edit' | 'view' | 'review' | 'error' }`. `mode` is required when any `form` entry carries `viewOnly: true` (drives the v0-parity `viewOnly` filter — see task 5); optional otherwise.
- Output: a substituted Lowdefy block-tree array — library components are dereferenced and merged with author-supplied vars; raw blocks and namespaced (`<plugin>:<name>`) components pass through unchanged. On `mode: 'edit'`, entries with `viewOnly: true` are dropped; on the other modes they survive (with the `viewOnly` key stripped).
- Invocation: **template scope.** Part 16's `.yaml.njk` templates render the form body by calling `_ref: { resolver: '../resolvers/makeActionsForm.js', vars: { form: <action_config.form>, mode: <verb> } }` at render time. Not registered in the module manifest.
- Tests: `makeActionsForm.test.js`.

#### `makeActionFormConfigs.js` (part 15)

- Source: [parts/15-resolver-form-builder/design.md](../design.md).
- Inputs: `{ workflows: WorkflowYaml[] }`.
- Output: an object keyed by `action_type` (form actions only) carrying per-action metadata trees: `{ form, form_review?, form_error? }` where each value is an array of `{ component, key, required, title, validate, form? }` nodes. Structural components (`controlled_list`, `section`, `box`, `label`, `file_upload`) nest a recursive `form:` array.
- Invocation: manifest scope, under `global.action_form_configs`.
- Tests: `makeActionFormConfigs.test.js`.

### 3. Patterns

A short subsection covering the conventions every resolver in this directory follows. One or two sentences each:

- **Signature.** All resolvers default-export a function with signature `(_, vars) => result`. Lowdefy passes vars as the second argument.
- **Validation posture.** Each resolver throws with a `${resolverName}:` prefix on failure. Failure messages include the offending path / name / key.
- **No defensive checks for framework guarantees.** Resolvers assume `vars` arrives with `_ref`s expanded. No null-checks for shapes Lowdefy guarantees.
- **Tests.** Jest specs colocated with the resolver. Drive the resolver with hand-rolled fixtures; assert on the output shape.
- **No top-level dependencies beyond `js-yaml`** (used by `makeActionsForm` for library-file loading).

## Acceptance Criteria

- `modules/workflows/resolvers/README.md` exists with the three sections above.
- Every resolver in the directory has a corresponding subsection in section 2.
- All file links in the README resolve to valid targets.

## Files

- `modules/workflows/resolvers/README.md` — create — the resolver-package reference.

## Notes

- **Don't duplicate the field-component reference.** [components/fields/README.md](../../../../modules/workflows/components/fields/README.md) is the author-facing field library doc; this README is the developer-facing resolver-package doc. They have different audiences.

- **Keep it short.** This is reference material, not a tutorial. Each resolver subsection should fit on a page. The patterns section is two or three bullets.

- **Link to designs, not specs.** The README points at part designs and tasks; readers can chase through to the concept specs if they need rationale. Keep the link depth shallow.
