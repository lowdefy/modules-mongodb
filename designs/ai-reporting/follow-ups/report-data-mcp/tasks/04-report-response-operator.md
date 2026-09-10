# Task 4: `_analytics.reportSpec` and `_analytics.reportResponse` — the caller-facing serializers

## Context

Two MCP-facing endpoints need to hand a saved report to an outside caller:
`get-report` returns what the report _is_, `get-report-data` returns what it
_says_ right now. Both serialize sections, and both must apply the same
subtraction rule, so they share one implementation.

**The queries never leave the server.** A stored section carries
`query: { collection, pipeline }`, so returning a spec verbatim would hand a
third-party agent catalog collection names, aggregation stages and field paths.
The design refuses to expose `query-data` over MCP because the open engine has no
field-level scoping; shipping the pipelines that engine would run is the
disclosure half of the same concern. Nothing in the module exposes a pipeline
today — no page renders a spec, and `list-reports`' search deliberately skips it
because "a report's pipelines and field names are not text the user wrote"
(`list-reports.yaml:125-128`).

The rule is a **subtraction**: return the section minus `query` and
`optionsQuery`, nothing else stripped. Phrased that way so a seventh section type
added later is safe by default, where an allow-list would silently drop its new
fields. Per `validateReportSpec.js:17-24` that leaves `kpi` with
`valueKey`/`format`, `chart` with `chart`/`x`/`y`/`stacked`, `table` with its
`columns` contract, `filter` with `control`/`field`/`options`/`match`, `markdown`
with `content`, `download` with its `label`, and `id`/`type`/`label`/`filterBy`
throughout.

**Two signals in the rendered report must survive into JSON.** Both turn "partial
data" into "data the agent reports as complete", which is the worst failure this
surface can have — a wrong number delivered confidently, with no reader
positioned to doubt it.

- **Truncation.** `validatePipeline.js:980` appends
  `{ $limit: PIPELINE_RESULT_CAP }` (`constants.js:118` — 1000) to every pipeline
  unconditionally. The only place that becomes visible today is
  `compileReport.js:614-624`, which rewrites the section _heading_ to
  `"{label} — first 1000 rows"` when `rows.length >= PIPELINE_RESULT_CAP`. An
  agent that receives exactly 1000 rows will total them and state the total as
  fact.
- **Degradation.** A section the viewer's roles exclude renders as an unmissable
  Alert card in the UI. The same thing as a per-section `error` key in JSON is
  something an agent iterates straight past, then presents "the report" with a
  section silently absent.

## Interfaces

- **Produces:** two operators registered in `analyticsOperator.js`:

  ```
  _analytics.reportSpec      { spec, roles }
    → { title, description, sections }        // sections minus query/optionsQuery

  _analytics.reportResponse  { spec, roles, results, reportId, appliedFilters? }
    → { report_id, title, applied_filters, truncated_sections,
        failed_sections, sections: [ … ] }
  ```

  plus a named export `stripQueries(sections)` used by both.

  `results` is the **possibly sparse** step array from the caller's `:for` loop,
  aligned index-for-index with `_analytics.reportQueries`' output (task 3) — the
  same contract `compileReport` already has with `querySections`.

  Task 5 calls `reportSpec`; task 7 calls `reportResponse`.

## Task

1. **Create `reportResponse.js`** exporting `stripQueries(sections)` (named) and
   the response builder (default). Implement `stripQueries` as an omission of
   exactly `query` and `optionsQuery`, per section, carrying every other key
   through untouched.

2. **Create `reportSpec.js`** (default export) — runs
   `validateReportSpec({ spec, roles })` and returns `{ title, description }`
   plus `stripQueries(sections)`. No catalog, same reasoning as elsewhere.

