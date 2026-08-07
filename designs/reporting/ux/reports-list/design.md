# The reports list: a list built for finding, and a quiet way back

A sub-design of [`reporting/ux`](../design.md) — plates 4 and 5 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

The saved-reports page is stacked cards with Open and Delete. That is adequate at three reports and useless at thirty: nothing is searchable, nothing is sortable, there is no way to see what a report actually contains without opening it, no favourites, and no notion of a report someone else published to you. Deleting one is final as far as the UI is concerned, even though the endpoint has always written a recoverable stamp.

This sub-design rebuilds the page as a scannable grid over the scopes [ownership](../ownership/design.md) provides, and adds the quiet page that makes soft delete visibly recoverable.

**Every screen here is a reader.** The scopes and the authorization live in `list-reports` — the scope match _is_ the authorization boundary; the search, sort and paging are the grid's, done client-side over the loaded scope. This sub-design decides nothing about the model and does not widen what any caller can see.

## Proposed change

1. Rebuild the list as a **scannable table** with three scopes (Mine / Shared / Favourites) chosen server-side, the whole scope loaded so the grid searches, sorts and pages it client-side, contents pills from the spec's section types, an author column on the shared scopes, and visibility as a column.
2. Add a **quiet recovery page** showing the delete stamp's who/when, reached by a footer link rather than a fourth tab.
3. Add the **delete confirm** and the **empty / zero-result states** plate 5 draws.

## Current state

