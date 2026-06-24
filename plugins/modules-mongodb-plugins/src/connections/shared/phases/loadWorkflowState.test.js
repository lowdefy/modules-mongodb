import gateCases from '../../../../../../modules/workflows/resolvers/__fixtures__/gates.fixtures.js';
import inMemoryMongo from '../inMemoryMongo.js';
import loadWorkflowState, {
  gateAllows,
  SIGNAL_VERBS,
} from './loadWorkflowState.js';

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
      {
        // edit + review without view — legal but lint-warned (Part 34 D4).
        type: 'compliance-signoff',
        kind: 'check',
        access: {
          [APP]: { edit: ['account-manager'], review: ['compliance-officer'] },
        },
      },
    ],
  },
];

function makeContext({ user, connection } = {}) {
  return {
    mongoDb: mongo.db,
    connection: { app_name: APP, ...connection },
    workflowsConfig,
    user: user ?? { roles: ['account-manager'] },
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
    {
      _id: 'act-3',
      workflow_id: 'wf-1',
      type: 'compliance-signoff',
      kind: 'check',
      status: [{ stage: 'in-review' }],
    },
  ]);
}

// --- Lifecycle mode (Start/Cancel/Close/tracker) -----------------------------

test('lifecycle load returns workflow + actions + workflowConfig, no actionConfig/targetAction', async () => {
  await seedWorkflow();
  const loaded = await loadWorkflowState(makeContext(), { workflowId: 'wf-1' });
  expect(loaded.workflow._id).toBe('wf-1');
  expect(loaded.actions.map((a) => a._id).sort()).toEqual([
    'act-1',
    'act-2',
    'act-3',
  ]);
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

// --- Fields mode (Part 24 UpdateActionFields): { actionId, verb } ------------

test('verb mode returns the full LoadedState like submit mode', async () => {
  await seedWorkflow();
  const loaded = await loadWorkflowState(rolesContext(['account-manager']), {
    actionId: 'act-1',
    verb: 'edit',
  });
  expect(loaded.workflow._id).toBe('wf-1');
  expect(loaded.actionConfig.type).toBe('collect-docs');
  expect(loaded.targetAction._id).toBe('act-1');
  expect(loaded.targetAction).toBe(loaded.actions.find((a) => a._id === 'act-1'));
});

test('verb mode skips the stage check: completed workflow loads fine', async () => {
  await seedWorkflow({ stage: 'completed' });
  // act-1 (collect-docs) is NOT required_after_close, so submit mode rejects it.
  await expect(
    loadWorkflowState(rolesContext(['account-manager']), {
      actionId: 'act-1',
      signal: 'submit',
    }),
  ).rejects.toMatchObject({ code: 'stage_rejects_submit' });
  // The same fixture loads fine in verb mode (no stage/required_after_close gate).
  const loaded = await loadWorkflowState(rolesContext(['account-manager']), {
    actionId: 'act-1',
    verb: 'edit',
  });
  expect(loaded.targetAction._id).toBe('act-1');
});

test('verb mode gates on the given verb: role outside the gate throws access_denied', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(rolesContext(['compliance-officer']), {
      actionId: 'act-1',
      verb: 'edit',
    }),
  ).rejects.toMatchObject({
    code: 'access_denied',
    message: expect.stringContaining('"edit"'),
  });
});

test('verb mode: a `true` gate passes a user with no roles', async () => {
  await seedWorkflow();
  // final-audit's edit gate is `true`.
  const loaded = await loadWorkflowState(makeContext({ user: { roles: [] } }), {
    actionId: 'act-2',
    verb: 'edit',
  });
  expect(loaded.targetAction._id).toBe('act-2');
});

test('verb mode: matching role passes', async () => {
  await seedWorkflow();
  const loaded = await loadWorkflowState(rolesContext(['account-manager']), {
    actionId: 'act-1',
    verb: 'edit',
  });
  expect(loaded.targetAction._id).toBe('act-1');
});

test('passing both signal and verb throws invalid_load_args', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(rolesContext(['account-manager']), {
      actionId: 'act-1',
      signal: 'submit',
      verb: 'edit',
    }),
  ).rejects.toMatchObject({ code: 'invalid_load_args' });
});

// --- Per-verb access gate (design D16 / Part 34 D6) ---------------------------

