import planActionTransition from './planActionTransition.js';

const now = { timestamp: new Date('2026-05-20T00:00:00Z'), user: { id: 'u1' } };
const event_id = 'e1';
const entry_id = 'workflows';

const loadedWorkflow = {
  _id: 'wf-1',
  workflow_type: 'onboarding',
  entity_id: 'ent-1',
  entity_collection: 'companies',
};

function makeAction({
  _id = 'a-1',
  type = 'qualify',
  kind = 'form',
  stage = 'action-required',
  ...rest
} = {}) {
  return {
    _id,
    workflow_id: 'wf-1',
    type,
    kind,
    key: null,
    status: [{ stage, event_id: 'e0', created: { timestamp: new Date('2026-05-19T00:00:00Z') } }],
    ...rest,
  };
}

function makeConfig({ type = 'qualify', kind = 'form', access, status_map, ...rest } = {}) {
  return {
    type,
    kind,
    access: access ?? { demo: { view: true, edit: true } },
    ...(status_map ? { status_map } : {}),
    ...rest,
  };
}

function plan(overrides = {}) {
  return planActionTransition({
    action: makeAction(),
    signal: 'submit',
    actionConfig: makeConfig(),
    loadedWorkflow,
    entry_id,
    event_id,
    now,
    ...overrides,
  });
}

test('form kind: submit without review lands done; status entry prepended; updated stamped', () => {
  const result = plan();
  expect(result.operation).toBe('update');
  expect(result.doc.status[0]).toEqual({ stage: 'done', event_id, created: now });
  expect(result.doc.status).toHaveLength(2);
  expect(result.doc.updated).toEqual(now);
});

test('form kind: submit with a review verb declared lands in-review (action-global hasReview)', () => {
  const result = plan({
    actionConfig: makeConfig({ access: { demo: { view: true, edit: true, review: true } } }),
  });
  expect(result.doc.status[0].stage).toBe('in-review');
});

test('simple kind resolves through the form table (alias)', () => {
  const result = plan({
    action: makeAction({ kind: 'simple' }),
    actionConfig: makeConfig({ kind: 'simple' }),
  });
  expect(result.doc.status[0].stage).toBe('done');
});

test('tracker kind: unblock from blocked lands action-required', () => {
  const result = plan({
    action: makeAction({ kind: 'tracker', stage: 'blocked' }),
    signal: 'unblock',
    actionConfig: makeConfig({ kind: 'tracker' }),
  });
  expect(result.doc.status[0].stage).toBe('action-required');
});

test('payload.fields is a verbatim kind-agnostic passthrough', () => {
  const fields = { assignees: [{ id: 'u2' }], due_date: '2026-06-01', custom_field: 42 };
  const result = plan({ payload: { fields } });
  expect(result.doc.assignees).toEqual([{ id: 'u2' }]);
  expect(result.doc.due_date).toBe('2026-06-01');
  expect(result.doc.custom_field).toBe(42);
});

test('metadata accumulates onto loaded metadata; incoming wins', () => {
  const result = plan({
    action: makeAction({ metadata: { a: 1, b: 1 } }),
    payload: { metadata: { b: 2, c: 3 } },
  });
  expect(result.doc.metadata).toEqual({ a: 1, b: 2, c: 3 });
});

test('rendered cell can reference metadata and fields set in the same submit', () => {
  const result = plan({
    payload: { fields: { quantity: 7 }, metadata: { physical_id: 'D-42' } },
    actionConfig: makeConfig({
      status_map: {
        done: {
          status_title: 'Done',
          demo: { message: 'Installed {{ physical_id }} x{{ quantity }}.' },
        },
      },
    }),
  });
  expect(result.doc.status_title).toBe('Done');
  expect(result.doc.demo.message).toBe('Installed D-42 x7.');
});

test('sticky display: a cell that omits a slug keeps the prior message; no cell keeps everything', () => {
  const action = makeAction({ demo: { message: 'prior message' } });
  // No cell for the target stage — prior value sticks.
  const noCell = plan({ action });
  expect(noCell.doc.demo.message).toBe('prior message');
  // Cell present but omits demo — prior value sticks; status_title still set.
  const omitsSlug = plan({
    action,
    actionConfig: makeConfig({ status_map: { done: { status_title: 'Done' } } }),
  });
  expect(omitsSlug.doc.demo.message).toBe('prior message');
  expect(omitsSlug.doc.status_title).toBe('Done');
});

test('per-verb links map spread onto the doc per slug (done stage exposes only view)', () => {
  const result = plan();
  expect(result.doc.demo.links).toEqual({
    view: {
      pageId: 'workflows/onboarding-qualify-view',
      urlQuery: { action_id: 'a-1' },
    },
    edit: null,
    review: null,
    error: null,
  });
});

