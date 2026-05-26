import mergePreHookActions from "./mergePreHookActions.js";

const currentActionEntry = {
  type: "qualify",
  status: "in-review",
  keys: undefined,
  fields: { note: "n" },
};

describe("mergePreHookActions", () => {
  test("no pre-hook entries: returns currentActionEntry first, then auto-unblocks normalised to keys:[null]", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [
        { type: "send-quote", status: "action-required" },
        { type: "schedule-followup", status: "action-required" },
      ],
      preHookActions: undefined,
      resolvedStatus: "in-review",
    });

    expect(out).toEqual([
      {
        type: "qualify",
        status: "in-review",
        keys: [null],
        fields: { note: "n" },
      },
      { type: "send-quote", status: "action-required", keys: [null] },
      { type: "schedule-followup", status: "action-required", keys: [null] },
    ]);
  });

  test("pre-hook entry replaces auto-unblock on (type, null) collision", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [{ type: "send-quote", status: "action-required" }],
      preHookActions: [{ type: "send-quote", status: "done" }],
      resolvedStatus: "in-review",
    });

    const sendQuote = out.filter((e) => e.type === "send-quote");
    expect(sendQuote).toHaveLength(1);
    expect(sendQuote[0]).toEqual({
      type: "send-quote",
      status: "done",
      keys: [null],
    });
  });

  test("pre-hook keyed entry + auto-unblock keyless entry on same type → both kept (different keys)", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [{ type: "send-quote", status: "action-required" }],
      preHookActions: [{ type: "send-quote", key: "k1", status: "done" }],
      resolvedStatus: "in-review",
    });

    const sendQuote = out.filter((e) => e.type === "send-quote");
    expect(sendQuote).toHaveLength(2);
    expect(sendQuote).toEqual(
      expect.arrayContaining([
        { type: "send-quote", status: "action-required", keys: [null] },
        { type: "send-quote", status: "done", keys: ["k1"] },
      ]),
    );
  });

  test("pre-hook entry collides with currentActionEntry and omits status → resolvedStatus grafted in", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [{ type: "qualify", fields: { extra: "x" } }],
      resolvedStatus: "in-review",
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      type: "qualify",
      status: "in-review",
      keys: [null],
      fields: { extra: "x" },
    });
  });

  test("pre-hook entry collides with currentActionEntry and provides status → graft skipped, pre-hook status wins", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [
        { type: "qualify", status: "done", fields: { extra: "x" } },
      ],
      resolvedStatus: "in-review",
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      type: "qualify",
      status: "done",
      keys: [null],
      fields: { extra: "x" },
    });
  });

  test("pre-hook entry with force: true preserves flag", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [
        { type: "send-quote", status: "action-required", force: true },
      ],
      resolvedStatus: "in-review",
    });

    expect(out).toContainEqual({
      type: "send-quote",
      status: "action-required",
      keys: [null],
      force: true,
    });
  });

  test("pre-hook entry with upsert: true preserves flag", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [{ type: "send-quote", status: "done", upsert: true }],
      resolvedStatus: "in-review",
    });

    expect(out).toContainEqual({
      type: "send-quote",
      status: "done",
      keys: [null],
      upsert: true,
    });
  });

  test("pre-hook entry with status: 'error' is preserved as-is", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [{ type: "qualify", status: "error" }],
      resolvedStatus: "in-review",
    });

    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("error");
  });

  test("pre-hook entry expansion across explicit key + null → two (type, key) entries", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [
        { type: "send-quote", key: "k1", status: "done" },
        { type: "send-quote", key: "k2", status: "done" },
      ],
      resolvedStatus: "in-review",
    });

    const sendQuote = out.filter((e) => e.type === "send-quote");
    expect(sendQuote).toHaveLength(2);
    expect(sendQuote.map((e) => e.keys[0])).toEqual(["k1", "k2"]);
  });

  test("currentActionEntry with keys:[<key>] still expands and collides correctly", () => {
    const keyed = {
      type: "approve-device",
      status: "in-review",
      keys: ["device-1"],
      fields: {},
    };

    const out = mergePreHookActions({
      currentActionEntry: keyed,
      autoUnblockEntries: [],
      preHookActions: [
        { type: "approve-device", key: "device-1", status: "done" },
      ],
      resolvedStatus: "in-review",
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      type: "approve-device",
      status: "done",
      keys: ["device-1"],
    });
  });

  test("pre-hook entry with key: null collides with keyless currentActionEntry", () => {
    const out = mergePreHookActions({
      currentActionEntry,
      autoUnblockEntries: [],
      preHookActions: [{ type: "qualify", key: null, status: "done" }],
      resolvedStatus: "in-review",
    });

    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("done");
    expect(out[0].keys).toEqual([null]);
  });
});