- `modules/reporting/pages/reports-list.yaml` — `List` of `Card`s with Open and Delete buttons and a description paragraph. No favourites, search, sort, paging, visibility or contents preview.
- `modules/reporting/api/list-reports.yaml` — own-only, no parameters at all. Rewritten by [ownership](../ownership/design.md#endpoints) to take `{ scope, search?, sort?, skip, page_size }` and return a total alongside the rows.
- Every other module list in this repo — contacts, companies, activities, user-admin — is an `AgGridBalham` with `onRowClick` into a `Link` and built-in cells doing the display work.

## Key decisions and rationale

### The reports list is a grid, like every other list in this repo

The reports list is the same kind of thing as every other module list here, so it is the same block. The built-in cells cover most of plate 4, with two columns rendered by `_function` because the row data is a shape a built-in cell doesn't take:

| Column     | Cell                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★          | `buttons` with one icon button, `hideTitle`, and `iconField` — a row-data path, so filled or outline is per row                                                                                                |
| Report     | `_function` cellRenderer for the title-plus-description pair, with `wrapText` / `autoHeight` (the user-admin pattern)                                                                                          |
| Contents   | `_function` cellRenderer — one pill per non-zero section type, built from the row's counts (**not** a `tag` cell — see [below](#contents-is-a-rendered-pill-list-because-the-row-carries-counts-not-an-array)) |
| Author     | plain text over `owner.name`, shown only on Shared / All (see [below](#author-shows-on-shared-hides-on-mine))                                                                                                  |
| Updated    | `date`                                                                                                                                                                                                         |
| Visibility | `tag` with a `colorMap`, read-only                                                                                                                                                                             |
| ⋯          | nothing — see below                                                                                                                                                                                            |

`selector`, `multipleSelector`, `switch`, `textInput` and `paragraphInput` cells landed in [PR 2201](https://github.com/lowdefy/lowdefy/pull/2201) and are **already on `vite-hono`** (commit `17c1392b`, an ancestor of the branch) and in the experimental build the demo installs — the `cell.type` enum on the display grid lists all of them. Nothing needs porting.

They do not, however, solve the row menu, and the `selector` cell should not be pressed into that job: it is an input, so the chosen action is written back into the row node and rendered as the cell's value, it carries clear / search / placeholder affordances, and it announces as a combobox. A menu of verbs is not a value.

### Contents is a rendered pill list, because the row carries counts, not an array

`list-reports` returns the section breakdown as a **counts object** — `section_counts: { kpi, chart, table, markdown, download }` — plus `filter_count` beside it, deliberately apart because a filter is a control over the report, not content in it. A built-in `tag` cell renders an _array_ as one pill per item and a scalar as one pill; handed an object it would stringify to `[object Object]`. So Contents is a small `_function` cellRenderer, the same mechanism the Report column already uses:

- One pill per section type whose count is **non-zero** — a report with two charts and a table shows `2 charts` and `1 table`, nothing for the types it lacks. Labels are singular/plural on the count.
- The **filter pill renders last and distinct** (a lighter, outline style) so "this report has controls" reads apart from "this report has content" — the endpoint keeps `filter_count` separate for exactly this reason, and the cell honours it rather than folding it into the content pills.
- Empty spec → no pills, not an empty cell decoration.

This is the one place the "built-in cells cover it" story bends, and it bends because the endpoint's shape is right (counts the page can label as it likes) and the built-in cell's input contract is narrower than the row. Rendering it on the page keeps the labels and pluralisation where copy decisions belong.

### Visibility stays a read-only tag

The same reasoning in reverse: a two-option `selector` on every row would make publishing to the whole app a single mis-click on a list, where [ownership](../ownership/design.md#private-by-default-publishing-is-role-gated-binary-and-reversible) deliberately makes it a named act. The capability existing is not an argument for using it.

Publishing happens on the report page or through the row menu, both of which name what they are doing.

### Author shows on Shared, hides on Mine

`list-reports` projects `owner.name` onto every row — a snapshot, because reporting knows no users collection and cannot resolve a `user_id` to a current name — while dropping `owner.user_id` (ownership checks ride the `is_owner` flag instead). That name earns a column on the scopes where rows come from different people: **Shared** and **All** show reports others published, and "who published this" is what tells two identically titled reports apart. On **Mine** the author is always the viewer and on **Favourites** it usually is, so the column would be pure noise there.

So the Author column is present but **`hide`-bound to the scope** — visible when `scope` is `shared` or `all`, hidden otherwise — rather than a separate set of column definitions per scope. Scope is page state, so the column definition reads it directly; changing tabs shows or hides the column without a rebuild. It carries `owner.name` as plain text (no renderer): a snapshot string, not a link, because there is no user page to link to.

### The one real gap is a `menu` cell

An antd `Dropdown` whose `items[]` each carry an `eventName`, with the `*Field` row-data resolution, `hidden` / `disabled` and `danger` that `ButtonsCell` already implements. It is a small, generic addition in the same shape as PR 2201, it belongs upstream because every list page in this repo will eventually want it, and it is the natural companion PR to the one that added those cells.

Until it exists, the kebab is a single `⋯` button in a `buttons` cell opening a `Modal` of actions — the owner's five and the non-owner's two, chosen by `hiddenField` on the row's `is_owner`. That is a worse popover, not a worse feature, and swapping it for the cell later touches one column definition.

**The menu is not the boundary.** Which items a row shows is a display choice driven by `is_owner`; the authorization is the check in each endpoint — see [ownership](../ownership/design.md#ownership-is-enforced-server-side-on-every-write).

**One item is not driven by `is_owner`: Unpublish.** A `share_roles` holder may unpublish a shared report they do not own ([why](../ownership/design.md#taking-it-down-is-easier-than-putting-it-up)), so that item shows when the row is shared **and** the viewer either owns it or holds the role. This needs nothing extra from `list-reports`: the page has the viewer's roles from `_user: roles` and the configured roles from `_module.var: share_roles`, so the condition is computed client-side against data already in hand. It is the one row action whose visibility is a two-input test rather than a flag, and the endpoint is still what decides.

### Three scopes, chosen server-side

Mine / Shared / Favourites is a `SegmentedSelector` that sets the `scope` parameter and refetches. It is not a client-side filter over an "everything" response, because the scope match _is_ the authorization boundary — the reasoning is [ownership](../ownership/design.md#ownership-is-enforced-server-side-on-every-write)'s, and this page must not undo it by fetching wider than the tab. The four predicates are written out in [ownership](../ownership/design.md#endpoints); the one that shapes this page is that **the scopes overlap by design** — a report you published is in both Mine and Shared, and possibly Favourites too. Nothing here should try to de-duplicate across tabs.

Search, sort and paging are **not** the same — they are not server parameters at all. Only `scope` is, because only `scope` is the authorization boundary; the grid does the rest client-side over the loaded scope ([below](#the-scope-loads-whole-the-grid-searches-sorts-and-pages-it--like-every-other-list-here)).

### The scope loads whole; the grid searches, sorts and pages it — like every other list here

The scope is the one thing that must be a server parameter, because the scope match **is** the authorization boundary ([ownership](../ownership/design.md#ownership-is-enforced-server-side-on-every-write)) — the page must never fetch wider than the tab and pick client-side. Everything else — search, sort, paging — is **not** a server parameter. `list-reports` returns **every row in the requested scope** and `AgGridBalham` does the searching, sorting and paging over them, client-side, exactly the way `contacts`, `companies`, `activities` and `user-admin` all feed their grids (`rowData: { _request: get_all_* }`, `sortable: true` on the columns, no paging). The reports list called itself "the same kind of thing as every other module list here" — this is where it actually is one.

This rests on a volume assumption stated plainly: **a single scope is low hundreds of reports at most.** That is the same bet the other lists already make (they load every contact, every company), and it is safe at this repo's scale. Should a deployment's Mine or Shared ever outgrow that, the whole-scope fetch is where it would hurt and where paging would come back — see [Risks](#risks). Search is the grid's quick-filter over the loaded rows (matching the title and description the Report cell renders); sort is native header sort; there is no Load-more footer and no offset.

This **reverses ownership's offset-paging deviation** ([its deviation 2](../ownership/design.md#deviations-from-the-wireframes)): with no client paging there is nothing to page server-side, so `list-reports` drops its `skip` / `page_size` limiting and returns the scope whole. It keeps everything else that made it an aggregation — `is_favourite`, `is_owner`, `section_counts` / `filter_count`, the `owner.name` snapshot, and the favourite-first default order as the initial sort the grid then takes over. The endpoint is that page's only consumer, so the trim is contained; ownership's endpoint note gets a one-line update to match.

**A row action that changes the row — delete, favourite, publish/unpublish — refetches the scope**, rather than patching the one grid node. With the whole scope already one request, a refetch is cheap, and it keeps the sort order, the ★ tier and the contents counts honest from the server instead of hand-reconciling a mutated node against a client-side sort. A scope change refetches for the same reason it always did: it is a different authorization set.

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

- `modules/reporting/pages/reports-list.yaml` — rebuilt as an `AgGridBalham` fed the whole scope via `rowData`, with a scope `SegmentedSelector` and a quick-filter search above it, `sortable: true` native header sort, `buttons` / `tag` / `date` / `_function` cells, a scope-`hide`-bound Author column over `owner.name`, the row action menu, the delete confirm, the recovery link, and the three empty states. No Load-more footer.
- `modules/reporting/api/list-reports.yaml` — drop the `$skip` / `$limit` paging so the endpoint returns the whole scope (see [the scope loads whole](#the-scope-loads-whole-the-grid-searches-sorts-and-pages-it--like-every-other-list-here)); keep the computed fields and the default order. Its `sort` / `search` parameters go unused and can be trimmed in the same pass.
- New `modules/reporting/pages/reports-deleted.yaml` — the recovery page.
- `modules/reporting/module.lowdefy.yaml` — the new page export.
- `designs/reporting/ux/ownership/design.md` — one-line note that list-reports no longer pages (reverses its deviation 2).
- `docs/reporting/` — the index's surfaces table.

## Demo consumers

The seeded fixtures are [ownership](../ownership/design.md#demo-consumers)'s — private, shared and favourited reports, one owned by a second user, and one soft-deleted. What this sub-design adds:

- Enough seeded reports that search and sort have something to do, and at least one whose spec spans two section types so the contents pills render as more than one pill.
- The Shared scope showing the report owned by the second user, so the Author column renders a name that is not the viewer's.
- The recovery page reachable from the demo list, rendering the seeded soft-deleted report's real stamp.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Resolved questions

Resolved 2026-07-30, from reading the installed block source:

1. **Does the reports table use AgGrid, and do the new input cells help?** Yes to the grid — it is the pattern every other module list here follows, and the built-in cells cover every column but the kebab and Contents (`buttons` takes a per-row `iconField` for the ★). _(Contents was assumed a `tag` cell here; the shipped endpoint returns counts, not an array, so it is a `_function` cellRenderer — see [Contents is a rendered pill list](#contents-is-a-rendered-pill-list-because-the-row-carries-counts-not-an-array).)_ The `selector` / `switch` / `textInput` / `paragraphInput` cells from PR 2201 are already on `vite-hono` and in the installed build, so there is nothing to port — but they are the wrong tool for a row menu, and an inline visibility selector would make publishing a mis-click. The gap is a `menu` cell; the interim is `⋯` opening a `Modal`.

## Deviations from the wireframes

1. **"Last ran" is not persisted.** Plate 4's list mentions when a report last ran. Persisting a `last_run` stamp means a write on every report open, for a fact that is really "last opened". The list column shows the `updated` stamp's timestamp (when the spec last changed); the report header states the run time at resolve, which is free and honest. Plate 4's column label should read _Updated_.
2. **The row kebab opens a `Modal`, not a popover.** Plate 4 draws a dropdown; `AgGridBalham` has a cell type for every other column but none for a menu. A `menu` cell upstream restores the popover — [why](#the-one-real-gap-is-a-menu-cell).
3. **No Load-more footer.** Plate 4 draws `Showing 6 of 8 · Load more`. The scope loads whole and the grid pages it (native pagination if the count warrants it), so there is no slice to fetch and no footer to draw — [why](#the-scope-loads-whole-the-grid-searches-sorts-and-pages-it--like-every-other-list-here). The recovery link stays; it just no longer shares a row with a Load-more button.

## Risks

- **The `menu` cell is a second upstream ask, but not a risk to this page.** The list ships with `⋯` opening a `Modal` and swaps to the cell in one column definition.
- **The whole-scope fetch assumes low hundreds.** The page loads every report in a scope and lets the grid search / sort / page it, the same way every other module list here loads all its rows. That is safe at this repo's scale and confirmed as the expected volume. The failure mode is not subtle — a scope of thousands would make the initial fetch slow — and the fix is the paging that was just removed, brought back only if a real deployment needs it. Trading a here-and-now correctness hazard (a mutated node reconciled against a live offset) for a volume ceiling nobody is near is the right trade.

## Non-goals

- **Editing a report from the list.** Rename is a row action because it is one field; everything else opens the report or the chat.
- **A permanent delete on the recovery page**, or anywhere.
- **Inline visibility toggling.** See [above](#visibility-stays-a-read-only-tag).
- **A fourth scope for deleted reports.** Recovery is a page.
- **Bulk actions.** No multi-select, no bulk delete — nothing in the deck asks for one, and it would need a second confirm story.
