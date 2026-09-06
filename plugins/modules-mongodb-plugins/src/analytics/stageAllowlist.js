// Pipeline STAGE grammar (open query engine — design §2).
//
// The engine validates AI-authored aggregation pipelines against three
// distinct grammars, each with its own default-deny allowlist:
//   1. stages          — this file (the keys of each pipeline element)
//   2. expression ops   — expressionOperatorAllowlist.js
//   3. query-doc ops    — matchOperatorAllowlist.js (what `$match` takes)
// The three are kept separate because the same `$`-token can be legal in one
// grammar and forbidden in another (e.g. `$eq` is both an expression operator
// and a query operator, but `$regex` is only a query operator), and conflating
// them is the classic validator hole.
//
// Default-deny: only stages listed in ALLOWED_STAGES or COLLECTION_SCOPED_STAGES
// pass. DENIED_STAGES and DEFERRED_STAGES are enumerated ONLY so the walker can
// emit a specific error message — anything unlisted is denied anyway, so a
// MongoDB upgrade cannot silently widen the surface.
//
// Membership must be tested with Set.prototype.has (these are Set instances),
// never `obj[key]` / `key in obj`, so inherited keys like `constructor` /
// `toString` / `__proto__` are not silently admitted.

// Read/transform stages with no collection or synthesis concerns.
export const ALLOWED_STAGES = new Set([
  "$match",
  "$project",
  "$addFields",
  "$set",
  "$unset",
  "$group",
  "$sort",
  "$limit",
  "$skip",
  "$count",
  "$unwind",
  "$facet",
  "$bucket",
  "$bucketAuto",
  "$sortByCount",
  "$replaceRoot",
  "$replaceWith",
  "$redact",
  "$sample",
  "$fill",
  "$setWindowFields",
]);

// Allowed only with collection scoping: `$lookup.from` must be present and
// catalog-declared, and its sub-`pipeline` recurses through full validation.
// The `from`-less form (which only pairs with the denied `$documents`) is
// rejected by the walker.
export const COLLECTION_SCOPED_STAGES = new Set(["$lookup"]);

// Explicitly denied, grouped by reason (for actionable error messages):
//   writes            — mutate the database
//   JS/eval           — run server-side JavaScript
//   introspection/    — expose cluster/session/index/stream internals or
//   stream              synthesize documents from outside a collection
export const DENIED_STAGES = new Set([
  // writes
  "$out",
  "$merge",
  // JS / eval
  "$function",
  "$accumulator",
  "$where",
  // introspection / stream
  "$collStats",
  "$indexStats",
  "$currentOp",
  "$listLocalSessions",
  "$listSessions",
  "$planCacheStats",
  "$listSampledQueries",
  "$shardedDataDistribution",
  "$changeStream",
  "$documents",
]);

// Deferred / opt-in: rejected today with a "not enabled" message, addable per
// deployment when a concrete need appears. `$densify` is DEFERRED, not allowed:
// it is the only allowed-class stage that synthesizes documents to fill a range
// and would need its own span×step memory cap, so it was deliberately moved here
// (design §2/§6).
export const DEFERRED_STAGES = new Set([
  "$unionWith",
  "$graphLookup",
  "$geoNear",
  "$search",
  "$vectorSearch",
  "$searchMeta",
  "$densify",
]);
