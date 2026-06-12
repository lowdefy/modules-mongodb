/**
 * Integration tests for CloseWorkflow (task 17). Drives the real resolver
 * against an in-memory Mongo (standalone, no transactions) with a mock callApi
 * — mirrors SubmitWorkflowAction.test.js. The post-close-submit carve-out test
 * also drives the real SubmitWorkflowAction handler.
 */
import { clearMongoClientCache } from '../../mongo/getMongoDb.js';
import inMemoryMongo from '../../shared/inMemoryMongo.js';
import CloseWorkflow from './CloseWorkflow.js';
import SubmitWorkflowAction from '../SubmitWorkflowAction/SubmitWorkflowAction.js';

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date('2026-05-20T00:00:00Z'),
  user: { id: 'u1', name: 'Stamper' },
};

function makeWorkflowsConfig() {
  return [
    {
      type: 'onboarding',
      entity_collection: 'leads-collection',
      entity_ref_key: 'lead_ids',
      starting_actions: [{ type: 'qualify', status: 'action-required' }],
      action_groups: [{ id: 'phase-1' }, { id: 'phase-2' }],
      actions: [
        {
          type: 'qualify',
          kind: 'check',
          action_group: 'phase-1',
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
        {
          type: 'kickoff',
          kind: 'check',
          action_group: 'phase-2',
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
        {
          // A post-close required action — survives the sweep when non-blocked.
          type: 'invoice',
          kind: 'check',
          required_after_close: true,
          access: { 'test-app': { view: true, edit: ['account-manager'] } },
        },
        {
          type: 'track-child',
          kind: 'tracker',
          tracker: { child_workflow_type: 'onboarding' },
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
    roles: ['account-manager'],
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
      user,
    },
    callApi: callApi ?? makeCallApi(),
  };
}

async function seedWorkflow({ _id = 'wf-1', overrides = {} } = {}) {
  await mongo.db.collection('workflows').insertOne({
    _id,
    workflow_type: 'onboarding',
    entity_id: 'lead-1',
    entity_collection: 'leads-collection',
    entity_ref_key: 'lead_ids',
    status: [{ stage: 'active', event_id: 'e0', created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
    created: changeStamp,
    updated: changeStamp,
    ...overrides,
  });
}

async function seedAction({
  _id,
  type,
  action_group = null,
  stage = 'action-required',
  workflow_id = 'wf-1',
  kind = 'check',
  extra = {},
}) {
  await mongo.db.collection('actions').insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key: null,
    action_group,
    status: [{ stage, event_id: 'e0', created: changeStamp }],
    metadata: {},
    created: changeStamp,
    updated: changeStamp,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// completed push + sweep with required_after_close exception
// ─────────────────────────────────────────────────────────────────────────────

describe('close push + sweep', () => {
  test('pushes completed (not closed) and emits workflow-closed', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'action-required' });
    const calls = [];

    const result = await CloseWorkflow(
      buildContext({ request: { workflow_id: 'wf-1' }, callApi: makeCallApi({ calls }) }),
    );

    const wf = await mongo.db.collection('workflows').findOne({ _id: 'wf-1' });
    expect(wf.status[0].stage).toBe('completed');
    expect(wf.status[0].event_id).toBe(result.event_id);
    expect(wf.status).toHaveLength(2);
    const eventDoc = await mongo.db.collection('events').findOne({ _id: result.event_id });
    expect(eventDoc.type).toBe('workflow-closed');
    const eventCalls = calls.filter((c) => c.endpointId === 'events/new-event');
    expect(eventCalls).toHaveLength(1);
  });

  test('sweeps non-protected actions; preserves done; a non-blocked required_after_close survivor keeps its stage', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'action-required' });
    await seedAction({ _id: 'a2', type: 'kickoff', stage: 'done' });
    await seedAction({ _id: 'a3', type: 'invoice', stage: 'action-required' }); // required_after_close

    const result = await CloseWorkflow(buildContext({ request: { workflow_id: 'wf-1' } }));

    const a1 = await mongo.db.collection('actions').findOne({ _id: 'a1' });
    const a2 = await mongo.db.collection('actions').findOne({ _id: 'a2' });
    const a3 = await mongo.db.collection('actions').findOne({ _id: 'a3' });
    expect(a1.status[0].stage).toBe('not-required'); // swept
    expect(a2.status[0].stage).toBe('done'); // preserved
    expect(a3.status[0].stage).toBe('action-required'); // survivor
    expect(result.action_ids).toEqual(['a1']);
  });

  test('a BLOCKED required_after_close action is swept (blocked-action exception)', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a3', type: 'invoice', stage: 'blocked' }); // required_after_close + blocked

    const result = await CloseWorkflow(buildContext({ request: { workflow_id: 'wf-1' } }));
    const a3 = await mongo.db.collection('actions').findOne({ _id: 'a3' });
    expect(a3.status[0].stage).toBe('not-required');
    expect(result.action_ids).toEqual(['a3']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle event override (params.lifecycle_event_override)
// ─────────────────────────────────────────────────────────────────────────────

describe('lifecycle event override', () => {
  test('lifecycle_event_override.display overrides the event title for the named app; non-overridden apps fall through to default', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'action-required' });
    const calls = [];

    const result = await CloseWorkflow(
      buildContext({
        request: {
          workflow_id: 'wf-1',
          lifecycle_event_override: {
            display: {
              'test-app': { title: 'Onboarding kicked off for {{ workflow.entity_id }}' },
            },
          },
        },
        callApi: makeCallApi({ calls }),
      }),
    );
    const eventDoc = await mongo.db
      .collection('events')
      .findOne({ _id: result.event_id });
    expect(eventDoc).not.toBeNull();
    // Override title rendered against lifecycle context ({ user, workflow, signal }).
    expect(eventDoc.display['test-app'].title).toBe('Onboarding kicked off for lead-1');
  });

  test('no lifecycle_event_override → engine default title unchanged', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'action-required' });
    const calls = [];

    const result = await CloseWorkflow(
      buildContext({
        request: { workflow_id: 'wf-1' },
        callApi: makeCallApi({ calls }),
      }),
    );
    const eventDoc = await mongo.db
      .collection('events')
      .findOne({ _id: result.event_id });
    expect(eventDoc).not.toBeNull();
    expect(eventDoc.display['test-app'].title).toBe('Test User closed onboarding');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-close submit carve-out stays reachable
// ─────────────────────────────────────────────────────────────────────────────

describe('post-close submit carve-out (D2)', () => {
  test('close → required_after_close survivor → a post-close submit on it succeeds', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a3', type: 'invoice', stage: 'action-required' }); // required_after_close

    await CloseWorkflow(buildContext({ request: { workflow_id: 'wf-1' } }));

    // The survivor is still action-required after the close.
    let a3 = await mongo.db.collection('actions').findOne({ _id: 'a3' });
    expect(a3.status[0].stage).toBe('action-required');

    // A post-close submit on it succeeds (review-less check action → done).
    await SubmitWorkflowAction(
      buildContext({ request: { action_id: 'a3', signal: 'submit' } }),
    );
    a3 = await mongo.db.collection('actions').findOne({ _id: 'a3' });
    expect(a3.status[0].stage).toBe('done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle preconditions
// ─────────────────────────────────────────────────────────────────────────────

describe('lifecycle preconditions', () => {
  test('close on a completed workflow is an idempotent no-op (empty result, no event, fires nothing)', async () => {
    await seedWorkflow({
      overrides: { status: [{ stage: 'completed', event_id: 'e0', created: changeStamp }] },
    });
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'done' });
    const calls = [];

    const result = await CloseWorkflow(
      buildContext({ request: { workflow_id: 'wf-1' }, callApi: makeCallApi({ calls }) }),
    );

    expect(result).toEqual({ action_ids: [], event_id: null, tracker_fired: [] });
    expect(calls).toHaveLength(0); // no event dispatched
  });

  test('close on a cancelled workflow throws stage_rejects_close', async () => {
    await seedWorkflow({
      overrides: { status: [{ stage: 'cancelled', event_id: 'e0', created: changeStamp }] },
    });
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'not-required' });

    await expect(
      CloseWorkflow(buildContext({ request: { workflow_id: 'wf-1' } })),
    ).rejects.toMatchObject({ code: 'stage_rejects_close' });
  });

  test('a missing workflow throws workflow_not_found', async () => {
    await expect(
      CloseWorkflow(buildContext({ request: { workflow_id: 'nope' } })),
    ).rejects.toMatchObject({ code: 'workflow_not_found' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tracker fire (parent → done)
// ─────────────────────────────────────────────────────────────────────────────

describe('tracker cascade', () => {
  async function seedParentWithTracker({ trackerStage = 'in-progress' } = {}) {
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
    await mongo.db.collection('actions').insertOne({
      _id: 'p-a',
      workflow_id: 'wf-parent',
      type: 'qualify',
      kind: 'check',
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
      tracker: { child_workflow_type: 'onboarding' },
      child_workflow_id: 'wf-child',
      access: { 'test-app': { view: true } },
      workflow_type: 'onboarding',
      status: [{ stage: trackerStage, event_id: 'e0', created: changeStamp }],
      metadata: {},
      created: changeStamp,
      updated: changeStamp,
    });
  }

  test('close a child → parent tracker lands done', async () => {
    await seedParentWithTracker();
    await seedWorkflow({
      _id: 'wf-child',
      overrides: { parent_action_id: 'p-tracker', parent_workflow_id: 'wf-parent' },
    });
    await seedAction({ _id: 'c-a1', type: 'qualify', stage: 'action-required', workflow_id: 'wf-child' });

    const result = await CloseWorkflow(
      buildContext({ request: { workflow_id: 'wf-child' } }),
    );

    expect(result.tracker_fired).toHaveLength(1);
    expect(result.tracker_fired[0]).toEqual({
      parent_action_id: 'p-tracker',
      parent_workflow_id: 'wf-parent',
      new_status: 'done',
    });
    const tracker = await mongo.db.collection('actions').findOne({ _id: 'p-tracker' });
    expect(tracker.status[0].stage).toBe('done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-commit dispatch failure
// ─────────────────────────────────────────────────────────────────────────────

describe('post-commit dispatch failure', () => {
  test('a failing event dispatch throws post_commit_dispatch_failed while the committed docs stay durable', async () => {
    await seedWorkflow();
    await seedAction({ _id: 'a1', type: 'qualify', stage: 'action-required' });

    await expect(
      CloseWorkflow(
        buildContext({
          request: { workflow_id: 'wf-1' },
          callApi: makeCallApi({ failOn: 'events/new-event' }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'post_commit_dispatch_failed' });

    const wf = await mongo.db.collection('workflows').findOne({ _id: 'wf-1' });
    expect(wf.status[0].stage).toBe('completed');
    const a1 = await mongo.db.collection('actions').findOne({ _id: 'a1' });
    expect(a1.status[0].stage).toBe('not-required');
  });
});
