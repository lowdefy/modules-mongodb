/**
 * Integration tests for runTrackerCascade (task 16) — the tracker cascade LOOP.
 *
 * Re-homes the two handleSubmit-driven cascade describe blocks that task 15
 * skipped in `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.test.js`
 * (3-level chain + depth-limit overflow) against the real cascade, plus the
 * gone-parent + FSM-no-op-skip + CAS-retry branches (acceptance criteria).
 *
 * Drives the real load → planTrackerLevel → commitPlan cycle against an
 * in-memory Mongo (standalone, no transactions) with a mock callApi per the
 * shipped contract.
 */
import inMemoryMongo from '../inMemoryMongo.js';
import runTrackerCascade from './runTrackerCascade.js';

jest.setTimeout(60000);

const changeStamp = {
  timestamp: new Date('2026-05-20T00:00:00Z'),
  user: { id: 'u1', profile: { name: 'Stamper' } },
};

// One-tracker-only parent: auto-completes when its tracker flips terminal.
const oneTrackerParent = {
  type: 'one-tracker-parent',
  entity_collection: 'parents',
  entity_ref_key: 'parent_ids',
  action_groups: [],
  actions: [{ type: 'track-child', kind: 'tracker' }],
};
// Two-action parent: stays active (the form action keeps it non-terminal).
const twoActionParent = {
  type: 'two-action-parent',
  entity_collection: 'parents',
  entity_ref_key: 'parent_ids',
  action_groups: [],
  actions: [
    { type: 'qualify', kind: 'form' },
    { type: 'track-child', kind: 'tracker' },
  ],
};

const WORKFLOWS_CONFIG = [oneTrackerParent, twoActionParent];

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection('workflows').deleteMany({});
  await mongo.db.collection('actions').deleteMany({});
  await mongo.db.collection('events').deleteMany({});
});

function makeCallApi({ calls = [] } = {}) {
  return async ({ endpointId, payload }) => {
    calls.push({ endpointId, payload });
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
    if (endpointId === 'notifications/send-notification') return null;
    throw new Error(`unexpected callApi: ${endpointId}`);
  };
}

function makeBaseContext({ callApi } = {}) {
  return {
    mongoDb: mongo.db,
    mongoClient: undefined,
    useTransactions: false,
    connection: {
      entry_id: 'workflows',
      workflowsCollection: 'workflows',
      actionsCollection: 'actions',
      app_name: 'test-app',
      endpoints: {
        new_event: 'events/new-event',
        send_notification: 'notifications/send-notification',
      },
    },
    workflowsConfig: WORKFLOWS_CONFIG,
    user: changeStamp.user,
    now: changeStamp,
    newId: () => 'never-used-no-inserts',
    event_id: 'BASE-EVENT',
    lowdefyContext: {},
    callApi: callApi ?? makeCallApi(),
  };
}

