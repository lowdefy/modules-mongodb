# Task 7: `all` screen — pipeline phase 2 (layout)

## Context

Second phase of the `mock-to-lowdefy` pipeline for the `all` page. The frame
(task 6) is a 1:1 encoding of the target block tree. Translation is
**mechanical** — walk the frame, apply the mapping table, copy every number and
id. Do not re-derive layout from the mock or redesign.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/02-layout.md`
(`.claude/skills/mock-to-lowdefy/phases/02-layout.md`), with
`references/lowdefy-layout.md` and `references/lowdefy-blocks.md`. Use the
`lowdefy-docs` MCP (or `/lowdefy-config`) to verify Tabs/Pagination props.

**Frame:** `designs/user-admin-better-auth/mockups/frames/all.html`
**Target source:** `modules/user-admin/pages/all.yaml` (+ `components/*.yaml`)

## Task

Follow `phases/02-layout.md`. Start with **shared-component discovery** — map
regions onto existing shared components before hand-rolling: the `layout` `page`
shell, shared `title-block`, shared `pagination`, shared `sort-filters`, and the
`AgGridBalham` table pattern. Then translate the frame into a Lowdefy block tree:
structural blocks carry no size, every leaf becomes a sized `Html` placeholder
slot carrying the block id. Two tab panels, each with its own filter / table /
pagination slots (independent state). Write real YAML into the page +
`components/*.yaml` via plain-path `_ref`.

## Acceptance Criteria

- `modules/user-admin/pages/all.yaml` (+ any `components/*.yaml`) contain the
  structural block tree with sizeless containers and `Html` placeholder slots,
  ids carried from the frame.
- Shared components (`page`, `title-block`, `pagination`, `sort-filters`) are
  reused, not re-implemented.
- The tab strip renders two panels with independent filter/table/pagination slots.
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/all.yaml` — replace stub with structural layout
- `modules/user-admin/components/*.yaml` — create as the frame decomposition requires

## Notes

- `layout:` uses only the mapping-table props (span, sm.span, gap, flex,
  align+selfAlign, justify) — `contentJustify`/`contentGap` are deprecated traps.
- No content or requests yet — placeholder slots only (phase 3 is task 8).
