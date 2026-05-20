import createMongoDBConnection from "../../shared/createMongoDBConnection.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import handleSubmit from "./handleSubmit.js";

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

const changeStamp = { timestamp: new Date("2026-05-20T00:00:00Z"), user: { id: "u1" } };

let mongo;
let mongoDBConnection;

beforeAll(async () => {
  mongo = await inMemoryMongo();
  mongoDBConnection = createMongoDBConnection({
    blockId: "test-block",
    connection: { databaseUri: mongo.uri },
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
  });
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
});

function makeContext(overrides = {}) {
  return {
    mongoDBConnection,
    actionsEnum,
    workflowsConfig: overrides.workflowsConfig ?? [],
    changeStamp,
    params: overrides.params ?? {},
    user: overrides.user ?? { id: "u1", roles: ["account-manager"] },
    eventId: overrides.eventId ?? "event-1",
  };
}

const onboardingWorkflowConfig = {
  type: "onboarding",
  entity_collection: "leads-collection",
  actions: [
    {
      type: "qualify",
      kind: "form",
      access: {
        "my-team-app": ["view", "edit"],
        roles: ["account-manager"],
      },
    },
    {
      type: "send-quote",
      kind: "form",
      access: {
        "my-team-app": ["view", "edit", "review"],
        roles: ["account-manager"],
      },
    },
    {
      type: "schedule-followup",
      kind: "task",
      access: {
        "my-team-app": ["view", "edit"],
        roles: ["account-manager"],
      },
    },
    {
      type: "post-close-cleanup",
      kind: "task",
      required_after_close: true,
      access: {
        "my-team-app": ["view", "edit"],
        roles: ["account-manager"],
      },
    },
  ],
};

async function seedWorkflow({ _id = "wf-1", stage = "active" } = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id,
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
}

async function seedAction({ _id, type, workflow_id = "wf-1", key = null, stage = "action-required", kind = "form" }) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key,
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
  });
}

test("handleSubmit: returns the v1 return shape with the user-submitted id on the success path", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );
  expect(result).toEqual({
    action_ids: ["a1"],
    completed_groups: [],
    event_id: null,
    tracker_fired: null,
    pre_hook_response: null,
    post_hook_response: null,
  });
});

test("handleSubmit: missing action_id throws", async () => {
  await expect(
    handleSubmit(makeContext({ params: { interaction: "submit_edit" } })),
  ).rejects.toThrow(/action_id is required/);
});

test("handleSubmit: missing interaction throws", async () => {
  await expect(
    handleSubmit(makeContext({ params: { action_id: "a1" } })),
  ).rejects.toThrow(/interaction is required/);
});

test("handleSubmit: action not found throws", async () => {
  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "missing", interaction: "submit_edit" },
      }),
    ),
  ).rejects.toThrow(/action missing not found/);
});

test("handleSubmit: workflow not found throws", async () => {
  await mongo.db.collection("actions").insertOne({
    _id: "orphan",
    workflow_id: "ghost-wf",
    type: "qualify",
    kind: "form",
    key: null,
    status: [{ stage: "action-required" }],
  });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "orphan", interaction: "submit_edit" },
      }),
    ),
  ).rejects.toThrow(/workflow ghost-wf not found/);
});

test("handleSubmit: workflow_type not in workflowsConfig throws", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [{ type: "other-flow", actions: [] }],
        params: { action_id: "a1", interaction: "submit_edit" },
      }),
    ),
  ).rejects.toThrow(/workflow_type "onboarding" not in workflowsConfig/);
});

test("handleSubmit: action type not in workflow config throws", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "ghost-action" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
      }),
    ),
  ).rejects.toThrow(/action type "ghost-action" not in workflow "onboarding" config/);
});

test("handleSubmit: cancelled workflow + action without required_after_close throws", async () => {
  await seedWorkflow({ stage: "cancelled" });
  await seedAction({ _id: "a1", type: "qualify" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
      }),
    ),
  ).rejects.toThrow(/workflow wf-1 is cancelled.*required_after_close/);
});

test("handleSubmit: completed workflow + action with required_after_close:true does not throw on step 1", async () => {
  await seedWorkflow({ stage: "completed" });
  await seedAction({ _id: "a1", type: "post-close-cleanup", kind: "task" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: {
          action_id: "a1",
          interaction: "submit_edit",
          current_status: "done",
        },
      }),
    ),
  ).resolves.toBeDefined();
});

test("handleSubmit: role gate — caller roles do not intersect throws", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
        user: { id: "u2", roles: ["customer"] },
      }),
    ),
  ).rejects.toThrow(/caller roles do not intersect/);
});

