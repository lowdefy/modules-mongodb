import shouldUpdate from "./shouldUpdate.js";

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

function fetched(stage, id = "other-action") {
  return { _id: id, status: [{ stage }] };
}

test("shouldUpdate: force:true short-circuits to true even when priority would reject", () => {
  const result = shouldUpdate({
    actionsEnum,
    currentActionId: null,
    actionEntry: { type: "qualify", status: "action-required", force: true },
    fetchedAction: fetched("done"),
  });
  expect(result).toBe(true);
});

test("shouldUpdate: throws on unknown new status", () => {
  expect(() =>
    shouldUpdate({
      actionsEnum,
      currentActionId: null,
      actionEntry: { type: "qualify", status: "made-up-stage" },
      fetchedAction: fetched("action-required"),
    }),
  ).toThrow(/target status "made-up-stage" not found in actionsEnum/);
});

test("shouldUpdate: throws on unknown current stage", () => {
  expect(() =>
    shouldUpdate({
      actionsEnum,
      currentActionId: null,
      actionEntry: { type: "qualify", status: "done" },
      fetchedAction: fetched("ghost-stage"),
    }),
  ).toThrow(/current status "ghost-stage" not found in actionsEnum/);
});

test("shouldUpdate: self-exception — same-id entry with same stage returns true", () => {
  const result = shouldUpdate({
    actionsEnum,
    currentActionId: "self-id",
    actionEntry: { type: "qualify", status: "in-review" },
    fetchedAction: fetched("in-review", "self-id"),
  });
  expect(result).toBe(true);
});

test("shouldUpdate: non-self same-stage returns false (strict less-than)", () => {
  const result = shouldUpdate({
    actionsEnum,
    currentActionId: "other-id",
    actionEntry: { type: "qualify", status: "done" },
    fetchedAction: fetched("done", "different-id"),
  });
  expect(result).toBe(false);
});

test("shouldUpdate: lower-priority transition returns true (action-required → in-review)", () => {
  const result = shouldUpdate({
    actionsEnum,
    currentActionId: null,
    actionEntry: { type: "qualify", status: "in-review" },
    fetchedAction: fetched("action-required"),
  });
  expect(result).toBe(true);
});

test("shouldUpdate: higher-priority transition returns false (done → action-required)", () => {
  const result = shouldUpdate({
    actionsEnum,
    currentActionId: null,
    actionEntry: { type: "qualify", status: "action-required" },
    fetchedAction: fetched("done"),
  });
  expect(result).toBe(false);
});

test("shouldUpdate: not-required (priority 0) lands on any non-terminal stage", () => {
  for (const stage of ["action-required", "in-review", "blocked", "changes-required"]) {
    const result = shouldUpdate({
      actionsEnum,
      currentActionId: null,
      actionEntry: { type: "qualify", status: "not-required" },
      fetchedAction: fetched(stage),
    });
    expect(result).toBe(true);
  }
});

test("shouldUpdate: pushing not-required onto already-not-required requires force (false without it)", () => {
  const result = shouldUpdate({
    actionsEnum,
    currentActionId: null,
    actionEntry: { type: "qualify", status: "not-required" },
    fetchedAction: fetched("not-required"),
  });
  expect(result).toBe(false);
});
