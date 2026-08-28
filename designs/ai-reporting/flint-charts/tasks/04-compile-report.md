# Task 4: `compileReport` — Flint sections, two-key binding, requery split

## Context

The report page is the second and larger consumer. Today
(`plugins/modules-mongodb-plugins/src/analytics/compileReport.js`):

- `:1168-1183` — a chart section builds an option with `rows: []`, then overwrites
  `option.dataset.source = dataBinding(section, rows)` and emits
  `{ type: "EChart", layout: { span: 24 }, properties: { height: CHART_HEIGHT, option } }`.
- `:114-118` — `CHART_HEIGHT = 280`.
- `:256-279` — `requeryActions` emits one `CallAPI` + `SetState` pair per filter-bound section,
  all against `endpointId` (query-data), writing `sections.<id>.rows`.
- `:283-289` — `dataBinding` returns rows, or `{ __if_none: [{ __state: "sections.<id>.rows" }, rows] }`
  for filtered sections.
- `:824-825` — `endpointId` is a required parameter; `resolve-report.yaml:164-165` passes
  `_module.endpointId: query-data`.
- The chart assembly sits **outside** the `verifySection` try (`:1126-1131`) — safe today because
  the old builder cannot throw. Flint can, and `resolve-report.yaml` runs `compileReport` without
  a `:try`, so an uncontained throw would reject the whole report.

Flint's option cannot have its data swapped (rows are inlined in type-dependent shapes; layout is
computed from labels), so filtered chart sections bind the **whole option and its height** and a
new endpoint re-assembles server-side. Tables and KPIs keep `dataBinding`/`query-data` untouched.

After this task nothing imports `buildEChartsOption.js`, and it is deleted.

## Interfaces

- **Consumes:** `buildFlintOption({ chart, x, y, rows })` → `{ option, height }` (task 1 — it can
  throw; this task owns containment); the `chart-data` endpoint with payload
  `{ chart, title, x, y, query, filters? }` → `{ option, height }` (task 3); existing
  `brokenSectionBlocks(section, description, brokenCtx)` and `boundFilters(section,
filterSectionsByField)` helpers in `compileReport.js`.
- **Produces:** `compileReport` requires a new `chartEndpointId` string parameter beside
  `endpointId` (validated the same way, `:824-825` pattern); compiled filtered chart sections bind
  `sections.<id>.option` and `sections.<id>.height` state keys.

## Task

All in `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` unless noted.

1. **Parameter.** Add `chartEndpointId` beside `endpointId` in the exported function's signature
   and destructuring, with the same required-string validation and a matching `fail` message
   ("chartEndpointId (the chart-data endpoint) is required."). Thread it through to
   `requeryActions` and the section compiler alongside `endpointId`. Update the doc comment header
   (`:44` region) to describe both.

