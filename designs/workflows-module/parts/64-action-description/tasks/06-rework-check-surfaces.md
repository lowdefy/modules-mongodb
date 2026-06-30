# Task 6: Module — render the authored `description` on the check page + in-context surfaces

## Context

After Task 4, `components/action-description.yaml` exists (a plain `Markdown` leaf taking a `content` var). After Task 2, the `get_workflow_action` envelope's `description` key holds the **rendered authored** description string. This task swaps the tinted callout for the plain `action-description.yaml` render on the check-kind working surfaces, and removes the now-dead `fields.description` seeds (which fed the deleted editable TiptapInput).

Surfaces:

- **`templates/action.yaml.njk`** — the per-workflow `{workflow_type}-action` check page. Slot 0 of the middle column is currently a `_ref` to `universal-fields-callout.yaml` sourced from `_state: current_action.description` (lines ~215–222). The page also seeds `current_action.fields.description` from `_request: get_workflow_action.description` in **8** `set_current_action`-style SetState blocks (the seed lines at ~157, 325, 479, 570, 667, 788, 879, 947 — each is the `description:` entry under a `current_action.fields:` map).
- **`components/check-action-surface.yaml`** — the in-context modal/surface body. It composes `universal-fields.yaml` and passes `action_data.description: { _state: current_action.fields.description }` (lines ~169–170).
- **`components/check-action-modal.yaml`** — seeds `current_action.fields.description` from `_request: get_workflow_action.description` (lines ~108–110).

The envelope key stays `description`; `current_action.description` (the spread of the whole envelope into `current_action`) already holds the rendered authored string, so `action-description.yaml` can bind `_state: current_action.description` directly.

## Task

**`templates/action.yaml.njk`:**

1. Replace the slot-0 `_ref` (to `components/universal-fields/universal-fields-callout.yaml`, with `vars.action_data.description`) with a `_ref` to `components/action-description.yaml`, passing `vars.content: { _state: current_action.description }`. Update the slot comment ("Description callout … self-hides" → "Authored description — plain Markdown, top of the middle column; self-hides when unset").
2. Remove the `description:` entry under every `current_action.fields:` SetState map (the 8 occurrences feeding `fields.description` from `get_workflow_action.description`). Leave the sibling `assignees` / `due_date` entries intact. The ✎ edit modal's `show` already defaults to `[assignees, due_date]` after Task 5 — no further change needed here for that.

**`components/check-action-surface.yaml`:**

3. Remove the `description: { _state: current_action.fields.description }` mapping (lines ~169–170) from the `action_data` block passed into the `universal-fields.yaml` composition.
4. Add an `action-description.yaml` `_ref` to the card body (plain render), sourced from `content: { _state: current_action.description }`. Place it as a lead-in at the top of the body (mirroring the check page's slot 0), so the in-context surface renders the authored description directly (the universal-fields component no longer carries it).

**`components/check-action-modal.yaml`:**

5. Remove the `description:` entry (lines ~108–110) under the `current_action.fields:` SetState map. Leave `assignees` / `due_date`.

## Acceptance Criteria

- `action.yaml.njk` slot 0 renders `components/action-description.yaml` sourced from `current_action.description`; no `universal-fields-callout.yaml` ref remains in this file.
- No `current_action.fields.description` (or `get_workflow_action.description → fields.description`) seeds remain in `action.yaml.njk`, `check-action-surface.yaml`, or `check-action-modal.yaml`.
- `check-action-surface.yaml` renders the authored description via `action-description.yaml` and no longer passes `description` into `universal-fields.yaml`.
- `grep -rn "fields.description" modules/workflows/templates/action.yaml.njk modules/workflows/components/check-action-surface.yaml modules/workflows/components/check-action-modal.yaml` returns nothing.
- `cd apps/demo && pnpm ldf:b` compiles.

## Files

- `modules/workflows/templates/action.yaml.njk` — modify — swap slot-0 callout `_ref` → `action-description.yaml`; remove 8 `fields.description` seeds.
- `modules/workflows/components/check-action-surface.yaml` — modify — drop `description` from the universal-fields `action_data`; add `action-description.yaml` render to the body.
- `modules/workflows/components/check-action-modal.yaml` — modify — remove the `fields.description` seed.

## Notes

- Depends on Task 4 (the `action-description.yaml` component must exist before it is referenced).
- The `universal-fields-callout.yaml` file is **not** deleted here — `action.yaml.njk` is only one of its consumers; the four form templates still reference it. Its deletion happens in Task 7 once the last consumer is swapped.
- The exact seed line numbers will drift as edits are applied; locate each by the `description:` key under a `current_action.fields:` map, not by line number.
