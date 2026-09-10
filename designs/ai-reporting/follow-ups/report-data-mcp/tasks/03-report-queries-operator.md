# Task 3: `_analytics.reportQueries` — the server-side filter binder

## Context

`get-report-data` (task 7) must run a saved report's sections with filter values
that arrived in an HTTP payload. It cannot reuse the UI's filter binding:
`boundFilters` emits triples whose values are **deferred placeholders**
(`{ __state: key }`) baked into compiled blocks and resolved _by the browser_
from live page state at `onChange` time. An MCP caller has no page state and no
`onChange`.

`querySections` (`querySections.js`) already produces the resolve-time query
list, and `orderedQueries(sections)` inside it filters on a hardcoded
`["kpi", "chart", "table"]`. This task adds the MCP-path equivalent: the same
list, with downloads included and real filter triples attached per entry.

Task 2 extracted the control→op rules into
`filterTriples({ filter, field, value })`. This task is their second consumer.

**Date values need explicit coercion or `daterange` filters silently match
nothing.** `callEndpoint` deserializes the payload before the routine sees it,
and Lowdefy encodes Dates on the wire as `{"~d": "<ISO>"}`. An MCP client reads a
JSON Schema and sends `"2026-01-01"` — a plain string, which stays a plain
string, reaches a MongoDB `$match` against a BSON date field, and matches
**nothing**. No error, no rejection: an empty result the agent reports as "no
data in that range". Requiring callers to emit `{"~d": …}` is the wrong contract
— no agent will reliably produce it and it leaks an internal wire format into a
public tool schema. So the binder coerces.

## Interfaces

- **Consumes:** `filterTriples({ filter, field, value })` from task 2.
- **Produces:** operator `_analytics.reportQueries`, registered in
  `analyticsOperator.js`:

  ```
  _analytics.reportQueries  { spec, roles, filterValues? }
    → [ { id, type, query, filters } ]
  ```

  One entry per query the endpoint must run, in spec order, each carrying the
  `{ collection, pipeline }` query and the resolved `filters` triple array for
  that section (empty when the section is unfiltered). Task 7's `:for` loop
  iterates it and reads `_item: section.query` / `_item: section.filters`.

  Also produces the internal option `orderedQueries(sections, { includeDownloads })`.

## Task

1. **`orderedQueries` gains `includeDownloads`, defaulting to `false`.** In
   `querySections.js`, change the signature to
   `orderedQueries(sections, { includeDownloads = false } = {})` and include
   `download` sections in the entry list when it is set.

   **This must not widen the shared default.** `resolve-report` consumes the same
   list through `querySections`, and its `:for` step array "aligns index-for-index
   with this list and feeds `compileReport`'s `results` param" — widening the
   default would shift that alignment and make every UI report open run an extra
   pipeline per download section, for rows the page never renders. The
   `querySections` operator keeps the current behaviour untouched; update its
   docstring to say downloads are excluded _by default_ and name who passes the
   flag.

2. **Create `reportQueries.js`.** It:
   - runs `validateReportSpec({ spec, roles })` (no `catalog` — the security gate
     is the per-entry `AnalyticsPipeline`, so an inaccessible section must fail as
     one section, not throw here and take down the whole call);
   - calls `orderedQueries(sections, { includeDownloads: true })`;
   - builds a field→filter-section map from the spec's `filter` sections;
   - for each entry, walks that section's `filterBy` and, for each field with a
     supplied value, calls `filterTriples` with the **real** value; attaches the
     resulting array as `filters`.

3. **Coerce dates.** For a `daterange` control, coerce each ISO-8601 string in the
   pair to a `Date` before handing it to `filterTriples`. Accept a `Date`
   unchanged (a caller that did send `{"~d": …}` deserializes to one). Reject a
   value that is neither. `select`/`multiselect` values are strings and arrays of
   strings and pass through unchanged.

4. **Guard the payload — this is the enforcement point.** `payloadSchema` is
   advertisory and never validated at runtime, so:
   - **throw on a filter key not declared as a filter field in this report's
     spec.** Silently ignoring it is the worst option available: the agent
     believes it filtered, and reports a whole-dataset number as a filtered one.
     The message must name the offending key and list the report's accepted
     fields.
   - throw on a `daterange` value that is not a two-element pair, and on an
     unparseable date string.
   - a filter field with no supplied value contributes no triple — an absent
     filter means "no constraint", matching the UI's untouched-control behaviour.

5. Register `reportQueries` in the `functions` Map in `analyticsOperator.js` and
   add its signature to that file's docstring block.

## Acceptance Criteria

- `reportQueries.test.js` covers: a `daterange` section with ISO strings
  producing `gte`/`lte` triples carrying real `Date` objects; `multiselect` with
  `match: "all"` → `op: "all"`; `select` → `op: "eq"`; a `download` section
  present in the output; an unfiltered section carrying `filters: []`; an unknown
  filter key throwing with the key named; a non-pair `daterange` throwing; an
  unparseable date string throwing; an absent filter value producing no triple.
- `querySections.test.js` gains a case asserting `orderedQueries` **excludes**
  downloads by default and includes them when the flag is set.
- Existing `querySections.test.js` and `compileReport.test.js` expectations are
  unchanged — the default path must not move.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes, then
  `pnpm --filter @lowdefy/modules-mongodb-plugins build`.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/reportQueries.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/reportQueries.test.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/querySections.js` — modify —
  `includeDownloads` option, docstring
- `plugins/modules-mongodb-plugins/src/analytics/querySections.test.js` — modify —
  flag coverage
- `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js` — modify —
  register the operator, extend the docstring

## Notes

- The `functions` Map in `analyticsOperator.js` is a `Map`, not a plain object, on
  purpose — `functions[methodName]` would resolve inherited keys and
  `_analytics.constructor` would look up `Object`. Add via `Map` entry, keeping
  the list alphabetical.
- Filter discoverability has a structural limit worth understanding while writing
  the error messages: a report's accepted filters live in its saved spec and
  differ per report, so a static `payloadSchema` cannot enumerate them. The schema
  declares the _shape_ of the filter argument; the _valid values_ come from
  `get-report`. That is why the unknown-key error must list what this report
  accepts — it is the only place the caller can learn it after a mistake.
- Do not attach filters to `filter`-type entries (an `optionsQuery` run is not
  filtered by the report's own controls).
