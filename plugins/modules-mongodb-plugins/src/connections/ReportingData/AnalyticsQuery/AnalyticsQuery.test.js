import inMemoryMongo from "../../shared/inMemoryMongo.js";
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import AnalyticsQuery from "./AnalyticsQuery.js";
import testDatasets from "../../../analytics/testDatasets.js";

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  await mongo.db.collection("orders").insertMany([
    {
      region: "EU",
      status: "paid",
      total: 100,
      createdAt: new Date("2026-04-10"),
    },
    {
      region: "EU",
      status: "paid",
      total: 150,
      createdAt: new Date("2026-05-01"),
    },
    {
      region: "US",
      status: "paid",
      total: 200,
      createdAt: new Date("2026-04-20"),
    },
    {
      region: "US",
      status: "pending",
      total: 50,
      createdAt: new Date("2026-03-01"),
    },
  ]);
  // Nested/embedded docs for the `activities` dataset — exercises dotted-path
  // grouping and $dateTrunc bucketing against a real MongoDB aggregation.
  await mongo.db.collection("activities_report").insertMany([
    {
      status: { stage: "open" },
      source: { channel: "manual" },
      created: { timestamp: new Date("2026-04-05") },
    },
    {
      status: { stage: "open" },
      source: { channel: "email" },
      created: { timestamp: new Date("2026-04-25") },
    },
    {
      status: { stage: "done" },
      source: { channel: "manual" },
      created: { timestamp: new Date("2026-05-02") },
    },
  ]);
});

afterAll(async () => {
  await clearMongoClientCache();
  await mongo.cleanup();
});

test("executes the design example query end to end", async () => {
  const rows = await AnalyticsQuery({
    request: {
      datasets: testDatasets,
      spec: {
        dataset: "orders",
        select: ["region"],
        measures: [
          { id: "total", agg: "sum" },
          { id: "count", agg: "count" },
        ],
        filters: [
          { field: "createdAt", op: "gte", value: "2026-04-01" },
          { field: "status", op: "eq", value: "paid" },
        ],
        sort: [{ field: "total_sum", dir: "desc" }],
        limit: 100,
      },
      roles: ["analyst"],
    },
    connection: { databaseUri: mongo.uri },
  });

  expect(rows).toEqual([
    { region: "EU", total_sum: 250, count_count: 2 },
    { region: "US", total_sum: 200, count_count: 1 },
  ]);
});

test("rejects a user without the dataset's roles", async () => {
  await expect(
    AnalyticsQuery({
      request: {
        datasets: testDatasets,
        spec: { dataset: "orders", select: ["region"] },
        roles: ["viewer"],
      },
      connection: { databaseUri: mongo.uri },
    }),
  ).rejects.toThrow(/not authorized/);
});

test("rejects fields outside the dictionary allowlist", async () => {
  await expect(
    AnalyticsQuery({
      request: {
        datasets: testDatasets,
        spec: { dataset: "orders", select: ["creditCard"] },
        roles: ["analyst"],
      },
      connection: { databaseUri: mongo.uri },
    }),
  ).rejects.toThrow(/references dimension "creditCard"/);
});

test("limit clamp caps returned rows", async () => {
  const rows = await AnalyticsQuery({
    request: {
      datasets: testDatasets,
      spec: {
        dataset: "orders",
        select: ["region", "status"],
        limit: 1,
      },
      roles: ["analyst"],
    },
    connection: { databaseUri: mongo.uri },
  });
  expect(rows).toHaveLength(1);
});

test("the connection cannot write: executing a spec never mutates data", async () => {
  const before = await mongo.db.collection("orders").countDocuments();
  await AnalyticsQuery({
    request: {
      datasets: testDatasets,
      spec: { dataset: "orders", select: ["status"] },
      roles: ["analyst"],
    },
    connection: { databaseUri: mongo.uri },
  });
  const after = await mongo.db.collection("orders").countDocuments();
  expect(after).toBe(before);
});

test("groups by a dotted-path dimension end to end", async () => {
  const rows = await AnalyticsQuery({
    request: {
      datasets: testDatasets,
      spec: {
        dataset: "activities",
        select: ["stage"],
        measures: [{ id: "count", agg: "count" }],
        sort: [{ field: "count_count", dir: "desc" }],
      },
      roles: [],
    },
    connection: { databaseUri: mongo.uri },
  });
  expect(rows).toEqual([
    { stage: "open", count_count: 2 },
    { stage: "done", count_count: 1 },
  ]);
});

test("buckets a date dimension by month end to end", async () => {
  const rows = await AnalyticsQuery({
    request: {
      datasets: testDatasets,
      spec: {
        dataset: "activities",
        select: ["created"],
        measures: [{ id: "count", agg: "count" }],
        sort: [{ field: "created", dir: "asc" }],
      },
      roles: [],
    },
    connection: { databaseUri: mongo.uri },
  });
  expect(rows).toEqual([
    { created: new Date("2026-04-01"), count_count: 2 },
    { created: new Date("2026-05-01"), count_count: 1 },
  ]);
});

// meta — the request pipeline dereferences requestResolver.meta.checkRead /
// .checkWrite; missing statics threw at runtime for every query.
describe("handler meta", () => {
  test("has schema and read-only meta", () => {
    expect(AnalyticsQuery.schema).toEqual({});
    expect(AnalyticsQuery.meta).toEqual({
      checkRead: true,
      checkWrite: false,
    });
  });
});
