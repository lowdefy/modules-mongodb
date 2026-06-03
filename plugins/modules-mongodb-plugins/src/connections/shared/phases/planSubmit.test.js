/**
 * Unit tests for planSubmit (task 15) — the plan-phase orchestrator.
 *
 * Pure composition: no Mongo, no callApi. Asserts the PLAN shape the commit
 * phase consumes — transition-entry composition, auxiliary signal flows,
 * form-data merge, completed_groups (with on_complete join), and the
 * Submit→trackerFires composition (step 9).
 */
import planSubmit from './planSubmit.js';

const now = { timestamp: new Date('2026-05-20T00:00:00Z'), user: { id: 'u1' } };
const event_id = 'evt-1';
let idCounter;
const newId = () => `new-${idCounter++}`;

function makeAction({
  _id = 'A1',
  type = 'qualify',
  kind = 'form',
  stage = 'action-required',
  key = null,
  action_group = null,
  ...rest
} = {}) {
  return {
    _id,
    workflow_id: 'W1',
    type,
    kind,
    key,
    action_group,
    status: [{ stage, event_id: 'e0', created: now }],
    metadata: {},
    ...rest,
  };
}

function makeWorkflow(overrides = {}) {
  return {
    _id: 'W1',
    workflow_type: 'onboarding',
    entity_id: 'L1',
    entity_collection: 'leads-collection',
    entity_ref_key: 'lead_ids',
    status: [{ stage: 'active', event_id: 'e0', created: now }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    form_data: {},
    updated: { timestamp: new Date('2026-05-19T00:00:00Z'), user: { id: 'u0' } },
    ...overrides,
  };
}

function makeConfig({ actions, action_groups } = {}) {
  return {
    type: 'onboarding',
    entity_collection: 'leads-collection',
    entity_ref_key: 'lead_ids',
    starting_actions: [{ type: 'qualify', status: 'action-required' }],
    actions: actions ?? [
      { type: 'qualify', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
    ],
    ...(action_groups ? { action_groups } : {}),
  };
}

function makeContext(overrides = {}) {
  return {
    event_id,
    now,
    newId,
    connection: { entry_id: 'workflows', app_name: 'test-app' },
    params: { action_id: 'A1', signal: 'submit' },
    user: { id: 'U1', profile: { name: 'Test User' }, roles: ['account-manager'] },
    lowdefyContext: {},
    ...overrides,
  };
}

function makeLoadedState({ workflow, actions, config, targetActionId = 'A1' } = {}) {
  const wf = workflow ?? makeWorkflow();
  const acts = actions ?? [makeAction()];
  const cfg = config ?? makeConfig();
  const targetAction = acts.find((a) => a._id === targetActionId);
  const actionConfig = cfg.actions.find((c) => c.type === targetAction.type);
  return { workflow: wf, actions: acts, workflowConfig: cfg, actionConfig, targetAction };
}

const EMPTY_PREHOOK = { actions: [], event_overrides: {}, form_overrides: {} };

beforeEach(() => {
  idCounter = 1;
});

test('current action is planned with source user; submit (no review) → done', () => {
  const plan = planSubmit({
    loadedState: makeLoadedState(),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });

  expect(plan.actions).toHaveLength(1);
  expect(plan.actions[0].operation).toBe('update');
  expect(plan.actions[0].doc.status[0]).toEqual({
    stage: 'done',
    event_id,
    created: now,
  });
  // Workflow recompute: all actions terminal → completed pushed.
  expect(plan.workflow.doc.status[0].stage).toBe('completed');
  expect(plan.workflow.operation).toBe('update');
});

test('user-driven signal with no FSM entry throws signal_not_allowed', () => {
  const actions = [makeAction({ stage: 'done' })];
  expect(() =>
    planSubmit({
      loadedState: makeLoadedState({ actions }),
      preHookResult: EMPTY_PREHOOK,
      context: makeContext({ params: { action_id: 'A1', signal: 'approve' } }),
    }),
  ).toThrow(/not allowed/);
});

test('pre-hook auxiliary signal against another existing action lands the aux transition', () => {
  const actions = [
    makeAction({ _id: 'A1', type: 'qualify' }),
    makeAction({ _id: 'A2', type: 'review-docs', stage: 'in-review' }),
  ];
  const config = makeConfig({
    actions: [
      { type: 'qualify', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
      { type: 'review-docs', kind: 'form', access: { 'test-app': { view: true, review: true } } },
    ],
  });
  const plan = planSubmit({
    loadedState: makeLoadedState({ actions, config }),
    preHookResult: {
      actions: [{ type: 'review-docs', signal: 'approve' }],
      event_overrides: {},
      form_overrides: {},
    },
    context: makeContext(),
  });

  const aux = plan.actions.find((e) => e.doc._id === 'A2');
  expect(aux).toBeDefined();
  expect(aux.doc.status[0].stage).toBe('done');
});

test('pre-hook auxiliary upsert spawns a new action (operation insert, seeded fields/metadata)', () => {
  const config = makeConfig({
    actions: [
      { type: 'qualify', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
      { type: 'follow-up', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
    ],
  });
  const plan = planSubmit({
    loadedState: makeLoadedState({ config }),
    preHookResult: {
      actions: [
        {
          type: 'follow-up',
          key: 'k1',
          signal: 'activate',
          upsert: true,
          fields: { description: 'seeded' },
          metadata: { origin: 'prehook' },
        },
      ],
      event_overrides: {},
      form_overrides: {},
    },
    context: makeContext(),
  });

  const spawned = plan.actions.find((e) => e.operation === 'insert');
  expect(spawned).toBeDefined();
  expect(spawned.doc.type).toBe('follow-up');
  expect(spawned.doc.key).toBe('k1');
  expect(spawned.doc.status[0].stage).toBe('action-required');
  expect(spawned.doc.description).toBe('seeded');
  expect(spawned.doc.metadata).toEqual({ origin: 'prehook' });
});

test('pre-hook auxiliary no-op (FSM has no entry) is silently dropped', () => {
  const actions = [
    makeAction({ _id: 'A1', type: 'qualify' }),
    makeAction({ _id: 'A2', type: 'review-docs', stage: 'not-required' }),
  ];
  const config = makeConfig({
    actions: [
      { type: 'qualify', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
      { type: 'review-docs', kind: 'form', access: { 'test-app': { view: true, review: true } } },
    ],
  });
  const plan = planSubmit({
    loadedState: makeLoadedState({ actions, config }),
    // not-required has no outgoing entries → auxiliary no-op.
    preHookResult: {
      actions: [{ type: 'review-docs', signal: 'approve' }],
      event_overrides: {},
      form_overrides: {},
    },
    context: makeContext(),
  });
  expect(plan.actions.find((e) => e.doc._id === 'A2')).toBeUndefined();
});

test('form-data merge: submitted form lands under form_data[type]', () => {
  const plan = planSubmit({
    loadedState: makeLoadedState(),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext({
      params: { action_id: 'A1', signal: 'submit', form: { score: 5 } },
    }),
  });
  expect(plan.workflow.doc.form_data.qualify).toEqual({ score: 5 });
});

test('completed_groups: a group whose status flips to done emits with joined on_complete', () => {
  const workflow = makeWorkflow({
    groups: [{ id: 'g1', status: 'in-progress', summary: { done: 0, not_required: 0, total: 1 } }],
  });
  const actions = [makeAction({ _id: 'A1', type: 'qualify', action_group: 'g1' })];
  const config = makeConfig({
    actions: [
      { type: 'qualify', kind: 'form', action_group: 'g1', access: { 'test-app': { view: true, edit: true } } },
    ],
    action_groups: [{ id: 'g1', title: 'Group 1', on_complete: { signal: 'progress' } }],
  });
  const plan = planSubmit({
    loadedState: makeLoadedState({ workflow, actions, config }),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });
  expect(plan.completedGroups).toEqual([
    { workflow_id: 'W1', id: 'g1', on_complete: { signal: 'progress' } },
  ]);
});

test('trackerFires: emitted iff workflow auto-completed AND has a parent_action_id', () => {
  const workflow = makeWorkflow({
    parent_workflow_id: 'PW1',
    parent_action_id: 'PA1',
  });
  const plan = planSubmit({
    loadedState: makeLoadedState({ workflow }),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });
  expect(plan.workflow.doc.status[0].stage).toBe('completed');
  expect(plan.trackerFires).toEqual([
    {
      parentWorkflowId: 'PW1',
      parentActionId: 'PA1',
      signal: 'internal_mirror_child_completed',
    },
  ]);
});

test('trackerFires: empty when completed but no parent', () => {
  const plan = planSubmit({
    loadedState: makeLoadedState(),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });
  expect(plan.workflow.doc.status[0].stage).toBe('completed');
  expect(plan.trackerFires).toEqual([]);
});

test('trackerFires: empty when workflow did not auto-complete even with a parent', () => {
  // Two actions, only one submitted → not all terminal → no completed push.
  const workflow = makeWorkflow({
    parent_workflow_id: 'PW1',
    parent_action_id: 'PA1',
    summary: { done: 0, not_required: 0, total: 2 },
  });
  const actions = [
    makeAction({ _id: 'A1', type: 'qualify' }),
    makeAction({ _id: 'A2', type: 'review-docs', stage: 'action-required' }),
  ];
  const config = makeConfig({
    actions: [
      { type: 'qualify', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
      { type: 'review-docs', kind: 'form', access: { 'test-app': { view: true, edit: true } } },
    ],
  });
  const plan = planSubmit({
    loadedState: makeLoadedState({ workflow, actions, config }),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });
  expect(plan.workflow.doc.status[0].stage).not.toBe('completed');
  expect(plan.trackerFires).toEqual([]);
});

test('event doc: action-event type action-{signal}, _id is the per-invocation event_id', () => {
  const plan = planSubmit({
    loadedState: makeLoadedState(),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });
  expect(plan.event.doc._id).toBe(event_id);
  expect(plan.event.doc.type).toBe('action-submit');
});

test('changeLog: empty when connection has no changeLog config', () => {
  const plan = planSubmit({
    loadedState: makeLoadedState(),
    preHookResult: EMPTY_PREHOOK,
    context: makeContext(),
  });
  expect(plan.changeLog).toEqual([]);
});
