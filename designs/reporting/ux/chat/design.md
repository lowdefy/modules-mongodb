# Reporting chat surface: teaching both jobs, and the panel as artefact store

A sub-design of [`reporting/ux`](../design.md) — plates 1 and 2 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

The chat page is where both of the module's jobs happen, and today it teaches neither. The welcome names the results panel and the phrase "turn this into a report", which only works for a user who reads it, remembers it, and types it later. The panel itself is `visible: false` until a chart arrives, so a first-time user never learns it exists. A tabular answer — the single most common useful result — is stranded in the transcript as text. The conversations rail is titles only: no search, no recency, no rename, no delete. Neither side panel collapses, so the transcript can never run wide.

This sub-design reworks the page so the report path is a thing you can click, the panel is always present and explains its own shape, tables join charts and downloads as artefacts, and the rail becomes usable at more than a handful of conversations. It rests on **one block change** — a `setInput` method on `AgentChat` — without which the empty state cannot teach anything.

Result **selection** and the save sheet it feeds live in [save-as-report](../save-as-report/design.md). This sub-design builds the panel that hosts them.

> **Implemented.** This sub-design shipped in the `reporting` module — the
> always-visible panel, collapsible side panels, rail search/grouping/rename/
> delete, and tables-as-artefacts are live in `modules/reporting/pages/chat*`.
> `docs/reporting/` is the source of truth for consumer-observable behaviour;
> this file records the rationale.

## Proposed change

