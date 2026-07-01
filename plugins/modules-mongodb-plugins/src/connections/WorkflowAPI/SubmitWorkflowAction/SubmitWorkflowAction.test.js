/**
 * Integration tests for SubmitWorkflowAction (task 15) — the single home for
 * Submit integration coverage. Drives the real resolver against an in-memory
 * Mongo (standalone, no transactions) with a mock callApi per the shipped
 * contract.
 *
 * Folds in the deleted worked-example.test.js (Part 30 rendered cells / sticky
 * display / per-verb links), event-id-round-trip.test.js (named block below),
 * and the salvageable handleSubmit.test.js integration behaviours (pre-hook
 * auxiliary + upsert spawn over the wire, form-data merge, completed_groups
 * with on_complete join).
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import SubmitWorkflowAction from "./SubmitWorkflowAction.js";

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

// `qualify` declares a review verb (submit → in-review; approve/request_changes
// from review). Per-verb access maps drive the load-phase gate + engine links.
// `kickoff` is review-less (submit → done). `notes` is a non-grouped action.
const STATUS_MAP = {
  qualify: {
    "in-review": {
      status_title: "In Review",
      "test-app": { message: "{{ type }} submitted" },
    },
    done: {
      status_title: "Done",
      "test-app": { message: "Approved" },
    },
    "changes-required": {
      status_title: "Changes Required",
    },
  },
};

function makeWorkflowsConfig({
  withGroups = false,
  withStatusMap = true,
} = {}) {
  return [
    {
      type: "onboarding",
      entity: { connection_id: "leads-collection", ref_key: "lead_ids" },
      starting_actions: [{ type: "qualify", status: "action-required" }],
      actions: [
        {
          type: "qualify",
          kind: "form",
          ...(withGroups ? { action_group: "g1" } : {}),
          // Part 48: the blob no longer carries status_map; the render_config
          // describe below drives it via the endpoint slice instead.
          ...(withStatusMap ? { status_map: STATUS_MAP.qualify } : {}),
          // review-app declares review; ops-app declares edit only.
          access: {
            "test-app": {
              view: true,
              edit: ["account-manager"],
              review: ["reviewer"],
              error: true,
            },
            "ops-app": { view: true, edit: ["ops"] },
          },
        },
        {
          type: "kickoff",
          kind: "form",
          ...(withGroups ? { action_group: "g1" } : {}),
          access: {
            "test-app": { view: true, edit: ["account-manager"] },
          },
        },
      ],
      ...(withGroups
        ? {
            action_groups: [
              { id: "g1", title: "Setup", on_complete: { signal: "progress" } },
            ],
          }
        : {}),
    },
  ];
}

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await clearMongoClientCache();
  await mongo.cleanup();
});

async function resetCollections() {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("events").deleteMany({});
}

async function seed({
  qualifyStage = "action-required",
  extraActions = [],
  workflowOverrides = {},
} = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id: "W1",
    workflow_type: "onboarding",
    entity: { connection_id: "leads-collection", id: "L1", ref_key: "lead_ids" },
    status: [{ stage: "active", event_id: "e0", created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 1 + extraActions.length },
    groups: [],
    form_data: {},
    created: changeStamp,
    updated: changeStamp,
    ...workflowOverrides,
  });
  await mongo.db.collection("actions").insertOne({
    _id: "A1",
    workflow_id: "W1",
    type: "qualify",
    kind: "form",
    key: null,
    action_group: null,
    status: [{ stage: qualifyStage, event_id: "e0", created: changeStamp }],
    metadata: {},
    created: changeStamp,
    updated: changeStamp,
  });
  for (const a of extraActions) {
    await mongo.db.collection("actions").insertOne({
      workflow_id: "W1",
      kind: "form",
      key: null,
      action_group: null,
      status: [
        { stage: "action-required", event_id: "e0", created: changeStamp },
      ],
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
      ...a,
    });
  }
}

/**
 * Shipped contract: callApi({ endpointId, payload }) — resolves the target's
 * :return value, throws on failure. Records calls; `failOn` forces a throw for
 * a given endpoint to exercise the post-commit dispatch-failure path.
 */
