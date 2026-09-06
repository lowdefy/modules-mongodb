import AnalyticsPipeline from "./AnalyticsPipeline.js";
import getMongoDb from "../../mongo/getMongoDb.js";
import {
  MAX_RESULT_BYTES,
  PIPELINE_RESULT_CAP,
} from "../../../analytics/constants.js";

// The request imports getMongoDb directly; mock it so no real MongoDB (or
// MongoMemoryServer) is needed and the aggregate call can be captured.
jest.mock("../../mongo/getMongoDb.js", () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Catalog fixture mirrors validatePipeline.test.js: one open collection, one
// role-gated collection, one relationship between them.
const catalog = {
  demo_orders: {
    description: "Orders placed by companies.",
    fields: {
      total: { type: "number" },
      region: { type: "string" },
      status: { type: "string" },
      created_at: { type: "date" },
    },
  },
  demo_companies: {
    roles: ["analyst"],
    description: "Companies.",
    fields: { _id: { type: "string" }, name: { type: "string" } },
  },
};

let aggregate;
let collection;
let close;

function connectionWith(overrides = {}) {
  return { databaseUri: "mongodb://mock", catalog, ...overrides };
}

// The request drains a cursor with a byte budget rather than calling toArray(),
// so the mock is an async-iterable cursor with close() — the shape the driver
// returns.
function mockCursor(docs) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const doc of docs) yield doc;
    },
    close,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  close = jest.fn(async () => {});
  // Capture what the request executes; return a fixed result set.
  aggregate = jest.fn(() => mockCursor([{ region: "EU" }]));
  collection = jest.fn(() => ({ aggregate }));
  getMongoDb.mockResolvedValue({ mongoDb: { collection } });
});

test("happy path: executes the reconstructed pipeline and returns rows", async () => {
  const inputPipeline = [{ $match: { region: "EU" } }];
  const rows = await AnalyticsPipeline({
    request: {
      query: { collection: "demo_orders", pipeline: inputPipeline },
      roles: ["analyst"],
    },
    connection: connectionWith(),
  });

  expect(rows).toEqual([{ region: "EU" }]);
  expect(collection).toHaveBeenCalledWith("demo_orders");

  // Executed pipeline is validatePipeline's reconstruction, not the input:
  // a fresh array (different reference) with the trailing result cap appended.
  const [executed, options] = aggregate.mock.calls[0];
  expect(executed).not.toBe(inputPipeline);
  expect(executed[0]).toEqual({ $match: { region: "EU" } });
  expect(executed[executed.length - 1]).toEqual({
    $limit: PIPELINE_RESULT_CAP,
  });
  expect(options.maxTimeMS).toBe(30000);
});

test("filter triples: null value dropped, others build a leading $match", async () => {
  await AnalyticsPipeline({
    request: {
      query: {
        collection: "demo_orders",
        pipeline: [{ $sort: { total: -1 } }],
      },
      roles: ["analyst"],
      filters: [
        { field: "region", op: "eq", value: "EU" },
        { field: "total", op: "gte", value: 100 },
        { field: "status", op: "eq", value: null }, // no constraint → dropped
      ],
    },
    connection: connectionWith(),
  });

  const [executed] = aggregate.mock.calls[0];
  // The built $match lands PRE-pipeline (index 0), the query's $sort follows.
  expect(executed[0]).toEqual({
    $match: {
      $and: [{ region: { $eq: "EU" } }, { total: { $gte: 100 } }],
    },
  });
  expect(executed[1]).toEqual({ $sort: { total: -1 } });
});

test("filters: all-null triples produce no $match", async () => {
  await AnalyticsPipeline({
    request: {
      query: {
        collection: "demo_orders",
        pipeline: [{ $sort: { total: -1 } }],
      },
      roles: ["analyst"],
      filters: [{ field: "region", op: "eq", value: undefined }],
    },
    connection: connectionWith(),
  });
  const [executed] = aggregate.mock.calls[0];
  expect(executed[0]).toEqual({ $sort: { total: -1 } });
});

test("filter triples: in/all ops build $in/$all clauses", async () => {
  await AnalyticsPipeline({
    request: {
      query: {
        collection: "demo_orders",
        pipeline: [{ $sort: { total: -1 } }],
      },
      roles: ["analyst"],
      filters: [
        { field: "region", op: "in", value: ["EU", "US"] },
        { field: "status", op: "all", value: ["open", "flagged"] },
      ],
    },
    connection: connectionWith(),
  });

  const [executed] = aggregate.mock.calls[0];
  expect(executed[0]).toEqual({
    $match: {
      $and: [
        { region: { $in: ["EU", "US"] } },
        { status: { $all: ["open", "flagged"] } },
      ],
    },
  });
  expect(executed[1]).toEqual({ $sort: { total: -1 } });
});

