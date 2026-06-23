import planEventDispatch from './planEventDispatch.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const event_id = 'ev-1';

const user = { id: 'u1', profile: { name: 'Alice' } };

function makeWorkflow(overrides = {}) {
  return {
    _id: 'wf-1',
    workflow_type: 'onboarding',
    title: 'Onboarding',
    entity_id: 'lead-1',
    entity_ref_key: 'lead_ids',
    ...overrides,
  };
}

function makeAction(overrides = {}) {
  return {
    _id: 'a-1',
    type: 'qualify',
    title: 'Qualify',
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

test('action-event context: display title renders action.title and the verb', () => {
  const action = makeAction({ type: 'qualify', title: 'Qualify' });
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    plannedActionDoc: action,
    status_after: 'done',
  });
  const title = doc.display[connection.app_name].title;
  expect(title).toContain('Alice');
  expect(title).toContain('Qualify');
});

test('workflow-lifecycle context: display title renders workflow.title (no action)', () => {
  const { doc } = dispatch({
    handlerType: 'StartWorkflow',
    allTouchedActionDocs: [makeAction()],
  });
  const title = doc.display[connection.app_name].title;
  expect(title).toContain('Alice');
  expect(title).toContain('Onboarding');
  // action.title must NOT appear (lifecycle context has no action)
  expect(title).not.toContain('Qualify');
});

test('tracker-mirror uses action-event context (action.title visible in render)', () => {
  const action = makeAction({ type: 'my-tracker', title: 'My Tracker' });
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: action,
    status_after: 'done',
    allTouchedActionDocs: [action],
  });
  const title = doc.display[connection.app_name].title;
  expect(title).toBe('My Tracker completed');
});

// ── Default titles per signal (Part 53) ──────────────────────────────────────

test('StartWorkflow default title uses workflow.title', () => {
  const { doc } = dispatch({ handlerType: 'StartWorkflow', allTouchedActionDocs: [] });
  expect(doc.display.demo.title).toBe('Alice started Onboarding');
});

test('CancelWorkflow default title uses workflow.title', () => {
  const { doc } = dispatch({ handlerType: 'CancelWorkflow', allTouchedActionDocs: [] });
  expect(doc.display.demo.title).toBe('Alice cancelled Onboarding');
});

test('CloseWorkflow default title uses workflow.title', () => {
  const { doc } = dispatch({ handlerType: 'CloseWorkflow', allTouchedActionDocs: [] });
  expect(doc.display.demo.title).toBe('Alice closed Onboarding');
});

test('submit → done renders "completed"', () => {
  const { doc } = dispatch({ signal: 'submit', status_after: 'done' });
  expect(doc.display.demo.title).toBe('Alice completed Qualify');
});

test('submit → in-review renders "submitted … for review"', () => {
  const { doc } = dispatch({ signal: 'submit', status_after: 'in-review' });
  expect(doc.display.demo.title).toBe('Alice submitted Qualify for review');
});

test('approve renders "approved"', () => {
  const { doc } = dispatch({ signal: 'approve', status_after: 'done' });
  expect(doc.display.demo.title).toBe('Alice approved Qualify');
});

test('request_changes renders "requested changes on"', () => {
  const { doc } = dispatch({ signal: 'request_changes', status_after: 'changes-required' });
  expect(doc.display.demo.title).toBe('Alice requested changes on Qualify');
});

test('progress renders "started"', () => {
  const { doc } = dispatch({ signal: 'progress', status_after: 'in-progress' });
  expect(doc.display.demo.title).toBe('Alice started Qualify');
});

test('not_required renders "marked … as not required"', () => {
  const { doc } = dispatch({ signal: 'not_required', status_after: 'not-required' });
  expect(doc.display.demo.title).toBe('Alice marked Qualify as not required');
});

test('resolve_error renders "resolved an error on"', () => {
  const { doc } = dispatch({ signal: 'resolve_error', status_after: 'in-review' });
  expect(doc.display.demo.title).toBe('Alice resolved an error on Qualify');
});

test('an unmapped action signal falls back to "updated", never a raw slug', () => {
  const { doc } = dispatch({ signal: 'some_future_signal', status_after: 'done' });
  expect(doc.display.demo.title).toBe('Alice updated Qualify');
});

test('tracker-mirror default titles are system-driven (no user attribution)', () => {
  const active = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_active',
    status_after: 'action-required',
    allTouchedActionDocs: [makeAction()],
  }).doc;
  const completed = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    status_after: 'done',
    allTouchedActionDocs: [makeAction()],
  }).doc;
  const cancelled = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_cancelled',
    status_after: 'not-required',
    allTouchedActionDocs: [makeAction()],
  }).doc;
  expect(active.display.demo.title).toBe('Qualify started');
  expect(completed.display.demo.title).toBe('Qualify completed');
  expect(cancelled.display.demo.title).toBe('Qualify cancelled');
  expect(active.display.demo.title).not.toContain('Alice');
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

