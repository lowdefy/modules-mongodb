# Task 2: Add the `in`/`all` filter ops and drop empty-array values

## Context

`plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js` is where a report filter becomes a query. The report page's compiled `onChange` actions post `{ query, filters: [{ field, op, value }] }` to the `query-data` endpoint; this request builds one leading `$match` from those triples and prepends it to the section's pipeline, then hands the combined pipeline to `validatePipeline`:

```js
const FILTER_OPS = { eq: "$eq", gte: "$gte", lte: "$lte" }; // line 52

function buildFilterMatch(filters) {
  const clauses = [];
  for (const { field, op, value } of filters) {
    if (value === null || value === undefined) continue; // "no constraint"
    const mongoOp = FILTER_OPS[op];
    if (!mongoOp) throw new Error(`Unsupported filter operator "${op}".`);
    clauses.push({ [field]: { [mongoOp]: value } });
  }
  return clauses.length > 0 ? { $match: { $and: clauses } } : null;
}
```

The design adds two ops for the new `multiselect` control: `in → $in` (match documents carrying **any** of the chosen values) and `all → $all` (**all** of them). Both are already in `ALLOWED_MATCH_OPERATORS`, and `$in` needs no array special case — multikey matching means `{ tags: { $in: [a, b] } }` matches a document whose `tags` **array contains** either value by the same rule that makes it match a scalar `tags` equal to either. `$expr` + `$setIntersection` was rejected: it forfeits the index the leading `$match` position was bought for, errors when the field is missing/null/scalar, and would make this function emit expression trees whose shape depends on the op.

It also adds one genuinely new check. `$in: []` matches **nothing**, so without a drop, clearing a multi-select would blank every bound section instead of widening back to everything — the opposite of what removing a filter means. This is the ordinary cleared state, not a corner case: `MultipleSelector`'s `onChange` always calls `setValue` with an array, so removing the last tag sets `[]`, never null, and the existing null branch never sees it.

## Task

Edit `AnalyticsPipeline.js`:

1. `FILTER_OPS` becomes `{ eq: "$eq", gte: "$gte", lte: "$lte", in: "$in", all: "$all" }`. Keep it a fixed, default-deny map — an unmapped op still throws. Add a short comment noting the op vocabulary is named after the Mongo operators it maps to, which is why the spec's `match: any` compiles to `op: in`: `match` is the author's intent, `op` is the query it becomes. Triples are server-built and never appear in a persisted spec.
2. In `buildFilterMatch`, extend the "no constraint" drop to an **empty array**, applied to _any_ op rather than only `in`/`all`:

   ```js
   if (value === null || value === undefined) continue;
   if (Array.isArray(value) && value.length === 0) continue;
   ```

   Comment why it is uniform: no control can produce an empty array for `eq` or a range bound, so the uniform rule loses no expressible query and is one line instead of a per-op branch.

Add **no** type or length check on the array value. That would be redundant: the built `$match` goes through `validatePipeline` like every other stage, and `walkOperatorDocument` already rejects a non-array operand for `$in`/`$all` with an actionable message, caps the array at `MAX_ARRAY_LITERAL_LENGTH`, and passes every element through `copyQueryLiteral` (which rejects `$`-prefixed keys inside literal match values and rebuilds regexes). A second cap here could only fire on a hand-crafted payload, where the validator's message is already the right answer.

Add tests for the request's filter handling — one case per new op (an `in` triple and an `all` triple each produce the expected leading `$match` clause) plus the empty-array drop (an `in` triple with `[]` contributes no clause, and a filters array of only empty values yields no `$match` at all, leaving the section's pipeline unchanged). Follow whatever pattern the existing `AnalyticsPipeline` coverage uses; if the request has no unit test file yet, assert through the pipeline the connection hands to `validatePipeline`.

## Acceptance Criteria

- An `{ field: "company_ids", op: "in", value: ["C-1", "C-2"] }` triple builds `{ $match: { $and: [{ company_ids: { $in: ["C-1", "C-2"] } }] } }`; the same with `op: "all"` builds `$all`.
- `value: []` contributes no clause for any op; a filters array whose every value is `[]`/null yields `null` (no `$match` prepended).
- An unknown op still throws `Unsupported filter operator "…"`.
- No new length or type validation was added to `buildFilterMatch`.
- `CI=true pnpm test AnalyticsPipeline` passes, and `CI=true pnpm test` shows no regressions (run from the repo root with the sandbox off).

## Files

- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js` — modify — `FILTER_OPS` gains `in`/`all`; `buildFilterMatch` drops empty arrays.
- The `AnalyticsPipeline` test file — create or modify — a case per new op plus the empty-array drop.

## Notes

This task is independent of the compiler work: it makes the live re-query path accept the triples task 6 will emit. Doing it first means task 6's output is runnable the moment it lands.