test("filter triples: an empty-array value is dropped like null, for any op", async () => {
  await AnalyticsPipeline({
    request: {
      query: {
        collection: "demo_orders",
        pipeline: [{ $sort: { total: -1 } }],
      },
      roles: ["analyst"],
      filters: [
        { field: "region", op: "in", value: [] }, // cleared multiselect → dropped
        { field: "status", op: "eq", value: "open" },
      ],
    },
    connection: connectionWith(),
  });

  const [executed] = aggregate.mock.calls[0];
  expect(executed[0]).toEqual({
    $match: { $and: [{ status: { $eq: "open" } }] },
  });
});

test("filters: an all-empty-array/null filters array yields no $match", async () => {
  await AnalyticsPipeline({
    request: {
      query: {
        collection: "demo_orders",
        pipeline: [{ $sort: { total: -1 } }],
      },
      roles: ["analyst"],
      filters: [
        { field: "region", op: "in", value: [] },
        { field: "status", op: "eq", value: null },
      ],
    },
    connection: connectionWith(),
  });

  const [executed] = aggregate.mock.calls[0];
  // No $match was prepended — the section's own pipeline runs unchanged.
  expect(executed[0]).toEqual({ $sort: { total: -1 } });
});

test("unknown filter op throws (default-deny) before any DB call", async () => {
  await expect(
    AnalyticsPipeline({
      request: {
        query: { collection: "demo_orders", pipeline: [] },
        roles: ["analyst"],
        filters: [{ field: "region", op: "regex", value: "^E" }],
      },
      connection: connectionWith(),
    }),
  ).rejects.toThrow(/Unsupported filter operator "regex"/);
  expect(getMongoDb).not.toHaveBeenCalled();
  expect(aggregate).not.toHaveBeenCalled();
});

test("catalog comes from the connection; a request cannot override it", async () => {
  // Request carries a bogus wide-open catalog; the connection's catalog omits
  // the target collection. If the request's catalog were honoured this would
  // pass — it must not.
  await expect(
    AnalyticsPipeline({
      request: {
        query: { collection: "secret_ledger", pipeline: [] },
        roles: ["analyst"],
        catalog: { secret_ledger: { fields: {} } },
      },
      connection: connectionWith(),
    }),
  ).rejects.toThrow(/not in the collections catalog/);
});

test("allowDiskUse defaults to true, and is overridable per connection", async () => {
  await AnalyticsPipeline({
    request: {
      query: { collection: "demo_orders", pipeline: [] },
      roles: ["analyst"],
    },
    connection: connectionWith(),
  });
  expect(aggregate.mock.calls[0][1].allowDiskUse).toBe(true);

  await AnalyticsPipeline({
    request: {
      query: { collection: "demo_orders", pipeline: [] },
      roles: ["analyst"],
    },
    connection: connectionWith({ allowDiskUse: false }),
  });
  expect(aggregate.mock.calls[1][1].allowDiskUse).toBe(false);
});

test("adversarial: a $where-shaped filter field is rejected by validation", async () => {
  // A filter triple posting field "$where" builds { $match: { $and: [ { "$where": … } ] } }.
  await expect(
    AnalyticsPipeline({
      request: {
        query: { collection: "demo_orders", pipeline: [] },
        roles: ["analyst"],
        filters: [{ field: "$where", op: "eq", value: "sleep(1000)" }],
      },
      connection: connectionWith(),
    }),
  ).rejects.toThrow(/\$where/);
  expect(aggregate).not.toHaveBeenCalled();
});

