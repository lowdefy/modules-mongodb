---
title: Implementation walkthrough
module: reporting
type: concept
concepts:
  [
    architecture,
    query-engine,
    agent-tools,
    data-parts,
    report-compilation,
    presentation-contract,
    conversation-persistence,
  ]
---

# Implementation walkthrough

An end-to-end trace of the module as built: chat message in, rendered output out,
with the file and line references for each hop. This is a contributor-facing page
— it describes _how the code is wired_, not how to author against the module. For
authoring, start at the [module index](../index.md); for the engine's model and
security posture in consumer terms, read [The open query engine](open-query-engine.md).

The same walkthrough is kept alongside the design at
`designs/reporting/open-query-engine/implementation-walkthrough.md`. Line
references are signposts against the tree at the time of writing, not guarantees.

## 1. The shape of the thing

Three layers, and the split matters:

| Layer             | Where                                            | Role                                                 |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **Config** (YAML) | `modules/reporting/`                             | pages, agent definition, API routines, connections   |
| **Engine** (JS)   | `plugins/modules-mongodb-plugins/src/analytics/` | validators, compilers, chart builders — pure, no I/O |
| **Boundary** (JS) | `plugins/.../src/connections/ReportingData/`     | the one place a pipeline reaches MongoDB             |

The central design bet: **the AI authors raw MongoDB aggregation pipelines**, and
safety comes from a default-deny grammar walker rather than from restricting the
AI to pre-baked query templates. The AI also never touches presentation config —
it declares a [presentation contract](../reference/presentation-contract.md)
(`x`/`y`/`valueKey`/`columns`) and the server builds every block.

## 2. Build time: the catalog is the whole security model

`modules/reporting/module.lowdefy.yaml:35-61` declares the one required var,
`catalog`. It is simultaneously the data dictionary, the allowlist, and the
authorization boundary — see [The collections catalog](../reference/catalog.md).
It gets bound in exactly two places:

**Into the prompt** — `agents/reporting-assistant.yaml:151-153` appends
`_build.json.stringify` of the catalog to the end of the instruction string at
build time. The agent's whole world-model of the database is this object.

**Into the connection** — `connections/reporting-data.yaml:11-14` binds the same
var onto the `ReportingData` connection, _not_ onto the request. The comment at
`AnalyticsPipeline.js:20-23` is the reason: binding at the connection means every
request validates against the same catalog by construction — a caller cannot pass
a widened one.

Per-collection `roles` are opt-in (see `apps/demo/modules/reporting/catalog.yaml:7-13`):
absent or empty means any authenticated user. Declaring a collection _is_ the act
of exposing it.

> Deployment caveat: when an app remaps `reporting-data` onto its own connection,
> the module's `_module.var` catalog binding is replaced along with it — the
> catalog must be re-bound on the app connection or `validatePipeline` gets none
> and rejects every collection. See `apps/demo/lowdefy.yaml:156-168`.

## 3. Chat → agent

`modules/reporting/pages/chat.yaml:137-146` mounts an `AgentChat` block pointed at
`_module.agentId: reporting-assistant`, keyed by a client-generated
`conversationId` (`chat.yaml:14-15`, a `_uuid`).

The agent (`agents/reporting-assistant.yaml`) is an `AIGatewayAgent` with
`maxSteps: 12`. Its `tools` array (L154-166) is pure wiring — name → endpointId.
All four tool _contracts_ live in the instruction prose (L18-153), which is why
the prompt is long: it teaches the pipeline grammar (L45-64), grain/fan-out
hazards (L66-80), the presentation contract (L96-119), and the report-section
shapes (L121-143). The consumer's optional `app_context` var is spliced in at
L31-42, between the agent's role and those rules.

Teaching the grammar in the prompt is deliberate — the validator's rejections are
actionable strings, so the agent self-corrects cheaply within its step budget
instead of dead-ending.

## 4. The single security boundary

