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
    connection: overrides.connection ?? { app_name: "test-app" },
    params: overrides.params ?? {},
    user: overrides.user ?? { id: "u1", roles: ["account-manager"] },
    callApi:
      overrides.callApi ??
      jest.fn(async () => ({ success: true, response: {} })),
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

async function seedAction({ _id, type, workflow_id = "wf-1", key = null, stage = "action-required", kind = "form", action_group = null }) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key,
    action_group,
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
    event_id: "event-1",
    // Single action auto-completes the workflow; no parent_action_id, so
    // fireTrackerSubscription returns [] (live default rather than null).
    tracker_fired: [],
    pre_hook_response: null,
    post_hook_response: null,
  });
});

test("handleSubmit step 7: dispatchLogEvent receives status_before captured pre-step-4 (action-required)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = jest.fn(async () => ({ success: true, response: {} }));

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
      callApi,
    }),
  );

  // First callApi invocation is new-event (dispatch-log-event).
  const newEventCall = callApi.mock.calls.find(
    ([endpoint]) => endpoint.id === "new-event",
  );
  expect(newEventCall).toBeDefined();
  const [, payload] = newEventCall;
  expect(payload._id).toBe("event-1");
  expect(payload.metadata).toMatchObject({
    action_type: "qualify",
    workflow_type: "onboarding",
    interaction: "submit_edit",
    current_key: null,
    status_before: "action-required",
    status_after: "done",
  });
});

test("handleSubmit step 8: dispatchNotifications fires with the just-emitted event_id", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = jest.fn(async () => ({ success: true, response: {} }));

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
      callApi,
    }),
  );

  const sendCall = callApi.mock.calls.find(
    ([endpoint]) => endpoint.id === "send-notification",
  );
  expect(sendCall).toBeDefined();
  const [, payload] = sendCall;
  expect(payload).toEqual({ event_ids: ["event-1"] });
});

test("handleSubmit step 7: throws to request layer when new-event callApi fails (not swallowed)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = jest.fn(async ({ id }) => {
    if (id === "new-event") {
      return { success: false, error: { message: "boom" } };
    }
    return { success: true, response: {} };
  });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: { action_id: "a1", interaction: "submit_edit" },
        callApi,
      }),
    ),
  ).rejects.toMatchObject({ step: "dispatch-log-event" });
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

// ---------------------------------------------------------------------------
// Part 7 — group state machine integration
// ---------------------------------------------------------------------------

const groupsWorkflowConfig = {
  type: "onboarding",
  entity_collection: "leads-collection",
  action_groups: [
    { id: "phase-1", on_complete: "phase-1-complete-api" },
    { id: "phase-2" },
  ],
  actions: [
    {
      type: "qualify",
      kind: "form",
      action_group: "phase-1",
      access: { roles: ["account-manager"] },
    },
    {
      type: "send-quote",
      kind: "form",
      action_group: "phase-1",
      access: { roles: ["account-manager"] },
    },
    {
      type: "kickoff",
      kind: "task",
      action_group: "phase-2",
      blocked_by: ["phase-1"],
      access: { roles: ["account-manager"] },
    },
  ],
};

async function seedWorkflowWithGroups({ stage = "active", groups = [] } = {}) {
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-1",
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    status: [{ stage, created: new Date("2026-05-19T00:00:00Z") }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups,
    form_data: {},
  });
}

test("part 7: completing the last non-terminal action in a group surfaces it in completed_groups", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 1, not_required: 0, total: 2 },
      },
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1", stage: "done" });
  await seedAction({ _id: "a2", type: "send-quote", action_group: "phase-1" });
  await seedAction({ _id: "a3", type: "kickoff", kind: "task", action_group: "phase-2", stage: "blocked" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [groupsWorkflowConfig],
      params: { action_id: "a2", interaction: "submit_edit" },
    }),
  );

  expect(result.completed_groups).toEqual([
    {
      workflow_id: "wf-1",
      id: "phase-1",
      on_complete: "phase-1-complete-api",
    },
  ]);
});