const rolesContext = (roles) =>
  makeContext({ user: { roles } });

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

test('signal approve requires the review verb', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(rolesContext(['compliance-officer']), {
      actionId: 'act-1',
      signal: 'approve',
    }),
  ).resolves.toBeDefined();
  await expect(
    loadWorkflowState(rolesContext(['account-manager']), {
      actionId: 'act-1',
      signal: 'approve',
    }),
  ).rejects.toMatchObject({ code: 'access_denied' });
});

// --- request_changes passes on view OR edit OR review (Part 49) ----------------

test('request_changes passes with a view-only gate match', async () => {
  await seedWorkflow();
  // collect-docs: view is `true`; the edit/review role arrays don't match a
  // role-less caller, so view is the only arm that passes.
  await expect(
    loadWorkflowState(rolesContext([]), {
      actionId: 'act-1',
      signal: 'request_changes',
    }),
  ).resolves.toBeDefined();
});

test('request_changes passes with an edit-only gate match (no view declared)', async () => {
  await seedWorkflow();
  // compliance-signoff declares edit + review without view (the lint-warned
  // edge); account-manager matches edit only.
  await expect(
    loadWorkflowState(rolesContext(['account-manager']), {
      actionId: 'act-3',
      signal: 'request_changes',
    }),
  ).resolves.toBeDefined();
});

test('request_changes passes with a review-only gate match (no view declared)', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(rolesContext(['compliance-officer']), {
      actionId: 'act-3',
      signal: 'request_changes',
    }),
  ).resolves.toBeDefined();
});

test('request_changes rejects with access_denied when the caller matches no accepted verb', async () => {
  await seedWorkflow();
  await expect(
    loadWorkflowState(rolesContext(['support-rep']), {
      actionId: 'act-3',
      signal: 'request_changes',
    }),
  ).rejects.toMatchObject({
    code: 'access_denied',
    message: expect.stringContaining('"view"/"edit"/"review"'),
  });
});

