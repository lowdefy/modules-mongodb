/**
 * Tests for commitPlan (task 13).
 *
 * Uses MongoMemoryServer (standalone) for most tests and MongoMemoryReplSet
 * for transaction-path tests. The replica-set boot is slow; set a generous
 * timeout per the task notes.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import inMemoryMongo from '../inMemoryMongo.js';
import commitPlan from './commitPlan.js';
import { ConcurrentSubmitError } from '../errors.js';

jest.setTimeout(60000);

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal Plan for an "update" workflow commit.
 * The `workflow.doc` carries a fresh timestamp (simulating task-11 stamp),
 * and `loadedState.workflow.updated.timestamp` carries the stale one.
 */
function makePlan({
  workflowId = 'wf-1',
  loadedTimestamp = new Date('2026-01-01T00:00:00Z'),
  freshTimestamp = new Date('2026-01-02T00:00:00Z'),
  operation = 'update',
  actions = [],
  eventId = 'evt-1',
  changeLog = [],
} = {}) {
  return {
    workflow: {
      doc: {
        _id: workflowId,
        workflow_type: 'onboarding',
        updated: { timestamp: freshTimestamp },
        status: [{ stage: 'in-progress' }],
      },
      operation,
      changeLog: { before: { _id: workflowId, status: [] }, after: { _id: workflowId } },
    },
    actions,
    event: {
      doc: {
        _id: eventId,
        type: 'action-submit',
        display: {},
        references: { workflow_ids: [workflowId] },
        metadata: {},
      },
    },
    changeLog,
    trackerFires: [],
  };
}

/**
 * Default callApi mock per the shipped contract: resolves the target's
 * `:return` value — `{ eventId }` for new-event, `null` for send-notification
 * (empty default send_routine) — and throws to simulate failure.
 */
function makeCallApiMock() {
  return jest.fn(async ({ endpointId, payload }) =>
    endpointId === 'events/new-event' ? { eventId: payload._id } : null,
  );
}

/**
 * Build a context object for standalone (no transactions). Lets the caller
 * override callApi to simulate step 3/4 failures (mock-throw, never
 * `{ success: false }` envelopes).
 */
function makeContext(db, {
  loadedTimestamp = new Date('2026-01-01T00:00:00Z'),
  callApi = makeCallApiMock(),
  connection = {},
} = {}) {
  return {
    mongoDb: db,
    mongoClient: undefined,
    useTransactions: false,
    connection: {
      workflowsCollection: 'workflows',
      actionsCollection: 'actions',
      endpoints: {
        new_event: 'events/new-event',
        send_notification: 'notifications/send-notification',
      },
      ...connection,
    },
    loadedState: {
      workflow: {
        updated: { timestamp: loadedTimestamp },
      },
    },
    callApi,
    user: { profile: { name: 'Test User' } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone tests (most test cases run here for speed)
// ─────────────────────────────────────────────────────────────────────────────

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
  await mongo.db.collection('log-changes').deleteMany({});
});

// ── CAS happy path ────────────────────────────────────────────────────────────

test('CAS happy path: workflow updated, action written, CommitResult returned', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-1',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });
  await mongo.db.collection('actions').insertOne({
    _id: 'act-1',
    workflow_id: 'wf-1',
    status: [{ stage: 'action-required' }],
  });

  const plan = makePlan({
    workflowId: 'wf-1',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    actions: [
      {
        doc: { _id: 'act-1', workflow_id: 'wf-1', status: [{ stage: 'done' }] },
        operation: 'update',
        changeLog: { before: {}, after: {} },
      },
    ],
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs });
  const result = await commitPlan(ctx, plan);

  // CommitResult shape
  expect(result.workflow_id).toBe('wf-1');
  expect(result.action_ids).toEqual(['act-1']);
  expect(result.event_id).toBe('evt-1');
  expect(result.dispatchErrors).toEqual([]);

  // Workflow updated in DB with fresh timestamp
  const wfDoc = await mongo.db.collection('workflows').findOne({ _id: 'wf-1' });
  expect(wfDoc.updated.timestamp).toEqual(freshTs);

  // Action updated in DB
  const actDoc = await mongo.db.collection('actions').findOne({ _id: 'act-1' });
  expect(actDoc.status[0].stage).toBe('done');
});