test('StartWorkflow: yamlEventOverrides display override is applied', () => {
  const { doc } = dispatch({
    handlerType: 'StartWorkflow',
    allTouchedActionDocs: [],
    yamlEventOverrides: { display: { demo: { title: 'Workflow kicked off by {{ user.profile.name }}' } } },
  });
  expect(doc.display.demo.title).toBe('Workflow kicked off by Alice');
});

test('StartWorkflow: yamlEventOverrides metadata override is merged, non-overridden keys preserved', () => {
  const { doc } = dispatch({
    handlerType: 'StartWorkflow',
    signal: 'start',
    allTouchedActionDocs: [],
    yamlEventOverrides: { metadata: { custom_field: 'lifecycle-value' } },
  });
  expect(doc.metadata.custom_field).toBe('lifecycle-value');
  expect(doc.metadata.workflow_type).toBe('onboarding'); // default preserved
});

test('StartWorkflow: no override → engine default title', () => {
  const { doc } = dispatch({ handlerType: 'StartWorkflow', allTouchedActionDocs: [] });
  expect(doc.display.demo.title).toBe('Alice started Onboarding');
});

test('CancelWorkflow: yamlEventOverrides display override is applied', () => {
  const { doc } = dispatch({
    handlerType: 'CancelWorkflow',
    allTouchedActionDocs: [],
    yamlEventOverrides: { display: { demo: { title: 'Cancelled by {{ user.profile.name }}' } } },
  });
  expect(doc.display.demo.title).toBe('Cancelled by Alice');
});

test('CloseWorkflow: yamlEventOverrides display override is applied', () => {
  const { doc } = dispatch({
    handlerType: 'CloseWorkflow',
    allTouchedActionDocs: [],
    yamlEventOverrides: { display: { demo: { title: 'Closed: {{ workflow.workflow_type }}' } } },
  });
  expect(doc.display.demo.title).toBe('Closed: onboarding');
});

test('tracker-mirror: yamlEventOverrides display override wins; non-overridden keys fall through', () => {
  const action = makeAction({ type: 'tracker-task' });
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: action,
    allTouchedActionDocs: [action],
    status_after: 'done',
    yamlEventOverrides: { display: { demo: { title: 'Mirror: {{ status_after }}' } } },
  });
  expect(doc.display.demo.title).toBe('Mirror: done');
  // type and references are not overridden — engine defaults fall through
  expect(doc.type).toBe('action-internal-mirror-completed');
  expect(doc.references.workflow_ids).toEqual(['wf-1']);
});

test('tracker-mirror: no override → engine default title', () => {
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_completed',
    plannedActionDoc: makeAction(),
    allTouchedActionDocs: [makeAction()],
    status_after: 'done',
  });
  expect(doc.display.demo.title).toBe('Qualify completed');
});

test('tracker-mirror: yamlEventOverrides metadata override is merged, non-overridden keys preserved', () => {
  const action = makeAction({ type: 'tracker-task', key: 'device-1' });
  const { doc } = dispatch({
    handlerType: 'tracker-mirror',
    signal: 'internal_mirror_child_active',
    plannedActionDoc: action,
    allTouchedActionDocs: [action],
    status_after: 'action-required',
    yamlEventOverrides: { metadata: { mirror_note: 'from-yaml' } },
  });
  expect(doc.metadata.mirror_note).toBe('from-yaml');
  expect(doc.metadata.action_type).toBe('tracker-task'); // default preserved
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
  expect(doc.display.demo.title).toBe('Alice completed Qualify');
});

test('Submit: empty-object preHookEventOverrides ({}) produces output identical to no override', () => {
  // invokePreHook returns event_overrides: {} on the no-hook path — the gate
  // fires (truthy) but mergeEventOverrides must be a no-op for {}.
  const action = makeAction({ type: 'qualify' });
  const { doc } = dispatch({
    handlerType: 'SubmitWorkflowAction',
    signal: 'submit',
    plannedActionDoc: action,
    status_after: 'done',
    yamlEventOverrides: undefined,
    preHookEventOverrides: {},
  });
  expect(doc.display.demo.title).toBe('Alice completed Qualify');
  expect(doc.type).toBe('action-submit');
  expect(doc.metadata.action_type).toBe('qualify');
});
