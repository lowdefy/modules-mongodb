import resolveSignal, { hasReview } from './resolveSignal.js';

const action = (kind, stage) => ({ kind, status: [{ stage }] });

test('resolves a direct target cell', () => {
  expect(
    resolveSignal({ action: action('form', 'blocked'), signal: 'unblock', actionConfig: {} }),
  ).toBe('action-required');
});

test('returns null for a signal with no entry in the current stage', () => {
  // unblock no-ops from a non-blocked state.
  expect(
    resolveSignal({
      action: action('form', 'action-required'),
      signal: 'unblock',
      actionConfig: {},
    }),
  ).toBeNull();
  // unknown-but-untabled signal also no-ops here (handler rejects unknown names).
  expect(
    resolveSignal({ action: action('form', 'done'), signal: 'frobnicate', actionConfig: {} }),
  ).toBeNull();
});

test('submit lands in-review when any app declares review, else done', () => {
  const reviewing = { access: { team: { view: true, review: true } } };
  const noReview = { access: { team: { view: true, edit: true } } };
  expect(
    resolveSignal({
      action: action('form', 'action-required'),
      signal: 'submit',
      actionConfig: reviewing,
    }),
  ).toBe('in-review');
  expect(
    resolveSignal({
      action: action('form', 'action-required'),
      signal: 'submit',
      actionConfig: noReview,
    }),
  ).toBe('done');
});

test('submit split is action-global — same result for check kind', () => {
  const reviewing = { access: { a: { review: true }, b: { view: true } } };
  // Even though app b does not declare review, the action-global rule lands in-review.
  expect(
    resolveSignal({
      action: action('check', 'action-required'),
      signal: 'submit',
      actionConfig: reviewing,
    }),
  ).toBe('in-review');
});

test('resolves the none creation row for a pseudo-action (upsert spawn)', () => {
  const pseudo = { kind: 'form', status: [{ stage: 'none' }] };
  expect(resolveSignal({ action: pseudo, signal: 'activate', actionConfig: {} })).toBe(
    'action-required',
  );
  expect(resolveSignal({ action: pseudo, signal: 'block', actionConfig: {} })).toBe('blocked');
  expect(resolveSignal({ action: pseudo, signal: 'submit', actionConfig: {} })).toBeNull();
});

test('returns null for an unknown kind', () => {
  expect(
    resolveSignal({ action: action('mystery', 'blocked'), signal: 'unblock', actionConfig: {} }),
  ).toBeNull();
});

test('hasReview reads app-global from actionConfig.access', () => {
  expect(hasReview({ access: { a: { review: [] } } })).toBe(true);
  expect(hasReview({ access: { a: { view: true, edit: true } } })).toBe(false);
  expect(hasReview({ access: { a: null, b: { review: true } } })).toBe(true);
  expect(hasReview({})).toBe(false);
  expect(hasReview(undefined)).toBe(false);
});