// ── CAS miss path ─────────────────────────────────────────────────────────────

test('CAS miss: throws ConcurrentSubmitError BEFORE any action write', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const staleTs = new Date('2025-12-31T00:00:00Z'); // different from what's in DB

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-cas',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });
  await mongo.db.collection('actions').insertOne({
    _id: 'act-cas',
    workflow_id: 'wf-cas',
    status: [{ stage: 'action-required' }],
  });

  const plan = makePlan({
    workflowId: 'wf-cas',
    loadedTimestamp: staleTs, // stale — won't match DB
    freshTimestamp: new Date('2026-01-03T00:00:00Z'),
    actions: [
      {
        doc: { _id: 'act-cas', workflow_id: 'wf-cas', status: [{ stage: 'done' }] },
        operation: 'update',
        changeLog: { before: {}, after: {} },
      },
    ],
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: staleTs });

  await expect(commitPlan(ctx, plan)).rejects.toBeInstanceOf(ConcurrentSubmitError);
  await expect(commitPlan(ctx, plan)).rejects.toMatchObject({
    name: 'ConcurrentSubmitError',
    code: 'concurrent_submit',
  });

  // ZERO action writes — the invariant: no action write before workflow claim.
  const actDoc = await mongo.db.collection('actions').findOne({ _id: 'act-cas' });
  expect(actDoc.status[0].stage).toBe('action-required'); // unchanged
});

// ── CAS pins updated.timestamp scalar ─────────────────────────────────────────

test('CAS filter pins updated.timestamp (scalar, not whole updated object)', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  // The DB doc has extra fields on `updated` beyond `timestamp`.
  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-scalar',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs, by: 'someone', extra: 'data' },
    status: [{ stage: 'in-progress' }],
  });

  const plan = makePlan({
    workflowId: 'wf-scalar',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs });
  // If the CAS pinned the whole `updated` object instead of just timestamp,
  // this would fail (the plan doc doesn't carry `extra`/`by`). The scalar
  // filter succeeds because extra fields on `updated` don't affect the match.
  await expect(commitPlan(ctx, plan)).resolves.toMatchObject({ workflow_id: 'wf-scalar' });
});

// ── insert operation (Start path) ─────────────────────────────────────────────

test('plan.workflow.operation=insert: uses insertOneDoc with no CAS filter', async () => {
  const plan = makePlan({
    workflowId: 'wf-new',
    operation: 'insert',
    actions: [
      {
        doc: { _id: 'act-new', workflow_id: 'wf-new', status: [{ stage: 'action-required' }] },
        operation: 'insert',
        changeLog: { before: null, after: {} },
      },
    ],
  });

  const ctx = makeContext(mongo.db);
  const result = await commitPlan(ctx, plan);

  expect(result.workflow_id).toBe('wf-new');
  expect(result.action_ids).toEqual(['act-new']);

  // Workflow was inserted.
  const wfDoc = await mongo.db.collection('workflows').findOne({ _id: 'wf-new' });
  expect(wfDoc).toBeTruthy();
  expect(wfDoc.workflow_type).toBe('onboarding');

  // Action was inserted.
  const actDoc = await mongo.db.collection('actions').findOne({ _id: 'act-new' });
  expect(actDoc).toBeTruthy();
  expect(actDoc.status[0].stage).toBe('action-required');
});

// ── Concurrent submit: one wins, one throws ────────────────────────────────────

test('concurrent submit: first caller wins, second throws ConcurrentSubmitError', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs1 = new Date('2026-01-02T00:00:00Z');
  const freshTs2 = new Date('2026-01-03T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-concurrent',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const plan1 = makePlan({
    workflowId: 'wf-concurrent',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs1,
    eventId: 'evt-concurrent-1',
  });
  const plan2 = makePlan({
    workflowId: 'wf-concurrent',
    loadedTimestamp: loadedTs, // same loaded ts — concurrent race
    freshTimestamp: freshTs2,
    eventId: 'evt-concurrent-2',
  });

  const ctx1 = makeContext(mongo.db, { loadedTimestamp: loadedTs });
  const ctx2 = makeContext(mongo.db, { loadedTimestamp: loadedTs });

  const [r1, r2] = await Promise.allSettled([
    commitPlan(ctx1, plan1),
    commitPlan(ctx2, plan2),
  ]);

  const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
  const rejected = [r1, r2].filter((r) => r.status === 'rejected');

  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toBeInstanceOf(ConcurrentSubmitError);
  expect(rejected[0].reason.code).toBe('concurrent_submit');
});

