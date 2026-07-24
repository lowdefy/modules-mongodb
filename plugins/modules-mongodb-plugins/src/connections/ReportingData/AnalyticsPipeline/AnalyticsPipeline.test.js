import AnalyticsPipeline from "./AnalyticsPipeline.js";
import getMongoDb from "../../mongo/getMongoDb.js";
import { PIPELINE_RESULT_CAP } from "../../../analytics/constants.js";

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

function connectionWith(overrides = {}) {
  return { databaseUri: "mongodb://mock", catalog, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Capture what the request executes; return a fixed result set.
  aggregate = jest.fn(() => ({ toArray: async () => [{ region: "EU" }] }));
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
