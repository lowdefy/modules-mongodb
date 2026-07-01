# Task 4: Declare and wire the `title_acronyms` var

## Context

Tasks 2 and 3 made `makeWorkflowsConfig` and `makeActionPages` read `vars.title_acronyms` (defaulting to `[]`) to extend the humanizer's acronym set. For this to take effect at build, the var must be declared on the module manifest and threaded into both resolver `_ref` invocations. Domain acronyms (BOM, SKU, …) are app-specific; without this extension an app's defaults degrade to "Bom", defeating the goal.

Relevant wiring sites:

- **`modules/workflows/module.lowdefy.yaml`** — the `vars:` block (starts line 36; `workflows_config`, `app_name`, `entities`, `action_statuses_display`, …). The `makeActionPages.js` resolver is `_ref`'d at lines 158–164 with `vars: { workflows: {_module.var: workflows_config}, app_name: {_module.var: app_name} }`.
- **`modules/workflows/components/validated_workflows_config.yaml`** — `_ref`s `resolvers/makeWorkflowsConfig.js` with `vars: { workflows: {_module.var: workflows_config} }`.

The app config (`apps/demo/.../lowdefy.yaml` workflows module entry) sets module vars; `title_acronyms` is optional with a `[]` default, so existing apps need no change.

## Task

1. **Declare the var** in `module.lowdefy.yaml` under `vars:`. Per the manifest-is-source-of-truth rule, include `description`, `type`, and `default`:

   ```yaml
   title_acronyms:
     type: array
     default: []
     description: >
       Domain acronyms (e.g. [BOM, SKU]) merged into the module's base acronym
       set and applied by the title humanizer when deriving default titles from
       workflow/action/group slugs. A token whose lowercased form matches an entry
       is fully uppercased in derived titles (e.g. "upload-bom" → "Upload BOM").
       Base set ships in the module; this var extends it. Has no effect on
       explicitly authored `title:` values.
   ```

2. **Wire it into `makeWorkflowsConfig`** in `components/validated_workflows_config.yaml`:

   ```yaml
   _ref:
     resolver: resolvers/makeWorkflowsConfig.js
     vars:
       workflows:
         _module.var: workflows_config
       title_acronyms:
         _module.var: title_acronyms
   ```

3. **Wire it into `makeActionPages`** in `module.lowdefy.yaml` (the `_ref` at ~line 158):

   ```yaml
   _ref:
     resolver: resolvers/makeActionPages.js
     vars:
       workflows:
         _module.var: workflows_config
       app_name:
         _module.var: app_name
       title_acronyms:
         _module.var: title_acronyms
   ```

4. **Note the new action `title` field** in the manifest where the workflow/action schema is described (the `workflows_config` var description references the action-authoring spec). Add a brief note that actions now accept an optional `title` (derived from `type` when omitted). Keep it short — the full convention is documented in task 8.

## Acceptance Criteria

- `title_acronyms` is declared in `module.lowdefy.yaml` with `type: array`, `default: []`, and a description matching the manifest var conventions.
- Both `makeWorkflowsConfig` and `makeActionPages` `_ref`s pass `title_acronyms: { _module.var: title_acronyms }`.
- The manifest notes the optional action `title` field.
- `pnpm ldf:b` (from `apps/demo`) compiles with no new errors — the demo entry omits `title_acronyms` and the `[]` default applies.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify — declare `title_acronyms` var; thread it into the `makeActionPages` `_ref`; note action `title`.
- `modules/workflows/components/validated_workflows_config.yaml` — modify — thread `title_acronyms` into the `makeWorkflowsConfig` `_ref`.

## Notes

- Depends on tasks 2 and 3 only because those resolvers must already consume `vars.title_acronyms`; the wiring is what supplies it at build. The `[]` default in the resolvers means nothing breaks if wiring lands first, but ship them together for a coherent build.
- This is a build-config-only task — run `pnpm ldf:b` to confirm it compiles; no server needed.
