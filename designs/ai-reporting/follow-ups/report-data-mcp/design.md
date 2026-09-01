# Report-data MCP (DRAFT)

> **Status: draft, updated 2026-09-01.** The original crux — identity and
> authorization for MCP callers — is resolved by a Lowdefy platform feature
> (verified against the published experimental packages, see below). What
> remains open is adoption timing. The module-side work is scoped below and is
> larger than "wrap the existing endpoints": no endpoint today returns a saved
> report's resolved rows.

A saved report already resolves to structured data — the open engine runs each
section's validated pipeline and returns rows (KPI values, table rows, the rows
behind each chart). Today that data only ever renders inside the reporting UI.
The idea: expose it over an MCP server so a user can reference a report by id and
pull its resolved data into _their own_ agent, then build a presentation, a
narrative, a spreadsheet — whatever — from it, without re-deriving the queries.

This is specified to be built from. Adoption timing (below) still gates when,
but the endpoint and envelope decisions here are meant to be implemented as
written rather than re-opened. **The concrete consumer is not yet recorded in
this design and should be** — it is the one thing that would let a reader check
the envelope decisions against a real need instead of against judgement.

## The platform feature this builds on

Lowdefy ships (in experimental releases — see **Version status** below) a
first-class **MCP server surface**: a top-level `mcp` block in `lowdefy.yaml`
exposes the app's own `Api` endpoints as MCP tools, served at `POST /api/mcp`
over streamable HTTP. This is not the dev-server docs MCP (`/lowdefy-docs/mcp`,
dev tooling only) — it is a product surface available in production builds.

Verified behaviour (from `@lowdefy/api` `routes/mcp/createMcpServer.js` and
`@lowdefy/build` `buildMcp.js` + `lowdefySchema.definitions.mcp` in the
experimental release):

- **Config surface:**

  ```yaml
  mcp:
    name: my-app-tools # serverInfo; title/websiteUrl/icons optional branding
    endpoints:
      - id: ai-reporting/list-reports
        scope: mcp:read
      - id: ai-reporting/get-report
        scope: mcp:read
      - id: ai-reporting/get-report-data
        scope: mcp:read
  ```

  `id` and `scope` are both **required** per entry, and `scope` is a closed
  enum (`mcp:read` | `mcp:write`) enforced by strict subtree validation — a
  bad `mcp` block fails the build rather than warning.

- **Tools are just API endpoints.** Each exposed endpoint must be type `Api`
  (`InternalApi` fails the build), and must carry a `description` and a
  `payloadSchema` — the schema becomes the MCP tool's `inputSchema`, so
  clients know exactly what arguments to pass. Tool names are the endpoint id
  with `/` → `__`.
- **Agent tools were removed** from the `mcp` block (`mcp.agents` is a build
  error with a removal notice). Endpoints are the only tool kind.
- **Authorization is the app's own auth, not a parallel scheme.**
  - Tool listing and tool calls run through the same per-caller
    `context.authorize` as pages and API endpoints; unauthenticated MCP
    clients see only public tools.
  - Protected or role-gated tools **require `auth.oauthProvider`**, so MCP
    clients such as claude.ai connectors or Claude Code run a standard OAuth
    flow and present bearer tokens. The build fails if a non-public endpoint is
    exposed without it. The **author-facing** surface is small: the schema
    requires exactly one field, `consentPage`; `dynamicClientRegistration` is
    optional and off by default ("pre-registered clients are the primary
    path"); and JWKS plus resource binding are engine routes
    (`getMcpJwks.js`, `getMcpResourceBinding.js`), not app config. The real
    work is the page `consentPage` points at — see **The consent-page
    dependency** below.
  - The resolved caller is a real app user: `_user` in the endpoint routine
    is populated, so **owner scoping (`owner.user_id`) and per-viewer role
    gates carry over unchanged** — the exact property the original draft
    flagged as the unresolved crux.
  - A second gate on this surface only: each tool carries a `scope` tag
    checked against the OAuth token's granted scopes (`scopeCovers`, with
    `mcp:write` implying `mcp:read`), both at listing and at call time.
  - A role or scope shortfall answers identically to an unknown tool name,
    so gated tools cannot be enumerated.

