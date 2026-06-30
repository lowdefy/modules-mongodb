# Task 7: Module — render the authored `description` on the four form pages + delete the callout component

## Context

The four form-mode pages each render the tinted callout at the top of their middle column and seed an editable `fields.description` for the (now-removed) modal TiptapInput. Part 64 swaps the callout for the plain `action-description.yaml` render (Task 4) and removes the dead seeds. Once these last consumers are swapped, the `universal-fields-callout.yaml` component has no callers and is deleted.

`templates/{edit,review,error,view}.yaml.njk` each:

- Load `get_workflow_action` and SetState `action: { _request: get_workflow_action }` on mount — so `action.description` holds the **rendered authored** description string (Task 2 made the envelope `description` the rendered config field; the envelope key name is unchanged).
- Reference `universal-fields-callout.yaml` near the top of the middle column, sourced from `_state: action.description` (review ~185–189, error ~182–186, edit ~189–193, view ~177–181).
- Seed `fields.description: { _state: action.description }` in an onMount params block that primed the editable modal (review ~160–161, edit ~164, error ~158, view ~153 — the `description:` entry under a `fields:` map).

## Task

For **each** of `templates/edit.yaml.njk`, `templates/review.yaml.njk`, `templates/error.yaml.njk`, `templates/view.yaml.njk`:

1. Replace the `_ref` to `components/universal-fields/universal-fields-callout.yaml` (with `vars.action_data.description: { _state: action.description }`) with a `_ref` to `components/action-description.yaml`, passing `vars.content: { _state: action.description }`. Keep it at the same position (lead-in above the form body). Update the adjacent comment ("Description callout … self-hides" → "Authored description — plain Markdown lead-in; self-hides when unset").
2. Remove the `description:` entry under the `fields:` map in the onMount params (the `_state: action.description` seed that fed the deleted editable description input). Leave the sibling `assignees` / `due_date` entries intact.

Then:

3. **Delete** `modules/workflows/components/universal-fields/universal-fields-callout.yaml` — after the four swaps above (and Task 6's `action.yaml.njk` swap), it has no remaining consumers.

## Acceptance Criteria

- Each of the four form templates renders `components/action-description.yaml` sourced from `_state: action.description`; none references `universal-fields-callout.yaml`.
- No `fields.description` / `action.description` _seed_ remains under a `fields:` map in any of the four form templates (the `action-description.yaml` `content` binding to `_state: action.description` is the only remaining reader).
- `modules/workflows/components/universal-fields/universal-fields-callout.yaml` no longer exists.
- `grep -rn "universal-fields-callout\|universal_fields_callout" modules/workflows/` returns nothing (all consumers swapped, file deleted).
- `cd apps/demo && pnpm ldf:b` compiles.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — swap callout → `action-description.yaml`; remove `fields.description` seed.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.
- `modules/workflows/templates/view.yaml.njk` — modify — same.
- `modules/workflows/components/universal-fields/universal-fields-callout.yaml` — delete — last consumer removed.

## Notes

- Depends on Task 4 (component exists) and Task 6 (which swaps the callout's other consumer, `action.yaml.njk`, so this task can safely delete the file).
- Distinguish the two `action.description` uses per file: the **callout `_ref` var** (becomes the `action-description.yaml` `content` binding — keep) vs. the **`fields.description` seed** under a `fields:` map (delete). Locate by surrounding context, not line number, since edits shift lines.
