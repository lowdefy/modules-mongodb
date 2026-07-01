# Task 3: Wire `makeActionPages` into the module manifest

## Context

`makeActionPages` produces an array of `{ id, definition }` page objects at build time. For Lowdefy to merge those pages into the app's page tree, the module manifest needs to declare the resolver in its `exports.pages` (or equivalent) section. The mechanism is part 2's dynamic-pages extension to `@lowdefy/build`.

**This task is blocked on part 2.** Part 2 ships the upstream `@lowdefy/build` change that introduces resolver-emit channels for `exports.pages`. Until that lands, there's no manifest shape to write against. If task 2 ships before part 2 is ready, this task lands separately later; tasks 1–2 still produce a working, testable resolver in the meantime.

The current `modules/workflows/module.lowdefy.yaml` is partial — task 1 of part 4 shipped it with just the enum component exports. Part 20 will eventually consolidate the full manifest (connections, secrets, full page exports, api exports, dependencies, etc.). This task adds **only** the page-resolver wiring; it does not pull in part 20's full surface.

## Task

Edit `modules/workflows/module.lowdefy.yaml` to:

1. **Declare the two new vars** the resolver consumes: `workflows_config` (the array of workflow YAMLs, required) and `app_name` (the host app's deployment name, required). Match the description style of the existing `action_statuses_display` / `workflow_lifecycle_stages_display` vars.

2. **Register the resolver** under whatever channel part 2 settled on for dynamic page exports. Two candidate shapes from part 2's design:

   - Inline in `exports.pages` — an entry like `{ resolver: 'resolvers/makeActionPages.js', vars: { workflows: { _module.var: workflows_config }, app_name: { _module.var: app_name } } }`.
   - A parallel `exports.resolvers.pages` list with the same `{ resolver, vars }` entries.

   Use whichever shape part 2 ships. Both pass the resolver the same vars; the only difference is the manifest schema location.

3. **Remove the manifest's preamble comment line** about page exports landing in part 20, since this task adds them. Keep the comment about the full WorkflowAPI connection / secret / menu still being part 20's scope — those parts haven't landed.

### Suggested edit (template — adapt to part 2's actual shape)

```yaml
name: Workflows
version: 0.7.0 # bump minor for the page exports
description: Workflow engine — action lifecycle, status transitions, hooks, trackers

exports:
  components:
    - id: action_statuses
      description: ...
    - id: workflow_lifecycle_stages
      description: ...
  pages:
    # Per-action pages emitted at build time by makeActionPages.
    # Page ids derive from the host app's workflows_config; the resolver
    # gates emission per action's access.{app_name} verb list.
    - resolver: resolvers/makeActionPages.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }

vars:
  workflows_config:
    type: array
    required: true
    description: >
      App-supplied array of workflow YAML definitions. Each entry is a
      workflow object (type, entity_collection, action_groups, starting_actions,
      actions, …). The framework expands nested `_ref`s before the
      resolver runs. See `designs/workflows-module-concept/action-authoring/spec.md`.
  app_name:
    type: string
    required: true
    description: >
      Host app's deployment name. Used to filter `access.{app_name}` per
      action, gating which verb pages emit (one app per module composition).
  action_statuses_display:
    type: object
    default: {}
    description: ...
  workflow_lifecycle_stages_display:
    type: object
    default: {}
    description: ...

components:
  - id: action_statuses
    component: ...
  - id: workflow_lifecycle_stages
    component: ...

plugins:
  - name: "@lowdefy/modules-mongodb-plugins"
    version: "^0.6.0"
```

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` declares `workflows_config` and `app_name` as required vars with descriptions.
- The manifest registers `resolvers/makeActionPages.js` under the dynamic-page-export channel as defined by part 2.
- A demo app composing the module with a valid `workflows_config` and `app_name` produces the expected per-action page set at build time (verify by inspecting the Lowdefy build output's page list).
- A demo app composing the module **without** `app_name` fails the build with the precise error from `makeActionPages` (task 2 already throws on falsy `app_name`).
- The manifest version is bumped (minor — page exports are an additive feature).
- The existing enum components (`action_statuses`, `workflow_lifecycle_stages`) and their vars continue to work unchanged.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify

## Notes

- **Blocked on part 2.** Don't start this task before part 2's `@lowdefy/build` change merges. The manifest shape depends on which channel shape part 2 picks (inline `exports.pages` vs `exports.resolvers.pages`).
- **Do not** add the WorkflowAPI connection, the `MONGODB_URI` secret, menus, or the form-components library exports here. Those land in part 20's full manifest consolidation. This task is page-resolver wiring only.
- **Per-app-name validation already in the resolver** (task 2). The manifest's `required: true` is defense-in-depth at the module-loading layer; the resolver's runtime check handles falsy values that slip past the schema.
- If part 2's dynamic-page channel only accepts a single resolver entry (not an array), the manifest entry shape may differ — read part 2's design before writing.
