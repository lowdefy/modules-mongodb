import invokePostHook from './invokePostHook.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeLoadedState(overrides = {}) {
  return {
    workflow: overrides.workflow ?? { _id: 'W1', workflow_type: 'onboarding' },
    actions: overrides.actions ?? [],
    workflowConfig: overrides.workflowConfig ?? {},
    actionConfig: overrides.actionConfig ?? { type: 'qualify', kind: 'form' },
    targetAction: overrides.targetAction ?? {
      _id: 'A1',
      type: 'qualify',
      key: null,
      status: [{ stage: 'in-progress' }],
    },
  };
}

function makePlan(overrides = {}) {
  return {
    workflow: {
      doc: overrides.workflowDoc ?? {
        _id: 'W1',
        workflow_type: 'onboarding',
        status: [{ stage: 'in-progress' }],
      },
      operation: 'update',
      changeLog: { before: null, after: {} },
    },
    actions: overrides.actions ?? [
      {
        doc: {
          _id: 'A1',
          type: 'qualify',
          key: null,
          status: [{ stage: 'approved' }],
        },
        operation: 'update',
        changeLog: { before: null, after: {} },
      },
    ],
    event: { doc: { _id: 'EV-1' } },
    changeLog: [],
    trackerFires: [],
    completedGroups: overrides.completedGroups ?? [],
  };
}

function makeCommitResult(overrides = {}) {
  return {
    workflow_id: 'W1',
    action_ids: ['A1'],
    event_id: 'EV-1',
    dispatchErrors: [],
    ...overrides,
  };
}

function makeParams(overrides = {}) {
  return {
    action_id: 'A1',
    signal: 'approve',
    current_key: null,
    form: {},
    form_review: {},
    fields: {},
    comment: null,
    hooks: undefined,
    ...overrides,
  };
}

const user = { id: 'u1', profile: { name: 'Sam' }, roles: ['compliance-officer'] };
const trackerFired = [];