2. **Chart section compilation** (replacing `:1168-1183`). Assemble from the actual resolve-time
   rows, contained:

   ```js
   if (section.type === "chart") {
     let assembled;
     try {
       assembled = buildFlintOption({
         chart: section.chart,
         x: section.x,
         y: section.y,
         rows,
       });
     } catch (error) {
       out.push(...brokenSectionBlocks(section, error.message, brokenCtx));
       return out;
     }
     // ...heading, download, block...
   }
   ```

   The emitted block, filtered vs not (mirror `dataBinding`'s split, one level up, twice):

   - Unfiltered (`(section.filterBy ?? []).length === 0`): literals —
     `properties: { height: assembled.height, option: assembled.option }`.
   - Filtered: both keys deferred over state with the resolve-time value as fallback —
     ```js
     properties: {
       option: { __if_none: [{ __state: `sections.${section.id}.option` }, assembled.option] },
       height: { __if_none: [{ __state: `sections.${section.id}.height` }, assembled.height] },
     }
     ```

   `sectionHeading` and `sectionDownload` calls stay exactly as they are (downloads keep
   re-querying `endpointId` for rows — CSV wants rows, not an option). Keep `layout: { span: 24 }`.

3. **Delete `CHART_HEIGHT`** (`:114-118`) and its use. Its comment block goes with it — the
   constant existed to compensate for a builder that could not size a chart to its content.

4. **`requeryActions` split** (`:256-279`). Chart sections target `chartEndpointId` with the spec
   in the payload and a two-key `SetState`; every other bound section keeps today's pair
   unchanged:

   ```js
   if (section.type === "chart") {
     actions.push({
       id: `query_${section.id}`,
       type: "CallAPI",
       params: {
         endpointId: chartEndpointId,
         payload: {
           chart: section.chart,
           title: section.label,
           x: section.x,
           y: section.y,
           query: section.query,
           filters: boundFilters(section, filterSectionsByField),
         },
       },
     });
     actions.push({
       id: `set_${section.id}`,
       type: "SetState",
       params: {
         [`sections.${section.id}.option`]: {
           __api: `${chartEndpointId}.response.option`,
         },
         [`sections.${section.id}.height`]: {
           __api: `${chartEndpointId}.response.height`,
         },
       },
     });
   } else {
     // existing CallAPI/SetState pair against endpointId, verbatim
   }
   ```

   Keep the existing header comment's sequencing argument and extend it: pairs now span two
   endpoints, still correct because each `SetState` immediately follows its own `CallAPI` and
   `_api` is keyed per endpoint id.

5. **Imports.** Replace the `buildEChartsOption` import (`:9`) with `buildFlintOption`; then
   **delete `buildEChartsOption.js`** — after tasks 2 and this one, nothing imports it
   (`grep -rn buildEChartsOption` across the repo must come back empty).

6. **`modules/ai-reporting/api/resolve-report.yaml`** — beside `endpointId` (`:164-165`), pass:

   ```yaml
   chartEndpointId:
     _module.endpointId: chart-data
   ```

7. **Tests** (`compileReport.test.js`, `compileReport.declared.test.js` — follow existing fixture
   style):
   - An unfiltered chart section emits literal `option` (no `dataset` key, no `_`-keys) and a
     numeric `height`.
   - A filtered chart section emits the two `__if_none`/`__state` bindings shown above, and its
     `requeryActions` entry targets `chartEndpointId` with `chart`/`title`/`x`/`y`/`query`/
     `filters` in the payload and the two-key `SetState`.
   - A filtered **table** section still targets `endpointId` and writes `sections.<id>.rows` —
     the split leaves it untouched.
   - A chart section whose assembly throws (e.g. monkeypatch/spy or a spec Flint rejects) renders
     `brokenSectionBlocks` while sibling sections compile normally.
   - Missing `chartEndpointId` fails with the new message.
   - Update any existing assertions that reach into `properties.option.dataset` or
     `CHART_HEIGHT`.

## Acceptance Criteria

- Plugin tests pass (sandbox off).
- `grep -rn "buildEChartsOption" .` (repo-wide, excluding designs/) returns nothing.
- `pnpm ldf:b` from `apps/demo` compiles.
- In the generated report-page artifact under `apps/demo/.lowdefy/server/build/`, a filtered chart
  section shows the `option`/`height` bindings and its `CallAPI` targets the scoped `chart-data`
  endpoint id.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify — everything above.
- `plugins/modules-mongodb-plugins/src/analytics/buildEChartsOption.js` — delete.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.declared.test.js` — modify (where
  it asserts chart shapes).
- `modules/ai-reporting/api/resolve-report.yaml` — modify — pass `chartEndpointId`.

## Notes

- The compiled definitions use the **double-underscore** deferred operators (`__if_none`,
  `__state`, `__api`) exactly as `dataBinding` does today — they evaluate client-side when the
  `Dynamic` block renders.
- `report.yaml`'s `Dynamic` allowlist already permits `EChart`; no page change.
- The reflow-on-filter-change behaviour (a taller chart shifts blocks below) is a recorded design
  decision — do not "fix" it with a fixed height.
- `title: section.label` in the payload exists only to satisfy `validateChartSpec`'s required
  `title`; `label` is validated required on chart sections by `validateReportSpec`.
