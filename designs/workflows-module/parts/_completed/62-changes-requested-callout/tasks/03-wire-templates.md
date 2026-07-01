# Task 3: Wire the callout into all five action templates

## Context

Part 64 established the middle-column layout model for every action workspace surface: a **bare-alerts slot** on top (full-width `Alert`s, not in the card — `workflow_closed_banner` first), then **one content card** whose first child is the `action-description.yaml` Markdown render. Part 62's changes-requested callout slots into that bare-alerts slot: **below** the `workflow_closed_banner` (a hard stop outranks a rework brief) and **above** the content card (so the "what to fix" brief still precedes the neutral description, but sits outside the card).

The bare-alerts slot is the `middle` array passed to `components/action-workspace.yaml` (which is layout-only and renders whatever `middle` it's given). In each template the `workflow_closed_banner` `Alert` is the first entry in `middle`; the content card (`review_card` / `form_card` / `action_content_card` depending on surface) follows.

This task adds the Task 2 fragment (`components/changes-requested-callout.yaml`) to the `middle` slot of all five templates, immediately after `workflow_closed_banner` and before the content card. It binds the `changes_requested` envelope field from Task 1.

**Binding paths** (the envelope is stored in state under different keys per surface):

- Form pages (`view`/`edit`/`review`/`error`): `_state: action.changes_requested`
- Check page (`action.yaml.njk`): `_state: current_action.changes_requested`

**Structural note:** the four form templates build `middle` with `_build.array.concat` (each entry is a one-item sub-array, e.g. `- - id: workflow_closed_banner`). `action.yaml.njk` builds `middle` as a plain YAML list (`- id: workflow_closed_banner`). Match whichever structure the file already uses when inserting the `_ref`.

## Task

In each of the five templates, insert the callout `_ref` into the `middle` slot, between the `workflow_closed_banner` block and the content card.

For the **four form templates** (`view.yaml.njk`, `edit.yaml.njk`, `review.yaml.njk`, `error.yaml.njk`) — `middle` is a `_build.array.concat`, so add a new one-item sub-array after the banner sub-array:

```yaml
# Changes-requested callout (Part 62) — bare full-width
# alert in the bare-alerts slot, below the closed banner and
# above the content card. Self-hides when no brief.
- - _ref:
      path: components/changes-requested-callout.yaml
      vars:
        content:
          _state: action.changes_requested
```

For the **check page** (`action.yaml.njk`) — `middle` is a plain list, so add a list entry after the `workflow_closed_banner` block (and before `action_content_card`):

```yaml
# Changes-requested callout (Part 62) — below the closed banner,
# above the content card. Self-hides when no brief.
- _ref:
    path: components/changes-requested-callout.yaml
    vars:
      content:
        _state: current_action.changes_requested
```

Update each template's top-of-file layout comment (the "Layout (Part 56 addendum; Part 64): …" note) to mention the changes-requested callout sits between the closed banner and the content card.

## Acceptance Criteria

- All five templates `_ref` `components/changes-requested-callout.yaml` into their `middle` slot, positioned after `workflow_closed_banner` and before the content card.
- Form templates bind `content: _state: action.changes_requested`; `action.yaml.njk` binds `content: _state: current_action.changes_requested`.
- The insert matches the surrounding structure (`_build.array.concat` sub-array on form pages, plain list entry on the check page).
- `pnpm ldf:b` from `apps/demo` compiles cleanly.

## Files

- `modules/workflows/templates/view.yaml.njk` — modify — add callout `_ref` to `middle` (binds `action.changes_requested`).
- `modules/workflows/templates/edit.yaml.njk` — modify — same.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.
- `modules/workflows/templates/action.yaml.njk` — modify — add callout `_ref` as a `middle` list entry (binds `current_action.changes_requested`).

## Notes

- Depends on Task 1 (the `changes_requested` envelope field must exist) and Task 2 (the fragment file must exist).
- `action-workspace.yaml` stays layout-only — no change there. The callout is `_ref`'d per template, the same pattern the other slot fragments use.
- `edit.yaml.njk` and `error.yaml.njk` have no Request Changes button of their own, but a `changes-required` action can still be viewed through them, so they render the callout too (the design lists all five templates).
