import computeAutoUnblocks from "./computeAutoUnblocks.js";

function action(type, stage, { _id = `${type}-id`, key = null } = {}) {
  return { _id, type, key, status: [{ stage }] };
}

test("computeAutoUnblocks: empty when no blocked actions", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "in-review"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["qualify"] },
    ],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: single blocked action with one done dependency → one entry", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["qualify"] },
    ],
  });
  expect(result).toEqual([{ type: "send-quote", status: "action-required" }]);
});

test("computeAutoUnblocks: blocked action with one done and one in-progress dependency → no entry", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "in-progress"),
      action("schedule-followup", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote" },
      { type: "schedule-followup", blocked_by: ["qualify", "send-quote"] },
    ],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: blocked_by with action-type satisfied + group-id with no declared group → fires (group-id is not declared, so it falls through the defensive skip and the action-type alone is checked; only fires when ALL entries resolve)", () => {
  // With mixed resolution, an undeclared group-id falls into the defensive
  // skip branch (returns false from the .every()). The action stays blocked.
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["qualify", "some-group-id"] },
    ],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: keyed action with three blocked docs of the same type → one entry, deduped", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("device-install", "blocked", { _id: "d1", key: "device-1" }),
      action("device-install", "blocked", { _id: "d2", key: "device-2" }),
      action("device-install", "blocked", { _id: "d3", key: "device-3" }),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "device-install", blocked_by: ["qualify"] },
    ],
  });
  expect(result).toEqual([{ type: "device-install", status: "action-required" }]);
});

test("computeAutoUnblocks: keyed dependency type with one non-terminal doc → does not auto-unblock", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("device-install", "done", { _id: "d1", key: "device-1" }),
      action("device-install", "in-progress", { _id: "d2", key: "device-2" }),
      action("finalize", "blocked"),
    ],
    actionsConfig: [
      { type: "device-install" },
      { type: "finalize", blocked_by: ["device-install"] },
    ],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: blocked action whose blocked_by has only group-id entries with no declaredGroups → not emitted (defensive skip)", () => {
  const result = computeAutoUnblocks({
    workflowActions: [action("send-quote", "blocked")],
    actionsConfig: [
      { type: "send-quote", blocked_by: ["group-1", "group-2"] },
    ],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: group-id entry resolves to done → emit", () => {
  const result = computeAutoUnblocks({
    workflowActions: [action("send-quote", "blocked")],
    actionsConfig: [
      { type: "send-quote", blocked_by: ["phase-1"] },
    ],
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 1, not_required: 0, total: 1 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
  });
  expect(result).toEqual([{ type: "send-quote", status: "action-required" }]);
});

test("computeAutoUnblocks: group-id entry resolves to in-progress → no emit", () => {
  const result = computeAutoUnblocks({
    workflowActions: [action("send-quote", "blocked")],
    actionsConfig: [
      { type: "send-quote", blocked_by: ["phase-1"] },
    ],
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: mixed blocked_by — group-id done + action-type terminal → emit", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["phase-1", "qualify"] },
    ],
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 1, not_required: 0, total: 1 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
  });
  expect(result).toEqual([{ type: "send-quote", status: "action-required" }]);
});

test("computeAutoUnblocks: mixed blocked_by — group-id done but action-type still in-progress → no emit", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "in-progress"),
      action("send-quote", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["phase-1", "qualify"] },
    ],
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 0, not_required: 0, total: 0 },
      },
    ],
    declaredGroups: [{ id: "phase-1" }],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: mixed blocked_by — group-id in-progress + action-type terminal → no emit", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["phase-2", "qualify"] },
    ],
    groups: [
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
    declaredGroups: [{ id: "phase-2" }],
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: groups undefined → group-id entries treated as unsatisfied", () => {
  const result = computeAutoUnblocks({
    workflowActions: [action("send-quote", "blocked")],
    actionsConfig: [{ type: "send-quote", blocked_by: ["phase-1"] }],
    declaredGroups: [{ id: "phase-1" }],
    // groups intentionally omitted
  });
  expect(result).toEqual([]);
});

test("computeAutoUnblocks: declaredGroups undefined → falls back to action-type-only resolution", () => {
  const result = computeAutoUnblocks({
    workflowActions: [
      action("qualify", "done"),
      action("send-quote", "blocked"),
    ],
    actionsConfig: [
      { type: "qualify" },
      { type: "send-quote", blocked_by: ["qualify"] },
    ],
    // declaredGroups intentionally omitted
  });
  expect(result).toEqual([{ type: "send-quote", status: "action-required" }]);
});

test("computeAutoUnblocks: build-validator-bypassed unresolved entry → defensive skip, no throw", () => {
  const result = computeAutoUnblocks({
    workflowActions: [action("send-quote", "blocked")],
    actionsConfig: [
      { type: "send-quote", blocked_by: ["this-resolves-to-nothing"] },
    ],
  });
  expect(result).toEqual([]);
});
