# Task 1: Emit `global.simple_action_buttons` from `makeWorkflowsConfig` (D3)

## Context

Form actions get per-action *generated* pages, so an author's per-button visibility overrides bake into each page's vars. Simple actions share **one static page per verb** across every simple action, so any per-action override must be **read at runtime** from the action's authored config.

The shared `simple-action-surface` component (Task 3) gates each signal button with a three-way AND; the **first** AND term is the author opt-out, read as `_global: simple_action_buttons.<action_type>.<signal>.visible`. This task produces that global map.

The resolver lives at `modules/workflows/resolvers/makeWorkflowsConfig.js`. It already validates every workflow and returns an array of workflow configs (picking `ACTION_FIELDS` per action), consumed via `components/validated_workflows_config.yaml` by `connections/workflow-api.yaml` and exposed as `_module.var: workflows_config`. Authored per-action button overrides live under the action config (the author writes `buttons.<signal>.visible: false` on an action; confirm the exact authored key against `action-authoring/spec.md` and Part 39's form `page_config.buttons.<signal>.visible` convention, and mirror it).

The six button-surfaced signals and their **defaults** (parity with the form templates — [Part 39 D3]):

- `submit`, `progress`, `approve`, `request_changes`, `resolve_error` → default **`true`** (author can hide).
- `not_required` → default **`false`** (opt-in).

The author can only ever **hide** a default-shown button or **show** the opt-in `not_required`; they can never make the FSM accept a signal — the surface's source-stage AND term always applies independently (Task 3).

## Task

1. **Compute a per-simple-action button-visibility map.** For every action with `kind: simple`, build `{ <signal>: { visible: <bool> } }` for all six signals above, applying the defaults and overlaying any authored override. Key the map by **action `type`**: `simple_action_buttons[action.type][signal].visible`.
2. **Expose it as `global.simple_action_buttons`.** Wire the computed map so the surface can read it via `_global: simple_action_buttons.<type>.<signal>.visible`. Follow the module's existing resolver→component wiring convention (cf. how `makeWorkflowsConfig`'s output reaches the engine via `components/validated_workflows_config.yaml`): add the map to the app `global` config through a module-provided component referenced from the host's `global` block, or extend the resolver to also emit this shape into a global-config component. Keep the engine-facing `workflows_config` output unchanged.
3. **Defaults table** must be exactly: `not_required` → `false`; all other five → `true`. Authored `visible: false` (or `true` on `not_required`) overrides the default.
4. **Unit tests** in `makeWorkflowsConfig.test.js` (or a dedicated test file co-located in `resolvers/`): assert the emitted `simple_action_buttons` map has `not_required` default `false` and the other five default `true`, and that an authored per-action override is respected. Only `kind: simple` actions appear in the map.

## Acceptance Criteria

- The resolver emits a map readable at runtime as `_global: simple_action_buttons.<action_type>.<signal>.visible`.
- Defaults: `not_required` = `false`; `submit` / `progress` / `approve` / `request_changes` / `resolve_error` = `true`.
- An authored override on a specific action's signal is reflected in the map.
- Only `kind: simple` actions are included.
- The existing `workflows_config` engine output and its validations are unchanged.
- `pnpm jest makeWorkflowsConfig` (or the relevant test path) passes, including new assertions.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — compute and emit the `simple_action_buttons` map (D3 defaults + author override).
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add the defaults + override assertions.
- `modules/workflows/components/*.yaml` and/or `modules/workflows/module.lowdefy.yaml` — create/modify as needed — wire the emitted map into the app `global` so `_global: simple_action_buttons` resolves at runtime. Mirror the existing resolver→component wiring pattern.

## Notes

- Confirm the authored override key by checking `action-authoring/spec.md` and Part 39's `page_config.buttons.<signal>.visible` convention before settling on the read path; the goal is form/simple parity.
- Per [CLAUDE.md "build for what exists"], ship **only** the `visible` opt-out. Do **not** add support for full per-action custom button sets — explicitly out of scope (design "Out of scope").
- The exact "resolver → global" wiring is an implementation detail the design leaves to convention; the constraint is that the surface reads it via `_global: simple_action_buttons`. There is no existing enum→global wiring in this module, so this is the first global-config emission — keep it minimal and follow the `validated_workflows_config` precedent.
