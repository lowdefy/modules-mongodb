import recomputeGroups from "./recomputeGroups.js";

function a(stage, action_group) {
  return { status: [{ stage }], action_group };
}

test("recomputeGroups: empty declaredGroups → empty output", () => {
  expect(recomputeGroups({ declaredGroups: [], actions: [] })).toEqual([]);
});

test("recomputeGroups: three declared groups, all empty → three done/{0,0,0} entries in declaration order", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "a" }, { id: "b" }, { id: "c" }],
    actions: [],
  });
  expect(result).toEqual([
    { id: "a", status: "done", summary: { done: 0, not_required: 0, total: 0 } },
    { id: "b", status: "done", summary: { done: 0, not_required: 0, total: 0 } },
    { id: "c", status: "done", summary: { done: 0, not_required: 0, total: 0 } },
  ]);
});

test("recomputeGroups: 2 done + 1 not-required → done / {done:2, not_required:1, total:3}", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [
      a("done", "phase-1"),
      a("done", "phase-1"),
      a("not-required", "phase-1"),
    ],
  });
  expect(result).toEqual([
    {
      id: "phase-1",
      status: "done",
      summary: { done: 2, not_required: 1, total: 3 },
    },
  ]);
});

test("recomputeGroups: 1 blocked + 1 done → blocked / {done:1, not_required:0, total:2}", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [a("blocked", "phase-1"), a("done", "phase-1")],
  });
  expect(result).toEqual([
    {
      id: "phase-1",
      status: "blocked",
      summary: { done: 1, not_required: 0, total: 2 },
    },
  ]);
});

test("recomputeGroups: 1 action-required + 1 blocked → in-progress / {0,0,2}", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [a("action-required", "phase-1"), a("blocked", "phase-1")],
  });
  expect(result).toEqual([
    {
      id: "phase-1",
      status: "in-progress",
      summary: { done: 0, not_required: 0, total: 2 },
    },
  ]);
});

test("recomputeGroups: three groups + one action each, declaration order preserved", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "a" }, { id: "b" }, { id: "c" }],
    actions: [
      a("done", "a"),
      a("blocked", "b"),
      a("action-required", "c"),
    ],
  });
  expect(result).toEqual([
    { id: "a", status: "done", summary: { done: 1, not_required: 0, total: 1 } },
    {
      id: "b",
      status: "blocked",
      summary: { done: 0, not_required: 0, total: 1 },
    },
    {
      id: "c",
      status: "in-progress",
      summary: { done: 0, not_required: 0, total: 1 },
    },
  ]);
});

test("recomputeGroups: action with unknown action_group is silently excluded", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [a("done", "phase-1"), a("done", "unknown-group")],
  });
  expect(result).toEqual([
    {
      id: "phase-1",
      status: "done",
      summary: { done: 1, not_required: 0, total: 1 },
    },
  ]);
});
