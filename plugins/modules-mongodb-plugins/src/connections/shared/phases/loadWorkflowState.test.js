import gateCases from '../../../../../../modules/workflows/resolvers/__fixtures__/gates.fixtures.js';
import inMemoryMongo from '../inMemoryMongo.js';
import loadWorkflowState, { gateAllows } from './loadWorkflowState.js';

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
});

const APP = 'demo';

const workflowsConfig = [
  {
    type: 'onboarding',
    entity_collection: 'companies',
    starting_actions: [{ type: 'collect-docs', status: 'action-required' }],
    actions: [
      {
        type: 'collect-docs',
        kind: 'form',
        allow_not_required: true,
        access: {
          [APP]: {
            view: true,
            edit: ['account-manager'],
            review: ['compliance-officer'],
            error: ['support-rep'],
          },
        },
      },
      {
        type: 'final-audit',
        kind: 'check',
        required_after_close: true,
        access: { [APP]: { view: true, edit: true } },
      },
    ],
  },
];

function makeContext({ user, connection } = {}) {
  return {
    mongoDb: mongo.db,
    connection: { app_name: APP, ...connection },
    workflowsConfig,
    user: user ?? { apps: { [APP]: { roles: ['account-manager'] } } },
  };
}

async function seedWorkflow({ stage = 'in-progress' } = {}) {
  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-1',
    workflow_type: 'onboarding',
    status: [{ stage }],
    updated: { timestamp: new Date('2026-01-01T00:00:00Z') },
  });
  await mongo.db.collection('actions').insertMany([
    {
      _id: 'act-1',
      workflow_id: 'wf-1',
      type: 'collect-docs',
      kind: 'form',
      status: [{ stage: 'action-required' }],
    },
    {
      _id: 'act-2',
      workflow_id: 'wf-1',
      type: 'final-audit',
      kind: 'check',
      status: [{ stage: 'action-required' }],
    },
  ]);
}

// --- Lifecycle mode (Start/Cancel/Close/tracker) -----------------------------

test('lifecycle load returns workflow + actions + workflowConfig, no actionConfig/targetAction', async () => {
  await seedWorkflow();
  const loaded = await loadWorkflowState(makeContext(), { workflowId: 'wf-1' });
  expect(loaded.workflow._id).toBe('wf-1');
  expect(loaded.actions.map((a) => a._id).sort()).toEqual(['act-1', 'act-2']);
  expect(loaded.workflowConfig.type).toBe('onboarding');
  expect(loaded.actionConfig).toBeUndefined();
  expect(loaded.targetAction).toBeUndefined();
});

test('lifecycle load does not run the stage check (completed workflow loads fine)', async () => {
  await seedWorkflow({ stage: 'completed' });
  const loaded = await loadWorkflowState(makeContext(), { workflowId: 'wf-1' });
  expect(loaded.workflow.status[0].stage).toBe('completed');
});

// --- Submit mode -------------------------------------------------------------

test('submit load returns the full LoadedState; targetAction is the actions[] instance', async () => {
  await seedWorkflow();
  const loaded = await loadWorkflowState(makeContext(), {
    actionId: 'act-1',
    signal: 'submit',
  });
  expect(loaded.workflow._id).toBe('wf-1');
  expect(loaded.actionConfig.type).toBe('collect-docs');
  expect(loaded.targetAction._id).toBe('act-1');
  expect(loaded.targetAction).toBe(
    loaded.actions.find((a) => a._id === 'act-1'),
  );
  // The CAS anchor (task 13) rides on the loaded workflow doc.
  expect(loaded.workflow.updated.timestamp).toEqual(
    new Date('2026-01-01T00:00:00Z'),
  );
});

// --- Invariant throws (discriminated by code, design D13) --------------------

test('missing workflow doc throws workflow_not_found', async () => {
  await expect(
    loadWorkflowState(makeContext(), { workflowId: 'nope' }),
  ).rejects.toMatchObject({
    name: 'WorkflowEngineError',
    code: 'workflow_not_found',
  });
});

test('workflow_type missing from workflowsConfig throws workflow_not_found', async () => {
  await mongo.db.collection('workflows').insertOne({
    _id: 'wf-x',
    workflow_type: 'unconfigured-type',
    status: [{ stage: 'in-progress' }],
  });
  await expect(
    loadWorkflowState(makeContext(), { workflowId: 'wf-x' }),
  ).rejects.toMatchObject({
    code: 'workflow_not_found',
    message: expect.stringContaining('unconfigured-type'),
  });
});

test('missing action doc throws action_not_found', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(makeContext(), { actionId: 'nope', signal: 'submit' }),
  ).rejects.toMatchObject({
    name: 'WorkflowEngineError',
    code: 'action_not_found',
  });
});