Every tool bottoms out at the same place. Take `query_data`:

`api/query-data.yaml:52-62` runs one request — `AnalyticsPipeline` on the
`reporting-data` connection, passing `query`, optional `filters`, and
`_user: roles`.

`AnalyticsPipeline.js:69-101`:

- L81-82 — report filter triples become a leading `$match`, built server-side from
  a **fixed** op map (`FILTER_OPS = { eq, gte, lte, in, all }`, L49); an unknown op
  throws (L58-60), never silently skips. A null, undefined or empty-array value
  drops its triple — "no constraint", not "match nothing".
- L84-89 — the combined pipeline goes through `validatePipeline`. The
  server-built `$match` is _not_ exempt: it walks like any other stage, so a
  hostile field name is caught by the same gate.
- L92-98 — executes **the reconstructed object the validator returned**, never the
  caller's input by reference, with `maxTimeMS` 30s and `allowDiskUse`.

`analytics/validatePipeline.js` is the actual gate. Its governing idea is at
L42-46: _reconstruct, don't forward_. The walker returns a freshly built tree of
nodes it explicitly classified and approved — a subtree it never visited cannot
reach the database, so a missed case fails closed.

Three separate default-deny grammars:

- **Stages** — `validateStage` (L815-898), against `stageAllowlist.js`
- **Expressions** — `walkExpression` (L227-282); every `$`-key must be
  allowlisted, and `$let`/`$map`/`$filter`/`$reduce` get lexical `$$`-scope
  tracking (L287-353) so an unbound variable is rejected
- **Query documents** — `walkQueryDoc` (L383-419) / `walkOperatorDocument`
  (L440-521), a separate grammar because `$match` is not an expression

Catalog and roles are enforced in `checkCollectionAccess` (L153-168), called for
the base collection (L947) _and_ every `$lookup.from` (L649). Because it is
checked at each encounter, union-of-roles falls out for free: the caller must
satisfy every non-empty roles list among all touched collections, recursively.

The result cap at L908-913 is unconditional — an agent-supplied `$limit` is never
trusted to be the bound, so a trailing `$limit: 1000` is always appended (and to
every `$facet` branch). Caps live in `analytics/constants.js:41-88`; note L52-54,
where several caps exist to protect the _validator's own recursion_, not just
Mongo. `validatePipeline.js:929-931` uses `JSON.stringify` throwing as a free
cycle check before the walker ever recurses.

`validatePipeline.js:52-53` calls out that for `$where`/`$function`/`$accumulator`
this validator is the sole defense — a read-only Mongo principal does not stop
server-side eval.

## 5. Charts and exports: validate now, render at turn end

`render_chart` deliberately **does not** run the query. `api/render-chart.yaml:58-75`
calls `_analytics.validateChartSpec` _with_ the catalog — which runs the full
pipeline grammar and role gate (`validateChartSpec.js:33-42`) — then returns only
the small validated spec (L76-90).

Why: the comment at `render-chart.yaml:2-6`. Tool results are model context,
re-sent on every later step and turn. Returning chart rows would blow up the
context window for the rest of the conversation.

So the rows are fetched exactly once, at turn end, by the `emit-data-parts`
onFinish hook (`agents/reporting-assistant.yaml:167-170`):

1. `emit-data-parts.yaml:17-51` — `_mql.expr` pulls the validated specs out of
   `toolResults` by `toolName`, capped at 8 per turn.
2. L52-67 — `:for` over the chart specs, one `AnalyticsPipeline` each, each inside
   `:try` so a failed query skips its chart instead of killing the hook.
3. L71-81 — `_analytics.buildDataParts` (`buildDataParts.js:29-59`) rebuilds each
   ECharts option. It runs **no catalog gate** — the rows are already in hand —
   but it does run `verifyChartContract` (`verifyContract.js:54-57`), which checks
   the declared `x`/`y` against the _actual_ rows: keys present, y-columns
   numeric. This is the check that cannot be static, since an arbitrary
   pipeline's output shape is unknown.
