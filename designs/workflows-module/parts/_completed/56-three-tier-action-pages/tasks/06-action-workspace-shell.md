# Task 6: Create the shared three-tier shell component

## Context

Part 56's binding constraint is **no-jarring-shift**: the column scaffold must be
identical across form and check pages — same left, same right — and only the
**middle's content** swaps. The shell is one component every action page `_ref`s.

Existing shipped pieces it composes (do not modify them):

- `modules/workflows/components/actions-on-entity.yaml` — left column. Vars:
  `entity_id` (required), `entity_collection` (required). Renders the entity's
  workflows as `ActionSteps` with `check-action-click` baked in.
- `modules/workflows/components/workflows-events-timeline.yaml` — History. Vars:
  `reference_field` (required, events field to match), `reference_value`
  (required, runtime operator). Already wrapped with `maxHeight: 600; overflowY:
auto`.
- `modules/workflows/components/universal-fields/universal-fields.yaml` (Part 24)
  — composed **by the caller**, not the shell; passed in as a block array.

## Task

Create `modules/workflows/components/action-workspace.yaml` (plain `.yaml`, all
inputs in operator/block-array positions — it is layout-only). It renders three
columns and nothing else (the header is the layout `page` component's chrome,
set by the template — D8).

**Vars (slots + baked scalars):**

- `middle` — block array, the action surface (required).
- `universal_fields` — block array, the Part 24 card composed by the caller
  (RHS top, both kinds).
- `details_slot` — block array, baked from `entity_view.slot`. On form pages it
  renders as the RHS **Details** tab; check pages pass it empty.
- `entity_collection` — scalar, baked from `workflow.entity.collection` (for
  `actions-on-entity`; nested under the raw `entity:` block — Part 57).
- `reference_field` — scalar, baked from `workflow.entity.ref_key` (for History).

**Layout:**

- Three columns in a row. Sensible default spans (tune at implementation, see
  Open questions): e.g. ~6 / 12 / 6 on `lg`; **`sm: span 24`** so columns stack
  full-width on small breakpoints.
- **Left** = `actions-on-entity` `_ref`'d with `entity_collection` (baked) and
  `entity_id: _state: entity_id`.
- **Middle** = the `middle` slot block array.
- **Right** = the `universal_fields` slot (top card) above a `Tabs` wrapper:
  - A **History** tab = `workflows-events-timeline` `_ref`'d with
    `reference_field` (baked) and `reference_value: _state: entity_id`.
  - A **Details** tab = the `details_slot` block array, **omitted when empty**.
  - **Keep the `Tabs` wrapper even when History is the only tab** (the single tab
    doubles as the section heading and keeps the RHS structure stable across
    form↔check and when a workflow has no `entity_view`).

**State contract — one normalized read (`_state.entity_id`).** The shell reads a
single fixed `_state: entity_id` everywhere (left panel `entity_id`, History
`reference_value`, and the mount gate). The action page sets this scalar (Tasks 9
/ 10); the shell does not set it.

**Mount sequencing.** Gate the three columns' render on `visible: _ne [ _state:
entity_id, null ]` so `actions-on-entity` and `workflows-events-timeline` fire
their `onMount` reads only **after** `entity_id` is set (not with a null id on
first paint).

## Acceptance Criteria

- `action-workspace.yaml` renders three columns; columns are gated on
  `_state.entity_id` being non-null.
- Left column receives baked `entity_collection` + `_state.entity_id`; History
  receives baked `reference_field` + `_state.entity_id`.
- RHS shows the `universal_fields` card above a `Tabs` block; Details tab present
  iff `details_slot` is non-empty; History tab always present; the `Tabs` wrapper
  is present even with History alone.
- Columns stack to full width at `sm`.
- A throwaway demo page (or the Part 22 fixture) `_ref`ing the shell compiles via
  `pnpm ldf:b`.

## Files

- `modules/workflows/components/action-workspace.yaml` — create — the three-tier shell.
- `modules/workflows/module.lowdefy.yaml` — modify — register `action-workspace`
  under `components:` if it must be `_ref`-able cross-module (otherwise a plain
  in-module `_ref` path is sufficient; match how templates reference other
  in-module components like `universal-fields`).

## Notes

- The shell is **layout-only**: it renders whatever block arrays the caller passes
  into its slots. No state writes, no requests, no header.
- Current-action highlight in the left `ActionSteps` is an **open question** — the
  layout works without it; do not add an `activeActionId` prop in this task.
- Default column spans and a History max-height/scroll are tunable defaults;
  the History component already has its own `maxHeight`.
