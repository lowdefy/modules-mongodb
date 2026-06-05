// Mirrors the RESOLVED MQL of `resolve_action_link.yaml` (Part 42 D5).
//
// The YAML carries Lowdefy build-time operators (`_var` / `_module.var` for
// `app_name`) that only resolve at build time, so this test collapses
// `app_name` → `'demo'` (a literal) and transcribes the resulting `$addFields`
// as a plain JS object.
//
// The stage MUST run after a `visible_verbs` compute. Rather than importing the
// full visible_verbs pipeline, each test case supplies `visible_verbs` directly
// via a leading `$addFields` literal so that the verb booleans are fully
// controlled per case without dependency on the access-gate logic.

import { inMemoryMongo } from "../../../plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js";

const APP = "demo";

// Returns [inject_visible_verbs_stage, resolved_resolve_action_link_stage].
// The second stage is a faithful JS transcription of resolve_action_link.yaml
// with `app_name` collapsed to the APP literal.
function pipeline(visibleVerbs) {
  return [
    {
      $addFields: {
        visible_verbs: visibleVerbs,
      },
    },
    {
      $addFields: {
        link: {
          $let: {
            vars: {
              app_links: {
                $getField: {
                  field: "links",
                  input: {
                    $getField: {
                      field: APP,
                      input: "$$ROOT",
                    },
                  },
                },
              },
              verbs: "$visible_verbs",
            },
            in: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        "$$verbs.edit",
                        { $ne: ["$$app_links.edit", null] },
                      ],
                    },
                    then: "$$app_links.edit",
                  },
                  {
                    case: {
                      $and: [
                        "$$verbs.review",
                        { $ne: ["$$app_links.review", null] },
                      ],
                    },
                    then: "$$app_links.review",
                  },
                  {
                    case: {
                      $and: [
                        "$$verbs.error",
                        { $ne: ["$$app_links.error", null] },
                      ],
                    },
                    then: "$$app_links.error",
                  },
                  {
                    case: {
                      $and: [
                        "$$verbs.view",
                        { $ne: ["$$app_links.view", null] },
                      ],
                    },
                    then: "$$app_links.view",
                  },
                ],
                default: null,
              },
            },
          },
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

// Pre-child tracker shape: `edit` cell holds the start link; `view` is null
// (no child workflow yet). Tests Part 44's worked example.

test("pre-child tracker, user has edit: start link surfaced via edit cell", async () => {
  await actions.deleteMany({});
  const startLink = {
    pageId: "ticket-new",
    urlQuery: { action_id: "a1", entity_id: "ent-1", source: "onboarding" },
  };
  await actions.insertOne({
    _id: "a1",
    demo: {
      links: { view: null, edit: startLink, review: null, error: null },
    },
  });

  const [result] = await actions
    .aggregate(
      pipeline({ view: true, edit: true, review: false, error: false })
    )
    .toArray();

  expect(result.link).toEqual(startLink);
});

test("pre-child tracker, view-only user: link is null (view cell is null pre-child)", async () => {
  await actions.deleteMany({});
  const startLink = {
    pageId: "ticket-new",
    urlQuery: { action_id: "a1", entity_id: "ent-1", source: "onboarding" },
  };
  await actions.insertOne({
    _id: "a1",
    demo: {
      links: { view: null, edit: startLink, review: null, error: null },
    },
  });

  // edit not visible to this user — view cell is null so fallthrough → null.
  const [result] = await actions
    .aggregate(
      pipeline({ view: true, edit: false, review: false, error: false })
    )
    .toArray();

  expect(result.link).toBeNull();
});

test("started tracker: view cell holds child-overview link, view user sees it", async () => {
  await actions.deleteMany({});
  const childOverviewLink = {
    pageId: "workflows/workflow-overview",
    urlQuery: { workflow_id: "w-child" },
  };
  await actions.insertOne({
    _id: "a2",
    demo: {
      links: {
        view: childOverviewLink,
        edit: null,
        review: null,
        error: null,
      },
    },
  });

  const [result] = await actions
    .aggregate(
      pipeline({ view: true, edit: false, review: false, error: false })
    )
    .toArray();

  expect(result.link).toEqual(childOverviewLink);
});
