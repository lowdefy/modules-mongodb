// `$match` QUERY-DOCUMENT grammar (open query engine — design §3b).
//
// A `$match` stage's argument is a query document, whose operators are a
// DIFFERENT grammar from aggregation expressions (expressionOperatorAllowlist.js).
// The same syntactic position flips between operator and data depending on the
// keys, and the operand shapes differ per operator (`$elemMatch` recurses as a
// nested query document; `$not` takes an operator document or a regex; `$expr`
// switches to the expression grammar). This separate allowlist is why the two
// grammars can't be conflated — the classic validator hole (design §3 vs §3b).
//
// Default-deny: only operators in ALLOWED_MATCH_OPERATORS pass.
// DENIED_MATCH_OPERATORS is enumerated only for a specific error message —
// anything unlisted is denied anyway. Membership must be tested with
// Set.prototype.has (Set instances), never `obj[key]` / `key in obj`.

export const ALLOWED_MATCH_OPERATORS = new Set([
  // comparison
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  // logical
  "$and",
  "$or",
  "$nor",
  "$not",
  // element
  "$exists",
  "$type",
  // array
  "$all",
  "$elemMatch",
  "$size",
  // evaluation
  "$mod",
  "$regex",
  "$options", // regex flags companion to `$regex`
  // `$expr` — its subtree recurses through the §3 expression allowlist
  "$expr",
]);

// Denied query operators (design §3b):
//   $where          — JS / eval
//   $text           — needs a text index; deferred
//   geo operators   — deferred alongside `$geoNear`
export const DENIED_MATCH_OPERATORS = new Set([
  "$where",
  "$text",
  "$near",
  "$nearSphere",
  "$geoWithin",
  "$geoIntersects",
]);