### Version status (verified 2026-09-01)

- Stable `@lowdefy/api` (5.6.0) does **not** contain the MCP server route.
- The pinned version in this repo (`0.0.0-experimental-20260814133003`) also
  predates it.
- The MCP route and OAuth resource lifecycle ship in current experimental
  releases (`routes/mcp/createMcpServer.js`, `getMcpJwks.js`,
  `getMcpResourceBinding.js`, `oauthResourceLifecycle.js` — verified present
  in `0.0.0-experimental-20260828095120`). The `experimental` dist-tag moves
  frequently; re-verify against whatever tag is current at adoption time
  rather than trusting a version string recorded here.
- The framework's `feat/agents-external-api-mcp-channels` branch holds an
  earlier iteration (API-key/JWT `auth.strategies`, agent tools, external
  agent API); the shipped experimental moved protected MCP to the app's own
  OAuth provider and dropped agent tools. Design against the experimental
  package, not that branch.

## Goal

Expose the reporting module's saved reports as MCP tools so an external agent
can consume a report's data directly:

- `ai-reporting__list-reports` — reports the caller may see.
- `ai-reporting__get-report` — a report's spec/metadata (sections, filters,
  titles).
- `ai-reporting__get-report-data` — resolve a report (optionally with filter
  values) and return its section rows as structured JSON.

Tool names are derived, not chosen: `createMcpServer.js` applies
`id.replaceAll('/', '__')` to the entry-scoped endpoint id, so hyphens survive
and the module entry id becomes part of every tool name. An app that mounts the
module as `reporting` gets `reporting__list-reports` instead — which means a
tool `description` can never hardcode a sibling tool's name.

## Module packaging — resolved: no modules-system change needed

The `mcp` block is app-level config, and it addresses endpoints by the
**entry-scoped id**, which is exactly what module endpoints already build to.
Verified in the demo's build artifacts:

```
apps/demo/.lowdefy/server/build/api/ai-reporting/list-reports.json
  id:         endpoint:ai-reporting/list-reports
  endpointId: ai-reporting/list-reports
```

`buildMcp` matches on `e.id === tool.id || e.endpointId === tool.id`, so a
consuming app lists `ai-reporting/list-reports` and the tool name becomes
`ai-reporting__list-reports`. Nothing needs to be threaded through the module
system.

A manifest `mcp` export was considered and **rejected**: module manifests
resolve `pages`, `connections`, `api`, `agents` and `notifications` — adding a
sixth kind would be new framework surface to earn a mechanical guarantee the
app-level block already provides. Documenting which endpoints are MCP-suitable
and their intended `scope` tag in `docs/ai-reporting/` is sufficient.

## What this reuses — and what it does not

**Reused: the resolution engine.** The `AnalyticsPipeline` connection is the
security boundary — it revalidates each stored pipeline against the
connection-bound catalog with the calling user's roles, prepends the filter
`$match`, and runs it read-only against a read-only principal. MCP-facing
endpoints go through that same path. One correct way.

**Reused: the authorization model — once it is made reusable.** Saved specs
live in `report_layouts` (`reports_collection` var), read through `_user`-scoped
queries. Because the MCP caller is a real app user, publish/`share_roles`
visibility carries over with no new MCP visibility rule to design, and adding
one would be a second way to answer the same question.

But that is an **obligation, not an automatic property**, and the duplication
is already worse than it looks. The readable predicate —

```yaml
$or:
  - owner.user_id:
      _user: id
  - visibility: shared
```

— appears **five times across four files** today: `duplicate-report.yaml` ×1,
`list-reports.yaml` ×2 (the `favourites` and `all` branches),
`resolve-report.yaml` ×1, `set-report-favourite.yaml` ×1. Two MCP endpoints
would make seven copies of a match whose own comment says "a bug in it is a
confidentiality bug rather than a display bug" (`list-reports.yaml:4-5`).