// ── callApi ordering: steps 3/4/5 run after steps 1/2 ────────────────────────

test('callApi (step 3) is called after workflow and action writes commit', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-order',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callOrder = [];
  const callApi = jest.fn().mockImplementation(async ({ endpointId, payload }) => {
    // Capture DB state at the moment each callApi fires.
    const wf = await mongo.db.collection('workflows').findOne({ _id: 'wf-order' });
    callOrder.push({ endpointId, wfTimestamp: wf?.updated?.timestamp });
    return endpointId === 'events/new-event' ? { eventId: payload._id } : null;
  });

  const plan = makePlan({
    workflowId: 'wf-order',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  await commitPlan(ctx, plan);

  // Both new-event and send-notification fire after the workflow is committed.
  expect(callOrder.length).toBe(2);
  expect(callOrder[0].endpointId).toBe('events/new-event');
  expect(callOrder[0].wfTimestamp).toEqual(freshTs); // workflow already committed
  expect(callOrder[1].endpointId).toBe('notifications/send-notification');
});

// ── Step-3 payload shape ──────────────────────────────────────────────────────

test('step 3 calls callApi with the full event doc as payload', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-evtpayload',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = makeCallApiMock();

  const plan = makePlan({
    workflowId: 'wf-evtpayload',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    eventId: 'evt-payload-test',
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  await commitPlan(ctx, plan);

  expect(callApi).toHaveBeenCalledWith({
    endpointId: 'events/new-event',
    payload: expect.objectContaining({ _id: 'evt-payload-test' }),
  });
});

// ── Step-4 payload: event_ids (plural wire field) ─────────────────────────────

test('step 4 calls send-notification with event_ids plural containing the event_id', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-notif',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = makeCallApiMock();

  const plan = makePlan({
    workflowId: 'wf-notif',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    eventId: 'evt-notif-test',
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  await commitPlan(ctx, plan);

  expect(callApi).toHaveBeenCalledWith({
    endpointId: 'notifications/send-notification',
    payload: { event_ids: ['evt-notif-test'] },
  });
});

// ── Failure policy: step-3 failure ───────────────────────────────────────────

test('step-3 failure: recorded on dispatchErrors, step 4 skipped, step 5 still runs', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-step3fail',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = jest.fn()
    .mockRejectedValueOnce(new Error('events down')); // step 3 fails — callApi throws

  const changeLogEntry = { type: 'MongoDBUpdateOne', args: {}, timestamp: new Date() };
  const plan = makePlan({
    workflowId: 'wf-step3fail',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    changeLog: [changeLogEntry],
  });
  plan.workflow.doc._id = 'wf-step3fail';

  const ctx = makeContext(mongo.db, {
    loadedTimestamp: loadedTs,
    callApi,
    connection: { changeLog: { collection: 'log-changes' } },
  });

  const result = await commitPlan(ctx, plan);

  // Does NOT throw — failure is recorded.
  expect(result.event_id).toBeNull();
  expect(result.dispatchErrors).toHaveLength(1);
  expect(result.dispatchErrors[0].step).toBe(3);
  expect(result.dispatchErrors[0].error.message).toMatch(/events down/);

  // Step 4 was skipped (callApi called only once — for new-event).
  expect(callApi).toHaveBeenCalledTimes(1);

  // Step 5 still ran: change-log entry written.
  const logDoc = await mongo.db.collection('log-changes').findOne({});
  expect(logDoc).toBeTruthy();

  // Workflow was committed (steps 1–2 succeeded before the failure).
  const wfDoc = await mongo.db.collection('workflows').findOne({ _id: 'wf-step3fail' });
  expect(wfDoc.updated.timestamp).toEqual(freshTs);
});

// ── Failure policy: step-4 failure ───────────────────────────────────────────

test('step-4 failure: recorded on dispatchErrors, does not throw from commitPlan', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-step4fail',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = jest.fn()
    .mockResolvedValueOnce({ eventId: 'evt-step4fail' }) // step 3 succeeds
    .mockRejectedValueOnce(new Error('notifications down')); // step 4 fails — callApi throws

  const plan = makePlan({
    workflowId: 'wf-step4fail',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    eventId: 'evt-step4fail',
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  const result = await commitPlan(ctx, plan);

  // event_id is set (step 3 succeeded)
  expect(result.event_id).toBe('evt-step4fail');
  expect(result.dispatchErrors).toHaveLength(1);
  expect(result.dispatchErrors[0].step).toBe(4);
  expect(result.dispatchErrors[0].error.message).toMatch(/notifications down/);
});

// ── Failure policy: step-5 failure ───────────────────────────────────────────

test('step-5 failure: recorded on dispatchErrors, does not throw from commitPlan', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-step5fail',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = makeCallApiMock();

  const changeLogEntry = { type: 'MongoDBUpdateOne', args: {}, timestamp: new Date() };
  const plan = makePlan({
    workflowId: 'wf-step5fail',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    changeLog: [changeLogEntry],
    eventId: 'evt-step5fail',
  });

  const ctx = makeContext(mongo.db, {
    loadedTimestamp: loadedTs,
    callApi,
    // Use a non-existent collection via a bad collection name won't error on its own;
    // instead force it via a bad db reference.
    connection: { changeLog: { collection: 'log-changes' } },
  });

  // Override insertManyDocs by pointing at a closed DB — we instead test via
  // a context where the collection name is set but insertMany will fail if
  // mongo is closed. Instead, just verify a changeLog failure is caught by
  // explicitly forcing it with a mock at the driver level.
  //
  // Simple approach: close the mongo client to cause the write to fail.
  // But we need the same db for steps 1-2. Instead, verify the failure path
  // by seeding a plan with a bad collection name (undefined changeLog collection):

  // Reset: use a connection whose changeLog.collection resolves to undefined
  // collection — but insertManyDocs skips empty arrays. So we need a real
  // failure. We'll inject it by spying on the db.collection to throw on
  // the third call (after workflows + actions in steps 1-2, log-changes in step 5).
  const origCollection = mongo.db.collection.bind(mongo.db);
  let callCount = 0;
  jest.spyOn(mongo.db, 'collection').mockImplementation((name) => {
    if (name === 'log-changes') {
      callCount++;
      if (callCount === 1) {
        throw new Error('log-changes write failed');
      }
    }
    return origCollection(name);
  });

  const result = await commitPlan(ctx, plan);

  mongo.db.collection.mockRestore();

  expect(result.event_id).toBe('evt-step5fail');
  expect(result.dispatchErrors).toHaveLength(1);
  expect(result.dispatchErrors[0].step).toBe(5);
  expect(result.dispatchErrors[0].error.message).toMatch(/log-changes write failed/);
});

// ── Change-log skipped when empty ────────────────────────────────────────────

test('change-log step is skipped when plan.changeLog is empty', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-changelog-skip',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = makeCallApiMock();

  // No changeLog config on connection — plan.changeLog is []
  const plan = makePlan({
    workflowId: 'wf-changelog-skip',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    changeLog: [],
  });

  // No changeLog on connection — collection would be undefined; skip prevents the error.
  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  const result = await commitPlan(ctx, plan);

  expect(result.dispatchErrors).toEqual([]);

  // No log-changes docs written.
  const count = await mongo.db.collection('log-changes').countDocuments();
  expect(count).toBe(0);
});

// ── Change-log written when non-empty ─────────────────────────────────────────

test('change-log entries are written when non-empty', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-changelog-write',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const callApi = makeCallApiMock();

  const entry1 = { _id: new ObjectId(), type: 'MongoDBUpdateOne', args: {}, timestamp: new Date() };
  const entry2 = { _id: new ObjectId(), type: 'MongoDBInsertOne', args: {}, timestamp: new Date() };

  const plan = makePlan({
    workflowId: 'wf-changelog-write',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    changeLog: [entry1, entry2],
  });

  const ctx = makeContext(mongo.db, {
    loadedTimestamp: loadedTs,
    callApi,
    connection: { changeLog: { collection: 'log-changes' } },
  });

  const result = await commitPlan(ctx, plan);

  expect(result.dispatchErrors).toEqual([]);

  const count = await mongo.db.collection('log-changes').countDocuments();
  expect(count).toBe(2);
});