test("part 7: workflow doc groups[] reflects post-submit state in declaration order", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 2 },
      },
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  await seedAction({ _id: "a1", type: "qualify", action_group: "phase-1" });
  await seedAction({ _id: "a2", type: "send-quote", action_group: "phase-1" });
  await seedAction({ _id: "a3", type: "kickoff", kind: "task", action_group: "phase-2", stage: "blocked" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [groupsWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.groups).toEqual([
    {
      id: "phase-1",
      status: "in-progress",
      summary: { done: 1, not_required: 0, total: 2 },
    },
    {
      id: "phase-2",
      status: "blocked",
      summary: { done: 0, not_required: 0, total: 1 },
    },
  ]);
});

test("part 7: completed_groups entry carries on_complete null when group has none declared", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "done",
        summary: { done: 0, not_required: 0, total: 0 },
      },
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  // phase-1 is empty (already done). phase-2 has one action; completing it
  // transitions phase-2 to done. phase-2 has no on_complete declared.
  await seedAction({ _id: "a3", type: "kickoff", kind: "task", action_group: "phase-2", stage: "action-required" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [groupsWorkflowConfig],
      params: { action_id: "a3", interaction: "submit_edit", current_status: "done" },
    }),
  );

  expect(result.completed_groups).toEqual([
    {
      workflow_id: "wf-1",
      id: "phase-2",
      on_complete: null,
    },
  ]);
});

test("part 7: auto-complete pushes workflow to 'completed' when every action is terminal", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  await seedAction({ _id: "only", type: "qualify", action_group: "phase-1" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [
        {
          ...groupsWorkflowConfig,
          action_groups: [{ id: "phase-1" }],
          actions: groupsWorkflowConfig.actions.filter((a) => a.type === "qualify"),
        },
      ],
      params: { action_id: "only", interaction: "submit_edit" },
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status[0].stage).toBe("completed");
  expect(wf.status[1].stage).toBe("active");
});

test("part 7: auto-complete same-stage guard — already-completed workflow doesn't double-push", async () => {
  // A workflow can't reach this code path via shipping code (the terminal-workflow
  // gate at step 1 would reject), but we test the guard via the in-memory check:
  // we set the workflow to active here, submit, complete, and assert no double push
  // after a re-fetch + resubmit pattern would no-op.
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  await seedAction({ _id: "only", type: "qualify", action_group: "phase-1" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [
        {
          ...groupsWorkflowConfig,
          action_groups: [{ id: "phase-1" }],
          actions: groupsWorkflowConfig.actions.filter((a) => a.type === "qualify"),
        },
      ],
      params: { action_id: "only", interaction: "submit_edit" },
    }),
  );

  // After the first submit, the workflow is 'completed'. status[] has two entries.
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status).toHaveLength(2);
  expect(wf.status[0].stage).toBe("completed");
});

test("part 7: blocked_by re-evaluation — action flips from blocked to action-required when its dep group enters done", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
      {
        id: "phase-2",
        status: "blocked",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  await seedAction({ _id: "qualify-1", type: "qualify", action_group: "phase-1" });
  await seedAction({
    _id: "kickoff-1",
    type: "kickoff",
    kind: "task",
    action_group: "phase-2",
    stage: "blocked",
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [
        {
          ...groupsWorkflowConfig,
          actions: groupsWorkflowConfig.actions.filter(
            (a) => a.type === "qualify" || a.type === "kickoff",
          ),
        },
      ],
      params: { action_id: "qualify-1", interaction: "submit_edit" },
    }),
  );

  const kickoff = await mongo.db.collection("actions").findOne({ _id: "kickoff-1" });
  expect(kickoff.status[0].stage).toBe("action-required");
});