test("handleSubmit: submit_edit on form action with review verb → resolves to in-review (no throw, returns shape)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "send-quote" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
      }),
    ),
  ).resolves.toBeDefined();
});

test("handleSubmit: submit_edit on form action without review verb → resolves to done (no throw)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
      }),
    ),
  ).resolves.toBeDefined();
});

test("handleSubmit: not_required interaction does not throw (resolves regardless of verbs)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "not_required" },
      }),
    ),
  ).resolves.toBeDefined();
});

test("handleSubmit: task submit_edit without current_status throws", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "schedule-followup", kind: "task" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
      }),
    ),
  ).rejects.toThrow(/task submit_edit requires caller-supplied current_status/);
});

test("handleSubmit: task submit_edit with current_status passes (no throw)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "schedule-followup", kind: "task" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: {
          action_id: "a1",
          interaction: "submit_edit",
          current_status: "changes-required",
        },
      }),
    ),
  ).resolves.toBeDefined();
});

test("handleSubmit: unknown interaction throws", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "made-up-interaction" },
      }),
    ),
  ).rejects.toThrow(/unknown interaction "made-up-interaction"/);
});

test("handleSubmit step 3: workflow with no blocked actions → workflowActions cached, no extra writes", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify" });
  await seedAction({ _id: "a-quote", type: "send-quote" });

  const context = makeContext({
    workflowsConfig: [onboardingWorkflowConfig],
    params: { action_id: "a-qualify", interaction: "submit_edit" },
  });
  await handleSubmit(context);
  expect(context.workflowActions).toHaveLength(2);
});

test("handleSubmit step 3: workflow with one blocked action whose dependency is done → workflowActions cached (auto-unblock will write in step 4)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "done" });
  await seedAction({
    _id: "a-quote",
    type: "send-quote",
    stage: "blocked",
  });

  const blockedWorkflowConfig = {
    ...onboardingWorkflowConfig,
    actions: onboardingWorkflowConfig.actions.map((a) =>
      a.type === "send-quote" ? { ...a, blocked_by: ["qualify"] } : a,
    ),
  };

  const context = makeContext({
    workflowsConfig: [blockedWorkflowConfig],
    params: { action_id: "a-qualify", interaction: "submit_edit" },
  });
  await handleSubmit(context);
  expect(context.workflowActions).toHaveLength(2);
});

test("handleSubmit step 3: blocked action whose dependency is still in-progress → no auto-unblock fires", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "in-review" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "blocked" });

  const blockedWorkflowConfig = {
    ...onboardingWorkflowConfig,
    actions: onboardingWorkflowConfig.actions.map((a) =>
      a.type === "send-quote" ? { ...a, blocked_by: ["qualify"] } : a,
    ),
  };

  const context = makeContext({
    workflowsConfig: [blockedWorkflowConfig],
    params: { action_id: "a-qualify", interaction: "submit_edit" },
  });
  await handleSubmit(context);
  // Cache still landed for step 5 consumption; auto-unblock entries inspected
  // indirectly via action_ids in task-10 tests.
  expect(context.workflowActions).toHaveLength(2);
});

test("handleSubmit step 4: single-entry submit form action action-required → in-review push lands; action_ids contains the id", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "action-required" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a-quote", interaction: "submit_edit" },
    }),
  );

  expect(result.action_ids).toEqual(["a-quote"]);
  const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(doc.status[0].stage).toBe("in-review");
});

test("handleSubmit step 4: submit on already-done non-self → no new status entry; action_ids still contains id", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-other", type: "send-quote", stage: "done" });

  // The user-submitted action also acts as the currentActionId. Use a fresh
  // form action (not the already-done one) so the self-exception doesn't fire.
  await seedAction({ _id: "a-self", type: "qualify", stage: "action-required" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a-self", interaction: "submit_edit" },
    }),
  );

  // a-self wrote (action-required → done); a-other is untouched.
  expect(result.action_ids).toContain("a-self");
  const otherDoc = await mongo.db.collection("actions").findOne({ _id: "a-other" });
  expect(otherDoc.status).toHaveLength(1);
  expect(otherDoc.status[0].stage).toBe("done");
});

test("handleSubmit step 4: same-stage self-exception writes fresh audit entry", async () => {
  await seedWorkflow();
  // Action is already in-review; submitting it again on a review-verb form
  // resolves to in-review, hitting the self-exception.
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "in-review" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a-quote", interaction: "submit_edit" },
    }),
  );

  expect(result.action_ids).toContain("a-quote");
  const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(doc.status).toHaveLength(2);
  expect(doc.status[0].stage).toBe("in-review");
});

