# Task 1: Create the `button_signal_sources.yaml` enum

## Context

The workflows engine moved to a **signals + FSM** model. Each button-surfaced signal is valid only from a fixed set of source-stages, defined by the engine's `form` FSM table (`shared/fsm/tables.js`, created by Part 38). The form-action page templates need to derive each button's visibility from these source-stages so a button shows exactly when its signal is coherent from the action's current stage.

This task ships the data file that the four templates (tasks 2–5) read at build time via `_ref`, and that the guard test (task 6) validates against the FSM table. The module already does build-time enum lookups via `_ref` (e.g. the `not_required` priority hack in `edit.yaml.njk` that this work replaces) — there is **no** enum→runtime-global wiring in this module, so this file is consumed purely at build time.

The form and simple FSM tables are identical, so this single map serves both kinds (the simple-action sibling design reuses it unchanged).

## Task

Create `modules/workflows/enums/button_signal_sources.yaml` with the source-stages for each button-surfaced signal. The values are taken directly from the `form` FSM table in `designs/workflows-module-concept/state-machine/design.md` (the stages where `table[stage][signal]` is defined):

```yaml
# enums/button_signal_sources.yaml — source-stages for each button-surfaced signal
# (form and simple kinds share this table; derived from the FSM in shared/fsm/tables.js)
submit:          [action-required, in-progress, changes-required, done]
progress:        [action-required, in-progress]
not_required:    [action-required, in-progress, changes-required, blocked, in-review, error]
approve:         [in-review]
request_changes: [in-review, done]
resolve_error:   [error]
```

The `error` signal is **omitted** — it is a pre-hooks-only signal and is never surfaced as a button (Part 38 owns it engine-side).

## Acceptance Criteria

- `modules/workflows/enums/button_signal_sources.yaml` exists with the six keys above and the exact stage lists shown.
- The file is valid YAML and parses to a flat map of signal → array of stage strings.
- The stage lists match the `form` FSM table's derivable source-stages exactly (verified mechanically by task 6's guard test).

## Files

- `modules/workflows/enums/button_signal_sources.yaml` — create — the signal→source-stages map.

## Notes

- The existing enums in this directory (`action_groups.yaml`, `action_statuses.yaml`, `workflow_lifecycle_stages.yaml`) are the reference for file style — plain YAML maps, no top-level wrapper key.
- Do not add an `error` row. Do not add the engine/pre-hook-only signals (`unblock`, `activate`, `block`, `internal_*`) — only the six **button-surfaced** signals belong here.