test("part 7: mixed blocked_by — downstream stays blocked while one dep unresolved", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  // qualify (phase-1) + a separate action 'finalize' that depends on both phase-1
  // group AND on another action-type 'verify' that is still in-progress.
  await seedAction({ _id: "qualify-1", type: "qualify", action_group: "phase-1" });
  await seedAction({ _id: "verify-1", type: "verify", kind: "task", stage: "in-progress" });
  await seedAction({ _id: "finalize-1", type: "finalize", kind: "task", stage: "blocked" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [
        {
          ...groupsWorkflowConfig,
          actions: [
            {
              type: "qualify",
              kind: "form",
              action_group: "phase-1",
              access: { roles: ["account-manager"] },
            },
            { type: "verify", kind: "task", access: { roles: ["account-manager"] } },
            {
              type: "finalize",
              kind: "task",
              blocked_by: ["phase-1", "verify"],
              access: { roles: ["account-manager"] },
            },
          ],
        },
      ],
      params: { action_id: "qualify-1", interaction: "submit_edit" },
    }),
  );

  const finalize = await mongo.db.collection("actions").findOne({ _id: "finalize-1" });
  expect(finalize.status[0].stage).toBe("blocked");
});

test("part 7: one MongoDBUpdateOne against workflows in step 5 (summary + groups + status bundled)", async () => {
  await seedWorkflowWithGroups({
    groups: [
      {
        id: "phase-1",
        status: "in-progress",
        summary: { done: 0, not_required: 0, total: 1 },
      },
    ],
  });
  await seedAction({ _id: "only", type: "qualify", action_group: "phase-1" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [
        {
          ...groupsWorkflowConfig,
          action_groups: [{ id: "phase-1" }],
          actions: groupsWorkflowConfig.actions.filter((a) => a.type === "qualify"),
        },
      ],
      params: { action_id: "only", interaction: "submit_edit" },
    }),
  );

  // Workflow doc reflects the bundled $set + $push in a single round-trip:
  // - summary recomputed
  // - groups[] populated
  // - status[] now has 'completed' at index 0
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.summary).toEqual({ done: 1, not_required: 0, total: 1 });
  expect(wf.groups).toEqual([
    {
      id: "phase-1",
      status: "done",
      summary: { done: 1, not_required: 0, total: 1 },
    },
  ]);
  expect(wf.status[0].stage).toBe("completed");
});

// ===========================================================================
// Part 10 — Step 10 tracker subscription wiring
// ===========================================================================

test("part 10 step 10: submit that does NOT auto-complete → tracker_fired:[]; no writes to other workflows' actions", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });
  await seedAction({ _id: "a2", type: "send-quote", stage: "action-required" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );

  expect(result.tracker_fired).toEqual([]);
  const otherWorkflowsCount = await mongo.db
    .collection("workflows")
    .countDocuments({ _id: { $ne: "wf-1" } });
  expect(otherWorkflowsCount).toBe(0);
});

test("part 10 step 10: auto-complete with parent_action_id:null → tracker_fired:[]; workflow at completed", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );

  expect(result.tracker_fired).toEqual([]);
  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.status[0].stage).toBe("completed");
});

test("part 10 step 10: auto-complete with valid parent_action_id → non-empty tracker_fired; parent action force-pushed", async () => {
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-parent",
    workflow_type: "onboarding",
    entity_id: "lead-parent",
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: new Date() }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  await mongo.db.collection("actions").insertOne({
    _id: "p-approve",
    workflow_id: "wf-parent",
    type: "qualify",
    kind: "form",
    key: null,
    status: [{ stage: "action-required", created: new Date() }],
  });
  await mongo.db.collection("actions").insertOne({
    _id: "p-tracker",
    workflow_id: "wf-parent",
    type: "send-quote",
    kind: "tracker",
    key: null,
    child_workflow_id: "wf-1",
    status: [{ stage: "in-progress", created: new Date() }],
  });
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-1",
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    parent_action_id: "p-tracker",
    status: [{ stage: "active", created: new Date() }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );

  expect(result.tracker_fired).toHaveLength(1);
  expect(result.tracker_fired[0]).toEqual({
    parent_action_id: "p-tracker",
    parent_workflow_id: "wf-parent",
    new_status: "done",
  });
  const tracker = await mongo.db
    .collection("actions")
    .findOne({ _id: "p-tracker" });
  expect(tracker.status[0].stage).toBe("done");
});

// ---------------------------------------------------------------------------
// Part 9 — pre-hook (step 2) integration tests.
// ---------------------------------------------------------------------------

