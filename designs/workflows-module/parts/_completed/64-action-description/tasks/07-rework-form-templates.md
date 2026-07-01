# Task 7: Module — render the authored `description` on the four form pages + delete the callout component

## Context

The four form-mode pages each render the tinted callout **floating above the form card** at the top of their middle column and seed an editable `fields.description` for the (now-removed) modal TiptapInput. Part 64 (a) moves the plain `action-description.yaml` render (Task 4) **inside the form card as its first child**, (b) adds the `workflow_closed_banner` to a bare-alerts slot **above** the card (the design's layout-model consistency fix — these pages omit the banner today), and (c) removes the dead seeds. Once these last consumers are swapped, the `universal-fields-callout.yaml` component has no callers and is deleted.

`templates/{edit,review,error,view}.yaml.njk` each:

- Load `get_workflow_action` and SetState `action: { _request: get_workflow_action }` on mount — so `action.description` holds the **rendered authored** description string (Task 2 made the envelope `description` the rendered config field; the envelope key name is unchanged). The state path `action.description` is the **envelope** key and is correct and unchanged — only GetWorkflowAction's _source_ for it flipped (doc field → rendered config). Do **not** invent a different binding.
- Reference `universal-fields-callout.yaml` **floating above** the form card, sourced from `_state: action.description` (review ~185–189, error ~182–186, edit ~189–193, view ~177–181).
- Seed `fields.description: { _state: action.description }` in an onMount params block that primed the editable modal (review ~160–161, edit ~164, error ~158, view ~153 — the `description:` entry under a `fields:` map). **This seed is deleted; the read-only `action-description.yaml` `content: { _state: action.description }` binding is kept.**
- Carry a `_build.if` that renders the form **directly** when the first form entry owns the outer chrome, versus a `form_card` else-branch. The description lead-in must land inside whichever container holds the form, so it is prepended in **both** branches.
- Today omit `workflow_closed_banner` entirely (only the check page and modal render it) — this task adds it.

## Task

For **each** of `templates/edit.yaml.njk`, `templates/review.yaml.njk`, `templates/error.yaml.njk`, `templates/view.yaml.njk`:

1. **Remove** the `_ref` to `components/universal-fields/universal-fields-callout.yaml` (with `vars.action_data.description: { _state: action.description }`) that floats **above** the form card today.
2. **Add** a `_ref` to `components/action-description.yaml`, passing `vars.content: { _state: action.description }`, as the **first child inside the form card** (above `formHeader`) — not floating above it. Because the template has a `_build.if` that renders the form directly (first-form-entry owns chrome) vs. a `form_card` else-branch, prepend the description lead-in inside **whichever container holds the form** — i.e. in **both** branches. Add a comment ("Authored description — plain Markdown lead-in inside the form card; self-hides when unset").
3. **Add `workflow_closed_banner`** to a bare-alerts slot **above** the card — the same `Alert` the check page uses, gated `_state: action.workflow_closed` **AND** not `action.required_after_close` (the envelope already carries both fields). This is the design's consistency fix: form pages omit the closed banner today, so a closed-workflow form action currently shows no "updates no longer accepted" notice.
4. Remove the `description:` entry under the `fields:` map in the onMount params (the `_state: action.description` **seed** that fed the deleted editable description input). Leave the sibling `assignees` / `due_date` entries intact. **Keep** the read-only `action-description.yaml` `content: { _state: action.description }` binding — distinguish the **seed** (under a `fields:` map → delete) from the **render binding** (the `content` var → keep) by surrounding context, not line number.

Then:

5. **Delete** `modules/workflows/components/universal-fields/universal-fields-callout.yaml` — after the four swaps above (and Task 6's `action.yaml.njk` swap), it has no remaining consumers.

## Acceptance Criteria

- Each of the four form templates renders `components/action-description.yaml` (sourced from `_state: action.description`) as the **first child inside the form card** (above `formHeader`), in **both** the direct-form and `form_card` `_build.if` branches — not floating above the card. None references `universal-fields-callout.yaml`.
- Each of the four form templates renders `workflow_closed_banner` as a bare full-width `Alert` **above** the card, gated `_state: action.workflow_closed` AND not `action.required_after_close`.
- No `fields.description` _seed_ (the `description:` entry under a `fields:` map) remains in any of the four form templates (the `action-description.yaml` `content` binding to `_state: action.description` is the only remaining reader).
- `modules/workflows/components/universal-fields/universal-fields-callout.yaml` no longer exists.
- `grep -rn "universal-fields-callout\|universal_fields_callout" modules/workflows/` returns nothing (all consumers swapped, file deleted).
- `cd apps/demo && pnpm ldf:b` compiles.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — move callout → `action-description.yaml` inside the form card (both `_build.if` branches); add `workflow_closed_banner` to a bare-alerts slot above the card; remove `fields.description` seed.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.
- `modules/workflows/templates/view.yaml.njk` — modify — same.
- `modules/workflows/components/universal-fields/universal-fields-callout.yaml` — delete — last consumer removed.

## Notes

- Depends on Task 4 (component exists) and Task 6 (which swaps the callout's other consumer, `action.yaml.njk`, so this task can safely delete the file).
- Distinguish the two `action.description` uses per file: the **callout `_ref` var** (becomes the `action-description.yaml` `content` binding — keep) vs. the **`fields.description` seed** under a `fields:` map (delete). Locate by surrounding context, not line number, since edits shift lines.
