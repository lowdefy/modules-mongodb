import planEventDispatch from './planEventDispatch.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const event_id = 'ev-1';

const user = { id: 'u1', profile: { name: 'Alice' } };

function makeWorkflow(overrides = {}) {
  return {
    _id: 'wf-1',
    workflow_type: 'onboarding',
    entity_id: 'lead-1',
    entity_ref_key: 'lead_ids',
    ...overrides,
  };
}

function makeAction(overrides = {}) {
  return {
    _id: 'a-1',
    type: 'qualify',
    key: null,
    status: [{ stage: 'done' }],
    ...overrides,
  };
}

const connection = { app_name: 'demo' };

function dispatch(overrides = {}) {
  return planEventDispatch({
    event_id,
    user,
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    plannedWorkflowDoc: makeWorkflow(),
    plannedActionDoc: makeAction(),
    status_before: 'action-required',
    status_after: 'done',
    submitted_form: { score: 9 },
    allTouchedActionDocs: [makeAction()],
    connection,
    ...overrides,
  });
}

// ── Event doc shape ───────────────────────────────────────────────────────────

test('doc._id equals event_id', () => {
  const { doc } = dispatch();
  expect(doc._id).toBe(event_id);
});

test('doc carries type, display, references, metadata', () => {
  const { doc } = dispatch();
  expect(doc).toHaveProperty('type');
  expect(doc).toHaveProperty('display');
  expect(doc).toHaveProperty('references');
  expect(doc).toHaveProperty('metadata');
});

// ── Submit action event type ──────────────────────────────────────────────────

test('SubmitWorkflowAction: type is action-{signal}', () => {
  const { doc } = dispatch({ signal: 'approve' });
  expect(doc.type).toBe('action-approve');
});

test('SubmitWorkflowAction: type includes the signal name', () => {
  const { doc } = dispatch({ signal: 'submit_edit' });
  expect(doc.type).toBe('action-submit_edit');
});

// ── Lifecycle event types ─────────────────────────────────────────────────────

test('StartWorkflow: type is workflow-started', () => {
  const { doc } = dispatch({ handlerType: 'StartWorkflow', allTouchedActionDocs: [makeAction()] });
  expect(doc.type).toBe('workflow-started');
});

test('CancelWorkflow: type is workflow-cancelled', () => {
  const { doc } = dispatch({ handlerType: 'CancelWorkflow', allTouchedActionDocs: [] });
  expect(doc.type).toBe('workflow-cancelled');
});

test('CloseWorkflow: type is workflow-closed', () => {
  const { doc } = dispatch({ handlerType: 'CloseWorkflow', allTouchedActionDocs: [] });
  expect(doc.type).toBe('workflow-closed');
});

// ── Tracker-mirror event types ────────────────────────────────────────────────

test('tracker-mirror: internal_mirror_child_active → action-internal-mirror-active', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_active',
    plannedActionDoc: makeAction(),
    allTouchedActionDocs: [makeAction()],
    status_after: 'action-required',
  });
  expect(doc.type).toBe('action-internal-mirror-active');
});

test('tracker-mirror: internal_mirror_child_completed → action-internal-mirror-completed', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: makeAction(),
    allTouchedActionDocs: [makeAction()],
    status_after: 'done',
  });
  expect(doc.type).toBe('action-internal-mirror-completed');
});

test('tracker-mirror: internal_mirror_child_cancelled → action-internal-mirror-cancelled', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_cancelled',
    plannedActionDoc: makeAction(),
    allTouchedActionDocs: [makeAction()],
    status_after: 'not-required',
  });
  expect(doc.type).toBe('action-internal-mirror-cancelled');
});

// ── Render contexts asserted separately ──────────────────────────────────────

test('action-event context: display title renders action.type and status_after', () => {
  const action = makeAction({ type: 'qualify' });
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    plannedActionDoc: action,
    status_after: 'done',
  });
  const title = doc.display[connection.app_name].title;
  expect(title).toContain('Alice');
  expect(title).toContain('qualify');
  expect(title).toContain('done');
});

