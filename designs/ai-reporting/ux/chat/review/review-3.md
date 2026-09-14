# Review 3

A read of the design after review 2's findings were resolved, focused on what moved this round: the
agent read-path budget and the endpoint split, the table part's re-pricing, the part `id`/`created`
minting, the rail's 200 cap, and the per-writer `$setOnInsert` split.

The `$setOnInsert` split, the minting decision and the `created` shape all hold up — checked and
listed at the end. The findings are concentrated in one place: the size argument the last round
introduced covers one of the two paths that writes rows into the conversation document, and the
table part quietly needs the other one.

### 1. The 200 KB budget covers the agent's query and not the one that writes rows into `data_parts`

> **Resolved — bound the part's width, not the chart's fetch.** The finding holds and the
> "fifty of them are kilobytes" sentence is corrected: a chart part was as large as its query
> result, and `MAX_DATA_PARTS_SPECS` allows eight per turn.
>
> The fix is not the symmetric one this finding proposes. Reading `buildEChartsOption` showed the
> series `encode` only ever reads `x` and the `y` columns, and `compileReport.js:526` replaces
> `dataset.source` wholesale when a saved section re-queries — so projecting each row to
> `[x, …y]` before it becomes the source is lossless in both directions and bounds the part by its
> own presentation contract rather than by its query. That is the structural fix, and it makes a
> tighter budget on the _fetch_ actively harmful: a `$$ROOT` pipeline charting two of its fields is
> fat to fetch and tiny to persist, the agent's turn is over so it cannot narrow anything, and
> `emit-data-parts`' `:catch` logs and skips — so the tight number would silently lose charts whose
> parts would have been small. The chart and table fetches keep the 8 MB app-memory backstop.
>
> Design now carries the projection rule, the corrected cap paragraph, resolved question 14, and a
> risk stating that per-item bounds still multiply by turn count — the ceiling is bounded, not
> closed.

The decision to budget the agent's read path (the transcript's size is fixed where the rows enter)
closes the `messages` path. There is a second path into the same document, at the same 8 MB, and this
round left it open while removing the cap that was nominally covering it.

`emit-data-parts.yaml:56-65` runs each chart's query itself, as an `AnalyticsPipeline` step with only
`query` and `roles` set — so it takes `connection.maxResultBytes`, which is 8 MB
(`connections/ReportingData/schema.js:39-48`). Those rows then go **into the part**:
`buildDataParts.js:64-65` builds the part as
`data: { title, option: buildEChartsOption({ chart, x, y, rows }) }`, and `buildEChartsOption.js:18`
and `:32` set `dataset: { source }` where `source = rows ?? []` — the query's whole row array, baked
into the persisted option. Nothing bounds the row count: `validateChartSpec` length-caps the label
strings and the `y` array and says the presentation contract is "inert data", with no row assertion.

So a chart part is as large as its query result, up to 8 MB, and `MAX_DATA_PARTS_SPECS = 8`
(`constants.js:12`) permits eight of them per turn in one `$push`. Two fat charts in a **single turn**
exceed 16 MB on `data_parts` alone — the same silent loss the design documents, this time taking the
whole turn's charts and downloads with it.

This also falsifies the claim that now justifies the parts cap. "A part is a title, a baked option and
a small spec; fifty of them are kilobytes" (the array is bounded on write, for panel length rather
than for size) is true only for narrow chart data. Fifty parts each carrying a thousand wide rows is
not kilobytes, and `$slice: -50` bounds the count, never the size.

**Fix:** apply the same budget at both entries, not one — the `AnalyticsPipeline` steps inside
`emit-data-parts` need the tighter number too, since their output is persisted rather than merely
displayed. A chart's `dataset.source` genuinely is the artefact, so the bound here is probably a row
cap rather than only a byte cap (a chart with a thousand categories is unreadable long before it is
expensive). Either way, correct the "fifty of them are kilobytes" sentence — as written it argues the
parts array needs no size bound at all, which is the opposite of what this path shows.

### 2. The table part has no rows, and both ways of giving it rows contradict a decision this design just made

