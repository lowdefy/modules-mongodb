# Task 4: Stack the open Actions and Tasks sections instead of splitting them into columns

> **As built — superseded entirely.** Stacking shipped first, then was replaced by a
> real merge: one ordered list interleaving actions and tasks (overdue tasks → open
> actions → upcoming tasks) under a single `ACTIONS` heading, 2×2 and paginated at
> four per page, with one empty state instead of two. Item 2 asked to "combine", and
> the pre-cutover `section_actions.yaml` was a single interleaved list, so adjacency
> was only a partial answer.
>
> **The rejected alternative in Notes below rests on a false premise.** It says a
> merged list "would need a component owning both modules' data". It does not:
> `entity_workflows` and `open_tasks` are both already in page state, seeded by deals
> itself. The real cost is per-row events — an action navigates, a task opens a modal,
> and a Nunjucks string cannot fire the latter — which is why deals renders it as a
> `List` of blocks. Ownership did not move. See the merge decision in `design.md`.

## Context

`modules/deals/components/detail/open_items_row.yaml` is the "what's open" summary in the deal
workspace's detail panel. It is a `Box` holding two `span: 12` column Boxes side by side:

- **left** — an `Html` header reading `ACTIONS`, then the `workflows` module's `open-actions`
  component (the deal's open workflow actions).
- **right** — an `Html` header reading `TASKS`, then the `activities` module's `open-tasks`
  component (the deal's open ad-hoc tasks), wired to open the page's `deal_task_modal` on click.

The two come from different modules on purpose — each renders only its own domain and fetches only
its own data — and were split apart in a previous rework, then styled to match so they would compose.
Splitting two short lists across two half-width columns wastes horizontal room, and task 5 is about
to narrow the containing column further.

The fix is to stack them: the same two module components, one above the other, full width.

## Task

**1. Make both sections full width** in `open_items_row.yaml`. The two child Boxes change from
`span: 12` (with `sm: { span: 24 }`) to full width. Since they now stack rather than sit side by
side, the `sm` override becomes redundant — remove it rather than leaving a no-op breakpoint entry.

**2. Keep Actions above Tasks.** Workflow actions are the gated pipeline work and tasks are ad-hoc,
so actions read first. The existing order in the file is already Actions then Tasks — preserve it.

**3. Add no container chrome.** This is an explicit design decision, not an oversight:

- `open_items_row.yaml` stays a plain `Box`. Do **not** introduce a `Card`.
- Do **not** add a border, background, or radius to the container.
- Do **not** add an `OPEN ITEMS` wrapper title.

The sections around it in `detail_panel.yaml` — the info grid, related deals, the timeline tabs — are
all unchrome'd and separated by thin dividers inside the single `detail_card`. A Card here would nest
a bordered card inside a bordered card. The existing small-caps `ACTIONS` and `TASKS` `Html` headers
are the only labelling, and they stay exactly as they are.

**4. Check the vertical rhythm.** The Box currently has `style: { marginTop: 12 }` and
`layout: { gap: 8, justify: stretch }`. With the children stacked, the gap now separates Actions from
Tasks vertically rather than the two columns horizontally — confirm 8px reads correctly between the
Tasks header and the block above it, and adjust only if the sections visibly collide.

**5. Leave both module `_ref`s untouched** — same components, same vars, same `on_click` wiring to
`deal_task_modal`. This task changes layout only.

## Acceptance Criteria

- Both child Boxes in `open_items_row.yaml` are full width, with no leftover `span: 12` or redundant
  `sm` override.
- The component is still a `Box` — no `Card`, no border, background, radius, or wrapper title.
- The `ACTIONS` and `TASKS` `Html` headers are unchanged.
- The `workflows/open-actions` and `activities/open-tasks` refs and their vars are unchanged.
- `pnpm ldf:b` from `apps/demo` compiles cleanly.

## Files

- `modules/deals/components/detail/open_items_row.yaml` — modify — two span-12 columns become full-width stacked sections.

## Notes

- **If you are comparing against the design mockup:** the mockup drawn during discovery showed a
  titled, bordered `OPEN ITEMS` container. The chrome was deliberately dropped; only the stacking it
  illustrated is being built. Don't "restore" the border to match the picture.
- Tabs were considered and rejected — a summary you have to click to finish reading isn't a summary.
- A single interleaved list mixing actions and tasks was also rejected: it would need a component
  owning both modules' data, undoing the extraction that separated them, and the rows would stay
  heterogeneous anyway since clicking an action navigates to its page while clicking a task opens a
  modal.
