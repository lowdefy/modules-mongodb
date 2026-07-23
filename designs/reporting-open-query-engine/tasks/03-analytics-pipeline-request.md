# Task 3: `AnalyticsPipeline` Replaces `AnalyticsQuery` (Connection-Level Catalog)

## Context

Today the `ReportingData` connection has a single request, `AnalyticsQuery` (`plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsQuery/AnalyticsQuery.js`): it takes `{ datasets, spec, roles }` as request properties, runs `validateQuerySpec` → `compileMongo`, and executes with `{ maxTimeMS: connection.maxTimeMS ?? 30000, allowDiskUse: false }`. Every API endpoint separately wires `datasets: { _module.var: datasets }` and `roles: { _user: roles }` (see `modules/reporting/api/query-data.yaml`).

This task replaces it with `AnalyticsPipeline`, running task 2's `validatePipeline`. Two deliberate architecture changes:

1. **The catalog binds at the connection, not per request.** The connection schema gains a `catalog` property, wired once via `_module.var` in `modules/reporting/connections/reporting-data.yaml` — so every request validates against the same catalog by construction and a caller cannot substitute a stale or trimmed one. Requests carry only the query, roles, and optional filter triples.
2. **Server-built filter `$match`.** Report filter re-queries send `filters: [{ field, op, value }]` triples. These are untrusted client input (browser CallAPI). The request builds the `$match` itself from a fixed default-deny op map, prepends it, and the combined pipeline goes through `validatePipeline` like any other — the built stage is not exempt.

This is a breaking replacement: `AnalyticsQuery`, `validateQuerySpec.js`, and `compileMongo.js` are deleted. Consumers (API YAMLs, report validators) still reference the old shapes after this task — they are rewritten in tasks 5 and 6; the build gate is task 7.

## Task

**Create `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js`:**

- Request properties: `query: { collection, pipeline }`, `roles` (wire as `{ _user: roles }`), optional `filters: [{ field, op, value }]`.
- Catalog comes from `connection.catalog` — NOT from request properties.
- Filter handling (before validation): drop triples whose `value` is `null`/`undefined` ("no constraint"); map ops through a fixed map `{ eq: "$eq", gte: "$gte", lte: "$lte" }` — an unknown `op` throws (default-deny), never skips; build `{ $match: { [field]: { [mappedOp]: value } } }` per triple (combine multiple triples into one `$match` with `$and`, matching today's `compileMongo` filter shape) and PREPEND to `query.pipeline`. Field names land in key position here — safety comes from the next step.
- Run `validatePipeline({ collection: query.collection, pipeline: combined, catalog: connection.catalog, roles })` and execute the RECONSTRUCTED result: `mongoDb.collection(collection).aggregate(reconstructed, { maxTimeMS: connection.maxTimeMS ?? 30000, allowDiskUse: connection.allowDiskUse ?? true })`.
- Statics as today (they are read by the request pipeline — see the comment in `AnalyticsQuery.js:39-43`): `AnalyticsPipeline.schema = {}` and `AnalyticsPipeline.meta = { checkRead: true, checkWrite: false }`.
- Write a header comment in the same voice as `AnalyticsQuery.js`'s: the single security boundary, validate-inside-the-request, catalog-from-connection rationale.

**Create `AnalyticsPipeline.test.js`:** happy path (mock `getMongoDb`), filter-triple prepend semantics (null dropped, unknown op throws, triples land pre-pipeline), catalog-from-connection (request cannot override), allowDiskUse default true, and one adversarial passthrough (`$where` triple field rejected by validation).

**Update `ReportingData.js`:** register `AnalyticsPipeline`, remove `AnalyticsQuery`.

**Update `schema.js`** (`src/connections/ReportingData/schema.js`): add `catalog` (type object, description: the collections catalog — the engine's confidentiality/authorization boundary, keyed by collection name) and `allowDiskUse` (type boolean, default `true`, description per design §6). Keep `additionalProperties: false`.

**Update `modules/reporting/connections/reporting-data.yaml`:** add `catalog: { _module.var: catalog }` (the var is renamed `datasets` → `catalog` in task 4; use the new name — the build breaks until task 4 lands, which is fine on this branch) to the connection properties.

**Delete:** `AnalyticsQuery/` (both files), `src/analytics/validateQuerySpec.js` + `validateQuerySpec.test.js`, `src/analytics/compileMongo.js` + `compileMongo.test.js`. Remove now-unused spec-grammar constants from `constants.js` ONLY if nothing else still imports them (`validateChartSpec`/`validateReportSpec` still do until task 6 — leave those constants in place and note them for task 6 cleanup).

## Acceptance Criteria

- `AnalyticsPipeline.test.js` passes; no remaining imports of `validateQuerySpec`/`compileMongo` anywhere in `src/connections/`.
- `grep -rn "AnalyticsQuery" plugins/ modules/` shows only the not-yet-rewritten API YAMLs (tasks 5/6) — no plugin source references.
- The executed pipeline is the reconstructed object from `validatePipeline`, not the input (assert via mock capture in the test).
- Unknown filter `op` (e.g. `"regex"`) throws before any DB call.

## Files

- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js` — create
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.test.js` — create
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/ReportingData.js` — modify — swap the request registration
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/schema.js` — modify — add `catalog`, `allowDiskUse`
- `modules/reporting/connections/reporting-data.yaml` — modify — wire `catalog` connection property
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsQuery/` — delete
- `plugins/modules-mongodb-plugins/src/analytics/validateQuerySpec.js`, `validateQuerySpec.test.js`, `compileMongo.js`, `compileMongo.test.js` — delete

## Notes

The deployment side of the design (`databaseUri` repointed at a read-only MongoDB principal) is a config/ops change with no code here — documented in task 9. `maxTimeMS` stays a connection property with default 30000, unchanged.
