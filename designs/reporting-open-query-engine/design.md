# Reporting open query engine

The reporting analytics engine today lets the AI fill a small structured spec (`{ dataset, select, measures, filters, sort, limit }`) that a compiler turns into a fixed, read-only, single-collection pipeline emitting only `$match/$group/$project/$sort/$limit`. That makes injection _structurally impossible_ — no AI-supplied string ever becomes an operator, field path, or collection — but it also means the AI can only ask the narrow set of questions the spec grammar can express. This design opens the engine up so the AI composes **near-arbitrary read-only MongoDB aggregation pipelines** — `$lookup`, `$unwind`, array work, window functions, faceting — while a new validation layer plus a read-only database principal keep it safe. It is a design only; nothing here is implemented yet.

## Proposed change

1. Replace the structured query spec on the _exploratory_ path with an **AI-authored aggregation pipeline**: the agent emits `{ collection, pipeline: [...stages] }`, where `collection` is a dictionary-declared base collection and `pipeline` is a MongoDB aggregation pipeline.
2. Validate every pipeline against a **default-deny allowlist** of read-only stages and expression operators, recursing into every nested sub-pipeline (`$lookup.pipeline`, `$unionWith`, `$facet`, `$graphLookup`) and expression tree (`$expr`, `$map`/`$filter`/`$reduce`, `$group` accumulators, `let`). Anything not on the allowlist is rejected.
3. Make the **data dictionary the confidentiality/authorization boundary**: every collection referenced anywhere in the pipeline (including nested lookups) must be declared and role-gated; the engine enforces the union of those collections' role requirements.
4. Add a **second, independent safety layer**: execute all pipelines as a MongoDB principal with only `read` privileges, so a validator gap or mis-classified operator still cannot mutate data or run privileged commands.
5. Add **resource governance**: structural caps (max stages, sub-pipeline depth, `$lookup`/`$unionWith` count), a mandatory trailing result `$limit`, `maxTimeMS`, and an `allowDiskUse` policy tuned for joins/large groups.
6. **Accept fan-out/grain correctness as a known, documented risk for now** — the engine does not guarantee aggregates are free of double-counting. Grain-awareness is handled by prompting the agent; engine-side correctness checks are deferred future work, added when experience shows they're needed. Views stop being the required correctness layer.
7. Fold the recently shipped **dotted `field` paths and date `bucket`s into the general model** (they become ordinary field references and `$dateTrunc` usage) and keep MongoDB views as an _optional_ convenience, not a requirement.

## Why this, and why now

The dotted-path + views work (commits `e7a0b95e`, `bc556eae`) deliberately kept the compiler flat and pushed joins/arrays into author-defined views, because emitting `$lookup`/`$unwind` from a _structured spec_ would have meant either enumerating a large grammar or risking silent fan-out. That was the right call for a bounded feature. But the product goal is now different: the reporting module is headed for **production over complicated schemas**, and the agent should feel able to _ask almost anything and get an answer_. A structured grammar can never reach "anything"; an open, validated pipeline can. The cost is that the security guarantee changes from _structural impossibility_ to _validated allowlist + read-only execution_ — a real reduction in assurance that this design has to justify and contain.

## Current state

