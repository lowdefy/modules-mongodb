import planChangeLog from "./planChangeLog.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const timestamp = new Date("2026-06-01T10:00:00Z");

const connection = {
  changeLog: {
    collection: "change_log",
    meta: { app: "demo", env: "production" },
  },
};

const lowdefyContext = {
  blockId: "blk-1",
  connectionId: "conn-1",
  pageId: "pg-1",
  requestId: "req-1",
  request: { action_id: "a-1", signal: "submit" },
};

function makeUpdateEntry({
  id = "doc-1",
  before = { _id: "doc-1", status: "old" },
  after = { _id: "doc-1", status: "new" },
} = {}) {
  return {
    doc: after,
    operation: "update",
    changeLog: { before, after },
  };
}

function makeInsertEntry({
  id = "doc-2",
  doc = { _id: "doc-2", type: "new-action" },
} = {}) {
  return {
    doc,
    operation: "insert",
    changeLog: { before: null, after: doc },
  };
}

function run(overrides = {}) {
  return planChangeLog({
    planActions: [],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
    ...overrides,
  });
}

// ── Opt-out ───────────────────────────────────────────────────────────────────

test("no entries when changeLog is not configured on connection", () => {
  const result = planChangeLog({
    planActions: [makeUpdateEntry()],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection: {},
    lowdefyContext,
    timestamp,
  });
  expect(result).toEqual([]);
});

test("no entries when connection.changeLog is falsy", () => {
  expect(
    planChangeLog({
      planActions: [],
      planWorkflow: makeUpdateEntry(),
      connection: { changeLog: null },
      lowdefyContext,
      timestamp,
    }),
  ).toEqual([]);
});

// ── Entry count ───────────────────────────────────────────────────────────────

test("N action transitions + 1 workflow → N+1 entries", () => {
  const result = planChangeLog({
    planActions: [
      makeUpdateEntry({ id: "a-1" }),
      makeUpdateEntry({ id: "a-2" }),
    ],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  expect(result).toHaveLength(3);
});

test("zero actions + workflow → 1 entry", () => {
  const result = run({ planActions: [] });
  expect(result).toHaveLength(1);
});

test("three actions + workflow → 4 entries", () => {
  const result = planChangeLog({
    planActions: [
      makeUpdateEntry({ id: "a-1" }),
      makeUpdateEntry({ id: "a-2" }),
      makeInsertEntry({ id: "a-3" }),
    ],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  expect(result).toHaveLength(4);
});

// ── Update entry schema ───────────────────────────────────────────────────────

test("update entry: type is MongoDBUpdateOne", () => {
  const result = run({ planActions: [] });
  const entry = result[0];
  expect(entry.type).toBe("MongoDBUpdateOne");
});

test("update entry: args carries filter._id and update.$set equal to planned doc", () => {
  const after = { _id: "wf-1", status: [{ stage: "active" }] };
  const result = planChangeLog({
    planActions: [],
    planWorkflow: makeUpdateEntry({
      id: "wf-1",
      after,
      before: { _id: "wf-1", status: [] },
    }),
    connection,
    lowdefyContext,
    timestamp,
  });
  const entry = result[0];
  expect(entry.args.filter).toEqual({ _id: "wf-1" });
  expect(entry.args.update).toEqual({ $set: after });
});

test("update entry: before = loaded doc, after = planned doc", () => {
  const before = { _id: "a-1", status: [{ stage: "action-required" }] };
  const after = { _id: "a-1", status: [{ stage: "done" }] };
  const result = planChangeLog({
    planActions: [makeUpdateEntry({ id: "a-1", before, after })],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  const actionEntry = result[0];
  expect(actionEntry.before).toEqual(before);
  expect(actionEntry.after).toEqual(after);
});

test("update entry: no response field", () => {
  const result = run({ planActions: [] });
  expect(result[0]).not.toHaveProperty("response");
});

// ── Insert entry schema ───────────────────────────────────────────────────────

test("insert entry: type is MongoDBInsertOne", () => {
  const result = planChangeLog({
    planActions: [makeInsertEntry()],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  const insertEntry = result[0];
  expect(insertEntry.type).toBe("MongoDBInsertOne");
});

test("insert entry: args.doc equals planned doc", () => {
  const doc = {
    _id: "a-new",
    type: "qualify",
    status: [{ stage: "action-required" }],
  };
  const result = planChangeLog({
    planActions: [makeInsertEntry({ id: "a-new", doc })],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  const insertEntry = result[0];
  expect(insertEntry.args.doc).toEqual(doc);
});

test("insert entry: response carries acknowledged: true and insertedId = doc._id", () => {
  const doc = { _id: "a-new", type: "qualify" };
  const result = planChangeLog({
    planActions: [makeInsertEntry({ doc })],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  const insertEntry = result[0];
  expect(insertEntry.response).toEqual({
    acknowledged: true,
    insertedId: "a-new",
  });
});

test("insert entry: no before or after fields", () => {
  const result = planChangeLog({
    planActions: [makeInsertEntry()],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  const insertEntry = result[0];
  expect(insertEntry).not.toHaveProperty("before");
  expect(insertEntry).not.toHaveProperty("after");
});

// ── Shared fields on every entry ──────────────────────────────────────────────

test("payload is included on every entry", () => {
  const result = planChangeLog({
    planActions: [makeInsertEntry(), makeUpdateEntry({ id: "a-upd" })],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext,
    timestamp,
  });
  for (const entry of result) {
    expect(entry.payload).toEqual(lowdefyContext.request);
  }
});

test("blockId, connectionId, pageId, requestId on every entry", () => {
  const result = run({ planActions: [makeUpdateEntry({ id: "a-1" })] });
  for (const entry of result) {
    expect(entry.blockId).toBe("blk-1");
    expect(entry.connectionId).toBe("conn-1");
    expect(entry.pageId).toBe("pg-1");
    expect(entry.requestId).toBe("req-1");
  }
});

test("timestamp on every entry", () => {
  const result = run({ planActions: [makeInsertEntry()] });
  for (const entry of result) {
    expect(entry.timestamp).toBe(timestamp);
  }
});

// ── Verbatim meta copy ────────────────────────────────────────────────────────

test("meta is a verbatim copy of connection.changeLog.meta (no resolution)", () => {
  const meta = { app: "my-app", env: "staging", extra: { nested: true } };
  const conn = { changeLog: { collection: "log", meta } };
  const result = planChangeLog({
    planActions: [],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection: conn,
    lowdefyContext,
    timestamp,
  });
  expect(result[0].meta).toBe(meta); // referential equality — verbatim copy
});

// ── Context fields from lowdefyContext ────────────────────────────────────────

test("pageId and blockId are undefined when absent (API trigger path)", () => {
  const ctx = { connectionId: "conn-api", requestId: "req-api", request: {} };
  const result = planChangeLog({
    planActions: [],
    planWorkflow: makeUpdateEntry({ id: "wf-1" }),
    connection,
    lowdefyContext: ctx,
    timestamp,
  });
  expect(result[0].pageId).toBeUndefined();
  expect(result[0].blockId).toBeUndefined();
  expect(result[0].connectionId).toBe("conn-api");
});
