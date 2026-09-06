// Aggregation-EXPRESSION grammar (open query engine — design §3).
//
// This is the operator allowlist the generic recursive walker applies at every
// expression-bearing position — `$group` accumulators, `let` bindings, `$map`
// bodies, `$switch` branches, `$project` computed fields, `$setWindowFields`
// output, and everywhere else. There is no "unwalked" position: any object key
// beginning with `$` that is not a stage and not a query-document operator is an
// expression operator and must be on this allowlist for its context.
//
// This grammar is DISTINCT from the `$match` query-document grammar
// (matchOperatorAllowlist.js): the operators that appear inside a `$match`
// argument are a different set with different operand shapes. Keeping the two
// apart is deliberate (design §3 vs §3b) — the classic validator trap is
// running a query document through the expression allowlist (or vice versa).
//
// Default-deny: only operators in ALLOWED_EXPRESSION_OPERATORS pass.
// DENIED_EXPRESSION_OPERATORS is enumerated only for a specific error message —
// anything unlisted is denied anyway. Membership must be tested with
// Set.prototype.has (Set instances), never `obj[key]` / `key in obj`.

export const ALLOWED_EXPRESSION_OPERATORS = new Set([
  // arithmetic
  "$abs",
  "$add",
  "$ceil",
  "$divide",
  "$exp",
  "$floor",
  "$ln",
  "$log",
  "$log10",
  "$mod",
  "$multiply",
  "$pow",
  "$round",
  "$sqrt",
  "$subtract",
  "$trunc",
  // comparison
  "$cmp",
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  // boolean
  "$and",
  "$or",
  "$not",
  // conditional
  "$cond",
  "$ifNull",
  "$switch",
  // variable binding — its `vars` names join the lexical `$$`-scope for its
  // `in` expression only (design §3); the walker threads that scope.
  "$let",
  // array
  "$allElementsTrue",
  "$anyElementTrue",
  "$arrayElemAt",
  "$arrayToObject",
  "$concatArrays",
  "$filter",
  "$firstN",
  "$in",
  "$indexOfArray",
  "$isArray",
  "$lastN",
  "$map",
  "$maxN",
  "$minN",
  "$range",
  "$reduce",
  "$reverseArray",
  "$size",
  "$slice",
  "$sortArray",
  "$zip",
  // set (array) expressions
  "$setDifference",
  "$setEquals",
  "$setIntersection",
  "$setIsSubset",
  "$setUnion",
  // string
  "$concat",
  "$indexOfBytes",
  "$indexOfCP",
  "$ltrim",
  "$regexFind",
  "$regexFindAll",
  "$regexMatch",
  "$replaceAll",
  "$replaceOne",
  "$rtrim",
  "$split",
  "$strLenBytes",
  "$strLenCP",
  "$strcasecmp",
  "$substr",
  "$substrBytes",
  "$substrCP",
  "$toLower",
  "$toUpper",
  "$trim",
  // date
  "$dateAdd",
  "$dateDiff",
  "$dateFromParts",
  "$dateFromString",
  "$dateSubtract",
  "$dateToParts",
  "$dateToString",
  "$dateTrunc",
  "$dayOfMonth",
  "$dayOfWeek",
  "$dayOfYear",
  "$hour",
  "$isoDayOfWeek",
  "$isoWeek",
  "$isoWeekYear",
  "$millisecond",
  "$minute",
  "$month",
  "$second",
  "$week",
  "$year",
  "$tsIncrement",
  "$tsSecond",
  // type conversion
  "$convert",
  "$isNumber",
  "$toBool",
  "$toDate",
  "$toDecimal",
  "$toDouble",
  "$toInt",
  "$toLong",
  "$toObjectId",
  "$toString",
  "$type",
  // object
  "$getField",
  "$mergeObjects",
  "$objectToArray",
  "$setField",
  // literal — the walker does not recurse into its argument (opaque data), but
  // the argument still counts toward the size / node / array caps (design §3).
  "$literal",
  // accumulators (`$group`, and where accumulators are also expressions)
  "$addToSet",
  "$avg",
  "$bottom",
  "$bottomN",
  "$count",
  "$first",
  "$last",
  "$max",
  "$median",
  "$min",
  "$percentile",
  "$push",
  "$stdDevPop",
  "$stdDevSamp",
  "$sum",
  "$top",
  "$topN",
  // window operators (for `$setWindowFields.output`)
  "$covariancePop",
  "$covarianceSamp",
  "$denseRank",
  "$derivative",
  "$documentNumber",
  "$expMovingAvg",
  "$integral",
  "$linearFill",
  "$locf",
  "$rank",
  "$shift",
]);

// JS / eval operators denied anywhere in any expression tree (not only under
// `$expr`). Default-deny already excludes them; listed for a clear message.
export const DENIED_EXPRESSION_OPERATORS = new Set([
  "$function",
  "$accumulator",
  "$where",
]);

// System variable names (the token after `$$`) that need no lexical binding.
// Everything else — notably USER_ROLES, CLUSTER_TIME, SEARCH_META — is rejected
// unless bound by an enclosing `let` / `$lookup.let` / `$map` / `$filter` /
// `$reduce` (design §3). Stored WITHOUT the `$$` prefix; the walker strips it
// before the lookup.
export const ALLOWED_SYSTEM_VARIABLES = new Set([
  "NOW",
  "ROOT",
  "CURRENT",
  "REMOVE",
  "DESCEND",
  "PRUNE",
  "KEEP",
]);
