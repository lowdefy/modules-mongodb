# Task 11: `view` screen — pipeline phase 2 (layout)

## Context

Second phase for the `view` page. Mechanically translate the frame (task 10)
into a Lowdefy block tree — copy every number and id, do not redesign.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/02-layout.md`, with
`references/lowdefy-layout.md` + `references/lowdefy-blocks.md`. Use `lowdefy-docs`
MCP (or `/lowdefy-config`) to verify Modal/CallMethod props for the tile-edit
overlays.

**Frame:** `designs/user-admin-better-auth/mockups/frames/view.html`
**Target source:** `modules/user-admin/pages/view.yaml` (+ `components/*.yaml`)

## Task

Follow `phases/02-layout.md`. Shared-component discovery first: `layout` `page`
shell, shared `title-block`, shared `card` (layout `card.yaml`), the
`SmartDescriptions` block for tile bodies, the `EventsTimeline` block (events
module) for Activity. Translate to a block tree — sizeless structural containers,
`Html` placeholder slots per leaf carrying frame ids. The two-column grid (main
span 14, side span 10). Each editable tile's Edit button opens a `Modal`; lay
down the seven modal containers as structural blocks with placeholder bodies.

## Acceptance Criteria

- `modules/user-admin/pages/view.yaml` (+ `components/*.yaml`) hold the structural
  tree: sizeless containers, `Html` placeholder slots, ids from the frame.
- Shared `page`/`title-block`/`card`, `SmartDescriptions`, `EventsTimeline` reused.
- Two-column grid (14/10); seven modal containers present with placeholder bodies.
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/view.yaml` — replace stub with structural layout
- `modules/user-admin/components/*.yaml` — tiles + modals as the decomposition requires

## Notes

- Extract deep tile/modal subtrees to `components/*.yaml` via plain-path `_ref`
  when nesting grows.
- No content/requests yet (phase 3 is task 12).