test('workflow-lifecycle context: display title renders workflow.workflow_type (no action)', () => {
  const { doc } = dispatch({
    handlerType: 'StartWorkflow',
    allTouchedActionDocs: [makeAction()],
  });
  const title = doc.display[connection.app_name].title;
  expect(title).toContain('Alice');
  expect(title).toContain('onboarding');
  // action.type must NOT appear (lifecycle context has no action)
  expect(title).not.toContain('qualify');
});

test('tracker-mirror uses action-event context (action.type visible in render)', () => {
  const action = makeAction({ type: 'my-tracker' });
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: action,
    status_after: 'done',
    allTouchedActionDocs: [action],
  });
  // Tracker-mirror default title: 'Tracker mirrored child {{ status_after }}'
  // Does not use action.type but uses status_after
  const title = doc.display[connection.app_name].title;
  expect(title).toContain('done');
});

// ── Default titles per handler type ──────────────────────────────────────────

test('StartWorkflow default title matches spec', () => {
  const { doc } = dispatch({ handlerType: 'StartWorkflow', allTouchedActionDocs: [] });
  expect(doc.display.demo.title).toBe('Alice started onboarding');
});

test('SubmitWorkflowAction default title matches spec', () => {
  const action = makeAction({ type: 'qualify' });
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    plannedActionDoc: action,
    status_after: 'done',
  });
  expect(doc.display.demo.title).toBe('Alice marked qualify as done');
});

test('CancelWorkflow default title matches spec', () => {
  const { doc } = dispatch({
    handlerType: 'CancelWorkflow',
    allTouchedActionDocs: [],
  });
  expect(doc.display.demo.title).toBe('Alice cancelled onboarding');
});

test('CloseWorkflow default title matches spec', () => {
  const { doc } = dispatch({
    handlerType: 'CloseWorkflow',
    allTouchedActionDocs: [],
  });
  expect(doc.display.demo.title).toBe('Alice closed onboarding');
});

test('tracker-mirror default title matches spec', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: makeAction(),
    status_after: 'done',
    allTouchedActionDocs: [makeAction()],
  });
  expect(doc.display.demo.title).toBe('Tracker mirrored child done');
});

// ── app_name keyed display ────────────────────────────────────────────────────

test('display is keyed by connection.app_name', () => {
  const { doc } = dispatch({ connection: { app_name: 'my-app' } });
  expect(doc.display).toHaveProperty('my-app');
  expect(doc.display).not.toHaveProperty('demo');
});

test('throws WorkflowEngineError when app_name is missing', () => {
  expect(() => dispatch({ connection: {} })).toThrow(/app_name is required/);
});

test('throws WorkflowEngineError when app_name is empty string', () => {
  expect(() => dispatch({ connection: { app_name: '' } })).toThrow(/app_name is required/);
});

// ── References ────────────────────────────────────────────────────────────────

test('references carries workflow_ids, action_ids from allTouchedActionDocs, and entity key', () => {
  const a1 = makeAction({ _id: 'a-1' });
  const a2 = makeAction({ _id: 'a-2' });
  const { doc } = dispatch({
    allTouchedActionDocs: [a1, a2],
    plannedWorkflowDoc: makeWorkflow({ entity_id: 'lead-99', entity_ref_key: 'lead_ids' }),
  });
  expect(doc.references.workflow_ids).toEqual(['wf-1']);
  expect(doc.references.action_ids).toEqual(['a-1', 'a-2']);
  expect(doc.references.lead_ids).toEqual(['lead-99']);
});

test('multi-action submit: submitted + unblocked action_ids all present', () => {
  const submitted = makeAction({ _id: 'a-submitted' });
  const unblocked = makeAction({ _id: 'a-unblocked' });
  const { doc } = dispatch({
    plannedActionDoc: submitted,
    allTouchedActionDocs: [submitted, unblocked],
  });
  expect(doc.references.action_ids).toContain('a-submitted');
  expect(doc.references.action_ids).toContain('a-unblocked');
});

test('references uses entity_ref_key from workflow doc', () => {
  const { doc } = dispatch({
    plannedWorkflowDoc: makeWorkflow({ entity_ref_key: 'ticket_ids', entity_id: 'T-1' }),
  });
  expect(doc.references.ticket_ids).toEqual(['T-1']);
  expect(doc.references).not.toHaveProperty('lead_ids');
});

