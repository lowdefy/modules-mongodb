# Review 1

### 1. Every assembled option carries a function at `tooltip.formatter`, and JSON serialization silently drops it

> **Resolved (auto).** The strip walk in `buildFlintOption` now removes function-valued keys
> alongside the `_`-keys; snapshot tests snapshot the stripped option so they assert what ships;
> the presentation-contract doc notes tooltips are ECharts defaults. Recorded as findings.md
> finding 9 with a probe section.

Verified by walking the assembled options for all four templates the design uses (`Bar Chart`,
`Line Chart`, `Pie Chart`, `Grouped Bar Chart` over folded data): each contains exactly one
function-valued path, `tooltip.formatter`. The design's underscore-key analysis (the decision to
strip the `_`-prefixed keys, findings.md finding 5) walked for single-key `_` objects and never
checked for functions.

Every path an option travels is JSON: persisted into conversation `data_parts`, compiled into the
report page definition, returned from the proposed `chart-data` endpoint. `JSON.stringify` drops
function values silently, so Flint's tooltip formatting — part of the polish the design is buying —
never reaches a browser. The loss is uniform (both surfaces serialize), so nothing renders
_inconsistently_; but the design nowhere records that the tooltip degrades to the ECharts default,
and the proposed snapshot tests would make it worse: snapshotting the raw option records a
`[Function]` that production never ships, so the snapshot passes while asserting nothing about the
real tooltip.

Fix: extend the strip walk (the design already plans one for `_`-keys in `buildFlintOption`) to
remove function-valued keys, snapshot the _stripped_ option so tests assert what actually ships,
and note in the presentation-contract doc that tooltips are ECharts-default. Also worth one probe
line in findings.md so a future Flint version adding `axisLabel.formatter` functions is caught by
the same walk rather than rediscovered.

### 2. A Flint throw at report resolve time is uncontained and takes down the whole report

> **Resolved (auto).** New proposed-change point: `compileReport` wraps each chart section's
> assembly in a try that renders `brokenSectionBlocks` — the fallback a contract mismatch already
> gets. On `chart-data`, a throw rejects the endpoint and the section keeps its last good render;
> recorded in the data-flow diagram as accepted behaviour. Chat path confirmed already contained.

The current builder is a pure mapping that cannot throw. `assembleECharts` validates and throws
(unknown chart type is the proven case; it also profiles arbitrary row data, which is exactly where
unanticipated inputs surface). The two call sites differ in containment, and the design doesn't
mention it:

- **Chat path: already contained.** `buildDataParts.js:95-108` wraps the whole per-chart block —
  validate, verify, build — in a try whose catch skips that chart and keeps the turn's other parts.
  Nothing to do here.
- **Report path: uncontained.** The builder call (`compileReport.js:1169`) sits _outside_ the
  `verifySection` try (`:1126-1131`), and `resolve-report.yaml:148` invokes `compileReport` with no
  `:try` around it — the per-section `:try` (`:94-113`) covers only the pipeline runs. A throw while
  assembling any one chart section therefore rejects the whole resolve and the reader gets the
  static fallback page, in a module that just built per-section failure classification
  (`brokenSectionBlocks` / `withheldSectionBlock`, `:526-682`) precisely so one bad section cannot
  do that.

Fix: wrap the per-section assembly in a try that falls back to `brokenSectionBlocks` — the
mechanism is already in scope three lines up. The same decision should be recorded for the
`chart-data` endpoint: an assemble throw there rejects the CallAPI, the section keeps its previous
state, and `_api.<id>.error` is where the failure lands — probably acceptable, but say so.

### 3. `chart-data` needs the presentation spec in its payload, and the design never says where it comes from or who validates it

> **Resolved (auto).** The payload carries `{ chart, x, y, query, filters }` and the endpoint runs
> `validateChartSpec` before the pipeline — the same revalidate-untrusted-input posture `query`
> already has, under which tampering buys nothing `AnalyticsPipeline` doesn't already gate. The
> `report_id`-lookup alternative is recorded as rejected: a DB read per filter change and storage
> coupling, to defend inputs that are inert once revalidated.

The design's data-flow diagram gives `chart-data` the payload `{ query, filters, roles }` — but
`buildFlintOption` needs `{ chart, x, y }` to assemble anything. Those have to arrive somehow, and
the compiled `CallAPI` action is client-executed, so whatever carries them is client-tamperable
input (the same status `query` already has).

Two coherent options:

- **Payload carries `{ chart, x, y }` alongside `query`, revalidated server-side** with
  `validateChartSpec` — consistent with the module's existing posture, where `query-data` re-walks
  the client-supplied pipeline rather than trusting it. Tampering then buys nothing: `chart` is
  gated to `CHART_TYPES`, `x`/`y` are length-capped inert strings, and the data itself is still
  guarded by `AnalyticsPipeline`.
- **Payload carries `report_id` + section id and the endpoint reads the spec from the reports
  collection** — no tamper surface at all, at the cost of a DB read per filter change and coupling
  the endpoint to report storage.

The first is cheaper and matches precedent, but the design has to pick one and state it — as
written, `chart-data` cannot be implemented from the design.

### 4. The folded multi-series chart paints the fold column's name on the canvas — an accidental, undecided string

> **Resolved (auto).** Stripped, in the same walk as finding 1's fix — the annotation is series-key
> labeling the legend already covers with the real column names, and single-series charts carry no
> such element. Decided in the design's strip section and recorded in findings.md finding 9.

Verified: the folded `Grouped Bar Chart` option carries a `graphic` text element — bold, top-right
(`right: 10, top: 4`), z 100 — whose text is the fold key column's name. The design chose `Measure`
as that column name for leak-avoidance reasons (it beats `__flint_series_key`), and findings.md
mentions the annotation in passing, but the design's multi-`y` decision discusses only the y-axis
reading `Value` and never decides the annotation. So every multi-series chart in the product would
render the word "Measure" in its top-right corner — chosen by a variable name, not by anyone.
Single-series charts have no such graphic (verified), so it also makes multi-series charts the odd
ones out.

Decide it: either strip `graphic` in `buildFlintOption` (it is series-key labeling for the legend,
and the legend already carries the real column names), or keep it and pick the word deliberately.
Stripping is the conservative default and one line in the same walk as finding 1's fix.

### 5. Verified and holding — no action

Claims from the design that this review checked against code or probe rather than taking on trust,
all confirmed:

- **Empty rows don't throw** — all four templates assemble `values: []` cleanly (a zero-row filter
  result renders an empty chart at full furniture height, ~417px; cosmetically odd but safe).
- **Null/missing values don't throw** — bar drops a null-category row and gaps null measures; pie
  renders zero-value slices.
- **Date and ObjectId-like values coerce sanely** (ISO strings / `toString`). A plain-object
  measure produces a silently wrong chart, but the current builder hands the same rows to ECharts
  with the same class of result — not a regression.
- **Nothing else reads `sections.<id>.rows` for chart sections** — the only readers are
  `requeryActions`'s write (`compileReport.js:274`) and `dataBinding`'s read (`:287`);
  `sectionHeading` inlines resolve-time rows and is compile-time static, so moving chart sections
  to `.option`/`.height` state keys strands nothing.
- **The `query-data-tool` precedent** the endpoint-split rationale leans on is real and its header
  makes the same one-boundary argument the design repeats.
- **`EChart` height binding works at runtime** — wrapper-div style + `size-sensor` resize +
  `notMerge: true`, read from the block source, as the design states.
