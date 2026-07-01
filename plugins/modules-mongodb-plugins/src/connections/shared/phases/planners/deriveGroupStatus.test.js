import deriveGroupStatus from "./deriveGroupStatus.js";

function a(stage) {
  return { status: [{ stage }] };
}

const cases = [
  { name: "empty → done", input: [], expected: "done" },
  { name: "[done] → done", input: [a("done")], expected: "done" },
  {
    name: "[done, not-required] → done",
    input: [a("done"), a("not-required")],
    expected: "done",
  },
  { name: "[blocked] → blocked", input: [a("blocked")], expected: "blocked" },
  {
    name: "[blocked, blocked] → blocked",
    input: [a("blocked"), a("blocked")],
    expected: "blocked",
  },
  {
    name: "[blocked, done] → blocked (the one non-terminal is blocked)",
    input: [a("blocked"), a("done")],
    expected: "blocked",
  },
  {
    name: "[blocked, action-required] → in-progress",
    input: [a("blocked"), a("action-required")],
    expected: "in-progress",
  },
  {
    name: "[action-required] → in-progress",
    input: [a("action-required")],
    expected: "in-progress",
  },
  {
    name: "[in-progress] → in-progress",
    input: [a("in-progress")],
    expected: "in-progress",
  },
  {
    name: "[in-review] → in-progress",
    input: [a("in-review")],
    expected: "in-progress",
  },
  {
    name: "[changes-required] → in-progress",
    input: [a("changes-required")],
    expected: "in-progress",
  },
  {
    name: "[error] → in-progress (error is non-terminal)",
    input: [a("error")],
    expected: "in-progress",
  },
  {
    name: "[done, action-required] → in-progress",
    input: [a("done"), a("action-required")],
    expected: "in-progress",
  },
];

for (const { name, input, expected } of cases) {
  test(`deriveGroupStatus: ${name}`, () => {
    expect(deriveGroupStatus(input)).toBe(expected);
  });
}
