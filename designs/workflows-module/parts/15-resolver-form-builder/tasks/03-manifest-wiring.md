# Task 3: Register `makeActionFormConfigs` in `module.lowdefy.yaml`

## Context

`makeActionFormConfigs` (task 2) is inert until it's registered in the workflows module's manifest. This task wires it under `global.action_form_configs` so part 17's `workflow-overview` page (and any other consumer in any host app) can read the per-action metadata tree.

`makeActionsForm` (task 1) is **not** registered in the manifest — it's invoked from inside Nunjucks templates at render time via `_ref: { resolver }` (part 16 owns the invocation). The module manifest only registers resolvers whose output lands on `global` (or on `exports.*`).

### Current manifest state

[modules/workflows/module.lowdefy.yaml](../../../../modules/workflows/module.lowdefy.yaml) currently declares only the part-4 enum components (`action_statuses`, `workflow_lifecycle_stages`). The top-of-file comment notes the full surface (WorkflowAPI connection, secrets, page/api/menu exports, the form-fields library, the dynamic-pages resolver) lands in part 20. Part 15 adds a single `global:` section to that picture.

### Vars added in this task

The resolver needs access to the host app's `workflows_config` array. Part 4's `makeWorkflowsConfig` and part 12's `makeActionPages` both already consume `vars.workflows_config` via `_module.var: workflows_config`. The workflows module already has a `workflows_config` var documented at the design level (part 4) but it's not yet declared in the manifest — this task adds it if it isn't already there.

### Wave-2 status

Per [implementation-plan.md](../../../implementation-plan.md), part 12's task 3 (manifest wiring) is **blocked on part 2** (upstream `@lowdefy/build` dynamic-pages resolver channel). Part 12's pages exports need the upstream change; **`global:` registration does not**. The `_ref: { resolver }` shape at the manifest level is verified working (per [part 04 review-1 finding 5](../../04-workflow-config-schema/review/review-1.md), `getRefContent.js:29` handles it; the part-04 manifest already uses it for the enum merge — see [module.lowdefy.yaml:42-50](../../../../modules/workflows/module.lowdefy.yaml)).

So this task is **not blocked on part 2**. It can ship as soon as task 2 has landed.

## Task

### 1. Declare `workflows_config` in `vars:`

Add to `vars:` block in [module.lowdefy.yaml](../../../../modules/workflows/module.lowdefy.yaml):

```yaml
  workflows_config:
    type: array
    required: true
    description: >
      Array of workflow definitions consumed by every build-time resolver in this
      module (parts 4, 12, 13, 15). Host app supplies via the entry's `vars` block,
      e.g. `vars: { _ref: workflow_config/workflows.yaml }`. Each entry is a workflow
      object with `type`, `entity_collection`, `starting_actions`, `action_groups`,
      and `actions` (see workflows-module-concept/action-authoring/spec.md).
```

If part 4's task 3 already added this var, leave the existing declaration in place — do not duplicate.

### 2. Add a `global:` section

Append (or create) a top-level `global:` section in [module.lowdefy.yaml](../../../../modules/workflows/module.lowdefy.yaml):

```yaml
global:
  action_form_configs:
    _ref:
      resolver: resolvers/makeActionFormConfigs.js
      vars:
        workflows:
          _module.var: workflows_config
```

Place `global:` between `components:` and `plugins:` (lines 50-52 of the current file).

### 3. Update the top-of-file comment

The current top-of-file comment notes the manifest "currently declares only the part-04 enum components." After this task lands, that's no longer accurate. Reword the comment to add a line acknowledging part-15 `global:` registration:

```yaml
# This manifest declares the part-04 enum components and the part-15
# global register (action_form_configs).
# The full module surface — WorkflowAPI connection, MONGODB_URI secret,
# page/api/menu exports, form-fields component library — lands in part 20.
# ...
```

Keep the rest of the comment intact.

### 4. Verify the build

Run `pnpm ldf:b` from `apps/demo/` (or wherever the demo build runs) with the workflows module wired into `apps/demo/modules.yaml`. The build should:

- Run `makeActionFormConfigs` once at manifest-resolution time.
- Make `_global.action_form_configs.{action_type}` readable from any page in the demo app.

The workflows module isn't currently composed into [apps/demo/modules.yaml](../../../../../apps/demo/modules.yaml). Add a minimal entry **temporarily** for this verification, then revert. The permanent wiring is part 20's responsibility.

To verify the global is populated, add a one-off demo page that renders `{ _global: action_form_configs }` and check it shows the worked-example workflow's metadata after the build. Strip the demo page after verification.

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` declares `workflows_config` in its `vars:` block (if not already declared by part 4's manifest tasks).
- A `global:` section registers `action_form_configs` via `_ref: { resolver: resolvers/makeActionFormConfigs.js, vars: { workflows: { _module.var: workflows_config } } }`.
- The top-of-file manifest comment reflects the new `global:` entry.
- A clean demo-app build (`pnpm ldf:b`) with the workflows module composed in succeeds.
- `_global.action_form_configs.{action_type}` is readable from a one-off demo page and reflects the worked-example workflow's metadata tree.
- The one-off demo verification page (and any temporary `apps/demo/modules.yaml` entry) is removed after verification.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify — add `vars.workflows_config`, add `global:` section, update top-of-file comment.

## Notes

- **`makeActionsForm` does not get a manifest entry.** It's a resolver invoked from inside templates — Lowdefy resolves the path relative to the calling template's location, not from the manifest. Part 16's templates do the invocation; part 15 just ships the resolver file.

- **`workflows_config` var declaration ownership.** The design owns this var across parts 4, 12, 13, and 15. The first part to land its manifest wiring (likely part 4's task 3 or part 12's task 3) declares the var. This task adds it only if not already there.

- **Defense in depth on `workflows_config: required: true`.** The resolvers themselves don't fail explicitly when `workflows_config` is missing — the manifest-level `required: true` catches the missing-var case at build time. Matches part 20's required-var posture for `app_name` (see [part 12 review-1 finding 6](../../12-resolver-pages/review/review-1.md)).

- **Don't touch the demo app's permanent state.** Any demo-app modifications for verification (modules.yaml entry, one-off demo page) are temporary and get reverted before the task lands. Part 20 owns the permanent demo-app wiring.