4. `buildFlintOption.js:46-104` shapes the option by handing the rows to Flint's
   ECharts compiler, which derives label rotation, grid padding, axis types and
   colours from the data, and reports the canvas height its layout needs. The AI
   contributes a kind, a query and two column names; every other line of chart
   config is server-authored.
5. L91-118 — pushes the parts onto the conversation doc as `data_parts` (`upsert:
false` — the prior hook owns doc creation), then L119-125 returns them as
   `dataParts` — the framework's own stream key, not a field this module names.

Client side, `chat.yaml:154-182` accumulates them: `onDataPart` with a `skip`
guard on `_event: type`, appending to `charts` or `downloads` state. The panel at
L293-309 renders charts through a `List` + `EChart`; downloads (L333-360) are
buttons that re-run `query-data` live and pipe the response into `DownloadCsv`.

The asymmetry is intentional — **charts are a snapshot** (option baked at turn
end), **downloads are live** (query stored, executed on click).

## 6. Conversation persistence

Two onFinish hooks, in order. `save-conversation.yaml:20-107` upserts the whole
transcript keyed by `conversationId` + `owner.user_id`; on insert it derives a fallback
title with a `$let`/`$reduce` over the first user message (L42-104 — note L67-70,
the `as: msg` alias, because the inner `$reduce` rebinds `$$this`). If the model
produced a real title, `chat.yaml:200-210` persists it over the top via
`set-conversation-title`.

Restore is where the sharp edges are. `chat.yaml:80-131`: switching conversation
sets `conversationId` and **clears** messages/charts/downloads first (atomic and
infallible), then repopulates from a _fresh_ `get-conversation-results` read. The
comment at L82-88 explains why not from the sidebar list: the list refreshes when
the stream ends client-side, which races the server's onFinish save, so it can be
a turn behind — and continuing from a stale transcript would overwrite the saved
doc. `list-conversations.yaml:34-36` projects `messages` and `data_parts` _out_ to
make that mistake impossible.

This surface needed a framework fix, and that fix is now upstream. `AgentChat`
called `useChat` with a transport but no `id`, so AI SDK v5 created the Chat
instance once per mount and captured the mount-time `conversationId` URL. Every
send in a page session posted under that id, so continuing a restored conversation
forked a duplicate doc without its `data_parts`. It was carried as
`patches/@lowdefy__blocks-antd-x.patch` (commit `7df0cca2`) until the
2026-08-06 build shipped `id: effectiveConversationId` in `blocks-antd-x` itself;
that hunk was then dropped from the patch.

