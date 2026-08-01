# Schema review 1

A **data-model** review, scoped to the two collections the reporting module owns — the
reports store and the conversations store — plus the persisted shapes inside them: the
report `spec` and the conversation's `data_parts`. It reviews the parent's
[data model](../design.md#data-model) and the four sub-designs that write or read it
against the shipped endpoints (`modules/reporting/api/*`, `modules/reporting/defaults/*`),
the analytics validators and compilers that consume the spec, the repo's soft-delete and
change-stamp idioms, and the chat page's binding of the persisted parts.

It is filed against the parent rather than a sub-design because the data model lives here
and four sub-designs read it. Findings name the sub-design that owns the decision.

Ownership ships first precisely because "half of these decisions are data-model decisions
… and every one of them is cheaper to make before reports exist in production stores"
(parent, "Why this, and why now"). These are the ones that are still open, wrong, or
undecided at that deadline. Findings 1, 2, 3 and 9 should be settled before ownership
lands; the rest are cheap now and expensive once documents exist.

## The persisted shapes are missing fields a sub-design already needs

### 1. The chart data part drops the query, so a selected chart cannot become a report section

**Owner: [chat](../chat/design.md) (the part shape) — blocks
[save-as-report](../save-as-report/design.md).**

`buildDataParts` persists a chart as `{ title, option }` — the baked ECharts option and
nothing else (`plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js:63-66`). A
download part keeps its `query` (`:77`); a chart part throws it away.

A report chart section requires `{ chart, query: { collection, pipeline }, x, y }`
(`validateReportSpec.js:194-217`). So save-as-report's premise — "sections as the selected
results in order", the sheet's shape "maps directly onto the report spec the module already
persists, so nothing new has to be modelled" — does not hold for the chart case, which is
the case the panel exists to produce. A rendered option cannot be reversed into a pipeline,
and this is true of the live panel state too, not just a reopened conversation: the chat
page's `charts` state is populated from the same part
(`modules/reporting/pages/chat.yaml:160-169`, and from `get-conversation-results` on
select).

The fix is a part-shape decision, and it belongs to chat because chat is where the part is
defined: carry the validated spec beside the presentation payload —
`data: { title, option, spec: { chart, query, x, y } }`. The spec is small; the option is
the large object. The same requirement lands on the planned `data-report-table` part, which
must carry `{ query, columns }` and not only rows — otherwise the change that
"makes save-as-report worth having on the most common answer shape" produces sections that
cannot be saved either.

Worth stating in whichever design carries it: the persisted spec is what makes a saved
section **live** (re-queried at every resolve) while the panel card stays a **snapshot**.
That is the same split the module already draws between a report section and a chart part,
so it is a clarification, not a new concept.

### 2. Report `title` and `description` exist twice, and the planned rename writes one of them

**Owner: [ownership](../ownership/design.md).**

`generate-report.yaml:75-80` writes top-level `title` and `description` **and** the same
values inside `spec` (the spec is persisted raw, and `validateReportSpec` requires
`spec.title`). The two are then read by different consumers: `list-reports` projects the
top-level pair (`list-reports.yaml:29-32`), and `compileReport` renders the header from
`spec.title`.

`set-report-title` is specified as `{ report_id, title }`, owner-only (ownership,
Endpoints), with no statement of which field it writes. Whichever one it picks, the other
goes stale: the list shows the new name and the report page shows the old one, or the
reverse. `duplicate-report` has the same ambiguity — "`title` / `description` / `spec`
copied" copies both, which is consistent, but only by accident.

Two closures, and the design should pick one in writing:

- **Doc-level fields are canonical for display; the writer sets both in one `$set`.**
  Cheapest, no validator change, but it is two fields to keep honest forever and every
  future writer has to remember.
- **Doc-level fields are canonical, and `compileReport` takes the title as an argument**
  rather than reading `spec.title`. One source of truth, at the cost of a validator and
  compiler change, plus a decision about whether `spec.title` stays required (it must, for
  already-persisted specs — see finding 3).

Per "one correct way", the second is the better shape and the first is the honest
expedient. Either way this is a decision the rename endpoint cannot be built without.

### 3. There is no `spec_version`, and a stored spec is re-validated by current code on every read

**Owner: [ownership](../ownership/design.md) (the insert shape) with
[report-page](../report-page/design.md) (the failure rendering).**

The stored spec is not inert data at read time — it is re-validated on every resolve, twice:
`querySections` calls `validateReportSpec` (`querySections.js:58`) and so does
`compileReport`. The `querySections` call sits in the resolver's `:for … :in`
(`resolve-report.yaml:35-41`), **outside** the per-section `:try`. So a spec that no longer
validates is not one Alert card — it rejects the whole routine, and the `Dynamic` block
renders its fallback: _"Report not found — the report does not exist or you do not have
access to it"_ (`pages/report.yaml:53-59`).

Two consequences, and the second is the worse one:

- Any tightening of the spec grammar retroactively bricks every stored report carrying the
  old shape. This is not hypothetical — table columns once carried a `tag` flag, the
  derived enum-tag styling was dropped (2026-07-22), and the strict-key check now rejects
  `tag` outright (`validateReportSpec.js:233-240`). The same class of change is likely
  again as the filter grammar grows.
- The failure is **misreported**. A perfectly readable report the viewer owns renders as
  not-found-or-unauthorized, which is the one message that tells the owner not to
  investigate. It is also invisible in the logs: the diagnostic `:log` is inside the
  `:catch` for per-section failures, so a spec-level failure produces no line at all.

Three things to settle:

1. **Write `spec_version: 1` on insert.** It cannot be backfilled meaningfully later (there
   is no way to tell which grammar an existing doc was written against), and ownership is
   already changing the insert shape for `visibility` and `favourite_of`, so it is free
   exactly now.
2. **State the compatibility rule**: the validator may loosen for already-persisted shapes,
   never tighten, unless a migration ships with the tightening. Without this written down
   the version field records nothing anyone acts on.
3. **Distinguish the failure.** A spec-validation failure at resolve should render as a
   whole-report Alert that says the spec is no longer valid, not as the 404 fallback.
   Report-page already owns a third Alert variant for withheld sections (per that design's
   review); this is the whole-report sibling of it.

### 4. Persisting the spec raw means a stored report's meaning tracks the current defaults

**Owner: [ownership](../ownership/design.md), as a note on the data model.**

`generate-report.yaml:79-80` stores `_payload: spec`, not the validator's normalized
output. That is the right call and the header comment says why — the pipeline is stored
verbatim so resolve-time revalidation is the guarantee — but the consequence is recorded
nowhere: every default the validator and compiler apply is re-applied at each read, so
changing one silently changes every existing report.

Concretely: a multiselect filter's `match` defaults to `"any"`
(`validateReportSpec.js:357`), section ids are re-derived positionally (finding 5), and
number formatting falls back to `REPORT_LOCALE` / `REPORT_CURRENCY` / `REPORT_DECIMALS` —
`en-US`, `USD`, `2` (`constants.js:41-43`). An app that changes the currency default
changes the meaning of every persisted report that omitted a `format`.

No code change is needed. What is needed is one line in the data model saying that those
constants are part of the versioned contract of finding 3, so a future change to them is
recognised as a spec-compatibility change rather than a display tweak.

### 5. Section ids are positional, and report-page plans to drop sections

**Owner: [report-page](../report-page/design.md) (which edits the spec) with
[ownership](../ownership/design.md) (which owns the stored shape).**

`validateReportSpec` assigns `id = s${index}` from array position, at read time
(`validateReportSpec.js:161`). Nothing persists it. That is stable only while the section
array never changes — and report-page's owner-only **drop a section** is exactly a spec
edit that changes it. Dropping `s1` renumbers every section after it.

Anything that captured an id then silently addresses a different section:

- The resolver's diagnostic `:log`, which carries `section_id`
  (`resolve-report.yaml:63-72`) — and is, by its own comment, "the ONLY place the failure is
  diagnosable".
- A per-section CSV, and the `⤓` action's identity in the compiled config.
- The planned "ask the assistant to fix this section" hand-off, which passes the failing
  section as context into a conversation.

Filter sections are unaffected in one respect — their state key is derived from the field
(`compileReport`'s `filter_${field}`), which is also why the validator requires distinct
filter fields. But the data sections have no stable identity at all.

Fix: persist an id per section, assigned once at create time, and have the validator
preserve a supplied one rather than always overwriting it. It already accepts `id` on a
filter section and deliberately ignores it (`validateReportSpec.js:283-296`) — so the
allowed-key half is done and the preservation half is not. Doing this after reports exist
means either a migration or permanently positional ids.

### 6. `owner.name` is refreshed on conversations and never on reports

**Owner: [ownership](../ownership/design.md).**

`save-conversation.yaml:42-45` re-`$set`s the **whole** `owner` reference on every turn,
with a comment stating the reason: "the name has to be refreshed alongside it so a display
name change propagates". Reports write `owner` once, on insert
(`generate-report.yaml:73-74`), and no writer in the ownership design refreshes it.

So two collections using byte-identical fragments (`defaults/owner.yaml`) disagree about
whether `owner.name` is current state or a snapshot — and the reports side lands on
snapshot by omission rather than by decision. The surfaces that consume it are plate 4's
Visibility column ("Published by …") and report-page's provenance line, both of which can
name a person by a name they no longer use, indefinitely.

The design's own justification for denormalizing the name at all — carried "so a list row
or a report header can name the owner without a lookup" (`defaults/owner.yaml:7-8`, parent
data model) — assumes it is current. Either refresh `owner` on owner-side report writes
(cheap, matches conversations, and `set-report-title` is already a write to piggyback on),
or state in the data model that `owner.name` on a report is a snapshot and the two
collections differ deliberately. The one thing to avoid is leaving it unstated, because the
fragment's shared shape reads as a shared rule.

Note this does **not** apply to the change stamps: `created.user.name` is historical by
design and correctly frozen.

## The conversations collection has two writers and one unbounded field

### 7. `set-conversation-title` inserts a different document shape than `save-conversation`

**Owner: [chat](../chat/design.md).**

Both writers upsert the conversation doc, and they disagree on what a fresh document
contains:

| Writer                   | `$setOnInsert`                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| `save-conversation`      | `created`, `title` (derived), plus `$set` of `messages`, `owner`, `updated` |
| `set-conversation-title` | `owner`, `created` only                                                     |

`set-conversation-title.yaml` writes no `updated`, no `messages`, no `data_parts` — and
would write no `deleted: null` under chat's planned addition. Its own comment records that
this path frequently creates the document: "upsert covers the title arriving (during
streaming) before that onFinish hook has created the doc".