test('action type missing from workflow config throws action_not_found', async () => {
  await seedWorkflow();
  await mongo.db.collection('actions').insertOne({
    _id: 'act-rogue',
    workflow_id: 'wf-1',
    type: 'unconfigured-action',
    kind: 'form',
    status: [{ stage: 'action-required' }],
  });
  await expect(
    loadWorkflowState(makeContext(), {
      actionId: 'act-rogue',
      signal: 'submit',
    }),
  ).rejects.toMatchObject({
    code: 'action_not_found',
    message: expect.stringContaining('unconfigured-action'),
  });
});

test.each(['completed', 'cancelled'])(
  '%s workflow rejects submit with stage_rejects_submit',
  async (stage) => {
    await seedWorkflow({ stage });
    await expect(
      loadWorkflowState(makeContext(), { actionId: 'act-1', signal: 'submit' }),
    ).rejects.toMatchObject({
      name: 'WorkflowEngineError',
      code: 'stage_rejects_submit',
    });
  },
);

test('completed workflow allows submit on a required_after_close action', async () => {
  await seedWorkflow({ stage: 'completed' });
  const loaded = await loadWorkflowState(makeContext(), {
    actionId: 'act-2',
    signal: 'submit',
  });
  expect(loaded.targetAction._id).toBe('act-2');
  expect(loaded.actionConfig.required_after_close).toBe(true);
});

// --- Per-verb access gate (design D16 / Part 34 D6) ---------------------------

const rolesContext = (roles) =>
  makeContext({ user: { apps: { [APP]: { roles } } } });

test.each(['submit', 'progress', 'not_required'])(
  'signal %s requires the edit verb',
  async (signal) => {
    await seedWorkflow();
    // edit gate is ['account-manager'].
    await expect(
      loadWorkflowState(rolesContext(['account-manager']), {
        actionId: 'act-1',
        signal,
      }),
    ).resolves.toBeDefined();
    await expect(
      loadWorkflowState(rolesContext(['compliance-officer']), {
        actionId: 'act-1',
        signal,
      }),
    ).rejects.toMatchObject({ code: 'access_denied' });
  },
);

test.each(['approve', 'request_changes'])(
  'signal %s requires the review verb',
  async (signal) => {
    await seedWorkflow();
    await expect(
      loadWorkflowState(rolesContext(['compliance-officer']), {
        actionId: 'act-1',
        signal,
      }),
    ).resolves.toBeDefined();
    await expect(
      loadWorkflowState(rolesContext(['account-manager']), {
        actionId: 'act-1',
        signal,
      }),
    ).rejects.toMatchObject({ code: 'access_denied' });
  },
);

test('signal resolve_error requires the error verb', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(rolesContext(['support-rep']), {
      actionId: 'act-1',
      signal: 'resolve_error',
    }),
  ).resolves.toBeDefined();
  await expect(
    loadWorkflowState(rolesContext(['account-manager']), {
      actionId: 'act-1',
      signal: 'resolve_error',
    }),
  ).rejects.toMatchObject({ code: 'access_denied' });
});

test('a `true` gate passes a user with no roles for the app', async () => {
  await seedWorkflow();
  // final-audit's edit gate is `true`.
  const loaded = await loadWorkflowState(
    makeContext({ user: { apps: {} } }),
    { actionId: 'act-2', signal: 'submit' },
  );
  expect(loaded.targetAction._id).toBe('act-2');
});

test('an app absent from access fails closed with access_denied', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(
      makeContext({ connection: { app_name: 'other-app' } }),
      { actionId: 'act-1', signal: 'submit' },
    ),
  ).rejects.toMatchObject({ code: 'access_denied' });
});

// --- `not_required` load-gate (Part 46 D5) ------------------------------------

test('not_required without allow_not_required fails closed, even past an open edit gate', async () => {
  await seedWorkflow();
  // final-audit (check kind) has edit: true but no allow_not_required.
  await expect(
    loadWorkflowState(makeContext({ user: { apps: {} } }), {
      actionId: 'act-2',
      signal: 'not_required',
    }),
  ).rejects.toMatchObject({
    code: 'access_denied',
    message: expect.stringContaining('allow_not_required'),
  });
});

test('allow_not_required: true admits not_required for the edit verb', async () => {
  await seedWorkflow();
  // collect-docs opts in via allow_not_required: true.
  const loaded = await loadWorkflowState(rolesContext(['account-manager']), {
    actionId: 'act-1',
    signal: 'not_required',
  });
  expect(loaded.targetAction._id).toBe('act-1');
});

test('unknown user signal throws unknown_signal, not access_denied', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(makeContext(), {
      actionId: 'act-1',
      signal: 'frobnicate',
    }),
  ).rejects.toMatchObject({
    name: 'WorkflowEngineError',
    code: 'unknown_signal',
  });
});

// --- Gate oracle — the shared (gate, roles) → bool fixture table (task 5) ----

test.each(gateCases)(
  'gateAllows matches the oracle: $name',
  ({ gate, userRoles, expected }) => {
    expect(gateAllows(gate, userRoles)).toBe(expected);
  },
);
