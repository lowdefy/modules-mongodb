# Task 6: Update the docs surfaces table

## Context

`docs/` is the source of truth for consumer-observable behaviour. `docs/ai-reporting/index.md` carries
a "surfaces" table listing the module's pages. Its `reports-list` row still reads "Saved reports
with open and [soft delete]" — the stacked-card description — and there is no row for the new
recovery page. Update both to describe what the rebuilt pages actually do.

## Task

1. In `docs/ai-reporting/index.md`, update the **`reports-list`** row of the pages/surfaces table to
   describe the grid: three scopes (Mine / Shared / Favourites), search and sort, favourites, a
   contents preview, visibility, and a link to the recovery page.
2. Add a **`reports-deleted`** row for the recovery page — soft-deleted reports with their delete
   stamp and one-click restore-to-private, reached from the reports-list footer.
3. Keep the entry consistent with the table's existing tone and the soft-delete cross-link
   (`../shared/soft-delete.md`).

## Acceptance Criteria

- The surfaces table describes the grid-based list and the recovery page accurately.
- `pnpm docs:check` (from the repo root) passes — front-matter valid, no generated-file drift.
  (This edits `index.md` only, which is hand-authored; do **not** touch generated files like
  `reference/vars.md`.)

## Files

- `docs/ai-reporting/index.md` — modify — the `reports-list` row and a new `reports-deleted` row.

## Notes

- No client names or app-specific detail in the docs.
- Run `pnpm docs:check` from the repo root, not from `apps/demo` (it is a root script).
