import validatePipeline from "./validatePipeline.js";
import {
  MAX_ARRAY_LITERAL_LENGTH,
  MAX_PIPELINE_STAGES,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_SAMPLE_SIZE,
  PIPELINE_RESULT_CAP,
} from "./constants.js";

// Small local catalog fixture: one open collection, one role-gated, one
// relationship between them (task 6 converts testDatasets.js wholesale).
const catalog = {
  demo_orders: {
    description: "Orders placed by companies.",
    fields: {
      total: { type: "number", format: "currency", currency: "USD" },
      region: { type: "string" },
      status: { type: "string", values: ["paid", "pending"] },
      company_id: { type: "string" },
      created_at: { type: "date" },
    },
    relationships: [
      {
        field: "company_id",
        collection: "demo_companies",
        foreignField: "_id",
      },
    ],
  },
  demo_companies: {
    roles: ["analyst"],
    description: "Companies.",
    fields: {
      _id: { type: "string" },
      name: { type: "string" },
      region: { type: "string" },
    },
  },
};

const roles = ["analyst"];

function validate(pipeline, overrides = {}) {
  return validatePipeline({
    collection: "demo_orders",
    pipeline,
    catalog,
    roles,
    ...overrides,
  });
}

// ── JS / eval — the validator is the sole defense ────────────────────────────

test("$match $where is rejected", () => {
  expect(() => validate([{ $match: { $where: "sleep(1000)" } }])).toThrow(
    /\$where/,
  );
});

test("$match $expr containing $function is rejected", () => {
  expect(() =>
    validate([
      { $match: { $expr: { $function: { body: "x", args: [], lang: "js" } } } },
    ]),
  ).toThrow(/\$function/);
});

test("$where as a field key in a filter-built $match is rejected", () => {
  // A filter triple posting field: "$where" would build this shape.
  expect(() =>
    validate([{ $match: JSON.parse('{"$where": {"$eq": 1}}') }]),
  ).toThrow(/\$where/);
});

test.each([
  [
    "$group._id",
    [{ $group: { _id: { $function: { body: "x" } }, n: { $sum: 1 } } }],
  ],
  [
    "$bucket.output",
    [
      {
        $bucket: {
          groupBy: "$total",
          boundaries: [0, 100],
          output: { bad: { $accumulator: { init: "x" } } },
        },
      },
    ],
  ],
  [
    "$setWindowFields.output",
    [
      {
        $setWindowFields: {
          sortBy: { total: 1 },
          output: { bad: { $function: { body: "x" } } },
        },
      },
    ],
  ],
  [
    "$replaceRoot.newRoot",
    [{ $replaceRoot: { newRoot: { $function: { body: "x" } } } }],
  ],
])("JS operator buried in %s is rejected", (_position, pipeline) => {
  expect(() => validate(pipeline)).toThrow(/\$function|\$accumulator/);
});

// ── Query-document grammar (§3b) ─────────────────────────────────────────────

test("mixed operator document fails even though $gt alone is allowed", () => {
  expect(() =>
    validate([{ $match: { total: { $gt: 1, $where: "x" } } }]),
  ).toThrow(/\$where/);
  expect(() =>
    validate([{ $match: { total: { $gt: 1, note: "x" } } }]),
  ).toThrow(/mix/);
});

test("literal-position $-keys fail closed", () => {
  expect(() =>
    validate([{ $match: { meta: { a: { $where: "x" } } } }]),
  ).toThrow(/literal match value/);
  // Filter triple posting value { $gt: … } lands in literal operand position.
  expect(() => validate([{ $match: { total: { $eq: { $gt: 1 } } } }])).toThrow(
    /literal match value/,
  );
});

test("$elemMatch recurses both forms; $not takes an operator document", () => {
  const result = validate([
    {
      $match: {
        a: { $elemMatch: { $gt: 5 } },
        b: { $elemMatch: { status: "paid", total: { $gte: 8 } } },
        c: { $not: { $in: ["x"] } },
      },
    },
  ]);
  expect(result.pipeline[0].$match.a.$elemMatch).toEqual({ $gt: 5 });
  expect(() =>
    validate([{ $match: { a: { $elemMatch: { $where: "x" } } } }]),
  ).toThrow(/\$where/);
  expect(() => validate([{ $match: { a: { $not: "plain" } } }])).toThrow(
    /\$not/,
  );
});

test("bare non-logical operators at query top level are rejected", () => {
  expect(() => validate([{ $match: { $gt: 1 } }])).toThrow(/top level/);
});

// ── Allowlist-bypass and prototype keys ──────────────────────────────────────

test("prototype-resolving keys are rejected as operators", () => {
  expect(() =>
    validate([
      { $match: { total: JSON.parse('{"$gt": 1, "constructor": 1}') } },
    ]),
  ).toThrow(/constructor/);
  expect(() => validate([{ $project: { a: { constructor: 1 } } }])).toThrow(
    /constructor/,
  );
  expect(() =>
    validate([{ $match: { total: { $gt: 1, toString: 1 } } }]),
  ).toThrow(/mix/);
});

