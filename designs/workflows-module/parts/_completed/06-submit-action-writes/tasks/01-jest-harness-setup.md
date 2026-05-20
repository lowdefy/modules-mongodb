# Task 1: Land Jest harness + `inMemoryMongo` helper + rewrite the one `node:test` file

## Context

The repo has no unit-test runner today — only Playwright for e2e under `apps/demo/e2e/`. One stray `node:test` file exists at `modules/workflows/resolvers/makeWorkflowsConfig.test.js` from part 4. The top-level [§ Testing conventions](../../../design.md#testing-conventions) committed Jest as the framework, colocated `*.test.js` files, `mongodb-memory-server` for handler-touching tests, and an `inMemoryMongo.js` helper shared across handler test files.

This task lands the harness so every subsequent task in part 6 can write tests. It's the precondition for the rest of the part — without it, tasks 2–13 have no place to put unit-test coverage.

V0 reference: the v0 workflow plugin handlers under `dist/workflows-module/old/WorkflowAPI/` had no unit tests; the convention being established here is forward-only.

Workspace shape (relevant facts):

- pnpm monorepo at the repo root. `package.json` lists `@changesets/*` as the only devDeps today and already has `mongodb-memory-server` in `pnpm.onlyBuiltDependencies`.
- `@lowdefy/community-plugin-mongodb` is already a peerDep of `plugins/modules-mongodb-plugins`. Its `MongoDBCollection` request handlers each open a fresh `MongoClient` per request and close it in a `finally` block (per [engine/spec.md § Client and transaction model](../../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)). The `inMemoryMongo` helper just gives those handlers a `databaseUri` pointing at a live in-memory instance — no driver-level monkey-patching needed.

## Task

### 1. Add Jest + supporting devDeps at the repo root

Edit the root `package.json`:

- Add to `devDependencies`:
  - `"jest": "^29"` (latest 29.x — Lowdefy itself pins `28.1.3` but the org default is 29 per the top-level conventions).
  - `"@swc/jest": "^0.2"` — Jest transformer matching the repo's `.swcrc` build setup.
  - `"mongodb-memory-server": "^10"` — already declared in `pnpm.onlyBuiltDependencies`, so the postinstall download hook works.
- Add to `scripts`:
  - `"test": "jest"` — runs the suite from the repo root; Jest's project config picks up colocated `*.test.js` files everywhere.
  - `"test:watch": "jest --watch"`.

### 2. Add `jest.config.js` at the repo root

Server-side only (no jsdom needed in v1 — every test file in this module is plugin or resolver code, no React).

```js
/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  transform: {
    '^.+\\.js$': ['@swc/jest', { jsc: { target: 'es2022' } }],
  },
  // Skip Lowdefy's own `apps/demo/.lowdefy/` build cache and any dist directories.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/apps/demo/\\.lowdefy/',
    '/apps/demo/e2e/', // Playwright lives here; let Playwright run it.
  ],
  // mongodb-memory-server boots can be slow on first download; allow 60s per file.
  testTimeout: 60000,
};

export default config;
```

### 3. Add `inMemoryMongo.js` shared helper

Location: `plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js` (test-only, but lives next to `createMongoDBConnection.js` so import paths in colocated test files stay short).

Contract:

```js
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

/**
 * Boots a `MongoMemoryServer`, returns `{ uri, mongoClient, db, cleanup }`.
 *
 * Test files should call this in `beforeAll`, hand `uri` to the
 * `WorkflowAPI` connection config (as `databaseUri`), and call `cleanup`
 * in `afterAll`. `mongoClient` + `db` are exposed for tests that need to
 * seed or assert directly against the underlying Mongo state.
 *
 * Per `engine/spec.md § Client and transaction model`: the community-plugin
 * MongoDBCollection handlers open their own `MongoClient` per request,
 * so this helper's `mongoClient` is independent from the one the engine
 * handler uses internally. That's intentional — tests can seed pre-state
 * via this client without contending with handler I/O.
 */
export async function inMemoryMongo() {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri();
  const mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  const db = mongoClient.db();
  return {
    uri,
    mongoClient,
    db,
    cleanup: async () => {
      await mongoClient.close();
      await server.stop();
    },
  };
}
```

### 4. Rewrite `modules/workflows/resolvers/makeWorkflowsConfig.test.js` from `node:test` to Jest

Existing file uses `test` from `node:test` and `assert` from `node:assert/strict`. Convert to Jest's `test` + `expect` style. Preserve every assertion — this is a pure mechanical rewrite, not a behaviour change.

Example shape (existing file's first test, post-rewrite):

```js
import makeWorkflowsConfig from './makeWorkflowsConfig.js';

const validWorkflow = {
  type: 'onboarding',
  entity_collection: 'leads-collection',
  display_order: 1,
  starting_actions: [{ type: 'do-it', status: 'action-required' }],
  actions: [{ type: 'do-it', kind: 'task' }],
};

test('makeWorkflowsConfig: entity_collection flows through and no entity_type appears on the normalized output', () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  expect(out.entity_collection).toBe('leads-collection');
  expect('entity_type' in out).toBe(false);
});
```

For `throws`-style assertions, swap `assert.throws(fn, predicate)` for `expect(fn).toThrow(matcher)` — the matcher form (RegExp or string substring) is the closest equivalent to the predicate-style check.

## Acceptance Criteria

- `pnpm test` at the repo root runs Jest with zero failing tests.
- The rewritten `makeWorkflowsConfig.test.js` passes under Jest (same coverage as the `node:test` version).
- `jest.config.js` ignores `apps/demo/e2e/` (Playwright owns it) and `apps/demo/.lowdefy/` (Lowdefy build cache).
- `plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js` exports an async function returning `{ uri, mongoClient, db, cleanup }` and at least one task-2+ test file consumes it once those land.
- `pnpm install` succeeds with no warnings about `mongodb-memory-server` build hooks.
- `pnpm build` still succeeds (SWC transforms unaffected — `@swc/jest` is test-only).

## Files

- `package.json` — modify — add `devDependencies` and `scripts.test` / `scripts.test:watch`.
- `jest.config.js` — create — repo-root Jest config (Node env, `*.test.js` glob, swc transformer, ignore patterns).
- `plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js` — create — async helper that boots `MongoMemoryServer` and returns `{ uri, mongoClient, db, cleanup }`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — rewrite from `node:test` + `node:assert/strict` to Jest's `test` + `expect`.

## Notes

- The `inMemoryMongo` helper is the **only** new dep on `mongodb-memory-server` and `mongodb`. Add both as devDeps if pnpm doesn't already hoist them to the workspace root (the root `package.json` doesn't list `mongodb` today; add it if needed for the helper's `new MongoClient(uri)` line).
- Per the top-level § Testing conventions: **no unit tests in `apps/demo/`**. The Lowdefy app is YAML; e2e coverage lives in `apps/demo/e2e/` via Playwright. Jest's `testPathIgnorePatterns` must keep both directories out of the suite.
- Parts 3, 4, 5, 14 are **grandfathered** — they shipped before the convention and don't get backfilled here. Don't touch their existing files except for the one mechanical `node:test` → Jest rewrite explicitly committed by the review.
- Future tasks in part 6 (and parts 7+) import `inMemoryMongo` from `../../shared/inMemoryMongo.js` for handler-level integration smoke tests. The helper's API stays stable across the part 6 work.
