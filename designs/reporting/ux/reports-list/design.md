# The reports list: a list built for finding, and a quiet way back

A sub-design of [`reporting/ux`](../design.md) — plates 4 and 5 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

The saved-reports page is stacked cards with Open and Delete. That is adequate at three reports and useless at thirty: nothing is searchable, nothing is sortable, there is no way to see what a report actually contains without opening it, no favourites, and no notion of a report someone else published to you. Deleting one is final as far as the UI is concerned, even though the endpoint has always written a recoverable stamp.

This sub-design rebuilds the page as a scannable grid over the scopes [ownership](../ownership/design.md) provides, and adds the quiet page that makes soft delete visibly recoverable.

**Every screen here is a reader.** The scopes, the search, the sort, the paging and the authorization all live in `list-reports`; this sub-design decides nothing about the model and does not widen what any caller can see.

## Proposed change

1. Rebuild the list as a **scannable table** with three scopes (Mine / Shared / Favourites), server-side search, sort and paging, contents pills from the spec's section types, and visibility as a column.
2. Add a **quiet recovery page** showing the delete stamp's who/when, reached by a footer link rather than a fourth tab.
3. Add the **delete confirm** and the **empty / zero-result states** plate 5 draws.

## Current state

- `modules/reporting/pages/reports-list.yaml` — `List` of `Card`s with Open and Delete buttons and a description paragraph. No favourites, search, sort, paging, visibility or contents preview.
- `modules/reporting/api/list-reports.yaml` — own-only, no parameters at all. Rewritten by [ownership](../ownership/design.md#endpoints) to take `{ scope, search?, sort?, skip, page_size }` and return a total alongside the rows.
- Every other module list in this repo — contacts, companies, activities, user-admin — is an `AgGridBalham` with `onRowClick` into a `Link` and built-in cells doing the display work.

## Key decisions and rationale

### The reports list is a grid, like every other list in this repo

The reports list is the same kind of thing as every other module list here, so it is the same block. The built-in cells cover plate 4 almost completely:

| Column     | Cell                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| ★          | `buttons` with one icon button, `hideTitle`, and `iconField` — a row-data path, so filled or outline is per row       |
| Report     | `_function` cellRenderer for the title-plus-description pair, with `wrapText` / `autoHeight` (the user-admin pattern) |
| Contents   | `tag` — `TagCell` renders an **array** as one tag per item, which is the contents pills exactly                       |
| Updated    | `date`                                                                                                                |
| Visibility | `tag` with a `colorMap`, read-only                                                                                    |
| ⋯          | nothing — see below                                                                                                   |

`selector`, `multipleSelector`, `switch`, `textInput` and `paragraphInput` cells landed in [PR 2201](https://github.com/lowdefy/lowdefy/pull/2201) and are **already on `vite-hono`** (commit `17c1392b`, an ancestor of the branch) and in the experimental build the demo installs — the `cell.type` enum on the display grid lists all of them. Nothing needs porting.

They do not, however, solve the row menu, and the `selector` cell should not be pressed into that job: it is an input, so the chosen action is written back into the row node and rendered as the cell's value, it carries clear / search / placeholder affordances, and it announces as a combobox. A menu of verbs is not a value.

### Visibility stays a read-only tag

The same reasoning in reverse: a two-option `selector` on every row would make publishing to the whole app a single mis-click on a list, where [ownership](../ownership/design.md#private-by-default-publishing-is-role-gated-binary-and-reversible) deliberately makes it a named act. The capability existing is not an argument for using it.

Publishing happens on the report page or through the row menu, both of which name what they are doing.

### The one real gap is a `menu` cell

An antd `Dropdown` whose `items[]` each carry an `eventName`, with the `*Field` row-data resolution, `hidden` / `disabled` and `danger` that `ButtonsCell` already implements. It is a small, generic addition in the same shape as PR 2201, it belongs upstream because every list page in this repo will eventually want it, and it is the natural companion PR to the one that added those cells.

Until it exists, the kebab is a single `⋯` button in a `buttons` cell opening a `Modal` of actions — the owner's five and the non-owner's two, chosen by `hiddenField` on the row's `is_owner`. That is a worse popover, not a worse feature, and swapping it for the cell later touches one column definition.

**The menu is not the boundary.** Which items a row shows is a display choice driven by `is_owner`; the authorization is the check in each endpoint — see [ownership](../ownership/design.md#ownership-is-enforced-server-side-on-every-write).

**One item is not driven by `is_owner`: Unpublish.** A `share_roles` holder may unpublish a shared report they do not own ([why](../ownership/design.md#taking-it-down-is-easier-than-putting-it-up)), so that item shows when the row is shared **and** the viewer either owns it or holds the role. This needs nothing extra from `list-reports`: the page has the viewer's roles from `_user: roles` and the configured roles from `_module.var: share_roles`, so the condition is computed client-side against data already in hand. It is the one row action whose visibility is a two-input test rather than a flag, and the endpoint is still what decides.

### Three scopes, chosen server-side

Mine / Shared / Favourites is a `SegmentedSelector` that sets the `scope` parameter and refetches. It is not a client-side filter over an "everything" response, because the scope match _is_ the authorization boundary — the reasoning is [ownership](../ownership/design.md#ownership-is-enforced-server-side-on-every-write)'s, and this page must not undo it by fetching wider than the tab. The four predicates are written out in [ownership](../ownership/design.md#endpoints); the one that shapes this page is that **the scopes overlap by design** — a report you published is in both Mine and Shared, and possibly Favourites too. Nothing here should try to de-duplicate across tabs.

Search, sort and paging are the same: parameters on the same request, not post-processing.

### Paging is a Load more footer, not numbered pages

Plate 4 draws the footer as `Showing 6 of 8 · Load more`, and that is what gets built: one button that fetches the next slice and **appends** to the rows already rendered, with the total coming from the endpoint's count. A list you scan for one report does not want numbered pages, and this keeps the footer to a single control beside the Recently-deleted link.

The endpoint pages by **offset** rather than the cursor the plates' callout specifies — [ownership](../ownership/design.md#deviations-from-the-wireframes)'s deviation 2, driven by sort becoming user-selectable. Nothing about the footer changes: Load more asks for the next offset and the count supplies the "of 8". So this page reads `{ skip, page_size }` and accumulates, rather than replacing rows per page.

A scope change, a search change and a sort change each **reset the accumulated rows and the offset**, because all three change what the list is. This is the one place the appending model needs care: appending onto rows from a previous scope would mix two authorization boundaries in one grid.

### Recovery is a page, not a scope

Deleted reports are recoverable, but recovery is not part of anyone's daily loop, so it is a footer link to a small page rather than a fourth tab beside three the user picks between daily. Server-side it is `list-reports` with `scope: deleted`, still owner-matched — you never see anyone else's deleted reports, including ones that were published to you.

The page shows the stamp's who/when, because a recovery screen that omits it makes the user guess whether they are looking at their own mistake. Restore returns the report to private, which is [ownership](../ownership/design.md#restore-returns-a-report-to-private)'s decision, and the page says so rather than restoring silently.

**A successful restore hands the user the report**, as a link to it rather than a return to the list. Restoring does not touch the report's `updated` stamp — deliberately, since that stamp is what the report page calls "when the spec last changed" and a restore changes no spec — so a report last edited months ago comes back at its old position in Mine, not the top. The row leaving this page confirms the restore happened; the link is what makes it findable. This is cheaper and better than reordering the list would have been: even a report at the top of Mine still means scanning a grid for it, and this page already has the report id in hand.

There is no permanent-delete action on this page or anywhere else.

### The delete confirm says nothing is destroyed

"Delete" over a data tool reads as destructive, so the confirm states the truth: the report stops being listed, nothing is queried again, and no data is touched. The module never writes to the source collections at all. This is the one place a user meets the soft-delete idiom, so it is the one place worth spelling out.

### No Export on a list row

A report holds several sections over different collections and grains, so a report-level export has no answer to "export what?" — the full reasoning is [report-page](../report-page/design.md#export-belongs-to-a-section-not-to-a-report)'s. The consequence for this page is simply that rows carry no `⤓`: you open the report and download the section you meant.

### Empty states are three different screens

Plate 5 draws them as one, but they say different things and only one of them is reached by a new user:

- **Mine, no reports yet** — teaches the second job and links to the chat with the report track pre-selected. This is the first-run screen.
- **Shared, nothing published** — states that nothing in the app has been published, which is a fact about the app, not a prompt to act. It stays accurate under the scope definition ownership settled: Shared includes the viewer's own published reports, so this screen means the app's shared library is empty, not that nobody has shared with _you_.
- **A search or scope with zero results** — offers to clear the search **and to search wider**, and does not teach anything. The second button re-runs the same term against [ownership](../ownership/design.md#endpoints)'s `all` scope, for the user who knows they saved something and not which tab it is in. Search matches titles and descriptions, which is what this screen should say it looked in. `all` is not a fourth segment in the control: the tabs stay Mine / Shared / Favourites, and this is the only way to reach it.

Collapsing them into one message would put "make your first report" in front of someone whose search simply missed.

## Files changed (anticipated)

- `modules/reporting/pages/reports-list.yaml` — rebuilt as an `AgGridBalham` with toolbar (scope segmented control, search, sort), `buttons` / `tag` / `date` cells, the row action menu, the `Showing n of m · Load more` footer beside the recovery link, delete confirm, and the three empty states.
- New `modules/reporting/pages/reports-deleted.yaml` — the recovery page.
- `modules/reporting/module.lowdefy.yaml` — the new page export.
- `docs/reporting/` — the index's surfaces table.

## Demo consumers

The seeded fixtures are [ownership](../ownership/design.md#demo-consumers)'s — private, shared and favourited reports, one owned by a second user, and one soft-deleted. What this sub-design adds:

- Enough seeded reports that paging and search have something to do, and at least one whose spec spans two section types so the contents pills render as more than one tag.
- The recovery page reachable from the demo list, rendering the seeded soft-deleted report's real stamp.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Resolved questions

Resolved 2026-07-30, from reading the installed block source:

1. **Does the reports table use AgGrid, and do the new input cells help?** Yes to the grid — it is the pattern every other module list here follows, and the built-in cells cover every column but the kebab (`tag` renders an array as multiple pills; `buttons` takes a per-row `iconField` for the ★). The `selector` / `switch` / `textInput` / `paragraphInput` cells from PR 2201 are already on `vite-hono` and in the installed build, so there is nothing to port — but they are the wrong tool for a row menu, and an inline visibility selector would make publishing a mis-click. The gap is a `menu` cell; the interim is `⋯` opening a `Modal`.

## Deviations from the wireframes

1. **"Last ran" is not persisted.** Plate 4's list mentions when a report last ran. Persisting a `last_run` stamp means a write on every report open, for a fact that is really "last opened". The list column shows the `updated` stamp's timestamp (when the spec last changed); the report header states the run time at resolve, which is free and honest. Plate 4's column label should read _Updated_.
2. **The row kebab opens a `Modal`, not a popover.** Plate 4 draws a dropdown; `AgGridBalham` has a cell type for every other column but none for a menu. A `menu` cell upstream restores the popover — [why](#the-one-real-gap-is-a-menu-cell).

## Risks

- **The `menu` cell is a second upstream ask, but not a risk to this page.** The list ships with `⋯` opening a `Modal` and swaps to the cell in one column definition.
- **A grid over a server-paged, server-scoped source is easy to get subtly wrong** — rows left over from the previous scope, an offset that outlived a search change, or a client-side sort silently disagreeing with the server's. Every scope, search and sort change resets both the accumulated rows and the offset, and sort is a request parameter only; the grid does no sorting of its own. The appending footer makes the stale-rows case the one to test.

## Non-goals

- **Editing a report from the list.** Rename is a row action because it is one field; everything else opens the report or the chat.
- **A permanent delete on the recovery page**, or anywhere.
- **Inline visibility toggling.** See [above](#visibility-stays-a-read-only-tag).
- **A fourth scope for deleted reports.** Recovery is a page.
- **Bulk actions.** No multi-select, no bulk delete — nothing in the deck asks for one, and it would need a second confirm story.