Three `dist/` patches are in play in total, all interim and all owed upstream:
`blocks-antd-x` (the `setInput` method the chat empty state fills the composer
with, and the in-flow two-track welcome), `ai-utils` (`generateMessageId`, without which the assistant
message reaches `onFinish` with `id: ""`), and `blocks-aggrid` (the `cell.type:
menu` renderer the reports list's ⋯ column uses, plus the cell-renderer identity
fix that menu needs — the block rebuilt every renderer on every render, and
ag-grid treats a new renderer function as a different component, so it destroyed
the mounted cell and the popover with it; submitted as
[lowdefy/lowdefy#2310](https://github.com/lowdefy/lowdefy/pull/2310)). They are declared in
`pnpm-workspace.yaml` under `patchedDependencies`, keyed by bare package name so a
release that touches a patched file fails the apply loudly instead of leaving the
patch silently unapplied.

## 7. Chat → saved report

When the user asks for a report, the agent calls `generate_report` with a full
spec. `api/generate-report.yaml`:

- L48-53 — reject if unauthenticated.
- L56-64 — `_analytics.validateReportSpec` **with** the catalog.
  `validateReportSpec.js:126-267` walks every section by type; each query
  section's pipeline goes through `validateQuery` → `validatePipeline`
  (validate-before-persist). The second pass at L270-312 checks filter bindings:
  distinct fields, every `filterBy` resolves to a filter section, every filter is
  bound by something, and a select or multiselect filter has an options source
  (declared `options`, an `optionsQuery`, or catalog enum `values`). The enum
  lookup, `catalogFieldValues`, skips collections the viewer's roles don't allow
  — a no-op on this path (a bound section over an unreadable collection already
  failed `validatePipeline` above), but load-bearing at compile time, where
  `compileReport` calls the same function with no pipeline gate in front of it.
- L65-88 — insert the spec **raw**. The comment at L2-7 is the key decision: the
  reconstructed pipeline is discarded and the AI's verbatim pipeline is stored,
  because _resolve-time revalidation is the guarantee_, not sanitization-at-write.
- L89-98 — return the report URL, which the agent hands back in chat.

## 8. Report render

`pages/report.yaml:12-79` is a single `Dynamic` block resolved by
`resolve-report`. `properties.types` (L30-69) is a bundling declaration — the
compiled output's block/action/operator types must be listed so they ship to the
client. Among them the `Link` action and the `_url_query` operator, which the
owner-only chat links and the drop-and-reload recovery need; the `Box` type the
old pooled filter row required is gone.

`api/resolve-report.yaml`:

- L11-20 — load the spec, owner-scoped; L21-27 whole-report failure → the Dynamic
  block's fallback slot (a 404 `Result`).
- L31-38 — `_analytics.querySections` (`querySections.js:19-24`) returns just the
  kpi/chart/table sections in order. **No catalog is passed here** (L28-30) — it
  is inert extraction only.
- L39-52 — `:for` + `AnalyticsPipeline` per section, each in `:try`. _This_ is the
  per-viewer gate: every stored pipeline is revalidated against the
  connection-bound catalog with the **viewing** user's roles, on every single
  resolve. A section the viewer cannot reach, or that drifted out of the catalog,
  fails as one entry — not the whole report.
- L53-67 — `_analytics.compileReport`. The catalog is passed here for exactly one
  thing (L60-61): resolving select-filter options from a field's enum values. A
  display convenience, explicitly not a gate.

`compileReport.js:727-1090` turns spec + rows into blocks:

- The header opens with a **title row**: the report title, then its actions
  right-aligned beside it on the same 24-column grid row (L789-870). The title's
  span is whatever the actions leave, so it is decided with them. Blocks on the
  grid are block-level cells and the layout engine takes alignment on a container
  rather than an item, which is why each action shrinks to its content and pushes
  itself over with an auto left margin (`RIGHT_IN_CELL`, L69).
- A **★** (`report_favourite`, L834) is compiled for **every** viewer, owner or
  not — favouriting is a read-side act, checked for readability rather than
  ownership. It calls `set-report-favourite` with the _desired_ state (a literal,
  since the compiler knows the current one) and then re-navigates to the same
  report, which is what re-renders the star filled: the report is a
  server-resolved `Dynamic` block with no client refetch. `is_favourite` comes
  from the resolver, derived per viewer from `favourite_of` — the raw array is
  never returned, so a caller cannot learn who else favourited a report.
- Then a provenance `Paragraph` (`report_provenance`, L908):
  each fact joined with `·` and dropped when its input is absent — `Made by
{name} on {date}`, `Last edited {date}` (from the doc's `updated`, never "spec
  changed"), `Data as of {date time}` (the resolve moment), and, for a shared
  report, `Shared with everyone by {name}`. Dates are formatted at compile time
  (`formatTimestamp`, L83-92, en-GB day-first), so no runtime `_dayjs` runs. It is
  shown to everyone who can open the report, not owner-gated.
- When the viewer is the owner and the report has a `conversation_id`, a
  `Continue in chat` `Link` joins the title row beside the ★ (L803); a non-owner,
  or a report with no linked conversation, gets nothing there — and the title
  widens to take the space back.
- The sparse `:for` result array is aligned index-for-index with `querySections`;
  a null (failed) entry is classified (`classifyFailure`, L557-575): a section
  whose valid pipeline queries a role-gated collection the viewer can't reach
  renders a **withheld** Alert (`withheldSectionBlock`, L546-548) that names no
  collection and no role and carries no recoveries — as against a genuinely
  **broken** section (`brokenSectionBlocks`, L455-544), an Alert plus, for the
  owner only, a `Fix in chat` `Link` (when a `conversation_id` exists) and a
  `Drop this section` control that calls `remove-report-section` then re-navigates
  to re-resolve the page. A non-owner's broken Alert names who can fix it and
  offers nothing to click.
- `verifySection` (L595-607) checks the declared contract against real rows; a
  mismatch is caught and rendered through the same `brokenSectionBlocks` path — a
  graceful _rendering_ failure, never a safety one.
- KPI → `Statistic` (L1005), with separators resolved at compile time via
  `Intl.NumberFormat.formatToParts` (`intlSeparators`, L277) so the native
  Statistic formatting matches the table's runtime `_intl` output.
- chart → `EChart` at the canvas height Flint sized for its labels; table →
  `AgGridBalham` (L1034) sized to its rows rather than to the block's 500px
  default (`tableHeight`, L92) — 500 becomes a **ceiling**, so a table near the
  1000-row pipeline cap still scrolls and virtualises; markdown → `Markdown`;
  download → `Button` + `CallAPI` + `DownloadCsv`. Chart and table sections each
  also get their own **⤓** (`sectionDownload`, L138) — a `CallAPI` →
  `DownloadCsv` pair that re-queries the endpoint for the section's full result
  set, not the capped on-screen rows. It shares the section heading's row rather
  than taking one of its own (heading span 20, ⤓ span 4) and renders as the icon
  alone. `hideTitle` is what makes it icon-only and is load-bearing — the `Button`
  block falls back to rendering its **blockId** as the label when `title` is
  absent, so the title is set and suppressed rather than omitted. It is suppressed
  from the accessibility tree too: the block exposes no `aria-label`, so an
  icon-only control here carries no accessible name. A KPI gets no ⤓: a single
  number is already on screen.
- The header's **⋯** is a `DropdownMenu` **compiled into the header**, wrapping the
  ⋯ button as its trigger. The reports list renders the same items from an AgGrid
  `cell.type: menu`, so both surfaces are the same antd dropdown — but the report
  page's has to be compiled rather than static, because a dropdown **owns** the block
  that opens it. A `Modal` can be opened from anywhere by id (`CallMethod`), which is
  how this used to reuse the list's menu; a `Dropdown` or `Popover` cannot, and
  neither registers a method to open one from elsewhere. The ⋯ lives in this compiled
  header row, so the menu lives there too.
  That has a cost, taken deliberately: **publish, unpublish and duplicate have a
  second implementation in the compiler**, alongside the `modules/reporting/actions/`
  files the list's cell `_ref`s — compiled output cannot `_ref` build-time config. A
  change to one of those three endpoints or payloads has to be made in both places,
  and the file comments say so. Rename and delete do **not** duplicate: they only
  open the static `rename_modal` and `delete_confirm_modal`, which both surfaces
  share, so the writes behind them stay single-definition — and their block types
  (`Modal`, `TextInput`, `TextArea`, `ConfirmModal`) stay out of the allowlist, where
  one missed type blanks the whole report. The allowlist cost of the menu itself is
  one block (`DropdownMenu`) and two operators (`_event`, `_ne`).
  The dispatch is why those two operators: the block fires **one** `onClick` for the
  whole menu, carrying the clicked link's id, so each item's actions carry
  `skip: {_ne: [{_event: key}, <item>]}`. An item's link and its actions are emitted
  **together**, so a viewer's compiled config contains only the actions their own menu
  can reach — a reader's page carries no rename or delete action at all.
  Which items show is decided **server-side**, from `is_owner`, `visibility` and a new
  `can_share` input the endpoint computes from the `share_roles` var (`_user` never
  reaches compiled output, so it needs no allowlist entry). `is_owner` and
  `visibility` fall back to the closed position (`false` / `private`), so a resolver
  that omits them hides the owner's items rather than offering Publish on an
  already-shared report. The ⋯ compiles for **every** viewer, like the ★: Duplicate is
  any reader's path to a copy they control, and the menu leaves out what a viewer
  cannot use. The seed is what lets the two shared modals work: they read
  `selected_report`, which the list fills from the clicked grid row and this fills
  from literals — `title`, `description`, `is_owner`, `visibility` — plus `_id` from
  the page URL, since the compiler is never told the report id.
- `selected_report` is that menu's **single source**, and the reason is staleness.
  Only `_id` is live (`__url_query`); everything else is a literal frozen at
  resolve, and the seeding `SetState` re-runs on every ⋯ click — so anything
  seeded there is restored to its resolve-time value each time the menu opens.
  The edit form's `rename_title` / `rename_description` are therefore filled
  **from** `selected_report` when the form opens (`menu_rename_seed`), not seeded
  by each caller, and they stay separate state paths so typing in the form does
  not change the name the delete confirm shows. Writes that leave the page standing
  then correct `selected_report` themselves the moment they succeed — the rename
  modal writes back the saved title and description, and the list's publish and
  unpublish write back the new `visibility` — so the menu is right whether or not a
  reload re-resolved anything. `CallAPI` throws on rejection and stops the chain, so
  a correction only runs on a persisted write.
  Without them a published report would keep offering Publish and keep hiding
  Unpublish — leaving no way to retract short of a hard refresh — and a renamed one
  would show its old title in both the ⋯ header and the edit form. The report page's
  compiled publish and unpublish need no correction for a different reason: they
  re-navigate immediately, so the literals are re-resolved rather than patched. The
  reports list never had the problem at all: it refetches `list-reports` and re-seeds
  from the clicked row.
- Duplicate is followed by its own after-action — a var on the list's shared file
  (`after_duplicate`), a hard-coded new tab in the compiled menu — separate from
  publish/unpublish's reload, because the copy is a **different** report:
  "refresh what you are looking at" re-renders the original and leaves the copy
  invisible. The list refetches its scope (the copy lands in Mine); the report
  page opens the copy in a new tab, navigating by `pageId` + `urlQuery` on
  `duplicate-report`'s returned `report_id`. **Not** the `url` the same response
  carries: `Link`'s `url` param means an _external_ address and gets an `https://`
  prefix whenever the value has no scheme, so a root-relative
  `/{entry}/report?report_id=…` resolves to a host named after the entry. That
  returned url is for the assistant to hand a person in chat; every in-app
  navigation in this module goes through `pageId`/`urlQuery`.
- Vertical rhythm comes from two distances, not one. `report.yaml`'s
  `layout.gap` y value is small — it spaces a heading off the chart or table it
  names — and `SECTION_TOP_GAP` adds the larger distance ahead of each section
  **group**, so a heading sits nearer its own content than the section above it.
  One uniform gap wide enough to separate sections leaves the heading equidistant
  and belonging to neither. The gap is applied by `withTopGap` to the group's
  leading **wrap line**, not to its first block: every compiled block is a
  sibling in one wrapping flex area — the "rows" are wrap lines, not nested
  containers — so a margin on one block alone drops its row-mates out of line
  with it. A group led by its head row gets it on the heading and its ⤓
  together; a group led by filter controls gets it on every control sharing that
  first row, and the head row below them carries none. Anchoring on the group
  rather than the head row is what keeps a filter attached to the section it
  drives: stamped on the heading instead, a control sat one small row gap under
  the _previous_ section and a full `SECTION_TOP_GAP` above its own.
- Each filter's control is emitted once, immediately above the first section (in
  spec order) whose `filterBy` names its field (L828-857) — not pooled in a top
  row. A filter driving more than one section names the others in its label's
  `extra` — the muted `.ant-form-item-extra` line **under** the control, not
  appended to the title (`filterControlBlock`, L615-670). Inline, a filter naming
  three sections wrapped its title over two lines and pushed its input out of
  alignment with the control beside it. A filter bound to one section gets no
  `extra` at all, so nothing renders. The options-truncation note (`— first N`)
  stays on the **title**: it says what the control offers, where the scope note
  says what it moves. All three control types spread `properties.label` into
  their `Label` wrapper, so one shape covers `Selector`, `MultipleSelector` and
  `DateRangeSelector`.
- Controls anchored above the **same** section share a row, at most
  `FILTERS_PER_ROW` (3) of them, and `filterSpans` distributes the group so every
  wrap line it occupies is exactly full — four controls are two rows of two, not
  three and a lone fourth. That matters beyond tidiness: every compiled block is a
  sibling in one wrapping flex area, so columns left over on a ragged trailing line
  are columns the next section flows into, which put a fourth filter on the same
  line as the first two KPIs. Balancing the rows also means no control stretches
  alone across the page. The grouping happens before any control is built, since a
  control's span depends on how many share its anchor. Groups are spanned independently — pulling two anchors' filters onto one
  row would undo co-location. An options-failure Alert takes the group's span too,
  or a full-width Alert between two controls strands the survivor. `report.yaml`
  sets `layout.gap: [12, 0]` on the `Dynamic` block, which is the **content area's**
  gap rather than the block's own placement: the grid defaults to 0, so without it
  adjacent controls touch. The y gap stays 0 so vertical rhythm is unchanged, and
  below the grid's `md` breakpoint every block is span 24 regardless — sharing a row
  is a wide-viewport behaviour only.

**Filters** are the clever bit. `requeryActions` (L91-114) emits a
`CallAPI`/`SetState` pair per bound section. The payload's filter values are
`{ __state: ... }` — deferred client operators (double underscore; the Dynamic
block's server resolution leaves them alone and the client unescapes them,
L41-44). `dataBinding` makes a filtered kpi/table section read
`__if_none: [__state rows, inlined resolve-time rows]` — so it shows server rows
until a filter fires, then live ones. A filtered **chart** section instead pairs
with `chart-data`, and binds `option` and `height` the same deferred way: Flint
inlines the rows into the option and sizes the canvas to the labels, so a
re-query returns a re-assembled option rather than rows. The triples land back at
`AnalyticsPipeline.js:51-67`, which builds the `$match` itself and revalidates the
combined pipeline.

That is why the prompt says, at `reporting-assistant.yaml:138-143`:
since the `$match` is _prepended_, a filterable field must exist at the source
grain, not be a post-`$group` alias — the same limitation stated in
[The presentation contract](../reference/presentation-contract.md).

## 9. Invariants worth keeping in your head

1. **One boundary.** Chat tool, report section, filter re-query, panel download —
   four callers, one `AnalyticsPipeline` request, one `validatePipeline` walk.
2. **Reconstruct, never forward.** Unvisited subtrees cannot execute.
3. **Store raw, validate at read.** Reports revalidate per-viewer on every
   resolve, so catalog and role changes take effect retroactively.
4. **The AI declares a contract; the server builds the blocks.** No AI-supplied
   string is ever evaluated as an operator (`compileReport.js:46-47`).
5. **Contract verification is against rows, not static** — the only honest option
   with arbitrary pipelines.
6. **Failure granularity is per-section / per-chart** (`:try` + Alert cards),
   except a missing report, which is the Dynamic block's fallback slot.
