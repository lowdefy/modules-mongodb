# Task 6: Compile the multiselect control, its triples, and query-sourced options

## Context

`plugins/modules-mongodb-plugins/src/analytics/compileReport.js` turns a validated spec plus resolve-time rows into Lowdefy blocks. Three parts of it own filters today:

- `filterStateKey(field)` → `filter_${field}` — the control's **block id doubles as its page-state key**, so a dotted field yields a nested state path.
- `boundFilters(section, filterSectionsByField)` — the `{ field, op, value }` triples a bound section's re-query carries: two (`gte`/`lte`) for a `daterange`, otherwise one `eq`. Values are deferred `{ __state: key }` reads resolved client-side.
- `filterOptions(filter, sections, catalog)` — the agent's declared `options`, else the enum `values` cataloged for the field in one of its bound sections' collections, sliced to `MAX_FILTER_OPTIONS`.
- The `filter` branch of the section loop (lines 465-495) emits `DateRangeSelector` or `Selector` into `filterBlocks`, which collect into one `report_filters` Box row at the top of the report.

Sections that fail already degrade individually: a null results entry or a contract mismatch renders `failedSectionBlock(section, description)` — one Alert card — while the rest of the report renders (`verifySection` + the `try/catch` at lines 389-394).

By now: task 1 added the constants, task 3 made the normalized filter section carry `match` and `optionsQuery`, task 4 added `verifyFilterOptionsContract`, and task 5 made `orderedQueries` the shared index-alignment helper so a filter's options rows arrive in `rowsBySectionId` keyed by the filter's section id.

This task is where the capability becomes visible.

## Task

### 1. Triples per control (`boundFilters`)

Replace the `if daterange … else eq` shape with three explicit branches:

| Control       | Triples                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| `daterange`   | `{ field, op: "gte", value: { __state: `${key}.0` } }`, `{ … "lte" … `${key}.1` } }` |
| `select`      | `{ field, op: "eq", value: { __state: key } }`                                       |
| `multiselect` | `{ field, op: match === "all" ? "all" : "in", value: { __state: key } }`             |

The spec's `match` is the author's intent; the triple's `op` is the query it compiles to (`AnalyticsPipeline`'s `FILTER_OPS` maps `in → $in`, `all → $all`, per task 2). Triples are server-built and never appear in a persisted spec.

### 2. Query-sourced options (`filterOptions`)

`filterOptions` needs the filter's resolve-time rows, so give it access to `rowsBySectionId` (pass the rows in — do not reach for a module-level variable). Options precedence, in order:

1. declared `options` → sliced to `MAX_FILTER_OPTIONS` (unchanged);
2. `optionsQuery` rows → `{ label: row[labelKey], value: row[valueKey] }`, sliced to `MAX_QUERY_FILTER_OPTIONS`;
3. catalog enum `values` for the field (unchanged) — still the fallback when an `optionsQuery` fails to produce a usable list;
4. nothing usable → the filter degrades to an Alert (below).

For the `optionsQuery` branch, the rows are the entry `orderedQueries` produced for this filter section. Verify the contract before building options: `verifyFilterOptionsContract({ valueKey, labelKey, rows })`. `MultipleSelector` reads `opt.value` for a non-primitive option and renders `opt.label`, and both selectors default `showSearch` to true and filter on the rendered label — so a long looked-up list is searchable with no new property.

### 3. Truncation is stated, not silent

When the rows exceed `MAX_QUERY_FILTER_OPTIONS`, slice **and** say so in the control's title: `Companies — first 500`, reusing the pattern `sectionHeading` already applies to a table that lands on `PIPELINE_RESULT_CAP`. A dropdown silently missing the company someone is looking for is indistinguishable from that company not existing.

### 4. Three degradation outcomes, three descriptions

