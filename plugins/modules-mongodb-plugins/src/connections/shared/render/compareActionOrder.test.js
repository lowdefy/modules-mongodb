import { makeWorkflowOrderComparator } from "./compareActionOrder.js";

// ---------------------------------------------------------------------------
// Fixture: a single workflow config with two groups and ordered actions.
//   groups:  [g1, g2]
//   actions: [a1 (g1), a2 (g1), b1 (g2), b2 (g2)]
// ---------------------------------------------------------------------------

const workflowsConfig = [
  {
    type: "onboarding",
    action_groups: [{ id: "g1" }, { id: "g2" }],
    actions: [{ type: "a1" }, { type: "a2" }, { type: "b1" }, { type: "b2" }],
  },
];

// Build an action doc with sensible defaults; status defaults to the array shape.
function doc({
  _id,
  type,
  action_group,
  stage = "action-required",
  key = null,
  workflow_type = "onboarding",
}) {
  return {
    _id,
    type,
    action_group,
    workflow_type,
    key,
    status: [{ stage }],
  };
}

function order(cmp, docs) {
  return [...docs].sort(cmp).map((d) => d._id);
}

// ---------------------------------------------------------------------------

test("orders by declaration index within a group", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "x2", type: "a2", action_group: "g1" }),
    doc({ _id: "x1", type: "a1", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["x1", "x2"]);
});

test("orders by group declaration index across groups", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  // Declared later but in an earlier group must come first.
  const docs = [
    doc({ _id: "g2-action", type: "b1", action_group: "g2" }),
    doc({ _id: "g1-action", type: "a2", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["g1-action", "g2-action"]);
});

test("groups stay contiguous regardless of action declaration order", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "b2", type: "b2", action_group: "g2" }),
    doc({ _id: "a1", type: "a1", action_group: "g1" }),
    doc({ _id: "b1", type: "b1", action_group: "g2" }),
    doc({ _id: "a2", type: "a2", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["a1", "a2", "b1", "b2"]);
});

test("not-required sinks to the bottom of its own group, not the whole list", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "a1", type: "a1", action_group: "g1", stage: "not-required" }),
    doc({
      _id: "a2",
      type: "a2",
      action_group: "g1",
      stage: "action-required",
    }),
    doc({
      _id: "b1",
      type: "b1",
      action_group: "g2",
      stage: "action-required",
    }),
  ];
  // a1 sinks below a2 (within g1) but still sorts ahead of g2's b1.
  expect(order(cmp, docs)).toEqual(["a2", "a1", "b1"]);
});

test("tolerates the scalar status shape (timeline) as well as the array shape", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    {
      _id: "a1",
      type: "a1",
      action_group: "g1",
      workflow_type: "onboarding",
      key: null,
      status: "not-required",
    },
    {
      _id: "a2",
      type: "a2",
      action_group: "g1",
      workflow_type: "onboarding",
      key: null,
      status: "action-required",
    },
  ];
  expect(order(cmp, docs)).toEqual(["a2", "a1"]);
});

test("ungrouped actions (action_group null) sort after all declared groups", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "ungrouped", type: "a1", action_group: null }),
    doc({ _id: "g2-action", type: "b1", action_group: "g2" }),
    doc({ _id: "g1-action", type: "a1", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["g1-action", "g2-action", "ungrouped"]);
});

test("keyed siblings (same type/group) order by key, then _id", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "z", type: "a1", action_group: "g1", key: "beta" }),
    doc({ _id: "y", type: "a1", action_group: "g1", key: "alpha" }),
  ];
  expect(order(cmp, docs)).toEqual(["y", "z"]);
});

test("two unkeyed docs sharing type/group fall back to _id", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "id-2", type: "a1", action_group: "g1" }),
    doc({ _id: "id-1", type: "a1", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["id-1", "id-2"]);
});

test("removed/unknown action type sorts last, deterministically", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    doc({ _id: "gone", type: "retired-type", action_group: "g1" }),
    doc({ _id: "a1", type: "a1", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["a1", "gone"]);
});

test("actions with no resolvable config (no workflow_type) sort last by _id", () => {
  const cmp = makeWorkflowOrderComparator(workflowsConfig);
  const docs = [
    {
      _id: "ncard-2",
      type: null,
      action_group: null,
      workflow_type: null,
      key: null,
      status: null,
    },
    doc({ _id: "wf-action", type: "a1", action_group: "g1" }),
    {
      _id: "ncard-1",
      type: null,
      action_group: null,
      workflow_type: null,
      key: null,
      status: null,
    },
  ];
  expect(order(cmp, docs)).toEqual(["wf-action", "ncard-1", "ncard-2"]);
});

test("resolves config per action across multiple workflows", () => {
  const multi = [
    ...workflowsConfig,
    {
      type: "other",
      action_groups: [{ id: "h1" }],
      actions: [{ type: "c1" }],
    },
  ];
  const cmp = makeWorkflowOrderComparator(multi);
  // Each action resolves its own config; ordering is well-defined within each.
  const docs = [
    doc({
      _id: "other-c1",
      type: "c1",
      action_group: "h1",
      workflow_type: "other",
    }),
    doc({ _id: "onb-a1", type: "a1", action_group: "g1" }),
  ];
  // both resolve to groupIndex 0, declIndex 0 → tie broken by key ('') then _id.
  expect(order(cmp, docs)).toEqual(["onb-a1", "other-c1"]);
});

test("empty / missing config sorts everything by _id", () => {
  const cmp = makeWorkflowOrderComparator([]);
  const docs = [
    doc({ _id: "b", type: "a2", action_group: "g1" }),
    doc({ _id: "a", type: "a1", action_group: "g1" }),
  ];
  expect(order(cmp, docs)).toEqual(["a", "b"]);
});