That is a visible defect today, not a tidiness point. `list-conversations` sorts
`updated.timestamp: -1` (`list-conversations.yaml:27-28`); a document missing the field
sorts as null, i.e. **last** on a descending sort. The chat page refetches the rail inside
`onTitleGenerated` (`pages/chat.yaml:212-224`), so the conversation the user is actively
talking to appears at the bottom of their rail until the first onFinish save lands. Under
chat's planned recency grouping it files under "Older". And if the save hook ever fails, it
stays there permanently — `handleAgentChat` only `console.warn`s a failed hook, which
`emit-data-parts.yaml:88-90` already relies on for a different reason.

Fix: `$setOnInsert` the full live shape from both writers — `owner`, `created`, `updated`,
`messages: []`, `data_parts: []`, `deleted: null`. This is the discipline
`generate-report.yaml:86-87` already applies on the reports side, with the comment
"initialised so live documents have a consistent shape", and chat is adding a
soft-delete field whose read predicate depends on exactly that consistency.

### 8. `data_parts` grows without bound, and each entry is the largest object the module writes

**Owner: [chat](../chat/design.md), which already owns an `emit-data-parts` change.**

`emit-data-parts.yaml:111-114` `$push`es the turn's parts with `$each` and no `$slice`.
There is a **per-turn** cap of 8 charts and 8 downloads (`MAX_DATA_PARTS_SPECS`,
`constants.js:12`) and no per-conversation cap at all. Each chart part embeds a baked
ECharts option built from the query's rows (`buildDataParts.js:65`) — the largest object
this module persists anywhere. Meanwhile `save-conversation` `$set`s the entire `messages`
array every turn, so the whole document is rewritten per turn regardless.

