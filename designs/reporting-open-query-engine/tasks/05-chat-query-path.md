# Task 5: Chat Query Path — `query-data` API + Agent Instruction Rewrite

## Context

At this point `AnalyticsPipeline` exists on the `ReportingData` connection with the catalog bound at the connection (task 3), and the catalog var is live (task 4). This task moves the chat surface onto it: the `query_data` tool's API endpoint and the reporting assistant's instructions/tool contracts.

Today `modules/reporting/api/query-data.yaml` takes a structured `spec` payload and wires `datasets: { _module.var: datasets }` + `roles: { _user: roles }` into `AnalyticsQuery`. Three consumers share it: the agent's `query_data` tool, report filter re-queries (CallAPI), and panel downloads. The agent (`modules/reporting/agents/reporting-assistant.yaml`) gets the data dictionary injected into its instructions (around line 60, "The queryable data model") and declares four tools: `query_data`, `render_chart`, `generate_report`, `export_data`.

## Task

**Rewrite `modules/reporting/api/query-data.yaml`:**

- `payloadSchema`: `query: { collection: string (required), pipeline: array (required) }`, plus optional `filters: array of { field, op, value }` (used by report filter re-queries; values arrive as deferred `__state` reads resolved client-side, same as today).
- Routine: single `AnalyticsPipeline` step with `properties: { query: { _payload: query }, filters: { _payload: filters }, roles: { _user: roles } }`. Do NOT pass a catalog — it binds at the connection (task 3).
- Update the header comment: one endpoint, three consumers, validation + role-gating inside the request; the filter triples are untrusted client input contained by revalidation of the combined pipeline.
- Keep the endpoint id `query-data` (kebab-case per repo rules) and its registration in the module manifest unchanged.

**Rewrite `modules/reporting/agents/reporting-assistant.yaml`:**

- `query_data` tool contract: input becomes `{ collection, pipeline }` — describe `collection` as a catalog-declared base collection and `pipeline` as a read-only MongoDB aggregation pipeline; enumerate the headline constraints in the tool description so the model self-corrects cheaply (allowed stage list summary, no `$where`/`$function`, `$lookup.from` must be cataloged, results capped at the engine row limit, `maxTimeMS` 30s).
- Instructions section replaces the dimensions/measures dictionary dump with the **catalog**: inject it via `_build.json.stringify` (or the existing injection mechanism) — collection descriptions, fields with types/descriptions/enum `values`/display hints, and relationships ("these fields join to these collections — use them for `$lookup`").
- **Grain-awareness prompting** (the design's correctness decision — prompting is the only mitigation at launch): explain fan-out (`$unwind`/`$lookup` multiply rows), steer toward distinct-counting (`$addToSet` + `$size`) after unwinds, and toward aggregating before joining where possible.
- **Presentation contract prompting** (consumed by task 6's tools, written here because the instructions are one file): for `render_chart`/`generate_report`, declare which output columns mean what (chart `x`/`y: [column]`, KPI `valueKey`, table `columns: [{ key, label?, format? }]`) and a per-column `format` descriptor (`{ style: decimal|currency, currency?, locale?, decimals? }`). Instruct the agent to COPY catalog display hints into contract format descriptors when a column maps to a cataloged field, and to declare formats directly for computed columns. `export_data` carries NO contract — CSV headers come from row keys.
- **Filterable-fields-at-source-grain guidance**: report filter fields must exist on the base collection's documents (filters prepend as a `$match` before the pipeline), not post-`$group`/`$lookup` aliases.

## Acceptance Criteria

- `query-data.yaml` contains no reference to `spec`, `dataset`, `datasets`, or `AnalyticsQuery`.
- The agent instructions contain no reference to dimensions/measures; the catalog injection resolves at build time.
- Tool descriptions for all four tools reflect the pipeline shape; `export_data`'s explicitly says no contract.
- A chat-driven `query_data` call with the design's example pipeline (`$lookup` + `$unwind` + `$group` + `$sort` + `$limit`) validates and executes against seeded demo data (manual/dev-test verification; the automated gate is task 7).

## Files

- `modules/reporting/api/query-data.yaml` — modify — pipeline payload + AnalyticsPipeline routine
- `modules/reporting/agents/reporting-assistant.yaml` — modify — instructions + four tool contracts

## Notes

Task 6 rewrites the other three API endpoints (`render-chart`, `generate-report`, `export-data`) and their validators; this task only writes the _prompting_ for the contract so the agent authoring lives in one place. Coordinate wording: the contract field names here must match task 6's validator exactly (`x`, `y`, `valueKey`, `columns`, `format.style`).
