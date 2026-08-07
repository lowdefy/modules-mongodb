# Task 4: Row actions — the `⋯` menu, delete confirm, ★ toggle, scope-refetch

## Context

Task 3 built the reports-list grid as a reader. This task adds every mutation: the `⋯` row menu,
the delete confirm, the ★ favourite toggle, and the rule that any change refetches the whole
current scope rather than patching a single grid node. Refetching keeps the sort order, the ★ tier
and the contents counts honest from the server — and it is cheap, because the whole scope is one
request (Task 1).

There is no `menu` cell in `@lowdefy/blocks-aggrid`. The interim is a single `⋯` `buttons` cell that
fires an event carrying `event.row`; the page stores that row and opens a `Modal` of action
buttons. Swapping to a real `menu` cell later touches one column definition.

All the endpoints already exist and enforce authorization server-side — the menu only decides which
items to _show_: `set-report-title` (rename, owner), `set-report-visibility` (publish/unpublish),
`duplicate-report` (any reader), `delete-report` (owner), `set-report-favourite` (any reader).

## Interfaces

- **Consumes (Task 3):** the grid, its `scope` page-state key, the ★ column, and the `⋯` column slot.
- **Consumes (shipped):** `set-report-title` `{ report_id, title }`; `set-report-visibility` `{ report_id, visibility }`; `duplicate-report` `{ report_id }`; `delete-report` `{ report_id }`; `set-report-favourite` `{ report_id }` (toggles the caller in `favourite_of`).
- **Consumes (page state / build):** `is_owner` and `visibility` per row; the viewer's roles (`_user: roles`) and the configured `share_roles` (`_module.var: share_roles`).

## Task

1. **A reusable scope refetch.** Factor the "load the current scope" sequence (CallAPI
   `list-reports` with `{ scope: _state.scope }` → SetState the rows) into one action sequence the
   scope selector, the ★ toggle and every menu action reuse (repo idiom: extract action sequences
   under an `actions/` dir and `_ref` them). Every mutation ends by running it.
2. **The `⋯` menu.** The `⋯` `buttons` cell, on click, SetStates a `selected_report` from
   `event.row` and opens an actions `Modal`. The Modal's buttons read `_state: selected_report` and
   are gated:
   - **Owner's five:** Open (Link to the report), Rename (`set-report-title`), Publish/Unpublish
     (`set-report-visibility`), Duplicate (`duplicate-report`), Delete (`delete-report`). Gate the
     owner-only items (Rename, Delete, and the Publish direction) on `selected_report.is_owner`.
   - **Non-owner's two:** Open and Duplicate — the non-owner's path to a version they control.
   - **Publish vs Unpublish** show one at a time on `selected_report.visibility`. **Publish**
     (private → shared) shows only when `is_owner` **and** the viewer holds a `share_roles` role
     **and** the report is private. **Unpublish** (shared → private) is the one item **not** driven
     by `is_owner`: it shows when the report is shared **and** the viewer either owns it **or** holds
     a `share_roles` role — a two-input test computed client-side from `_user: roles` and
     `_module.var: share_roles`.
3. **Delete confirm.** Delete opens a confirm that states the truth — the report stops being listed,
   nothing is queried again, no source data is touched (this is the one place a user meets the
   soft-delete idiom). On confirm: `delete-report` → refetch scope.
4. **★ toggle.** Wire the ★ `buttons` cell click → `set-report-favourite { report_id: row._id }` →
   refetch scope. Refetching is what makes unfavouriting on the Favourites scope drop the row, and a
   favourite change re-tier under the default favourite-first order.
5. **Rename** is a small modal with one text input (one field) → `set-report-title` → refetch.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` is clean; the resolved `reports-list.json` shows the `⋯` column, the
  actions Modal with the gated buttons, the delete confirm, and the ★ click wired.
- Publish is hidden unless owner + role + private; Unpublish is shown on shared when owner **or**
  role-holder; Rename/Delete are owner-only.
- Every mutation (delete, favourite, rename, publish/unpublish, duplicate) ends by refetching the
  current scope; no action patches a single grid node.
- `pnpm e2e` reporting specs still pass (the endpoints and their authorization are unchanged; this
  task only drives them from the UI).

## Files

- `modules/reporting/pages/reports-list.yaml` — modify — add the `⋯` column, the actions Modal, the delete confirm, the rename modal, the ★ click, and the shared refetch.
- `modules/reporting/pages/reports-list/actions/*.yaml` — create (optional) — the extracted refetch (and any multi-step action sequences) if inlining bloats the page.

## Notes

- Confirm the client-side role test operator against the Lowdefy docs before hand-rolling it —
  `set-report-visibility.yaml` uses `_user.hasSomeRoles` server-side; if the same operator resolves
  client-side, use it with `_module.var: share_roles` rather than intersecting `_user: roles`
  manually. Whichever you use, the item's `visible:` must resolve to a real boolean.
- The menu is not the authorization boundary — the endpoints are. Showing an item the endpoint would
  reject is a display bug, not a security one, but gate them anyway so the menu tells the truth.
- Snake_case all block and action IDs.