// ── Clean CommitResult on happy path ──────────────────────────────────────────

test('CommitResult has empty dispatchErrors on a fully clean commit', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const freshTs = new Date('2026-01-02T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-clean',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });

  const plan = makePlan({
    workflowId: 'wf-clean',
    loadedTimestamp: loadedTs,
    freshTimestamp: freshTs,
    eventId: 'evt-clean',
    actions: [
      {
        doc: { _id: 'act-clean', workflow_id: 'wf-clean', status: [{ stage: 'done' }] },
        operation: 'update',
        changeLog: { before: {}, after: {} },
      },
    ],
  });

  await mongo.db.collection('actions').insertOne({
    _id: 'act-clean',
    workflow_id: 'wf-clean',
    status: [{ stage: 'action-required' }],
  });

  const callApi = makeCallApiMock();
  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  const result = await commitPlan(ctx, plan);

  expect(result).toEqual({
    workflow_id: 'wf-clean',
    action_ids: ['act-clean'],
    event_id: 'evt-clean',
    dispatchErrors: [],
  });
});

// ── Workflow-less plan (Part 24 UpdateActionFields) ───────────────────────────

test('workflow-less plan: action written, no workflow write, workflow_id from loaded state', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-fields',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'in-progress' }],
  });
  await mongo.db.collection('actions').insertOne({
    _id: 'act-fields',
    workflow_id: 'wf-fields',
    assignees: [],
    status: [{ stage: 'done' }],
  });

  const callApi = makeCallApiMock();
  const ctx = makeContext(mongo.db, { loadedTimestamp: loadedTs, callApi });
  // The load phase supplies the workflow id for workflow-less plans.
  ctx.loadedState.workflow._id = 'wf-fields';

  const plan = {
    workflow: null,
    actions: [
      {
        doc: {
          _id: 'act-fields',
          workflow_id: 'wf-fields',
          assignees: ['u-7'],
          status: [{ stage: 'done' }],
        },
        operation: 'update',
        changeLog: { before: { assignees: [] }, after: { assignees: ['u-7'] } },
      },
    ],
    event: {
      doc: {
        _id: 'evt-fields',
        type: 'action-fields-updated',
        display: {},
        references: { workflow_ids: ['wf-fields'] },
        metadata: {},
      },
    },
    changeLog: [],
  };

  const result = await commitPlan(ctx, plan);

  expect(result.workflow_id).toBe('wf-fields');
  expect(result.action_ids).toEqual(['act-fields']);
  expect(result.event_id).toBe('evt-fields');
  expect(result.dispatchErrors).toEqual([]);

  // The action doc was updated with the new assignees.
  const actDoc = await mongo.db.collection('actions').findOne({ _id: 'act-fields' });
  expect(actDoc.assignees).toEqual(['u-7']);

  // The workflow doc is untouched (no write — same loaded timestamp).
  const wfDoc = await mongo.db.collection('workflows').findOne({ _id: 'wf-fields' });
  expect(wfDoc.updated.timestamp).toEqual(loadedTs);
});

