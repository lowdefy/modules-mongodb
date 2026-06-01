import parseNunjucks from './parseNunjucks.js';

/**
 * Recursively walks an object/array tree, rendering every string as a Nunjucks
 * template against `ctx`. Non-string leaves pass through unchanged.
 *
 * A recursive walk (not a JSON.stringify round-trip) so it is type-safe for
 * edge cases (`undefined`, `Date`, reserved-char keys). Part 30 D13.
 */
function renderTree(node, ctx) {
  if (typeof node === 'string') return parseNunjucks(node, ctx);
  if (Array.isArray(node)) return node.map((n) => renderTree(n, ctx));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = renderTree(v, ctx);
    return out;
  }
  return node;
}

export default renderTree;
