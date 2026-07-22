# Task 4: Add a compact `open-actions` card to workflows; deals consumes it

## Context

Workstream B1 (workflows half). Deals renders a compact card of an entity's open items — open workflow actions **plus** tasks — via bespoke `components/detail/section_actions.yaml` + `components/detail/action_card.yaml.njk`, colour-keyed off the workflows `action_statuses` enum. The design splits this unified card by ownership to avoid a workflows→activities dependency inversion: workflows owns the **actions-only** card; activities owns the tasks card (task 5); the host composes both.

Workflows already exports `actions-on-entity` (the full stepper). This task adds a lighter sibling that shows just the *open* actions as a compact card.

## Task

Add an exported **`open-actions`** component to the **workflows** module — a compact card listing an entity's open workflow actions, beside `actions-on-entity`. It fetches only its own open actions (via the existing entity-workflows data path), parameterised by `entity_id` + `entity_connection_id`. Reuse the `action_statuses` colour keying. Do **not** read tasks or any activities collection.

Then have **deals** consume `open-actions` for the actions portion of its current `section_actions` card. (Deals still shows its local task portion until task 5 replaces it — keep the deal view building.)

## Acceptance Criteria

- workflows exports `open-actions` (manifest + docs updated); it fetches only workflow actions, no cross-module reads.
- deals' deal view renders open workflow actions via the workflows `open-actions` component.
- `CI=true pnpm ldf:b` green; changeset for workflows (minor) + deals; `docs:check` green.

## Files

- `modules/workflows/components/open-actions.yaml` — create.
- `modules/workflows/module.lowdefy.yaml` — modify — export `open-actions`.
- `modules/deals/pages/view.yaml` / `components/detail/section_actions.yaml` — modify — consume `open-actions` for the actions portion.
- `.changeset/*.md` — create.

## Notes

Edits `modules/deals/pages/view.yaml` — coordinate with tasks 5, 6, 7 which also touch it (run in listed order). Full deletion of `section_actions.yaml` + `action_card.yaml.njk` happens in task 5 once both halves are replaced.
