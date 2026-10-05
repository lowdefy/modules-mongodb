# Review 3

Short review. The material added in the last two rounds holds up under
verification — the `payloadSchema`-is-advertisory rule, the date-coercion
requirement, the spec-walking response, the corrected extraction, and the
consent-page dependency all check out against the source, and none is
re-raised. Two candidate findings died on inspection and are recorded at the
bottom so nobody re-derives them.

The three below are things the design has not decided rather than things it got
wrong, and the first one is a boundary question the design elsewhere treats as
important.

### 1. `get-report` returning "the saved spec" would expose pipelines and collection names, and the design never decided that

> **Resolved (auto).** Stripped, and stated as one rule rather than an
> allow-list: every section is serialized **minus `query` and `optionsQuery`**,
> in both `get-report` and the `get-report-data` spec walk. Phrased as a
> subtraction so a seventh section type stays safe by default. Taken without
> asking because it is the conservative direction and follows from the design's
> own stated posture (the `query-data` prohibition, and `list-reports`' search
> comment) — no presentation field is lost, only the pipelines.

The endpoint list says `get-report` "returns the saved spec: sections, titles,
and the **filter definitions**." Those are two different things, and the
difference matters.

A stored section carries its query. From the e2e fixtures
(`apps/demo/e2e/ai-reporting/helpers.js:44-45,65-67`) a section looks like:

```js
query: {
  collection: "demo_orders",
  pipeline: [{ $group: { _id: null, total: { $sum: "$total" } } }],
}
```

So "the saved spec" means catalog collection names, aggregation stages, and
field paths. That is the data model, and the design is emphatic two sections
earlier that this boundary matters: it refuses to list `query-data` in an `mcp`
block because the open engine has no field-level scoping. It then hands the
agent the queries that engine would run. The agent cannot _execute_ them
without `query-data`, so this is disclosure rather than access — but it is
disclosure the design never weighed, in the one area where it has been most
careful.

Two supporting facts. Nothing in the UI shows a user a pipeline: there is no
spec or JSON view among the module's pages (`chat`, `report`, `reports-list`,
`reports-deleted`), and `list-reports.yaml`'s own search comment states the
posture — the search deliberately does not match the spec because "a report's
pipelines and field names are not text the user wrote." So `get-report` as
worded would be the first surface to put pipelines outside the server.

This also reaches the response decision. `get-report-data` now "walks the
spec," and an implementer walking sections will naturally pass them through
with `query` attached unless told not to.

**Proposed fix:** decide the projection explicitly and state it once — most
likely `id`, `type`, `label`, plus the filter keys (`control`, `field`,
`options`, `match`) and `valueKey` for kpi, with `query` and `optionsQuery`
stripped. Then say the same rule governs the spec walk in `get-report-data`.
If exposing pipelines is in fact wanted (an agent that understands the query
could explain the methodology), say that and say why it does not contradict the
`query-data` prohibition.

### 2. The `list-reports` MCP sibling would duplicate a 309-line authorization-critical aggregation

> **Resolved (auto).** The sibling is now specified as a guard plus a
> `type: CallApi` delegation to `ai-reporting/list-reports` — roughly a dozen
> lines, zero duplicated authorization. Mechanics verified in
> `@lowdefy/api`: `handleEndpointCall.js` stores the target's return value as
> the step's result and propagates a `:reject` to the caller, and
> `invokeEndpoint.js:26` re-authorizes the target, so the delegation is not a
> bypass. The section's opening claim that all three endpoints reuse the
> readable predicate was corrected at the same time — the delegating sibling
> needs none.

The endpoint list decides on "a **dedicated MCP-facing sibling** rather than
annotating the existing endpoint," for a good reason — the `deleted` narrowing
has to live in a routine guard, so it needs its own routine. What it does not
say is how the sibling gets the rest of `list-reports`.

`modules/ai-reporting/api/list-reports.yaml` is 309 lines: the signed-in
reject, the scope enum guard, five per-scope `$match` branches that _are_ the
authorization boundary, plus search, sort, `is_favourite` via `$in` over
`favourite_of`, and section counts reduced over `spec.sections`. A sibling that
reimplements that is the exact failure the design condemns three sections
earlier, at far larger scale — and its own words apply: "a bug in it is a
confidentiality bug rather than a display bug."

There is an established in-repo mechanism the design does not mention. A
routine step of `type: CallApi` calls another endpoint —
`modules/contacts/api/update-contact.yaml:56-63` is the pattern, with
`properties: { endpointId, payload }`, and `modules/user-admin/api/invite-user.yaml`
and `update-user.yaml` do the same. Nested calls re-authorize:
`invokeEndpoint.js:26` runs `authorizeApiEndpoint` on the target.

**Proposed fix:** the sibling is a guard plus a delegation — reject `deleted`,
then `CallApi` to `ai-reporting/list-reports` with the payload. That is roughly
a dozen lines and zero duplicated authorization logic. Note this also corrects
the section's opening claim that all three endpoints reuse "the shared
readable-scope stage": a delegating sibling needs no such stage, because its
target already has it.

### 3. `download` sections are the one data type the response withholds, and the reason given is about the UI

> **Resolved.** Download sections are resolved server-side like any other data
> section, with `columns` derived from the first row's keys (a download declares
> no column contract) and the same row cap and `truncated` flag. Implementation
> note recorded in the design: this must **not** widen `orderedQueries`'
> hardcoded `["kpi", "chart", "table"]` filter, because `resolve-report`
> consumes the same list and its `:for` step array aligns index-for-index with
> `compileReport`'s `results` — widening it would shift that alignment and make
> every UI report open run an extra pipeline for rows the page never renders.
> So: `orderedQueries(sections, { includeDownloads })`, default off,
> `get-report-data` the only caller that passes it.

The response table says `download` sections are "listed with no rows; it
queries client-side on click, so there is nothing to resolve server-side." The
first half is a fact about the UI (`querySections.js`'s docstring confirms
downloads are excluded from the resolve loop). The second half does not follow
for this endpoint: the query is in the spec, and `get-report-data` is already
running pipelines through `AnalyticsPipeline` for every other data section.

A download section exists to hand someone bulk rows. An agent pulling report
data into a spreadsheet is the closest thing to that intent this design has —
and it is the one section type the response deliberately empties. The row cap
applies either way, so resolving it costs one more pipeline and exposes nothing
new.

This is a question rather than a defect: it may be deliberate, on the grounds
that a download's grain differs from what the report displays.

**Proposed fix:** either resolve download queries like any other data section,
or keep them empty and give the reason in terms of the MCP consumer rather than
the UI's click behaviour.

---

## Checked and dropped

Recorded so these are not re-derived:

- **Filter default values causing UI/MCP divergence.** A report whose filters
  carried defaults would return different numbers on screen than over MCP.
  It cannot: `validateReportSpec.js` closes the filter section's allowed keys at
  `id, type, label, control, field, options, match, optionsQuery` — there is no
  default or initial value. A report opens unfiltered in both paths.
- **The six-section-type mapping.** Settled by `querySections.js`'s docstring
  and already tabled in the design. Raised in review 2 and resolved there.