test('every SIGNAL_VERBS entry is a non-empty verb array (uniform .some(gateAllows) path)', () => {
  for (const verbs of Object.values(SIGNAL_VERBS)) {
    expect(Array.isArray(verbs)).toBe(true);
    expect(verbs.length).toBeGreaterThan(0);
  }
});

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
    makeContext({ user: { roles: [] } }),
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
    loadWorkflowState(makeContext({ user: { roles: [] } }), {
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

// --- Part 48: render_config seam (merge at load) ------------------------------

function makeContextWithRenderConfig(renderConfig) {
  return {
    mongoDb: mongo.db,
    connection: { app_name: APP },
    workflowsConfig: [
      {
        type: 'onboarding',
        entity_collection: 'companies',
        starting_actions: [{ type: 'collect-docs', status: 'action-required' }],
        actions: [
          {
            type: 'collect-docs',
            kind: 'form',
            allow_not_required: true,
            status_map: { 'action-required': 'original-label' },
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
          {
            type: 'compliance-signoff',
            kind: 'check',
            access: {
              [APP]: { edit: ['account-manager'], review: ['compliance-officer'] },
            },
          },
        ],
      },
    ],
    user: { roles: ['account-manager'] },
    params: renderConfig !== undefined ? { render_config: renderConfig } : undefined,
  };
}

test('submit mode: render_config splices status_map + event_overrides onto matching action configs', async () => {
  await seedWorkflow();
  const renderConfig = {
    onboarding: {
      'collect-docs': {
        status_map: { 'action-required': 'Docs Required' },
        event_overrides: { submit: 'Upload Documents' },
      },
      'final-audit': {
        status_map: { 'action-required': 'Audit Pending' },
      },
    },
  };
  const ctx = makeContextWithRenderConfig(renderConfig);
  const loaded = await loadWorkflowState(ctx, {
    actionId: 'act-1',
    signal: 'submit',
  });

  // targetAction's actionConfig carries the spliced values
  expect(loaded.actionConfig.status_map).toEqual({ 'action-required': 'Docs Required' });
  expect(loaded.actionConfig.event_overrides).toEqual({ submit: 'Upload Documents' });

  // sibling action config also received its slice
  const finalAuditCfg = loaded.workflowConfig.actions.find((a) => a.type === 'final-audit');
  expect(finalAuditCfg.status_map).toEqual({ 'action-required': 'Audit Pending' });

  // action with no matching slice is untouched
  const signoffCfg = loaded.workflowConfig.actions.find((a) => a.type === 'compliance-signoff');
  expect(signoffCfg.status_map).toBeUndefined();
  expect(signoffCfg.event_overrides).toBeUndefined();
});

test('workflowId mode: render_config splices onto action configs', async () => {
  await seedWorkflow();
  const renderConfig = {
    onboarding: {
      'collect-docs': {
        status_map: { 'action-required': 'Docs Needed' },
      },
    },
  };
  const ctx = makeContextWithRenderConfig(renderConfig);
  const loaded = await loadWorkflowState(ctx, { workflowId: 'wf-1' });

  const collectDocsCfg = loaded.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  expect(collectDocsCfg.status_map).toEqual({ 'action-required': 'Docs Needed' });
});

test('no render_config on params leaves action configs unchanged', async () => {
  await seedWorkflow();
  const ctx = makeContextWithRenderConfig(undefined);
  const loaded = await loadWorkflowState(ctx, { workflowId: 'wf-1' });

  const collectDocsCfg = loaded.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  // original status_map from workflowsConfig fixture is preserved
  expect(collectDocsCfg.status_map).toEqual({ 'action-required': 'original-label' });
  expect(collectDocsCfg.event_overrides).toBeUndefined();
});

test('render_config missing the loaded workflow_type leaves configs unchanged', async () => {
  await seedWorkflow();
  const renderConfig = {
    'other-type': { 'collect-docs': { status_map: { 'action-required': 'Other' } } },
  };
  const ctx = makeContextWithRenderConfig(renderConfig);
  const loaded = await loadWorkflowState(ctx, { workflowId: 'wf-1' });

  const collectDocsCfg = loaded.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  expect(collectDocsCfg.status_map).toEqual({ 'action-required': 'original-label' });
});

test('render_config missing the action type key leaves that action config unchanged', async () => {
  await seedWorkflow();
  const renderConfig = {
    onboarding: {
      // only final-audit; collect-docs is absent
      'final-audit': { status_map: { 'action-required': 'Audit Pending' } },
    },
  };
  const ctx = makeContextWithRenderConfig(renderConfig);
  const loaded = await loadWorkflowState(ctx, { workflowId: 'wf-1' });

  const collectDocsCfg = loaded.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  expect(collectDocsCfg.status_map).toEqual({ 'action-required': 'original-label' });

  const finalAuditCfg = loaded.workflowConfig.actions.find((a) => a.type === 'final-audit');
  expect(finalAuditCfg.status_map).toEqual({ 'action-required': 'Audit Pending' });
});

test('CAS retry simulation: calling twice with same context yields identical configs (idempotent)', async () => {
  await seedWorkflow();
  const renderConfig = {
    onboarding: {
      'collect-docs': { status_map: { 'action-required': 'Spliced' } },
    },
  };
  const ctx = makeContextWithRenderConfig(renderConfig);

  const loaded1 = await loadWorkflowState(ctx, { workflowId: 'wf-1' });
  const cfg1 = loaded1.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  expect(cfg1.status_map).toEqual({ 'action-required': 'Spliced' });

  // second call on same context — idempotent re-splice
  const loaded2 = await loadWorkflowState(ctx, { workflowId: 'wf-1' });
  const cfg2 = loaded2.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  expect(cfg2.status_map).toEqual({ 'action-required': 'Spliced' });

  // same object instances (no cloning)
  expect(cfg1).toBe(cfg2);
});

test('blob status_map is overwritten (not merged) when endpoint slice carries one', async () => {
  await seedWorkflow();
  const renderConfig = {
    onboarding: {
      'collect-docs': {
        // endpoint value completely replaces the blob's status_map
        status_map: { 'in-review': 'Under Review' },
      },
    },
  };
  const ctx = makeContextWithRenderConfig(renderConfig);
  const loaded = await loadWorkflowState(ctx, { workflowId: 'wf-1' });

  const collectDocsCfg = loaded.workflowConfig.actions.find((a) => a.type === 'collect-docs');
  // original key 'action-required' is gone — endpoint value is authoritative
  expect(collectDocsCfg.status_map).toEqual({ 'in-review': 'Under Review' });
  expect(collectDocsCfg.status_map['action-required']).toBeUndefined();
});