test('throws when entity_ref_key is missing from workflow doc', () => {
  const wf = makeWorkflow();
  delete wf.entity_ref_key;
  expect(() => dispatch({ plannedWorkflowDoc: wf })).toThrow(/entity_ref_key is required/);
});

// ── Metadata per event type ───────────────────────────────────────────────────

test('action-event metadata carries all six fields (no comment)', () => {
  const action = makeAction({ type: 'qualify', key: 'device-1' });
  const { doc } = dispatch({
    plannedActionDoc: action,
    signal: 'approve',
    status_before: 'in-review',
    status_after: 'done',
  });
  expect(doc.metadata).toEqual({
    action_type: 'qualify',
    workflow_type: 'onboarding',
    signal: 'approve',
    current_key: 'device-1',
    status_before: 'in-review',
    status_after: 'done',
  });
  expect(doc.metadata).not.toHaveProperty('comment');
  expect(doc.metadata).not.toHaveProperty('interaction');
});

test('action-event metadata: current_key and status_before default to null', () => {
  const action = makeAction({ key: undefined });
  const { doc } = dispatch({
    plannedActionDoc: action,
    status_before: undefined,
  });
  expect(doc.metadata.current_key).toBeNull();
  expect(doc.metadata.status_before).toBeNull();
});

test('lifecycle metadata carries only workflow_type and signal', () => {
  const { doc } = dispatch({
    handlerType: 'StartWorkflow',
    signal: 'start',
    allTouchedActionDocs: [],
  });
  expect(doc.metadata).toEqual({ workflow_type: 'onboarding', signal: 'start' });
  expect(doc.metadata).not.toHaveProperty('action_type');
  expect(doc.metadata).not.toHaveProperty('status_before');
  expect(doc.metadata).not.toHaveProperty('status_after');
});

test('tracker-mirror metadata uses raw signal name', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: makeAction({ type: 'tracker-task' }),
    status_before: 'action-required',
    status_after: 'done',
    allTouchedActionDocs: [makeAction()],
  });
  expect(doc.metadata.signal).toBe('internal_mirror_child_completed');
});

// ── Three-source override merge (Submit only) ─────────────────────────────────

test('Submit: YAML override on metadata is merged over engine default', () => {
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    yamlEventOverrides: { metadata: { extra_field: 'yaml-value' } },
  });
  expect(doc.metadata.extra_field).toBe('yaml-value');
  expect(doc.metadata.action_type).toBe('qualify'); // default preserved
});

test('Submit: pre-hook override wins over YAML override on collision', () => {
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    yamlEventOverrides: { metadata: { shared: 'from-yaml' } },
    preHookEventOverrides: { metadata: { shared: 'from-prehook' } },
  });
  expect(doc.metadata.shared).toBe('from-prehook');
});

test('Submit: YAML override on display replaces default display for that app key', () => {
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    yamlEventOverrides: { display: { demo: { title: 'Custom {{ signal }} title' } } },
  });
  expect(doc.display.demo.title).toBe('Custom submit title');
});

test('StartWorkflow: overrides are NOT consulted (lifecycle event)', () => {
  // Even if we pass override args, lifecycle events must not apply them.
  // We verify by passing a yamlOverride that would clobber the type — it
  // must be silently ignored.
  const { doc } = dispatch({
    handlerType: 'StartWorkflow',
    allTouchedActionDocs: [],
    yamlEventOverrides: { type: 'SHOULD_BE_IGNORED' },
    preHookEventOverrides: { type: 'ALSO_IGNORED' },
  });
  expect(doc.type).toBe('workflow-started');
});

test('tracker-mirror: overrides are NOT consulted', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_active',
    plannedActionDoc: makeAction(),
    allTouchedActionDocs: [makeAction()],
    status_after: 'action-required',
    yamlEventOverrides: { type: 'SHOULD_NOT_APPLY' },
    preHookEventOverrides: { type: 'ALSO_NOT' },
  });
  expect(doc.type).toBe('action-internal-mirror-active');
});

test('Submit: no overrides → uses engine default', () => {
  const action = makeAction({ type: 'qualify' });
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    plannedActionDoc: action,
    status_after: 'done',
    yamlEventOverrides: undefined,
    preHookEventOverrides: undefined,
  });
  expect(doc.display.demo.title).toBe('Alice marked qualify as done');
});