A long analytical conversation is precisely the shape that walks toward the 16 MB document
ceiling, and the failure mode at the ceiling is bad: the write throws inside an `onFinish`
hook whose errors are only `console.warn`ed, so the turn is lost with nothing shown to the
user. Chat's planned `data-report-table` part makes this worse — a table part's payload is
rows, and tables are the most common answer shape.

Two cheap changes: bound the array on write (`$push: { data_parts: { $each: […],
$slice: -N } }`, keeping the most recent N), and state the ceiling and the retention rule
in the data model so the panel's "everything you produced is here" promise is honest about
its horizon.

### 9. Persisted parts carry no id and no timestamp

**Owner: [chat](../chat/design.md) (the part shape) with
[save-as-report](../save-as-report/design.md) (the selection binding).**

A part is `{ type, data }` and nothing else. Two gaps follow.

**No identity.** Selection binds to `charts.$.selected` — an array index over a
type-filtered projection of `data_parts` in stored order
(`get-conversation-results.yaml:51-72`). Any operation that shifts the array under an open
selection re-points the ticks: a concurrent turn's `$push`, the `$slice` retention of
finding 8, or any later delete/regenerate affordance. Save-as-report makes selection
load-bearing ("selection is the panel's only marking affordance"), so it wants an id per
part, not a position. It is also what a per-card `⋯` action would need to address a single
result.

