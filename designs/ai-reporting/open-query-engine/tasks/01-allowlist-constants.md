# Task 1: Allowlist Constants for the Three Pipeline Grammars

## Context

The open query engine validates AI-authored MongoDB aggregation pipelines against **three distinct grammars**, each with its own default-deny allowlist: pipeline **stages**, aggregation **expression** operators, and the **query-document** operators that `$match` takes (a different grammar from expressions — conflating them is the classic validator trap). This task creates the allowlist modules and resource caps that task 2's `validatePipeline.js` consumes. Everything lives in `plugins/modules-mongodb-plugins/src/analytics/`, next to the existing `constants.js` (which already holds the old spec-grammar caps like `MAX_IN_VALUES`).

Membership semantics are implementation-critical: keys like `constructor`, `toString`, `valueOf`, `__proto__`, `hasOwnProperty` resolve truthy through `Object.prototype`, so a plain-object lookup (`allowlist[key]` or `key in obj`) would silently admit them. All sets must be `Set` instances (or null-prototype objects checked with `Object.hasOwn`).

## Task

Create three new modules in `plugins/modules-mongodb-plugins/src/analytics/`:

**`stageAllowlist.js`** — stage classification sets (design §2):

- `ALLOWED_STAGES`: `$match`, `$project`, `$addFields`, `$set`, `$unset`, `$group`, `$sort`, `$limit`, `$skip`, `$count`, `$unwind`, `$facet`, `$bucket`, `$bucketAuto`, `$sortByCount`, `$replaceRoot`, `$replaceWith`, `$redact`, `$sample`, `$fill`, `$setWindowFields`.
- `$lookup` is allowed but **collection-scoped** (its own class or a flag): `from` must be present and catalog-declared; the `from`-less form (which only pairs with `$documents`) is rejected.
- `DENIED_STAGES` (explicit, for error messages — everything unlisted is denied anyway): writes `$out`/`$merge`; JS/eval `$function`/`$accumulator`/`$where`; introspection/stream `$collStats`, `$indexStats`, `$currentOp`, `$listLocalSessions`, `$listSessions`, `$planCacheStats`, `$listSampledQueries`, `$shardedDataDistribution`, `$changeStream`, `$documents`.
- `DEFERRED_STAGES` (rejected with a "not enabled" message): `$unionWith`, `$graphLookup`, `$geoNear`, `$search`, `$vectorSearch`, `$searchMeta`, `$densify`. **`$densify` is deferred, not allowed** — it is the only allowed-class stage that synthesizes documents and would need its own span×step cap; it was deliberately moved to deferred (design §2/§6).

**`expressionOperatorAllowlist.js`** — aggregation-expression grammar (design §3):

- Allowed families: arithmetic, comparison, boolean, conditional (`$cond`/`$switch`/`$ifNull`), array (`$map`/`$filter`/`$reduce`/`$size`/`$slice`/`$in`/`$setUnion`/`$range`/`$concatArrays`…), string (incl. `$regexMatch`/`$regexFind`/`$regexFindAll` — capped, see regex caps below), date (`$dateTrunc`/`$dateToParts`/`$dateAdd`…), type conversion, object (`$mergeObjects`/`$objectToArray`/`$getField`/`$setField`), `$literal`, plus accumulators (`$sum`/`$avg`/`$min`/`$max`/`$push`/`$addToSet`/`$first`/`$last`) and window operators for `$setWindowFields.output`.
- Denied anywhere in any tree: `$function`, `$accumulator`, `$where`.
- `ALLOWED_SYSTEM_VARIABLES`: the fixed `$$`-set `NOW`, `ROOT`, `CURRENT`, `REMOVE`, `DESCEND`, `PRUNE`, `KEEP`. Everything else (notably `USER_ROLES`, `CLUSTER_TIME`, `SEARCH_META`) is rejected unless lexically bound by `let`/`$lookup.let`/`$map`/`$filter`/`$reduce`.

**`matchOperatorAllowlist.js`** — query-document grammar (design §3b), distinct from expressions:

- Allow: comparison `$eq`/`$ne`/`$gt`/`$gte`/`$lt`/`$lte`/`$in`/`$nin`; logical `$and`/`$or`/`$nor`/`$not`; element `$exists`/`$type`; array `$all`/`$elemMatch`/`$size`; evaluation `$mod`/`$regex` (+`$options`); `$expr` (subtree switches to the expression grammar).
- Deny: `$where`, `$text`, geo operators (`$near`, `$nearSphere`, `$geoWithin`, `$geoIntersects`).

Extend `constants.js` with the new caps (values per design §6; export names are suggestions — keep them consistent with the walker):

- `MAX_PIPELINE_STAGES = 50` (counted **including** stages inside `$facet` branches and `$lookup` sub-pipelines)
- `MAX_SUBPIPELINE_DEPTH = 5`, `MAX_LOOKUP_COUNT = 10`, `MAX_FACET_BRANCHES = 10`
- `MAX_EXPRESSION_DEPTH`, `MAX_PIPELINE_NODES`, `MAX_ARRAY_LITERAL_LENGTH = 100` (carries forward today's `MAX_IN_VALUES` for `$in`/`$nin`/`$all`), `MAX_PIPELINE_BYTES` (serialized size)
- `MAX_REGEX_PATTERN_LENGTH`, `ALLOWED_REGEX_FLAGS = "imsu"` (reject `x`/verbose and anything else)
- `MAX_SAMPLE_SIZE` (cap on `$sample.size`)
- `PIPELINE_RESULT_CAP` (the unconditionally appended trailing `$limit`, e.g. 1000–5000; pick 1000 to match today's `MAX_LIMIT`)

Do **not** delete the old spec-grammar constants (`AGGREGATIONS`, `OPS_BY_TYPE`, `DATE_BUCKETS`, `MAX_SELECT`, `MAX_MEASURES`, `ID_REGEX`, `PATH_REGEX`, …) in this task — their consumers are removed in tasks 3 and 6; final cleanup happens there. Report/UI constants (`MAX_SECTIONS`, `MAX_LABEL_LENGTH`, `MAX_MARKDOWN_LENGTH`, `MAX_FILTER_OPTIONS`, `CHART_TYPES`, `FILTER_CONTROLS`, `REPORT_*`) remain in use.

## Acceptance Criteria

- The three allowlist modules export `Set`-based (or null-prototype) collections; `constructor`/`__proto__`/`toString` are NOT members of any set (assert in a small unit test).
- `$densify`, `$unionWith`, `$graphLookup` are in the deferred set, not the allowed set.
- `$where` appears in the deny surface of BOTH the stage grammar and the query grammar; `$function`/`$accumulator` in both stage and expression grammars.
- New caps exported from `constants.js` with doc comments explaining what each bounds.
- Existing plugin unit tests still pass (`pnpm --filter @lowdefy/modules-mongodb-plugins test` or the repo's test script).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/stageAllowlist.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/expressionOperatorAllowlist.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/matchOperatorAllowlist.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — modify — add the new caps; keep existing constants

## Notes

Write header comments in each allowlist module stating which grammar it covers and why the three are separate (the design's §3/§3b distinction) — these files are the reference the next reviewer reads.
