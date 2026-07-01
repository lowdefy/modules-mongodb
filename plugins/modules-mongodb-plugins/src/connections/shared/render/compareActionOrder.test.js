import { makeWorkflowOrderComparator } from "./compareActionOrder.js";

// ---------------------------------------------------------------------------
// The comparator reads denormalised declaration indices off each action doc:
//   group_index — position of the action's group in cfg.action_groups[]
//   decl_index  — position of the action in cfg.actions[]
// Fixtures stamp these directly (no workflows config). The reference shape:
//   groups:  g1 (group_index 0), g2 (group_index 1)
//   actions: a1 (decl 0, g1), a2 (decl 1, g1), b1 (decl 2, g2), b2 (decl 3, g2)
// ---------------------------------------------------------------------------

// Build an action doc with sensible defaults; status defaults to the array shape.
function doc({
  _id,
  group_index,
  decl_index,
  stage = "action-required",
  key = null,
}) {
  return {
    _id,
    group_index,
    decl_index,
    key,
    status: [{ stage }],
  };
}

function order(cmp, docs) {
  return [...docs].sort(cmp).map((d) => d._id);
}

// ---------------------------------------------------------------------------

test("orders by declaration index within a group", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    doc({ _id: "x2", group_index: 0, decl_index: 1 }),
    doc({ _id: "x1", group_index: 0, decl_index: 0 }),
  ];
  expect(order(cmp, docs)).toEqual(["x1", "x2"]);
});

test("orders by group declaration index across groups", () => {
  const cmp = makeWorkflowOrderComparator();
  // Declared later but in an earlier group must come first.
  const docs = [
    doc({ _id: "g2-action", group_index: 1, decl_index: 2 }),
    doc({ _id: "g1-action", group_index: 0, decl_index: 1 }),
  ];
  expect(order(cmp, docs)).toEqual(["g1-action", "g2-action"]);
});

test("groups stay contiguous regardless of action declaration order", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    doc({ _id: "b2", group_index: 1, decl_index: 3 }),
    doc({ _id: "a1", group_index: 0, decl_index: 0 }),
    doc({ _id: "b1", group_index: 1, decl_index: 2 }),
    doc({ _id: "a2", group_index: 0, decl_index: 1 }),
  ];
  expect(order(cmp, docs)).toEqual(["a1", "a2", "b1", "b2"]);
});

test("not-required sinks to the bottom of its own group, not the whole list", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    doc({ _id: "a1", group_index: 0, decl_index: 0, stage: "not-required" }),
    doc({ _id: "a2", group_index: 0, decl_index: 1, stage: "action-required" }),
    doc({ _id: "b1", group_index: 1, decl_index: 2, stage: "action-required" }),
  ];
  // a1 sinks below a2 (within g1) but still sorts ahead of g2's b1.
  expect(order(cmp, docs)).toEqual(["a2", "a1", "b1"]);
});

test("tolerates the scalar status shape (timeline) as well as the array shape", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    {
      _id: "a1",
      group_index: 0,
      decl_index: 0,
      key: null,
      status: "not-required",
    },
    {
      _id: "a2",
      group_index: 0,
      decl_index: 1,
      key: null,
      status: "action-required",
    },
  ];
  expect(order(cmp, docs)).toEqual(["a2", "a1"]);
});

test("ungrouped actions (missing group_index) sort after all declared groups", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    doc({ _id: "ungrouped", group_index: -1, decl_index: -1 }),
    doc({ _id: "g2-action", group_index: 1, decl_index: 2 }),
    doc({ _id: "g1-action", group_index: 0, decl_index: 0 }),
  ];
  expect(order(cmp, docs)).toEqual(["g1-action", "g2-action", "ungrouped"]);
});

test("keyed siblings (same indices) order by key, then _id", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    doc({ _id: "z", group_index: 0, decl_index: 0, key: "beta" }),
    doc({ _id: "y", group_index: 0, decl_index: 0, key: "alpha" }),
  ];
  expect(order(cmp, docs)).toEqual(["y", "z"]);
});

test("two unkeyed docs sharing indices fall back to _id", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    doc({ _id: "id-2", group_index: 0, decl_index: 0 }),
    doc({ _id: "id-1", group_index: 0, decl_index: 0 }),
  ];
  expect(order(cmp, docs)).toEqual(["id-1", "id-2"]);
});

test("missing decl_index sorts last within its group, deterministically", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    // group resolves (0) but the action's decl_index is missing → sinks last.
    doc({ _id: "gone", group_index: 0, decl_index: -1 }),
    doc({ _id: "a1", group_index: 0, decl_index: 0 }),
  ];
  expect(order(cmp, docs)).toEqual(["a1", "gone"]);
});

test("actions with missing/null indices sort last by _id", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    {
      _id: "ncard-2",
      group_index: null,
      decl_index: null,
      key: null,
      status: null,
    },
    doc({ _id: "wf-action", group_index: 0, decl_index: 0 }),
    // No index fields at all (written before the field existed).
    { _id: "ncard-1", key: null, status: null },
  ];
  expect(order(cmp, docs)).toEqual(["wf-action", "ncard-1", "ncard-2"]);
});

test("docs from different workflows order purely by their stamped indices", () => {
  const cmp = makeWorkflowOrderComparator();
  // Each doc carries its own indices; ordering is well-defined regardless of
  // which workflow stamped them.
  const docs = [
    doc({ _id: "other-c1", group_index: 0, decl_index: 0 }),
    doc({ _id: "onb-a1", group_index: 0, decl_index: 0 }),
  ];
  // both at groupIndex 0, declIndex 0 → tie broken by key ('') then _id.
  expect(order(cmp, docs)).toEqual(["onb-a1", "other-c1"]);
});

test("docs with no stamped indices sort everything by _id", () => {
  const cmp = makeWorkflowOrderComparator();
  const docs = [
    { _id: "b", key: null, status: [{ stage: "action-required" }] },
    { _id: "a", key: null, status: [{ stage: "action-required" }] },
  ];
  expect(order(cmp, docs)).toEqual(["a", "b"]);
});