- `plugins/modules-mongodb-plugins/src/analytics/validateQuerySpec.js` — validates the structured spec against the dictionary allowlist; returns a normalized spec.
- `plugins/modules-mongodb-plugins/src/analytics/compileMongo.js` — pure function; emits only `$match/$group/$project/$sort/$limit`. Recently gained dotted `field` paths and date `bucket` (`$dateTrunc` inside `$group`), still no new stages.
- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — caps and regexes: `ID_REGEX` (dotless), `PATH_REGEX` (dotted, no `$`), `DATE_BUCKETS`, `OPS_BY_TYPE`, row/select/measure/filter caps.
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsQuery/AnalyticsQuery.js` — the single execution path: `validateQuerySpec` → `compileMongo` → `collection(dataset.source.collection).aggregate(pipeline, { maxTimeMS: 30000, allowDiskUse: false })`. Meta marks it `checkRead: true, checkWrite: false`.
- Consumers of the structured spec beyond ad-hoc query: `validateChartSpec.js`, `validateReportSpec.js`, `validateExportSpec.js`, `compileReport.js` — these back `render_chart`, `generate_report`, `export_data`.
- Security rationale is stated in `compileMongo.js` / `AnalyticsQuery.js` / `constants.js` headers and originates in the external `ai-chat-reporting` design (referenced in `constants.js:2`).

The lockdown is original (`e1c876c0`, `27af9feb`), not accreted — so loosening it is a deliberate reversal of an intentional decision, which this design records.

## Key decisions and rationale

### Raw pipeline, not an expanded structured spec

Chosen over (a) growing the structured grammar to cover joins/unwind/arrays, and (b) a hybrid structured-default-with-raw-escape-hatch. An expanded grammar can never reach "ask anything" and would be a perpetual catch-up against MongoDB's operator surface; a hybrid doubles the maintained surface. The raw pipeline is the only model that meets the "anything" goal. The trade-off — a large, adversarial validation surface — is accepted and contained by the layers below.

### Allowlist, not denylist

The request was "allow everything except `$out`/`$merge`/`$function`." We invert it: **default-deny**, allow an explicit read-only set. A denylist silently admits any operator a future MongoDB version introduces — including a new write, eval, or introspection operator — the moment the driver supports it. An allowlist fails safe: an unknown operator is rejected until someone reviews and adds it. The _effect_ is the same (most read operators are allowed); the failure mode is the difference.

### Two independent layers (validator + read-only principal)

The validator and the database principal defend against **different** threats, and neither alone is sufficient:

- **Read-only principal** (a Mongo user granted only `read`) stops writes (`$out`, `$merge`) and privileged/introspection stages regardless of validator correctness — but it does **not** stop `$function`/`$where` (JS runs under a read-only user), CPU/DoS, or reading a _different_ collection the user happens to have read on.
- **Validator** stops JS/eval, DoS-shaped pipelines, and confidentiality violations (reading collections outside the dictionary) — but a single missed operator or parsing gap could otherwise be catastrophic.

Together they mean a bug in either layer is not, by itself, exploitable into data loss or a confidentiality breach.

### The dictionary is the confidentiality boundary; the principal is the write boundary

The read-only principal is typically granted DB-wide `read`, so it does **not** enforce _which_ collections the agent may see — the validator does, against the dictionary's declared collections. Every `from`/`coll` in `$lookup`/`$unionWith`/`$graphLookup` (recursively) must be declared, and the engine enforces the **union of roles** across all touched collections. A pipeline that reaches an undeclared collection is rejected. (Per-collection grants on the principal are possible as extra depth but are ops-heavy; not required.)

### Correctness is deferred, not designed-in

Per direction: views are **not** the primary/authoritative layer, and guaranteed-correct aggregates are **not** a launch priority. Free `$unwind`/`$lookup` can double-count (fan-out) — this is documented as a known risk. Mitigation for now is **prompting**: the agent is told about grain and steered toward distinct-counting (`$addToSet` + `$size`) when it unwinds. Engine-side correctness aids (grain declaration, fan-out detection, automatic distinct-counts, result annotations) are captured as future work to add _when experience shows they're needed_. Views remain available as a convenience for pre-baked grains but are no longer required.

## The validation model (the core)

The validator is a pure function over the pipeline tree: `validatePipeline({ collection, pipeline, datasets, roles }) → { collection, pipeline }` or throws. It never executes anything.

### 1. Structural shape

- `pipeline` is an array of stage objects; each stage is a single key (`$stage`) → argument. Reject multi-key stage objects, non-arrays, empty stages.
- Enforce caps (see [Resource governance](#resource-governance)).

### 2. Stage allowlist (default-deny)

Read/transform stages are allowed; write, JS/eval, and server-introspection stages are rejected. Constrained stages are allowed only with collection scoping.

| Class                           | Stages                                                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Allow**                       | `$match`, `$project`, `$addFields`/`$set`, `$unset`, `$group`, `$sort`, `$limit`, `$skip`, `$count`, `$unwind`, `$facet`, `$bucket`, `$bucketAuto`, `$sortByCount`, `$replaceRoot`/`$replaceWith`, `$redact`, `$sample`, `$densify`, `$fill`, `$setWindowFields` |
| **Allow, collection-scoped**    | `$lookup`, `$unionWith`, `$graphLookup` (their `from`/`coll` must be dictionary-declared; sub-pipelines recurse)                                                                                                                                                 |
| **Deny — writes**               | `$out`, `$merge`                                                                                                                                                                                                                                                 |
| **Deny — JS/eval**              | `$function`, `$accumulator`, `$where` (and `$expr`/`$match` containing any of these)                                                                                                                                                                             |
| **Deny — introspection/stream** | `$collStats`, `$indexStats`, `$currentOp`, `$listLocalSessions`, `$listSessions`, `$planCacheStats`, `$listSampledQueries`, `$shardedDataDistribution`, `$changeStream`, `$documents`                                                                            |
| **Deferred / opt-in**           | `$geoNear` (needs a geo index; must be first stage), `$search`/`$vectorSearch`/`$searchMeta` (Atlas-only) — off by default, addable per deployment                                                                                                               |

Anything not listed is denied (default-deny), so a MongoDB upgrade cannot silently widen the surface.

### 3. Expression operator allowlist (recursive)

Wherever an expression can appear — `$match` query + `$expr`, `$project`/`$addFields` computed fields, `$group` accumulators, `$redact`, `let` bindings, `$map`/`$filter`/`$reduce` bodies, `$lookup` `let` — the validator walks the expression tree and requires every `$`-prefixed operator to be on the expression allowlist. Allowed: the arithmetic, comparison, boolean, conditional (`$cond`/`$switch`/`$ifNull`), array (`$map`/`$filter`/`$reduce`/`$size`/`$slice`/`$in`/`$setUnion`…), string, date (`$dateTrunc`/`$dateToParts`/`$dateAdd`…), type, and object (`$mergeObjects`/`$objectToArray`) families, plus accumulators (`$sum`/`$avg`/`$min`/`$max`/`$push`/`$addToSet`/`$first`/`$last`/window operators). Denied: `$function`, `$accumulator`, `$where`, and any `$expr` subtree containing them.

Field-path references (`"$field"`, `"$a.b.c"`) are allowed within a permitted collection; see field scoping below.

### 4. Collection scoping and authorization

- Recursively collect every collection named by `$lookup.from`, `$unionWith` (string or `{ coll, pipeline }`), `$graphLookup.from`, plus the base `collection`.
- Each must exist in the dictionary's declared collections; otherwise reject.
- Compute the union of `roles` across all touched collections and enforce the caller holds at least one of each required set (extends today's single-dataset role gate in `validateQuerySpec.js`).
- Recurse the full validation into each sub-pipeline with the joined collection as its base.

### 5. Field scoping (confidentiality)

Default: any field within an allowed collection is readable (pipelines synthesize computed fields, so field-level allowlisting fights "ask anything"). For collections with sensitive fields, the dictionary may declare an optional `deny_fields` (or `allow_fields`) list; the validator rejects references to denied paths in `$project`/`$match`/expressions. This is opt-in per collection — see [Open questions](#open-questions) for whether we need it at launch.

### 6. Resource governance

- **Mandatory trailing `$limit`** on the top-level pipeline (engine-injected if absent), capping returned rows (e.g. 1000–5000).
- **Structural caps:** max total stages (e.g. 50), max sub-pipeline nesting depth (e.g. 5), max `$lookup`+`$unionWith`+`$graphLookup` count (e.g. 10), max `$facet` branches.
- **`maxTimeMS`** retained (configurable; default 30000) — the primary DoS backstop for unindexed `$lookup`/large `$group`.
- **`allowDiskUse`** likely flipped to `true` (joins and large groups need it), bounded by the row limit and `maxTimeMS`; decision recorded with its trade-off.
- **Indexing:** the engine can't guarantee an index exists on a `$lookup` `foreignField`; `maxTimeMS` catches the pathological case. Optionally emit a slow-query log/warning.

## Query shape and agent surface

The `query_data` tool input changes from a structured spec to:

```yaml
collection: activities # dictionary-declared base collection
pipeline: # AI-authored, validated read-only aggregation
  - $lookup:
      {
        from: companies,
        localField: company_id,
        foreignField: _id,
        as: company,
      }
  - $unwind: $company
  - $group: { _id: "$company.region", n: { $sum: 1 } }
  - $sort: { n: -1 }
  - $limit: 20
