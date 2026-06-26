import planAutoUnblock from "./planAutoUnblock.js";

const now = { timestamp: new Date("2026-05-20T00:00:00Z"), user: { id: "u1" } };
const event_id = "e1";
const entry_id = "workflows";

const loadedWorkflow = {
  _id: "wf-1",
  workflow_type: "onboarding",
  entity_id: "ent-1",
  entity_collection: "companies",
};

function action(
  type,
  stage,
  { _id = `${type}-id`, key = null, action_group = null } = {},
) {
  return {
    _id,
    workflow_id: "wf-1",
    type,
    kind: "form",
    key,
    action_group,
    status: [
      {
        stage,
        event_id: "e0",
        created: { timestamp: new Date("2026-05-19T00:00:00Z") },
      },
    ],
  };
}

function config(type, { blocked_by, action_group = null } = {}) {
  return {
    type,
    kind: "form",
    action_group,
    access: { demo: { view: true, edit: true } },
    ...(blocked_by ? { blocked_by } : {}),
  };
}

function run({ actions, actionsConfig, declaredGroups = [] }) {
  return planAutoUnblock({
    actions,
    actionsConfig,
    declaredGroups,
    loadedWorkflow,
    entry_id,
    event_id,
    now,
  });
}

test("empty case: no blocked actions fires nothing", () => {
  expect(
    run({
      actions: [action("a", "done"), action("b", "in-progress")],
      actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
    }),
  ).toEqual([]);
});

test("linear: a terminal type-dep unblocks the dependent with a fully composed transition", () => {
  const fired = run({
    actions: [action("a", "done"), action("b", "blocked")],
    actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
  });
  expect(fired).toHaveLength(1);
  const [entry] = fired;
  expect(entry.operation).toBe("update");
  expect(entry.doc._id).toBe("b-id");
  // Full transition via planActionTransition: status entry, links, change-log delta.
  expect(entry.doc.status[0]).toEqual({
    stage: "action-required",
    event_id,
    created: now,
  });
  expect(entry.doc.demo.links.edit).toEqual({
    pageId: "workflows/onboarding-b-edit",
    urlQuery: { action_id: "b-id" },
  });
  expect(entry.changeLog.before.status[0].stage).toBe("blocked");
  expect(entry.changeLog.after).toBe(entry.doc);
});

test("unsatisfied dep fires nothing", () => {
  expect(
    run({
      actions: [action("a", "in-progress"), action("b", "blocked")],
      actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
    }),
  ).toEqual([]);
});

test("keyed-type rule: a type is terminal only when every keyed instance is", () => {
  const partial = run({
    actions: [
      action("a", "done", { _id: "a-1", key: "k1" }),
      action("a", "in-progress", { _id: "a-2", key: "k2" }),
      action("b", "blocked"),
    ],
    actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
  });
  expect(partial).toEqual([]);

  const all = run({
    actions: [
      action("a", "done", { _id: "a-1", key: "k1" }),
      action("a", "not-required", { _id: "a-2", key: "k2" }),
      action("b", "blocked"),
    ],
    actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
  });
  expect(all.map((e) => e.doc._id)).toEqual(["b-id"]);
});

test("group-gated unblock: planned group completion unblocks a blocked_by: [group-id] action", () => {
  // The last member of phase-1 is already `done` in the planned view (it was
  // completed in this same submit) — the recompute must read that planned
  // status, not any persisted one.
  const fired = run({
    actions: [
      action("a", "done", { action_group: "phase-1" }),
      action("b", "done", { action_group: "phase-1" }),
      action("c", "blocked"),
    ],
    actionsConfig: [
      config("a", { action_group: "phase-1" }),
      config("b", { action_group: "phase-1" }),
      config("c", { blocked_by: ["phase-1"] }),
    ],
    declaredGroups: [{ id: "phase-1" }],
  });
  expect(fired.map((e) => e.doc._id)).toEqual(["c-id"]);
  expect(fired[0].doc.status[0].stage).toBe("action-required");
});

test("mixed deps: all blocked_by entries (type AND group) must be satisfied", () => {
  const fired = run({
    actions: [
      action("a", "done", { action_group: "phase-1" }),
      action("b", "in-progress"),
      action("c", "blocked"),
    ],
    actionsConfig: [
      config("a", { action_group: "phase-1" }),
      config("b"),
      config("c", { blocked_by: ["phase-1", "b"] }),
    ],
    declaredGroups: [{ id: "phase-1" }],
  });
  expect(fired).toEqual([]);
});

test("chained via group label: an unblock can satisfy a later group-status dep in the same fixpoint", () => {
  // d is blocked_by phase-2 whose only member (c) is blocked — group status
  // `blocked`, not `done` — so nothing chains through `done`. But completing
  // a's type unblocks c; c lands action-required (non-terminal), so phase-2
  // is still not done and d stays blocked: the fixpoint converges without
  // firing d. Asserts convergence + correct single fire.
  const fired = run({
    actions: [
      action("a", "done"),
      action("c", "blocked", { action_group: "phase-2" }),
      action("d", "blocked"),
    ],
    actionsConfig: [
      config("a"),
      config("c", { blocked_by: ["a"], action_group: "phase-2" }),
      config("d", { blocked_by: ["phase-2"] }),
    ],
    declaredGroups: [{ id: "phase-2" }],
  });
  expect(fired.map((e) => e.doc._id)).toEqual(["c-id"]);
});

test("chained unblocks: not-required terminals cascade across iterations", () => {
  // b is blocked_by a (terminal). c is blocked_by b — but b unblocks to
  // action-required (non-terminal), so c must NOT fire: unblocks land
  // non-terminal and cannot satisfy a type dep. Converges in 2 iterations.
  const fired = run({
    actions: [
      action("a", "done"),
      action("b", "blocked"),
      action("c", "blocked"),
    ],
    actionsConfig: [
      config("a"),
      config("b", { blocked_by: ["a"] }),
      config("c", { blocked_by: ["b"] }),
    ],
  });
  expect(fired.map((e) => e.doc._id)).toEqual(["b-id"]);
});

test("cycles do not deadlock: mutually blocked actions terminate with no fires", () => {
  const fired = run({
    actions: [action("a", "blocked"), action("b", "blocked")],
    actionsConfig: [
      config("a", { blocked_by: ["b"] }),
      config("b", { blocked_by: ["a"] }),
    ],
  });
  expect(fired).toEqual([]);
});

test("never auto-emits block: a regressed dep does not re-block an unblocked action", () => {
  // b was already unblocked (action-required) while its dep a regressed to
  // in-progress — monotonic: no planned doc may land `blocked`.
  const fired = run({
    actions: [action("a", "in-progress"), action("b", "action-required")],
    actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
  });
  expect(fired).toEqual([]);
  expect(fired.some((e) => e.doc.status[0].stage === "blocked")).toBe(false);
});

test("undeclared blocked_by entry is defensively unsatisfied", () => {
  const fired = run({
    actions: [action("b", "blocked")],
    actionsConfig: [config("b", { blocked_by: ["nonexistent"] })],
  });
  expect(fired).toEqual([]);
});

test("each action unblocks at most once (fired entries are unique)", () => {
  const fired = run({
    actions: [
      action("a", "done"),
      action("b", "blocked", { _id: "b-1", key: "k1" }),
      action("b", "blocked", { _id: "b-2", key: "k2" }),
    ],
    actionsConfig: [config("a"), config("b", { blocked_by: ["a"] })],
  });
  expect(fired.map((e) => e.doc._id).sort()).toEqual(["b-1", "b-2"]);
});
