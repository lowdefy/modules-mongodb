# Task 1: Add the multiselect control, match modes and options cap; raise the array-literal cap

## Context

`plugins/modules-mongodb-plugins/src/analytics/constants.js` holds both the report-spec grammar (`FILTER_CONTROLS`, `MAX_FILTER_OPTIONS`, `MAX_SECTIONS`, …) and the open query engine's resource caps (`MAX_PIPELINE_NODES`, `MAX_PIPELINE_BYTES`, `MAX_ARRAY_LITERAL_LENGTH`, …). Today:

- `MAX_IN_VALUES = 100` (line 13) exists only to feed `MAX_ARRAY_LITERAL_LENGTH = MAX_IN_VALUES` (line 71) — nothing else in the repo imports it (verified by grep).
- `MAX_FILTER_OPTIONS = 50` (line 14) caps a filter's options list.
- `FILTER_CONTROLS = ["select", "daterange"]` (line 17).

The design adds a `multiselect` control whose selection compiles into a single `$in`/`$all` operand in the server-built filter `$match`. That makes the options cap and the array-literal cap **one decision**: a 500-option dropdown over a 100-element array cap means an ordinary selection of 101 values is rejected by `validatePipeline` — and rejected _quietly_, because the re-query is a `CallAPI` followed by a `SetState` and the failed call aborts the chain before the `SetState`, leaving the bound sections showing stale rows. `MultipleSelector` has no selection-count property (`maxTagCount` caps rendered tags only), so nothing in the UI prevents it either.

The design's resolution is to raise the array-literal cap rather than shrink the options list: `MAX_ARRAY_LITERAL_LENGTH` bounds what can be _written into_ a pipeline, not what a pipeline produces (its own comment makes the point — `{ $range: [0, 500000] }` is three tokens and half a million elements), and the two budgets that actually bound pipeline text do not move: 500 ObjectId-ish strings are roughly 14 KB of the 100 000-byte `MAX_PIPELINE_BYTES`, and 500 nodes are 5% of `MAX_PIPELINE_NODES` (`copyQueryLiteral` calls `countNode` per element).

## Task

Edit `plugins/modules-mongodb-plugins/src/analytics/constants.js`:

1. **Delete** `export const MAX_IN_VALUES = 100;`. It has no consumer once the alias below is gone, and leaving it would name a limit the engine no longer enforces.
2. `FILTER_CONTROLS` becomes `["select", "multiselect", "daterange"]`.
3. Add `export const FILTER_MATCH_MODES = ["any", "all"];` beside `FILTER_CONTROLS`, with a comment: a `multiselect` filter's `match` mode, selecting between the `in` (`$in`, any of) and `all` (`$all`, all of) filter-triple ops.
4. Add `export const MAX_QUERY_FILTER_OPTIONS = 500;` beside `MAX_FILTER_OPTIONS`. Comment it: `MAX_FILTER_OPTIONS` bounds what the agent types into a _persisted_ spec (a payload-size concern); query-sourced options are resolved server-side per report open and already bounded by `PIPELINE_RESULT_CAP`, so the same number is needlessly tight.
5. `MAX_ARRAY_LITERAL_LENGTH` becomes `500` outright (no alias). Keep the existing `$range` explanation and add the invariant.
6. **Both** `MAX_QUERY_FILTER_OPTIONS` and `MAX_ARRAY_LITERAL_LENGTH` carry a comment naming the invariant that ties them together, so the next person to change either sees it:

   > `MAX_QUERY_FILTER_OPTIONS` must stay ≤ `MAX_ARRAY_LITERAL_LENGTH`: a full multi-select selection becomes ONE `$in`/`$all` operand in the server-built filter `$match`, which the validator caps at `MAX_ARRAY_LITERAL_LENGTH`. Violating this rejects an ordinary selection, and rejects it silently — the failed `CallAPI` aborts before its `SetState`, so bound sections keep stale rows.

Then extend `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.test.js`. Its existing over-length case (line ~269) builds `{ length: MAX_ARRAY_LITERAL_LENGTH + 1 }` from the constant and needs no change. **Add** one case proving a full-size list clears the _other_ budgets rather than merely the length check: a `$match` with a 500-element `$in` of realistic id strings validates successfully (no throw), which is the assertion that the raise is actually usable and not immediately swallowed by `MAX_PIPELINE_BYTES` or `MAX_PIPELINE_NODES`.

## Acceptance Criteria

- `grep -rn "MAX_IN_VALUES" plugins modules apps docs --exclude-dir=node_modules --exclude-dir=dist` returns nothing (design docs may still mention it historically — those are out of scope).
- `FILTER_CONTROLS`, `FILTER_MATCH_MODES`, `MAX_QUERY_FILTER_OPTIONS` and `MAX_ARRAY_LITERAL_LENGTH` export the values above, and the invariant comment appears on both caps.
- A 500-element `$in` passes `validatePipeline`; a 501-element one still fails with the length message.
- `CI=true pnpm test validatePipeline` passes (run from the repo root; the sandbox must be off — sandboxed runs fail unrelated Mongo suites spuriously).
- `CI=true pnpm test` — the whole analytics suite still passes. Adding `multiselect` to `FILTER_CONTROLS` changes the text of `validateReportSpec`'s "control … is not one of …" message; if any existing test asserts that string, update the expectation (do not change the message format).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — modify — delete `MAX_IN_VALUES`; add `multiselect` to `FILTER_CONTROLS`; add `FILTER_MATCH_MODES` and `MAX_QUERY_FILTER_OPTIONS`; `MAX_ARRAY_LITERAL_LENGTH = 500` with the invariant comment.
- `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.test.js` — modify — add the at-cap `$in` case.

## Notes

The raise is a real, accepted widening: it also lets the agent type a 500-element literal array anywhere the grammar allows one, not just in a filter `$match`. That is deliberate — the alternative (a higher cap scoped to the server-built `$match` by provenance) would mean the walker treating one stage's origin differently from every other, a second path through the one function that turns untrusted client input into a query. Do **not** implement a provenance-scoped cap.

Nothing else in this task changes behaviour: `validatePipeline` already handles `$in`/`$all` (array-operand type check, length cap, per-element `copyQueryLiteral`), so raising the number is the whole change on the engine side.