// The row cap bounds how MANY documents come back; nothing in the grammar
// bounds how BIG one is. `{ $range: [0, 500000] }` is an allowlisted expression
// that passes validation and yields a multi-megabyte row, so without a byte
// budget a permitted 1000-row result becomes gigabytes in the app process.
describe("result byte budget", () => {
  // ~1KB per document.
  const fatDoc = { blob: "x".repeat(1000) };

  test("aborts mid-drain once the budget is exceeded, and closes the cursor", async () => {
    aggregate = jest.fn(() =>
      mockCursor(Array.from({ length: 100 }, () => fatDoc)),
    );
    collection = jest.fn(() => ({ aggregate }));
    getMongoDb.mockResolvedValue({ mongoDb: { collection } });

    await expect(
      AnalyticsPipeline({
        request: {
          query: { collection: "demo_orders", pipeline: [] },
          roles: ["analyst"],
        },
        connection: connectionWith({ maxResultBytes: 5000 }),
      }),
    ).rejects.toThrow(/exceeds the 5000 byte result budget/);
    // Aborting mid-stream is the point: the whole result must never be
    // materialized just to discover it was too large.
    expect(close).toHaveBeenCalled();
  });

  test("a result inside the budget is returned in full", async () => {
    aggregate = jest.fn(() =>
      mockCursor(Array.from({ length: 3 }, () => fatDoc)),
    );
    collection = jest.fn(() => ({ aggregate }));
    getMongoDb.mockResolvedValue({ mongoDb: { collection } });

    const rows = await AnalyticsPipeline({
      request: {
        query: { collection: "demo_orders", pipeline: [] },
        roles: ["analyst"],
      },
      connection: connectionWith({ maxResultBytes: 5000 }),
    });
    expect(rows).toHaveLength(3);
  });

  // request > connection > MAX_RESULT_BYTES. The request-set budget is what
  // lets the agent's read path be far tighter than the connection default:
  // its rows are persisted and re-sent as model context, unlike every other
  // caller's.
  describe("precedence", () => {
    function withDocs(count) {
      aggregate = jest.fn(() =>
        mockCursor(Array.from({ length: count }, () => fatDoc)),
      );
      collection = jest.fn(() => ({ aggregate }));
      getMongoDb.mockResolvedValue({ mongoDb: { collection } });
    }

    test("a request budget below the result size throws, naming its number", async () => {
      withDocs(100);
      await expect(
        AnalyticsPipeline({
          request: {
            query: { collection: "demo_orders", pipeline: [] },
            roles: ["analyst"],
            maxResultBytes: 5000,
          },
          connection: connectionWith(),
        }),
      ).rejects.toThrow(/exceeds the 5000 byte result budget/);
    });

    test("a request budget above the result size passes, over a lower connection budget", async () => {
      withDocs(10); // ~10KB — over the connection's budget, under the request's.
      const rows = await AnalyticsPipeline({
        request: {
          query: { collection: "demo_orders", pipeline: [] },
          roles: ["analyst"],
          maxResultBytes: 50000,
        },
        connection: connectionWith({ maxResultBytes: 5000 }),
      });
      expect(rows).toHaveLength(10);
    });

    test("with no request budget the connection's value applies", async () => {
      withDocs(100);
      await expect(
        AnalyticsPipeline({
          request: {
            query: { collection: "demo_orders", pipeline: [] },
            roles: ["analyst"],
          },
          connection: connectionWith({ maxResultBytes: 5000 }),
        }),
      ).rejects.toThrow(/exceeds the 5000 byte result budget/);
    });

    test("with neither set, MAX_RESULT_BYTES applies", async () => {
      // One fat doc per iteration keeps this cheap: the same string by
      // reference, drained until it crosses 8 MB.
      withDocs(Math.ceil(MAX_RESULT_BYTES / 1000) + 10);
      await expect(
        AnalyticsPipeline({
          request: {
            query: { collection: "demo_orders", pipeline: [] },
            roles: ["analyst"],
          },
          connection: connectionWith(),
        }),
      ).rejects.toThrow(
        new RegExp(`exceeds the ${MAX_RESULT_BYTES} byte result budget`),
      );
    });
  });
});

test("a non-array pipeline fails with the validator's message, filters or not", async () => {
  for (const filters of [
    undefined,
    [{ field: "region", op: "eq", value: "EU" }],
  ]) {
    await expect(
      AnalyticsPipeline({
        request: {
          query: { collection: "demo_orders", pipeline: { $match: {} } },
          roles: ["analyst"],
          filters,
        },
        connection: connectionWith(),
      }),
    ).rejects.toThrow(/pipeline must be an array of stages/);
  }
  expect(aggregate).not.toHaveBeenCalled();
});

// meta — the request pipeline dereferences requestResolver.meta.checkRead /
// .checkWrite; missing statics throw at runtime for every query.
describe("handler meta", () => {
  test("has schema and read-only meta", () => {
    expect(AnalyticsPipeline.schema).toEqual({});
    expect(AnalyticsPipeline.meta).toEqual({
      checkRead: true,
      checkWrite: false,
    });
  });
});