// ─────────────────────────────────────────────────────────────────────────────
// No-hook cases
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePostHook — skip cases', () => {
  test('returns null when params.hooks is undefined', async () => {
    const callApi = jest.fn();
    const result = await invokePostHook(
      makeLoadedState(),
      makePlan(),
      makeCommitResult(),
      trackerFired,
      makeParams(),
      user,
      callApi,
    );
    expect(result).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });

  test('returns null when params.hooks[signal] is undefined', async () => {
    const callApi = jest.fn();
    const params = makeParams({ hooks: { submit: { post: 'some-id' } } });
    // signal is 'approve', hooks only has 'submit'
    const result = await invokePostHook(
      makeLoadedState(),
      makePlan(),
      makeCommitResult(),
      trackerFired,
      params,
      user,
      callApi,
    );
    expect(result).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });

  test('returns null when params.hooks[signal].post is undefined (only .pre declared)', async () => {
    const callApi = jest.fn();
    const params = makeParams({ hooks: { approve: { pre: 'pre-id' } } });
    const result = await invokePostHook(
      makeLoadedState(),
      makePlan(),
      makeCommitResult(),
      trackerFired,
      params,
      user,
      callApi,
    );
    expect(result).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePostHook — dispatch', () => {
  test('dispatches the pre-scoped hook id verbatim with payload', async () => {
    const callApi = jest.fn(async () => ({ logged: true }));
    const params = makeParams({
      signal: 'approve',
      hooks: { approve: { post: 'workflows/onboarding-qualify-approve-post' } },
    });

    const response = await invokePostHook(
      makeLoadedState(),
      makePlan(),
      makeCommitResult(),
      trackerFired,
      params,
      user,
      callApi,
    );

    expect(response).toEqual({ logged: true });
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith({
      endpointId: 'workflows/onboarding-qualify-approve-post',
      payload: expect.objectContaining({
        workflow_id: 'W1',
        workflow_type: 'onboarding',
        action_id: 'A1',
        signal: 'approve',
      }),
    });
    // No third argument.
    expect(callApi.mock.calls[0].length).toBe(1);
  });

  test('payload.context carries planned docs — post-commit fresh state', async () => {
    const callApi = jest.fn(async () => ({}));
    // Plan updates the action's status to 'approved'.
    const plannedActionDoc = {
      _id: 'A1',
      type: 'qualify',
      key: null,
      status: [{ stage: 'approved' }],
    };
    const plannedWorkflowDoc = {
      _id: 'W1',
      workflow_type: 'onboarding',
      status: [{ stage: 'completed' }],
    };
    const plan = makePlan({
      workflowDoc: plannedWorkflowDoc,
      actions: [{ doc: plannedActionDoc, operation: 'update', changeLog: {} }],
    });
    const loadedState = makeLoadedState({
      targetAction: {
        _id: 'A1',
        type: 'qualify',
        key: null,
        status: [{ stage: 'in-progress' }], // pre-commit
      },
    });
    const params = makeParams({ hooks: { approve: { post: 'h' } } });

    await invokePostHook(loadedState, plan, makeCommitResult(), trackerFired, params, user, callApi);

    const { payload } = callApi.mock.calls[0][0];
    // The planned (post-commit) doc is visible — new stage.
    expect(payload.context.action.status[0].stage).toBe('approved');
    expect(payload.context.workflow.status[0].stage).toBe('completed');
    // Not the loaded (pre-commit) stage.
    expect(payload.context.action.status[0].stage).not.toBe('in-progress');
  });

  test('payload.result is exactly { action_ids, completed_groups, event_id, tracker_fired } — no dispatchErrors', async () => {
    const callApi = jest.fn(async () => ({}));
    const params = makeParams({ hooks: { approve: { post: 'h' } } });
    const commitResult = makeCommitResult({
      action_ids: ['A1', 'A2'],
      event_id: 'EV-99',
      dispatchErrors: [{ step: 3, error: new Error('oops') }],
    });
    const plan = makePlan({ completedGroups: ['review-group'] });
    const fired = [{ parent_action_id: 'A0', parent_workflow_id: 'W0', new_status: 'completed' }];

    await invokePostHook(
      makeLoadedState(),
      plan,
      commitResult,
      fired,
      params,
      user,
      callApi,
    );

    const { payload } = callApi.mock.calls[0][0];
    expect(payload.result).toEqual({
      action_ids: ['A1', 'A2'],
      completed_groups: ['review-group'],
      event_id: 'EV-99',
      tracker_fired: fired,
    });
    expect(payload.result).not.toHaveProperty('dispatchErrors');
  });

  test('successful response is returned verbatim', async () => {
    const response = { foo: 'bar', extra: [1, 2] };
    const callApi = jest.fn(async () => response);
    const params = makeParams({ hooks: { approve: { post: 'h' } } });
    const result = await invokePostHook(
      makeLoadedState(),
      makePlan(),
      makeCommitResult(),
      trackerFired,
      params,
      user,
      callApi,
    );
    expect(result).toBe(response);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePostHook — error propagation', () => {
  test('throw from callApi propagates unchanged (no try/catch)', async () => {
    const callApi = jest.fn(async () => {
      throw new Error('post-hook boom');
    });
    const params = makeParams({ hooks: { approve: { post: 'h' } } });
    await expect(
      invokePostHook(
        makeLoadedState(),
        makePlan(),
        makeCommitResult(),
        trackerFired,
        params,
        user,
        callApi,
      ),
    ).rejects.toThrow('post-hook boom');
  });

  test('UserError(isReject: true) propagates unwrapped', async () => {
    class UserError extends Error {
      constructor(message, opts) {
        super(message);
        this.name = 'UserError';
        this.isReject = opts?.isReject ?? false;
      }
    }
    const reject = new UserError('post-hook rejected', { isReject: true });
    const callApi = jest.fn(async () => {
      throw reject;
    });
    const params = makeParams({ hooks: { approve: { post: 'h' } } });
    await expect(
      invokePostHook(
        makeLoadedState(),
        makePlan(),
        makeCommitResult(),
        trackerFired,
        params,
        user,
        callApi,
      ),
    ).rejects.toBe(reject);
  });
});
