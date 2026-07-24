---
title: The open query engine
module: reporting
type: concept
concepts:
  [
    open-query-engine,
    pipeline-validation,
    allowlist,
    read-only-principal,
    grain,
    fan-out,
  ]
---

# The open query engine

The reporting agent answers questions by authoring **near-arbitrary read-only MongoDB aggregation pipelines** — `$lookup`, `$unwind`, array work, window functions, faceting — over the collections you declare in the [catalog](../reference/catalog.md). Chat, charts, saved reports, and CSV exports all run the same engine: every query is a `{ collection, pipeline }` object the agent writes and the engine validates before it touches the database.

This replaces an earlier structured-spec model where the agent filled a small fixed grammar (`{ dataset, select, measures, filters, sort, limit }`) that compiled to a fixed `$match / $group / $project / $sort / $limit` pipeline. That grammar made injection structurally impossible but could only express the narrow set of questions the grammar allowed. The open engine trades _structural impossibility_ for _validated allowlist + read-only execution_ — a deliberate reduction in assurance, contained by the two-layer security model below.

## The pipeline model

The agent produces:

```json
{
  "collection": "demo_orders",
  "pipeline": [
    { "$match": { "status": "paid" } },
    { "$group": { "_id": "$region", "total": { "$sum": "$total" } } },
    { "$sort": { "total": -1 } }
  ]
}
```

`collection` must be a key of the catalog, and so must every `$lookup.from` the pipeline reaches. Nothing else about the pipeline is trusted: it is validated against three independent default-deny grammars and a set of resource caps, then **reconstructed** — the engine executes a fresh tree built only from nodes it explicitly approved, never the agent's input by reference. A subtree the validator never classified cannot reach the database; a missed case fails closed (rejected), never open.

### Three grammars, three allowlists

The same `$`-token can be legal in one position and forbidden in another (`$eq` is both an expression and a query operator; `$regex` is only a query operator), so the validator keeps three separate allowlists and never runs one grammar through another's list.

**1. Stages** — the key of each pipeline element. Default-deny; only these pass:

| Class             | Stages                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowed           | `$match` `$project` `$addFields` `$set` `$unset` `$group` `$sort` `$limit` `$skip` `$count` `$unwind` `$facet` `$bucket` `$bucketAuto` `$sortByCount` `$replaceRoot` `$replaceWith` `$redact` `$sample` `$fill` `$setWindowFields` |
| Collection-scoped | `$lookup` — `from` must be present and catalog-declared; a `from`-less `$lookup` is rejected, and its sub-`pipeline` recurses through full validation                                                                              |

Everything not on those two lists is denied. Two groups are enumerated only so the validator can return a specific error message — they are denied regardless:

| Class                           | Stages                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Denied — writes                 | `$out` `$merge`                                                                                                                                                              |
| Denied — server-side JavaScript | `$function` `$accumulator` `$where`                                                                                                                                          |
| Denied — introspection / stream | `$collStats` `$indexStats` `$currentOp` `$listLocalSessions` `$listSessions` `$planCacheStats` `$listSampledQueries` `$shardedDataDistribution` `$changeStream` `$documents` |
| Deferred (opt-in, not enabled)  | `$unionWith` `$graphLookup` `$geoNear` `$search` `$vectorSearch` `$searchMeta` `$densify`                                                                                    |

Deferred stages are rejected today with a "not enabled" message; they can be enabled per deployment when a concrete need appears. `$densify` is deferred (not allowed) because it synthesizes documents to fill a range and would need its own memory cap.

**2. Expression operators** — applied at every expression-bearing position (`$group` accumulators, `let` bindings, `$map`/`$filter`/`$reduce` bodies, `$switch` branches, computed `$project` fields, `$setWindowFields` output). Default-deny over a broad allowlist covering arithmetic, comparison, boolean, conditional, array/set, string, date, type-conversion, object, accumulator, and window operators, plus `$literal` (whose argument is opaque data the walker does not interpret but still counts toward the caps). The JS/eval operators `$function`, `$accumulator`, and `$where` are denied in **every** expression position, not only under `$expr`.

**3. Query operators** — what a `$match` query document accepts. Default-deny; allowed: `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` `$and` `$or` `$nor` `$not` `$exists` `$type` `$all` `$elemMatch` `$size` `$mod` `$regex` `$options` `$expr` (whose subtree recurses through the expression grammar). Denied: `$where` (JS/eval), `$text` (needs a text index), and the geo operators `$near` `$nearSphere` `$geoWithin` `$geoIntersects`.