function makeCallApi({ failOn = null, calls = [] } = {}) {
  return async ({ endpointId, payload }) => {
    calls.push({ endpointId, payload });
    if (failOn === endpointId) {
      throw new Error(`forced failure: ${endpointId}`);
    }
    if (endpointId === "events/new-event") {
      await mongo.db.collection("events").insertOne({
        _id: payload._id,
        type: payload.type,
        display: payload.display,
        references: payload.references,
        metadata: payload.metadata,
        created: { timestamp: new Date() },
      });
      return { eventId: payload._id };
    }
    if (endpointId === "notifications/send-notification") {
      return null;
    }
    if (endpointId === "hooks/pre" || endpointId === "hooks/post") {
      return payload.__hookReturn ?? null;
    }
    throw new Error(`unexpected callApi: ${endpointId}`);
  };
}

function buildContext({
  request,
  app_name = "test-app",
  user = {
    id: "U1",
    profile: { name: "Test User" },
    roles: ["account-manager", "reviewer"],
  },
  callApi,
  workflowsConfig = makeWorkflowsConfig(),
  changeLog,
} = {}) {
  return {
    request,
    blockId: "test-block",
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
    connection: {
      databaseUri: mongo.uri,
      useTransactions: false,
      entry_id: "workflows",
      workflowsCollection: "workflows",
      actionsCollection: "actions",
      app_name,
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
      workflowsConfig,
      changeStamp,
      user,
      ...(changeLog ? { changeLog } : {}),
    },
    callApi: callApi ?? makeCallApi(),
  };
}

beforeEach(async () => {
  await clearMongoClientCache();
  await resetCollections();
});

