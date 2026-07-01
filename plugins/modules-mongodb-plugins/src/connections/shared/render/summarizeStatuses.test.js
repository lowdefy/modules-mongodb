import summarizeStatuses from "./summarizeStatuses.js";

function a(stage) {
  return { status: [{ stage }] };
}

const ZERO = {
  done: 0,
  "in-review": 0,
  "changes-required": 0,
  error: 0,
  "in-progress": 0,
  "action-required": 0,
  blocked: 0,
  "not-required": 0,
};

test("empty input → all-zero counts, total 0", () => {
  expect(summarizeStatuses([])).toEqual({ counts: { ...ZERO }, total: 0 });
});

test("null/undefined input → all-zero counts, total 0", () => {
  expect(summarizeStatuses(undefined)).toEqual({ counts: { ...ZERO }, total: 0 });
});

test("counts across all eight stages", () => {
  const actions = [
    a("done"),
    a("done"),
    a("in-review"),
    a("changes-required"),
    a("error"),
    a("in-progress"),
    a("action-required"),
    a("blocked"),
    a("not-required"),
  ];
  expect(summarizeStatuses(actions)).toEqual({
    counts: {
      ...ZERO,
      done: 2,
      "in-review": 1,
      "changes-required": 1,
      error: 1,
      "in-progress": 1,
      "action-required": 1,
      blocked: 1,
      "not-required": 1,
    },
    total: 9,
  });
});

test("actions with a missing/unknown stage count toward total but no bucket", () => {
  const actions = [
    a("done"),
    { status: [] }, // no stage
    { status: [{ stage: "gibberish" }] }, // unknown stage
    {}, // no status at all
  ];
  const result = summarizeStatuses(actions);
  expect(result.counts.done).toBe(1);
  expect(result.total).toBe(4);
  // No stray keys leaked from the unknown stage.
  expect(Object.keys(result.counts).sort()).toEqual(
    [
      "action-required",
      "blocked",
      "changes-required",
      "done",
      "error",
      "in-progress",
      "in-review",
      "not-required",
    ].sort(),
  );
});