A filter that cannot produce a usable options list is replaced **in the filter row** by an Alert (`failedSectionBlock` gives the right shape — a `warning` Alert whose `message` is the filter's label). Its bound sections still render their resolve-time rows; they simply never re-query. One message covering all three outcomes would misdescribe two:

| Outcome                                                        | Alert description                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| The options query failed validation or was denied by the roles | Options failed to load (see the note below on the gate message) |
| Rows returned, but `valueKey`/`labelKey` name absent columns   | The verifier's message, naming the columns the query did return |
| The query succeeded and returned no rows                       | No options available                                            |

The empty-rows outcome is the engine's first case where zero rows is a failure, and it is deliberate: the docs' "zero rows is never an error" rule governs a section's _result_ rows, where empty means "nothing matched" — information. An options list is not a result, it is the control the user operates, and an empty one cannot be operated. (Task 8 scopes that rule in the docs.)

A filter with declared `options` or catalog enum `values` never reaches this path.

### 5. Emit the block

Add a `multiselect` branch to the `filter` section loop emitting `MultipleSelector` with the same `layout: { span: 6 }`, the (possibly truncation-annotated) `title`, its `options`, and the `onChange` re-query actions the other controls get. Mirror the `Selector` branch's property set; only add a property the block's schema actually accepts (an unknown property fails at render).

### 6. Declare the block type — not optional

Add `MultipleSelector` to `modules/reporting/pages/report.yaml`'s `Dynamic` block `properties.types.blocks`. `Dynamic` validates **every** type in the resolved output against that closed list, and an undeclared one drops the **whole** report to the fallback slot rather than degrading a section — the failure mode that once 404'd every report carrying a formatted table column, because `_intl` was declared nowhere. `compileReport.declared.test.js` asserts this invariant, so it fails the moment the compiler can emit an undeclared type: this edit belongs in the same change.

## Acceptance Criteria

Tests in `compileReport.test.js`:

- **Block type per control** — `select` → `Selector`, `multiselect` → `MultipleSelector`, `daterange` → `DateRangeSelector`, all inside the `report_filters` Box.
- **Triple shape per control** — including `match: all` → `op: "all"` and a `multiselect` with no `match` → `op: "in"`.
- **`{ label, value }` options** from an `optionsQuery`'s rows, in row order.
- **Cap and truncation title** — more than `MAX_QUERY_FILTER_OPTIONS` rows yields exactly that many options and a title ending `— first 500`; at or below the cap the title is the plain label.
- **Alert degradation per outcome** — a null results entry, a contract mismatch (`valueKey` absent from every row), and an empty row array each produce an Alert in the filter row with its own description, while the bound data sections still render normally.
- **Catalog fallback** — a filter whose `optionsQuery` failed but whose field has catalog enum `values` renders a control with those values, not an Alert.
- **Dotted filter field** — `global_attributes.company_ids` emits the block id `filter_global_attributes.company_ids` (a nested state path) and the triple's `__state` reads back the _same_ key. Nested array foreign keys are the case query-sourced options exist for, so assert the compiler's handling rather than assuming it; the mechanic is established elsewhere (`modules/contacts` binds a `TextArea` to the id `global_attributes.internal_details`).
- `CI=true pnpm test compileReport` passes, including `compileReport.declared.test.js` (which fails if `MultipleSelector` is missing from `report.yaml`).
- `CI=true pnpm test` from the repo root shows no regressions (sandbox off).
- `pnpm ldf:b` from `apps/demo` succeeds — it proves `MultipleSelector` is a real block type once declared (a bad type name fails the build). It cannot see the compiled report: `_analytics` is a server operator, so blocks are compiled per request and never appear in the build artifact.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify — `boundFilters` per-control triples; `filterOptions` gains the `optionsQuery` branch (contract verification, `{ label, value }`, cap, truncation title); the `filter` branch emits `MultipleSelector`; per-outcome Alert degradation.
- `modules/reporting/pages/report.yaml` — modify — `MultipleSelector` added to the `Dynamic` block's `properties.types.blocks`.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify — the cases above.

## Notes

**The gate message.** The design's outcome table says the failed-query Alert carries "the gate's message", but `resolve-report`'s `:catch` only logs — the sparse step entry that reaches `compileReport` carries no error text, and `compileReport` has no way to recover one. Emit the honest failed-load description (the same shape `failedSectionBlock`'s default uses, worded for an options list) rather than fabricating a message, and treat propagating the gate's message as out of scope here. Flag this back to the design rather than silently diverging.

`compileReport` re-validates the spec **without** a catalog (the per-section `AnalyticsPipeline` is the security gate), so nothing here re-walks the `optionsQuery` pipeline — it was walked at save time by task 3 and again per viewer by the resolve loop.

Do not touch `modules/reporting/api/resolve-report.yaml`: the whole point of routing options queries through `querySections` is that the routine does not change.