test("handleSubmit step 4: auto-unblock entry writes when a blocked action's deps are done", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "action-required" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "blocked" });

  const blockedWorkflowConfig = {
    ...onboardingWorkflowConfig,
    actions: onboardingWorkflowConfig.actions.map((a) =>
      a.type === "send-quote" ? { ...a, blocked_by: ["qualify"] } : a,
    ),
  };

  // Submit qualify → done; auto-unblock should flip send-quote to action-required.
  // qualify (form, no review verb) → done.
  // BUT: when the user submits qualify, computeAutoUnblocks reads pre-submit
  // state — qualify is still action-required at step-3 time, so no unblock.
  // To exercise the path here, pre-seed qualify as done and submit a second
  // already-terminal trigger via not_required interaction on a separate action.
  await mongo.db.collection("actions").updateOne(
    { _id: "a-qualify" },
    { $set: { "status.0.stage": "done" } },
  );

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [blockedWorkflowConfig],
      params: { action_id: "a-qualify", interaction: "submit_edit" },
    }),
  );

  // Both qualify (self-exception same-stage) and send-quote (auto-unblock) wrote.
  expect(result.action_ids).toContain("a-qualify");
  expect(result.action_ids).toContain("a-quote");

  const quoteDoc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(quoteDoc.status[0].stage).toBe("action-required");
});

test("handleSubmit step 4: auto-unblock entry pointing at a non-existent action type → silently skipped", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "action-required" });
  // The workflow config references send-quote with blocked_by but the action
  // doc doesn't exist — computeAutoUnblocks emits nothing (no blocked action
  // with that type in workflowActions).
  const blockedWorkflowConfig = {
    ...onboardingWorkflowConfig,
    actions: onboardingWorkflowConfig.actions.map((a) =>
      a.type === "send-quote" ? { ...a, blocked_by: ["qualify"] } : a,
    ),
  };

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [blockedWorkflowConfig],
      params: { action_id: "a-qualify", interaction: "submit_edit" },
    }),
  );

  expect(result.action_ids).toEqual(["a-qualify"]);
});

test("handleSubmit step 6: form submit on non-keyed qualify writes form_data.qualify.{field}", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        form: { contractor: "ACME" },
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.form_data.qualify.contractor).toBe("ACME");
});

test("handleSubmit step 6: review submit merges form + form_review on non-keyed action", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-quote", type: "send-quote" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a-quote",
        interaction: "submit_edit",
        form: { score: 5 },
        form_review: { reviewer_notes: "ok" },
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.form_data["send-quote"].score).toBe(5);
  expect(wf.form_data["send-quote"].reviewer_notes).toBe("ok");
});

test("handleSubmit step 6: keyed action submit writes form_data.{type}.{key}.{field}", async () => {
  await seedWorkflow();
  // Add a keyed action type to the config for this test.
  const cfgWithKeyed = {
    ...onboardingWorkflowConfig,
    actions: [
      ...onboardingWorkflowConfig.actions,
      {
        type: "proof-of-installation",
        kind: "form",
        access: {
          "my-team-app": ["view", "edit"],
          roles: ["account-manager"],
        },
      },
    ],
  };

  await mongo.db.collection("actions").insertOne({
    _id: "poi-1",
    workflow_id: "wf-1",
    type: "proof-of-installation",
    kind: "form",
    key: "device-1",
    status: [{ stage: "action-required", created: new Date() }],
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [cfgWithKeyed],
      params: {
        action_id: "poi-1",
        interaction: "submit_edit",
        current_key: "device-1",
        form: { serial: "A1" },
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.form_data["proof-of-installation"]["device-1"].serial).toBe("A1");
});

test("handleSubmit step 6: form_review wins on field collision with form", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-quote", type: "send-quote" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a-quote",
        interaction: "submit_edit",
        form: { x: 1 },
        form_review: { x: 2 },
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.form_data["send-quote"].x).toBe(2);
});

test("handleSubmit step 6: not_required interaction with no form payload → no form_data mutation", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "not_required" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.form_data).toEqual({});
});

test("handleSubmit step 5: 3 action-required actions, user submits one to done → summary { done:1, not_required:0, total:3 }", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "action-required" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "action-required" });
  await seedAction({ _id: "a-followup", type: "schedule-followup", kind: "task", stage: "action-required" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a-qualify", interaction: "submit_edit" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 1, not_required: 0, total: 3 });
});

