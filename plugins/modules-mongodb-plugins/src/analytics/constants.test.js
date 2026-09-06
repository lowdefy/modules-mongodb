import {
  MAX_ARRAY_LITERAL_LENGTH,
  MAX_FILTER_OPTIONS,
  MAX_QUERY_FILTER_OPTIONS,
  PIPELINE_RESULT_CAP,
} from "./constants.js";

// Relationships between caps that hold by arithmetic, not by anyone remembering
// the comment next to them. Each one, if broken, fails somewhere far from the
// constant that was tuned.

test("a full multi-select selection fits in one array literal", () => {
  // A selection of every option compiles to ONE $in/$all operand in the
  // server-built filter $match, which validatePipeline caps at
  // MAX_ARRAY_LITERAL_LENGTH. Over that, an ordinary selection is rejected —
  // and rejected SILENTLY, because the failed CallAPI aborts before its
  // SetState, leaving the bound sections showing stale rows.
  expect(MAX_QUERY_FILTER_OPTIONS).toBeLessThanOrEqual(
    MAX_ARRAY_LITERAL_LENGTH,
  );
  expect(MAX_FILTER_OPTIONS).toBeLessThanOrEqual(MAX_ARRAY_LITERAL_LENGTH);
});

test("the options cap is reachable — truncation is a real state, not dead code", () => {
  // An options query's rows are bounded by PIPELINE_RESULT_CAP before
  // MAX_QUERY_FILTER_OPTIONS slices them. If the row cap were the tighter of
  // the two, the "— first N" truncation notice could never appear and the cap
  // would be decoration.
  expect(MAX_QUERY_FILTER_OPTIONS).toBeLessThan(PIPELINE_RESULT_CAP);
});
