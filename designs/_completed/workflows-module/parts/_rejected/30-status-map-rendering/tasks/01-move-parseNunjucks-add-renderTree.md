# Task 1: Move `parseNunjucks` to shared utils + add `renderTree`

## Context

Two engine helpers we're about to introduce (`renderStatusMap`, `renderEventDisplay`) need to recursively render Nunjucks templates over an arbitrary node tree. The `parseNunjucks` helper that does the single-string rendering already exists at `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/parseNunjucks.js` — it's the only Nunjucks entry point in this repo and we want one source of truth shared across blocks and connections.

The tree walker (`renderTree`) is the same code on both the action-display and event-display paths (per design D13). Keeping it as a single helper means the walk semantics — string → `parseNunjucks`, array → map, object → recurse, primitive → passthrough — live in one place.

## Task

1. **Move `parseNunjucks.js`** from `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/parseNunjucks.js` to a new directory `plugins/modules-mongodb-plugins/src/utils/parseNunjucks.js`. Preserve the exported function unchanged.
2. **Update the existing import** in `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` to reference `../../utils/parseNunjucks.js`.
3. **Delete** the old file at `src/blocks/ContactSelector/parseNunjucks.js`.
4. **Add `src/utils/renderTree.js`** exporting a single function:

   ```js
   export default function renderTree(node, ctx) {
     if (typeof node === "string") return parseNunjucks(node, ctx);
     if (Array.isArray(node)) return node.map((n) => renderTree(n, ctx));
     if (node && typeof node === "object") {
       const out = {};
       for (const [k, v] of Object.entries(node)) out[k] = renderTree(v, ctx);
       return out;
     }
     return node;
   }
   ```

5. **Add `src/utils/renderTree.test.js`** covering:
   - String input rendered against context (`'hello {{ name }}'` with `{ name: 'world' }` → `'hello world'`).
   - Array input — each element rendered.
   - Nested object — keys preserved, values recursed.
   - Primitives (`null`, `undefined`, numbers, booleans) pass through unchanged.
   - Dot-notation keys in objects are preserved.

## Acceptance Criteria

- `src/utils/parseNunjucks.js` exists; `src/blocks/ContactSelector/parseNunjucks.js` is gone.
- `ContactListItem.js` imports from `../../utils/parseNunjucks.js` and the ContactSelector block still works (verify by running ContactSelector tests if any, or smoke test).
- `src/utils/renderTree.js` exports the recursive walker as default and uses `parseNunjucks` for strings.
- `src/utils/renderTree.test.js` covers the five cases above and passes.
- `pnpm -F modules-mongodb-plugins test` passes.

## Files

- `plugins/modules-mongodb-plugins/src/utils/parseNunjucks.js` — create (moved from old location).
- `plugins/modules-mongodb-plugins/src/utils/renderTree.js` — create.
- `plugins/modules-mongodb-plugins/src/utils/renderTree.test.js` — create.
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/parseNunjucks.js` — delete.
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` — modify (import path update).
