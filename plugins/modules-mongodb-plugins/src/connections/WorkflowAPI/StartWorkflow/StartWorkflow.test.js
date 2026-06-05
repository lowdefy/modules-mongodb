/**
 * Integration tests for StartWorkflow (task 17). Drives the real resolver
 * against an in-memory Mongo (standalone, no transactions) with a mock callApi
 * per the shipped contract — mirrors SubmitWorkflowAction.test.js.
 */
import { clearMongoClientCache } from '../../mongo/getMongoDb.js';
import inMemoryMongo from '../../shared/inMemoryMongo.js';
import StartWorkflow from './StartWorkflow.js';

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date('2026-05-20T00:00:00Z'),
  user: { id: 'u1', name: 'Stamper' },
};

function makeWorkflowsConfig({ withGroups = false, startingActions } = {}) {
  return [
    {
      type: 'onboarding',
      entity_collection: 'leads-collection',
      entity_ref_key: 'lead_ids',
      starting_actions:
        startingActions ?? [{ type: 'a', status: 'action-required' }],
      ...(withGroups
        ? {
            action_groups: [
              { id: 'phase-1' },
              { id: 'phase-2' },
              { id: 'phase-3' },
            ],
          }
        : {}),
      actions: [
        {
          type: 'a',
          kind: 'simple',
          ...(withGroups ? { action_group: 'phase-1' } : {}),
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
        {
          type: 'b',
          kind: 'simple',
          ...(withGroups ? { action_group: 'phase-1' } : {}),
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
        {
          type: 'c',
          kind: 'simple',
          ...(withGroups ? { action_group: 'phase-2' } : {}),
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
      ],
    },
  ];
}

// Parent config carries a tracker action so Start can be a tracker child.
function makeParentChildConfig() {
  return [
    {
      type: 'onboarding',
      entity_collection: 'leads-collection',
      entity_ref_key: 'lead_ids',
      starting_actions: [{ type: 'a', status: 'action-required' }],
      action_groups: [],
      actions: [
        {
          type: 'a',
          kind: 'simple',
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
        {
          type: 'track-child',
          kind: 'tracker',
          tracker: { workflow_type: 'onboarding' },
          access: { 'test-app': { view: true } },
        },
      ],
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
  await mongo.db.collection('workflows').deleteMany({});
  await mongo.db.collection('actions').deleteMany({});
  await mongo.db.collection('events').deleteMany({});
}

beforeEach(async () => {
  await clearMongoClientCache();
  await resetCollections();
});

function makeCallApi({ failOn = null, calls = [] } = {}) {
  return async ({ endpointId, payload }) => {
    calls.push({ endpointId, payload });
    if (failOn === endpointId) {
      throw new Error(`forced failure: ${endpointId}`);
    }
    if (endpointId === 'events/new-event') {
      await mongo.db.collection('events').insertOne({
        _id: payload._id,
        type: payload.type,
        display: payload.display,
        references: payload.references,
        metadata: payload.metadata,
        created: { timestamp: new Date() },
      });
      return { eventId: payload._id };
    }
    if (endpointId === 'notifications/send-notification') {
      return null;
    }
    throw new Error(`unexpected callApi: ${endpointId}`);
  };
}

function buildContext({
  request,
  app_name = 'test-app',
  user = {
    id: 'U1',
    profile: { name: 'Test User' },
    apps: { 'test-app': { roles: ['account-manager'] } },
  },
  callApi,
  workflowsConfig = makeWorkflowsConfig(),
} = {}) {
  return {
    request,
    blockId: 'test-block',
    connectionId: 'test-conn',
    pageId: 'test-page',
    requestId: 'test-req',
    connection: {
      databaseUri: mongo.uri,
      useTransactions: false,
      entry_id: 'workflows',
      workflowsCollection: 'workflows',
      actionsCollection: 'actions',
      app_name,
      endpoints: {
        new_event: 'events/new-event',
        send_notification: 'notifications/send-notification',
      },
      workflowsConfig,
      changeStamp,
    },
    user,
    callApi: callApi ?? makeCallApi(),
  };
}

async function readOneWorkflow() {
  return mongo.db.collection('workflows').findOne({});
}

// ─────────────────────────────────────────────────────────────────────────────
// Return surface + lifecycle event
// ─────────────────────────────────────────────────────────────────────────────

describe('handler return payload', () => {
  test('returns { workflow_id, action_ids, event_id }', async () => {
    const result = await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
      }),
    );
    expect(Object.keys(result).sort()).toEqual(
      ['action_ids', 'event_id', 'workflow_id'].sort(),
    );
    expect(result.workflow_id).toBeTruthy();
    expect(typeof result.event_id).toBe('string');
    expect(result.action_ids).toHaveLength(1);
  });

  test('emits exactly one workflow-started event with the workflow render context', async () => {
    const calls = [];
    const result = await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
        callApi: makeCallApi({ calls }),
      }),
    );
    const eventCalls = calls.filter((c) => c.endpointId === 'events/new-event');
    expect(eventCalls).toHaveLength(1);
    const eventDoc = await mongo.db
      .collection('events')
      .findOne({ _id: result.event_id });
    expect(eventDoc).not.toBeNull();
    expect(eventDoc.type).toBe('workflow-started');
    // Lifecycle reference key from the workflow config.
    expect(eventDoc.references.lead_ids).toEqual(['lead-1']);
    expect(eventDoc.references.workflow_ids).toEqual([result.workflow_id]);
    expect(eventDoc.metadata).toEqual({
      workflow_type: 'onboarding',
      signal: 'started',
    });
  });

  test('the workflow status[0] carries the invocation event_id at stage active', async () => {
    const result = await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
      }),
    );
    const wf = await readOneWorkflow();
    expect(wf.status[0].stage).toBe('active');
    expect(wf.status[0].event_id).toBe(result.event_id);
    expect(wf.entity_ref_key).toBe('lead_ids');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Seeded drafts (planActionTransition seedStage mode)
// ─────────────────────────────────────────────────────────────────────────────

describe('seeded drafts', () => {
  test('seeds each starting action at its declared status with the invocation event_id', async () => {
    await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
        workflowsConfig: makeWorkflowsConfig({
          startingActions: [
            { type: 'a', status: 'action-required' },
            { type: 'b', status: 'blocked' },
          ],
        }),
      }),
    );
    const actions = await mongo.db.collection('actions').find({}).toArray();
    const byType = Object.fromEntries(actions.map((a) => [a.type, a]));
    expect(byType.a.status[0].stage).toBe('action-required');
    expect(byType.b.status[0].stage).toBe('blocked');
    expect(byType.a.status[0].event_id).toBe(byType.b.status[0].event_id);
    expect(byType.a.workflow_type).toBe('onboarding'); // denormalised
  });

  test('seeded simple-kind drafts carry task-18 workflow-action-* engine links', async () => {
    await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
      }),
    );
    const a = await mongo.db.collection('actions').findOne({ type: 'a' });
    // action-required stage: view + edit pages exist for simple kind.
    expect(a['test-app'].links.view).toEqual({
      pageId: 'workflows/workflow-action-view',
      urlQuery: { action_id: a._id },
    });
    expect(a['test-app'].links.edit).toEqual({
      pageId: 'workflows/workflow-action-edit',
      urlQuery: { action_id: a._id },
    });
  });

  test('start-payload metadata merges onto every seeded draft', async () => {
    await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
          metadata: { source: 'import', batch: 7 },
        },
        workflowsConfig: makeWorkflowsConfig({
          startingActions: [
            { type: 'a', status: 'action-required' },
            { type: 'b', status: 'blocked' },
          ],
        }),
      }),
    );
    const actions = await mongo.db.collection('actions').find({}).toArray();
    for (const a of actions) {
      expect(a.metadata).toEqual({ source: 'import', batch: 7 });
    }
  });

  test('groups[] composed via planWorkflowRecompute in declaration order', async () => {
    await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
        workflowsConfig: makeWorkflowsConfig({
          withGroups: true,
          startingActions: [
            { type: 'a', status: 'action-required' },
            { type: 'b', status: 'blocked' },
            { type: 'c', status: 'blocked' },
          ],
        }),
      }),
    );
    const wf = await readOneWorkflow();
    expect(wf.summary).toEqual({ done: 0, not_required: 0, total: 3 });
    expect(wf.groups).toEqual([
      { id: 'phase-1', status: 'in-progress', summary: { done: 0, not_required: 0, total: 2 } },
      { id: 'phase-2', status: 'blocked', summary: { done: 0, not_required: 0, total: 1 } },
      { id: 'phase-3', status: 'done', summary: { done: 0, not_required: 0, total: 0 } },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Payload channels
// ─────────────────────────────────────────────────────────────────────────────

describe('payload channels', () => {
  test('payload.references spreads onto the workflow doc at insert', async () => {
    await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
          references: { campaign_id: 'C9', priority: 'high' },
        },
      }),
    );
    const wf = await readOneWorkflow();
    expect(wf.campaign_id).toBe('C9');
    expect(wf.priority).toBe('high');
  });

  test('payload.actions override drives the seeds and accepts key', async () => {
    await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
          actions: [{ type: 'a', key: 'k1', status: 'action-required' }],
        },
      }),
    );
    const actions = await mongo.db.collection('actions').find({}).toArray();
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('a');
    expect(actions[0].key).toBe('k1');
  });

  test('payload.actions with an illegal seed status throws invalid_seed', async () => {
    await expect(
      StartWorkflow(
        buildContext({
          request: {
            workflow_type: 'onboarding',
            entity_id: 'lead-1',
            entity_collection: 'leads-collection',
            actions: [{ type: 'a', status: 'in-review' }],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_seed' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tracker-child start
// ─────────────────────────────────────────────────────────────────────────────

describe('started as a tracker child', () => {
  async function seedParent({ trackerStage = 'action-required' } = {}) {
    await mongo.db.collection('workflows').insertOne({
      _id: 'wf-parent',
      workflow_type: 'onboarding',
      entity_id: 'parent-entity',
      entity_collection: 'leads-collection',
      entity_ref_key: 'lead_ids',
      status: [{ stage: 'active', event_id: 'e0', created: changeStamp }],
      summary: { done: 0, not_required: 0, total: 2 },
      groups: [],
      form_data: {},
      created: changeStamp,
      updated: changeStamp,
    });
    // Non-tracker action keeps the parent from auto-completing.
    await mongo.db.collection('actions').insertOne({
      _id: 'p-a',
      workflow_id: 'wf-parent',
      type: 'a',
      kind: 'simple',
      key: null,
      action_group: null,
      status: [{ stage: 'action-required', event_id: 'e0', created: changeStamp }],
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
    });
    await mongo.db.collection('actions').insertOne({
      _id: 'p-tracker',
      workflow_id: 'wf-parent',
      type: 'track-child',
      kind: 'tracker',
      key: null,
      action_group: null,
      tracker: { workflow_type: 'onboarding' },
      child_workflow_id: null,
      child_entity_id: null,
      child_entity_collection: null,
      access: { 'test-app': { view: true } },
      workflow_type: 'onboarding',
      status: [{ stage: trackerStage, event_id: 'e0', created: changeStamp }],
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
    });
  }

  test('parent tracker lands in-progress with the child link fields, recomputed groups/summary, and a mirror event', async () => {
    await seedParent();
    const calls = [];
    const result = await StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'child-entity',
          entity_collection: 'leads-collection',
          parent_action_id: 'p-tracker',
        },
        workflowsConfig: makeParentChildConfig(),
        callApi: makeCallApi({ calls }),
      }),
    );

    const tracker = await mongo.db
      .collection('actions')
      .findOne({ _id: 'p-tracker' });
    expect(tracker.status[0].stage).toBe('in-progress');
    expect(tracker.child_workflow_id).toBe(result.workflow_id);
    expect(tracker.child_entity_id).toBe('child-entity');
    expect(tracker.child_entity_collection).toBe('leads-collection');

    // Parent groups/summary recomputed (deliberate delta vs today's stale push).
    const parentWf = await mongo.db
      .collection('workflows')
      .findOne({ _id: 'wf-parent' });
    expect(parentWf.summary.total).toBe(2);

    // Parent timeline gains an action-internal-mirror-active event.
    const mirrorEvents = await mongo.db
      .collection('events')
      .find({ type: 'action-internal-mirror-active' })
      .toArray();
    expect(mirrorEvents).toHaveLength(1);

    // Child workflow carries parent linkage.
    const child = await mongo.db
      .collection('workflows')
      .findOne({ _id: result.workflow_id });
    expect(child.parent_action_id).toBe('p-tracker');
    expect(child.parent_workflow_id).toBe('wf-parent');
  });

  test('rejects when the parent action is not a tracker', async () => {
    await seedParent();
    await expect(
      StartWorkflow(
        buildContext({
          request: {
            workflow_type: 'onboarding',
            entity_id: 'child-entity',
            entity_collection: 'leads-collection',
            parent_action_id: 'p-a',
          },
          workflowsConfig: makeParentChildConfig(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_seed' });
  });

  test('rejects an unknown parent action', async () => {
    await seedParent();
    await expect(
      StartWorkflow(
        buildContext({
          request: {
            workflow_type: 'onboarding',
            entity_id: 'child-entity',
            entity_collection: 'leads-collection',
            parent_action_id: 'nope',
          },
          workflowsConfig: makeParentChildConfig(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'action_not_found' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preconditions + dispatch failure
// ─────────────────────────────────────────────────────────────────────────────

describe('preconditions', () => {
  test('unknown workflow_type throws unknown_workflow_type', async () => {
    await expect(
      StartWorkflow(
        buildContext({
          request: {
            workflow_type: 'nope',
            entity_id: 'lead-1',
            entity_collection: 'leads-collection',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'unknown_workflow_type' });
  });

  test('seed action type not in the workflow config throws unknown_action_type', async () => {
    await expect(
      StartWorkflow(
        buildContext({
          request: {
            workflow_type: 'onboarding',
            entity_id: 'lead-1',
            entity_collection: 'leads-collection',
            actions: [{ type: 'nope', status: 'action-required' }],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'unknown_action_type' });
  });
});

describe('post-commit dispatch failure', () => {
  test('a forced event-dispatch failure throws post_commit_dispatch_failed; the inserted docs stay committed', async () => {
    const result = StartWorkflow(
      buildContext({
        request: {
          workflow_type: 'onboarding',
          entity_id: 'lead-1',
          entity_collection: 'leads-collection',
        },
        callApi: makeCallApi({ failOn: 'events/new-event' }),
      }),
    );
    await expect(result).rejects.toMatchObject({
      code: 'post_commit_dispatch_failed',
    });
    const wf = await readOneWorkflow();
    expect(wf).not.toBeNull();
    const actions = await mongo.db.collection('actions').find({}).toArray();
    expect(actions).toHaveLength(1);
  });
});