> **Resolved — freeze, projected and capped.** The part becomes
> `{ id, created, title, rows, row_count, spec: { query, columns } }`: `rows` is the table's
> equivalent of the chart's baked option, projected to the declared `spec.columns` by the same rule
> as finding 1's chart fix and capped at **200 rows**, with `row_count` keeping the true total so
> the card reads _first 200 of 964 rows_. Re-query-on-open is rejected for the reason the design
> already gives — a table under prose quoting its cells is the same hazard as a chart, arguably
> sharper.
>
> Two things made the freeze cheap. Column definitions live in `spec.columns`, which
> save-as-report needs anyway, so the part carries one copy rather than two. And `compileReport`'s
> `sectionHeading` already writes honest truncation copy ("— first 1000 rows", because "a table
> silently showing its first 1000 rows reads as the complete answer"), so the card's wording is an
> existing idiom rather than a new one. `export_data` remains the affordance for the whole result.
>
> The finding also surfaced production work the design had not named: `emit-data-parts` must run
> each table spec's query in a second `:for`, and `buildDataParts` takes `tables` / `tableResults`
> beside `charts` / `results`. Both are now in "Tables are results" and the files list. A demo
> consumer producing a >200-row table is added, since the truncation copy would otherwise ship
> unread.

The artefact-store section says the table part "carries `{ query, columns }` on the same rule" as the
chart part. But the chart part carries `{ title, option, spec }`, and the `option` **is** the frozen
data — `dataset.source` is the row array. `{ query, columns }` has no data in it at all, so nothing in
the design says where the `AgGridBalham` in the panel gets its rows, live or reopened.

Both available answers collide with something already decided:

- **Freeze the rows into the part**, as charts do. Consistent with "Reopening a conversation shows the
  numbers from that turn, not today's" — and it puts a bulk row array into `data_parts`, which is
  precisely the weight the new read-path budget exists to keep out of this document. A table is the
  shape most likely to be wide and long, so this is finding 1 again, on the part type that has no
  reason to be small.
- **Re-run the query on open.** Cheap, and directly rejected by the same section: "a chart sits
  directly under prose quoting its numbers, so a chart that silently re-runs makes the paragraph above
  it wrong. A transcript that edits itself is not a transcript." A table under the same prose is no
  different — arguably worse, since a reader compares individual cells.

Exports escape the dilemma because a download is explicitly a fetch-now action, not a rendered
artefact; a table is rendered, so it does not inherit that exemption.

**Fix:** decide it, and say so where the part shape is defined. Freezing with a row cap looks right —
the panel shows the turn's numbers, the part stays bounded, and the card says what it is showing when
the cap binds ("first 100 of 4,812 rows"). That also gives `render-table` something to specify beyond
the column contract, which is currently the only thing named for it.

### 3. Nothing tells the agent that its result was bounded, and both bounds are new copy this design owns

> **Resolved — the `display` string says so; the byte budget still throws.**
> `display` now has a specified content: the row count, an explicit note that the trailing
> `$limit: 1000` bound it when `rows.length >= PIPELINE_RESULT_CAP`, and the duration from a
> `_date: now` either side of the step (the design promised "0.4s" and named no source). The
> precedent is in the repo: `compileReport`'s `sectionHeading` already heads a capped section
> "— first 1000 rows" for exactly this reason, so this is the same sentence written for the model.
>
> **Truncate-with-remainder is weighed and rejected.** Stating the remainder means draining the
> cursor past the budget, and a silently shortened aggregation is a wrong answer that looks
> complete — a top-N by group cut mid-stream is not "most of" the answer. The throw is also the
> engine's existing behaviour, shared with `query-data` and the report paths, so truncating would
> add a second drain path in the one place the memory bound is enforced, to soften a failure the
> agent can already recover from inside the turn.
>
> `4,812 rows` corrected to `842` in the trace-line section. Deviation 1 keeps the number because it
> is quoting what plate 2 draws, which is a fact about the wireframe.

Two mechanisms cut a query result down, and neither reports itself to the model.

`PIPELINE_RESULT_CAP = 1000` is appended as a trailing `$limit` on every pipeline
(`constants.js:112`) — silently. An agent that receives exactly 1000 rows cannot tell whether that is
the answer or the ceiling, so "you have 1,000 customers" is a sentence this assistant can write about
a collection of forty thousand. That is pre-existing, but this design is the first to author a
`display` string on the query tool, which is exactly the vehicle for saying so.

The new 200 KB budget fails the other way: `AnalyticsPipeline.js:133-146` throws mid-drain. The design
argues that is the right nudge and the codebase supports the mechanism — `buildAgentTools.js:82-88`
rethrows the endpoint's own error message, which is why `render-chart` and `generate-report` both
document "the tool call fails with the validator's actionable message". So recovery is real. What is
missing is the alternative it was never weighed against: for a model-facing read, a **truncating**
bound with a stated remainder is non-fatal and self-describing, where a throw costs a round trip and
relies on the model choosing to narrow rather than retry the same thing.

There is a smaller factual snag in the same area. The trace line's title is the tool name section and
deviation 1 both keep the wireframe's `4,812 rows` as the example description, and 4,812 rows cannot
happen — the cap is 1,000. Worth fixing so nobody builds copy against an unreachable number.

**Fix:** state what `display` says in each case — the row count, whether the cap bound it, and the
duration (the design promises "0.4s" but names no timing source; two `_date: now` reads around the
step is the obvious one, and it should be stated). Then decide throw-versus-truncate for the byte
budget with the truncation option actually on the table.

### 4. The endpoint-authored budget property is a plugin change where the connection schema already offers a config-only route

> **Resolved — the request property stands, and the alternative is now recorded with it.** The
> finding overstates one cost: `AnalyticsPipeline.schema = {}` deliberately, and the header says why
> ("the pipeline is validated by validatePipeline, so no property schema is needed"), so there is no
> request schema to author or test — the budget is one key read off `request` beside `query`,
> `roles` and `filters`.
>
> The second connection loses on the module's own recorded hazard rather than on elegance:
> `reporting-data.yaml`'s header states that a consumer remapping the connection "replaces this
> definition entirely — it must re-bind BOTH the catalog and a read-only principal". A second
> connection doubles that, and adds a second remappable name to the manifest's `connections:` list
> which can then drift from the first while both are meant to reach the same data through the same
> catalog. A budget is also a request-shaped fact — it describes what this caller does with the
> rows, not which database the module points at. `connection.maxResultBytes` stays the fallback.

The files list adds a request property to
`plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/` so "the two read
paths can differ". That works, and it is the more elegant shape. It is also plugin source, a request
schema, tests and a rebuilt `dist` — where the same difference is already expressible in config.

`maxResultBytes` is a **connection** property today (`schema.js:39-48`, default 8000000), and
`AnalyticsPipeline.js:133` reads `connection.maxResultBytes ?? MAX_RESULT_BYTES`. A second
`reporting-data-agent` connection — same `databaseUri` secret, same `_module.var: catalog`, tighter
`maxResultBytes` — gives `query-data-tool` its budget with no plugin change at all, and the catalog
cannot drift between them because both read the same var.

The costs are real on that side too and worth stating rather than assuming: one more entry in the
manifest's `connections:` list is one more name a consumer may remap (`module.lowdefy.yaml:34-42`),
and two connection configs to the same database is a duplication someone will eventually have to keep
in step.

**Fix:** weigh the two explicitly and record the loser. If the request property wins, the reason is
worth writing down, because "we added a plugin property for a number the connection schema already
had" is the first question a reader of that diff will ask.

### 5. The rail's snippet has nowhere to render

> **Resolved — snippet dropped, per-item timestamps demoted to a deviation.** Confirmed against the
> installed block: the item schema is exactly `key` / `label` / `icon` / `disabled` / `timestamp` /
> `group`, `AgentConversations.js` passes `items` straight through, and nothing in the block reads
> `timestamp` — grouping runs off the `group` string alone.
>
> One correction to the finding's framing, which changes the reasoning but not the outcome: the
> wireframe's endpoints table asks for the snippet "for search", not for display. So the question
> was whether it should widen what search _matches_, and the answer is still no — the title is
> AI-derived from the conversation's opening turn, making a first-message snippet near-duplicate
> search surface, and a match on text the user cannot see is a result they cannot explain (searching
> "refunds" and being handed "Q3 review" reads as a bug). Content search stays the additive
> server-side `$match` the window decision already reserves.
>
> The opening bullet no longer lists timestamps as a gap this design closes, and deviation 3 records
> both: recency arrives as the three group headings, search matches titles.

`list-conversations` is specified to return "`updated` and a snippet", in the endpoints table and the
files list. `updated` earns its place — the sort and the recency `group` both need it. The snippet has
no consumer.

`AgentConversations`' item schema declares exactly `key`, `label`, `icon`, `disabled`, `timestamp`,
`group` (`AgentConversations/schema.json`), the block passes `items` straight through to
`@ant-design/x`'s `Conversations` (`AgentConversations.js:66-81`), and upstream's `Item.js` renders
only the icon, the `label` and the menu trigger — there is no description or secondary line, and the
upstream `ConversationItemType` has no `timestamp` either (`conversations/interface.d.ts`). Lowdefy
types `label` as a `string`, so a two-line item is not reachable by passing a node.

Two consequences. The snippet is dead payload unless it is composed into the `label` string, and per-item
timestamps — listed as a current-state gap in the opening bullet — are not reachable at all; what the
design actually delivers on that front is the three group headings, which is a different thing and
probably enough.

**Fix:** either drop the snippet from the endpoint contract, or say that it is concatenated into
`label` and accept what that looks like in one line of text. And stop listing per-item timestamps as a
gap this design closes.

### 6. Three new endpoints, no manifest registration in the files list

> **Resolved (auto).** The files list's `module.lowdefy.yaml` entry now names an `api:` `_ref` for
> each of `delete-conversation`, `query-data-tool` and `render-table`, and says why (the manifest
> lists every endpoint explicitly; an unreferenced API file is never loaded). `exports.api`'s
> `query-data` description drops "agent tool", since that consumer moves off it. `query-data-tool`
> gets no export entry, stated deliberately: it exists for the agent, and a consumer calling it
> directly would be calling the wrong one of the two.

`delete-conversation`, `query-data-tool` and `render-table` all need an `api:` `_ref` entry in
`modules/ai-reporting/module.lowdefy.yaml` — the manifest lists all eighteen current endpoints
explicitly (lines 151-168) and an unreferenced API file is not loaded. The files list mentions that
file only for "the copy vars".

One line in the same file goes stale with the split: `exports.api` describes `query-data` as
"Constrained analytics query (agent tool + report re-queries)", and the agent tool is exactly what
moves off it. `query-data-tool` is agent-only, so it needs no export entry — worth saying, since every
other new endpoint in this module got one.

## What holds up

Checked and true, so nothing to do about them.

The per-writer `$setOnInsert` table matches the current writers: `save-conversation.yaml:39-50` `$set`s
`messages` / `owner` / `updated` and inserts `created` / `title`, and `set-conversation-title.yaml:33-40`
`$set`s only `title` — so the split as drawn is conflict-free.

The minting decision works as described. `_array`, `_function`, `date` and `uuid` are all **shared**
operators, not client-only (`@lowdefy/operators-js/dist/operators/shared/`,
`@lowdefy/operators-uuid/dist/operators/shared/`), so the map runs in an API routine; and `_uuid` is
declared `dynamic`, which is what makes a fresh v4 per item true rather than hopeful.

The `display` branch does take precedence: `MessageBubble.js:339-361` tests
`toolOutput?.display && typeof … === 'string'` before the readable / full / summary modes, so the raw
output stops being rendered once `display` exists — the design's argument that persisted rows are
displayed to nobody is sound.

The table column contract really does exist only inside `validateReportSpec.js:261-320`
(`{ key, label?, format? }`, with the deliberate absence of a `tag` flag documented at line 26), so a
standalone `validateTableSpec` is a genuine new piece and not a duplicate.

And the recovery-by-error-message assumption behind the byte budget is established rather than
assumed: `buildAgentTools.js:82-88` rethrows the endpoint's own message into the tool call, which is
the mechanism `render-chart` and `generate-report` already document in their headers.