**Decided:** extract it — but note the mechanism, because it is not a pipeline
stage. The predicate is a **fragment spliced inside** larger `$match` objects
that add different sibling conditions: `favourite_of` plus
`deleted.timestamp: {$exists: false}` in the favourites branch,
`deleted.timestamp` alone in the all branch, `_id` plus `deleted.timestamp` in
`resolve-report`. So it is a `_ref` returning the `$or` **value**, spliced into
each match — not a file under `api/stages/` referenced as a stage.

The selectivity is deliberate and must survive: `list-reports`' `mine` branch
is owner-matched at any visibility, and `deleted` inverts the stamp test and is
owner-only. Neither uses the readable predicate, and neither should start.

The reject-if-unauthenticated guard is a separate duplication with the same
argument (`resolve-report.yaml:19-22`, `list-reports.yaml:24-28`) and extracts
the same way. Locations for the predicates themselves:
`list-reports.yaml:56-124` (the `_switch` branches), `resolve-report.yaml:39-42`.

**Not reused: an endpoint that returns a report's rows.** The earlier draft's
claim that the MCP tools are "thin wrappers of existing endpoints" does not
survive contact with the code:

| Endpoint         | Type          | `description` | `payloadSchema` | MCP-exposable today |
| ---------------- | ------------- | ------------- | --------------- | ------------------- |
| `list-reports`   | `Api`         | no            | no              | no — build error    |
| `resolve-report` | `InternalApi` | no            | no              | no — build error    |
| `query-data`     | `Api`         | yes           | yes             | yes, but see below  |

- `resolve-report` is `InternalApi`, reads `_payload: urlQuery.report_id`, and
  **compiles spec + rows into blocks server-side** for the Dynamic block. It is
  shaped for the renderer, not for a data consumer. Flipping it to `Api` to
  expose it would also open the block-compiling resolver to browser callers —
  a change to the app's external surface made for an unrelated reason.
- `list-reports` is the right shape but carries neither `description` nor
  `payloadSchema`, so it is a hard build error the moment it is listed.

**`query-data` is never listed in an `mcp` block.** It takes a caller-authored
`collection` + `pipeline`, and the open engine deliberately has no field-level
scoping. Per [`open-query-engine`](../../open-query-engine/design.md) §5:

> with no field scoping, an empty pipeline (or `$replaceRoot: { newRoot:
"$$ROOT" }`, or `$getField`) returns **every field of every touched
> collection**, up to the injected row limit — i.e. a full, bounded dump of any
> cataloged collection is available to any authorized caller.

That is an accepted consequence in-app, where the caller is a signed-in user in
a browser session. Over MCP the same capability goes to a third-party agent
holding a long-lived OAuth bearer token, driven by a model, running on
infrastructure the app operator does not control. Same authorization,
materially different exposure — "declare the collection = expose the
collection" reads differently when the reader is autonomous.

The module cannot enforce this: `mcp` is app config. So the prohibition is
stated here and must also be stated in `docs/ai-reporting/`, where the app
author will look.

## Endpoint work required

Three module `Api` endpoints, each with `description` + `payloadSchema`. Two of
them splice the extracted readable predicate above; the `list-reports` sibling
does not, because it delegates to an endpoint that already has it.