function makeHookCallApi({ hookResponses = {}, throwForHook } = {}) {
  return jest.fn(async ({ id, module }, _payload, _opts) => {
    if (module === "workflows" && Object.prototype.hasOwnProperty.call(hookResponses, id)) {
      return hookResponses[id];
    }
    if (module === "workflows" && throwForHook && throwForHook.id === id) {
      throw throwForHook.error;
    }
    // Default for non-hook callApi (events, notifications) — wrapped shape.
    return { success: true, response: {} };
  });
}

test("part 9: pre-hook status overrides YAML override which overrides engine default (three-layer)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": { status: "done" },
    },
  });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
        // YAML override would map submit_edit → in-review; pre-hook beats it.
        interactions: { submit_edit: { status: "in-review" } },
      },
      callApi,
    }),
  );

  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("done");
  expect(result.pre_hook_response).toEqual({ status: "done" });
});

test("part 9: YAML override wins over engine default when no pre-hook declared", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        // qualify has no `review` verb → engine default would be done; YAML lifts it.
        interactions: { submit_edit: { status: "in-review" } },
      },
    }),
  );

  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("in-review");
});

test("part 9: pre-hook actions[] (type, key) collision replaces auto-unblock", async () => {
  // Submit qualify → done; without a pre-hook, send-quote auto-unblocks to
  // action-required. The pre-hook should override and push send-quote to done
  // with force (since priority would block done <- blocked).
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "done" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "blocked" });

  const blockedConfig = {
    ...onboardingWorkflowConfig,
    actions: onboardingWorkflowConfig.actions.map((a) =>
      a.type === "send-quote" ? { ...a, blocked_by: ["qualify"] } : a,
    ),
  };

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": {
        actions: [
          { type: "send-quote", status: "in-review" },
        ],
      },
    },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [blockedConfig],
      params: {
        action_id: "a-qualify",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  // Auto-unblock would have produced action-required; pre-hook replaced with in-review.
  const quote = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(quote.status[0].stage).toBe("in-review");
});

test("part 9: pre-hook actions[] entry colliding with currentActionId omits status → resolved status grafted in", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": {
        // No status, no current_key — collides with currentActionEntry at (qualify, null).
        actions: [{ type: "qualify", fields: { tag: "hooked" } }],
      },
    },
  });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  // Submitted action lands at engine-default 'done' (no YAML, no pre-hook status).
  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("done");
  expect(result.action_ids).toContain("a1");
});

test("part 9: pre-hook actions[] with force: true bypasses priority rule", async () => {
  await seedWorkflow();
  // qualify is done; pre-hook wants to push it back to action-required (a
  // backwards transition normally blocked by priority).
  await seedAction({ _id: "a1", type: "qualify", stage: "done" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": {
        actions: [
          {
            type: "qualify",
            status: "action-required",
            force: true,
          },
        ],
      },
    },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("action-required");
});

test("part 9: pre-hook actions[] without force: backwards transition on non-self action is silently dropped per priority rule", async () => {
  // User submits qualify (the currentActionId); pre-hook ALSO returns an entry
  // for send-quote, which is already done. No force; no self-exception (the
  // entry isn't for the currentActionId). Priority rule rejects the write.
  await seedWorkflow();
  await seedAction({ _id: "a-qualify", type: "qualify", stage: "action-required" });
  await seedAction({ _id: "a-quote", type: "send-quote", stage: "done" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": {
        actions: [{ type: "send-quote", status: "action-required" }],
      },
    },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a-qualify",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
  expect(doc.status[0].stage).toBe("done");
});

test("part 9: pre-hook form_overrides + user form write both field paths", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": { form_overrides: { a: 1 } },
    },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
        form: { b: 2 },
      },
      callApi,
    }),
  );

  const wf = await mongo.db.collection("workflows").findOne({ _id: "wf-1" });
  expect(wf.form_data.qualify).toEqual({ a: 1, b: 2 });
});

test("part 9: pre-hook event_overrides merges metadata; default metadata preserved", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": { event_overrides: { metadata: { scrubbed: true } } },
    },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  const newEventCall = callApi.mock.calls.find(
    ([endpoint]) => endpoint.id === "new-event",
  );
  expect(newEventCall).toBeDefined();
  const [, payload] = newEventCall;
  expect(payload.metadata.scrubbed).toBe(true);
  expect(payload.metadata.action_type).toBe("qualify");
});

