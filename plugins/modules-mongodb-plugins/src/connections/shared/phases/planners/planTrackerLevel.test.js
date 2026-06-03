/**
 * Unit tests for planTrackerLevel (task 16) — the per-level tracker-cascade
 * plan orchestrator. Pure composition: no Mongo, no callApi. Asserts the PLAN
 * shape (and the `null` no-op), the mirror event, the `fired` entry, and the
 * target/config resolution throws.
 */
import planTrackerLevel from './planTrackerLevel.js';

const now = { timestamp: new Date('2026-05-20T00:00:00Z'), user: { id: 'u1', profile: { name: 'Stamper' } } };
const event_id = 'LEVEL-EVT';
const newId = () => 'new-1';
const connection = { entry_id: 'workflows', app_name: 'test-app' };

function makeTrackerAction({ _id = 'track-1', stage = 'in-progress', child_workflow_id = 'wf-child' } = {}) {
  return {
    _id,
    workflow_id: 'wf-A',
    type: 'track-child',
    kind: 'tracker',
    key: null,
    action_group: null,
    child_workflow_id,
    tracker: { workflow_type: 'child' },
    status: [{ stage, event_id: 'e0', created: now }],
    metadata: {},
  };
}

function makeWorkflow(overrides = {}) {
  return {
    _id: 'wf-A',
    workflow_type: 'one-tracker-parent',
    entity_id: 'ent-A',
    entity_collection: 'parents',
    entity_ref_key: 'parent_ids',
    parent_action_id: null,
    parent_workflow_id: null,
    status: [{ stage: 'active', event_id: 'e0', created: now }],
    summary: { done: 0, not_required: 0, total: 0 },
    groups: [],
    form_data: {},
    updated: { timestamp: new Date('2026-05-19T00:00:00Z'), user: { id: 'u0' } },
    ...overrides,
  };
}

function makeConfig({ actions } = {}) {
  return {
    type: 'one-tracker-parent',
    entity_collection: 'parents',
    entity_ref_key: 'parent_ids',
    action_groups: [],
    actions: actions ?? [{ type: 'track-child', kind: 'tracker' }],
  };
}

function makeLoaded({ workflow, actions, config } = {}) {
  return {
    workflow: workflow ?? makeWorkflow(),
    actions: actions ?? [makeTrackerAction()],
    workflowConfig: config ?? makeConfig(),
  };
}

const baseArgs = {
  parentActionId: 'track-1',
  signal: 'internal_mirror_child_completed',
  event_id,
  now,
  newId,
  connection,
  lowdefyContext: {},
};

test('mirror transition lands the FSM-resolved stage on the target action', () => {
  const plan = planTrackerLevel(makeLoaded(), baseArgs);
  expect(plan).not.toBeNull();
  const target = plan.actions.find((e) => e.doc._id === 'track-1');
  expect(target.doc.status[0]).toMatchObject({ stage: 'done', event_id });
});

test('single-tracker parent auto-completes; fired carries the resolved stage', () => {
  const plan = planTrackerLevel(makeLoaded(), baseArgs);
  expect(plan.workflow.doc.status[0].stage).toBe('completed');
  expect(plan.fired).toEqual({
    parent_action_id: 'track-1',
    parent_workflow_id: 'wf-A',
    new_status: 'done',
  });
});

test('emits an action-internal-mirror-completed event referencing the one mirrored action', () => {
  const plan = planTrackerLevel(makeLoaded(), baseArgs);
  expect(plan.event.doc.type).toBe('action-internal-mirror-completed');
  expect(plan.event.doc._id).toBe(event_id);
  expect(plan.event.doc.references.action_ids).toEqual(['track-1']);
});

test('next-level fire emitted only when the parent has a parent_action_id', () => {
  const withParent = makeWorkflow({ parent_action_id: 'track-up', parent_workflow_id: 'wf-up' });
  const plan = planTrackerLevel(makeLoaded({ workflow: withParent }), baseArgs);
  expect(plan.trackerFires).toEqual([
    { parentWorkflowId: 'wf-up', parentActionId: 'track-up', signal: 'internal_mirror_child_completed' },
  ]);
});

test('no next-level fire when the parent does not auto-complete', () => {
  // Two-action parent: a non-terminal form action keeps it active.
  const config = makeConfig({
    actions: [
      { type: 'qualify', kind: 'form' },
      { type: 'track-child', kind: 'tracker' },
    ],
  });
  const actions = [
    { ...makeTrackerAction(), status: [{ stage: 'in-progress', created: now }] },
    {
      _id: 'qualify-1', workflow_id: 'wf-A', type: 'qualify', kind: 'form', key: null,
      action_group: null, status: [{ stage: 'in-review', created: now }], metadata: {},
    },
  ];
  const plan = planTrackerLevel(
    makeLoaded({ workflow: makeWorkflow({ parent_action_id: 'track-up', parent_workflow_id: 'wf-up' }), actions, config }),
    baseArgs,
  );
  expect(plan.workflow.doc.status[0].stage).toBe('active');
  expect(plan.trackerFires).toEqual([]);
});

test('returns null when the mirror signal FSM-no-ops (tracker already done)', () => {
  const actions = [makeTrackerAction({ stage: 'done' })];
  const plan = planTrackerLevel(makeLoaded({ actions }), baseArgs);
  expect(plan).toBeNull();
});

test('throws missing_target when the parent action doc is absent', () => {
  expect(() =>
    planTrackerLevel(makeLoaded(), { ...baseArgs, parentActionId: 'ghost' }),
  ).toThrow(expect.objectContaining({ code: 'missing_target' }));
});

test('throws missing_target when the action type has no config entry', () => {
  const config = makeConfig({ actions: [{ type: 'something-else', kind: 'tracker' }] });
  expect(() =>
    planTrackerLevel(makeLoaded({ config }), baseArgs),
  ).toThrow(expect.objectContaining({ code: 'missing_target' }));
});