test('workflow-less plan: a stale loaded timestamp does NOT throw ConcurrentSubmitError (no CAS)', async () => {
  const loadedTs = new Date('2026-01-01T00:00:00Z');
  const staleTs = new Date('2020-01-01T00:00:00Z'); // wildly stale; would miss a CAS

  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-fields-nocas',
    workflow_type: 'onboarding',
    updated: { timestamp: loadedTs },
    status: [{ stage: 'completed' }],
  });
  await mongo.db.collection('actions').insertOne({
    _id: 'act-fields-nocas',
    workflow_id: 'wf-fields-nocas',
    status: [{ stage: 'done' }],
  });

  const ctx = makeContext(mongo.db, { loadedTimestamp: staleTs });
  ctx.loadedState.workflow._id = 'wf-fields-nocas';

  const plan = {
    workflow: null,
    actions: [
      {
        doc: { _id: 'act-fields-nocas', workflow_id: 'wf-fields-nocas', due_date: new Date('2026-06-01') },
        operation: 'update',
        changeLog: { before: {}, after: {} },
      },
    ],
    event: {
      doc: { _id: 'evt-nocas', type: 'action-fields-updated', display: {}, references: {}, metadata: {} },
    },
    changeLog: [],
  };

  await expect(commitPlan(ctx, plan)).resolves.toMatchObject({
    workflow_id: 'wf-fields-nocas',
    dispatchErrors: [],
  });
});

