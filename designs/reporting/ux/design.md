# Reporting UX: the chat surface, saved reports, and the report page

The reporting module carries two jobs on one surface — explore data conversationally, and turn what you found into a saved report — and today the second one is effectively invisible: a report exists only if the user happens to type "turn this into a report". Everything downstream inherits that gap. The conversations rail has no search, rename or recency grouping; the results panel is hidden until a chart arrives, so a first-time user never learns it exists; tabular answers are stranded as transcript text because only charts and downloads stream back as artefacts; the saved-reports page is stacked cards with Open and Delete, with no favourites, no search, no notion of a report anyone else can see; and the report page offers no way to carry a question forward.

This design makes both jobs legible and gives saved reports a life cycle: **created from selected results, found in a list built for finding, published or kept private, retired by a single soft delete, and recoverable.** It is a UX and endpoint design — it does not touch the query engine or the safety model. The catalog stays the allowlist, the read-only principal stays the second layer, and every new endpoint is a read or a write against the reports and conversations stores.

**[`wireframes.html`](wireframes.html) is part of this design.** Six annotated plates with numbered callouts; open it in a browser (it is self-contained, light/dark, and its chart palettes are CVD-validated). Where this document and the wireframes differ, this document is the decision — see [Deviations from the wireframes](#deviations-from-the-wireframes).

**[`wireframes-blocks.html`](wireframes-blocks.html) is the same deck built.** Each surface redrawn as it lands in the blocks we actually have, every region labelled with the block behind it, and each bend from the drawing marked where it happens. Read it beside the plates when implementing; the reasoning is in [Block feasibility](#block-feasibility).

| Plate | Surface                                  | Status                       |
| ----- | ---------------------------------------- | ---------------------------- |
| 1     | `/reporting/chat` — first run            | new                          |
| 2     | `/reporting/chat` — mid-conversation     | page exists, panels reworked |
| 3     | Save-as-report confirm sheet             | new                          |
| 4     | `/reporting/reports-list`                | page exists, rebuilt         |
| 5     | Delete confirm · recovery · empty states | new                          |
| 6     | `/reporting/report?reportId=…`           | page exists                  |

Filter **mechanics** — multi-select, array-field semantics, looked-up options — are **out of scope here** and designed in [`designs/reporting/report-filters/design.md`](../report-filters/design.md). Plates 3 and 6 show its UI; the engine reasoning lives there. Filter **placement** on the report page is in scope here, and is the one open problem the implemented filters left behind — see [the filter row says nothing about what it scopes](#the-filter-row-says-nothing-about-what-it-scopes).

## Proposed change

**Chat surface (plates 1–2)**

1. Rework the welcome into **two tracks of starters** — exploratory prompts and report-shaped prompts — plus a line naming what the assistant can see, derived from the catalog's collection descriptions. Clicking a starter fills the composer rather than sending it. Both halves of this are built _outside_ `AgentChat` and rest on one new block method — see [Block feasibility](#the-one-thing-the-blocks-cannot-do-fill-the-composer).
2. Make the **results panel visible when empty**, explaining its own shape, instead of `visible: false` until the first chart.
3. Make **both side panels collapsible**, with the state held for the session (`SetGlobal` — see [Block feasibility](#collapse-state-is-session-scoped-not-persisted)) and both collapsed by default on a narrow viewport.
4. Give the conversations rail **search, recency grouping (Today / Previous 7 days / Older), rename, and soft delete**, which needs an `updated` timestamp and a snippet from `list-conversations`.
5. Add a **`data-report-table` part** so tabular answers become panel artefacts, and scope the panel All / Charts / Tables / Exports.
6. **Prompt the agent to sketch inline with mermaid** where a shape is simple (one series, ≤6 categories) and to name the panel for the full chart. Prompt-only — no block change.
7. Add **result selection → "Save as report"** in the panel. This is the change that makes the second job real.

**Report creation (plate 3)**

8. Add a **confirm sheet**: name pre-filled from the conversation title, sections as the selected results in order, and a filter picker offering catalog-derived fields. The typed path ("save this as a report") opens the same sheet pre-filled, so both routes converge on one confirm step. What the picker can offer for a looked-up option list — and how it derives one from a catalog `relationships` entry plus a label field the user picks — is specified in [`report-filters`](../report-filters/design.md#two-authors-the-agent-writes-the-pipeline-the-sheet-derives-it).
9. Add a **`create-report` endpoint** so report creation no longer depends on the agent's `generate_report` tool. The tool path stays and opens the same sheet.

**Ownership and audience (plates 3, 4, 6)**

10. Reports are **private to their author** by default. A `visibility: private | shared` field opens one to the whole app, settable only by a user holding one of the roles listed in a new **`share_roles`** var (a string array — more than one role can carry the privilege). Unset means no publishing at all.
11. **Publish and unpublish are one reversible act** via a single `set-report-visibility` endpoint, with exactly two states: only me, or everyone in the app. No per-user grants, no groups, no share links.
12. Every mutation is **owner-checked server-side** — rename, publish, unpublish, delete, fix-a-section, continue-in-chat — and every read-only act (open, favourite, download a section, duplicate) is not. **Duplicate** is the non-owner's path to a version they control.

**Finding, retiring, recovering (plates 4–5)**

13. Rebuild the list as a **scannable table** with three scopes (Mine / Shared / Favourites), server-side search, sort and paging, contents pills from the spec's section types, and visibility as a column.
14. Add **per-user favourites** (`favourite_of: [userId]`, projected to a boolean for the caller) so one user's ★ is not everyone's, and they work on shared reports you do not own.
15. Keep **soft delete as the only retirement** — no archive state. Deleting a published report drops it from everyone's Shared scope for free, because every read filters the stamp.
16. Add a **quiet recovery page** (`list-reports` with `scope: deleted`, owner-matched) showing the delete stamp's who/when, with **restore returning the report to private**. No purge endpoint.

**Report page (plate 6)**

17. Add a **provenance line** (who made it, when, when it ran), **per-section CSV** (`⤓` on each query-backed section; none on a KPI), and **"Continue in chat"** reopening the source conversation with the report as context — owner-only.
18. Give a broken section **two owner-only recoveries** — ask the assistant to fix it, or drop it — on top of the per-section Alert the module already renders. A non-owner's broken section names who can fix it and stops there.
19. Persist **`conversationId`** on the report doc so the report ↔ chat links work in both directions.

## Why this, and why now

The engine is done and safe; what it lacks is a product around it. Every gap above is a direct consequence of the module having grown outward from the agent tools: the surfaces that exist are the ones a tool call needed, and the ones a _user_ needs — find, keep, share, retire, come back — were never designed. That shows up as a specific failure: the module's second job is undiscoverable, so most sessions end with an answer nobody kept.

Doing it now, before the module goes into apps at scale, matters because half of these decisions are **data-model decisions** (ownership, visibility, favourites, the conversation link) and every one of them is cheaper to make before reports exist in production stores than after.

## Current state

- `modules/reporting/pages/chat.yaml` — three `Box` columns at spans 5 / 12 / 7. `AgentConversations` with `items` from `list-conversations` (titles only, no timestamps, no search, no per-row actions); `AgentChat` with a two-line `welcome` mentioning the panel and the phrase "turn this into a report"; `onDataPart` routing `data-report-chart` / `data-report-download` into `_state: charts` / `downloads`; the whole results column `visible:` false until one of those arrays is non-empty; Tabs Charts / Downloads; download runs `query-data` then `DownloadCsv`. No collapse, no selection, no tables.
- `modules/reporting/pages/reports-list.yaml` — `List` of `Card`s with Open and Delete buttons and a description paragraph. No favourites, search, sort, paging, visibility or contents preview.
- `modules/reporting/api/generate-report.yaml` — inserts `{ _id, userId, title, description, spec, sourceConversationId: null, deleted: null, createdAt, updatedAt }`. The `sourceConversationId: null` carries a comment recording why: tool endpoints receive only the tool input, so the agent context (conversation id) does not reach them.
- `modules/reporting/api/list-reports.yaml` — own-only (`userId` match), `deleted.timestamp: { $exists: false }`, sort `updatedAt: -1`, `limit: 200`, projection `title/description/createdAt/updatedAt`. No scope, search, sort or cursor parameters.
- `modules/reporting/api/delete-report.yaml` — already a correct soft delete: owner-scoped, writes a `deleted` change stamp (`{ timestamp, user: { name, id } }`) inline, and excludes already-deleted docs so a repeat delete reports 0 modified rather than overwriting the original who/when.
- `modules/reporting/api/resolve-report.yaml` — loads the report matched on `_id` **and** `userId`, so today a report is readable only by its author; rejects on not-found (the `Dynamic` block renders its fallback), runs each query section through `AnalyticsPipeline` inside `:try`, compiles server-side.
- `docs/shared/soft-delete.md` — the repo idiom: field `deleted`, shape `{ timestamp, user: { name, id } }`, initialised `null`, read predicate `deleted.timestamp: { $exists: false }`. No module in this repo has an archive state.
- Conversations: `list-conversations`, `set-conversation-title`, `save-conversation`, `get-conversation-results`. **No delete of any kind.**
- `@lowdefy/blocks-antd-x` `AgentChat` — `messageParts.js` classifies only text / reasoning / tool / file / data-status and states outright that custom `data-*` parts are not handled inline; `schema.json` declares no block areas; `MessageBubble.js` renders Markdown and mermaid (11.16 via `@ant-design/x`, `renderMermaid` defaulting true).

## Key decisions and rationale

### The empty state teaches both jobs; a magic phrase teaches nobody

The current welcome names the panel and the phrase "turn this into a report", which only works for a user who reads it, remembers it, and types it later. Two tracks of starters make the report path a _thing you can click_, and the split itself is the teaching device: the left column is "ask a question", the right is "build a report". Starters fill the composer instead of sending, because a starter the user cannot edit is a demo, not a prompt.

Naming the collections the assistant can see (from the catalog's descriptions) is in the same spirit: the alternative is the "why can't it answer that?" dead end, which reads as the assistant being broken rather than the scope being bounded.

### Selection is the entry point to a report, and the panel's only marking affordance

Report creation stops depending on a phrase: the user ticks the results that answered the question and presses **Save as report**. Because selection carries that weight, nothing else on a result card competes with it for "this one matters" — expand, download and `⋯` all act on a single result. (An earlier revision had a ★ on each card to "mark a result to find later in this conversation"; it was removed as invented surface with no job — a conversation is short enough to scroll, and two marking affordances on one card make neither legible.)

### One confirm sheet, two routes into it

The sheet is a confirm, never a blank form: the assistant proposes the name, the sections and the candidate filters; the user edits. The typed path opens the same sheet pre-filled. One behaviour is worth more than two shortcuts — and the sheet's shape maps directly onto the report spec the module already persists, so nothing new has to be modelled.

### The transcript is prose; the panel is the artefact store — and that is a ceiling, not a preference

`AgentChat` cannot host a Lowdefy block, a button, or a link inside a message: `messageParts.js` handles only text / reasoning / tool / file / data-status parts and says custom `data-*` parts are not handled inline, and the block schema has no areas. So the panel is the **only** place an `EChart` can live, and the in-thread vocabulary is exactly markdown plus mermaid.

That makes the division of labour honest rather than aesthetic: a simple shape can be a real inline sketch through a mermaid `xychart-beta` or `pie` fence (it carries mermaid's own theme, square marks, no hover — which is why it stays a _sketch_), and the transcript hands off in prose to the panel for the full chart. The agent is prompted to skip the sketch entirely for anything multi-series or long-labelled. A `partRenderers`-style property on the block would remove the ceiling; until one exists, this is the shape of the surface.

### Tables are results

Only charts and downloads stream back today, so a tabular answer — the single most common useful result — is stranded in the transcript where it cannot be reused, reread, or saved into a report. A `data-report-table` part fixes it with no new machinery: the same `onDataPart` route, the same panel, the same selection.

### Three columns, both sides collapsible

Left is history, middle is now, right is what you produced. Both side panels collapse to strips (the rail to icons, the panel to counts) so the transcript can run full-width when the user is reading rather than producing, and the two collapses are mirror images so they read as one pattern. Collapse state is kept for the session and follows the user between pages ([why not persisted](#collapse-state-is-session-scoped-not-persisted)); on a narrow viewport both start collapsed. The expanded layout is 232px / fluid / 348px with a ~62ch measure on the middle column, which is the chat block's own `maxWidth` — so prose stays readable at any width.

### Private by default; publishing is role-gated, binary, and reversible

Most users should only ever see their own reports. A user holding any role in `share_roles` may publish one to the **whole app** — the same shape an existing app already uses for its saved exports (per-user documents matched on the creator's id, plus a curated set everyone can read).

Publishing is binary and reversible: `private` or `shared`, toggled in one place, with no per-person or per-team grants and no share links. Anything finer needs an access model this module does not have, and inventing one here would mean owning it forever. `share_roles` is plural because more than one role can legitimately carry the privilege; unset means the app has no publishing at all, and the control is then **absent** rather than disabled — a disabled toggle teaches a capability the user cannot have.

**Publish is independent of everything else.** Unpublishing does not archive, delete, unfavourite or move a report; it changes exactly one field. Conversely a deleted report cannot be published, because a deleted report is not readable at all.

### Ownership is enforced server-side, on every write

The menus differ between owner and non-owner, but the menu is not the boundary. Every write — rename, publish, unpublish, delete, restore, fix-a-section, and the continue-in-chat hand-back, which exposes the author's conversation — matches the caller against the report's owner in its own endpoint. A hidden menu item is a UX affordance; the match is the authorization.

Likewise the list's **scope match is the authorization boundary**, which is exactly why the scope has to be a server parameter rather than a client-side filter over an "everything" response.

### Soft delete is the only retirement

The wireframes originally carried both archive and delete. They collapsed to one because no module in this repo has an archive state, and the established idiom is a `deleted` change stamp with reads filtering `deleted.timestamp: { $exists: false }`. Two retirement acts would mean two states to reconcile against visibility (is an archived-but-published report visible? to whom?), a fourth list scope to explain, and a second thing to test.

One soft delete also buys a consequence for free: because every read filters the stamp, deleting a published report removes it from everyone's Shared scope without a separate unpublish step.

**Nothing in this module hard-deletes.** The delete confirm says so — "nothing is queried again and no data is touched" — because "Delete" over a data tool reads as destructive and the reassurance is true: the module never writes to the source collections at all.

### Recovery is a page, not a scope; restore returns a report to private

Deleted reports are recoverable, but recovery is not part of anyone's daily loop, so it is a footer link to a small page rather than a fourth tab beside three the user picks between daily. Server-side it is `list-reports` with `scope: deleted`, still owner-matched — you never see anyone else's deleted reports, including ones that were published to you. The page shows the stamp's who/when, because a recovery screen that omits it makes the user guess whether they are looking at their own mistake.

**Restore always writes `visibility: private`** in the same update that clears the marker. Silently re-publishing something deleted months ago would hand it back to the whole app before anyone re-read the numbers. Republishing is one deliberate click afterwards. (Reversing this — restoring the previous audience exactly — is a one-line change if a real case argues for it.)

There is no permanent-delete action anywhere, and adding one would be the single irreversible act in an otherwise recoverable system.

### Favourites are per-user

A ★ on a shared report must not be everyone's ★, so favourites are stored as `favourite_of: [userId]` on the report doc and projected to a boolean for the caller. They are a read-side marker, so they work on reports you do not own, and they drive both the Favourites scope and the default sort.

The array is the right shape at module scale — the Favourites query is a single `favourite_of: <userId>` match. If an app ever has hundreds of users favouriting one report, the array becomes a hot document and the answer is a `report_favourites` join collection; that is a mechanical swap behind the same two endpoints.

### Export belongs to a section, not to a report

`export-data` validates a single `{ collection, pipeline }`, and a CSV's headers are that one result's row keys. A report holds several sections over different collections and grains, so a report-level "Export" has no answer to "export what?" — it would either silently pick a section or invent a multi-sheet format the module cannot produce. Each query-backed section carries its own `⤓`; a KPI (one number, already on screen) carries none. This is also why the list rows have no Export: you open the report and download the section you meant.

### Non-owners get read-plus-duplicate

Open, favourite, download a section, duplicate — and the edit actions are _absent_, not disabled. **Duplicate** is the escape hatch that makes this comfortable: rather than a request-access dance, copy a shared report into your own and change it freely. The copy is always private and owned by the copier; the original is untouched.

### The report ↔ chat link, and the one thing that blocks it

"Continue in chat" and "Open source chat" both need `conversationId` on the report doc. The existing `generate-report` endpoint cannot supply it — its comment records why: tool endpoints receive only the tool input, so the agent's conversation context never reaches them.

The new `create-report` endpoint **can**, because the sheet is a page calling `CallAPI` where `_state: conversationId` is in hand. So the link is populated on the sheet path (which is now the primary path) and absent on the tool path. The UI must therefore treat it as **optional**: no `conversationId`, no continue-in-chat affordance — not a broken button. This is a reason to prefer the sheet path, not a blocker for either.

## Block feasibility

Every surface in the plates was checked against the blocks the demo actually installs — `@lowdefy/blocks-antd`, `-basic`, `-antd-x`, `-echarts`, `-aggrid`, and this repo's plugin blocks — reading the block source, not the docs. [`wireframes-blocks.html`](wireframes-blocks.html) redraws all six plates as they land in real blocks, annotated with the block behind each region; this section is the summary and the decisions that came out of it.

**The verdict: one required block change, one optional one, and three places where the drawing bends.** The required change is a `setInput` method on `AgentChat`, without which the empty state cannot teach the report path. The optional one is a `menu` cell for `AgGridBalham`, which restores plate 4's kebab popover and which every list page in this repo would use.

### The one thing the blocks cannot do: fill the composer

A starter that **fills** the composer instead of sending it (plate 1, callout 3) is not reachable from config. `AgentChat`'s prompt handler calls `sendMessage({ text })` directly, the `@ant-design/x` `Sender` is mounted uncontrolled (a ref, cleared after send — no `value` prop), and the block's registered methods are `regenerate`, `setMessages`, `sendMessage`, `clearMessages`, `deleteMessage`, `stop`, `clearError`, `scrollToBottom`. None of them writes the input.

The fix is a **`setInput` method on `AgentChat`**: make the `Sender` controlled from local state and register the setter. It is small, and the package is already patched in this repo (`patches/@lowdefy__blocks-antd-x.patch`, which keys `useChat` by conversation), so patch-then-upstream is a proven path here.

That one method also settles the **two-track welcome**. `welcome` takes `{ title, description, icon, prompts[], variant }` and the block flattens `prompts` into a single row, mapping only `key` / `label` / `description` — the `children` that `@ant-design/x` uses for grouped columns are dropped, and the block declares no areas, so nothing can be composed inside it. Rather than grow the `welcome` schema, **leave `welcome` unset and render the empty state as ordinary blocks above the chat**, shown while `messages` is empty: two `Box` tracks, `Title` / `Paragraph` copy, starter chips as `Button`s calling `setInput`. That is more layout freedom than the schema would ever have given, and it is only viable because `setInput` exists. One change, both callouts.

### What the blocks already do, unchanged

The conversation rail carries more than the current page uses. `AgentConversations` takes a per-item `menu` and fires `onMenuClick` with the action key and the conversation key — that is rename and soft delete, with `danger: true` on the delete item. Recency grouping is `group` plus `timestamp` on each item with the `groupable` property, and group order follows first appearance in `items` (verified in `@ant-design/x`'s `useGroupable` — a plain reduce, no alphabetical sort), so ordering the items by recency yields Today → Previous 7 days → Older with no sort hook. There is no search property, but `items` is config-driven, so a `Search` block above the rail filtering the array _is_ the feature.

The results panel is all existing blocks: `SegmentedSelector` for All / Charts / Tables / Exports, a `List` of `Card`s, `CheckboxSwitch` bound to `charts.$.selected` for selection, `Modal` for expand, `AgGridBalham` for a table result, `EChart` for a chart, and the `ScrollTo` action for "the panel scrolls to the newest card". The save sheet is `Modal` + `TextInput` + `ControlledList` + `CheckboxSwitch` + `Selector` + `SegmentedSelector`. `MultipleSelector` supports `{ label, value }` options and tag display natively, so plate 6's filter tags are compiler work, not block work.

### Where the drawing bends

1. **Drag-to-reorder becomes ↑ / ↓.** No block does drag reordering. `ControlledList` registers `moveItemUp(index)`, `moveItemDown(index)` and `removeItem(index)` as `CallMethod` targets, which is the whole job for a list that is typically two to four rows. A sortable list is not worth a block for this.
2. **The trace line's title is the tool name.** A tool call renders as a `ThoughtChain` item whose title is hard-coded to the raw tool name. The _description_ is authorable: when a tool returns `{ display: "…" }` the description becomes its first 80 characters and the full `display` markdown renders behind the collapse. So "4,812 rows · 0.4s" and "expanding shows the pipeline" are both real; "Read **orders**" as the heading is not, and `query_data` is an honest enough label to accept.
3. **The reports list's row menu opens a `Modal` until a menu cell exists.** See [the reports list is a grid](#the-reports-list-is-a-grid-like-every-other-list-in-this-repo) — every column of plate 4 has a cell type except the kebab, and a dropdown cell is the one thing the grid has no renderer for.

### The reports list is a grid, like every other list in this repo

Every module list here — contacts, companies, activities, user-admin — is an `AgGridBalham` with `onRowClick` into a `Link` and built-in cells doing the display work. The reports list is the same kind of thing, so it is the same block, and the cells cover plate 4 almost completely:

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

**Visibility stays a read-only `tag`** for the same reason in reverse: a two-option `selector` on every row would make publishing to the whole app a single mis-click on a list, where the design deliberately makes it a named act. The capability existing is not an argument for using it.

**So the one real gap is a `menu` cell** — an antd `Dropdown` whose `items[]` each carry an `eventName`, with the `*Field` row-data resolution, `hidden` / `disabled` and `danger` that `ButtonsCell` already implements. It is a small, generic addition in the same shape as PR 2201, it belongs upstream because every list page in this repo will eventually want it, and it is the natural companion PR to the one that added these cells.

Until it exists, the kebab is a single `⋯` button in a `buttons` cell opening a `Modal` of actions — the owner's five and the non-owner's two, chosen by `hiddenField` on the row's `isOwner`. That is a worse popover, not a worse feature, and swapping it for the cell later touches one column definition.

### Collapse state is session-scoped, not persisted

There is no client-storage action — the set is `CallAPI`, `CallMethod`, `CopyToClipboard`, `DisplayMessage`, `Fetch`, `Link`, `Login`, `Logout`, `Publish`, `Request`, `Reset`, `ResetValidation`, `ScrollTo`, `SetDarkMode`, `SetFocus`, `SetGlobal`, `SetLocale`, `SetState`, `Subscribe`, `Throw`, `Unsubscribe`, `UpdateSession`, `Validate`, `Wait` — and `SetGlobal` lives in memory for the session, not across reloads. So persisting the collapse per user, as plate 2's callout 1 draws it, costs a `ui_state` document and a write per toggle, for a preference that is re-expressed with one click.

**Decision: `SetGlobal`, session-scoped, with both panels collapsed by default on a narrow viewport.** The state follows the user between the chat, list and report pages within a session and resets on reload. If a real complaint appears, the endpoint is a later, additive change — nothing about the UI has to move.

`AgentConversations` also has no collapsed mode of its own, so the rail's icon strip is a `Box` of `Button`s shown when the rail is hidden. The antd `Splitter` block — per-panel `collapsible` and `resizable` with an `onCollapse` event — could carry both edges instead, and is worth a look at build time if the hand-rolled strips read as two features rather than one pattern.

### The filter row says nothing about what it scopes

**Open, and the one UX problem the report page currently has.** `compileReport` collects every filter control into a single full-width row at the top of the report, regardless of where its filter sections sit in the spec. Nothing on a control indicates which sections subscribe to it. Since `filterBy` is per-section, a report can carry two independent filter groups — one over orders, one over activities — and selecting a control in the first moves nothing a viewer happens to be looking at.

Found in manual testing of the report-filters demo: a company multi-select whose only bound sections were two tables below the fold read as a **broken filter**, and stayed convincing enough to survive a full trace through the compiled config, the payload, the server-built `$match`, the operator semantics, and the block source before the actual cause — nothing bound to it was on screen — became clear. If it fooled the person who wrote the compiler, it will fool a user. The demo report now works around it by hand, giving every filter at least one bound KPI or chart, but an agent-authored report has no such guarantee: the agent chooses `filterBy` per section, and nothing stops it binding a filter only to a table at the bottom.

This is deliberately left open rather than decided here, because the plates do not draw a multi-group report and the right answer depends on what plate 6 becomes. Three candidates, in increasing cost:

1. **Name the scope in the control's title** — `Companies (activities)`. One line in `compileReport`, no layout change, but it duplicates section labels into the control and grows with the number of bound sections.
2. **Group the filter row by bound section set** — one sub-row per distinct group, each labelled with what it drives. Keeps filters together at the top; reads oddly when groups overlap partially (a filter bound to two of three sections).
3. **Render each filter beside the sections it drives** — abandons the single row, which is the honest fix and the largest change: filters stop being page furniture and become part of a section group.

Whichever wins, the failure it prevents is a viewer concluding the feature is broken, so a decision should not wait for a complaint — by construction the complaint reads as a bug report about filters, not about layout.

### The `Dynamic` types list is a whole-report failure mode

The report page compiles server-side into a `Dynamic` block, and **an undeclared block, action or operator type fails the entire report to the fallback slot** — not the one section that used it. Plate 6 adds Fix-in-chat and Remove-section inside compiled sections, so `types.actions` needs `Link` alongside the existing `CallAPI` / `SetState` / `DownloadCsv`, and `Modal` joins `types.blocks` if per-section expand is compiled rather than rendered by the page. Any compiler change that emits a new block type has to land with its declaration in the same commit.

## Data model

Additions to the report document (existing fields unchanged):

| Field            | Type                    | Notes                                                                  |
| ---------------- | ----------------------- | ---------------------------------------------------------------------- |
| `visibility`     | `"private" \| "shared"` | Defaults `private`. Only a `share_roles` holder may set `shared`.      |
| `favourite_of`   | `string[]`              | User ids; projected to a boolean for the caller. Defaults `[]`.        |
| `conversationId` | `string \| null`        | Replaces/renames `sourceConversationId`; populated by `create-report`. |

Unchanged and load-bearing: `userId` (the owner; every scope and mutation matches it), `deleted` (`null`, or the change stamp), `createdAt` / `updatedAt`, `spec`.

Conversation documents gain `deleted` (same stamp shape, initialised `null`) and an `updated` timestamp for recency grouping.

## Endpoints

| Endpoint                | Status  | Shape                                                                                                                                                                                                                  |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-report`         | new     | `{ spec, conversationId }` → validate, insert, return `{ reportId, url }`. Called by the sheet.                                                                                                                        |
| `list-reports`          | rewrite | `{ scope: mine \| shared \| favourites \| deleted, search?, sort?, cursor? }`; scope match is the authz boundary. Returns display fields plus section-type counts, filter count, visibility, publisher, `isFavourite`. |
| `set-report-visibility` | new     | `{ reportId, visibility }` — owner-checked **and** role-checked, both directions.                                                                                                                                      |
| `set-report-favourite`  | new     | `{ reportId, favourite }` — `$addToSet` / `$pull` on `favourite_of`. Readable-report check, not owner.                                                                                                                 |
| `set-report-title`      | new     | `{ reportId, title }` — owner-only.                                                                                                                                                                                    |
| `duplicate-report`      | new     | `{ reportId }` → new doc, `visibility: private`, owner = caller, `favourite_of: []`. Readable-report check.                                                                                                            |
| `restore-report`        | new     | `{ reportId }` — owner-only; clears `deleted` and sets `visibility: private` in one update.                                                                                                                            |
| `delete-report`         | keep    | Already a correct owner-scoped soft delete.                                                                                                                                                                            |
| `resolve-report`        | change  | Read match becomes `_id` + not-deleted + (`userId` = caller **or** `visibility: "shared"`); returns whether the viewer is the owner so the page can render owner-only actions.                                         |
| `list-conversations`    | change  | Own-only, returns `updated` and a snippet; excludes soft-deleted.                                                                                                                                                      |
| `delete-conversation`   | new     | Soft, owner-scoped, same stamp shape.                                                                                                                                                                                  |
| `emit-data-parts`       | change  | Emits `data-report-table` alongside chart and download.                                                                                                                                                                |

## Vars

`share_roles` (string array) is the only var this design _requires_. Candidates for app-specific copy, all optional: `welcome_title`, `starters_explore`, `starters_report`. The collection names in the welcome and the fields the save sheet offers both derive from the catalog — no var for either.

## Files changed (anticipated)

- `modules/reporting/pages/chat.yaml` — fixed rail/panel widths with a fluid measure-capped middle; both panels collapsible with session-scoped state; panel visible-when-empty; starter chips filling the composer; the table part routed into a new state array; result selection and the Save-as-report action.
- `modules/reporting/pages/reports-list.yaml` — rebuilt as an `AgGridBalham` with toolbar (scope segmented control, search, sort), `buttons` / `tag` / `date` cells, the row action menu, footer recovery link, and the empty/zero-result states.
- `modules/reporting/pages/report.yaml` — provenance line, per-section `⤓`, Continue-in-chat (owner-only, conditional on `conversationId`), owner-only section recoveries.
- New `modules/reporting/pages/reports-deleted.yaml` — the recovery page.
- New `modules/reporting/pages/components/save_report_sheet.yaml` — the confirm sheet, opened by both routes.
- `modules/reporting/api/` — new `create-report`, `set-report-visibility`, `set-report-favourite`, `set-report-title`, `duplicate-report`, `restore-report`, `delete-conversation`; rewritten `list-reports`; changed `resolve-report`, `list-conversations`, `emit-data-parts`.
- `modules/reporting/agents/reporting-assistant.yaml` — the mermaid-sketch prompt and the table-part contract, plus a `display` string on the query tool's output so the trace line reads as a summary rather than a key list.
- `patches/@lowdefy__blocks-antd-x.patch` — the `setInput` method on `AgentChat` (controlled `Sender` plus `registerMethod`), to be upstreamed. The only block change the deck requires.
- `modules/reporting/module.lowdefy.yaml` — `share_roles` and the copy vars, with full `description`/`type`/`default` per var (then `pnpm docs:gen`).
- `apps/demo/` — see below.
- `docs/reporting/` — the index's surfaces table, a how-to for the save-as-report flow, a concepts page for ownership/visibility/retirement, and regenerated `reference/vars.md`.

## Demo consumers

Every new capability needs a build-verified example in `apps/demo/`:

- Seeded reports covering **private, shared, and favourited**, with at least one owned by a **second user** so the non-owner view (read-plus-duplicate, absent edit actions, "Published by") is actually exercised.
- One report carrying `conversationId` so Continue-in-chat resolves, and one without so the affordance's absence is exercised too.
- `share_roles` set on the demo module entry, and a demo user holding the role plus one who does not.
- Starter prompts and welcome copy on the demo entry.
- At least one soft-deleted report so the recovery page renders with a real stamp.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Deviations from the wireframes

Recorded here so the plates can stay as drawn.

1. **"Last ran" is not persisted.** Plate 4's list mentions when a report last ran. Persisting `lastRunAt` means a write on every report open, for a fact that is really "last opened". The list column shows `updatedAt` (when the spec last changed); the report header states the run time at resolve, which is free and honest. Plate 4's column label should read _Updated_.
2. **The read predicate is `deleted.timestamp: { $exists: false }`**, not `deleted: null` as the plates' notes phrase it. The plates describe the idiom loosely; `docs/shared/soft-delete.md` is canonical, and it treats a document as live whether `deleted` is absent, null, or an object without a timestamp.
3. **`conversationId` is optional in the UI.** The plates show Continue-in-chat unconditionally; it is absent on reports created through the agent tool path (see [the report ↔ chat link](#the-report--chat-link-and-the-one-thing-that-blocks-it)).
4. **Sections reorder with ↑ / ↓, not a drag handle.** Plate 3 draws `⣿` grips. No block does drag reordering; `ControlledList` exposes `moveItemUp` / `moveItemDown` / `removeItem` as methods. See [Block feasibility](#block-feasibility).
5. **The tool trace line is titled with the tool name.** Plate 2's `Read orders · 4,812 rows · 0.4s` becomes a `query_data` heading with the row count and duration as its description, and the pipeline behind the collapse.
6. **Collapse state is session-scoped**, not persisted per user as plate 2's callout 1 draws it. No client storage action exists; the decision and its escape hatch are in [Block feasibility](#collapse-state-is-session-scoped-not-persisted).
7. **The row kebab opens a `Modal`, not a popover.** Plate 4 draws a dropdown; `AgGridBalham` has a cell type for every other column but none for a menu. A `menu` cell upstream restores the popover — [why](#the-reports-list-is-a-grid-like-every-other-list-in-this-repo).

## Resolved questions

Resolved 2026-07-29.

1. **Can a chart, button or link live inside a chat bubble?** No. `AgentChat` handles only text / reasoning / tool / file / data-status parts, explicitly not custom `data-*` parts, and its schema has no block areas. Mermaid + markdown are the whole in-thread vocabulary; the panel is the only home for an `EChart`.
2. **Archive or delete?** Delete only. No module in this repo has an archive state, and the soft-delete stamp is the established idiom.
3. **Is a report-level Export possible?** Not meaningfully — `export-data` validates one `{ collection, pipeline }` and CSV headers are that result's row keys. Export is per section.
4. **Can the agent's `generate_report` populate the conversation link?** No — tool endpoints receive only the tool input; the existing code comments this. The page-side `create-report` can, which is one more reason the sheet is the primary path.
5. **Does reporting already soft-delete correctly?** Reports yes (`delete-report` writes the stamp, owner-scoped, and won't overwrite an existing one). Conversations have no delete at all, so that endpoint is new.
6. **Can reporting reuse the events module's `change_stamp` component?** No — reporting declares no dependencies, so it writes the identical stamp shape inline. Already true of `delete-report`; keep it for the new writers.
7. **Where does the publish capability come from?** A `share_roles` string array var, checked server-side on `set-report-visibility`. Modelled on an existing app's saved-exports pattern: per-user documents matched on the creator's id, plus a set everyone can read.

Resolved 2026-07-30, from reading the installed block source ([Block feasibility](#block-feasibility)).

8. **Can a starter fill the composer instead of sending it?** Not today, and it is the only hard blocker in the deck. The `Sender` is uncontrolled and no block method writes the input — it needs a `setInput` method on `AgentChat`.
9. **Can the welcome show two tracks?** Not inside the block: `welcome.prompts` is flattened to one row and `AgentChat` has no areas. Render the empty state as ordinary blocks above the chat with `welcome` unset — which needs `setInput` to be worth anything, so it is the same change.
10. **Can the rail group by recency, rename and delete?** Yes, all three, with no block change: item `group` / `timestamp` plus `groupable`, and a per-item `menu` firing `onMenuClick`. Group order follows item order, so sorting by recency is the whole implementation. Search is a `Search` block above it filtering `items`.
11. **Can sections be dragged to reorder?** No. `ControlledList` moves items by method call; ↑ / ↓ is the shape.
12. **Can UI state persist across reloads?** No client-storage action exists, and `SetGlobal` is session-memory. Session-scoped is the decision; a `ui_state` document is the additive fallback.
13. **Does the reports table use AgGrid, and do the new input cells help?** Yes to the grid — it is the pattern every other module list here follows, and the built-in cells cover every column but the kebab (`tag` renders an array as multiple pills; `buttons` takes a per-row `iconField` for the ★). The `selector` / `switch` / `textInput` / `paragraphInput` cells from PR 2201 are already on `vite-hono` and in the installed build, so there is nothing to port — but they are the wrong tool for a row menu, and an inline visibility selector would make publishing a mis-click. The gap is a `menu` cell; the interim is `⋯` opening a `Modal`.

## Non-goals

- **Any change to the query engine, the catalog, the allowlists, or the read-only principal.** Nothing here widens what can be queried.
- **A report builder UI.** Reports are made in the chat; the list's "New report" leads there with the report track pre-selected.
- **Editing a report's sections outside chat** beyond rename, drop-a-section, and duplicate. Re-deriving a spec is the assistant's job.
- **Per-user or per-team sharing, groups, share links, or request-access flows.** Two states, plus duplicate.
- **Notifications** of any kind — including "request a fix" on a broken section a non-owner can see.
- **A purge / permanent delete.**
- **Scheduled or emailed reports.**
- **Filter mechanics** — see [`report-filters`](../report-filters/design.md). Filter _placement_ is in scope; see [the filter row says nothing about what it scopes](#the-filter-row-says-nothing-about-what-it-scopes).

## Risks

- **Scope creep into an access model.** "Everyone in the app" will eventually meet a team that wants "just finance". The mitigation is that visibility is one field and one endpoint, so a future model replaces it rather than growing around it — but the pressure is real and should be refused until an app actually needs it.
- **The list endpoint carries the authorization boundary.** Scope, search, sort and paging all now happen server-side, which is correct, but it means a bug in the scope match is a confidentiality bug rather than a display bug. It needs tests per scope, including "shared" excluding deleted and "deleted" being owner-only.
- **Two creation paths for reports** (the sheet and the agent tool) means two callers of the same validation. Contained by both going through `validateReportSpec` and one insert shape, but the tool path's missing `conversationId` is a real, permanent asymmetry.
- **`favourite_of` on the report doc** is a shared-document write per favourite. Fine at module scale, hot at hundreds of users per report; the join-collection swap is known but unbuilt.
- **The `setInput` patch is ours until it is upstreamed.** The deck's discoverability story rests on one method that does not exist in a released block, carried as a patch on `@lowdefy/blocks-antd-x`. A version bump that reworks `AgentChat`'s sender re-opens it. Contained by the patch being small and by the same package already carrying one. The `AgGridBalham` `menu` cell is the second upstream ask but not a risk: the list ships with `⋯` opening a `Modal` and swaps to the cell in one column definition.
- **Restore-to-private will occasionally annoy** someone who deliberately deleted a published report and wanted it back exactly as it was. Accepted: the failure mode in the other direction is republishing to the whole app without anyone re-reading the numbers.

## Related

- [`designs/reporting/report-filters/design.md`](../report-filters/design.md) — multi-select, array-field semantics, and looked-up filter options (plates 3 and 6).
- [`designs/reporting/open-query-engine/design.md`](../open-query-engine/design.md) — the engine, the presentation contract, and the two-layer security model this design does not touch.
- [`wireframes.html`](wireframes.html) — the six plates, with per-plate callout notes and a closing table mapping every proposal to the files it lands in.
- [`wireframes-blocks.html`](wireframes-blocks.html) — the same six surfaces redrawn as they land in real Lowdefy blocks, with every region labelled by the block behind it and the deviations marked where the build differs from the drawing.
- `docs/shared/soft-delete.md` — the retirement idiom.
