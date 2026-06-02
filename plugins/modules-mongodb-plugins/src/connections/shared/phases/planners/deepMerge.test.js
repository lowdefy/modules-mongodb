import deepMerge from './deepMerge.js';

test('deepMerge: objects deep-merge key-by-key', () => {
  expect(
    deepMerge({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3, z: 4 } }),
  ).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 1 });
});

test('deepMerge: keys absent from patch keep their base value (sticky)', () => {
  expect(deepMerge({ demo: { message: 'old', links: { view: 'v' } } }, { demo: {} })).toEqual({
    demo: { message: 'old', links: { view: 'v' } },
  });
});

test('deepMerge: arrays replace whole', () => {
  expect(deepMerge({ a: [1, 2, 3] }, { a: [4] })).toEqual({ a: [4] });
});

test('deepMerge: scalars replace whole', () => {
  expect(deepMerge({ a: { b: 1 } }, { a: 'flat' })).toEqual({ a: 'flat' });
});

test('deepMerge: null replaces whole', () => {
  expect(deepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
});

test('deepMerge: does not mutate inputs and shares no containers with them', () => {
  const base = { a: { x: 1 }, untouched: { deep: [1] } };
  const patch = { a: { y: 2 }, fresh: { z: 3 } };
  const out = deepMerge(base, patch);
  expect(base).toEqual({ a: { x: 1 }, untouched: { deep: [1] } });
  expect(patch).toEqual({ a: { y: 2 }, fresh: { z: 3 } });
  expect(out.untouched).not.toBe(base.untouched);
  expect(out.untouched.deep).not.toBe(base.untouched.deep);
  expect(out.fresh).not.toBe(patch.fresh);
});

test('deepMerge: leaves class instances (Date) by reference, replacing whole', () => {
  const d = new Date('2026-05-20T00:00:00Z');
  const out = deepMerge({ a: { b: 1 } }, { a: d });
  expect(out.a).toBe(d);
});
