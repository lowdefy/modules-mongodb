import { FSM_TABLES } from "./tables.js";

// Expected grids transcribed from state-machine.md "FSM tables per kind".
// 'FN' marks a function cell (the `submit` in-review/done split). A missing key
// means a no-op (absent entry) for that (stage, signal) pair.

const FORM_SIGNALS = [
  "submit",
  "progress",
  "not_required",
  "approve",
  "request_changes",
  "resolve_error",
  "error",
  "unblock",
  "activate",
  "block",
  "internal_cancel_action",
];

const EXPECTED_FORM = {
  none: {
    request_changes: "changes-required",
    error: "error",
    activate: "action-required",
    block: "blocked",
  },
  blocked: {
    not_required: "not-required",
    error: "error",
    unblock: "action-required",
    activate: "action-required",
    internal_cancel_action: "not-required",
  },
  "action-required": {
    submit: "FN",
    progress: "in-progress",
    not_required: "not-required",
    error: "error",
    block: "blocked",
    internal_cancel_action: "not-required",
  },
  "in-progress": {
    submit: "FN",
    progress: "in-progress",
    not_required: "not-required",
    error: "error",
    activate: "action-required",
    block: "blocked",
    internal_cancel_action: "not-required",
  },
  "in-review": {
    not_required: "not-required",
    approve: "done",
    request_changes: "changes-required",
    error: "error",
    activate: "action-required",
    block: "blocked",
    internal_cancel_action: "not-required",
  },
  "changes-required": {
    submit: "FN",
    not_required: "not-required",
    error: "error",
    activate: "action-required",
    block: "blocked",
    internal_cancel_action: "not-required",
  },
  error: {
    not_required: "not-required",
    resolve_error: "in-review",
    activate: "action-required",
    block: "blocked",
    internal_cancel_action: "not-required",
  },
  done: {
    submit: "FN",
    request_changes: "changes-required",
    activate: "action-required",
  },
  "not-required": {},
};

const TRACKER_SIGNALS = [
  "unblock",
  "activate",
  "block",
  "internal_mirror_child_active",
  "internal_mirror_child_completed",
  "internal_mirror_child_cancelled",
  "internal_cancel_action",
];

const EXPECTED_TRACKER = {
  none: {
    activate: "action-required",
    block: "blocked",
  },
  blocked: {
    unblock: "action-required",
    internal_mirror_child_active: "in-progress",
    internal_mirror_child_completed: "done",
    internal_mirror_child_cancelled: "not-required",
    internal_cancel_action: "not-required",
  },
  "action-required": {
    internal_mirror_child_active: "in-progress",
    internal_mirror_child_completed: "done",
    internal_mirror_child_cancelled: "not-required",
    internal_cancel_action: "not-required",
  },
  "in-progress": {
    internal_mirror_child_completed: "done",
    internal_mirror_child_cancelled: "not-required",
    internal_cancel_action: "not-required",
  },
  done: {
    internal_mirror_child_active: "in-progress",
    internal_mirror_child_cancelled: "not-required",
  },
  "not-required": {
    internal_mirror_child_active: "in-progress",
    internal_mirror_child_completed: "done",
  },
};

function assertTableExhaustive(table, expected, signals) {
  // Same set of stages (no extra, none missing).
  expect(Object.keys(table).sort()).toEqual(Object.keys(expected).sort());
  // Every (stage, signal) pair matches — covers presence AND absence.
  for (const stage of Object.keys(expected)) {
    for (const signal of signals) {
      const cell = table[stage][signal];
      const want = expected[stage][signal];
      if (want === "FN") {
        expect(typeof cell).toBe("function");
      } else if (want === undefined) {
        expect(cell).toBeUndefined();
      } else {
        expect(cell).toBe(want);
      }
    }
  }
}

test("form table matches state-machine.md exactly", () => {
  assertTableExhaustive(FSM_TABLES.form, EXPECTED_FORM, FORM_SIGNALS);
});

test("tracker table matches state-machine.md exactly", () => {
  assertTableExhaustive(FSM_TABLES.tracker, EXPECTED_TRACKER, TRACKER_SIGNALS);
});

test("check is the form table by object identity (not a copy)", () => {
  expect(FSM_TABLES.check).toBe(FSM_TABLES.form);
});

test("every kind has a none creation row; tracker births only via activate/block", () => {
  expect(FSM_TABLES.form.none).toBeDefined();
  expect(FSM_TABLES.form.none.activate).toBe("action-required");
  expect(FSM_TABLES.form.none.block).toBe("blocked");
  expect(FSM_TABLES.form.none.request_changes).toBe("changes-required");
  expect(FSM_TABLES.form.none.error).toBe("error");
  // Every other signal no-ops from none.
  expect(FSM_TABLES.form.none.submit).toBeUndefined();
  expect(FSM_TABLES.form.none.progress).toBeUndefined();
  expect(FSM_TABLES.form.none.unblock).toBeUndefined();
  // Tracker `none` row carries the two birth signals only (pre-hooks can
  // conditionally spawn trackers — state-machine.md "Creation").
  expect(FSM_TABLES.tracker.none).toEqual({
    activate: "action-required",
    block: "blocked",
  });
});

test("unblock only transitions from blocked (re-fire safety)", () => {
  // Guard the re-fire bug: unblock from blocked → action-required, which must
  // not itself accept unblock.
  expect(FSM_TABLES.form.blocked.unblock).toBe("action-required");
  for (const stage of Object.keys(FSM_TABLES.form)) {
    if (stage === "blocked") continue;
    expect(FSM_TABLES.form[stage].unblock).toBeUndefined();
  }
});
