import { jest } from "@jest/globals";

import {
  GLOBAL_KEY,
  MAX_CHARS,
  createRecorder,
  flatten,
  installRecorder,
} from "./recorder.js";

const fakeWindow = () => {
  const listeners = {};
  const original = jest.fn();
  return {
    win: {
      console: { error: original },
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
    original,
    fire: (name, event) => listeners[name](event),
  };
};

describe("flatten", () => {
  test("joins strings and numbers with spaces", () => {
    expect(flatten(["Request failed", 42, true])).toEqual({
      message: "Request failed 42 true",
    });
  });

  test("takes an Error's message and stack", () => {
    const error = new Error("boom");
    const out = flatten(["While saving:", error]);
    expect(out.message).toBe("While saving: boom");
    expect(out.stack).toContain("boom");
  });

  test("writes objects as JSON", () => {
    expect(flatten([{ requestId: "get_ticket", status: 500 }])).toEqual({
      message: '{"requestId":"get_ticket","status":500}',
    });
  });

  test("truncates long messages to the limit", () => {
    const out = flatten([{ text: "x".repeat(5000) }]);
    expect(out.message).toHaveLength(MAX_CHARS);
    expect(out.message.endsWith("…")).toBe(true);
    expect(flatten(["y".repeat(5000)]).message).toHaveLength(MAX_CHARS);
  });

  test("does not throw on circular objects, null, undefined or functions", () => {
    const circular = { a: 1 };
    circular.self = circular;
    expect(flatten([circular]).message).toBe("[object Object]");
    expect(flatten([null, undefined]).message).toBe("null undefined");
    expect(flatten([function load() {}]).message).toBe("[function load]");
  });

  test("a single value is treated as one argument", () => {
    expect(flatten("just this")).toEqual({ message: "just this" });
  });
});

describe("createRecorder", () => {
  test("keeps the last 20 entries, oldest dropped first", () => {
    let t = Date.UTC(2026, 9, 7, 9, 0, 0);
    const recorder = createRecorder({ now: () => new Date((t += 1000)) });
    for (let i = 1; i <= 21; i += 1) recorder.record("console", [`entry ${i}`]);
    const entries = recorder.entries();
    expect(entries).toHaveLength(20);
    expect(entries[0].message).toBe("entry 2");
    expect(entries[19].message).toBe("entry 21");
    expect(entries[19]).toEqual({
      at: new Date(Date.UTC(2026, 9, 7, 9, 0, 21)).toISOString(),
      kind: "console",
      message: "entry 21",
    });
  });

  test("entries() returns copies", () => {
    const recorder = createRecorder();
    recorder.record("console", ["a"]);
    recorder.entries()[0].message = "changed";
    expect(recorder.entries()[0].message).toBe("a");
  });
});

describe("installRecorder", () => {
  test("records console.error and still calls the original", () => {
    const { win, original } = fakeWindow();
    const recorder = installRecorder(win);
    win.console.error("Request failed", { requestId: "r1" });
    expect(original).toHaveBeenCalledWith("Request failed", {
      requestId: "r1",
    });
    expect(recorder.entries()).toMatchObject([
      { kind: "console", message: 'Request failed {"requestId":"r1"}' },
    ]);
  });

  test("records uncaught errors and unhandled rejections", () => {
    const { win, fire } = fakeWindow();
    const recorder = installRecorder(win);
    fire("error", { message: "Uncaught Error: x", error: new Error("x") });
    fire("error", { message: "Script error." });
    fire("unhandledrejection", { reason: new Error("rejected") });
    fire("unhandledrejection", { reason: "plain reason" });
    const entries = recorder.entries();
    expect(entries.map((e) => [e.kind, e.message])).toEqual([
      ["error", "x"],
      ["error", "Script error."],
      ["rejection", "rejected"],
      ["rejection", "plain reason"],
    ]);
    expect(entries[0].stack).toContain("x");
    expect(entries[1]).not.toHaveProperty("stack");
  });

  test("installs once per window", () => {
    const { win, original } = fakeWindow();
    const first = installRecorder(win);
    const second = installRecorder(win);
    expect(second).toBe(first);
    expect(win[GLOBAL_KEY]).toBe(first);
    win.console.error("once");
    expect(original).toHaveBeenCalledTimes(1);
    expect(first.entries()).toHaveLength(1);
  });

  test("does nothing without a window", () => {
    expect(installRecorder(undefined)).toBe(null);
  });
});