// ─────────────────────────────────────────────────────────────────────────────
// Six-key payload + happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("handler return payload", () => {
  test("returns exactly the six keys", async () => {
    await seed();
    const result = await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    expect(Object.keys(result).sort()).toEqual(
      [
        "action_ids",
        "completed_groups",
        "event_id",
        "post_hook_response",
        "pre_hook_response",
        "tracker_fired",
      ].sort(),
    );
    expect(result.action_ids).toEqual(["A1"]);
    expect(typeof result.event_id).toBe("string");
    expect(result.tracker_fired).toEqual([]);
    // pre_hook_response is always the normalized PreHookResult, never null.
    expect(result.pre_hook_response).toEqual({
      actions: [],
      event_overrides: {},
      form_overrides: {},
    });
    expect(result.post_hook_response).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 30 worked-example: rendered cells, sticky display, per-verb links
// ─────────────────────────────────────────────────────────────────────────────

describe("Part 30 worked example", () => {
  test("rendered cell lands at the action doc top level (status_title + slug message)", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("in-review"); // hasReview → in-review
    expect(doc.status_title).toBe("In Review");
    expect(doc["test-app"].message).toBe("qualify submitted");
  });

  test("sticky display: the prior slug message persists across a transition that omits it", async () => {
    await seed();
    // submit → in-review writes the message.
    await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    // request_changes → changes-required (cell has status_title only, no message).
    await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "request_changes" } }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("changes-required");
    expect(doc.status_title).toBe("Changes Required");
    // Prior message sticks (sticky display, Q3).
    expect(doc["test-app"].message).toBe("qualify submitted");
  });

  test("per-verb engine links per stage×verb, read off the persisted access", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    // in-review stage: view + review pages exist; edit/error do not.
    expect(doc["test-app"].links.review).toEqual({
      pageId: "workflows/onboarding-qualify-review",
      urlQuery: { action_id: "A1" },
    });
    expect(doc["test-app"].links.view).toEqual({
      pageId: "workflows/onboarding-qualify-view",
      urlQuery: { action_id: "A1" },
    });
    expect(doc["test-app"].links.edit).toBeNull();
    // ops-app declares only view + edit; edit has no page at in-review.
    expect(doc["ops-app"].links.view).not.toBeNull();
    expect(doc["ops-app"].links.edit).toBeNull();
  });

  test("status_title persists when a later cell omits it", async () => {
    // changes-required cell sets status_title; then submit → in-review sets a new one.
    await seed({ qualifyStage: "changes-required" });
    await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status_title).toBe("In Review");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 48: status_map delivered via render_config, not the blob
// ─────────────────────────────────────────────────────────────────────────────
//
// The connection blob no longer carries status_map (dropped from
// makeWorkflowsConfig's ACTION_FIELDS, task 10). The write endpoints deliver it
// per-request as `request.render_config` (→ context.params.render_config), which
// loadWorkflowState splices onto the action config. These tests exercise the
// end-to-end render with the blob slice absent.

describe("Part 48: status_map from render_config (blob slice absent)", () => {
  test("blob carries no status_map but render_config delivers the cell → rendered onto the doc", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({
        workflowsConfig: makeWorkflowsConfig({ withStatusMap: false }),
        request: {
          action_id: "A1",
          signal: "submit",
          render_config: {
            onboarding: { qualify: { status_map: STATUS_MAP.qualify } },
          },
        },
      }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("in-review"); // hasReview → in-review
    expect(doc.status_title).toBe("In Review");
    expect(doc["test-app"].message).toBe("qualify submitted");
  });

  test("blob slice absent AND no render_config → falls through to default (no status_title, no message)", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({
        workflowsConfig: makeWorkflowsConfig({ withStatusMap: false }),
        request: { action_id: "A1", signal: "submit" },
      }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("in-review"); // transition still resolves
    // No cell anywhere — no rendered status_title/message is written.
    expect(doc.status_title).toBeUndefined();
    expect(doc["test-app"]?.message).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// event_id round trip (named block — folded from event-id-round-trip.test.js)
// ─────────────────────────────────────────────────────────────────────────────

describe("event_id round trip (one event_id per invocation)", () => {
  test("returned event_id equals the inserted event doc _id", async () => {
    await seed();
    const result = await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    const eventDoc = await mongo.db
      .collection("events")
      .findOne({ _id: result.event_id });
    expect(eventDoc).not.toBeNull();
    expect(eventDoc._id).toBe(result.event_id);
  });

  test("returned event_id equals every written action status[0].event_id", async () => {
    await seed();
    const result = await SubmitWorkflowAction(
      buildContext({ request: { action_id: "A1", signal: "submit" } }),
    );
    const actionDoc = await mongo.db
      .collection("actions")
      .findOne({ _id: "A1" });
    expect(actionDoc.status[0].event_id).toBe(result.event_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-verb access gate + hasReview resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("per-verb access gate", () => {
  test("submit requires the edit verb — granted for account-manager", async () => {
    await seed();
    await expect(
      SubmitWorkflowAction(
        buildContext({ request: { action_id: "A1", signal: "submit" } }),
      ),
    ).resolves.toBeDefined();
  });

  test("submit denied when the user lacks the edit role", async () => {
    await seed();
    await expect(
      SubmitWorkflowAction(
        buildContext({
          request: { action_id: "A1", signal: "submit" },
          user: { id: "U2", profile: { name: "No Edit" }, roles: ["reviewer"] },
        }),
      ),
    ).rejects.toMatchObject({ code: "access_denied" });
  });

  test("approve requires the review verb — granted for reviewer", async () => {
    await seed({ qualifyStage: "in-review" });
    await expect(
      SubmitWorkflowAction(
        buildContext({ request: { action_id: "A1", signal: "approve" } }),
      ),
    ).resolves.toBeDefined();
  });

  test("approve denied for a user without the review role", async () => {
    await seed({ qualifyStage: "in-review" });
    await expect(
      SubmitWorkflowAction(
        buildContext({
          request: { action_id: "A1", signal: "approve" },
          user: {
            id: "U3",
            profile: { name: "AM only" },
            roles: ["account-manager"],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "access_denied" });
  });

  test("resolve_error requires the error verb", async () => {
    await seed({ qualifyStage: "error" });
    await expect(
      SubmitWorkflowAction(
        buildContext({ request: { action_id: "A1", signal: "resolve_error" } }),
      ),
    ).resolves.toBeDefined();
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("in-review");
  });
});

describe("user-signal re-fire no-op safety", () => {
  test("re-firing approve on an already-done action rejects and leaves the action doc unmutated", async () => {
    // The action is already `done` (the terminal an approve lands on). Firing
    // `approve` again is a user signal the FSM maps to no transition from
    // `done`: it clears the per-verb access gate (the user has `review`) but
    // the plan phase throws signal_not_allowed BEFORE commitPlan runs, so
    // nothing is written. Pins the end-to-end no-op — a user re-fire mapping to
    // no transition must not append a status entry or otherwise mutate the doc.
    await seed({ qualifyStage: "done" });
    const before = await mongo.db.collection("actions").findOne({ _id: "A1" });
    await expect(
      SubmitWorkflowAction(
        buildContext({ request: { action_id: "A1", signal: "approve" } }),
      ),
    ).rejects.toMatchObject({ code: "signal_not_allowed" });
    const after = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(after.status).toHaveLength(1);
    expect(after).toEqual(before);
  });
});

describe("hasReview resolution is action-global", () => {
  test("submit from the review-declaring app lands in-review", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({
        request: { action_id: "A1", signal: "submit" },
        app_name: "test-app",
      }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("in-review");
  });

  test("submit from another app (ops-app) also lands in-review (action-global review)", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({
        request: { action_id: "A1", signal: "submit" },
        app_name: "ops-app",
        user: { id: "U4", profile: { name: "Ops User" }, roles: ["ops"] },
      }),
    );
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    // Even though ops-app declares no review verb, the action declares review
    // elsewhere → in-review for everyone.
    expect(doc.status[0].stage).toBe("in-review");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAS-miss retryable throw + retry-no-double-transition
// ─────────────────────────────────────────────────────────────────────────────

describe("concurrent submit (CAS)", () => {
  test("a concurrent workflow write between load and commit throws concurrent_submit", async () => {
    await seed();
    const calls = [];
    // Force a concurrent workflow write during the pre-hook (before commit).
    const callApi = async ({ endpointId, payload }) => {
      if (endpointId === "hooks/pre") {
        await mongo.db
          .collection("workflows")
          .updateOne(
            { _id: "W1" },
            { $set: { "updated.timestamp": new Date("2027-01-01T00:00:00Z") } },
          );
        return null;
      }
      return makeCallApi({ calls })({ endpointId, payload });
    };
    await expect(
      SubmitWorkflowAction(
        buildContext({
          request: {
            action_id: "A1",
            signal: "submit",
            hooks: { qualify: { submit: { pre: "hooks/pre" } } },
          },
          callApi,
        }),
      ),
    ).rejects.toMatchObject({ code: "concurrent_submit" });
  });

  test("retry after a CAS miss adds exactly one status entry (no double transition)", async () => {
    await seed();
    let firstAttempt = true;
    const callApi = async ({ endpointId, payload }) => {
      // On the first attempt's pre-hook, race the workflow so the commit misses.
      if (endpointId === "hooks/pre" && firstAttempt) {
        firstAttempt = false;
        await mongo.db
          .collection("workflows")
          .updateOne(
            { _id: "W1" },
            { $set: { "updated.timestamp": new Date("2027-01-01T00:00:00Z") } },
          );
        return null;
      }
      return makeCallApi()({ endpointId, payload });
    };

    const ctx = () =>
      buildContext({
        request: {
          action_id: "A1",
          signal: "submit",
          hooks: { qualify: { submit: { pre: "hooks/pre" } } },
        },
        callApi,
      });

    await expect(SubmitWorkflowAction(ctx())).rejects.toMatchObject({
      code: "concurrent_submit",
    });

    // Retry — second attempt's pre-hook does not race; commit succeeds.
    await SubmitWorkflowAction(ctx());

    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    // Started with one status entry; exactly one transition landed.
    expect(doc.status).toHaveLength(2);
    expect(doc.status[0].stage).toBe("in-review");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-hook auxiliary flows + form-data merge + completed_groups
// ─────────────────────────────────────────────────────────────────────────────

describe("pre-hook auxiliary signal flows", () => {
  test("auxiliary signal against another existing action transitions it over the wire", async () => {
    await seed({
      extraActions: [
        {
          _id: "A2",
          type: "kickoff",
          status: [
            { stage: "action-required", event_id: "e0", created: changeStamp },
          ],
        },
      ],
    });
    const callApi = makeCallApi();
    const result = await SubmitWorkflowAction(
      buildContext({
        request: {
          action_id: "A1",
          signal: "submit",
          hooks: { qualify: { submit: { pre: "hooks/pre" } } },
        },
        callApi: async ({ endpointId, payload }) => {
          if (endpointId === "hooks/pre")
            return { actions: [{ type: "kickoff", signal: "submit" }] };
          return callApi({ endpointId, payload });
        },
      }),
    );
    const a2 = await mongo.db.collection("actions").findOne({ _id: "A2" });
    expect(a2.status[0].stage).toBe("done"); // kickoff has no review → done
    expect(result.action_ids).toEqual(expect.arrayContaining(["A1", "A2"]));
  });

  test("auxiliary upsert spawns a missing keyed target over the wire", async () => {
    await seed();
    const result = await SubmitWorkflowAction(
      buildContext({
        request: {
          action_id: "A1",
          signal: "submit",
          hooks: { qualify: { submit: { pre: "hooks/pre" } } },
        },
        callApi: async ({ endpointId, payload }) => {
          if (endpointId === "hooks/pre") {
            return {
              actions: [
                {
                  type: "kickoff",
                  key: "k1",
                  signal: "activate",
                  upsert: true,
                  fields: { description: "spawned" },
                },
              ],
            };
          }
          return makeCallApi()({ endpointId, payload });
        },
      }),
    );
    const spawned = await mongo.db
      .collection("actions")
      .findOne({ type: "kickoff", key: "k1" });
    expect(spawned).not.toBeNull();
    expect(spawned.status[0].stage).toBe("action-required");
    expect(spawned.description).toBe("spawned");
    expect(result.action_ids).toContain(spawned._id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-workflow hooks re-slice (Part 48 D7): params.hooks arrives keyed by
// action type; handleSubmit re-slices to the loaded action's signal-keyed map.
// ─────────────────────────────────────────────────────────────────────────────

describe("action-type-keyed hooks re-slice", () => {
  test("an action with no hooks entry skips hooks entirely", async () => {
    await seed();
    const calls = [];
    // hooks keyed for kickoff only; target A1 is qualify → no hook call.
    const result = await SubmitWorkflowAction(
      buildContext({
        request: {
          action_id: "A1",
          signal: "submit",
          hooks: { kickoff: { submit: { pre: "hooks/pre" } } },
        },
        callApi: makeCallApi({ calls }),
      }),
    );
    expect(calls.some((c) => c.endpointId === "hooks/pre")).toBe(false);
    expect(result.pre_hook_response).toEqual({
      actions: [],
      event_overrides: {},
      form_overrides: {},
    });
  });

  test("two actions hooked on the same signal do not collide — each fires its own", async () => {
    const hooks = {
      qualify: { submit: { pre: "hooks/pre-qualify" } },
      kickoff: { submit: { pre: "hooks/pre-kickoff" } },
    };
    const makeHookAwareCallApi =
      (calls) =>
      async ({ endpointId, payload }) => {
        if (
          endpointId === "hooks/pre-qualify" ||
          endpointId === "hooks/pre-kickoff"
        ) {
          calls.push({ endpointId, payload });
          return null;
        }
        return makeCallApi({ calls })({ endpointId, payload });
      };

    // Submit qualify (A1) → only the qualify hook fires.
    await seed({
      extraActions: [
        {
          _id: "A2",
          type: "kickoff",
          status: [
            { stage: "action-required", event_id: "e0", created: changeStamp },
          ],
        },
      ],
    });
    const qualifyCalls = [];
    await SubmitWorkflowAction(
      buildContext({
        request: { action_id: "A1", signal: "submit", hooks },
        callApi: makeHookAwareCallApi(qualifyCalls),
      }),
    );
    expect(qualifyCalls.some((c) => c.endpointId === "hooks/pre-qualify")).toBe(
      true,
    );
    expect(qualifyCalls.some((c) => c.endpointId === "hooks/pre-kickoff")).toBe(
      false,
    );

    // Submit kickoff (A2) → only the kickoff hook fires.
    const kickoffCalls = [];
    await SubmitWorkflowAction(
      buildContext({
        request: { action_id: "A2", signal: "submit", hooks },
        callApi: makeHookAwareCallApi(kickoffCalls),
      }),
    );
    expect(kickoffCalls.some((c) => c.endpointId === "hooks/pre-kickoff")).toBe(
      true,
    );
    expect(kickoffCalls.some((c) => c.endpointId === "hooks/pre-qualify")).toBe(
      false,
    );
  });
});

describe("form-data merge end to end", () => {
  test("submitted form merges into form_data[type] on the workflow doc", async () => {
    await seed();
    await SubmitWorkflowAction(
      buildContext({
        request: {
          action_id: "A1",
          signal: "submit",
          form: { score: 9, notes: "ok" },
        },
      }),
    );
    const wf = await mongo.db.collection("workflows").findOne({ _id: "W1" });
    expect(wf.form_data.qualify).toEqual({ score: 9, notes: "ok" });
  });
});

describe("completed_groups with on_complete join", () => {
  test("a submit that completes a group returns completed_groups with on_complete", async () => {
    // Both grouped actions terminal after this submit: qualify (review-less here
    // via approve) + kickoff already done.
    await seed({
      workflowOverrides: {
        groups: [
          {
            id: "g1",
            status: "in-progress",
            summary: { done: 1, not_required: 0, total: 2 },
          },
        ],
      },
      qualifyStage: "in-review",
      extraActions: [
        {
          _id: "A2",
          type: "kickoff",
          action_group: "g1",
          status: [{ stage: "done", event_id: "e0", created: changeStamp }],
        },
      ],
    });
    // Patch qualify into the group too.
    await mongo.db
      .collection("actions")
      .updateOne({ _id: "A1" }, { $set: { action_group: "g1" } });

    const result = await SubmitWorkflowAction(
      buildContext({
        request: { action_id: "A1", signal: "approve" },
        workflowsConfig: makeWorkflowsConfig({ withGroups: true }),
      }),
    );
    expect(result.completed_groups).toEqual([
      { workflow_id: "W1", id: "g1", on_complete: { signal: "progress" } },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-commit dispatch failure
// ─────────────────────────────────────────────────────────────────────────────

describe("post-commit dispatch failure", () => {
  test("a forced event-dispatch failure still runs the post-hook, then throws post_commit_dispatch_failed", async () => {
    await seed();
    const calls = [];
    const callApi = makeCallApi({ failOn: "events/new-event", calls });

    await expect(
      SubmitWorkflowAction(
        buildContext({
          request: {
            action_id: "A1",
            signal: "submit",
            hooks: { qualify: { submit: { post: "hooks/post" } } },
          },
          callApi,
        }),
      ),
    ).rejects.toMatchObject({ code: "post_commit_dispatch_failed" });

    // The commit's step 1/2 writes still landed (durable).
    const doc = await mongo.db.collection("actions").findOne({ _id: "A1" });
    expect(doc.status[0].stage).toBe("in-review");
    // The post-hook ran before the throw.
    expect(calls.some((c) => c.endpointId === "hooks/post")).toBe(true);
  });

  test("the thrown error states the commit succeeded, names the failed step, and chains the cause", async () => {
    await seed();
    const callApi = makeCallApi({ failOn: "events/new-event" });
    let thrown;
    try {
      await SubmitWorkflowAction(
        buildContext({
          request: { action_id: "A1", signal: "submit" },
          callApi,
        }),
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("post_commit_dispatch_failed");
    expect(thrown.message).toMatch(/committed successfully/);
    expect(thrown.message).toMatch(/step 3/);
    expect(thrown.cause).toBeInstanceOf(Error);
    expect(thrown.cause.message).toMatch(/forced failure/);
  });
});
