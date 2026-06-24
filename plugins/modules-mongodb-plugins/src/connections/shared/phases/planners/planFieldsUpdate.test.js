import planFieldsUpdate from './planFieldsUpdate.js';

const now = { timestamp: new Date('2026-05-20T00:00:00Z'), user: { id: 'u1' } };
const event_id = 'e1';

const workflow = {
  _id: 'wf-1',
  workflow_type: 'onboarding',
  entity_id: 'ent-1',
  entity_collection: 'companies',
  entity_ref_key: 'lead_ids',
};

const user = { id: 'u1', profile: { name: 'Alice' } };

function makeAction(overrides = {}) {
  return {
    _id: 'a-1',
    workflow_id: 'wf-1',
    type: 'qualify',
    title: 'Qualify',
    kind: 'form',
    key: null,
    status: [
      { stage: 'done', event_id: 'e0', created: { timestamp: new Date('2026-05-19T00:00:00Z') } },
    ],
    assignees: ['u-old'],
    due_date: new Date('2026-01-01'),
    description: { text: 'old', html: '<p>old</p>' },
    metadata: { foo: 'bar' },
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    event_id,
    now,
    user,
    connection: { app_name: 'demo', ...overrides.connection },
    lowdefyContext: overrides.lowdefyContext,
  };
}

function makeLoadedState(overrides = {}) {
  return {
    workflow,
    targetAction: overrides.targetAction ?? makeAction(),
    actionConfig: overrides.actionConfig ?? { type: 'qualify', kind: 'form' },
  };
}

function plan(overrides = {}) {
  return planFieldsUpdate({
    loadedState: makeLoadedState(overrides),
    fields: overrides.fields,
    comment: overrides.comment,
    metadata: overrides.metadata,
    context: overrides.context ?? makeContext(),
  });
}

// ── $set semantics ────────────────────────────────────────────────────────────

test('present keys are written', () => {
  const result = plan({ fields: { assignees: ['u-7'], due_date: new Date('2026-06-01') } });
  expect(result.actions[0].doc.assignees).toEqual(['u-7']);
  expect(result.actions[0].doc.due_date).toEqual(new Date('2026-06-01'));
});

test('null clears a field', () => {
  const result = plan({ fields: { due_date: null } });
  expect(result.actions[0].doc.due_date).toBeNull();
});

test('omitted keys are preserved', () => {
  const result = plan({ fields: { assignees: ['u-7'] } });
  // due_date / description not in the bag → unchanged from the loaded doc.
  expect(result.actions[0].doc.due_date).toEqual(new Date('2026-01-01'));
  expect(result.actions[0].doc.description).toEqual({ text: 'old', html: '<p>old</p>' });
});

test('non-universal keys in the bag are ignored (never written)', () => {
  const result = plan({ fields: { assignees: ['u-7'], status: [{ stage: 'hacked' }], type: 'evil' } });
  expect(result.actions[0].doc.status).toEqual(makeAction().status); // unchanged
  expect(result.actions[0].doc.type).toBe('qualify');
});

test('no fields bag → all three preserved', () => {
  const result = plan({ fields: undefined });
  const doc = result.actions[0].doc;
  expect(doc.assignees).toEqual(['u-old']);
  expect(doc.due_date).toEqual(new Date('2026-01-01'));
  expect(doc.description).toEqual({ text: 'old', html: '<p>old</p>' });
});

// ── Change stamp + status untouched ─────────────────────────────────────────

test('updated carries the injected now; status array identical; stage unchanged', () => {
  const before = makeAction();
  const result = plan({ targetAction: before, fields: { assignees: ['u-7'] } });
  expect(result.actions[0].doc.updated).toEqual(now);
  expect(result.actions[0].doc.status).toEqual(before.status);
  expect(result.actions[0].doc.status[0].stage).toBe('done');
});

test('metadata bag merges onto the action metadata', () => {
  const result = plan({ fields: {}, metadata: { extra: 'baz' } });
  expect(result.actions[0].doc.metadata).toEqual({ foo: 'bar', extra: 'baz' });
});

// ── Cell re-render ──────────────────────────────────────────────────────────

