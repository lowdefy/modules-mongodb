import recomputeGroups from "./recomputeGroups.js";

function a(stage, action_group) {
  return { status: [{ stage }], action_group };
}

test("recomputeGroups: empty declaredGroups → empty output", () => {
  expect(recomputeGroups({ declaredGroups: [], actions: [] })).toEqual([]);
});

test("recomputeGroups: three declared groups, all empty → three done entries in declaration order", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "a" }, { id: "b" }, { id: "c" }],
    actions: [],
  });
  expect(result).toEqual([
    { id: "a", status: "done" },
    { id: "b", status: "done" },
    { id: "c", status: "done" },
  ]);
});

test("recomputeGroups: 2 done + 1 not-required → done", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [
      a("done", "phase-1"),
      a("done", "phase-1"),
      a("not-required", "phase-1"),
    ],
  });
  expect(result).toEqual([{ id: "phase-1", status: "done" }]);
});

test("recomputeGroups: 1 blocked + 1 done → blocked", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [a("blocked", "phase-1"), a("done", "phase-1")],
  });
  expect(result).toEqual([{ id: "phase-1", status: "blocked" }]);
});

test("recomputeGroups: 1 action-required + 1 blocked → in-progress", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [a("action-required", "phase-1"), a("blocked", "phase-1")],
  });
  expect(result).toEqual([{ id: "phase-1", status: "in-progress" }]);
});

test("recomputeGroups: three groups + one action each, declaration order preserved", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "a" }, { id: "b" }, { id: "c" }],
    actions: [a("done", "a"), a("blocked", "b"), a("action-required", "c")],
  });
  expect(result).toEqual([
    { id: "a", status: "done" },
    { id: "b", status: "blocked" },
    { id: "c", status: "in-progress" },
  ]);
});

test("recomputeGroups: action with unknown action_group is silently excluded", () => {
  const result = recomputeGroups({
    declaredGroups: [{ id: "phase-1" }],
    actions: [a("done", "phase-1"), a("done", "unknown-group")],
  });
  expect(result).toEqual([{ id: "phase-1", status: "done" }]);
});