- **`list-reports`** — add a **dedicated MCP-facing sibling** rather than
  annotating the existing endpoint. Its `scope` payload parameter is required
  and validated against a closed set (`mine`, `shared`, `favourites`, `all`,
  `deleted`), and the MCP surface should be **narrower**: `deleted` is not
  offered. The recycle bin is a UI affordance; an external agent pulling report
  data has no business enumerating soft-deleted reports. Per the rule below,
  that narrowing must live in the sibling's **routine guard**, not only in its
  `payloadSchema` — which is the real reason a sibling is needed rather than an
  annotation on `list-reports`: it needs a different guard, not just a
  different schema. (Note the vocabulary collision: this `scope` payload is
  unrelated to the MCP `mcp:read` tool `scope` tag.)

  **The sibling is a guard plus a delegation, not a reimplementation.**
  `list-reports.yaml` is 309 lines, and the five per-scope `$match` branches in
  its `_switch` (`list-reports.yaml:56-124`) _are_ the authorization boundary —
  its own comment says "a bug in it is a confidentiality bug rather than a
  display bug." Copying that into a sibling is the duplication this design
  condemns, at the largest scale available. So the sibling rejects `deleted`
  (and re-runs the signed-in and scope-enum guards, since a delegated call must
  never depend on the target's guards to be the only ones), then hands off with
  a routine step of `type: CallApi`:

  ```yaml
  - id: delegate_list
    type: CallApi
    properties:
      endpointId:
        _module.endpointId: list-reports
      payload:
        _payload: true
  ```

  Verified mechanics: `handleEndpointCall.js` stores the target's return value
  as this step's result (`addStepResult` with `result: response`) so the sibling
  can `:return` it unchanged, propagates a `:reject` from the target to the
  caller, and `invokeEndpoint.js:26` re-authorizes the target endpoint — the
  delegation is not an authorization bypass. Precedent in-repo:
  `modules/contacts/api/update-contact.yaml:56-63`,
  `modules/user-admin/api/invite-user.yaml`, `update-user.yaml`. Cost: roughly a
  dozen lines and zero duplicated authorization logic.

- **`get-report`** — returns the saved spec so the agent learns what
  `get-report-data` will accept for this particular report: section ids, types,
  labels, the presentation contracts, and the **filter definitions**.

  **The queries never leave the server.** "The saved spec" is not the whole
  stored document: a section carries its `query: { collection, pipeline }`, so
  returning the spec verbatim would hand a third-party agent catalog collection
  names, aggregation stages and field paths. This design already refuses to list
  `query-data` in an `mcp` block because the open engine has no field-level
  scoping; shipping the pipelines that engine would run is the disclosure half
  of the same concern. Nothing in the module exposes a pipeline today — no page
  renders a spec, and `list-reports`' search deliberately skips it because "a
  report's pipelines and field names are not text the user wrote"
  (`list-reports.yaml:125-128`).

  So the rule is one line, stated once and applied everywhere a section is
  serialized: **return the section minus `query` and `optionsQuery`.** Nothing
  else is stripped, so every presentation field survives — per
  `validateReportSpec.js:17-24`, that leaves `kpi` with `valueKey`/`format`,
  `chart` with `chart`/`x`/`y`/`stacked`, `table` with its `columns` contract,
  `filter` with `control`/`field`/`options`/`match`, `markdown` with `content`,
  `download` with its `label`, and `id`/`type`/`label`/`filterBy` throughout.
  Phrasing it as a subtraction rather than an allow-list matters: a seventh
  section type added later is safe by default, where an enumeration would
  silently drop its new fields.

- **`get-report-data`** — new. Takes `report_id` plus optional filter values,
  runs each query-backed section through the same validated engine
  `resolve-report` uses, and returns a **self-contained response built by
  walking the spec** (see below) instead of compiled blocks.

### `payloadSchema` is advertisory — every guard lives in the routine

`payloadSchema` is **not validated at runtime.** It occurs in three places
across `@lowdefy/api` and `@lowdefy/build`: the schema type definition
(`lowdefySchema.js:2251`), a build-time **presence** check for MCP tools
(`buildMcp.js:112`), and the equivalent for agent tools
(`buildAgents.js:151`). Nothing checks an incoming payload against it. The MCP
call handler passes tool arguments straight through —
`callEndpoint(context, { blockId: '_mcp', endpointId, pageId: '_mcp', payload: args ?? {} })`
in `createMcpServer.js` — and `handleValidateSchema.js` is an opt-in routine
_step_ taking its own `schema` and `data` properties, not automatic payload
validation.

So the schema tells a **well-behaved** client what to send. It stops nothing. A
caller holding a valid token can post any payload the endpoint's own routine
will accept.

Two consequences, and they apply to all three endpoints:

1. **Every payload assumption is guarded in the routine.** The `scope`
   narrowing above, `report_id` shape, filter keys — all of it. A schema-only
   restriction is documentation wearing a guard's uniform.
2. **The schema is still worth writing well**, because it is what makes the
   tools usable: it becomes the MCP `inputSchema` a client reads to decide what
   to send. Ergonomics, not enforcement — and the design should never again be
   read as claiming otherwise.

### The filter values need a server-side binder — this is new code

`get-report-data` cannot reuse the UI's filter binding. `boundFilters`
(`compileReport.js:297-325`) emits triples whose values are **deferred
placeholders** — `{ field, op: "eq", value: { __state: key } }` — which are
baked into the compiled blocks and resolved _by the browser_ from live page
state at `onChange` time. An MCP caller has no page state and no `onChange`.

So the endpoint needs a server-side binder taking `{ filterField: value }` from
the payload and producing the same triples under the same control→op rules
(`daterange` → a `gte`/`lte` pair, `multiselect` → `in`/`all` per the section's
`match`, `select` → `eq`). **The control→op mapping must be extracted so
`boundFilters` and the server-side binder consume one copy** — two hand-kept
copies will drift the first time a fourth control is added, and the failure
mode is a filter that silently does nothing.

**Date values need explicit coercion, or `daterange` filters silently match
nothing.** `callEndpoint` deserializes the payload before the routine sees it
(`payload: serializer.deserialize(payload)`), and Lowdefy encodes Dates on the
wire as `{"~d": "<ISO>"}` or `{"~d": <epoch ms>}` (`@lowdefy/helpers`
`serializer.js:46,50` writing, `198-199` reading). An MCP client reads a JSON
Schema and sends `"2026-01-01"` — a plain string, which deserializes to a plain
string, reaches a MongoDB `$match` against a BSON date field, and matches
**nothing**. No error, no rejection: an empty result the agent reports as "no
data in that range."

Requiring callers to emit `{"~d": …}` is the wrong contract — no agent will
reliably produce it, and it leaks an internal wire format into a public tool
schema. So: the binder **coerces ISO-8601 strings to `Date`** for `daterange`
controls, the `payloadSchema` declares those fields as
`type: string, format: date`, and an e2e case asserts a date-filtered section
returns the same rows a UI-driven filter would. The other controls pass values
through unchanged (`select`/`multiselect` values are strings and arrays of
strings already).

**Filter discoverability has a structural limit worth recording:** a report's
accepted filters live in its saved spec and differ per report, so a static
`payloadSchema` cannot enumerate them. The schema declares the _shape_ of the
filter argument; the _valid values_ come from `get-report`. This is why
`get-report` exists as a separate tool rather than being folded into
`get-report-data`.

### The response is built by walking the spec, not assembled by hand

`get-report-data` is **self-contained**: it walks the saved spec server-side and
attaches each section's results by section id, so one call returns labels,
types, prose and rows already joined. The calling agent does no joining.

That choice is structural, not ergonomic. The module already has a shape for
"spec plus per-section results": `querySections` (`querySections.js:57`)
returns `{ id, type, query }` per query-bearing section, and its docstring
states the contract — the `:for` loop's "resulting (possibly sparse) step array
aligns index-for-index with this list and feeds `compileReport`'s `results`
param." Every field a consumer needs already exists in the spec. Defining a
parallel envelope vocabulary would mean hand-copying each field across and
keeping two vocabularies in sync forever; two things were already dropped that
way in earlier drafts of this design (the section `label`, and `markdown`
content). Deriving the response from the spec makes that class of omission
impossible.

**The strip rule from `get-report` applies here too**, and this is the one place
walking the spec cuts against us: an implementer copying sections across will
carry `query` and `optionsQuery` with them unless told not to, and that would
put the pipelines outside the server through the back door. Same subtraction,
same single rule — sections are serialized minus `query` and `optionsQuery`,
here as there.

**Download sections are resolved here, unlike in the UI — and that requires a
flag, not a change to the shared list.** A download section is
`{ type: download, label, query }` (`validateReportSpec.js:24`): a label and a
query, no column contract. In the UI it is a button whose query runs
client-side on click, which is why `orderedQueries` filters on a hardcoded
`["kpi", "chart", "table"]` (`querySections.js:18`) and downloads never reach
the resolve loop. For this surface that exclusion is backwards: a download is
the report author's own declaration of "here are the actual rows", which is the
closest thing in the spec to what an MCP consumer came for.

But it must **not** be added to the shared list. `resolve-report` consumes the
same `orderedQueries` output, and its `:for` step array "aligns index-for-index
with this list and feeds `compileReport`'s `results` param" — so widening the
filter would both shift that alignment and make every UI report open run an
extra pipeline per download section, for rows the page does not render. So:
`orderedQueries(sections, { includeDownloads })`, defaulting to off, with
`get-report-data` the only caller that passes it. One copy of the enumeration,
two callers, no behaviour change to the UI path.

Because a download declares no `columns` contract, its `columns` are derived
from the keys of the first returned row (an empty result yields an empty
`columns`). The row cap and `truncated` flag apply exactly as they do to a
table.

**Which of the remaining sections carry data is already settled by existing
code**, per the `querySections` docstring: "Download sections query client-side on click,
markdown sections have no query, and a filter without an optionsQuery has
nothing to run — all are excluded." So of the six types
(`validateReportSpec.js:433` closes the vocabulary at `kpi, chart, table,
filter, markdown, download`):

| Type       | In the response as                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kpi`      | the resolved scalar (`valueKey` read from row 0) plus `rows`                                                                                          |
| `chart`    | `columns` + `rows`                                                                                                                                    |
| `table`    | `columns` + `rows`                                                                                                                                    |
| `filter`   | the filter definition, plus resolved options if `optionsQuery`                                                                                        |
| `markdown` | its `content` from the spec — no query, but it is the report author's own prose and the most directly useful section for an agent writing a narrative |
| `download` | `columns` + `rows`, resolved server-side like any other data section — see the note below on why this differs from the UI                             |

### The response must state what the UI states visually

Two signals exist in the rendered report that a bare rows payload would drop.
Both turn "partial data" into "data the agent reports as complete", which is the
worst failure this surface can have — a wrong number delivered confidently,
with no reader positioned to doubt it.

**Truncation.** `validatePipeline.js:980` appends `{ $limit: PIPELINE_RESULT_CAP }`
to every pipeline unconditionally (`constants.js:118` — 1000). The only place
that becomes visible is the block compiler: `compileReport.js:614-624` checks
`rows.length >= PIPELINE_RESULT_CAP` and rewrites the section's **heading
string** to `"{label} — first 1000 rows"`. Its comment gives the reason — "a
table silently showing its first 1000 rows reads as the complete answer, and a
reader has no way to tell the difference." An agent that receives exactly 1000
rows will total them and state the total as fact. This module already committed
to the principle in [`report-filters`](../../report-filters/design.md)
("Truncation is stated, not silent"); the response inherits it rather than
re-deciding it.

**Degradation.** A section the viewer's roles exclude renders as an Alert card
— unmissable, occupying the section's space. The same thing as a per-section
error key in JSON is something an agent iterates straight past, then presents
"the report" with a section silently absent.

Both are reported per section **and** listed at the top level, in **two
separate lists** — truncation and failure are different conditions calling for
different behaviour, and one boolean cannot carry that. Truncated data is usable
with a stated caveat; a failed section is simply absent:

```jsonc
{
  "report_id": "…",
  "title": "Q3 orders",
  "applied_filters": { "order_date": ["2026-07-01", "2026-09-30"] },
  "truncated_sections": ["orders_table"],
  "failed_sections": ["revenue_by_region"],
  "sections": [
    {
      "section_id": "s0",
      "type": "markdown",
      "label": "Summary",
      "content": "Orders are counted at the line level…",
    },
    {
      "section_id": "orders_table",
      "type": "table",
      "label": "Orders by region",
      "columns": ["region", "total"],
      "rows": [
        /* … */
      ],
      "truncated": true,
      "row_cap": 1000,
    },
    {
      "section_id": "revenue_by_region",
      "type": "chart",
      "label": "Revenue by region",
      "error": "Section could not be resolved.",
    },
  ],
}
```

Note `section_id` is often positional: `validateReportSpec.js:85` derives
`s${index}` when the author supplied none, so `s0`/`s1` are the common case
rather than the readable ids above. That is exactly why `label` is carried on
every section — an agent handed `s0` and no label would have to invent a
section title, which is the confident fabrication this surface exists to avoid.

`applied_filters` echoes the filter values actually used, for the same reason
truncation is stated: a number from a filtered slice reported as a number from
the whole dataset is wrong, and the agent cannot know the difference unless told.

The tool `description` instructs the caller to check both lists before
reporting any figure.

## The consent-page dependency — not this design's work

Exposing any protected endpoint as an MCP tool requires `auth.oauthProvider`,
which requires a consent page. That page has nothing to do with reporting: it
renders the requesting client, shows the scopes being granted, and posts an
approve/deny decision. Every app exposing any MCP tool needs one, whatever the
tools do.

In this repo that category already has an owner. `user-account` ships
`login.yaml`, `logout.yaml` and `verify-email-request.yaml`, and the app simply
points `authPages` at them (`apps/demo/lowdefy.yaml:38`). A consent page belongs
there, next to login, by exactly the same argument.

**Decided:** this design declares the dependency and does not carry the work.
The consent page needs its own design under `user-account` — it is not trivial
(a production app on this feature implements one in roughly 680 lines across six
files, some of that multi-tenant selection this repo would not need), and it is
the wrong thing to grow inside a reporting follow-up. The next module wanting an
MCP tool should inherit it from `user-account`, not from here.

Two consequences for this design:

- The demo `mcp` block lands **once that page exists**, not as part of the
  reporting work. Until then `apps/demo/lowdefy.yaml` cannot carry an `mcp`
  block at all — `buildMcp` throws for a non-public endpoint with no
  `oauthProvider`, and all three endpoints reject unauthenticated callers.
- So the endpoints ship verified by e2e (below) with **no demo `mcp` block**.
  That is a deliberate, stated exception to the demo-consumer rule rather than
  an oversight: the demo can host the config but can never be the consumer —
  nothing inside `apps/demo` will ever call these tools, since the whole point
  is consumption from outside the app by an OAuth client. Adding the block would
  satisfy the letter of the rule and none of its purpose.

## Verification

A build check confirms the YAML compiles; it cannot tell you whether
`get-report-data` hands a report to someone who should not see it. Per
CLAUDE.md, `pnpm e2e` is the only gate that catches behaviour depending on a
routine actually executing — which is all three of these endpoints are. But the
suite is browser-driven and an MCP tool has no button, so the approach is to
**test the endpoints as the HTTP endpoints they are.**

This works with the existing fixtures, verified:

- `Api` endpoints are callable at `POST {basePath}/api/endpoints/{endpointId}`
  with body `{ payload, pageId, blockId }` (`createCallAPI.js:19-26`).
  `InternalApi` is refused at `callEndpoint.js:39-42` with the same error as a
  missing endpoint — which is why `resolve-report` cannot be exposed and these
  are separate endpoints.
- Authorization is caller-agnostic: `authorizeApiEndpoint` runs from
  `callEndpoint.js:53` regardless of who called. There is no CSRF token on this
  route (CSRF appears only in the better-auth config), so a direct POST is not
  blocked by anything only a browser would supply.
- The suite authenticates by cookie, not by a login flow: `ldf.user(USER_A)` →
  `setUserCookie` → `page.context().addCookies({ name: 'lowdefy_e2e_user' })`,
  honoured by the `lowdefy build --server e2e` server (see
  `apps/demo/e2e/playwright.config.js:13,39`).
- **`page.request` shares the browser context's cookie jar**, so a POST made
  after `ldf.user(...)` arrives as that user and `_user` resolves in the
  routine:

  ```js
  await ldf.user(USER_B);
  await page.request.post("/api/endpoints/ai-reporting/get-report-data", {
    data: { payload: { report_id: "e2e-report" } },
  });
  ```

What this covers: the owner-scoping filter, the shared-visibility `$or`, the
`scope` enum rejection (in the routine, not the schema), the signed-in reject,
and the response's `truncated_sections` / `failed_sections` / per-section
`label` fields — seeded through the existing
`mdb.seed(...)` helper, with `USER_A` / `USER_B` from
`apps/demo/e2e/ai-reporting/helpers.js` giving the owner-vs-non-owner pair.

Three cases here are specific to decisions above and easy to omit otherwise:
that no `query` or `optionsQuery` appears anywhere in either endpoint's response
(assertable as a whole-payload check, which is what makes the subtraction rule
testable), that a `download` section comes back with rows while the same report
opened in the UI runs no extra pipeline for it, and that the `deleted` scope is
rejected by the MCP sibling while still working on `list-reports` itself.

**Out of scope, deliberately:** the MCP transport itself — tool listing, the
`mcp:read` scope check, the OAuth handshake. That is platform behaviour, it
needs the version bump and a real MCP client to exercise, and the framework
already unit-tests `buildMcp`. Building a harness for Lowdefy's feature is not
this module's job.

**On the demo-consumer rule:** the e2e specs above are the worked example, and
they are the whole demo contribution for now. The `mcp` block cannot be added to
`apps/demo/lowdefy.yaml` until the consent page exists — see **The consent-page
dependency** above for why that is stated as an exception rather than worked
around.

## Cost of adoption: the version bump

This is the real cost of the feature and it is repo-wide, not reporting-local.
Moving off `0.0.0-experimental-20260814133003` to a release carrying the MCP
server means:

- Absorbing every framework change between the pinned date and the target
  release — across all 15 modules and the plugins package, not just
  `ai-reporting`.
- Updating the `plugins:` version pins in `lowdefy.yaml` in lockstep. A stale
  plugin pin silently resolves old transitives (e.g. an outdated
  `@lowdefy/ai-utils`) rather than failing loudly, so a partial bump is worse
  than no bump.
- Re-running the full `pnpm e2e` suite as the gate — a build check cannot
  catch routine-level regressions, and this bump can move routine semantics.
- A consuming app standing up `auth.oauthProvider` — one line of config, but it
  depends on a consent page that does not exist yet in any module here (see
  **The consent-page dependency**). That is `user-account` work, tracked
  separately, and it gates the demo `mcp` block rather than the endpoints.

None of that is reporting-specific work, which is the argument for treating
adoption timing as the gating question rather than the endpoint design.

## Remaining open questions

- **Version adoption.** When to move the repo to a Lowdefy version carrying
  the MCP server and `auth.oauthProvider`. This is the one genuinely open
  question — it is a scheduling and risk call about the whole repo, and it
  gates everything above.
- **Per-caller rate bound — unknown, and blocking.** Every cost bound in the
  open engine is per query (`maxTimeMS` 30s, `allowDiskUse: true`, the
  structural caps, the 1000-row cap). Those were sized against a
  human-paced browser caller. Nothing in the framework throttles `/api/mcp` or
  API endpoints generally — rate limiting exists only under `auth`
  (better-auth's own window/max, guarding the login endpoints). Whether
  anything fronts a production app that would bound request rate is **not
  known**, and must be answered before the `mcp` block is enabled in any real
  app: a report with a dozen query-backed sections is a dozen pipelines per
  call, and an agent loop is not human-paced. This gates deployment the same
  way the version bump gates adoption — do not treat it as the platform's
  concern until someone has checked.
- **Response validation against a real client.** The response shape's
  ergonomics — whether a connected agent can actually go from
  `list-reports` → `get-report` → `get-report-data` to a useful artifact
  without hand-holding — needs a live MCP client against a running app. That
  genuinely requires running code, not more reading.
