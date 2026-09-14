# Task 3: Rebuild `reports-list.yaml` as the AgGrid reader

## Context

`modules/ai-reporting/pages/reports-list.yaml` is today a `Box` with a stacked-card `List` hardcoded
to `scope: mine`. Rebuild it as an `AgGridBalham` — the block every other module list here uses —
fed a **whole scope** and letting the grid search, sort and page client-side.

Copy the shape from `modules/user-admin/components/table_users.yaml`: `AgGridBalham` with
`rowData` from a request, `defaultColDef.sortable: true`, `columnDefs` mixing built-in `cell`
types and `_function` `cellRenderer`s, and `onRowClick` → `Link`. Confirmed cell facts from the
installed `@lowdefy/blocks-aggrid` build: a `buttons` cell resolves `iconField` / `hiddenField` /
`titleField` / `danger` per row and fires an event carrying `event.row`; a `tag` cell renders a
scalar as one pill and takes a `colorMap`; `date` formats a timestamp. There is **no `menu` cell** —
that is Task 4's `⋯`-opens-a-Modal interim.

This task is the **reader**: it renders, switches scope, searches, sorts, opens a report, and links
to recovery. The ★ column renders (from `is_favourite`) but its click and the `⋯` menu are Task 4.

## Interfaces

- **Consumes (Task 1):** `list-reports` `{ scope }` → `{ reports: [{ _id, title, description, visibility, created, updated, deleted, owner: { name }, is_favourite, is_owner, section_counts: { kpi, chart, table, markdown, download }, filter_count }], total }` — the whole scope.
- **Consumes (Task 2):** page id `reports-deleted` for the footer link.
- **Produces:** the grid and its `scope` page-state key, and the `⋯` column slot, that Task 4 wires actions onto.

## Task

Build the page with:

1. **Scope control** — a `SegmentedSelector` (Mine / Shared / Favourites) bound to a `scope` page
   state (default `mine`). Changing it sets `scope` and refetches `list-reports` with the new
   `scope` value, replacing `rowData`. Do **not** de-duplicate across tabs — the scopes overlap by
   design.
2. **Search** — a text input above the grid driving AgGrid's quick-filter over the loaded rows
   (title + description are both rendered in the Report cell, so quick-filter matches both). Not a
   server parameter.
3. **Columns** (per the design's grid table):
   - **★** — `buttons` cell, one icon button, `hideTitle`, `iconField` resolving filled vs outline
     from `is_favourite`. Render only in this task; wire the click in Task 4.
   - **Report** — `_function` cellRenderer, title + description pair, `wrapText` / `autoHeight`
     (the user-admin pattern).
   - **Contents** — `_function` cellRenderer building **one pill per non-zero section type** from
     `section_counts` (`{ kpi, chart, table, markdown, download }`), labels pluralised on the count
     (`2 charts`, `1 table`), zero-count types omitted; then the **filter pill last and distinct**
     (lighter/outline) from `filter_count` when non-zero. Empty spec → no pills. It is **not** a
     `tag` cell — `section_counts` is an object, and a `tag` cell would stringify it to
     `[object Object]`.
   - **Author** — plain text over `owner.name`, its column def `hide`-bound to the scope: shown when
     `scope` is `shared` or `all`, hidden otherwise. Scope is page state, so the column def reads it
     directly; no per-scope rebuild.
   - **Updated** — `date` over `updated.timestamp`.
   - **Visibility** — `tag` with a `colorMap`, read-only (no inline selector — publishing is a named
     act, Task 4's menu).
   - **⋯** — leave a placeholder column (or omit and add in Task 4); Task 4 fills it.
4. **Open** — `onRowClick` → `Link` to `_module.pageId: report` with `urlQuery.report_id` from the
   row `_id`.
5. **Footer** — a link to the recovery page (`_module.pageId: reports-deleted`). No Load-more
   button and no offset; a plain "Showing N" from the row count is optional.
6. **Three empty states** (distinct, not one shared message):
   - **Mine, no reports yet** — teaches the second job and links to the chat
     (`_module.pageId: chat`) with the report track pre-selected if the chat page accepts that
     (see Notes). First-run screen.
   - **Shared, nothing published** — states the app's shared library is empty (a fact, not a prompt).
   - **A search or scope with zero results** — offers **clear the search** and **search wider**;
     the second refetches `list-reports` with `scope: all` (keeping the quick-filter term) for the
     user who knows they saved something and not which tab. `all` is not a fourth segment — it is
     reachable only here.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` is clean; `.lowdefy/server/build/pages/reporting/reports-list.json`
  shows the `AgGridBalham`, the scope `SegmentedSelector`, the six columns (Author `hide`-bound to
  scope), quick-filter search, `onRowClick` open, and the recovery footer link resolving.
- Switching scope refetches; the Contents cell renders per-type pills (verify a report spanning two
  types shows two content pills plus a filter pill when present).
- The three empty states are three distinct blocks gated on scope + result count.

## Files

- `modules/ai-reporting/pages/reports-list.yaml` — rewrite — the AgGrid reader described above.

## Notes

- `visible:` / `hide` conditions must resolve to a real boolean at runtime — build a proper
  `_eq` / `_and` (e.g. `hide` = `scope` not in `{shared, all}`), never a bare `_state` string.
- **Verify the chat pre-select contract:** check whether `modules/ai-reporting/pages/chat.yaml` reads a
  urlQuery/state to pre-select the report track. If it does, pass it from the Mine empty state; if it
  does not, link plainly and flag it — do not invent a param the chat page ignores.
- This is a reader; do not wire delete/favourite/publish here. The ★ column is inert until Task 4.
