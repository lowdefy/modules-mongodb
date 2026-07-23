# Task 2: `validatePipeline.js` — Reconstruct-Don't-Forward Walker + Adversarial Test Suite

## Context

This is the security core of the open query engine. Task 1 created the three grammar allowlists (`stageAllowlist.js`, `expressionOperatorAllowlist.js`, `matchOperatorAllowlist.js`) and the resource caps in `constants.js`. This task builds the validator that consumes them. For JS/eval (`$where`/`$function`/`$accumulator`) the validator is the **sole** defense — the read-only MongoDB principal does not stop server-side JS — so the adversarial test suite is part of this task, not optional.

The old engine (`compileMongo.js`) was rebuild-from-normalized-spec: no AI string could ever land in operator position. The new validator is necessarily inspect-and-forward, so it narrows the gap by **reconstructing**: it returns a freshly built tree containing only nodes it explicitly classified and approved. Anything unvisited fails closed.

## Task

Create `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js`: a pure function

```
validatePipeline({ collection, pipeline, catalog, roles })
  → { collection, pipeline }   // freshly reconstructed
  // or throws Error with a message the model (or app author) can act on
```

It never executes anything. Follow the existing error style (`fail()` helper throwing `Invalid pipeline: …` — see `validateQuerySpec.js` for the pattern being replaced).

**Reconstruction (design §0).** As the walker validates each node it rebuilds it into a new object/array, copying only approved keys/values. Never return or forward the input by reference. Treat non-plain scalar instances (`Date`, `ObjectId`) as opaque values copied as-is — resolve-time input is BSON-deserialized, so they legitimately appear where `JSON.parse` output never would.

**Structural shape (design §1).** `pipeline` is an array of single-key stage objects. Reject multi-key stage objects, non-arrays, empty stages. Per-stage argument-type contract checked before any allowlist logic: `$limit`/`$skip` take a number, `$sample` takes `{ size: number }`, `$match`/`$group`/`$project`/`$addFields`/`$set`/`$bucket`/`$facet`/`$lookup` take an object, `$unwind` a string or object, `$unset` a string or array of strings, `$sort` an object, `$count` a string, `$facet` an object whose every branch value is an array. `$lookup.from` must be a string (reject object/array).

**One generic recursive walk (design §3).** Do not enumerate expression sites. At every node, any key beginning with `$` must be classified and allowlisted for its grammar context (stage / expression / match-query). Rules:

- Membership via `Object.hasOwn` on the task-1 sets only. Reject the keys `__proto__`, `constructor`, `prototype` wherever they appear.
- Every string **value** is classified: literal, field path (`"$field"`, `"$a.b.c"`), or variable (`"$$…"`). `$$`-vars check against the system set plus the lexical scope: names bound by `let`/`$lookup.let`/`$map`/`$filter`/`$reduce` are in scope only inside the expression that binds them; `$lookup.let` binds in the outer scope and is consumed by the inner pipeline's `$expr`. Bound value-expressions themselves still recurse. All other `$$`-tokens rejected (`$$USER_ROLES`, `$$CLUSTER_TIME`, `$$SEARCH_META`, …).
- `$literal` stops recursion (its argument is opaque data, copied verbatim into the reconstruction) but still counts toward the size/node/array caps.
- **Query-document walk rules for `$match` (design §3b):** if any key of an object value under a field key starts with `$`, the object is an operator document and ALL keys must be allowlisted query operators (`{ f: { $gt: 1, $where: "…" } }` fails); otherwise it is a literal — and literal subtrees reject `$`-shaped keys fail-closed (no `$literal` escape exists in the query grammar). `$elemMatch` recurses as a nested query document; `$not` takes an operator document or regex; `$expr` switches to the expression grammar.
- `$regex`/`$options` (and `$regexMatch`/`$regexFind`/`$regexFindAll`): enforce `MAX_REGEX_PATTERN_LENGTH` and `ALLOWED_REGEX_FLAGS` (`imsu` only).

