import buildHookPayload from './buildHookPayload.js';

function baseContext(overrides = {}) {
  return {
    params: {
      action_id: 'A1',
      signal: 'submit',
      current_key: null,
      form: { a: 1 },
      form_review: { b: 2 },
      fields: { c: 3 },
      comment: 'looks ok',
      ...(overrides.params ?? {}),
    },
    workflow: overrides.workflow ?? {
      _id: 'W1',
      workflow_type: 'onboarding',
    },
    action: overrides.action ?? { _id: 'A1', type: 'qualify' },
    user: overrides.user ?? {
      id: 'u1',
      profile: { name: 'Sam' },
      roles: ['account-manager'],
    },
  };
}

describe('buildHookPayload', () => {
  test('builds the full payload shape (no result) — signal present, no interaction or current_status', () => {
    const ctx = baseContext();
    const payload = buildHookPayload(ctx);
    expect(payload).toEqual({
      workflow_id: 'W1',
      workflow_type: 'onboarding',
      action_id: 'A1',
      action_type: 'qualify',
      current_key: null,
      signal: 'submit',
      form: { a: 1 },
      form_review: { b: 2 },
      fields: { c: 3 },
      comment: 'looks ok',
      user: {
        id: 'u1',
        profile: { name: 'Sam' },
        roles: ['account-manager'],
      },
      context: {
        workflow: { _id: 'W1', workflow_type: 'onboarding' },
        action: { _id: 'A1', type: 'qualify' },
      },
    });
    expect(payload).not.toHaveProperty('result');
    // Envelope must not carry old fields.
    expect(payload).not.toHaveProperty('interaction');
    expect(payload).not.toHaveProperty('current_status');
  });

  test('includes result when provided', () => {
    const result = {
      action_ids: ['A1'],
      completed_groups: [],
      event_id: 'EV-1',
      tracker_fired: [],
    };
    const ctx = baseContext();
    const payload = buildHookPayload({ ...ctx, result });
    expect(payload.result).toBe(result);
  });

  test('comment defaults to null when params.comment is undefined', () => {
    const ctx = baseContext();
    delete ctx.params.comment;
    expect(buildHookPayload(ctx).comment).toBeNull();
  });

  test('context.workflow and context.action are the same references (not copies)', () => {
    const ctx = baseContext();
    const payload = buildHookPayload(ctx);
    expect(payload.context.workflow).toBe(ctx.workflow);
    expect(payload.context.action).toBe(ctx.action);
  });

  test('signal is populated from params.signal', () => {
    const ctx = baseContext({ params: { signal: 'approve' } });
    expect(buildHookPayload(ctx).signal).toBe('approve');
  });
});