// ── ConcurrentSubmitError class shape ─────────────────────────────────────────

test('ConcurrentSubmitError has correct name and code', () => {
  const err = new ConcurrentSubmitError('test');
  expect(err.name).toBe('ConcurrentSubmitError');
  expect(err.code).toBe('concurrent_submit');
  expect(err).toBeInstanceOf(ConcurrentSubmitError);
  // Is a WorkflowEngineError
  const { WorkflowEngineError } = require('../errors.js');
  expect(err).toBeInstanceOf(WorkflowEngineError);
});

// ─────────────────────────────────────────────────────────────────────────────
// Replica-set transaction path tests
// (steps 1–2 atomic; steps 3–5 outside)
// ─────────────────────────────────────────────────────────────────────────────

describe('transaction path (MongoMemoryReplSet)', () => {
  let replSet;
  let replUri;
  let replClient;
  let replDb;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    replUri = replSet.getUri();
    replClient = new MongoClient(replUri);
    await replClient.connect();
    replDb = replClient.db('test');
  });

  afterAll(async () => {
    await replClient.close();
    await replSet.stop();
  });

  beforeEach(async () => {
    await replDb.collection('workflows').deleteMany({});
    await replDb.collection('actions').deleteMany({});
  });

  function makeReplContext(db, client, {
    loadedTimestamp = new Date('2026-01-01T00:00:00Z'),
    callApi = makeCallApiMock(),
    connection = {},
  } = {}) {
    return {
      mongoDb: db,
      mongoClient: client,
      useTransactions: true,
      connection: {
        workflowsCollection: 'workflows',
        actionsCollection: 'actions',
        endpoints: {
          new_event: 'events/new-event',
          send_notification: 'notifications/send-notification',
        },
        ...connection,
      },
      loadedState: {
        workflow: {
          updated: { timestamp: loadedTimestamp },
        },
      },
      callApi,
      user: { profile: { name: 'Repl User' } },
    };
  }

  test('transaction path: steps 1–2 commit atomically (happy path)', async () => {
    const loadedTs = new Date('2026-01-01T00:00:00Z');
    const freshTs = new Date('2026-01-02T00:00:00Z');

    await replDb.collection('workflows').insertOne({
      _id: 'wf-txn',
      workflow_type: 'onboarding',
      updated: { timestamp: loadedTs },
      status: [{ stage: 'in-progress' }],
    });
    await replDb.collection('actions').insertOne({
      _id: 'act-txn',
      workflow_id: 'wf-txn',
      status: [{ stage: 'action-required' }],
    });

    const plan = makePlan({
      workflowId: 'wf-txn',
      loadedTimestamp: loadedTs,
      freshTimestamp: freshTs,
      actions: [
        {
          doc: { _id: 'act-txn', workflow_id: 'wf-txn', status: [{ stage: 'done' }] },
          operation: 'update',
          changeLog: { before: {}, after: {} },
        },
      ],
    });

    const ctx = makeReplContext(replDb, replClient, { loadedTimestamp: loadedTs });
    const result = await commitPlan(ctx, plan);

    expect(result.workflow_id).toBe('wf-txn');
    expect(result.action_ids).toEqual(['act-txn']);
    expect(result.dispatchErrors).toEqual([]);

    const wfDoc = await replDb.collection('workflows').findOne({ _id: 'wf-txn' });
    expect(wfDoc.updated.timestamp).toEqual(freshTs);
    const actDoc = await replDb.collection('actions').findOne({ _id: 'act-txn' });
    expect(actDoc.status[0].stage).toBe('done');
  });

  test('transaction CAS miss throws ConcurrentSubmitError with zero action writes', async () => {
    const loadedTs = new Date('2026-01-01T00:00:00Z');
    const staleTs = new Date('2025-12-31T00:00:00Z');

    await replDb.collection('workflows').insertOne({
      _id: 'wf-txn-cas',
      workflow_type: 'onboarding',
      updated: { timestamp: loadedTs },
      status: [{ stage: 'in-progress' }],
    });
    await replDb.collection('actions').insertOne({
      _id: 'act-txn-cas',
      workflow_id: 'wf-txn-cas',
      status: [{ stage: 'action-required' }],
    });

    const plan = makePlan({
      workflowId: 'wf-txn-cas',
      loadedTimestamp: staleTs,
      freshTimestamp: new Date('2026-01-03T00:00:00Z'),
      actions: [
        {
          doc: { _id: 'act-txn-cas', workflow_id: 'wf-txn-cas', status: [{ stage: 'done' }] },
          operation: 'update',
          changeLog: { before: {}, after: {} },
        },
      ],
    });

    const ctx = makeReplContext(replDb, replClient, { loadedTimestamp: staleTs });

    await expect(commitPlan(ctx, plan)).rejects.toBeInstanceOf(ConcurrentSubmitError);

    // Action must be unchanged — no write before the failed claim.
    const actDoc = await replDb.collection('actions').findOne({ _id: 'act-txn-cas' });
    expect(actDoc.status[0].stage).toBe('action-required');
  });

  test('transaction path: steps 3/4/5 fire after the txn commits (not inside retry loop)', async () => {
    const loadedTs = new Date('2026-01-01T00:00:00Z');
    const freshTs = new Date('2026-01-02T00:00:00Z');

    await replDb.collection('workflows').insertOne({
      _id: 'wf-txn-order',
      workflow_type: 'onboarding',
      updated: { timestamp: loadedTs },
      status: [{ stage: 'in-progress' }],
    });

    const callOrder = [];
    const callApi = jest.fn().mockImplementation(async ({ endpointId, payload }) => {
      // Verify the workflow is already committed (fresh ts visible) when callApi fires.
      const wf = await replDb.collection('workflows').findOne({ _id: 'wf-txn-order' });
      callOrder.push({ endpointId, wfTimestamp: wf?.updated?.timestamp });
      return endpointId === 'events/new-event' ? { eventId: payload._id } : null;
    });

    const plan = makePlan({
      workflowId: 'wf-txn-order',
      loadedTimestamp: loadedTs,
      freshTimestamp: freshTs,
    });

    const ctx = makeReplContext(replDb, replClient, { loadedTimestamp: loadedTs, callApi });
    await commitPlan(ctx, plan);

    expect(callOrder).toHaveLength(2);
    expect(callOrder[0].endpointId).toBe('events/new-event');
    expect(callOrder[0].wfTimestamp).toEqual(freshTs); // committed before step 3
    expect(callOrder[1].endpointId).toBe('notifications/send-notification');
  });

  test('insert operation on transaction path: no CAS filter, steps 2–5 identical', async () => {
    const plan = makePlan({
      workflowId: 'wf-txn-insert',
      operation: 'insert',
      actions: [
        {
          doc: { _id: 'act-txn-insert', workflow_id: 'wf-txn-insert', status: [{ stage: 'action-required' }] },
          operation: 'insert',
          changeLog: { before: null, after: {} },
        },
      ],
    });

    const ctx = makeReplContext(replDb, replClient);
    const result = await commitPlan(ctx, plan);

    expect(result.workflow_id).toBe('wf-txn-insert');
    expect(result.action_ids).toEqual(['act-txn-insert']);
    expect(result.dispatchErrors).toEqual([]);

    const wfDoc = await replDb.collection('workflows').findOne({ _id: 'wf-txn-insert' });
    expect(wfDoc).toBeTruthy();
    const actDoc = await replDb.collection('actions').findOne({ _id: 'act-txn-insert' });
    expect(actDoc).toBeTruthy();
  });
});
