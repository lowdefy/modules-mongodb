# Review 1

The design holds up well — the grid-is-the-pattern call is right, the scope-is-authorization
reasoning is sound and already matches the shipped `list-reports`, and the empty-state split is
genuinely three screens. The findings below are all seams between this design and the endpoint
that shipped under [ownership](../../ownership/design.md), plus one interaction the design
enumerates actions for but never sequences.

### 1. The Contents column can't be a plain `tag` cell — the endpoint returns a counts object, not the array `TagCell` needs

> **Resolved.** Confirmed against the shipped endpoint and `TagCell.js`: `list-reports`
> returns `section_counts` (an object) + `filter_count`, and `TagCell` stringifies a non-array
> to `[object Object]`. Contents becomes a `_function` cellRenderer (the mechanism the Report
> column already uses): one pill per non-zero section type with pluralised labels, zero-count
> types dropped, and the filter pill rendered last in a distinct outline style so a control
> reads apart from content. New section "Contents is a rendered pill list…" in the design; the
> grid table and the dated Resolved-question were corrected to match.

The grid table (the decision that the reports list is a grid) lists **Contents** as a `tag` cell,
with the note "`TagCell` renders an **array** as one tag per item, which is the contents pills
exactly." But the shipped `list-reports` does not return an array. It returns
`section_counts` as an **object keyed by type** — `{ kpi, chart, table, markdown, download }` — and
`filter_count` as a **separate number** (`modules/ai-reporting/api/list-reports.yaml`, the `$project`
stage: five `$size`/`$filter` counts under `section_counts`, then `filter_count` beside it with the
comment "a filter is a control over the report, not content in it — the list draws it as its own
pill").

`TagCell` (`@lowdefy/blocks-aggrid/dist/cellRenderers/TagCell.js`) only spreads to one-pill-per-item
when `type.isArray(value)`. Handed an object it falls through to the scalar branch and renders
`String(value)` — i.e. the cell shows `[object Object]`. So the design's "covered exactly" is not
true against the endpoint as built: something must turn `{ chart: 2, table: 1, ... }` into an array
of labels like `["2 charts", "1 table"]` before a `tag` cell can render it, and that transform is
unspecified. It carries three sub-decisions the design should make, not the implementer:

- **Where the array is built** — a client `valueGetter`/`_function` on the column, or a `contents:
[...]` array added to the endpoint's projection. (The endpoint deliberately emits raw counts so
  the _page_ owns labels/order — so the valueGetter is the likelier answer, but then the Contents
  column is a `_function` cellRenderer, not the built-in `tag`, and the "built-in cells cover plate
  4 almost completely" claim shrinks by one.)
- **Labels, pluralisation and zero-drop** — `2 charts` vs `2 chart`, and whether a type with count
  0 produces no pill (it must, or every row shows five pills).
- **Where the filter pill sits** — `filter_count` is modelled separately on purpose; is it a sixth
  entry in the same Contents array, or its own cell/column? The design never says filters appear in
  Contents at all.

Fix: pick the valueGetter-builds-the-array route (it keeps the label/pluralisation choice on the
page, where the endpoint comment already assumes it lives), and write the label map + the filter
pill's placement into the design.

### 2. Row actions and append-paging are never reconciled — a mutation mid-list breaks the offset, the sort key, or the scope

> **Resolved.** Dissolved at the root rather than patched: server paging is dropped entirely.
> Every other list in this repo (contacts, companies, activities, user-admin) loads all its rows
> and lets AgGrid search / sort / page client-side, and the user confirmed a scope is low
> hundreds of reports at most — so the reports list does the same. With no offset there is nothing
> for a mid-list mutation to corrupt; a row action (delete, favourite, publish/unpublish) refetches
> the whole scope and the grid re-sorts and re-counts from truth. New section "The scope loads
> whole…" in the design; `list-reports` loses its `skip`/`page_size` limiting.

The design settles two things independently and never crosses them. Paging is append-and-accumulate,
and "a scope change, a search change and a sort change each reset the accumulated rows and the
offset" (the Load-more decision, echoed in Risks). Separately, the row menu fires **delete, rename,
publish/unpublish, and favourite** against a row already on screen. But the reset list is
scope/search/sort only — it says nothing about what happens to the accumulated rows, the offset, or
the `total` ("of 8") when one of those row actions fires. Three concrete failures follow, and each
is a case the design's own model creates:

- **Favourite toggle under the default sort.** The shipped default sort is `is_favourite: -1,
updated.timestamp: -1, _id: 1` (`list-reports.yaml`, the `$sort` default branch). Toggling ★
  mutates the _primary sort key of the list you are looking at_. Re-query the same offset window and
  the toggled row has jumped tiers; append-paging over a key that just moved skips or double-counts.
- **Unpublish on the Shared scope.** Shared matches `visibility: shared`. Unpublishing a row from
  its menu drops it out of the Shared set server-side, so the set shrinks under a fixed offset.
- **Unfavourite on the Favourites scope.** Same shape — the row no longer matches `favourite_of`,
  so does it vanish immediately, or linger until the next fetch? The design lists ★ as a column and
  Favourites as a scope but never sequences the click → `set-report-favourite` → what-the-view-does.

(Delete on Mine is the benign case if the offset is derived from `rows.length`: client and server
both lose the row, so the next slice still aligns. That it's benign only _there_ is exactly why the
rule needs stating — it isn't benign for the three above.)

Fix: decide the post-mutation contract once and write it in. The clean rule is that any row
mutation re-fetches the currently-loaded window (`skip: 0, page_size: rows.length`) and replaces the
accumulated rows with the result, rather than patching a single node — it keeps the offset, the
sort order and the `total` honest for the same reason the scope/search/sort resets do.

### 3. No author column, though `list-reports` projects `owner.name` for the page to show

> **Resolved.** Add the Author column. It carries `owner.name` (plain text — a snapshot, no user
> page to link to) and is `hide`-bound to the scope: visible on Shared and All, where rows come
> from different people, hidden on Mine and Favourites where the author is the viewer. New section
> "Author shows on Shared, hides on Mine" in the design; the grid table, Files-changed and Demo
> consumers updated. Keeping `owner.name` on the endpoint is now earned rather than vestigial.

The grid's columns are ★ / Report / Contents / Updated / Visibility / ⋯ — there is no author/owner
column. But the shipped endpoint projects `owner.name` into every row (`list-reports.yaml`
`$project`, commented "A snapshot … owner.user*id stays out — is_owner is all the page needs from
it"). `owner.user_id` is excluded precisely because `is_owner` covers the \_checks*; `owner.name` is
kept for the one thing left, **display** — and this list is the only consumer of `list-reports`. So
the endpoint is handing the page an author name the design gives it nowhere to render.

It matters most on the scope the design added the endpoint for: **Shared** is reports other people
published to the app, and "who made this" is the column that tells two rows apart there. On Mine the
author is always the viewer, so the column is redundant and should hide; the same `is_owner`/scope
condition the ⋯ menu already uses drives that.

Fix: add an **Author** column (a plain text/`link` cell over `owner.name`), shown on Shared (and
All), hidden on Mine and Favourites-you-own. Or, if the intent really is to never show it, drop
`owner.name` from the endpoint projection so a confidential-by-omission field isn't shipped to a
client that has no use for it — but that seems the wrong way round given Shared.

### 4. The sort control is asserted but not designed, and it drops the click-to-sort every other list here has

> **Resolved (auto).** Follows from dropping server paging (finding 2). With the scope loaded
> whole, sort is native AgGrid header sort (`sortable: true`), client-side, exactly like every
> other list here — no toolbar sort widget, no server `sort` parameter, and the conflation the
> Risks note made (client comparator vs header-as-trigger) is moot because there is no server sort
> to disagree with. Search is likewise the grid's quick-filter over the loaded rows. Captured in
> the same "The scope loads whole…" section.

The toolbar is listed as "scope segmented control, search, sort", and the endpoint takes an
arbitrary `sort.by` / `sort.order` that _replaces_ the default. But the design never says **which
columns are sortable** or **what the sort control is** — and its Risks note actively rules out the
obvious one: "a client-side sort silently disagreeing with the server's … sort is a request
parameter only; the grid does no sorting of its own." That conflates two different things. A
client-side _comparator_ sorting the loaded page would indeed disagree with the server. But AgGrid's
column-header sort can instead be wired as the _trigger_ — `onSortChanged` sets `sort.by`/`sort.order`
and refetches, with the grid's own comparators disabled — which is the normal server-sort
integration and is exactly the affordance "every other list in this repo" gives users for free. As
written, this list is the one that makes them go to a separate toolbar widget instead of clicking a
header, and the design doesn't say why, nor which fields (Report? Updated? Visibility?) the widget
even offers.

Fix: either adopt header-sort-as-trigger (consistent with the repo, no new toolbar control) or, if a
toolbar sorter is genuinely wanted, enumerate the sortable keys and say why the native affordance is
declined. Note this also interacts with finding 2: a sort change already resets the rows and offset,
so wiring it through the header changes nothing about the paging contract.
