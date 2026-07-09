import compileMongo from "./compileMongo.js";
import validateQuerySpec from "./validateQuerySpec.js";
import testDatasets from "./testDatasets.js";

const roles = ["analyst"];

function compile(spec) {
  return compileMongo(
    validateQuerySpec({ spec, datasets: testDatasets, roles }),
  );
}

test("compiles the design example to match/group/project/sort/limit", () => {
  const pipeline = compile({
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
  });

  expect(pipeline).toEqual([
    {
      $match: {
        $and: [
          { createdAt: { $gte: new Date("2026-04-01") } },
          { status: { $eq: "paid" } },
        ],
      },
    },
    {
      $group: {
        _id: { region: "$region" },
        total_sum: { $sum: "$total" },
        count_count: { $sum: 1 },
      },
    },
    {
      $project: { _id: 0, region: "$_id.region", total_sum: 1, count_count: 1 },
    },
    { $sort: { total_sum: -1 } },
    { $limit: 100 },
  ]);
});

test("emits only the five allowed read stages", () => {
  const pipeline = compile({
    dataset: "orders",
    select: ["region", "status"],
    measures: [{ id: "total", agg: "avg" }],
    filters: [{ field: "region", op: "in", value: ["EU", "US"] }],
    sort: [{ field: "region", dir: "asc" }],
    limit: 5,
  });
  const allowed = new Set(["$match", "$group", "$project", "$sort", "$limit"]);
  for (const stage of pipeline) {
    for (const key of Object.keys(stage)) {
      expect(allowed.has(key)).toBe(true);
    }
  }
});

test("no measures compiles a distinct query over dimensions", () => {
  const pipeline = compile({ dataset: "orders", select: ["status"] });
  expect(pipeline).toEqual([
    { $group: { _id: { status: "$status" } } },
    { $project: { _id: 0, status: "$_id.status" } },
    { $limit: 100 },
  ]);
});

test("no select groups on null (grand total)", () => {
  const pipeline = compile({
    dataset: "orders",
    measures: [{ id: "total", agg: "sum" }],
  });
  expect(pipeline[0]).toEqual({
    $group: { _id: null, total_sum: { $sum: "$total" } },
  });
});

test("dotted field paths compile to their source path, output keyed by id", () => {
  const pipeline = compile({
    dataset: "activities",
    select: ["stage", "channel"],
    measures: [{ id: "count", agg: "count" }],
    filters: [{ field: "stage", op: "eq", value: "open" }],
    sort: [{ field: "count_count", dir: "desc" }],
  });
  expect(pipeline).toEqual([
    { $match: { $and: [{ "status.stage": { $eq: "open" } }] } },
    {
      $group: {
        _id: { stage: "$status.stage", channel: "$source.channel" },
        count_count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        stage: "$_id.stage",
        channel: "$_id.channel",
        count_count: 1,
      },
    },
    { $sort: { count_count: -1 } },
    { $limit: 100 },
  ]);
});

test("a bucketed date dimension groups on $dateTrunc (no new stage)", () => {
  const pipeline = compile({
    dataset: "activities",
    select: ["created"],
    measures: [{ id: "count", agg: "count" }],
  });
  expect(pipeline[0]).toEqual({
    $group: {
      _id: {
        created: { $dateTrunc: { date: "$created.timestamp", unit: "month" } },
      },
      count_count: { $sum: 1 },
    },
  });
  const allowed = new Set(["$match", "$group", "$project", "$sort", "$limit"]);
  for (const stage of pipeline) {
    for (const key of Object.keys(stage)) expect(allowed.has(key)).toBe(true);
  }
});

test("contains filter escapes regex metacharacters", () => {
  const pipeline = compile({
    dataset: "orders",
    select: ["region"],
    filters: [{ field: "region", op: "contains", value: "a.b*(c" }],
  });
  expect(pipeline[0].$match.$and[0].region).toEqual({
    $regex: "a\\.b\\*\\(c",
    $options: "i",
  });
});