3. **Build the response** in `reportResponse.js`, walking the normalized spec in
   order and emitting one entry per section:

   | Type       | Emits                                                                        |
   | ---------- | ---------------------------------------------------------------------------- |
   | `kpi`      | the resolved scalar (`valueKey` read from row 0) plus `rows`                 |
   | `chart`    | `columns` + `rows`                                                           |
   | `table`    | `columns` + `rows`                                                           |
   | `filter`   | the filter definition, plus resolved `options` when it had an `optionsQuery` |
   | `markdown` | its `content` from the spec                                                  |
   | `download` | `columns` + `rows`, resolved like any other data section                     |

   Every entry carries `section_id`, `type` and `label`. `label` is
   non-negotiable: `validateReportSpec.js:85` derives `s${index}` when the author
   supplied none, so `s0`/`s1` are the common case, and an agent handed `s0` with
   no label would have to invent a section title — the confident fabrication this
   surface exists to avoid.

   A `download` section declares no `columns` contract
   (`validateReportSpec.js:24` — it is `{ type, label, query }`), so derive its
   `columns` from the keys of the first returned row; an empty result yields an
   empty `columns`.

4. **Report truncation per section and at the top level.** Set `truncated: true`
   and `row_cap: PIPELINE_RESULT_CAP` on any data section whose
   `rows.length >= PIPELINE_RESULT_CAP`, and list its `section_id` in
   `truncated_sections`. Import the constant; never write `1000`.

5. **Report failure per section and at the top level.** A section whose aligned
   result is missing (the sparse entry a failed `:try` leaves) gets
   `error: "Section could not be resolved."` and no `rows`, and its `section_id`
   goes in `failed_sections`. The message is deliberately generic — `:catch`
   receives no error object, so the gate's reason cannot reach the caller, and an
   honest generic description beats an invented one.

   **Keep the two lists separate.** Truncation and failure are different
   conditions calling for different caller behaviour — truncated data is usable
   with a stated caveat, a failed section is simply absent — and one boolean
   cannot carry that.

6. **Echo `applied_filters`** — the filter values actually used, keyed by field.
   Same reason truncation is stated: a number from a filtered slice reported as a
   number from the whole dataset is wrong, and the caller cannot know the
   difference unless told.

7. Register both operators in the `functions` Map in `analyticsOperator.js` and
   extend its docstring block.

## Acceptance Criteria

- `reportResponse.test.js` covers: all six section types; a section at exactly
  `PIPELINE_RESULT_CAP` rows flagged `truncated` and listed in
  `truncated_sections`; one at `cap - 1` not flagged; a sparse result producing
  `error` and a `failed_sections` entry while sibling sections still resolve; a
  download's `columns` derived from row keys; a download with zero rows yielding
  empty `columns`; `applied_filters` echoed; **no `query` or `optionsQuery`
  anywhere in the output** (assert over the serialized whole, not per key).
- `reportSpec.test.js` asserts the same whole-output absence of `query` /
  `optionsQuery`, and that every other declared key per type survives — including
  a synthetic section carrying an unknown extra key, to prove the subtraction
  passes unknown fields through.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes, then
  `pnpm --filter @lowdefy/modules-mongodb-plugins build`.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/reportResponse.js` — create —
  `stripQueries` + the response builder
- `plugins/modules-mongodb-plugins/src/analytics/reportResponse.test.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/reportSpec.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/reportSpec.test.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js` — modify —
  register both, extend the docstring

## Notes

- The response is built by **walking the spec**, not by hand-assembling an
  envelope, and that is structural rather than stylistic. Every field a consumer
  needs already exists in the spec; defining a parallel envelope vocabulary means
  hand-copying each field across and keeping two vocabularies in sync forever.
  Two fields were already dropped that way in earlier drafts of this design (the
  section `label`, and `markdown` content). Deriving from the spec makes that
  class of omission impossible — so resist adding a per-type field list.
- This module already committed to "truncation is stated, not silent" in
  `designs/ai-reporting/report-filters/design.md`. The response inherits the
  principle rather than re-deciding it.
- The reference response shape, including key naming (`report_id`, `section_id`,
  `row_cap`, snake_case throughout), is in the design under **The response must
  state what the UI states visually**. Match it exactly — task 8 asserts against
  it and a tool `description` written in task 5/7 instructs callers to read
  those keys.