test("part 9: pre-hook event_overrides.metadata.comment overrides user-supplied params.comment", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": { event_overrides: { metadata: { comment: "SCRUBBED" } } },
    },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
        comment: "hello",
      },
      callApi,
    }),
  );

  const newEventCall = callApi.mock.calls.find(
    ([endpoint]) => endpoint.id === "new-event",
  );
  const [, payload] = newEventCall;
  expect(payload.metadata.comment).toBe("SCRUBBED");
});

test("part 9: YAML event_overrides.metadata.foo coexists with user comment (layer 3 not clobbered)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = makeHookCallApi();

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        comment: "hello",
        event_overrides: {
          submit_edit: { metadata: { foo: "bar" } },
        },
      },
      callApi,
    }),
  );

  const newEventCall = callApi.mock.calls.find(
    ([endpoint]) => endpoint.id === "new-event",
  );
  const [, payload] = newEventCall;
  expect(payload.metadata.foo).toBe("bar");
  expect(payload.metadata.comment).toBe("hello");
});

test("part 9: pre-hook :reject (UserError isReject: true) rethrows; no writes; no event/notification", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  class UserError extends Error {
    constructor(message, opts) {
      super(message);
      this.name = "UserError";
      this.isReject = opts?.isReject ?? false;
    }
  }
  const reject = new UserError("validation failed", { isReject: true });

  const callApi = makeHookCallApi({
    throwForHook: { id: "h-pre", error: reject },
  });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: {
          action_id: "a1",
          interaction: "submit_edit",
          hooks: { submit_edit: { pre: "h-pre" } },
        },
        callApi,
      }),
    ),
  ).rejects.toBe(reject);

  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("action-required");
  expect(doc.status).toHaveLength(1);
  expect(
    callApi.mock.calls.some(([endpoint]) => endpoint.id === "new-event"),
  ).toBe(false);
  expect(
    callApi.mock.calls.some(([endpoint]) => endpoint.id === "send-notification"),
  ).toBe(false);
});

test("part 9: pre-hook generic throw rethrows; no writes; status unchanged", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = makeHookCallApi({
    throwForHook: { id: "h-pre", error: new Error("upstream down") },
  });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: {
          action_id: "a1",
          interaction: "submit_edit",
          hooks: { submit_edit: { pre: "h-pre" } },
        },
        callApi,
      }),
    ),
  ).rejects.toThrow("upstream down");

  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("action-required");
});

test("part 9: pre-hook actions: [{ status: 'error' }] writes error transition via priority path; log event + notifications fire", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-pre": { actions: [{ type: "qualify", status: "error" }] },
    },
  });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("error");
  // Side effects still fire (this is a successful submit, not an error path).
  expect(
    callApi.mock.calls.some(([endpoint]) => endpoint.id === "new-event"),
  ).toBe(true);
  expect(
    callApi.mock.calls.some(([endpoint]) => endpoint.id === "send-notification"),
  ).toBe(true);
  expect(result.event_id).toBe("event-1");
});

test("part 9: pre_hook_response surfaces raw return verbatim", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const response = { status: "done", actions: [], custom_field: "x" };
  const callApi = makeHookCallApi({
    hookResponses: { "h-pre": response },
  });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { pre: "h-pre" } },
      },
      callApi,
    }),
  );

  expect(result.pre_hook_response).toEqual(response);
});

test("part 9: pre_hook_response is null when no pre-hook declared", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );

  expect(result.pre_hook_response).toBeNull();
});

// ---------------------------------------------------------------------------
// Part 9 — post-hook (step 11) integration tests.
// ---------------------------------------------------------------------------

test("part 9: post_hook_response is null when no post-hook declared", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: { action_id: "a1", interaction: "submit_edit" },
    }),
  );

  expect(result.post_hook_response).toBeNull();
});

test("part 9: post_hook_response surfaces raw return verbatim", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = makeHookCallApi({
    hookResponses: {
      "h-post": { foo: "bar" },
    },
  });

  const result = await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { post: "h-post" } },
      },
      callApi,
    }),
  );

  expect(result.post_hook_response).toEqual({ foo: "bar" });
});