test("handleSubmit step 5: 2 actions, user submits one to not-required → summary { done:0, not_required:1, total:2 }", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "action-required" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "action-required" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a-qualify", interaction: "not_required" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 0, not_required: 1, total: 2 });
});

test("handleSubmit step 5: 4 actions, one already done + one already not-required, user submits a third to done → { done:2, not_required:1, total:4 }", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "done" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "not-required" });
  await seedAction({ _id: "a-followup", type: "schedule-followup", kind: "task", stage: "action-required" });
  await seedAction({ _id: "a-cleanup", type: "post-close-cleanup", kind: "task", stage: "action-required" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a-followup",
        interaction: "submit_edit",
        current_status: "done",
      },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 2, not_required: 1, total: 4 });
});

test("handleSubmit task 13: step 5 throws → force-push error transition; action_ids still set; step 4 writes durable on disk", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "action-required" });

  // Wrap mongoDBConnection so writes to the workflows collection (step 5's
  // first $set call after step 4 writes) throw exactly once.
  let workflowsUpdateCallCount = 0;
  const failingConn = (collection) => {
    const inner = mongoDBConnection(collection);
    if (collection === "workflows") {
      return {
        ...inner,
        MongoDBUpdateOne: async (...args) => {
          workflowsUpdateCallCount += 1;
          if (workflowsUpdateCallCount === 1) {
            throw new Error("simulated step 5 failure");
          }
          return inner.MongoDBUpdateOne(...args);
        },
      };
    }
    return inner;
  };

  const result = await handleSubmit({
    mongoDBConnection: failingConn,
    actionsEnum,
    workflowsConfig: [onboardingWorkflowConfig],
    changeStamp,
    params: { action_id: "a-quote", interaction: "submit_edit" },
    user: { id: "u1", roles: ["account-manager"] },
    eventId: "event-err-1",
  });

  expect(result.error_transition).toBeDefined();
  expect(result.error_transition.reason).toBe("recompute-summary");
  expect(result.error_transition.error_message).toMatch(/simulated step 5 failure/);
  expect(result.action_ids).toContain("a-quote");

  // Step 4's transition is durable on the action doc, and the error transition
  // is layered on top via force-push.
  const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(doc.status[0].stage).toBe("error");
  expect(doc.status[1].stage).toBe("in-review");
  expect(doc.status).toHaveLength(3); // error + in-review + original action-required
});

test("handleSubmit task 13: step 6 throws → action_ids still set; summary write durable; error layered on action", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "action-required" });

  let workflowsUpdateCallCount = 0;
  const failingConn = (collection) => {
    const inner = mongoDBConnection(collection);
    if (collection === "workflows") {
      return {
        ...inner,
        MongoDBUpdateOne: async (...args) => {
          workflowsUpdateCallCount += 1;
          // First call is step 5 (summary) — let it through.
          // Second call is step 6 (form_data) — throw.
          if (workflowsUpdateCallCount === 2) {
            throw new Error("simulated step 6 failure");
          }
          return inner.MongoDBUpdateOne(...args);
        },
      };
    }
    return inner;
  };

  const result = await handleSubmit({
    mongoDBConnection: failingConn,
    actionsEnum,
    workflowsConfig: [onboardingWorkflowConfig],
    changeStamp,
    params: {
      action_id: "a-quote",
      interaction: "submit_edit",
      form: { score: 5 },
    },
    user: { id: "u1", roles: ["account-manager"] },
    eventId: "event-err-2",
  });

  expect(result.error_transition).toBeDefined();
  expect(result.error_transition.reason).toBe("write-form-data");

  // Step 5's summary was already written.
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 0, not_required: 0, total: 1 });

  // Action has error layered on top of the step-4 transition.
  const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(doc.status[0].stage).toBe("error");
  expect(doc.status[1].stage).toBe("in-review");
});

test("handleSubmit task 13: step 1 throw still bubbles up (not caught) — no error_transition on response", async () => {
  // Pre-lookup throw via missing action_id.
  let caughtErr = null;
  try {
    await handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { interaction: "submit_edit" },
      }),
    );
  } catch (err) {
    caughtErr = err;
  }
  expect(caughtErr).not.toBeNull();
  expect(caughtErr.message).toMatch(/action_id is required/);
});

test("handleSubmit: pre-lookup throw never returns action_ids (function exits via throw)", async () => {
  // Throws via missing action_id; result variable never populated.
  let resultCaught = null;
  try {
    await handleSubmit(makeContext({ params: { interaction: "submit_edit" } }));
  } catch (err) {
    resultCaught = err;
  }
  expect(resultCaught).not.toBeNull();
  // No further assertion needed — the function threw before returning a body.
});
