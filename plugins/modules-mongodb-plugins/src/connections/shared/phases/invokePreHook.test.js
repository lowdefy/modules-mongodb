import invokePreHook from './invokePreHook.js';
import { WorkflowEngineError } from '../errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeLoadedState(overrides = {}) {
  return {
    workflow: overrides.workflow ?? { _id: 'W1', workflow_type: 'onboarding' },
    actions: overrides.actions ?? [],
    workflowConfig: overrides.workflowConfig ?? { type: 'onboarding', actions: [] },
    actionConfig: overrides.actionConfig ?? { type: 'qualify', kind: 'form' },
    targetAction: overrides.targetAction ?? { _id: 'A1', type: 'qualify', key: null },
  };
}

function makeParams(overrides = {}) {
  return {
    action_id: 'A1',
    signal: 'submit',
    current_key: null,
    form: {},
    form_review: {},
    fields: {},
    comment: null,
    hooks: undefined,
    ...overrides,
  };
}

const user = { id: 'u1', profile: { name: 'Sam' }, roles: ['account-manager'] };

// ─────────────────────────────────────────────────────────────────────────────
// No-hook cases
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePreHook — no-hook cases', () => {
  test('returns empty result when params.hooks is undefined', async () => {
    const callApi = jest.fn();
    const result = await invokePreHook(makeLoadedState(), makeParams(), user, callApi);
    expect(result).toEqual({ actions: [], event_overrides: {}, form_overrides: {} });
    expect(callApi).not.toHaveBeenCalled();
  });

  test('returns empty result when params.hooks[signal] is undefined', async () => {
    const callApi = jest.fn();
    const params = makeParams({ hooks: { approve: { pre: 'some-id' } } });
    // signal is 'submit', hooks only has 'approve'
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result).toEqual({ actions: [], event_overrides: {}, form_overrides: {} });
    expect(callApi).not.toHaveBeenCalled();
  });

  test('returns empty result when params.hooks[signal].pre is undefined (only .post declared)', async () => {
    const callApi = jest.fn();
    const params = makeParams({ hooks: { submit: { post: 'post-id' } } });
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result).toEqual({ actions: [], event_overrides: {}, form_overrides: {} });
    expect(callApi).not.toHaveBeenCalled();
  });

  test('returns empty result (not null) for no-hook case', async () => {
    const callApi = jest.fn();
    const result = await invokePreHook(makeLoadedState(), makeParams(), user, callApi);
    expect(result).not.toBeNull();
    expect(result.actions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePreHook — dispatch', () => {
  test('dispatches the pre-scoped hook id verbatim with the full payload', async () => {
    const callApi = jest.fn(async () => ({
      actions: [{ type: 'approve-docs', signal: 'approve' }],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({
      signal: 'submit',
      hooks: { submit: { pre: 'workflows/onboarding-qualify-submit-pre' } },
      comment: 'hi',
    });
    const loadedState = makeLoadedState();

    const result = await invokePreHook(loadedState, params, user, callApi);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith({
      endpointId: 'workflows/onboarding-qualify-submit-pre',
      payload: expect.objectContaining({
        workflow_id: 'W1',
        workflow_type: 'onboarding',
        action_id: 'A1',
        action_type: 'qualify',
        current_key: null,
        signal: 'submit',
        comment: 'hi',
        user: { id: 'u1', profile: { name: 'Sam' }, roles: ['account-manager'] },
      }),
    });
    // No third argument (no { user } bag).
    expect(callApi.mock.calls[0].length).toBe(1);

    expect(result.actions).toEqual([{ type: 'approve-docs', signal: 'approve' }]);
  });

  test('signal-keyed hooks map resolves and fires the correct pre-hook', async () => {
    const callApi = jest.fn(async () => ({
      actions: [],
      event_overrides: { foo: 'bar' },
      form_overrides: {},
    }));
    const params = makeParams({
      signal: 'approve',
      hooks: {
        submit: { pre: 'wrong-hook' },
        approve: { pre: 'workflows/onboarding-qualify-approve-pre' },
      },
    });
    const loadedState = makeLoadedState({
      targetAction: { _id: 'A1', type: 'qualify', key: null },
    });

    await invokePreHook(loadedState, params, user, callApi);

    expect(callApi).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'workflows/onboarding-qualify-approve-pre',
      }),
    );
  });

  test('null return from callApi normalises to empty result', async () => {
    const callApi = jest.fn(async () => null);
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result).toEqual({ actions: [], event_overrides: {}, form_overrides: {} });
  });

  test('payload envelope has signal, no interaction, no current_status', async () => {
    const callApi = jest.fn(async () => ({ actions: [], event_overrides: {}, form_overrides: {} }));
    const params = makeParams({ signal: 'submit', hooks: { submit: { pre: 'h' } } });
    await invokePreHook(makeLoadedState(), params, user, callApi);
    const { payload } = callApi.mock.calls[0][0];
    expect(payload).toHaveProperty('signal', 'submit');
    expect(payload).not.toHaveProperty('interaction');
    expect(payload).not.toHaveProperty('current_status');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response validation — valid shapes
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePreHook — valid response shapes', () => {
  test('auxiliary action entries with signal pass through', async () => {
    const entry = {
      type: 'approve-docs',
      key: 'k1',
      signal: 'approve',
    };
    const callApi = jest.fn(async () => ({
      actions: [entry],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result.actions).toEqual([entry]);
  });

  test('entry with upsert: true passes through', async () => {
    const entry = {
      type: 'approve-docs',
      key: 'k1',
      signal: 'progress',
      upsert: true,
    };
    const callApi = jest.fn(async () => ({
      actions: [entry],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result.actions[0].upsert).toBe(true);
  });

  test('entry fields and metadata bags survive verbatim', async () => {
    const fields = { priority: 'high', notes: 'test' };
    const metadata = { source: 'api', ref: 42 };
    const entry = {
      type: 'approve-docs',
      signal: 'approve',
      fields,
      metadata,
    };
    const callApi = jest.fn(async () => ({
      actions: [entry],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result.actions[0].fields).toBe(fields);
    expect(result.actions[0].metadata).toBe(metadata);
  });

  test('sibling keyed-instance (same type, different key) passes validation', async () => {
    // Current action is qualify key: null — an entry for qualify key: 'other' is a sibling.
    const entry = { type: 'qualify', key: 'other', signal: 'submit' };
    const callApi = jest.fn(async () => ({
      actions: [entry],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ current_key: null, hooks: { submit: { pre: 'h' } } });
    const loadedState = makeLoadedState({
      targetAction: { _id: 'A1', type: 'qualify', key: null },
    });
    const result = await invokePreHook(loadedState, params, user, callApi);
    expect(result.actions).toEqual([entry]);
  });

  test('entry targeting a different action_id passes validation', async () => {
    const entry = { action_id: 'A2', signal: 'approve' };
    const callApi = jest.fn(async () => ({
      actions: [entry],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    const result = await invokePreHook(makeLoadedState(), params, user, callApi);
    expect(result.actions).toEqual([entry]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response validation — rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePreHook — invalid_prehook_response', () => {
  test('unknown key in entry throws WorkflowEngineError with code: invalid_prehook_response', async () => {
    const callApi = jest.fn(async () => ({
      actions: [{ type: 'qualify', signal: 'submit', singal: 'typo' }],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    await expect(
      invokePreHook(makeLoadedState(), params, user, callApi),
    ).rejects.toMatchObject({
      name: 'WorkflowEngineError',
      code: 'invalid_prehook_response',
    });
  });

  test('workflow_id-carrying entry (cross-workflow form) throws invalid_prehook_response', async () => {
    const callApi = jest.fn(async () => ({
      actions: [{ type: 'qualify', signal: 'submit', workflow_id: 'OTHER' }],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    await expect(
      invokePreHook(makeLoadedState(), params, user, callApi),
    ).rejects.toMatchObject({
      name: 'WorkflowEngineError',
      code: 'invalid_prehook_response',
    });
  });
});

describe('invokePreHook — prehook_redirect', () => {
  test('entry matching current action by (type, key) throws with code: prehook_redirect', async () => {
    // Current action: type='qualify', key=null
    const callApi = jest.fn(async () => ({
      actions: [{ type: 'qualify', key: null, signal: 'approve' }],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ current_key: null, hooks: { submit: { pre: 'h' } } });
    const loadedState = makeLoadedState({
      targetAction: { _id: 'A1', type: 'qualify', key: null },
    });
    await expect(
      invokePreHook(loadedState, params, user, callApi),
    ).rejects.toMatchObject({
      name: 'WorkflowEngineError',
      code: 'prehook_redirect',
    });
  });

  test('entry matching current action by action_id throws with code: prehook_redirect', async () => {
    const callApi = jest.fn(async () => ({
      actions: [{ action_id: 'A1', signal: 'approve' }],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    const loadedState = makeLoadedState({
      targetAction: { _id: 'A1', type: 'qualify', key: null },
    });
    await expect(
      invokePreHook(loadedState, params, user, callApi),
    ).rejects.toMatchObject({
      name: 'WorkflowEngineError',
      code: 'prehook_redirect',
    });
  });

  test('entry with absent key treated as key:null for redirect check — matches current action', async () => {
    // Entry has no key field; absent key normalises to null.
    const callApi = jest.fn(async () => ({
      actions: [{ type: 'qualify', signal: 'approve' }],
      event_overrides: {},
      form_overrides: {},
    }));
    const params = makeParams({ current_key: null, hooks: { submit: { pre: 'h' } } });
    const loadedState = makeLoadedState({
      targetAction: { _id: 'A1', type: 'qualify', key: null },
    });
    await expect(
      invokePreHook(loadedState, params, user, callApi),
    ).rejects.toMatchObject({ code: 'prehook_redirect' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('invokePreHook — error propagation', () => {
  test('generic throw from callApi propagates unchanged (no try/catch)', async () => {
    const callApi = jest.fn(async () => {
      throw new Error('boom');
    });
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    await expect(
      invokePreHook(makeLoadedState(), params, user, callApi),
    ).rejects.toThrow('boom');
  });

  test('UserError(isReject: true) propagates unwrapped — not a WorkflowEngineError', async () => {
    class UserError extends Error {
      constructor(message, opts) {
        super(message);
        this.name = 'UserError';
        this.isReject = opts?.isReject ?? false;
      }
    }
    const reject = new UserError('rejected by hook', { isReject: true });
    const callApi = jest.fn(async () => {
      throw reject;
    });
    const params = makeParams({ hooks: { submit: { pre: 'h' } } });
    await expect(
      invokePreHook(makeLoadedState(), params, user, callApi),
    ).rejects.toBe(reject);
  });
});