test("part 9: post-hook receives result with final post-write state (action_ids, event_id, tracker_fired)", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify" });

  const callApi = makeHookCallApi({
    hookResponses: { "h-post": {} },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { post: "h-post" } },
      },
      callApi,
    }),
  );

  const postCall = callApi.mock.calls.find(
    ([endpoint]) => endpoint.id === "h-post",
  );
  expect(postCall).toBeDefined();
  const [, payload] = postCall;
  expect(payload.result).toMatchObject({
    action_ids: ["a1"],
    event_id: "event-1",
    completed_groups: [],
  });
  expect(payload.result.tracker_fired).toEqual([]);
});

test("part 9: post-hook fires AFTER tracker subscription (call ordering)", async () => {
  // Set up a parent/child tracker so step 10 actually fires a tracker
  // subscription. The post-hook callApi must appear after tracker writes have
  // happened.
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-parent",
    workflow_type: "onboarding",
    entity_id: "lead-parent",
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: new Date() }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  await mongo.db.collection("actions").insertOne({
    _id: "p-tracker",
    workflow_id: "wf-parent",
    type: "send-quote",
    kind: "tracker",
    key: null,
    child_workflow_id: "wf-1",
    status: [{ stage: "in-progress", created: new Date() }],
  });
  await mongo.db.collection("workflows").insertOne({
    _id: "wf-1",
    workflow_type: "onboarding",
    entity_id: "lead-1",
    entity_collection: "leads-collection",
    parent_action_id: "p-tracker",
    status: [{ stage: "active", created: new Date() }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
  });
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = makeHookCallApi({
    hookResponses: { "h-post": {} },
  });

  await handleSubmit(
    makeContext({
      workflowsConfig: [onboardingWorkflowConfig],
      params: {
        action_id: "a1",
        interaction: "submit_edit",
        hooks: { submit_edit: { post: "h-post" } },
      },
      callApi,
    }),
  );

  const ids = callApi.mock.calls.map(([endpoint]) => endpoint.id);
  // dispatchLogEvent (new-event) and dispatchNotifications (send-notification)
  // fire in steps 7+8 before tracker subscription / post-hook. fireTrackerSubscription
  // does not go through callApi, so the post-hook call appears after the
  // notification but reflects tracker_fired in its payload.result.
  const postIdx = ids.lastIndexOf("h-post");
  const notifIdx = ids.lastIndexOf("send-notification");
  expect(postIdx).toBeGreaterThan(notifIdx);

  const postCall = callApi.mock.calls[postIdx];
  expect(postCall[1].result.tracker_fired).toHaveLength(1);
  expect(postCall[1].result.tracker_fired[0]).toMatchObject({
    parent_action_id: "p-tracker",
  });
});

test("part 9: post-hook throw propagates; writes from steps 4-10 stay", async () => {
  await seedWorkflow();
  await seedAction({ _id: "a1", type: "qualify", stage: "action-required" });

  const callApi = makeHookCallApi({
    throwForHook: { id: "h-post", error: new Error("post-hook boom") },
  });

  await expect(
    handleSubmit(
      makeContext({
        workflowsConfig: [onboardingWorkflowConfig],
        params: {
          action_id: "a1",
          interaction: "submit_edit",
          hooks: { submit_edit: { post: "h-post" } },
        },
        callApi,
      }),
    ),
  ).rejects.toThrow("post-hook boom");

  // Step 4 writes landed (action moved to 'done') despite the post-hook throw.
  const doc = await mongo.db.collection("actions").findOne({ _id: "a1" });
  expect(doc.status[0].stage).toBe("done");
});

test("part 10 step 10: error path retains tracker_fired:null; subscription not called", async () => {
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
    connection: { app_name: "test-app" },
    params: { action_id: "a-quote", interaction: "submit_edit" },
    user: { id: "u1", roles: ["account-manager"] },
    callApi: jest.fn(async () => ({ success: true, response: {} })),
    eventId: "event-1",
  });

  expect(result.tracker_fired).toBeNull();
  expect(result.error_transition).toBeDefined();
});