test("__proto__ as a key is rejected anywhere, including inside $literal", () => {
  expect(() => validate([{ $match: JSON.parse('{"__proto__": 1}') }])).toThrow(
    /__proto__/,
  );
  expect(() =>
    validate([{ $project: JSON.parse('{"a": {"__proto__": {"x": 1}}}') }]),
  ).toThrow(/__proto__/);
  expect(() =>
    validate([
      { $project: { a: { $literal: JSON.parse('{"__proto__": 1}') } } },
    ]),
  ).toThrow(/__proto__/);
});

// ── Variables and lexical scope ──────────────────────────────────────────────

test("system infra variables are rejected; $$NOW passes", () => {
  expect(() => validate([{ $project: { r: "$$USER_ROLES" } }])).toThrow(
    /\$\$USER_ROLES/,
  );
  expect(() => validate([{ $project: { t: "$$CLUSTER_TIME" } }])).toThrow(
    /\$\$CLUSTER_TIME/,
  );
  const result = validate([{ $project: { now: "$$NOW" } }]);
  expect(result.pipeline[0].$project.now).toBe("$$NOW");
});

test("let-bound vars pass inside their binding and fail outside it", () => {
  const bound = validate([
    {
      $project: {
        x: {
          $let: { vars: { unit: 10 }, in: { $multiply: ["$$unit", "$total"] } },
        },
      },
    },
  ]);
  expect(bound.pipeline[0].$project.x.$let.in).toEqual({
    $multiply: ["$$unit", "$total"],
  });
  expect(() =>
    validate([
      {
        $project: {
          x: {
            $add: [
              { $let: { vars: { unit: 10 }, in: "$$unit" } },
              "$$unit", // outside the $let that binds it
            ],
          },
        },
      },
    ]),
  ).toThrow(/\$\$unit/);
});

test("$map default binds $$this; $lookup.let binds inside the sub-pipeline", () => {
  const mapped = validate([
    {
      $project: {
        doubled: {
          $map: { input: "$items", in: { $multiply: ["$$this", 2] } },
        },
      },
    },
  ]);
  expect(mapped.pipeline[0].$project.doubled.$map.in).toEqual({
    $multiply: ["$$this", 2],
  });
  const looked = validate([
    {
      $lookup: {
        from: "demo_companies",
        let: { cid: "$company_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$cid"] } } }],
        as: "company",
      },
    },
  ]);
  expect(looked.pipeline[0].$lookup.pipeline[0].$match.$expr).toEqual({
    $eq: ["$_id", "$$cid"],
  });
  expect(() => validate([{ $project: { x: "$$cid" } }])).toThrow(/\$\$cid/);
});

// ── Resource caps ────────────────────────────────────────────────────────────

test("$in over the array cap is rejected", () => {
  const values = Array.from(
    { length: MAX_ARRAY_LITERAL_LENGTH + 1 },
    (_, i) => i,
  );
  expect(() => validate([{ $match: { total: { $in: values } } }])).toThrow(
    /\$in/,
  );
});

test("pathological nesting fails with a validation error, not a stack overflow", () => {
  let query = { total: 1 };
  for (let i = 0; i < 100000; i += 1) query = { $and: [query] };
  expect(() => validate([{ $match: query }])).toThrow(/Invalid pipeline/);

  let expression = { $add: [1, 1] };
  for (let i = 0; i < 100000; i += 1) expression = { $add: [expression, 1] };
  expect(() => validate([{ $project: { x: expression } }])).toThrow(
    /Invalid pipeline/,
  );
});

test("stage count cap includes sub-pipeline stages", () => {
  const stages = Array.from({ length: MAX_PIPELINE_STAGES + 1 }, () => ({
    $match: { status: "paid" },
  }));
  expect(() => validate(stages)).toThrow(/stages/);
});