async function seedWorkflow({
  _id,
  workflow_type,
  stage = 'active',
  parent_action_id = null,
  parent_workflow_id = null,
}) {
  await mongo.db.collection('workflows').insertOne({
    _id,
    workflow_type,
    entity_id: `${_id}-entity`,
    entity_collection: 'parents',
    entity_ref_key: 'parent_ids',
    parent_action_id,
    parent_workflow_id,
    status: [{ stage, event_id: 'e0', created: changeStamp }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
    created: changeStamp,
    updated: changeStamp,
  });
}

async function seedAction({
  _id,
  workflow_id,
  type,
  kind = 'form',
  stage = 'action-required',
  child_workflow_id = null,
}) {
  await mongo.db.collection('actions').insertOne({
    _id,
    workflow_id,
    type,
    kind,
    key: null,
    action_group: null,
    child_workflow_id,
    tracker: kind === 'tracker' ? { workflow_type: 'child' } : null,
    status: [{ stage, event_id: 'e0', created: changeStamp }],
    metadata: {},
    created: changeStamp,
    updated: changeStamp,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-level-deep multi-workflow cascade
// ─────────────────────────────────────────────────────────────────────────────

describe('3-level cascade', () => {
  // C completed (handled by the base submit) → fires onto B's tracker. B is a
  // one-tracker parent → B auto-completes → fires onto A's tracker. A is a
  // two-action parent (qualify in-review) → A does NOT auto-complete → chain
  // stops. Two levels run from one initial fire.
  async function seedChain() {
    await seedWorkflow({ _id: 'wf-A', workflow_type: 'two-action-parent' });
    await seedAction({ _id: 'qualify-A', workflow_id: 'wf-A', type: 'qualify', stage: 'in-review' });
    await seedAction({
      _id: 'track-B', workflow_id: 'wf-A', type: 'track-child', kind: 'tracker',
      stage: 'in-progress', child_workflow_id: 'wf-B',
    });

    await seedWorkflow({
      _id: 'wf-B', workflow_type: 'one-tracker-parent',
      parent_action_id: 'track-B', parent_workflow_id: 'wf-A',
    });
    await seedAction({
      _id: 'track-C', workflow_id: 'wf-B', type: 'track-child', kind: 'tracker',
      stage: 'in-progress', child_workflow_id: 'wf-C',
    });

    // wf-C is the leaf the base submit completed; the cascade starts above it.
    await seedWorkflow({
      _id: 'wf-C', workflow_type: 'one-tracker-parent',
      parent_action_id: 'track-C', parent_workflow_id: 'wf-B', stage: 'completed',
    });
  }

  test('propagates two levels; fires carry the FSM-resolved stage', async () => {
    await seedChain();
    const initial = [
      { parentWorkflowId: 'wf-B', parentActionId: 'track-C', signal: 'internal_mirror_child_completed' },
    ];

    const result = await runTrackerCascade(initial, makeBaseContext());

    expect(result.cascadeErrors).toEqual([]);
    expect(result.dispatchErrors).toEqual([]);
    expect(result.fires).toEqual([
      { parent_action_id: 'track-C', parent_workflow_id: 'wf-B', new_status: 'done' },
      { parent_action_id: 'track-B', parent_workflow_id: 'wf-A', new_status: 'done' },
    ]);
  });

  test('each level writes its parent workflow + tracker action; B auto-completes, A does not', async () => {
    await seedChain();
    await runTrackerCascade(
      [{ parentWorkflowId: 'wf-B', parentActionId: 'track-C', signal: 'internal_mirror_child_completed' }],
      makeBaseContext(),
    );

    const trackC = await mongo.db.collection('actions').findOne({ _id: 'track-C' });
    expect(trackC.status[0].stage).toBe('done');
    const wfB = await mongo.db.collection('workflows').findOne({ _id: 'wf-B' });
    expect(wfB.status[0].stage).toBe('completed');

    const trackB = await mongo.db.collection('actions').findOne({ _id: 'track-B' });
    expect(trackB.status[0].stage).toBe('done');
    const wfA = await mongo.db.collection('workflows').findOne({ _id: 'wf-A' });
    expect(wfA.status[0].stage).toBe('active'); // qualify still in-review

    // One mirror event per committed level (fresh event_id each).
    const events = await mongo.db.collection('events').find({}).toArray();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === 'action-internal-mirror-completed')).toBe(true);
    expect(new Set(events.map((e) => e._id)).size).toBe(2);
  });

  test('a fresh event_id per level threads onto that level only (no base event_id reuse)', async () => {
    await seedChain();
    await runTrackerCascade(
      [{ parentWorkflowId: 'wf-B', parentActionId: 'track-C', signal: 'internal_mirror_child_completed' }],
      makeBaseContext(),
    );
    const trackC = await mongo.db.collection('actions').findOne({ _id: 'track-C' });
    const trackB = await mongo.db.collection('actions').findOne({ _id: 'track-B' });
    expect(trackC.status[0].event_id).not.toBe('BASE-EVENT');
    expect(trackB.status[0].event_id).not.toBe('BASE-EVENT');
    expect(trackC.status[0].event_id).not.toBe(trackB.status[0].event_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wide-but-shallow: depth guard does NOT trip on fan-out
// ─────────────────────────────────────────────────────────────────────────────

test('wide shallow cascade (many parents, depth 1) does not trip the depth guard', async () => {
  // One initial fire per parent, all at depth 1; each parent stays active.
  for (let i = 0; i < 15; i += 1) {
    await seedWorkflow({ _id: `wf-${i}`, workflow_type: 'two-action-parent' });
    await seedAction({ _id: `qualify-${i}`, workflow_id: `wf-${i}`, type: 'qualify', stage: 'in-review' });
    await seedAction({
      _id: `track-${i}`, workflow_id: `wf-${i}`, type: 'track-child', kind: 'tracker', stage: 'in-progress',
    });
  }
  const initial = Array.from({ length: 15 }, (_, i) => ({
    parentWorkflowId: `wf-${i}`, parentActionId: `track-${i}`, signal: 'internal_mirror_child_completed',
  }));

  const result = await runTrackerCascade(initial, makeBaseContext());

  expect(result.cascadeErrors).toEqual([]);
  expect(result.fires).toHaveLength(15);
});

// ─────────────────────────────────────────────────────────────────────────────
// Depth guard trips on a genuinely deep cycle
// ─────────────────────────────────────────────────────────────────────────────

test('depth guard throws TrackerCascadeDepthError on a chain deeper than MAX_DEPTH', async () => {
  // 12 single-tracker parents, each auto-completing and firing onto the next —
  // the chain exceeds MAX_DEPTH (10).
  for (let i = 0; i <= 12; i += 1) {
    await seedWorkflow({
      _id: `wf-${i}`, workflow_type: 'one-tracker-parent',
      parent_action_id: i < 12 ? `track-${i + 1}` : null,
      parent_workflow_id: i < 12 ? `wf-${i + 1}` : null,
    });
    await seedAction({
      _id: `track-${i}`, workflow_id: `wf-${i}`, type: 'track-child', kind: 'tracker',
      stage: 'in-progress', child_workflow_id: i > 0 ? `wf-${i - 1}` : null,
    });
  }

  await expect(
    runTrackerCascade(
      [{ parentWorkflowId: 'wf-0', parentActionId: 'track-0', signal: 'internal_mirror_child_completed' }],
      makeBaseContext(),
    ),
  ).rejects.toMatchObject({ code: 'tracker_depth_exceeded' });
});

// ─────────────────────────────────────────────────────────────────────────────
// fire.payload passthrough — Start's child link fields land on the parent doc
// ─────────────────────────────────────────────────────────────────────────────

test('a fire carrying payload.fields sets those fields on the parent tracker doc alongside the transition', async () => {
  // Start's tracker-child fire shape (task 17): payload.fields carries the
  // parent↔child link fields, forwarded into planActionTransition (task 23).
  await seedWorkflow({ _id: 'wf-A', workflow_type: 'two-action-parent' });
  await seedAction({ _id: 'qualify-1', workflow_id: 'wf-A', type: 'qualify', stage: 'in-review' });
  await seedAction({
    _id: 'track-1', workflow_id: 'wf-A', type: 'track-child', kind: 'tracker', stage: 'action-required',
  });

  const result = await runTrackerCascade(
    [
      {
        parentWorkflowId: 'wf-A',
        parentActionId: 'track-1',
        signal: 'internal_mirror_child_active',
        payload: {
          fields: {
            child_workflow_id: 'wf-child-new',
            child_entity_id: 'ent-child',
            child_entity_collection: 'children',
          },
        },
      },
    ],
    makeBaseContext(),
  );

  expect(result.cascadeErrors).toEqual([]);
  expect(result.fires).toEqual([
    { parent_action_id: 'track-1', parent_workflow_id: 'wf-A', new_status: 'in-progress' },
  ]);
  const track1 = await mongo.db.collection('actions').findOne({ _id: 'track-1' });
  expect(track1.status[0].stage).toBe('in-progress');
  expect(track1.child_workflow_id).toBe('wf-child-new');
  expect(track1.child_entity_id).toBe('ent-child');
  expect(track1.child_entity_collection).toBe('children');
});

// ─────────────────────────────────────────────────────────────────────────────
// FSM no-op skip — silent, no commit
// ─────────────────────────────────────────────────────────────────────────────

test('FSM no-op level skips commit entirely: parent unwritten, no event, no fire, no error', async () => {
  // Tracker already `done`; internal_mirror_child_completed has no cell from
  // done → resolveSignal returns null → planTrackerLevel returns null.
  await seedWorkflow({ _id: 'wf-A', workflow_type: 'one-tracker-parent' });
  await seedAction({
    _id: 'track-1', workflow_id: 'wf-A', type: 'track-child', kind: 'tracker', stage: 'done',
  });

  const calls = [];
  const result = await runTrackerCascade(
    [{ parentWorkflowId: 'wf-A', parentActionId: 'track-1', signal: 'internal_mirror_child_completed' }],
    makeBaseContext({ callApi: makeCallApi({ calls }) }),
  );

  expect(result.fires).toEqual([]);
  expect(result.cascadeErrors).toEqual([]);
  expect(result.dispatchErrors).toEqual([]);
  // No parent write — updated stamp unchanged.
  const wfA = await mongo.db.collection('workflows').findOne({ _id: 'wf-A' });
  expect(wfA.updated.timestamp).toEqual(changeStamp.timestamp);
  expect(wfA.status).toHaveLength(1); // no completed push
  // No mirror event.
  expect(calls).toHaveLength(0);
  expect(await mongo.db.collection('events').countDocuments()).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Gone-parent — recorded, not thrown; remaining fires still run
// ─────────────────────────────────────────────────────────────────────────────

describe('gone parent', () => {
  test('missing parent workflow records workflow_not_found and continues', async () => {
    // First fire's parent workflow is gone; second fire is healthy.
    await seedWorkflow({ _id: 'wf-ok', workflow_type: 'two-action-parent' });
    await seedAction({ _id: 'qualify-ok', workflow_id: 'wf-ok', type: 'qualify', stage: 'in-review' });
    await seedAction({
      _id: 'track-ok', workflow_id: 'wf-ok', type: 'track-child', kind: 'tracker', stage: 'in-progress',
    });

    const result = await runTrackerCascade(
      [
        { parentWorkflowId: 'wf-gone', parentActionId: 'track-x', signal: 'internal_mirror_child_completed' },
        { parentWorkflowId: 'wf-ok', parentActionId: 'track-ok', signal: 'internal_mirror_child_completed' },
      ],
      makeBaseContext(),
    );

    expect(result.cascadeErrors).toHaveLength(1);
    expect(result.cascadeErrors[0].error.code).toBe('workflow_not_found');
    expect(result.cascadeErrors[0].fire.parentWorkflowId).toBe('wf-gone');
    // The healthy fire still ran.
    expect(result.fires).toEqual([
      { parent_action_id: 'track-ok', parent_workflow_id: 'wf-ok', new_status: 'done' },
    ]);
  });

  test('missing parent action doc records missing_target (distinct from the silent no-op)', async () => {
    // Workflow loads, but parentActionId matches no action doc on it.
    await seedWorkflow({ _id: 'wf-A', workflow_type: 'two-action-parent' });
    await seedAction({ _id: 'qualify-A', workflow_id: 'wf-A', type: 'qualify', stage: 'in-review' });

    const result = await runTrackerCascade(
      [{ parentWorkflowId: 'wf-A', parentActionId: 'ghost-tracker', signal: 'internal_mirror_child_completed' }],
      makeBaseContext(),
    );

    expect(result.fires).toEqual([]);
    expect(result.cascadeErrors).toHaveLength(1);
    expect(result.cascadeErrors[0].error.code).toBe('missing_target');
    expect(result.cascadeErrors[0].fire.parentActionId).toBe('ghost-tracker');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-level CAS retry — bounded, never propagates
// ─────────────────────────────────────────────────────────────────────────────

// A one-shot racing db proxy: the FIRST workflows `findOneAndUpdate` (commit
// step 1) bumps the stored `updated.timestamp` BEFORE delegating, so the
// CAS filter (pinned on the load-time timestamp) misses → ConcurrentSubmitError.
// Subsequent commits delegate untouched, so the retry's fresh load gives a
// matching anchor and the level commits.
function makeRacingDb(db, { collectionName = 'workflows' } = {}) {
  let raced = false;
  return {
    collection(name) {
      const real = db.collection(name);
      if (name !== collectionName) return real;
      return new Proxy(real, {
        get(target, prop, receiver) {
          if (prop === 'findOneAndUpdate') {
            return async (filter, update, options) => {
              if (!raced) {
                raced = true;
                await db.collection(name).updateOne(
                  { _id: filter._id },
                  { $set: { 'updated.timestamp': new Date('2099-01-01T00:00:00Z') } },
                );
              }
              return target.findOneAndUpdate(filter, update, options);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

describe('per-level CAS retry', () => {
  test('a single transient CAS miss retries and the level commits', async () => {
    await seedWorkflow({ _id: 'wf-A', workflow_type: 'two-action-parent' });
    await seedAction({ _id: 'qualify-A', workflow_id: 'wf-A', type: 'qualify', stage: 'in-review' });
    await seedAction({
      _id: 'track-1', workflow_id: 'wf-A', type: 'track-child', kind: 'tracker', stage: 'in-progress',
    });

    const context = makeBaseContext();
    context.mongoDb = makeRacingDb(mongo.db);

    const result = await runTrackerCascade(
      [{ parentWorkflowId: 'wf-A', parentActionId: 'track-1', signal: 'internal_mirror_child_completed' }],
      context,
    );

    expect(result.cascadeErrors).toEqual([]);
    expect(result.fires).toEqual([
      { parent_action_id: 'track-1', parent_workflow_id: 'wf-A', new_status: 'done' },
    ]);
    const track1 = await mongo.db.collection('actions').findOne({ _id: 'track-1' });
    expect(track1.status[0].stage).toBe('done');
  });
});
