# Task 9: Migrate `global:` exports to `components:` (manifest + concept spec)

## Context

The workflows module's design principle (per the design's "Convert `global:` exports to `components:`" section) is that module exports go through `exports.components` and the `components:` block, not through the `global:` register. The global register is app-level state shared across pages; using it as a module export surface leaks module internals into a flat namespace and breaks the scoped, build-tracked addressability that `_ref: { module, component }` provides.

The on-disk manifest already gets this right for the two enums (`action_statuses` / `workflow_lifecycle_stages` are declared under `components:` at `modules/workflows/module.lowdefy.yaml` lines 88–97). Two drift points remain:

1. **`action_form_configs`** is the only remaining entry in the on-disk manifest's `global:` block (lines 123–130). It's a resolver-emitted register populated by `resolvers/makeActionFormConfigs.js` (part 15). Move it to `components:` and add it to `exports.components`. The `global:` block then has no entries and can be deleted.

2. **Concept spec drift.** `designs/workflows-module-concept/module-surface/spec.md` lines 113–117 still describes the enums under `global:`. The shipped manifest already moved them; this task brings the spec in line.

This task is the manifest+spec change only. The consumer-page rewrites (consuming `action_form_configs` via the new component idiom instead of `_global:`) ship in task 10.

## Task

### `modules/workflows/module.lowdefy.yaml`

Make three edits to the existing manifest (post-task-2 state):

1. **Add `action_form_configs` to `exports.components`** — alongside the existing entries (`action_statuses`, `workflow_lifecycle_stages`, `actions-on-entity`, `workflow-header`, `action_role_check`):

```yaml
- id: action_form_configs
  description: Resolver-emitted map of per-action form configurations (form + form_review arrays) keyed by action type. Populated by makeActionFormConfigs.js from vars.workflows_config.
```

2. **Move the resolver `_ref` block into `components:`** — append a new entry to the existing `components:` block (lines 87–104 of the on-disk manifest):

```yaml
- id: action_form_configs
  component:
    _ref:
      resolver: resolvers/makeActionFormConfigs.js
      vars:
        workflows:
          _module.var: workflows_config
```

3. **Delete the `global:` block** — lines 123–130 of the on-disk manifest (`global:` key, the `action_form_configs:` entry, and the resolver `_ref`). With `action_form_configs` migrated, the block is empty.

### `designs/workflows-module-concept/module-surface/spec.md`

Lines 113–117 currently show:

```yaml
global:
  action_statuses:
    _ref: enums/action_statuses.yaml # merged with vars.action_statuses_display at build time
  workflow_lifecycle_stages:
    _ref: enums/workflow_lifecycle_stages.yaml # merged with vars.workflow_lifecycle_stages_display
```

Replace with entries under `components:` (alongside the existing entity-page components in the spec). The `_ref` shapes preserve the build-time merge with the display-overrides vars — the spec previously implied the merge happened at the global level; in the components version, the merge is the component's value:

```yaml
components:
  - id: actions-on-entity
    component: { _ref: components/actions-on-entity.yaml }
  - id: workflow-header
    component: { _ref: components/workflow-header.yaml }
  - id: action_role_check
    component: { _ref: components/action_role_check.yaml }
  - id: action_statuses
    component:
      _build.object.assign:
        - _ref: enums/action_statuses.yaml
        - _module.var: action_statuses_display
  - id: workflow_lifecycle_stages
    component:
      _build.object.assign:
        - _ref: enums/workflow_lifecycle_stages.yaml
        - _module.var: workflow_lifecycle_stages_display
```

Update `exports.components:` in the same spec file (the static block earlier in the file at lines 42–45) to list `action_statuses` and `workflow_lifecycle_stages` alongside the entity-page components:

```yaml
components:
  - id: actions-on-entity
  - id: workflow-header
  - id: action_role_check
  - id: action_statuses
  - id: workflow_lifecycle_stages
```

Delete the spec's top-level `global:` block (lines 113–117).

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` has no `global:` block.
- `modules/workflows/module.lowdefy.yaml`'s `components:` block contains an `action_form_configs` entry whose value is the resolver `_ref`.
- `modules/workflows/module.lowdefy.yaml`'s `exports.components:` lists `action_form_configs`.
- `designs/workflows-module-concept/module-surface/spec.md` has no `global:` block.
- The concept spec's `components:` block lists all five components (three entity-page components + two enums).
- The concept spec's `exports.components` static block lists the same five IDs.
- Build smoke (`pnpm --filter=demo ldf:b` once the demo wires the module in task 6) does not regress from this change alone — it may still fail on consumer pages until task 10 lands.
- The manifest header comment (top of `modules/workflows/module.lowdefy.yaml`) is updated if it mentions `action_form_configs` or `global:` — drop stale references.

## Files

- `modules/workflows/module.lowdefy.yaml` — **modify** (add component entry + exports row; delete `global:` block; tighten header comment)
- `designs/workflows-module-concept/module-surface/spec.md` — **modify** (move enums from `global:` to `components:`; update `exports.components`; delete `global:`)

## Notes

- The header comment at `modules/workflows/module.lowdefy.yaml` lines 1–13 mentions "the part-15 global register (action_form_configs)" — rewrite that sentence to say "the part-15 `action_form_configs` component" instead. Same for any other comment that calls it a "register" or references `global:`.
- This task is a no-op for runtime behaviour until task 10's consumer rewrites land — pages reading `_global: action_form_configs` will silently get `undefined` after this task but before task 10. Run task 9 and task 10 as a paired change (or fold into one PR if pre-commit hooks tolerate the intermediate state).
- After task 10 lands, run `git grep -n "_global: " modules/workflows/` and confirm zero matches inside the workflows module. Any remaining `_global:` reads from inside the module are bugs.
- Part 15's resolver implementation (`resolvers/makeActionFormConfigs.js`) doesn't change — its output shape is identical whether wired under `global:` or `components:`. Only the manifest declaration moves.
