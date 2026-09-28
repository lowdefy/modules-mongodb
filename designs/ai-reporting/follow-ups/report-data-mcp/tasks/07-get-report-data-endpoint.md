# Task 7: The `get-report-data` endpoint

## Context

This is the endpoint the whole design exists for: resolve a saved report,
optionally under filter values, and return its data as self-contained JSON. No
existing endpoint does this — the earlier claim that the MCP tools are "thin
wrappers of existing endpoints" does not survive contact with the code, because
nothing today returns a saved report's resolved rows to a caller.

The shape to follow is `api/resolve-report.yaml`, which does the same resolution
for the UI: load the spec readable-scoped, iterate the query sections with `:for`,
run each through `AnalyticsPipeline` inside `:try` so one inaccessible section
fails as one section rather than the whole report, then hand spec + sparse results
to a compiler. This endpoint differs in exactly two places: the filter values come
from the payload rather than page state, and the output is a JSON envelope rather
than compiled blocks.

`AnalyticsPipeline` remains the security boundary. It revalidates each stored
pipeline against the connection-bound catalog **with the calling user's roles** on
every call, prepends the filter `$match`, and runs read-only against a read-only
principal. Because an MCP caller is a real app user (`_user` is populated in the
routine), owner scoping and per-viewer role gates carry over unchanged — there is
no new MCP visibility rule to design, and adding one would be a second way to
answer the same question.

## Interfaces

- **Consumes:**
  - `_ref: defaults/readable_scope.yaml`, and
    `_ref: { path: defaults/signed_in_guard.yaml, vars: { message } }` (task 1)
  - `_analytics.reportQueries { spec, roles, filterValues }` →
    `[{ id, type, query, filters }]` (task 3)
  - `_analytics.reportResponse { spec, roles, results, reportId, appliedFilters }`
    (task 4)
- **Produces:** endpoint id `get-report-data`, type `Api`, exported from the
  manifest. Task 8 calls it; task 9 documents it.

## Task

1. Create `modules/ai-reporting/api/get-report-data.yaml`, `type: Api`, with a
   header comment naming `AnalyticsPipeline` as the security gate and stating that
   per-section `:try` is what keeps one denied section from failing the call.

2. `description` — the MCP tool description, and the most load-bearing prose in
   this task. It must tell the caller to **check `truncated_sections` and
   `failed_sections` before reporting any figure**. That instruction is the only
   thing standing between a 1000-row cap and an agent stating a partial total as
   fact. Say that filter fields for a given report come from the report-detail
   tool, without naming it (tool names carry the app's module entry id).

3. `payloadSchema` — `report_id` (string, required) and `filters` (object,
   optional): a map of the report's filter field names to values. Declare date
   values as `type: string, format: date` and say ISO-8601 in the description;
   a `daterange` field takes a two-element `[from, to]` array. Do **not** expose
   Lowdefy's `{"~d": …}` wire format in the schema — no agent will reliably
   produce it and it leaks an internal format into a public contract.

4. Routine:
   - signed-in guard `_ref`, message
     `You must be signed in to read report data.`
   - reject a missing or non-string `report_id` in the routine (the schema
     enforces nothing at runtime)
   - `id: load_report`, `MongoDBFindOne` on `reports-store`: `_id` from the
     payload, `deleted.timestamp: { $exists: false }`,
     `$or: { _ref: defaults/readable_scope.yaml }`
   - reject `Report not found.` on null
   - `:for` over `_analytics.reportQueries` with `spec` composed from the loaded
     document (`title`, `description`, `sections` — the validator requires a
     non-empty title, and `spec` holds `sections` only, so compose it the way
     `resolve-report.yaml:84-92` does), `roles: { _user: roles }` and
     `filterValues: { _payload: filters }`
   - in the loop body, `:try` an `id: run_query` `AnalyticsPipeline` step on the
     `reporting-data` connection, passing `query: { _item: section.query }`,
     `filters: { _item: section.filters }` and `roles: { _user: roles }`
   - `:catch` leaves the iteration's step result unset — the sparse entry task 4's
     builder renders as a failed section — and `:log`s enough to diagnose:
     message, `report_id`, `section_id`, `section_type`, and the section's
     collection. **This log line is the only place the failure is diagnosable**:
     `:catch` receives no error object (there is no `_error` operator), so the
     gate's reason cannot reach the caller.
   - `:return` `_analytics.reportResponse` with the composed `spec`,
     `results: { _step: run_query }`, `reportId` from the payload,
     `appliedFilters: { _payload: filters }`, and `roles: { _user: roles }`

5. Wire the manifest: `- _ref: api/get-report-data.yaml` in `api:` and an
   `exports.api` entry.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds and
  `apps/demo/.lowdefy/server/build/api/ai-reporting/get-report-data.json` carries
  `description` and `payloadSchema`.
- The routine's `:for` source is `_analytics.reportQueries`, **not**
  `_analytics.querySections` — the latter excludes download sections and carries
  no resolved filters.
- Behavioural coverage lands in task 8, including the case that matters most: a
  date-filtered section returns the same rows a UI-driven filter would.

## Files

- `modules/ai-reporting/api/get-report-data.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `api:` ref and
  `exports.api` entry

## Notes

- **Do not pre-run whole-spec validation the way `resolve-report.yaml:57-75`
  does.** That pre-run exists because the Dynamic block's fallback swallows the
  error with nothing logged, leaving no diagnostic trail on a page. An API
  endpoint returns its rejection to the caller, so the trail exists already;
  adding the pre-run here is duplicated work for no gain.
- **Sections carry no `query` in the response.** Task 4's builder enforces that,
  but do not undo it by adding spec fields to the return alongside the builder's
  output. The whole subtraction rule fails if this endpoint helpfully attaches the
  spec next to the data.
- `resolve-report` is untouched by this task. The two endpoints deliberately
  coexist: one compiles blocks for the renderer, one returns JSON for a consumer.
- No `mcp` block. Same reason as tasks 5 and 6.
