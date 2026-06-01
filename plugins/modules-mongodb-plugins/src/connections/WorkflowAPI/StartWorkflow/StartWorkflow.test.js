import inMemoryMongo from "../../shared/inMemoryMongo.js";
import StartWorkflow from "./StartWorkflow.js";

const actionsEnum = {
  "not-required": { priority: 0 },
  done: { priority: 3 },
  "in-review": { priority: 4 },
  "changes-required": { priority: 5 },
  "action-required": { priority: 6 },
  blocked: { priority: 7 },
  error: { priority: 8 },
};

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1" },
};

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
});

function makeLowdefyContext({ workflowsConfig, request }) {
  return {
    blockId: "test-block",
    connection: {
      databaseUri: mongo.uri,
      workflowsConfig,
      actionsEnum,
      changeStamp,
    },
    connectionId: "test-conn",
    pageId: "test-page",
    requestId: "test-req",
    request,
  };
}

const baseWorkflowConfig = {
  type: "onboarding",
  entity_collection: "leads-collection",
  action_groups: [
    { id: "phase-1" },
    { id: "phase-2" },
    { id: "phase-3" },
  ],
  actions: [
    { type: "a", kind: "simple", action_group: "phase-1" },
    { type: "b", kind: "simple", action_group: "phase-1" },
    { type: "c", kind: "simple", action_group: "phase-2" },
  ],
  starting_actions: [
    { type: "a", status: "action-required" },
    { type: "b", status: "blocked" },
    { type: "c", status: "blocked" },
  ],
};

async function readOneWorkflow() {
  return mongo.db.collection("workflows").findOne({});
}

test("StartWorkflow: pre-populates groups[] in declaration order with per-group derived statuses", async () => {
  const result = await StartWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseWorkflowConfig],
      request: {
        workflow_type: "onboarding",
        entity_id: "lead-1",
        entity_collection: "leads-collection",
      },
    }),
  );
  expect(result.workflow_id).toBeTruthy();

  const wf = await readOneWorkflow();
  expect(wf.groups).toEqual([
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
    {
      id: "phase-3",
      status: "done",
      summary: { done: 0, not_required: 0, total: 0 },
    },
  ]);
});

test("StartWorkflow: workflow with no action_groups declared gets groups: []", async () => {
  await StartWorkflow(
    makeLowdefyContext({
      workflowsConfig: [
        {
          type: "onboarding",
          entity_collection: "leads-collection",
          actions: [{ type: "a", kind: "simple" }],
          starting_actions: [{ type: "a", status: "action-required" }],
        },
      ],
      request: {
        workflow_type: "onboarding",
        entity_id: "lead-1",
        entity_collection: "leads-collection",
      },
    }),
  );
  const wf = await readOneWorkflow();
  expect(wf.groups).toEqual([]);
});

test("StartWorkflow: declared groups but no actions reference them → all empty groups (status:done, total:0)", async () => {
  await StartWorkflow(
    makeLowdefyContext({
      workflowsConfig: [
        {
          type: "onboarding",
          entity_collection: "leads-collection",
          action_groups: [{ id: "phase-1" }, { id: "phase-2" }],
          actions: [{ type: "a", kind: "simple" }],
          starting_actions: [{ type: "a", status: "action-required" }],
        },
      ],
      request: {
        workflow_type: "onboarding",
        entity_id: "lead-1",
        entity_collection: "leads-collection",
      },
    }),
  );
  const wf = await readOneWorkflow();
  expect(wf.groups).toEqual([
    {
      id: "phase-1",
      status: "done",
      summary: { done: 0, not_required: 0, total: 0 },
    },
    {
      id: "phase-2",
      status: "done",
      summary: { done: 0, not_required: 0, total: 0 },
    },
  ]);
});

test("StartWorkflow: groups[] length equals declared action_groups length", async () => {
  await StartWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseWorkflowConfig],
      request: {
        workflow_type: "onboarding",
        entity_id: "lead-1",
        entity_collection: "leads-collection",
      },
    }),
  );
  const wf = await readOneWorkflow();
  expect(wf.groups).toHaveLength(3);
});

test("StartWorkflow: createAction propagates action_group from config onto each action doc", async () => {
  await StartWorkflow(
    makeLowdefyContext({
      workflowsConfig: [baseWorkflowConfig],
      request: {
        workflow_type: "onboarding",
        entity_id: "lead-1",
        entity_collection: "leads-collection",
      },
    }),
  );
  const actions = await mongo.db.collection("actions").find({}).toArray();
  const byType = Object.fromEntries(actions.map((a) => [a.type, a]));
  expect(byType.a.action_group).toBe("phase-1");
  expect(byType.b.action_group).toBe("phase-1");
  expect(byType.c.action_group).toBe("phase-2");
});