test("$sample.size and regex pattern/flags are capped", () => {
  expect(() => validate([{ $sample: { size: MAX_SAMPLE_SIZE + 1 } }])).toThrow(
    /\$sample/,
  );
  expect(() =>
    validate([
      {
        $match: {
          region: { $regex: "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1) },
        },
      },
    ]),
  ).toThrow(/pattern/);
  expect(() =>
    validate([{ $match: { region: { $regex: "a", $options: "x" } } }]),
  ).toThrow(/flag/);
});

// ── $literal opt-out ─────────────────────────────────────────────────────────

test("$literal wrapping operator-shaped data passes and survives verbatim", () => {
  const payload = { $where: "x", nested: [{ $function: 1 }] };
  const result = validate([{ $project: { raw: { $literal: payload } } }]);
  expect(result.pipeline[0].$project.raw.$literal).toEqual(payload);
  expect(result.pipeline[0].$project.raw.$literal).not.toBe(payload);
});

// ── Collection scoping and authorization ─────────────────────────────────────

test("$lookup.from outside the catalog is rejected with available names", () => {
  expect(() =>
    validate([
      {
        $lookup: {
          from: "secrets",
          localField: "a",
          foreignField: "b",
          as: "x",
        },
      },
    ]),
  ).toThrow(/demo_orders, demo_companies/);
});

test("$lookup.from must be a string", () => {
  expect(() =>
    validate([
      {
        $lookup: {
          from: { $gt: "" },
          localField: "a",
          foreignField: "b",
          as: "x",
        },
      },
    ]),
  ).toThrow(/from/);
});

test("role-gated collections require the role, directly and via nested $lookup", () => {
  expect(() =>
    validatePipeline({
      collection: "demo_companies",
      pipeline: [],
      catalog,
      roles: [],
    }),
  ).toThrow(/not authorized.*demo_companies/);
  const nested = [
    {
      $lookup: {
        from: "demo_companies",
        localField: "company_id",
        foreignField: "_id",
        as: "company",
      },
    },
  ];
  expect(() => validate(nested, { roles: [] })).toThrow(
    /not authorized.*demo_companies/,
  );
  expect(() => validate(nested)).not.toThrow();
});

test("$merge inside a $lookup sub-pipeline is rejected", () => {
  expect(() =>
    validate([
      {
        $lookup: {
          from: "demo_companies",
          pipeline: [{ $merge: { into: "demo_orders" } }],
          as: "x",
        },
      },
    ]),
  ).toThrow(/\$merge/);
});

test.each([
  ["top level", (stage) => [stage]],
  [
    "$lookup.pipeline",
    (stage) => [
      { $lookup: { from: "demo_companies", pipeline: [stage], as: "x" } },
    ],
  ],
  ["$facet branch", (stage) => [{ $facet: { branch: [stage] } }]],
])("deferred stages are rejected in %s", (_where, wrap) => {
  for (const stage of [
    { $unionWith: "demo_companies" },
    { $graphLookup: { from: "demo_companies" } },
    { $densify: { field: "created_at" } },
  ]) {
    expect(() => validate(wrap(stage))).toThrow(/not enabled/);
  }
});

// ── Mandatory result cap ─────────────────────────────────────────────────────

test("an agent-supplied $limit does not defeat the appended cap", () => {
  const result = validate([{ $limit: 100000 }]);
  expect(result.pipeline).toEqual([
    { $limit: 100000 },
    { $limit: PIPELINE_RESULT_CAP },
  ]);
});

test("every $facet branch ends in the result cap", () => {
  const result = validate([
    {
      $facet: {
        byRegion: [{ $sortByCount: "$region" }],
        totals: [{ $group: { _id: null, n: { $sum: 1 } } }],
      },
    },
  ]);
  for (const branch of Object.values(result.pipeline[0].$facet)) {
    expect(branch[branch.length - 1]).toEqual({ $limit: PIPELINE_RESULT_CAP });
  }
  expect(result.pipeline[result.pipeline.length - 1]).toEqual({
    $limit: PIPELINE_RESULT_CAP,
  });
});

// ── Happy path and reconstruction ────────────────────────────────────────────

test("the design's example pipeline passes and is a freshly built tree", () => {
  const lookup = {
    from: "demo_companies",
    localField: "company_id",
    foreignField: "_id",
    as: "company",
  };
  const group = { _id: "$company.region", n: { $sum: 1 } };
  const input = [
    { $lookup: lookup },
    { $unwind: "$company" },
    { $group: group },
    { $sort: { n: -1 } },
    { $limit: 20 },
  ];
  const result = validate(input);
  expect(result.collection).toBe("demo_orders");
  expect(result.pipeline).toEqual([...input, { $limit: PIPELINE_RESULT_CAP }]);
  // Reconstruct, don't forward: no node of the output is an input node.
  expect(result.pipeline).not.toBe(input);
  expect(result.pipeline[0]).not.toBe(input[0]);
  expect(result.pipeline[0].$lookup).not.toBe(lookup);
  expect(result.pipeline[2].$group).not.toBe(group);
});

test("mutating the input after validation cannot affect the returned pipeline", () => {
  const input = [
    { $match: { status: "paid" } },
    { $group: { _id: "$region", n: { $sum: 1 } } },
  ];
  const result = validate(input);
  const snapshot = JSON.parse(JSON.stringify(result.pipeline));
  input[0].$match.$where = "sleep(1000)";
  input[1].$group.n = { $function: { body: "x" } };
  expect(result.pipeline).toEqual(snapshot);
});

test("BSON-deserialized opaque scalars (Date) are copied as-is", () => {
  const since = new Date("2026-01-01T00:00:00Z");
  const result = validate([{ $match: { created_at: { $gte: since } } }]);
  expect(result.pipeline[0].$match.created_at.$gte).toBe(since);
});

test("error messages name the offending operator", () => {
  expect(() => validate([{ $out: "x" }])).toThrow(/\$out/);
  expect(() => validate([{ $collStats: {} }])).toThrow(/\$collStats/);
  expect(() => validate([{ $project: { x: { $rand: {} } } }])).toThrow(
    /\$rand/,
  );
});
