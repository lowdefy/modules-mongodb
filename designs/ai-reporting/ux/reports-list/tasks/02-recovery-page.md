# Task 2: The recovery page and its manifest export

## Context

Soft-deleted reports are recoverable — `delete-report` writes a `deleted` change stamp and every
read filters on `deleted.timestamp: { $exists: false }` — but the UI has no way to see or restore
them. The design puts recovery on its own quiet page reached by a footer link, not a fourth scope
tab: "recovery is not part of anyone's daily loop."

`list-reports` with `scope: deleted` returns the caller's soft-deleted reports (owner-matched — you
never see anyone else's deleted reports, including ones published to you), projecting `title`,
`deleted` (the `{ timestamp, user: { name, id } }` stamp), `owner.name`, and the rest. After Task 1
it returns the whole deleted scope.

`restore-report` (`_module.endpointId: restore-report`, owner-only) clears the marker and returns
the report to **private**, deliberately not touching `updated`.

## Interfaces

- **Consumes (Task 1):** `list-reports` `{ scope: "deleted" }` → `{ reports: [{ _id, title, deleted: { timestamp, user: { name } }, … }], total }` — the whole deleted scope.
- **Consumes (shipped):** `restore-report` `{ report_id }` → restores to private.
- **Produces:** page id `reports-deleted` (scoped URL `/reporting/reports-deleted`), targeted by Task 3's footer link via `_module.pageId: reports-deleted`.

## Task

1. **Create `modules/ai-reporting/pages/reports-deleted.yaml`** (page `id: reports-deleted`). On mount,
   `CallAPI` `list-reports` with `{ scope: deleted }` and `SetState` the rows (mirror the load
   pattern the current `reports-list.yaml` uses). Render each deleted report showing:
   - its `title`,
   - **who and when** it was deleted — `deleted.user.name` and a `_dayjs`-formatted
     `deleted.timestamp` (a recovery screen that omits the stamp makes the user guess whether they
     are looking at their own mistake),
   - a **Restore** action calling `restore-report` with the row's `_id`.
2. **State that restore returns the report to private** in the page copy (do not restore silently).
3. **On a successful restore, hand the user the report as a link** — surface a success `Message`
   (or `Notification`) carrying a `Link` to the report page (`_module.pageId: report`,
   `urlQuery.report_id`), and refetch the deleted scope so the restored row leaves the page. The row
   leaving confirms the restore; the link is what makes the now-private report findable (it does not
   jump to the top of Mine, because restore leaves `updated` untouched).
4. **Empty state:** when nothing is deleted, say so plainly.
5. **No permanent-delete action** — not here, not anywhere.
6. **Export the page.** In `modules/ai-reporting/module.lowdefy.yaml` add `- id: reports-deleted` under
   `exports.pages` and `- _ref: pages/reports-deleted.yaml` under `pages:`.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` is clean; `.lowdefy/server/build/pages/reporting/reports-deleted.json`
  renders, and `_module.pageId: reports-deleted` resolves (proven when Task 3's footer link builds).
- The page shows the delete stamp's who/when and a Restore control; restore surfaces a link to the
  restored report and refetches.
- No permanent-delete control exists.

## Files

- `modules/ai-reporting/pages/reports-deleted.yaml` — create — the recovery page.
- `modules/ai-reporting/module.lowdefy.yaml` — modify — add the `reports-deleted` page export and `_ref`.

## Notes

- This page is a plain list, not necessarily an `AgGridBalham` — it is small and read-mostly.
  A simple `List` of rows (or `Card`s) showing title + stamp + Restore is enough; do not build a
  toolbar, scopes, search or paging here.
- Format dates with `_dayjs`, not `_date.format`.
