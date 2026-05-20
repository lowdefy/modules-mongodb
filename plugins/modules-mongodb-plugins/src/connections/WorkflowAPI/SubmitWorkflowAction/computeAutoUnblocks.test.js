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

test("computeAutoUnblocks: blocked_by with both action-type and group-id-shaped entry — group-id filtered, fires when action-type is satisfied", () => {
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
  expect(result).toEqual([{ type: "send-quote", status: "action-required" }]);
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

test("computeAutoUnblocks: blocked action whose blocked_by has only group-id entries (no action types) → not emitted in v1", () => {
  const result = computeAutoUnblocks({
    workflowActions: [action("send-quote", "blocked")],
    actionsConfig: [
      { type: "send-quote", blocked_by: ["group-1", "group-2"] },
    ],
  });
  expect(result).toEqual([]);
});