test('cell re-render reflects NEW field values on the planned doc', () => {
  const actionConfig = {
    type: 'qualify',
    kind: 'form',
    status_map: {
      done: { summary: { message: 'Assigned to {{ assignees[0] }}' } },
    },
  };
  const result = plan({ actionConfig, fields: { assignees: ['u-7'] } });
  expect(result.actions[0].doc.summary.message).toBe('Assigned to u-7');
});

test('omitted cell keys keep prior sticky values (deepMerge)', () => {
  const targetAction = makeAction({ summary: { links: { view: '/x' } } });
  const actionConfig = {
    type: 'qualify',
    kind: 'form',
    status_map: { done: { summary: { message: 'New {{ assignees[0] }}' } } },
  };
  const result = plan({ targetAction, actionConfig, fields: { assignees: ['u-7'] } });
  // message rendered fresh; links sticky from the prior doc.
  expect(result.actions[0].doc.summary.message).toBe('New u-7');
  expect(result.actions[0].doc.summary.links).toEqual({ view: '/x' });
});

test('no cell for the stage → doc unchanged apart from fields/stamp', () => {
  const actionConfig = { type: 'qualify', kind: 'form', status_map: { 'in-review': {} } };
  const result = plan({ actionConfig, fields: { assignees: ['u-7'] } });
  const doc = result.actions[0].doc;
  expect(doc.assignees).toEqual(['u-7']);
  expect(doc.updated).toEqual(now);
  // no summary cell was added
  expect(doc.summary).toBeUndefined();
});

// ── Event ─────────────────────────────────────────────────────────────────────

test('event doc: type action-fields-updated, references + metadata shape, no metadata.comment', () => {
  const result = plan({
    fields: { assignees: ['u-7'] },
    comment: { text: 'reassigned', html: '<p>reassigned</p>' },
  });
  const ev = result.event.doc;
  expect(ev.type).toBe('action-fields-updated');
  expect(ev._id).toBe(event_id);
  expect(ev.references.workflow_ids).toEqual(['wf-1']);
  expect(ev.references.action_ids).toEqual(['a-1']);
  expect(ev.references.lead_ids).toEqual(['ent-1']);
  expect(ev.metadata).toEqual({
    action_type: 'qualify',
    workflow_type: 'onboarding',
    current_key: null,
  });
  expect(ev.metadata).not.toHaveProperty('comment');
});

// ── Change-log ──────────────────────────────────────────────────────────────

test('change-log: one MongoDBUpdateOne entry with correct before/after', () => {
  const before = makeAction();
  const context = makeContext({
    connection: { app_name: 'demo', changeLog: { collection: 'log-changes', meta: { m: 1 } } },
    lowdefyContext: { request: {}, pageId: 'p', requestId: 'r' },
  });
  const result = planFieldsUpdate({
    loadedState: makeLoadedState({ targetAction: before }),
    fields: { assignees: ['u-7'] },
    context,
  });
  expect(result.changeLog).toHaveLength(1);
  expect(result.changeLog[0].type).toBe('MongoDBUpdateOne');
  expect(result.changeLog[0].before).toBe(before);
  expect(result.changeLog[0].after).toBe(result.actions[0].doc);
});

test('change-log empty when connection.changeLog is unconfigured', () => {
  const result = plan({ fields: { assignees: ['u-7'] } });
  expect(result.changeLog).toEqual([]);
});

// ── Plan shape + purity ───────────────────────────────────────────────────────

test('Plan.workflow is null and there are no trackerFires / completedGroups', () => {
  const result = plan({ fields: { assignees: ['u-7'] } });
  expect(result.workflow).toBeNull();
  expect(result).not.toHaveProperty('trackerFires');
  expect(result).not.toHaveProperty('completedGroups');
  expect(result.actions).toHaveLength(1);
  expect(result.actions[0].operation).toBe('update');
});

test('purity: same inputs → same output', () => {
  const args = {
    loadedState: makeLoadedState(),
    fields: { assignees: ['u-7'] },
    context: makeContext(),
  };
  const r1 = planFieldsUpdate(args);
  const r2 = planFieldsUpdate({ ...args, loadedState: makeLoadedState(), context: makeContext() });
  expect(r1.actions[0].doc.assignees).toEqual(r2.actions[0].doc.assignees);
  expect(r1.event.doc.type).toBe(r2.event.doc.type);
});
