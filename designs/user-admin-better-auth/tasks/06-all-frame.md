# Task 6: `all` screen — pipeline phase 1 (frame)

## Context

The `all` page is the Users list: Members and Invitations as sibling tabs, one
menu entry, filters/sort/pagination per tab, an Excel export that merges both
(Decision 2). First phase of the `mock-to-lowdefy` pipeline for this screen.

The mock is pipeline-ready — **skip `lowdefy-mock`**, go straight to frame.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/01-frame.md`
(`.claude/skills/mock-to-lowdefy/phases/01-frame.md`), with its bundled
references (`assets/frame.css`, `references/frame-dialect.md`).

**Mock (source of truth for geometry):**
`designs/user-admin-better-auth/mockups/screens/all.html`
**Design behaviour:** `design.md` Decision 2.

## Task

Follow `phases/01-frame.md` exactly. Abstract `all.html` into a structural
frame in the frame dialect — geometry **derived from the mock's CSS**, never
guessed. Capture: the layout page shell (appbar + canvas), title-block (title +
Download/Invite actions), the tab strip with two panels, and within each panel
the filter row (search, role filter, status segmented, clear, sort-filters),
the table, and the pagination footer. Note the `table_columns` slot region
between the built-in content columns and the audit-date columns. Render at
1440px and verify the frame beside the mock.

## Acceptance Criteria

- An HTML frame (+ preview PNG) is written to
  `designs/user-admin-better-auth/mockups/frames/` (committed for provenance —
  not app source).
- Every visual area carries a descriptive id (one element per area, flat nesting).
- The rendered frame reproduces `all.html`'s 1440px layout (tabs, per-tab filter
  row, table, pagination footer, title-block actions).

## Files

- `designs/user-admin-better-auth/mockups/frames/all.html` (+ preview PNG) — create

## Notes

- Mock-only chrome (the `.mockbar` state switcher, the tab/segmented JS) is not
  part of the frame — the tab strip is the real trigger; the two panels are the
  two tab slots.
- Do not write app source in this phase — that is phase 2 (task 7).
