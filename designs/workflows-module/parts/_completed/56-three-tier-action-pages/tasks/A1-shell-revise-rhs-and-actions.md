# Task A1: Revise the shell — de-tab the RHS, relocate the action bar

## Context

Addendum DA4/DA5/DA3. The shipped `action-workspace.yaml` (Task 6) renders the RHS
as a `universal_fields` slot **above** a `Tabs[Details? | History]` wrapper, and the
form templates render the action bar (`layout/floating-actions`) as a **separate
full-content-width page sibling** below the shell. The addendum moves the universal
fields out of the RHS entirely (Task A2), which frees the RHS to show both contexts
stacked, and relocates the action bar into the middle column.

As-built to amend:

- `modules/workflows/components/action-workspace.yaml` — slots `middle`,
  `universal_fields`, `details_slot`; baked `entity_connection_id`, `reference_field`;
  columns gated on `_state.entity_id`.
- `modules/shared/layout/floating-actions.yaml` — `Affix` + `Card`, renders a flat
  `actions` block array. **Not modified by this task** (see Task step 2).

## Task

**1. RHS: drop the `Tabs`, stack Details above History.**

- Remove the `universal_fields` slot (universal fields no longer mount in the RHS).
- Replace the `Tabs` wrapper with two stacked sections inside the RHS card:
  - **Details** — a section header ("Details") + the `details_slot` block array,
    rendered **only when `details_slot` is non-empty** (gated with `_build.gt …
array.length`, as the old Details tab was). On check this is empty, so the
    section is absent.
  - **History** — a section header ("History") + the `workflows-events-timeline`
    `_ref` (unchanged: `reference_field` baked, `reference_value: _state: entity_id`).
    It fills the remaining card height and scrolls (the timeline already carries its
    own `maxHeight`/`overflowY`).
- Plain section headers replace the single-tab-as-heading rationale (now obsolete).

**2. Add a single flat `actions` slot, rendered as a floating card in the middle column.**

- New slot `actions` (block array, default `[]`).
- Render it at the **bottom of the middle column** (inside the middle grid cell, so the
  bar spans only the column width, not full content width) via `_ref`ing
  `layout/floating-actions` with `actions: { _var: actions }`, only when `actions` is
  non-empty.
- The middle column becomes: the `middle` slot block array, then the floating-actions
  bar.
- **Do not add a slot to `floating-actions.yaml`.** Part 36 (shipped) established the
  pattern: workflow-contributed buttons are concatenated into the bar's flat `actions:`
  array **template-side** (`_build.array.concat` with `page_config.buttons.extra`), and
  Part 36 explicitly rejected an `extras`/`leading` slot on the shared component ("the
  layout component already accepts an arbitrary `actions:` array and needs no change").
  So `actions` here is one flat array; the templates (A3/A4) pass the concatenated
  `[ …signal buttons…, page_config.buttons.extra ]` into it. Left/right placement of
  extras vs signals is the shared bar's ordering — a Part 36 concern, not this part's.

Keep `entity_connection_id` / `reference_field` baked and the `_state.entity_id`
mount gate exactly as shipped.

## Acceptance Criteria

- RHS card shows a **Details** section (only when `details_slot` non-empty) stacked
  above a **History** section; no `Tabs` block remains; History fills + scrolls.
- The shell renders the flat `actions` slot as a `floating-actions` bar **inside the
  middle column** (column-width, not full content width).
- `floating-actions.yaml` is unchanged.
- No `universal_fields` slot remains on the shell.
- Columns still gate on `_state.entity_id`; left/History reads unchanged.
- A page `_ref`ing the revised shell compiles via `pnpm ldf:b`.

## Files

- `modules/workflows/components/action-workspace.yaml` — modify — RHS stacked
  sections; remove `universal_fields` slot + `Tabs`; add a single flat `actions` slot
  rendered as a middle-column floating-actions bar.
- `modules/shared/layout/floating-actions.yaml` — **unchanged** (Part 36 precedent).

## Notes

- The shell stays layout-only — no new state or requests.
- `floating-actions` is `Affix offsetBottom: 0`; inside the constrained middle grid
  cell it still affixes to the viewport bottom but spans only the column width — the
  intended "floating card in the middle column" behaviour.
- Do not touch the left `actions-on-entity` panel (DA5).