**Collection scoping and authorization (design §4).** Collect the base `collection` plus every `$lookup.from`, recursively. Each must be a key of `catalog`; otherwise reject with the available collection names in the message. Enforce roles as the union across touched collections: for each collection with a non-empty `roles` list, the caller must hold at least one (absent/empty `roles` = any authenticated user — same semantics as today's gate in `validateQuerySpec.js:120-127`). Recurse the FULL validation (stages + expressions + auth + caps) into each `$lookup` sub-pipeline with the joined collection as base, and into each `$facet` branch with the current collection as base.

**Resource governance (design §6).**

- Unconditionally APPEND `{ $limit: PIPELINE_RESULT_CAP }` as the final top-level stage of the reconstruction — never "inject if absent" (an agent-supplied `$limit: 100000` must not become the bound). Apply the same rule to every `$facet` branch.
- Enforce all task-1 caps: total stages (counting sub-pipeline/facet stages), sub-pipeline depth, `$lookup` count, `$facet` branches, expression depth, node count, array-literal length, serialized size, `$sample.size`.
- The walker must be iterative or carry an explicit depth guard: pathological nesting fails with a validation error, never a stack overflow.

**Adversarial test suite** — create `validatePipeline.test.js` covering at minimum (all from the design's Risks list):

- `$match: { $where: … }` → reject; `$match: { $expr: { $function: … } }` → reject
- Mixed operator document `{ f: { $gt: 1, $where: "…" } }` → reject; literal-position `{ f: { a: { $where: "…" } } }` → reject (fail-closed)
- `$function`/`$accumulator` buried in `$group._id`, `$bucket.output`, `$setWindowFields.output`, `$replaceRoot.newRoot` → reject
- Allowlist-bypass keys `constructor`, `__proto__`, `toString` as operators → reject; `__proto__` as a field key anywhere → reject
- `$$USER_ROLES` / `$$CLUSTER_TIME` → reject; `$$NOW` and a properly `let`-bound var → pass; the same var outside its binding scope → reject
- `$in` array over `MAX_ARRAY_LITERAL_LENGTH` → reject
- Filter-triple shapes posted to the re-query path: a `$match` built from `field: "$where"`, `field: "__proto__"`, `value: { $gt: … }` → reject (these arrive via task 3's prepend, but the walker is what must catch them)
- Pathological-depth `$expr` (e.g. 100k nested `$and`) → validation error, no stack overflow
- `$literal` wrapping operator-shaped data (`{ $literal: { $where: "x" } }`) → PASS, and the value survives reconstruction verbatim
- Nested `$lookup.pipeline` containing `$merge` → reject; `$lookup.from` not in catalog → reject; role-gated collection without the role (incl. via nested `$lookup`) → reject
- Deferred stages (`$unionWith`, `$graphLookup`, `$densify`) rejected at top level AND inside `$lookup.pipeline`/`$facet`
- Agent-supplied `$limit: 100000` → result still capped (trailing `$limit: PIPELINE_RESULT_CAP` appended); `$facet` branches each end in the cap
- A benign happy-path pipeline (the design's `$lookup` + `$unwind` + `$group` + `$sort` + `$limit` example) → passes and the output is a NEW object tree (assert no reference identity with input nodes)

## Acceptance Criteria

- `validatePipeline` is pure (no I/O, no driver imports) and returns a reconstructed tree; a mutation to the input after validation cannot affect the returned pipeline.
- Every adversarial case above has a test; the suite passes.
- Error messages name the offending operator/collection/cap so the agent can self-correct.
- Existing plugin tests still pass.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js` — create
- `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.test.js` — create

## Notes

Use a catalog fixture inline or extend `testDatasets.js` minimally — task 6 converts that fixture wholesale to the catalog shape, so don't over-invest here; a small local fixture with two collections (one role-gated) and a relationship is enough.
