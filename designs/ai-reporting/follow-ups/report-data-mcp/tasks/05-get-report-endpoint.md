# Task 5: The `get-report` endpoint

## Context

`get-report` is how an agent learns what a report contains and what
`get-report-data` will accept for it. It exists as a separate tool rather than
being folded into `get-report-data` because of a structural limit: a report's
accepted filters live in its saved spec and differ per report, so a static
`payloadSchema` cannot enumerate them. The schema declares the _shape_ of the
filter argument; the _valid values_ come from here.

No existing endpoint can be reused. `resolve-report` is `InternalApi`, reads
`_payload: urlQuery.report_id`, and compiles spec + rows into blocks server-side
for the Dynamic block — it is shaped for the renderer, not a data consumer.
Flipping it to `Api` would also open the block-compiling resolver to browser
callers, a change to the app's external surface made for an unrelated reason.

Task 1 extracted the readable predicate and the signed-in guard. Task 4 produced
`_analytics.reportSpec`, which applies the strip rule.

## Interfaces

- **Consumes:**
  - `_ref: defaults/readable_scope.yaml` — the `$or` value (task 1)
  - `_ref: { path: defaults/signed_in_guard.yaml, vars: { message } }` (task 1)
  - `_analytics.reportSpec { spec, roles }` → `{ title, description, sections }`
    with `query`/`optionsQuery` stripped (task 4)
- **Produces:** endpoint id `get-report`, type `Api`, exported from the module
  manifest. Task 8 calls it; task 9 documents it.

## Task

1. Create `modules/ai-reporting/api/get-report.yaml`, `type: Api`, with a header
   comment stating what it is for and — importantly — that its response carries no
   pipelines, and why.

2. Write the `description`. It becomes the MCP tool description an agent reads to
   decide whether to call it, so it must say: returns a saved report's structure
   and its accepted filter fields, and that those filter fields are the input to
   `get-report-data`. **It must not hardcode a sibling tool's name** — tool names
   are derived from the module entry id (`createMcpServer.js` applies
   `id.replaceAll('/', '__')`), so an app mounting the module as `reporting` gets
   `reporting__get-report-data`. Refer to the sibling by role, not by name.

3. Write the `payloadSchema`: an object requiring `report_id` (string). Follow the
   shape of `query-data.yaml:17-54` — every property carries a `description`,
   because the schema _is_ the tool's `inputSchema` and it is the caller's only
   documentation.

4. Routine:
   - the signed-in guard `_ref`, message `You must be signed in to open a report.`
   - **guard `report_id` in the routine** — reject a missing or non-string
     `report_id`. `payloadSchema` is advertisory and never validated at runtime:
     the MCP call handler passes tool arguments straight through, and
     `_payload` of an absent key resolves to `null`. A schema-only restriction is
     documentation wearing a guard's uniform.
   - `MongoDBFindOne` on the `reports-store` connection
     (`_module.connectionId: reports-store`), matching `_id` on the payload,
     `deleted.timestamp: { $exists: false }` so a soft-deleted report reads as
     not-found, and `$or: { _ref: defaults/readable_scope.yaml }`
   - reject `Report not found.` when the find returns null — the same answer for a
     report that does not exist and one the caller may not read, so a caller
     cannot probe for existence
   - return `_analytics.reportSpec` over the loaded document's
     `{ title, description, sections }`, plus the metadata a caller needs to
     describe the report: `report_id`, `visibility`, `owner.name`, `created`,
     `updated`

5. Wire the manifest: add `- _ref: api/get-report.yaml` to the `api:` list and an
   `exports.api` entry with a one-line description.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds and
  `apps/demo/.lowdefy/server/build/api/ai-reporting/get-report.json` exists
  carrying `endpointId: ai-reporting/get-report`, a `description` and a
  `payloadSchema` — the three things `buildMcp` requires of a tool.
- The built artifact's routine contains no `owner.user_id` literal other than
  through the extracted fragment (the predicate is not re-inlined).
- Behavioural coverage lands in task 8.

## Files

- `modules/ai-reporting/api/get-report.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `api:` ref and
  `exports.api` entry

## Notes

- **`owner.user_id` must not be returned.** `list-reports` deliberately projects
  it out and returns `owner.name` plus a derived `is_owner`; a caller learning
  other users' ids from a shared report is a new disclosure. Follow the same
  posture: `owner.name` yes, `owner.user_id` no.
- **`favourite_of` must not be returned.** `list-reports:224-227` projects it out
  because a caller must never learn who else favourited a report. Nothing in this
  response should carry it.
- Do not add an `mcp` block anywhere. This endpoint is MCP-_suitable_; listing it
  is app config, and gated on the consent page and version bump.
