import substituteActionIdSentinel from './substituteActionIdSentinel.js';

test('swaps action_id:true for the real id, deeply', () => {
  const tree = {
    'app-a': {
      message: 'Review',
      link: { pageId: 'app-review', urlQuery: { action_id: true } },
    },
  };
  const out = substituteActionIdSentinel(tree, 'uuid-1');
  expect(out['app-a'].link.urlQuery.action_id).toBe('uuid-1');
});

test('leaves other true values untouched', () => {
  const out = substituteActionIdSentinel(
    { flag: true, q: { other: true, action_id: true } },
    'uuid-2',
  );
  expect(out.flag).toBe(true);
  expect(out.q.other).toBe(true);
  expect(out.q.action_id).toBe('uuid-2');
});

test('is pure — does not mutate the input', () => {
  const tree = { q: { action_id: true } };
  const out = substituteActionIdSentinel(tree, 'uuid-3');
  expect(tree.q.action_id).toBe(true);
  expect(out.q.action_id).toBe('uuid-3');
});

test('handles arrays', () => {
  const out = substituteActionIdSentinel([{ action_id: true }, 'x'], 'uuid-4');
  expect(out).toEqual([{ action_id: 'uuid-4' }, 'x']);
});
