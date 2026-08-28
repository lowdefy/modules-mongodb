# Report summary drawer: an on-demand AI reading of a filtered report

A report shows the numbers; it does not say what they mean. This design adds an
**AI summary** to the report page — a model-generated reading of the report's
data ("sales are up 12% quarter-on-quarter, driven by the West region; the East
is flat and worth a look") that the viewer generates on demand and refreshes at
will. It lives in a **drawer opened from a button in the report header**, not as
a section in the report body, and it always describes the report **as currently
filtered**: generation re-runs the report's section queries with the viewer's
active filter selections applied, and the prose opens by naming that scope.

> **Status: settled.** Promoted from the follow-ups backlog
> (`../follow-ups/README.md`), where it was drafted as an inline
> `interpretation` **section type**. A discover pass against the shipped
> reporting module changed the shape: a header-button drawer replaces the
> inline section, which dissolves most of the draft's open questions — see
> [Why a drawer, not a section](#why-a-drawer-not-a-section-type). The draft's
> core requirement is unchanged and non-negotiable: the summary must describe
> the currently-filtered slice, never the whole dataset, and must never sit
> fresh-looking beside charts it no longer describes.

## Proposed change

1. A **`summarize-report` endpoint** (type `Api`, exported) in the ai-reporting
   module: takes `report_id` plus a map of active filter values, loads the
   report under the same readable scope as `resolve-report` (owner or shared,
   not deleted, signed-in guard), re-runs every data section's pipeline through
   `AnalyticsPipeline` with the viewer's roles and a server-built `$match` from
   the filter values — honouring each section's own `filterBy` binding — and
   hands the capped results to the model. Returns
   `{ text, scope, generatedAt, excluded }`.
2. A **`SummarizeReportData` request on the `AiText` connection type**
   (`plugins/modules-mongodb-plugins/src/connections/AiText/`) — the module's
   second one-shot LLM call, alongside `GenerateChatTitle`. Takes the report
   title/description, the shaped per-section data, and the human-readable
   filter scope; owns the prompt (grounding rules, scope-naming, markdown
   output). Throws on failure — this call answers a button click, unlike the
   title call it must not fail silently.
3. A pure, tested **`buildSummaryInput` helper** in
   `plugins/modules-mongodb-plugins/src/analytics/` that shapes and caps the
   per-section rows and renders the scope line from the spec's filter sections
   and the active values — the same split `buildDataParts` already has:
   analytics owns data shaping, the AiText request owns prompt wording.
4. An **`ai-text` connection** in the module manifest (type `AiText`, keyed by
   the existing `AI_GATEWAY_API_KEY` secret), exported and remappable like the
   `ai` connection. The summary uses the module's existing `model` var.
5. A **static `report_summary_drawer`** in `pages/report.yaml` — a sibling of
   the Dynamic block, like the rename and delete modals: an explainer line, the
   summary as a Markdown block bound to page state, a "Generated {time} ·
   {scope}" line, a stale Alert, and one **Generate / Refresh button** that
   calls `summarize-report` with
   `{ report_id: _url_query, filters: _state summary.filter_values }` and
   writes the response into `summary.*` state (`stale: false`).
6. Two small **compileReport** additions:
   - a header **"AI summary" button** in the compiled title row (beside
     Continue-in-chat / ★ / ⋯) whose onClick SetStates
     `summary.filter_values` — a map of filter field → live `__state:
     filter_{field}` read — then CallMethods `setOpen` on the static drawer,
     the exact pattern the compiled ⋯ menu uses on the static modals;
   - every filter's onChange (in `requeryActions`) additionally SetStates a
     fresh `summary.filter_values` and `summary.stale: true`, so the drawer's
     state is always current and any displayed summary is marked the moment
     the report stops matching it.
7. **No new spec grammar, no agent vocabulary, no stored-report migration** —
   the feature is page-level, so `validateReportSpec`, the save sheet, and
   `reporting-assistant.yaml` are untouched, and every existing saved report
   gets the feature on next open.
8. Docs: a consumer-facing note in `docs/ai-reporting/` (behaviour, scope line,
   staleness, the `ai-text` connection remap), manifest description for the new
   connection and endpoint, `pnpm docs:gen`.

## Why this, and why now

The follow-ups backlog captured this as the natural next step after the open
engine: reports render trustworthy numbers but offer no reading of them, while
the module already holds everything a reading needs — resolved queries, filter
state, a model connection. The discover pass found the draft's inline-section
shape was the source of all its hard open questions (re-run vs stale, which
sections, persistence, section grammar), and that a drawer dissolves them —
see below. The pieces this needs all exist as established patterns:
`AiText` one-shot requests (`GenerateChatTitle`), compiled-header-opens-static-
block (`rename_modal`), the Drawer block with `setOpen`/`onOpen` (workflows'
`history-details-drawer.yaml`), and server-built filter `$match` from
client-supplied values (`query-data`).

## Current state

- `modules/ai-reporting/api/resolve-report.yaml` — loads the report (readable
  scope), runs each query section in `:try` through `AnalyticsPipeline`,
  compiles blocks server-side. The summarize endpoint reuses its load/guard
  shape and its per-section `:try` posture.
- `modules/ai-reporting/api/query-data.yaml` — the filter re-query path: client
  sends `{ query, filters: [{field, op, value}] }`, the server builds the
  `$match` from a fixed op map and revalidates the combined pipeline. The
  summarize endpoint applies filters the same way, but derives the triples
  server-side (see decisions).
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` —
  `filterStateKey(field)` → `filter_{field}` page-state keys (:175),
  `boundFilters()` control→op mapping (:297), `requeryActions()` per-filter
  onChange lists (:337), the compiled title row and ⋯ menu that CallMethods
  static modals (:1005–1284). The header button and onChange additions land
  here.
- `modules/ai-reporting/pages/report.yaml` — the Dynamic block's type
  allowlist (SetState, CallAPI, CallMethod, `_state`, `_url_query` all already
  declared) and the static rename/delete modals the drawer sits beside. **No
  allowlist additions needed** — the drawer and all its content are static
  config, which the allowlist does not govern.
- `plugins/modules-mongodb-plugins/src/connections/AiText/` — the one-shot
  connection: `GenerateChatTitle` is the model for `SummarizeReportData`
  (gateway call, request-owned prompt, schema'd inputs).
- `modules/ai-assistant/connections/ai_assistant_text.yaml` +
  `api/title-thread.yaml` — precedent for a module declaring an `AiText`
  connection on `AI_GATEWAY_API_KEY` and calling it from a routine.
- `modules/workflows/components/history-details-drawer.yaml` — Drawer opened
  via `CallMethod: setOpen`, with an `onOpen` event (available if
  auto-generation is ever wanted; deliberately unused here).
- `plugins/modules-mongodb-plugins/src/analytics/constants.js` —
  `MAX_DATA_PART_ROWS = 200` (what a chat card may carry) and
  `PIPELINE_RESULT_CAP = 1000`; the summary's per-section row cap joins these.

## Key decisions and rationale

### Why a drawer, not a section type

The user-facing reason: generated commentary reads better as an overlay the
viewer summons than as a block competing with the numbers — the report body
stays the module's trustworthy, deterministic surface, and the AI prose is
visibly a different kind of content in a different place.

The design reason: the draft's inline `interpretation` section dragged the
whole spec machinery with it — a new section type in `validateReportSpec`, new
agent vocabulary so the assistant could author one, save-sheet handling,
`filterBy` binding semantics, and a persistence question ("does it save?") with
a misleading-stale-prose failure mode. A drawer is page chrome: no grammar
change, no agent change, nothing persisted, and every already-saved report gets
it. Three of the draft's open questions dissolve outright — *which sections
does it interpret* (the whole report; it is a report-level lens, and a
per-section subset would be spec surface with no concrete need), *does it save*
(no; page state only), and *how does it slot into the section list* (it
doesn't).

### Generation re-resolves server-side — the draft's "consumer of resolved rows" cannot work as written

The draft wanted the summary to read "the exact rows the sections are currently
rendering". Those rows are not available to hand over: for unfiltered sections
the resolve-time rows are baked into compiled block properties, not page state,
so the client has nothing to send; and rows shipped from the client would be
client-authored input to the prose — generated "readings" of whatever a caller
chose to claim. Instead the summarize endpoint re-runs each data section's
stored pipeline through the same `AnalyticsPipeline` gate `resolve-report`
uses, under the viewing user's roles, with the active filter values applied.
That guarantees data-and-scope consistency *at generation time*, keeps the
security boundary in one place, and costs one query per data section per
generate — the same order of work as opening the report.

The residual gap is honest and stated rather than hidden: the on-screen numbers
were resolved when the page opened (or when a filter last fired), the summary
queries at click time, so underlying data that changed in between can differ.
The page already carries "Data as of …" for exactly this; the drawer carries
its own "Generated {time}" line.

### Mark-stale, not auto-re-run — the draft's gating question, settled

When a filter changes, the compiled onChange sets `summary.stale: true` (and
refreshes `summary.filter_values`); an open drawer shows a "Filters changed —
this summary describes a previous selection" Alert with the Refresh button
right there; a closed drawer costs nothing. Auto-re-running would spend a model
call per filter change — including every intermediate step of a multi-filter
selection and changes made while the drawer is closed — to keep prose fresh
that nobody is reading. Not configurable per report: one behaviour, no
speculative knob.

### The client sends filter values; the server derives the ops

The payload is a map of `field → current control state` (`region: "West"`,
`period: [start, end]`, `tags: ["a", "b"]`), seeded by the compiled header
button and kept fresh by every filter onChange. The server derives each triple's
op from the *stored spec's* filter sections — daterange → `gte`/`lte` over the
pair, multiselect → `in`/`all` per the section's `match`, select → `eq` —
the same mapping `boundFilters` compiles client-side for re-queries. Values are
untrusted client input exactly as on `query-data`, and contained the same way:
the server builds the `$match` from a fixed op map and revalidates the combined
pipeline. Null/absent values and empty arrays mean "no constraint", matching
the engine's existing drop rule, so an untouched control never narrows the
summary.

**Per-section `filterBy` binding is honoured**: a filter constrains only the
sections that subscribe to it, because that is what the screen shows. A summary
that applied every filter to every section would describe a report that does
not exist.

### Scope is stated in human terms, resolved server-side

`buildSummaryInput` renders the scope line ("Region: West · Quarter: Q3 2026",
or "All data — no filters applied") from the spec's filter section labels and
the active values. Select/multiselect values sourced from declared `options` or
catalog enum `values` are already the human-readable strings. For a filter with
an `optionsQuery` (where values may be foreign-key ids), the endpoint runs that
options query — inside `:try`, role-gated like any other — to map values to
their `labelKey` labels, falling back to raw values if it fails. Daterange
values format as dates. The same scope string goes into the prompt (so the
prose can open with it) and back in the response (so the drawer displays
exactly what the model was told). This resolves the draft's "ids, not labels"
open question with the sources it predicted: the spec's labels, the catalog,
and the query-sourced options.

### The call goes through `AiText`, not the `ai` gateway connection

The draft assumed the `ai` connection "already exists" for this. It exists for
the *agent*: `AIGateway`/`AIGatewayAgent` own conversations, and a plain
"ask the model once, get text back" has nowhere to live there — the exact
reason the `AiText` connection type was created (see its header note). So the
module gains an `ai-text` connection on the same `AI_GATEWAY_API_KEY` secret,
following `ai-assistant`'s precedent, exported and remappable. The summary
reuses the module's `model` var — a separate summary-model var is speculative
surface until a concrete need appears. An app that remapped `ai` to its own
gateway remaps `ai-text` the same way (or supplies the secret); the docs note
covers this.

Unlike `GenerateChatTitle` — a cosmetic call documented to fail silently —
`SummarizeReportData` throws on failure: the viewer clicked Generate and is
owed an error, not an empty drawer. The CallAPI failure stops the action chain
(prior content and state survive) and surfaces through the framework's standard
error handling.

### Explicit Generate button; no auto-generation on open

The header button opens the drawer; the drawer's empty state explains the
feature and offers **Generate summary** (the same button reads **Refresh**
once content exists). One extra click on first use buys three things: the
model-call cost is always a visible, deliberate act; there is exactly one
generate implementation (the drawer's button — no compiled duplicate, the cost
the ⋯ menu had to accept for publish/unpublish); and the loading state is the
Button's own action-in-flight spinner, with no stuck-loading flag to manage on
failure. Auto-generate-on-open was considered and rejected on those grounds —
the Drawer's `onOpen` event exists, so it is a three-line change if a concrete
need surfaces.

### What the model sees, and row caps

Per data section (kpi/chart/table, spec order): its label, type, and result
rows as JSON, capped at **200 rows per section** (a new
`MAX_SUMMARY_ROWS_PER_SECTION`, deliberately the same figure as
`MAX_DATA_PART_ROWS` — both bound "what one model-facing unit may carry") and
`maxResultBytes: 200000` per section query (the `query-data-tool` budget, same
rationale: these rows are model context). Truncation is disclosed to the model
("first 200 of N rows") so the prose can hedge, the same sentence-owed posture
as `sectionHeading`'s "first 1000 rows". Markdown sections' content is included
as author-written context — it is what the report already says about itself.
Download sections are excluded (they render as buttons, not data). The prompt's
grounding rules: only state what the supplied data supports, open by naming the
scope when filters are active, flag rather than explain (no invented
causality), concise markdown out.

### Sections the viewer cannot see are excluded, and the exclusion is named

Each section query runs in `:try` under the viewer's roles — a role-gated or
broken section contributes nothing, so the summary can never describe data the
report page itself withholds from this viewer (the same boundary, in the same
place, as `resolve-report`). The response's `excluded` list names the affected
sections by label and the drawer shows a muted "Not included: …" line when
non-empty: a summary silently omitting a section that is visibly on the page
(even as an Alert card) would misrepresent the report. Labels only, no reasons
— naming *why* would leak the access model, the `SECTION_WITHHELD_DESCRIPTION`
posture.

### Nothing persists

`summary.*` lives in page state: it survives closing and reopening the drawer,
and is discarded on navigation — including the module's own
re-navigation-as-refresh writes (★, rename, publish), which is consistent with
those actions re-resolving the whole page anyway. Persisting prose would
reintroduce the draft's worst failure mode (saved commentary drifting from live
data, or read under a different filter scope than it was generated under) in
exchange for saving a click. If a concrete need to keep or share a summary
surfaces, that is its own design — with the scope-recording obligations the
draft flagged.

### No disable var, no per-report opt-out

The button renders on every report unconditionally. An app that cannot or does
not want to serve the model call simply has a button that errors on Generate —
which argues for configuring the connection, not for a flag. A `disable` var is
a restriction on a guess; it earns its place when an app actually asks.

## Deliberately not in scope

- **Field redaction / model egress control** — carried over from the draft
  verbatim: a separate concern and its own design if needed. The role gate
  already bounds egress to data the viewer can query.
- **Persistence or sharing of generated summaries** (above).
- **Per-section or per-subset summaries** — spec surface with no concrete need.
- **Auto-generation and auto-refresh** (above; both have a recorded three-line
  path in if needed).
- **Streaming the response** — the one-shot AiText shape returns complete text;
  a Generate that takes a few seconds behind a spinner is acceptable for v1.

## Demo consumer and verification

The demo mounts the module (`apps/demo/modules.yaml`) with the bundled `ai`
connection on `AI_GATEWAY_API_KEY`; the new `ai-text` connection uses the same
secret, so the seeded example report (filters bound to three sections —
`reporting-seed-example-report.yaml`) exercises the whole flow with no demo
changes beyond the module bump: open report → AI summary → Generate → change
the region filter → stale Alert → Refresh with the narrowed scope named.
`pnpm ldf:b` verifies the config compiles; the e2e suite can assert the header
button, the drawer, its empty state, and the stale flag on filter change
(all model-free), but generation itself needs a live gateway key — that is a
`/r:dev-test` step, not an autonomous gate.

## Validation notes (code-time checks, none load-bearing)

Two framework behaviours this design relies on are established by in-repo usage
but worth confirming first in implementation: the Button block's built-in
action-in-flight spinner covers the Generate wait, and a compiled block's
`CallMethod` reaches a static sibling by id (the ⋯ menu → `rename_modal` path
proves the direction used here). Neither failing changes the architecture —
the first would add a `summary.loading` flag set/cleared inside the button's
own chain, the second is already proven.