**No timestamp.** Report-page makes "when these numbers were computed" a first-class
provenance fact, and argues it is free there because the page resolves on load. The chat
panel cannot answer the same question about the same data: a chart part is a snapshot with
no recorded time, restored on select from a document that only knows when the conversation
was last touched. A part built with `{ id, created }` answers both, and finding 8's
retention rule becomes expressible as an age rather than only a count.

## Storage-level concerns the model should state

### 10. No indexes are declared for either collection, and the list endpoint is about to become the authorization boundary

**Owner: [ownership](../ownership/design.md), which rewrites `list-reports`.**

Nothing in this repo creates an index (`grep -rn createIndex` finds only a design review).
For modules that query the **host app's** collections that is the app's business — but
reporting is different: it **owns** these two collections (`reports_collection`,
`conversations_collection` vars over its own `REPORTING_MONGODB_URI`), so nobody else is in
a position to index them.

What the reads look like after ownership lands: `owner.user_id` + `deleted.timestamp` with
a sort on `updated.timestamp` today; then `visibility`, `favourite_of`, a search term, a
user-selectable sort, and `$skip`/`$limit` inside a `$facet`. Plus `conversation_id`
lookups once the report ↔ chat link exists, and the conversation rail's own
`owner.user_id` + sort. Unindexed, every list open is a collection scan feeding a blocking
in-memory sort — which has a memory ceiling, so this degrades into an error rather than
just latency on a busy shared collection.

Two things belong in the design, and per the repo's "resolve the open question" rule
neither should wait for code time:

- **Which indexes the module expects, and who creates them.** There is precedent for the
  mechanism: the module already ships a catalog bootstrap CLI
  (`docs/reporting/how-to/bootstrap-catalog.md`), so an index bootstrap is a known shape
  rather than a new one. The alternative — documenting them as a host-app responsibility —
  is defensible but has to be written down, because "the module owns the collection" makes
  silence read as "no indexes needed".
