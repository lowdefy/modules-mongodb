# Task 3: The `chart-data` endpoint

## Context

Filtered report chart sections can no longer swap rows into a compiled option client-side — Flint
inlines data in type-dependent shapes and computes layout from the actual labels, so new rows mean
re-assembly, and re-assembly happens on the server. This task creates the endpoint that does it:
`chart-data` takes one chart section's presentation spec plus the live filter values, runs the same
validated pipeline as `query-data`, and returns the assembled `{ option, height }`.

Model it on `modules/ai-reporting/api/query-data.yaml` — same signed-in guard, same
`AnalyticsPipeline` request against `_module.connectionId: reporting-data`, same `filters`
semantics (untrusted client triples, contained because the server builds the `$match` from a fixed
op map and revalidates the combined pipeline). The differences: the payload also carries the
presentation spec (`chart`, `title`, `x`, `y`), which is revalidated with
`_analytics.validateChartSpec` before anything runs, and the response is `{ option, height }`
instead of a bare row array.

Why a separate endpoint (design: "`chart-data`, not a widened `query-data`"): `query-data` must
return a bare row array — its CSV-download consumers pipe the response straight into `DownloadCsv`
— and a chart re-query needs an object. Two endpoints, one shape each.

Why the spec is in the payload: the compiled `CallAPI` is client-executed, so the spec is
client-tamperable input — the same status `query` already has, with the same treatment:
revalidate server-side. `validateChartSpec` gates `chart` to `CHART_TYPES`, caps `title`/`x`/`y`
as inert strings, and shape-checks the query; the data itself is still gated per-viewer inside
`AnalyticsPipeline`. Tampering buys nothing the viewer's roles don't already allow.

## Interfaces

- **Consumes:** `_analytics.buildFlintOption { chart, x, y, rows }` → `{ option, height }`
  (registered on the operator in task 1); `_analytics.validateChartSpec { spec, roles }` →
  normalized `{ chart, title, query, x, y }` (exists).
- **Produces:** module endpoint `chart-data` — payload
  `{ chart, title, x, y, query, filters? }`, response `{ option, height }`. Task 4's
  `requeryActions` targets it via `_module.endpointId: chart-data`.

## Task

1. **Create `modules/ai-reporting/api/chart-data.yaml`.** Structure (follow `query-data.yaml`'s
   idioms — header comment, guard, payloadSchema style):

   - `id: chart-data`, `type: Api`, with a `description` and a header comment explaining: chart
     re-queries only; returns an assembled ECharts option because Flint's options cannot have rows
     swapped in client-side; the spec is untrusted client input revalidated below; the security
     boundary is unchanged (`AnalyticsPipeline`).
   - `payloadSchema`: object requiring `chart`, `title`, `x`, `y`, `query`; optional `filters`
     (copy `query-data.yaml`'s `query` and `filters` property definitions verbatim; `chart`/
     `title`/`x` are strings, `y` an array of strings).
   - Routine:
     1. The signed-in guard, copied verbatim from `query-data.yaml` (`:if` `_eq` `_user: id` /
        `null` → `:reject`), including its comment — catalog entries with no `roles` are readable
        by any authenticated user, so the guard is load-bearing.
     2. Revalidate the spec (no catalog — execution-time gating happens inside
        `AnalyticsPipeline`; this is the same posture `buildDataParts` takes):
        ```yaml
        - :set_state:
            spec:
              _analytics.validateChartSpec:
                spec:
                  chart:
                    _payload: chart
                  title:
                    _payload: title
                  x:
                    _payload: x
                  y:
                    _payload: y
                  query:
                    _payload: query
                roles:
                  _user: roles
        ```
     3. `AnalyticsPipeline` step (id `run_query`) exactly as in `query-data.yaml` — `query` from
        the validated spec (`_state: spec.query`), `filters` from `_payload: filters`, `roles`
        from `_user: roles`.
     4. Return the assembled result:
        ```yaml
        - :return:
            _analytics.buildFlintOption:
              chart:
                _state: spec.chart
              x:
                _state: spec.x
              y:
                _state: spec.y
              rows:
                _step: run_query
        ```
   - A throw anywhere (validation or assembly) rejects the endpoint; the client `CallAPI` errors
     and the section keeps its last good render — the design records this as accepted. No `:try`
     wrapping.

2. **Register it.** In `modules/ai-reporting/module.lowdefy.yaml`:
   - Add `- _ref: api/chart-data.yaml` to the `api:` list (beside `api/query-data.yaml`).
   - Add to `exports.api`:
     ```yaml
     - id: chart-data
       description: Assemble a chart section's ECharts option under live filter values
     ```
   - Bump `version: 0.20.0` → `0.21.0`.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` compiles — proving the yaml parses, the `_ref` resolves, and the
  operator names exist at build.
- The generated endpoint artifact under `apps/demo/.lowdefy/server/build/` shows the guard step,
  the `validateChartSpec` call, the `AnalyticsPipeline` step and the `buildFlintOption` return.

## Files

- `modules/ai-reporting/api/chart-data.yaml` — create.
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `api:` ref, `exports.api` entry, version bump.

## Notes

- `title` is in the payload only because `validateChartSpec` requires a non-empty `title` string —
  assembly ignores it. Task 4 passes the section's `label` (validated required on every chart
  section by `validateReportSpec`).
- Do **not** add `maxResultBytes` — that belongs to the agent's `query-data-tool` budget story;
  this endpoint mirrors `query-data`'s defaults.
- Runtime execution against a live database is not checkable here; task 5's verification and the
  e2e/dev-test path cover it. The build artifact read is this task's gate.