test('links computation reads access/workflow_type off the composed doc, not the loaded one', () => {
  // Loaded action carries no access/workflow_type — only the planner's
  // denormalisation makes the links computable.
  const result = plan({
    action: makeAction({ stage: 'blocked', kind: 'simple' }),
    signal: 'unblock',
    actionConfig: makeConfig({ kind: 'simple' }),
  });
  expect(result.doc.demo.links.edit).toEqual({
    pageId: 'workflows/workflow-simple-edit',
    urlQuery: { action_id: 'a-1' },
  });
});

test('persists denormalised access and workflow_type on the composed doc', () => {
  const actionConfig = makeConfig();
  const result = plan({ actionConfig });
  expect(result.doc.access).toEqual(actionConfig.access);
  expect(result.doc.workflow_type).toBe('onboarding');
});

test('user null FSM resolution throws signal_not_allowed', () => {
  expect(() => plan({ signal: 'approve' })).toThrow(
    expect.objectContaining({ code: 'signal_not_allowed' }),
  );
});

test('auxiliary and cascade null FSM resolutions are silent no-ops', () => {
  expect(plan({ signal: 'approve', source: 'auxiliary' })).toBeNull();
  expect(plan({ signal: 'unblock', source: 'cascade' })).toBeNull();
});

test('change-log delta: before is the loaded doc, after is the composed doc', () => {
  const action = makeAction();
  const result = plan({ action });
  expect(result.changeLog.before).toBe(action);
  expect(result.changeLog.after).toBe(result.doc);
});

test('does not mutate the loaded action doc', () => {
  const action = makeAction();
  const snapshot = JSON.parse(JSON.stringify(action));
  plan({ action, payload: { fields: { x: 1 }, metadata: { y: 2 } } });
  expect(JSON.parse(JSON.stringify(action))).toEqual(snapshot);
});

describe('upsert spawn', () => {
  function spawn(overrides = {}) {
    return planActionTransition({
      action: null,
      signal: 'activate',
      source: 'auxiliary',
      upsert: true,
      key: 'k-1',
      actionConfig: makeConfig({ type: 'install-step', kind: 'simple' }),
      loadedWorkflow,
      entry_id,
      event_id,
      now,
      newId: () => 'new-1',
      ...overrides,
    });
  }

  test('activate spawns operation: insert at the none-resolved birth stage', () => {
    const result = spawn();
    expect(result.operation).toBe('insert');
    expect(result.doc.status).toEqual([{ stage: 'action-required', event_id, created: now }]);
  });

  test('block spawns at blocked', () => {
    expect(spawn({ signal: 'block' }).doc.status[0].stage).toBe('blocked');
  });

  test('insert draft carries the full createAction field set plus denormalised fields', () => {
    const result = spawn({ payload: { metadata: { m: 1 } } });
    expect(result.doc).toEqual({
      _id: 'new-1',
      workflow_id: 'wf-1',
      type: 'install-step',
      kind: 'simple',
      key: 'k-1',
      action_group: null,
      status: [{ stage: 'action-required', event_id, created: now }],
      entity_id: 'ent-1',
      entity_collection: 'companies',
      assignees: [],
      due_date: null,
      description: null,
      tracker: null,
      child_workflow_id: null,
      child_entity_id: null,
      child_entity_collection: null,
      created: now,
      updated: now,
      metadata: { m: 1 },
      access: { demo: { view: true, edit: true } },
      workflow_type: 'onboarding',
      demo: {
        links: {
          view: {
            pageId: 'workflows/workflow-simple-view',
            urlQuery: { action_id: 'new-1' },
          },
          edit: {
            pageId: 'workflows/workflow-simple-edit',
            urlQuery: { action_id: 'new-1' },
          },
          review: null,
          error: null,
        },
      },
    });
  });

  test('tracker spawn is a structural no-op (tracker FSM has no none row)', () => {
    // Tracker actions are engine-created by StartWorkflow / the tracker
    // subscription, never pre-hook-spawned — the tracker table has no `none`
    // creation row, so an auxiliary upsert resolves null and no-ops.
    const result = spawn({
      signal: 'block',
      actionConfig: makeConfig({
        type: 'child-flow',
        kind: 'tracker',
        tracker: { workflow_type: 'child-type' },
      }),
    });
    expect(result).toBeNull();
  });

  test('insert change-log delta has null before', () => {
    const result = spawn();
    expect(result.changeLog).toEqual({ before: null, after: result.doc });
  });

  test('missing target without upsert throws missing_target', () => {
    expect(() => spawn({ upsert: false })).toThrow(
      expect.objectContaining({ code: 'missing_target' }),
    );
  });
});