```

The **data dictionary evolves from a query contract into a schema catalog + access policy**: instead of (or in addition to) `dimensions`/`measures`, each entry declares the collection, its `roles`, a human/AI-readable description of fields and their types, and declared relationships (which fields join to which collections) so the agent can author correct `$lookup`s. The richer the catalog, the better the agent's pipelines — but querying no longer requires pre-enumerating every dimension/measure.

## Relationship to the current approach

- **Dotted `field` paths** — subsumed: the agent references any field path directly inside a validated pipeline (scoped to allowed collections). The structured-spec `field` mapping is no longer needed on the exploratory path.
- **Date `bucket`s** — subsumed: `$dateTrunc` is an allowed operator the agent uses directly.
- **MongoDB views** — retained as an optional convenience (an author can still expose a pre-baked, correct-grain view as a "collection" in the dictionary), but no longer the required mechanism for joins/arrays.
- **Report generation** (`validateReportSpec.js`, `compileReport.js`, `render_chart`, `export_data`) — **out of scope here and a deliberate boundary.** Report _sections_ need stable, typed output columns to render KPIs/charts/tables, which an arbitrary pipeline doesn't guarantee. The open engine replaces the _exploratory_ `AnalyticsQuery`/`query_data` path first; whether report sections stay structured or adopt "raw pipeline + declared output-column schema" is a follow-on decision (see Open questions). Until then, the structured spec and its validators remain for the report path.

## Architecture / data flow

1. Agent calls `query_data` with `{ collection, pipeline }`.
2. New `validatePipeline` (pure) validates against the dictionary + allowlists + caps, collecting touched collections and enforcing roles.
3. A new execution path (either a new `AnalyticsPipeline` request type or a widened `AnalyticsQuery`) runs the validated pipeline via the **read-only-principal** `reporting-data` connection with `maxTimeMS`/`allowDiskUse`/injected `$limit`.
4. Rows returned to the agent (and to the charts/downloads panel) exactly as today.

The structured `AnalyticsQuery` + `compileMongo` remain in place for the report path during the transition.

## Files changed (anticipated)

- `plugins/modules-mongodb-plugins/src/analytics/` — new `validatePipeline.js` + `stageAllowlist.js`/`operatorAllowlist.js` constants; `constants.js` gains stage/operator sets and new caps. `compileMongo.js`/`validateQuerySpec.js` stay for the report path.
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/` — new `AnalyticsPipeline` request (or widened `AnalyticsQuery`); execution reads from the read-only principal.
- `modules/reporting/agents/reporting-assistant.yaml` — rewrite the `query_data` tool contract and instructions (pipeline authoring, grain-awareness, the catalog).
- `modules/reporting/api/query-data.yaml` — pass a pipeline instead of a spec.
- Data dictionary shape (`module.lowdefy.yaml` var docs + `apps/demo/modules/reporting/datasets.yaml`) — evolve to a schema catalog + access policy with declared collections/relationships/roles.
- `docs/reporting/` — new concept page for the open engine, the security model (two layers), and the catalog; update `how-to/complex-data.md` (views now optional).
- Deployment/secrets docs — provisioning the read-only MongoDB principal.