1. Rework the welcome into **two tracks of starters** — exploratory prompts and report-shaped prompts — plus a line naming what the assistant can see, written by the module consumer rather than derived from the catalog ([why](#the-empty-states-copy-is-consumer-authored-not-catalog-derived)). Clicking a starter fills the composer rather than sending it. Both halves of this are built _outside_ `AgentChat` and rest on one new block method — see [the one thing the blocks cannot do](#the-one-thing-the-blocks-cannot-do-fill-the-composer).
2. Make the **results panel visible when empty**, explaining its own shape, instead of `visible: false` until the first chart.
3. Make **both side panels collapsible**, with the state held for the session ([why not persisted](#collapse-state-is-session-scoped-not-persisted)) and both collapsed by default on a narrow viewport.
4. Give the conversations rail **search, recency grouping (Today / Previous 7 days / Older), rename, and soft delete**, which needs `list-conversations` to return `updated`, plus a new `delete-conversation` endpoint.
5. Add a **`data-report-table` part** so tabular answers become panel artefacts, and scope the panel All / Charts / Tables / Exports.
6. **Prompt the agent to sketch inline with mermaid** where a shape is simple (one series, ≤6 categories) and to name the panel for the full chart. Prompt-only — no block change.
7. **Bound both paths that write rows into the conversation document.** The agent's read path gets its own result budget on a new `query-data-tool` endpoint, so a fat query result cannot silently break the document it is persisted into ([why there](#the-transcripts-size-is-fixed-where-the-rows-enter-not-where-they-land)); and a persisted part keeps only the columns it displays, because a chart part currently bakes in the query's whole row array ([why that is the fix on this path](#the-panel-is-an-artefact-store-so-its-parts-need-identity-a-date-and-a-bound)).

## Current state

- `modules/reporting/pages/chat.yaml` — three `Box` columns at spans 5 / 12 / 7. `AgentConversations` with `items` from `list-conversations` (titles only, no timestamps, no search, no per-row actions, and capped at the 30 most recent); `AgentChat` with a two-line `welcome` mentioning the panel and the phrase "turn this into a report"; `onDataPart` routing `data-report-chart` / `data-report-download` into `_state: charts` / `downloads`; the whole results column `visible:` false until one of those arrays is non-empty; Tabs Charts / Downloads; download runs `query-data` then `DownloadCsv`. No collapse, no selection, no tables.
- Conversations: `list-conversations`, `set-conversation-title`, `save-conversation`, `get-conversation-results`. **No delete of any kind.**
- `@lowdefy/blocks-antd-x` `AgentChat` — `messageParts.js` classifies only text / reasoning / tool / file / data-status and states outright that custom `data-*` parts are not handled inline; `schema.json` declares no block areas; `MessageBubble.js` renders Markdown and mermaid (11.16 via `@ant-design/x`, `renderMermaid` defaulting true).

## Key decisions and rationale

### The empty state teaches both jobs; a magic phrase teaches nobody

The current welcome names the panel and the phrase "turn this into a report", which only works for a user who reads it, remembers it, and types it later. Two tracks of starters make the report path a _thing you can click_, and the split itself is the teaching device: the left column asks a question, the right builds a report. Starters fill the composer instead of sending, because a starter the user cannot edit is a demo, not a prompt.

Naming what the assistant can see is in the same spirit: the alternative is the "why can't it answer that?" dead end, which reads as the assistant being broken rather than the scope being bounded.

### The report track lands on a conversation, not a one-shot build

The right track steers a user into asking for a report, and a report starter is a one-line prompt — it cannot carry a report's shape. So the agent does not fire `generate_report` off that first line. It proposes an outline and settles the report's shape in one round first: a title (proposed from the conversation, the user corrects it), which of the results already in the panel to include (the agent authored this conversation's charts, tables and downloads, so it names them and carries their specs straight into sections), anything new to add, and which fields the reader should be able to filter by. Then it builds once and replies with the link.

Two things make this the right route to be deliberate on rather than the tick-and-save sheet. It is the **guided primary route** — the welcome track exists to steer new users here — and it is the route where **KPIs and markdown enter a report at all**: neither renders as a panel card, so [save-as-report](../save-as-report/design.md#the-sheet-assembles-chart-table-and-download-sections-only--kpis-and-markdown-stay-on-the-generate_report-route) cannot produce them, and this conversation is where the agent offers a headline figure a report wants. The gathering stops short of an interrogation — one round of questions, and none at all when the request is unambiguous and self-contained ("save that chart as a report"). The behaviour is authored in the reporting agent's `generate_report` instructions (`modules/reporting/agents/reporting-assistant.yaml`); this decision is its rationale.

### The empty state's copy is consumer-authored, not catalog-derived

The obvious way to write the "what I can see" line is to derive it from the catalog's collection descriptions — the module already has that map, and a derived line can never go stale. It is rejected, because **a collection is not an entity a user recognises.** A nested object inside one collection is routinely a thing users ask about by name; the collection holding it is a name they have never seen. The mapping fails in both directions — several collections can be one entity to a user, and a collection can be internal plumbing that should not appear in a welcome at all — so a derived line simultaneously omits things the assistant can answer about and offers names nobody uses.

The catalog's own manifest entry says as much: the per-collection `description` is documented as "what the collection holds — **prompt material for the agent**". Using it as user-facing copy repurposes a field written for a model as a field written for a person, and the two want different words.

The same argument reaches the two **track labels**. An app whose users do not call the output a "report" would otherwise get consumer-authored starters under a module-authored heading.

**The accepted cost is drift.** Free text goes stale when a consumer exposes a new collection and forgets the copy, where a derived line could not. That is the trade, taken deliberately: the derived line was accurate about the wrong thing, and an app that says nothing about a collection is a smaller failure than one that offers a name its users do not use.

### The module ships default copy, and the consumer overrides it

Every piece of the empty state is a var, which raises the question of what an app that sets none of them sees. Two answers, split by whether the copy is a fact about the app or furniture:

- **Furniture ships with defaults** — the welcome title and both track labels. They are true in any app, and this is the surface the whole sub-design exists to teach on. Leaving it blank until configured would make discoverability opt-in, for the one feature whose entire point is that the user should not have to know something in advance. The starter prompts get defaults on the same reasoning, and the fill-not-send behaviour is what makes a generic default safe: a starter that does not quite fit the app's data is an editable first draft in the composer, not a dead end.
- **App facts stay absent when unset** — the data-scope line. There is no generic sentence about what an app's assistant can read, and a wrong one is worse than none: it is a promise the agent then fails to keep. Unset means the line is not rendered, not that it falls back to collection names.

### One `welcome` namespace var, not six flat ones

The empty state is six pieces of copy. They go in one `welcome` var with `properties:`, not six top-level vars, for a reason that is about the build rather than tidiness: **a namespaced var is typo-fatal and a flat one is silent.** `validateRequiredVars` in `@lowdefy/build`'s `registerModules.js` walks the consumer's keys against `properties` and throws on an undeclared one, listing what is declared; at the top level it walks the manifest's definitions instead, so a misspelled flat var name is not an error, it is nothing at all. That is the "one correct way" preference paid for mechanically.

Two facts about namespace vars settle the shape:

- **Defaults resolve per leaf, not per object.** `resolveNamespaceVar` builds the object by resolving each declared property independently — the consumer value wins one leaf at a time, and any leaf they omit falls back to that leaf's own `default`. So partial configuration is safe by construction, and there is no wholesale-replacement hazard. It also means **nesting a label with its starters would not couple them**: `tracks.report: { starters: […] }` with no label resolves to the default label exactly as a flat `report_starters` without `report_label` would. Structure cannot make that pairing mandatory; the label default is what covers it, which is why the defaults decision above matters more than the nesting.
- **The name collides with `AgentChat`'s own `welcome` property, which this page deliberately leaves unset.** Two different things called `welcome` on one page: the module var carrying the copy, and the block property that stays empty because the block flattens its tracks. Kept anyway — `welcome` is the right name for the consumer-facing var, and the block property is only ever referred to here as the block's. Worth knowing before reading `chat.yaml`.
- **Two levels, because the docs generator renders two.** `scripts/gen-var-docs.mjs` gives each object var one sub-section listing its properties, and stops there — a property that is itself an object gets one row reading `object` and its leaves are never documented. No module in this repo nests three deep. So the tracks flatten into leaf names (`explore_label` / `explore_starters`) rather than a `tracks` sub-object, and `vars.md` documents all six without touching the generator.

### The transcript is prose; the panel is the artefact store — and that is a ceiling, not a preference

`AgentChat` cannot host a Lowdefy block, a button, or a link inside a message: `messageParts.js` handles only text / reasoning / tool / file / data-status parts and says custom `data-*` parts are not handled inline, and the block schema has no areas. So the panel is the **only** place an `EChart` can live, and the in-thread vocabulary is exactly markdown plus mermaid.

That makes the division of labour honest rather than aesthetic: a simple shape can be a real inline sketch through a mermaid `xychart-beta` or `pie` fence (it carries mermaid's own theme, square marks, no hover — which is why it stays a _sketch_), and the transcript hands off in prose to the panel for the full chart. The agent is prompted to skip the sketch entirely for anything multi-series or long-labelled. A `partRenderers`-style property on the block would remove the ceiling; until one exists, this is the shape of the surface.

### Tables are results

Only charts and downloads stream back today, so a tabular answer — the single most common useful result — is stranded in the transcript where it cannot be reused, reread, or saved into a report. A `data-report-table` part fixes it, and this is also the change that makes [save-as-report](../save-as-report/design.md) worth having on the most common answer shape: a report of charts only would have been a report of the minority case.

**It is the largest item in this sub-design, not the smallest.** The _consumption_ half is free — the same `onDataPart` route, the same panel, the same selection, and `AgGridBalham` already renders it. The _production_ half does not exist at all: `emit-data-parts` builds its parts by filtering the turn's `toolResults` on `toolName`, and there is no table tool to filter on. So a table part needs a `render-table` endpoint mirroring `render-chart` (payload schema, validate-before-ack, and a return of the small validated spec rather than the rows, for the model-context reason that file's header gives), a standalone `validateTableSpec` — the column contract exists today only inside `validateReportSpec` for report sections — registration in the agent's `tools:` list with its prompt contract, and a third branch and third per-turn budget in `buildDataParts`, which hard-codes two. It also needs the rows: a table part freezes them the way a chart part freezes its option, so `emit-data-parts` gains a second `:for` loop running each table's query under the same bounded, `:try`-wrapped, one-failure-skips-one-part treatment charts get, and `buildDataParts` gains a `tables` / `tableResults` pair beside `charts` / `results`. Worth naming here because a decomposition that reads "one more part type" off the first paragraph would size it wrong.

### The panel is an artefact store, so its parts need identity, a date and a bound

The panel's parts are persisted documents that another surface reads — [save-as-report](../save-as-report/design.md) builds report sections out of the ones the user ticks — and today a part is `{ type, data }` with nothing else. Three consequences, one shape change.

**A part carries the spec that produced it.** A chart part persists `{ title, option }`: the baked ECharts option and nothing else, while a download part keeps its `query`. So a chart's pipeline is discarded at the moment it is rendered, and a ticked chart cannot become a report section — a section needs `{ chart, query, x, y }`, and a rendered option cannot be reversed into a pipeline. This is not only a reopened-conversation problem: the live panel state is populated from the same part. So the part becomes

```
data: { id, created, title, option, spec: { chart, query, x, y } }
```

and the new `data-report-table` part carries

```
data: { id, created, title, rows, row_count, spec: { query, columns } }
```

on the same rule. Exports already do this, and it is the reason they work. The table's `rows` are its equivalent of the chart's baked `option` — the frozen artefact — and `spec` is the live half a report section is built from; the panel reads its column definitions from `spec.columns` rather than carrying a second copy. `row_count` is the total the query returned, before the retention cap below, so the card can say _first 200 of 964 rows_ instead of implying it is showing everything. A `row_count` that lands on the engine's own 1000-row cap was itself probably truncated, and the card says that in the same words the [report side already uses](#the-transcripts-size-is-fixed-where-the-rows-enter-not-where-they-land).

**Reopening a conversation shows the numbers from that turn, not today's.** The persisted `option` stays baked, and the spec beside it is what makes a _saved report section_ live. The alternative — store the spec only and re-run the query on reopen — is tempting because it makes the size problem below disappear rather than merely bounding it, and it is rejected: a chart sits directly under prose quoting its numbers, so a chart that silently re-runs makes the paragraph above it wrong. A transcript that edits itself is not a transcript. (The Flint chart-compiler exploration sharpens this: its option is data-dependent by design — grid padding from actual label extents, categorical bars re-sorted by value — so a rebuild would change the chart's shape and ordering, not just its values.)

That makes the `created` stamp load-bearing rather than decorative: it is the only thing that can date a frozen chart, so a card can say _as of 14 July_. It is also what the [report page](../report-page/design.md#provenance-is-three-facts-and-one-of-them-is-free) treats as a first-class provenance fact for the same data, and the panel currently cannot answer the same question.

**The array is bounded on write, for panel length rather than for size.** `emit-data-parts` `$push`es with `$each` and no cap; the per-turn cap is 8 charts and 8 downloads and there is no per-conversation cap at all. So: `$push: { data_parts: { $each: […], $slice: -50 } }`, and the panel's promise becomes "everything you produced in this conversation, up to the last 50 results". The 50 is a starting number, not a derived one.

**A part carries only the columns it displays, and that is what makes it small.** As written, `buildEChartsOption` sets `dataset: { source: rows }` to the query's _whole_ row array — every field the pipeline emitted — while the series `encode` only ever reads `x` and the `y` columns. So a chart part is as wide as its query rather than as wide as its contract, and it is the persisted artefact. The fix is in `buildEChartsOption`: project each row to `[x, …y]` before it becomes the source. That is lossless for the chart, and it cannot narrow a live report either, because `compileReport.js:526` replaces `dataset.source` wholesale when a saved section re-queries. **`compileReport` calls the same function** (`compileReport.js:520`), so the projection reaches the report render path too: an unfiltered section's baked source narrows the same way, equally losslessly, and a report payload shrinks with it. That is a change outside this sub-design's surface, and a welcome one — but it means the function's tests and the report page's rendering are both in scope for the edit, not just the panel. The table part follows the same rule against its `spec.columns`, and is additionally capped at **200 rows** with `row_count` keeping the true total — a panel card is not where anyone reads the thousandth row, and `export_data` is the affordance for the whole result.

Those two bounds are what let the array cap be about the panel rather than the ceiling — but only together. An earlier draft of this design claimed the cap alone did that job, on the grounds that "a part is a title, a baked option and a small spec; fifty of them are kilobytes". Unprojected, a part is as large as its query result, and `MAX_DATA_PARTS_SPECS` permits eight of them in a single turn, so that sentence argued the parts array needed no size bound at all while the chart path was quietly the second way to break the document. With the projection and the row cap, a chart part's worst case is the engine's 1000-row cap over two or three narrow columns and a table part's is 200 projected rows — tens of kilobytes each, so the fifty are single-digit megabytes at the absolute worst and kilobytes in practice. **The other large field is `messages`** — see [the transcript is budgeted where the rows enter](#the-transcripts-size-is-fixed-where-the-rows-enter-not-where-they-land). Keep the cap for what it does do: a panel with two hundred cards is not a panel, and an unbounded array under an index-free selection is a correctness problem as well as a UI one.

`id` and `created` are minted in `emit-data-parts`, not in `buildDataParts`. That function is pure over its arguments with a unit-test file beside it, and minting a uuid or reading the clock inside it would make it non-deterministic and its tests unpinnable without injection. The repo's precedent is the routine anyway: `generate-report` mints a report `_id` with the `_uuid` operator, and where the plugin does assign ids it derives them, as `validateReportSpec` does with `s${index}`. So the routine maps over `buildDataParts`' return and adds the two fields — `__uuid: true` per part (the operator is `dynamic`, so a `_function` callback yields a fresh v4 per item) and one turn timestamp shared by every part of that turn, which is what they all in fact share.

**`created` is a bare timestamp, not a change stamp.** Every _document_ this module writes carries the full `_ref`'d stamp, and a part is not a document: it has no author of its own, since the conversation's `owner` already answers who, one level up. Repeating a user id and display name on fifty array elements buys nothing and goes stale independently. The one consumer that needs more — the [report page](../report-page/design.md#provenance-is-three-facts-and-one-of-them-is-free)'s provenance line — reads who from the report and the conversation, not from the part.

The `id` is what selection binds to, replacing the array index — otherwise the `$slice` retention, or a concurrent turn's push, shifts the array under an open selection. All three fields are additive, so parts written before them are read through `_if_none`, the same way the Flint branch binds a newly-added `charts.$.height`.

### The transcript's size is fixed where the rows enter, not where they land

`save-conversation` `$set`s the whole `messages` array every turn, and that array carries every tool result verbatim: `query_data` returns `_step: run_query` — the raw rows — and those land on the tool part the block persists. `PIPELINE_RESULT_CAP` bounds the row _count_ at 1000, but the only bound on total size is `MAX_RESULT_BYTES = 8000000`, an 8 MB app-memory backstop shared with the download and report paths. Two fat results in one conversation therefore exceed the 16 MB document ceiling on `messages` alone, and the write throws inside the hook whose errors `handleAgentChat` only `console.warn`s — the turn vanishes with nothing shown.

Bounding what gets _stored_ would fix the document and nothing else. Bounding what the tool _returns_ fixes three things with one number, because a tool result is not just persisted:

- **It is model context, re-sent on every later step and turn.** This is already the codebase's stated principle — `render-chart` returns the validated spec rather than its rows for exactly this reason, in that file's header comment. `query_data` is the one tool that hands back bulk rows, so it pays twice: context window and document size.
- **Nobody reads them.** With the `display` summary this design already adds to the query tool, `MessageBubble` takes the `toolOutput.display` branch and renders that markdown behind the collapse — the raw output is no longer rendered at all. Persisting and re-sending rows that no surface displays is pure cost.

**Decision: the agent's read path gets its own result budget, 200 KB, well under the engine's 8 MB memory backstop.** The number is chosen to sit on the discriminating line rather than at a round guess: a typical aggregation row (`{ _id: "Acme", total: 412000, count: 12 }`) is under a hundred bytes, so the full 1000-row cap costs well under 200 KB, while a `$push: "$$ROOT"` dump of wide documents breaks it immediately. Exceeding it throws the engine's existing message — _"Narrow the query — project fewer fields, or aggregate instead of returning raw documents"_ — mid-stream, which is the correct instruction to an analytics agent and one it can act on within the turn.

**The budget cannot come from the payload, so the agent gets its own endpoint.** `query-data`'s header records the deliberate decision that one endpoint serves three consumers, with the `AnalyticsPipeline` request as the single security boundary. That holds for the boundary and stops holding for the budget: the agent authors the payload, so a payload-supplied budget is a budget the agent can raise, and the browser-side download path is no better. The distinguishing fact is which endpoint was called, so a new `query-data-tool` carries the tighter budget and the `display` summary, and `query_data` points at it. `query-data` keeps its 8 MB budget and its bare-array return for the panel download and report filter re-queries — which is also what keeps the download working, since `chat.yaml` reads that response as an array straight into `DownloadCsv` and adding `display` to it would have broken that. The security boundary does not move: both endpoints run the same guard and the same `AnalyticsPipeline` request against the same catalog.

**The other read that persists rows needs the projection, not this budget.** `emit-data-parts` runs each chart's query itself, as an `AnalyticsPipeline` step with only `query` and `roles` set, so it takes `connection.maxResultBytes` — 8 MB — and those rows are baked into the part it `$push`es. That was the second unbounded entry into this document, and it was open while the cap nominally covering it was being demoted. The obvious symmetry is to give it the same 200 KB, and that is wrong: [projecting the part](#the-panel-is-an-artefact-store-so-its-parts-need-identity-a-date-and-a-bound) to the columns the chart draws already bounds what lands in the document, so a tight budget on the _fetch_ would only reject queries whose part would have been small anyway — a `$$ROOT` pipeline charting two of its fields is fat to fetch and tiny to persist. And it fails badly: the turn is over, so the agent cannot narrow anything, and `emit-data-parts`' `:catch` logs and skips, meaning the user loses a chart with no explanation. The 8 MB app-memory backstop is the right bound for a fetch nobody re-sends. Same reasoning for the table fetch: bounded by projection and the 200-row cap on the way into the part, not by a tighter budget on the way out of the database.

**The budget rides on the request, not on a second connection.** `maxResultBytes` is already a connection property — `AnalyticsPipeline.js:133` reads `connection.maxResultBytes ?? MAX_RESULT_BYTES` — so a second `reporting-data-agent` connection with a tighter number would deliver this with no plugin change at all, which makes it the alternative worth stating rather than assuming. It loses on two counts. The request side is not a schema to author: `AnalyticsPipeline.schema = {}` deliberately, and the header says why ("the pipeline is validated by validatePipeline, so no property schema is needed"), so this is one more key read off `request` beside `query`, `roles` and `filters`. And `reporting-data.yaml`'s own header records that a consumer remapping the connection "replaces this definition entirely — it must re-bind BOTH the catalog and a read-only principal": a second connection doubles that hazard and adds a second remappable name to the manifest's `connections:` list, which can then drift from the first while both are supposed to reach the same data through the same catalog. A budget is a request-shaped fact anyway — it describes what this caller does with the rows, not what database the module is pointed at. `connection.maxResultBytes` stays the fallback, so nothing changes for the paths that set nothing.

**It throws rather than truncating.** A truncating budget would be non-fatal and could state its own remainder, which is the more forgiving shape for a model-facing read. Rejected, on two grounds. Knowing the remainder means draining the cursor past the budget, and a silently shortened aggregation is a wrong answer that looks complete — a top-N by group cut mid-stream is not "most of" the answer. And the throw is the engine's existing behaviour, shared with `query-data` and the report paths, so truncation means a second drain path in the one place the memory bound is enforced. The failure is loud, self-describing and recoverable inside the turn; that is the better trade here.

**The row cap owes the model a sentence, and the repo already writes it.** `PIPELINE_RESULT_CAP` appends a trailing `$limit: 1000` to every pipeline, silently, so a result landing on exactly 1000 rows is indistinguishable from a complete one — an assistant can report "1,000 customers" about a collection of forty thousand. `compileReport`'s `sectionHeading` already answers this on the report side, heading a capped section "— first 1000 rows" because "a table silently showing its first 1000 rows reads as the complete answer". The `display` string this design adds to the query tool is that sentence written for the model: the row count, an explicit note that the cap bound it when `rows.length >= PIPELINE_RESULT_CAP`, and the duration from a `_date: now` either side of the step. That is what makes the trace line's `842 rows · 0.4s` true rather than decorative.

### Three columns, both sides collapsible

Left is history, middle is now, right is what you produced. Both side panels collapse to strips (the rail to icons, the panel to counts) so the transcript can run full-width when the user is reading rather than producing, and the two collapses are mirror images so they read as one pattern. Collapse state is kept for the session and follows the user between pages ([why not persisted](#collapse-state-is-session-scoped-not-persisted)); on a narrow viewport both start collapsed. The expanded layout is 232px / fluid / 348px with a ~62ch measure on the middle column, which is the chat block's own `maxWidth` — so prose stays readable at any width.

### The panel is visible when empty

An empty panel that explains its own shape — "charts, tables and exports you produce land here; tick them to save a report" — costs one Box of copy and removes the entire class of "I didn't know that was there". A panel that appears only after the first chart teaches nothing until the user has already succeeded without it.

This also makes the panel the stable home for the All / Charts / Tables / Exports scope, which would otherwise appear and disappear with the panel.

## Block feasibility

Checked against the blocks the demo actually installs, reading block source rather than docs.

### The one thing the blocks cannot do: fill the composer

A starter that **fills** the composer instead of sending it (plate 1, callout 3) is not reachable from config. `AgentChat`'s prompt handler calls `sendMessage({ text })` directly, the `@ant-design/x` `Sender` is mounted uncontrolled (a ref, cleared after send — no `value` prop), and the block's registered methods are `regenerate`, `setMessages`, `sendMessage`, `clearMessages`, `deleteMessage`, `stop`, `clearError`, `scrollToBottom`. None of them writes the input.

The fix is a **`setInput` method on `AgentChat`**: make the `Sender` controlled from local state and register the setter. It is small, and the package is already patched in this repo (`patches/@lowdefy__blocks-antd-x.patch`, which keys `useChat` by conversation), so patch-then-upstream is a proven path here.

It is three edits, not two, and the third is where a regression would hide. `senderRef.current?.clear()` is how the composer empties after a send today, and it sits deliberately downstream of both the `onBeforeSend` cancellation return and the file-upload await — so a cancelled or failed send leaves the user's text in the box. A controlled conversion has to move that clear to a state reset **at the same point in the flow**; doing it in `onSubmit` instead silently loses typed input on every rejected send.

That one method also settles the **two-track welcome**. `welcome` takes `{ title, description, icon, prompts[], variant }` and the block flattens `prompts` into a single row, mapping only `key` / `label` / `description` — the `children` that `@ant-design/x` uses for grouped columns are dropped, and the block declares no areas, so nothing can be composed inside it. Rather than grow that schema, **leave the block's `welcome` property unset and render the empty state as ordinary blocks above the chat**, shown while `messages` is empty: two `Box` tracks, `Title` / `Paragraph` copy, starter chips as `Button`s calling `setInput`. That is more layout freedom than the schema would ever have given, and it is only viable because `setInput` exists. One change, both callouts.

### What the blocks already do, unchanged

The conversation rail carries more than the current page uses. `AgentConversations` takes a per-item `menu` and fires `onMenuClick` with the action key and the conversation key — that is rename and soft delete, with `danger: true` on the delete item. Recency grouping is a `group` string on each item plus the `groupable` property, and group order follows first appearance in `items` (verified in `@ant-design/x`'s `useGroupable` — a plain reduce, no alphabetical sort), so ordering the items by recency yields Today → Previous 7 days → Older with no sort hook.

**A rail item is one line, and that bounds what the rail can say.** The item schema is exactly `key` / `label` / `icon` / `disabled` / `timestamp` / `group`; the block passes `items` straight through to `@ant-design/x`'s `Conversations`, whose `Item` renders the icon, the `label` and the menu trigger and nothing else — no description, no secondary line, and `label` is typed `string`, so a node cannot be smuggled in. Two consequences. **There is no snippet**, and the wireframe's endpoints table asked for one "for search" rather than for display — so the question is not whether it renders (it cannot) but whether it should widen what search matches. It should not: the title is AI-derived from the conversation's own opening turn, so a first-message snippet is near-duplicate search surface, and a match on text the user cannot see is a result they cannot explain — searching "refunds" and being handed a conversation titled "Q3 review" reads as a bug. So `list-conversations` returns `updated` for the sort and the group assignment, search matches titles, and searching message content stays the same additive server-side `$match` the [window decision](#the-rails-window-is-200-and-search-filters-the-window) already reserves. And a **per-item timestamp is not reachable at all** — the `timestamp` field is declared in the block's item schema but nothing reads it, and upstream's `ConversationItemType` does not carry it. What the rail delivers on time is the three group headings, which is a different thing and enough: a user scanning for last Tuesday's conversation is served as well by "Previous 7 days" as by a date on every row. There is no search property, but `items` is config-driven, so a `Search` block above the rail filtering the array _is_ the feature — with one caveat the cap creates, below.

### The rail's window is 200, and search filters the window

Filtering `items` client-side searches whatever `list-conversations` returned, and today that is 30. At two hundred conversations, searching for one from last month returns nothing with no sign that the search was scoped rather than unsuccessful — the worst shape of empty result — and "Older" shows the tail of a fortnight rather than the archive the label implies.

**Decision: raise the cap to 200 and keep the filtering client-side.** The endpoint already projects `messages` and `data_parts` away, so 200 title-and-timestamp documents is a small payload and the cap keeps doing the job its header comment gives it. Server-side search — passing the term through and `$match`ing before the sort — is the other answer, and it is machinery bought on a guess: it needs a debounced round trip per keystroke and a second code path for the unsearched list, to serve a conversation count nobody has yet. If a real complaint appears it is an additive change behind the same `Search` block, exactly like the [collapse-state fallback](#collapse-state-is-session-scoped-not-persisted). What the design owes in the meantime is honesty in the copy: the rail is the 200 most recent conversations, and search says so when it finds nothing.

The results panel is all existing blocks: `SegmentedSelector` for All / Charts / Tables / Exports, a `List` of `Card`s, `CheckboxSwitch` bound to `charts.$.selected` for selection, `Modal` for expand, `AgGridBalham` for a table result, `EChart` for a chart, and the `ScrollTo` action for "the panel scrolls to the newest card".

`AgentConversations` has no collapsed mode of its own, so the rail's icon strip is a `Box` of `Button`s shown when the rail is hidden. The antd `Splitter` block — per-panel `collapsible` and `resizable` with an `onCollapse` event — could carry both edges instead, and is worth a look at build time if the hand-rolled strips read as two features rather than one pattern.

### Collapse state is session-scoped, not persisted

There is no client-storage action — the set is `CallAPI`, `CallMethod`, `CopyToClipboard`, `DisplayMessage`, `Fetch`, `Link`, `Login`, `Logout`, `Publish`, `Request`, `Reset`, `ResetValidation`, `ScrollTo`, `SetDarkMode`, `SetFocus`, `SetGlobal`, `SetLocale`, `SetState`, `Subscribe`, `Throw`, `Unsubscribe`, `UpdateSession`, `Validate`, `Wait` — and `SetGlobal` lives in memory for the session, not across reloads. So persisting the collapse per user, as plate 2's callout 1 draws it, costs a `ui_state` document and a write per toggle, for a preference that is re-expressed with one click.

**Decision: `SetGlobal`, session-scoped, with both panels collapsed by default on a narrow viewport.** The state follows the user between the chat, list and report pages within a session and resets on reload. If a real complaint appears, the endpoint is a later, additive change — nothing about the UI has to move.

### The trace line's title is the tool name

A tool call renders as a `ThoughtChain` item whose title is hard-coded to the raw tool name. The _description_ is authorable: when a tool returns `{ display: "…" }` the description becomes its first 80 characters and the full `display` markdown renders behind the collapse. So "842 rows · 0.4s" and "expanding shows the pipeline" are both real; "Read **orders**" as the heading is not, and `query_data` is an honest enough label to accept. What that description says — the count, whether the row cap bound it, the duration and where the duration comes from — is [specified with the budget](#the-transcripts-size-is-fixed-where-the-rows-enter-not-where-they-land), because the same string carries both.

## Data model

Conversation documents already carry `owner`, `created`, `updated`, `messages`, `data_parts` and `title`. The rail needs one addition:

| Field     | Type                   | Notes                                                                           |
| --------- | ---------------------- | ------------------------------------------------------------------------------- |
| `deleted` | `null` \| change stamp | Same shape and read predicate as everywhere else; `docs/shared/soft-delete.md`. |

Recency grouping and the rail's sort read the existing `updated.timestamp` — no new field. The stamp comes from `modules/reporting/defaults/change_stamp.yaml`, `_ref`'d like every other writer's — same reasoning as [ownership](../ownership/design.md#reporting-writes-its-own-change-stamp-for-now).

**Both writers must `$setOnInsert` the same live shape**, and today they do not — which is a live defect the rail already shows. `save-conversation` inserts `created` and a derived `title` while `$set`ting `messages`, `owner` and `updated`; `set-conversation-title` inserts `owner` and `created` only. That endpoint frequently creates the document — its own comment records that the AI title arrives during streaming, before the onFinish save — and a document with no `updated` sorts **last** on `list-conversations`' descending sort. So the conversation the user is actively talking to sits at the bottom of their own rail until the first save lands, groups under "Older" once recency grouping ships, and stays there permanently if that hook ever fails.

**The invariant is the union, not a shared list.** The fix is that _between them_ the two writers' `$set` and `$setOnInsert` cover the full live shape — each writer `$setOnInsert`s only the fields it does not `$set`. Stating it as one shared list both writers insert is not a stylistic difference, it is a hard MongoDB error: the same path in `$set` and `$setOnInsert` throws code 40, `Updating the path 'owner' would create a conflict at 'owner'`, on **every** call rather than only on inserts. Probed against a real server (`mongodb-memory-server`, driver 6.21), including the nested case — `$set: { "owner.name": … }` against `$setOnInsert: { owner: … }` conflicts too. `save-conversation` already `$set`s `messages`, `owner` and `updated`, so the shared-list phrasing would have stopped it persisting anything at all, silently, inside the `console.warn`-only hook.

So, per writer:

| Writer                   | `$set`                         | `$setOnInsert`                                                                   |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------- |
| `save-conversation`      | `messages`, `owner`, `updated` | `created`, derived `title`, `data_parts: []`, `deleted: null`                    |
| `set-conversation-title` | `title`                        | `owner`, `created`, `updated`, `messages: []`, `data_parts: []`, `deleted: null` |

Same end state either way — the probe confirms `$setOnInsert` does not fire on a match, so the second writer never disturbs what the first initialised. This is the discipline `generate-report` already applies on the reports side ("initialised so live documents have a consistent shape"), expressed as the union because these two writers overlap and that one is a single insert.

A part in `data_parts` is `{ type, data: { id, created, … } }`, with the array bounded on write — see [the panel is an artefact store](#the-panel-is-an-artefact-store-so-its-parts-need-identity-a-date-and-a-bound).

**The conversation `_id` is browser-generated** (`_uuid` in the page's `onInit`), and both writers upsert on `{ _id, owner.user_id }` — so the owner scope makes the upsert an insert path: an id colliding with another user's document would miss the filter and attempt an insert on a duplicate key, surfacing as an error inside a hook that only warns. Unreachable with uuid4 and no guard is added; recorded because the same pattern with a guessable id would be an integrity problem rather than a curiosity.

`conversationId`, `messages`, `steps` and `toolResults` stay camelCase wherever they appear here: they are the `AgentChat` block's property and the agent framework's `onFinish` payload keys, not names this module chooses. Same for `dataParts` as the key the framework reads stream parts back from — the field it persists to is `data_parts`.

Conversations stay **own-only**. Nothing here gives a conversation an audience; the only cross-user link is the report's `conversation_id`, and following it is owner-gated on the [report page](../report-page/design.md).

## Endpoints

| Endpoint                   | Status | Shape                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-conversations`       | change | Own-only, returns `updated` (sort and group assignment, no snippet — nothing renders one); excludes soft-deleted; cap raised to 200.                                                                                                                                                      |
| `delete-conversation`      | new    | Soft, owner-scoped, same stamp shape.                                                                                                                                                                                                                                                     |
| `query-data-tool`          | new    | The agent's read path: same guard and same `AnalyticsPipeline` request as `query-data`, with a request-set 200 KB result budget and a `display` summary. `query_data` points here.                                                                                                        |
| `query-data`               | —      | Unchanged, and deliberately so: the download and report-filter path keeps the 8 MB budget and the bare-array return `DownloadCsv` consumes.                                                                                                                                               |
| `render-table`             | new    | Mirrors `render-chart`: validate a table spec before acknowledging, return the validated spec and not the rows.                                                                                                                                                                           |
| `emit-data-parts`          | change | A second `:for` running each table spec's query, on the same 8 MB fetch budget the chart loop uses; emits `data-report-table` with a third per-turn budget; parts carry `id`, `created`, their validated `spec` and only the columns they display; the `$push` bounds with `$slice: -50`. |
| `save-conversation`        | change | `$setOnInsert` only what it does not `$set` — `data_parts: []` and `deleted: null` beside the existing `created` / `title`.                                                                                                                                                               |
| `set-conversation-title`   | change | `$setOnInsert` the rest of the live shape (`updated`, `messages: []`, `data_parts: []`, `deleted: null`), so the writer that usually creates the document creates it complete.                                                                                                            |
| `get-conversation-results` | change | A third `data-report-table` branch beside charts and downloads, and the new part fields projected through.                                                                                                                                                                                |

## Vars

One namespace var, `welcome`, carrying all six pieces of the empty state's copy — [why one and not six](#one-welcome-namespace-var-not-six-flat-ones), [why consumer-authored](#the-empty-states-copy-is-consumer-authored-not-catalog-derived), [why defaulted](#the-module-ships-default-copy-and-the-consumer-overrides-it).

| Property           | Type       | Default                                        |
| ------------------ | ---------- | ---------------------------------------------- |
| `title`            | `string`   | Ships one — furniture                          |
| `data_scope`       | `string`   | **None.** Unset means the line is not rendered |
| `explore_label`    | `string`   | Ships one — furniture                          |
| `explore_starters` | `string[]` | Ships generic prompts                          |
| `report_label`     | `string`   | Ships one — furniture                          |
| `report_starters`  | `string[]` | Ships generic prompts                          |

Every property, and the `welcome` var itself, carries full `description` / `type` / `default` in `modules/reporting/module.lowdefy.yaml`; then `pnpm docs:gen`. No var derives from the catalog.

## Files changed (anticipated)

- `modules/reporting/pages/chat.yaml` — fixed rail/panel widths with a fluid measure-capped middle; both panels collapsible with session-scoped state; panel visible-when-empty; the two-track empty state as ordinary blocks with `AgentChat`'s `welcome` property unset; starter chips filling the composer; rail search / grouping / per-item menu; the table part routed into a new state array, cleared in all three places the panel arrays are cleared and repopulated in `set_results`; the panel scope control.
- `modules/reporting/api/list-conversations.yaml` — `updated`, soft-delete filter, cap 200.
- New `modules/reporting/api/delete-conversation.yaml`.
- New `modules/reporting/api/query-data-tool.yaml` — the agent's read path with the 200 KB budget and the `display` summary; `query-data.yaml` is left alone.
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js` — a request-set result budget, read as `request.maxResultBytes ?? connection.maxResultBytes ?? MAX_RESULT_BYTES`, so the two read paths can differ. No property schema to extend: `AnalyticsPipeline.schema = {}` deliberately, because `validatePipeline` is the validation.
- New `modules/reporting/api/render-table.yaml` and a `validateTableSpec` in `plugins/modules-mongodb-plugins/src/analytics/`.
- `modules/reporting/api/emit-data-parts.yaml` — a second `:for` running each table spec's query (same `:try` isolation and same 8 MB fetch budget as the chart loop), the table part and its per-turn budget; `id` / `created` minted here and mapped onto each part; `$slice: -50` on the `$push`.
- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` — project each row to `[x, …y]` before it becomes `dataset.source`, so a persisted chart part carries only the columns it draws. `compileReport` calls this too, so its tests and the report page's chart rendering are in scope for the change.
- `modules/reporting/api/save-conversation.yaml` and `set-conversation-title.yaml` — the per-writer `$setOnInsert` split.
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` — carries the validated spec onto each part and gains a third branch and budget for tables, taking `tables` / `tableResults` beside `charts` / `results` and capping a table part's rows at 200 with `row_count` recording the total; stays pure, so `id` / `created` arrive from the routine.
- `modules/reporting/api/get-conversation-results.yaml` — the third `data-report-table` branch, and the new fields projected through; its "baked option is a snapshot" comment stays true and gains the `created` date that dates it.
- `modules/reporting/agents/reporting-assistant.yaml` — the mermaid-sketch prompt, the `render_table` tool with its spec contract, `query_data` repointed at `query-data-tool`, and the `display` string on the query tool's output so the trace line reads as a summary rather than a key list.
- `patches/@lowdefy__blocks-antd-x.patch` — the `setInput` method on `AgentChat` (controlled `Sender` plus `registerMethod`), to be upstreamed.
- `modules/reporting/module.lowdefy.yaml` — the copy vars, and an `api:` `_ref` for each of `delete-conversation`, `query-data-tool` and `render-table`, since the manifest lists every endpoint explicitly and an unreferenced API file is never loaded. `exports.api`'s `query-data` description drops "agent tool" — that consumer moves off it. `query-data-tool` gets no export entry: it exists for the agent, and a consumer calling it directly would be calling the wrong one of the two.
- `docs/reporting/` — the index's surfaces table.

## Demo consumers

- Starter prompts and welcome copy on the demo module entry — set as **overrides** of the shipped defaults, and set partially: `data_scope` plus one track's label and starters, leaving the other track to its defaults. That build-verifies both paths in one entry, since the per-leaf default resolution is what makes partial configuration safe and an untested partial entry is where it would fail unnoticed.
- A seeded conversation set spanning today, the last week and older, so recency grouping renders all three groups.
- At least one seeded conversation producing a **table** result, so the new part and the panel's Tables scope are exercised end to end — and one whose result exceeds the 200-row retention cap, since "first 200 of N rows" is copy that only ever appears on a truncated part and would otherwise ship unread.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Resolved questions

Resolved 2026-07-29:

1. **Can a chart, button or link live inside a chat bubble?** No. `AgentChat` handles only text / reasoning / tool / file / data-status parts, explicitly not custom `data-*` parts, and its schema has no block areas. Mermaid + markdown are the whole in-thread vocabulary; the panel is the only home for an `EChart`.

Resolved 2026-07-30, from reading the installed block source:

2. **Can a starter fill the composer instead of sending it?** Not today, and it is the only hard blocker in the deck. The `Sender` is uncontrolled and no block method writes the input — it needs a `setInput` method on `AgentChat`.
3. **Can the welcome show two tracks?** Not inside the block: `welcome.prompts` is flattened to one row and `AgentChat` has no areas. Render the empty state as ordinary blocks above the chat with the block's `welcome` property unset — which needs `setInput` to be worth anything, so it is the same change.
4. **Can the rail group by recency, rename and delete?** Yes, all three, with no block change: item `group` / `timestamp` plus `groupable`, and a per-item `menu` firing `onMenuClick`. Group order follows item order, so sorting by recency is the whole implementation. Search is a `Search` block above it filtering `items`.
5. **Can UI state persist across reloads?** No client-storage action exists, and `SetGlobal` is session-memory. Session-scoped is the decision; a `ui_state` document is the additive fallback.

Resolved 2026-08-04, from reading `@lowdefy/build` rather than the module docs:

6. **Does a consumer setting part of an object var wipe the rest of its defaults?** No. `resolveNamespaceVar` in `buildRefs/walker.js` resolves a `properties:` var one leaf at a time — the consumer value wins per leaf and every omitted leaf falls back to its own `default`. Partial configuration is safe by construction, which is what makes the six-property `welcome` var usable without a consumer having to restate the whole object.
7. **Would nesting a track's label with its starters make setting one without the other impossible?** No, and this was the reason offered for a three-level shape. Because defaults resolve per leaf, `tracks.report: { starters: […] }` with no label yields the default label — identical to a flat `report_starters` with no `report_label`. No manifest structure can make two leaves mandatory together; only a sensible label default covers it.
8. **Does an undeclared var name fail the build?** Only inside a namespace var. `validateRequiredVars` in `registerModules.js` checks the consumer's keys against `properties` and throws on an undeclared one, naming the declared set; at the top level it iterates the manifest's definitions, so an undeclared or misspelled top-level var is silently ignored. This is the argument for one namespace var over six flat ones.
9. **Does `scripts/gen-var-docs.mjs` document a three-level var?** No. Each object var gets one sub-section listing its properties; a property that is itself an object renders as a single row reading `object` and its own leaves never appear. Nothing in `modules/` nests three deep today. Hence two levels, with the tracks flattened into leaf names.

Resolved 2026-08-04, from a probe against a real server and from reading the block and engine source:

10. **Can a writer `$set` and `$setOnInsert` the same path?** No — code 40, `Updating the path 'owner' would create a conflict at 'owner'`, thrown on every call rather than only on inserts, and nested overlaps (`owner.name` against `owner`) conflict too. Probed on `mongodb-memory-server` with driver 6.21. Disjoint paths are fine, and `$setOnInsert` correctly does not fire on a match. Hence the per-writer split rather than one shared shape.
11. **How large can one `query_data` result be?** Up to `MAX_RESULT_BYTES` = 8 MB. `PIPELINE_RESULT_CAP` appends a trailing `$limit: 1000`, so the row count is bounded, but nothing bounds a row's size — `AnalyticsPipeline` drains the cursor against a byte budget and throws mid-stream when it is exceeded. Two such results break the 16 MB document on `messages` alone, which is what moved the size fix from the parts array to the read path.
12. **Does the transcript render the raw tool output?** Only until the `display` summary lands. `MessageBubble` takes the `toolOutput.display` branch ahead of every other, rendering that markdown behind the collapse and never touching the raw output. So persisted rows are model context and document weight only — no surface displays them.
13. **Does `_uuid` in an `_array.map` callback yield a fresh value per item?** Yes. The operator is declared `dynamic`, so it is re-evaluated rather than resolved once, and `__uuid: true` inside a `_function` callback mints a distinct v4 per part. That is what lets `emit-data-parts` mint part ids in the routine and leave `buildDataParts` pure.

Resolved 2026-08-04, from reading the plugin and block source a second time:

14. **How large is a persisted chart part?** As large as its query result. `buildEChartsOption` sets `dataset: { source: rows }` to the whole row array while the series `encode` reads only `x` and the `y` columns, and `emit-data-parts` fetches those rows at the connection's 8 MB. So the parts array was the second unbounded path into the 16 MB document, not the small one the cap paragraph assumed. Projecting the source to `[x, …y]` is lossless in both directions: the chart draws nothing else, and `compileReport.js:526` replaces `dataset.source` wholesale when a saved section re-queries, so a narrowed persisted source cannot narrow a live report.
15. **Does a new budget property mean a request schema, tests and a rebuilt `dist`?** Only the last. `AnalyticsPipeline.schema = {}` deliberately — "the pipeline is validated by validatePipeline, so no property schema is needed" — so the budget is one key read off `request` beside `query`, `roles` and `filters`. That is what settled it against a second connection with a tighter `maxResultBytes`.
16. **Can a rail item show a snippet or a date?** No. The item schema is exactly `key` / `label` / `icon` / `disabled` / `timestamp` / `group`, `label` is typed `string`, and `@ant-design/x`'s `Item` renders the icon, the `label` and the menu trigger — no second line. `timestamp` is declared in the block's schema but nothing reads it, and upstream's `ConversationItemType` does not carry it. Recency is deliverable as group headings and nothing else.

## Deviations from the wireframes

1. **The tool trace line is titled with the tool name.** Plate 2's `Read orders · 4,812 rows · 0.4s` becomes a `query_data` heading with the row count and duration as its description, and the pipeline behind the collapse.
2. **Collapse state is session-scoped**, not persisted per user as plate 2's callout 1 draws it. No client storage action exists; see [above](#collapse-state-is-session-scoped-not-persisted).
3. **The rail carries no per-item date and no search snippet.** The wireframe's endpoints table asks `list-conversations` for "a snippet for search"; a rail item is one line of text with no second line and no readable timestamp, so recency arrives as the three group headings and search matches titles — see [what the blocks already do](#what-the-blocks-already-do-unchanged).

## Risks

- **The `setInput` patch is ours until it is upstreamed.** The discoverability story rests on one method that does not exist in a released block. A version bump that reworks `AgentChat`'s sender re-opens it. Contained by the patch being small and by the same package already carrying one.
- **The mermaid sketch is prompt-enforced, not schema-enforced.** Nothing stops the agent emitting a twelve-series `xychart-beta` that renders as noise. The mitigation is prompt-side only; if it misbehaves in practice the fallback is to drop inline sketches entirely, which costs nothing structural.
- **The document ceiling is bounded, not closed.** Every bound here is per item — 200 KB per tool result, tens of kilobytes per part, fifty parts — and nothing caps how many turns a conversation has. A hundred turns each returning a pathological 200 KB result would still reach 16 MB. That is a worst case requiring every turn to be pathological: a typical aggregation result is a few kilobytes, so the budget is a rejection line for `$$ROOT` dumps rather than a description of a normal turn. Recorded rather than fixed, because the fix is a `messages` retention policy, which is a different design and would mean a conversation that forgets its own beginning.
- **The 200 KB read budget is a new way for a legitimate query to fail.** It is sized to reject raw-document dumps and pass aggregated results, but a wide catalog with long text fields could break it on a query a user considers reasonable. The failure is loud, self-describing and recoverable inside the turn — the agent is told to project fewer fields or aggregate — and the number is one constant, so raising it is not a design change. Watch for it in the demo before assuming the line is in the right place.

## Non-goals

- **Inline blocks in the transcript.** Blocked by the block, not chosen — see [the ceiling](#the-transcript-is-prose-the-panel-is-the-artefact-store--and-that-is-a-ceiling-not-a-preference).
- **Persisting UI preferences.** Session-scoped, with a known additive fallback.
- **Giving conversations an audience.** They stay own-only.
- **A drag-to-reorder panel.** Nothing reorders results in the panel; ordering is arrival order, and the sheet reorders sections with ↑ / ↓ — see [save-as-report](../save-as-report/design.md).
