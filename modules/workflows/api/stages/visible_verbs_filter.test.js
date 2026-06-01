// Runs the shared role-gate oracle (gates.fixtures.js) through the resolved
// visible_verbs compute + drop MQL via mongodb-memory-server, asserting the
// aggregation runtime agrees with the oracle (Part 38 task 5/7 / Part 34 D12).
//
// The YAML stages (`../../../shared/workflow/visible_verbs.yaml` +
// `visible_verbs_filter.yaml`) carry Lowdefy operators (`_module.var`, `_user`,
// `_string.concat`) that only resolve at build time, so this test mirrors the
// RESOLVED MQL — `app_name` and the user roles substituted to literals — which
// is exactly what the build emits. The fixture oracle ties this runtime to the
// JS-helper (task 8) and load-gate (task 9) runtimes.

import { inMemoryMongo } from "../../../../plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js";
import gateCases from "../../resolvers/__fixtures__/gates.fixtures.js";

const APP = "demo";

// Resolved equivalent of one verb's $let/$or block in visible_verbs.yaml, with
// app_name → APP and the runtime `_user.apps.{APP}.roles` lookup → the literal
// userRoles array (with the YAML's `$ifNull → []` default applied).
function verbExpr(verb, userRoles) {
  return {
    $let: {
      vars: {
        gate: {
          $ifNull: [
            {
              $getField: {
                field: verb,
                input: {
                  $ifNull: [{ $getField: { field: APP, input: "$access" } }, {}],
                },
              },
            },
            [],
          ],
        },
        user_roles: { $ifNull: [userRoles ?? null, []] },
      },
      in: {
        $or: [
          { $eq: ["$$gate", true] },
          { $gt: [{ $size: { $setIntersection: ["$$gate", "$$user_roles"] } }, 0] },
        ],
      },
    },
  };
}

// Resolved [compute, drop] pipeline mirroring the two stage files.
function pipeline(userRoles) {
  return [
    {
      $addFields: {
        visible_verbs: {
          view: verbExpr("view", userRoles),
          edit: verbExpr("edit", userRoles),
          review: verbExpr("review", userRoles),
          error: verbExpr("error", userRoles),
        },
      },
    },
    {
      $match: {
        $expr: {
          $anyElementTrue: [
            [
              "$visible_verbs.view",
              "$visible_verbs.edit",
              "$visible_verbs.review",
              "$visible_verbs.error",
            ],
          ],
        },
      },
    },
  ];
}

let mongo;
let actions;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  actions = mongo.db.collection("actions");
});

afterAll(async () => {
  await mongo.cleanup();
});

// The gate is placed on the `view` verb; the other three verbs are absent (→
// false). So visible_verbs.view must equal the oracle's expected bool, and the
// $match drop must keep the doc iff expected (view is the only verb that can be
// true).
test.each(gateCases)(
  "visible_verbs aggregation matches the oracle: $name",
  async ({ gate, userRoles, expected }) => {
    await actions.deleteMany({});
    const accessBlock = gate === undefined ? {} : { view: gate };
    await actions.insertOne({ _id: "a1", access: { [APP]: accessBlock } });

    // Compute-only: assert the per-verb bool directly.
    const [computed] = await actions
      .aggregate([pipeline(userRoles)[0]])
      .toArray();
    expect(computed.visible_verbs).toEqual({
      view: expected,
      edit: false,
      review: false,
      error: false,
    });

    // Compute + drop: the doc survives iff some verb is true (here, view).
    const kept = await actions.aggregate(pipeline(userRoles)).toArray();
    expect(kept.length).toBe(expected ? 1 : 0);
  },
);

test("visible_verbs drop: an action with a true verb on a different slug survives only for that slug", async () => {
  await actions.deleteMany({});
  // `demo` grants nothing; `support` grants view to support-rep.
  await actions.insertOne({
    _id: "multi",
    access: { demo: {}, support: { view: ["support-rep"] } },
  });

  // As the demo app (no verb true) the action drops out.
  const asDemo = await actions.aggregate(pipeline(["support-rep"])).toArray();
  expect(asDemo.length).toBe(0);
});
