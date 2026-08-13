# Task 5: Docs, changeset, and the verification gate

## Context

The implementation is complete: `buildFlintOption` serves both surfaces (tasks 1–2), the
`chart-data` endpoint exists (task 3), and `compileReport` binds whole options with per-section
containment (task 4). What remains is the consumer-facing record and the full gate. The authoring
contract did not move — `chart`, `x`, `y` mean exactly what they meant — but what a reader gets on
screen did: appearance is now compiled by Flint, chart height follows content, categorical bars
re-sort by value, and tooltips are ECharts defaults.

## Interfaces

- **Consumes:** the finished state of tasks 1–4 (no new code interfaces).

## Task

1. **`docs/reporting/reference/presentation-contract.md`** — update the chart portion. Keep the
   existing front-matter and structure; add/adjust content to state:

   - Chart appearance (axis names, label rotation, padding, colours, pie labels) is compiled
     server-side by the `flint-chart` compiler from the spec's `chart`/`x`/`y` and the result
     rows. The authoring contract is unchanged.
   - **Ordering is derived, not taken from the pipeline:** categorical bar charts render sorted by
     value descending regardless of the pipeline's `$sort`; temporal/ordered x values keep their
     order.
   - **Height follows content:** a chart's height is the plot (constant) plus the axis furniture
     its labels need, so charts differ in height and a filter change can resize a section.
   - **Multi-`y` charts** render grouped (bar) or multi-line series named by the `y` columns; the
     y-axis reads `Value`.
   - **Tooltips are ECharts defaults** (Flint's tooltip formatter is a function, which JSON cannot
     carry to the browser).

   Follow the page's existing register — consumer-observable behaviour, no implementation
   internals beyond what an author sees.

2. **Changeset** — a single changeset covering both packages, minor bumps:
   `@lowdefy/modules-mongodb-plugins` (new `buildFlintOption`, `compileReport` contract gains
   `chartEndpointId`) and the reporting module change if the module is changeset-tracked
   (mirror how past reporting changesets in `.changeset/` name the module package — check an
   existing one first). Summary: charts are compiled by flint-chart; heights follow content; new
   `chart-data` endpoint; every existing report's charts change appearance on next open.

3. **Verification gate**, in order:
   - `pnpm docs:check` from the repo root — front-matter and generated-file drift (no var changes
     were made, so this should pass without `docs:gen`; if it fails on vars.md, run `pnpm docs:gen`
     and inspect why).
   - Full plugin test suite, sandbox off: `CI=true pnpm test` (expect the known ~19 Mongo-suite
     failures **only if sandboxed** — run unsandboxed so a failure means something).
   - `pnpm e2e` in the background from `apps/demo`, reading the log when it exits — it boots a
     `MongoMemoryServer` itself and is the only gate that executes routines; the report page and
     chat flows it covers must pass.
   - `pnpm ldf:b` from `apps/demo`, then read the generated report-page artifact under
     `apps/demo/.lowdefy/server/build/pages/` and confirm: a filtered chart section binds
     `option`/`height` via `__if_none`/`__state`, its `CallAPI` targets the scoped `chart-data`
     id, and a table section still targets `query-data` writing `sections.<id>.rows`.

4. **Record the residue.** The live-server look (chat panel chart via the demo assistant; a real
   report open with filters moved) is a human `/r:dev-test` step — say so in the completion
   report rather than claiming it. Flag explicitly for the reviewer: every existing report's
   charts change appearance on next open (intended), and the `220` plot-height constant awaits
   its first visual check.

## Acceptance Criteria

- All four gate steps pass, with outputs quoted (not summarized) for any failure.
- `docs/reporting/reference/presentation-contract.md` states the four behaviour changes above.
- A changeset file exists and names the affected packages with minor bumps.

## Files

- `docs/reporting/reference/presentation-contract.md` — modify.
- `.changeset/*.md` — create.

## Notes

- The e2e suite needs no secrets and no Infisical (`globalSetup` provides Mongo); the demo build
  needs neither beyond npm. Neither step requires the `:i` script variants, which fail in the
  sandbox.
- If a repo memory or convention says "no changesets until the module is final," the design
  explicitly lists a changeset for this change — the design wins here.