## Open questions

1. **Report path:** do report sections stay on the structured spec, or move to "raw pipeline + declared output-column schema"? Recommend: keep structured for reports at first; revisit once the exploratory engine is proven.
2. **Field-level scoping at launch:** is collection-level allow + read-only principal enough, or do we need `deny_fields` from day one (e.g. is there PII in a declared collection)? Depends on the collections a real deployment exposes.
3. **`allowDiskUse` default:** flip to `true` for joins, or keep `false` and let heavy queries fail fast? Leaning `true` with tight row/time caps.
4. **Dictionary migration:** do we keep `dimensions`/`measures` as optional catalog hints (they help the agent and still drive the report builder), or fully replace them with a free-form schema description?
5. **Caching / cost:** should validated pipelines be cached, and do we need a query-cost estimate beyond `maxTimeMS`?
6. **`$unionWith`/`$graphLookup`:** allow at launch or defer? Powerful but expand the auth/complexity surface most.

## Non-goals

- Implementation — this is a plan only.
- Write capability of any kind — the engine stays strictly read-only.
- Guaranteed-correct aggregates — explicitly deferred (see the correctness decision).
- Changing the report renderer or the saved-report format in this design.
- Multi-database queries — all touched collections live in the one `reporting-data` database.

## Risks

- **Validator completeness** is now safety-critical: a missed nesting site (a sub-pipeline, a `let`, an expression family) could admit a denied operator. Mitigated by default-deny + the read-only principal, but the validator needs adversarial tests (nested `$lookup.pipeline` with `$merge`, `$expr` with `$function`, `$unionWith` string form, `$facet` branches).
- **DoS** via expensive-but-legal pipelines (cartesian `$lookup`, deep `$facet`) — bounded by caps + `maxTimeMS`, not eliminated.
- **Wrong numbers** from fan-out — accepted for now; the top user-visible risk, revisited when it bites.
- **Operator drift:** new MongoDB operators need triage into the allowlist; default-deny makes the failure "can't use it yet" rather than "silently unsafe."