- **What `search` actually is.** The ownership design lists `search?` as a `list-reports`
  parameter without deciding between a regex scan over `title`/`description` and Atlas
  Search. That decision determines whether an index helps at all, and whether the endpoint
  is portable to a non-Atlas deployment. `docs/shared/soft-delete.md` already documents the
  Atlas Search form of the soft-delete predicate, so both paths are live in this repo.

### 11. Minor: the reports collection's default name is from an earlier concept

**Owner: [ownership](../ownership/design.md).**

`reports_collection` defaults to `report_layouts`
(`modules/reporting/module.lowdefy.yaml:73-76`) while the module, its docs, every endpoint
and all five sub-designs call them reports. Renaming a default is breaking for an app that
relies on it, so the window is now (the module is at `0.20.0` and the ownership change is
already breaking-adjacent) or never. Either rename it to `reports` with a changeset, or add
a line to the var description explaining that the default name is historical — an
unexplained mismatch between a collection name and everything that talks about it is a
standing "is this the right collection?" question for every consumer.

### 12. Minor: conversation `_id` is client-supplied, which makes the owner-scoped upsert an insert path

**Owner: [chat](../chat/design.md), as a note.**

The conversation id is generated in the browser (`pages/chat.yaml:20-22`, `_uuid`) and both
conversation writers upsert on `{ _id, owner.user_id }`. If the supplied `_id` matched a
document owned by someone else, the filter would miss and the upsert would attempt an
insert on a duplicate `_id` — an E11000 inside a hook that only warns, so the turn is lost.
With uuid4 this is unreachable in practice and needs no guard; it is worth one line
acknowledging that a client-generated key makes the owner-scoped upsert an insert path,
because the same pattern with a guessable id would be a real integrity problem.

## Verified as written

Checked against source and found accurate — no action needed:

- **`owner` is correctly not the `created` stamp.** The reasoning in `defaults/owner.yaml`
  and the parent data model holds: `created` is `$setOnInsert` history, ownership is current
  state, and authorizing off the stamp would make `created.user` load-bearing while
  `updated.user` beside it is not. This is what leaves room for a transfer later.
- **The soft-delete shape and predicate** match `docs/shared/soft-delete.md` exactly on
  both collections' plans: field `deleted`, `{ timestamp, user: { name, id } }`, initialised
  `null`, read predicate `deleted.timestamp: { $exists: false }`. `delete-report.yaml`
  additionally excludes already-deleted docs so a repeat delete cannot overwrite the
  original who/when.
- **`visibility` absent read as `private`, and `favourite_of` absent read as empty**, so
  neither addition needs a migration of existing report documents — correct as specified.
- **The camelCase boundary is real and correctly drawn.** `conversationId`, `messages`,
  `steps`, `toolResults` and `dataParts` are the `AgentChat` block's property and the agent
  framework's hook-payload keys; every field reporting itself names is snake_case, including
  the `data_parts` the framework's `dataParts` persists into
  (`emit-data-parts.yaml:117-123`).
- **Filter identity as the field name, and the distinct-fields requirement.** Justified
  rather than arbitrary: `compileReport` derives the filter's block id and page-state key
  as `filter_${field}`, so two filters on one field would collide in page state.
- **Owner scoping is on `_user: id` everywhere, and derived server-side rather than from a
  payload.** All five report and conversation writers and all four readers match
  `owner.user_id` against `_user: id`; the two HTTP-callable hook endpoints carry comments
  explaining why the payload's id is never trusted.
- **`favourite_of` as an array is the right shape at module scale**, with the
  join-collection swap named as the escape hatch — as the ownership design already states.
- **Per-section failure isolation on resolve** works as described for query failures: each
  `AnalyticsPipeline` runs inside `:try`, the sparse `:for` result array aligns
  index-for-index with `querySections`, and `compileReport` renders a sparse entry as an
  Alert card. Finding 3 is about the spec-level failure path outside that `:try`, not this
  one.