### Resource caps

The allowlists decide _what_ is allowed; these caps decide _how much_. They protect both the database and the validator's own recursion:

| Cap                          | Value     | Bounds                                                                                 |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------- |
| Total stages                 | 50        | Counting `$facet` branches and `$lookup` sub-pipelines, not just the top level         |
| Sub-pipeline nesting depth   | 5         | `$lookup.pipeline` / `$facet` branch nesting                                           |
| `$lookup` stages             | 10        | Anywhere in the pipeline                                                               |
| `$facet` branches            | 10        | Per `$facet` stage                                                                     |
| Expression tree depth        | 100       | Explicit guard — deep nesting fails with a validation error, never a stack overflow    |
| Total classified nodes       | 10,000    | Guards a broad-but-shallow tree                                                        |
| Array literal length         | 100       | `$in`/`$nin`/`$all` operands and expression arrays                                     |
| Serialized pipeline size     | 100,000 B | Bounds a payload padded with large `$literal` blobs                                    |
| Regex pattern length / flags | 200 chars | Flags restricted to `imsu` — `maxTimeMS` alone does not stop catastrophic backtracking |
| `$sample.size`               | 1,000     | An unindexed `$sample` is a blocking scan                                              |

### The always-appended row limit

The engine **always appends a trailing `$limit: 1000`** — as the final top-level stage and to every `$facet` branch — after validation. An agent-supplied `$limit` is never trusted to be the bound (appending only-when-absent would let `$limit: 100000` defeat the cap; a redundant trailing `$limit` is harmless).

### Execution

Validated pipelines run through the `ReportingData` connection's single `AnalyticsPipeline` request, read-only, with `maxTimeMS` 30 000 ms and `allowDiskUse: true` (both configurable on the connection). This request is the **only** path from an AI-authored pipeline to the driver, so it is the only place validation lives.

## The two-layer security model

Safety comes from two independent layers. Neither alone is sufficient.

### Layer 1 — the validator

The pipeline validator (`plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js`) is the layer that:

- **Stops server-side JavaScript.** `$where`, `$function`, and `$accumulator` are rejected everywhere. This is the **sole** defense against JS/eval — a read-only database user runs them fine.
- **Bounds resource use** through the caps above (denial-of-service, catastrophic regex, cardinality blowups).
- **Enforces confidentiality.** The catalog — checked by the validator on the base collection and every `$lookup.from` — is the confidentiality boundary. A pipeline that names a collection not in the catalog is rejected, and the engine requires the union of every touched collection's `roles` (see [the catalog reference](../reference/catalog.md)).

### Layer 2 — the read-only principal

The `ReportingData` connection executes as a MongoDB user granted **only** the `read` role. Regardless of whether the validator is perfectly correct, that principal cannot perform `$out`/`$merge` writes or any mutation, and cannot run privileged or introspection commands. A validator gap or a mis-classified operator therefore still cannot write or run privileged commands.

Provisioning the principal, and the full list of what it does and does not stop, live in [Secrets → Read-only reporting principal](../../shared/secrets.md#read-only-reporting-principal-reporting_data_mongodb_uri).

### Why neither layer alone suffices

- The read-only principal does **not** stop JS/eval (it runs fine under `read`), does not stop CPU/DoS, and — because a DB-wide `read` grant can read every collection — does not enforce confidentiality. Those are the validator's and catalog's job.
- The validator is software and could have a gap; the read-only principal is the backstop that keeps any such gap from mutating data or running privileged commands.

## Grain and fan-out: a known, documented risk

Because the agent composes joins and unwinds freely, **the engine does not guarantee aggregates are free of double-counting.** `$unwind` on a one-to-many array multiplies parent rows; a `$lookup` that fans out and is then summed will over-count. Accepting this is an explicit design decision — grain-awareness is handled by **prompting**: the agent is told about grain and steered toward distinct-counting (`$addToSet` + `$size`) when it unwinds. Engine-side correctness checks are deferred future work, to be added when experience shows they are needed.

[MongoDB views](../how-to/complex-data.md) remain available as an optional convenience: a view can pre-bake a `$lookup`/`$unwind` at a fixed grain so counts are exact by construction. They are no longer the _required_ mechanism for joins and arrays — the agent can `$lookup` directly through catalog relationships — but they are still the surest way to hand the agent a shape where fan-out can't happen.
