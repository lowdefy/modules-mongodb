# Task 3: Shared MongoDB connection helper (community-plugin dispatcher)

## Context

Every `WorkflowAPI` handler ([engine/spec.md § Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)) delegates its Mongo reads and writes to `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection` request handlers via a thin per-collection dispatcher. The helper this task lands is the `createMongoDBConnection(lowdefyContext)` factory — single entry point reused by every handler in parts 5+.

The shape, in use:

```js
async function SubmitWorkflowAction(lowdefyContext) {
  const { connection, request } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: request,
  };
  return handleSubmit(context);
}

// inside handlers:
const action = await context.mongoDBConnection('actions').MongoDBFindOne({
  query: { _id: actionId },
  options: { projection: { /* ... */ } },
});

await context.mongoDBConnection('actions').MongoDBInsertOne({ doc });
```

Connection lifecycle, pooling, BSON serialization, and `changeLog` writes are owned by the community plugin. Every community-plugin handler opens a fresh `MongoClient` per request and closes it in a `finally` block — the same posture every other module in this repo uses. The engine adds no client management of its own.

> **Supersedes the raw-driver direction in [engine review-1](../../../workflows-module-concept/engine/review/review-1.md).** See [engine review-2](../../../workflows-module-concept/engine/review/review-2.md) for the rationale.

**No raw-driver `mongodb` import.** The plugin package does not depend directly on `mongodb`; it depends on `@lowdefy/community-plugin-mongodb` as a `peerDependency`, since consumers already install the community plugin as part of their Lowdefy app.

**No `assertIndexes`.** The three engine-required indexes (`workflow_action_key_unique`, `actions_by_entity`, `workflows_by_entity` — see [engine spec § Indexes](../../../workflows-module-concept/engine/spec.md#indexes)) are not asserted at runtime. They're documented in the workflows module README as required-indexes, consumer-created via the repo's `r:index-dev` migration pattern. This matches every other module in the repo (`activities`, `companies`, `notifications` all document indexes prose-style without auto-asserting).

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/createMongoDBConnection.js`:

```js
import { MongoDBCollection } from '@lowdefy/community-plugin-mongodb/connections';

/**
 * Build a per-collection dispatcher over @lowdefy/community-plugin-mongodb's
 * `MongoDBCollection.requests`. Callers receive a function that takes a
 * MongoDB collection name and returns the full set of community-plugin
 * request handlers bound to that collection.
 *
 * @param {{
 *   blockId: string,
 *   connection: {
 *     databaseUri: string,
 *     changeLog?: object,
 *     options?: object,
 *     [key: string]: any,
 *   },
 *   connectionId: string,
 *   pageId: string,
 *   requestId: string,
 * }} lowdefyContext
 * @returns {(collection: string) => Record<string, (properties: object) => Promise<any>>}
 */
function createMongoDBConnection({
  blockId,
  connection,
  connectionId,
  pageId,
  requestId,
}) {
  const { changeLog, databaseUri, options } = connection;
  const mongoConnection = { changeLog, databaseUri, options };
  const { requests } = MongoDBCollection;
  return (collection) => {
    const mongoRequests = {};
    Object.keys(requests).forEach((requestKey) => {
      mongoRequests[requestKey] = (properties) =>
        requests[requestKey]({
          blockId,
          connection: { ...mongoConnection, collection },
          connectionId,
          pageId,
          request: properties,
          requestId,
        });
    });
    return mongoRequests;
  };
}

export default createMongoDBConnection;
```

**Package.json adjustments**:

- Add `@lowdefy/community-plugin-mongodb` to `peerDependencies` (range `^3`).
- Do **not** add `mongodb` as a direct dependency — the dispatcher never imports from it.
- No new `test` script — the dispatcher is a hand-rolled pass-through over an existing handler set; behaviour-level coverage lands in parts 5/6 against the real handlers (`StartWorkflow`, `SubmitWorkflowAction`, etc.).

## Acceptance Criteria

- `src/connections/shared/createMongoDBConnection.js` exists and exports the dispatcher matching the JSDoc signature above.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build` succeeds; `dist/connections/shared/createMongoDBConnection.js` is emitted.
- React-leak grep on `dist/connections/` is clean.
- `package.json` declares `@lowdefy/community-plugin-mongodb` as a peer; no `mongodb` direct dep.
- Calling `createMongoDBConnection(stubLowdefyContext)('actions')` returns an object whose keys cover every entry in `MongoDBCollection.requests` (verified informally during integration with parts 5/6 — no dedicated unit test in this task).
- Demo build (`pnpm --filter @lowdefy/modules-demo ldf:b`) still succeeds with the helper in place.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/createMongoDBConnection.js` — create — community-plugin dispatcher.
- `plugins/modules-mongodb-plugins/package.json` — modify — add `@lowdefy/community-plugin-mongodb` peerDep.

## Notes

- The dispatcher captures the Lowdefy request context (`blockId`, `connection`, `connectionId`, `pageId`, `requestId`) at call time so every delegated request carries it through unchanged. This is what lets `changeLog` writes happen — the community-plugin handlers read `connection.changeLog` and write to the consumer's `log-changes` collection automatically.
- `connection` is the full connection-config object the Lowdefy runtime passes the handler. It carries `databaseUri`, optional `changeLog`, optional `options`, and any extra fields the engine-side connection schema declares (e.g. `workflowsConfig`, `actionsEnum`, `changeStamp` — see part 04). The dispatcher only forwards the Mongo-relevant subset (`databaseUri`, `changeLog`, `options`) to community-plugin handlers; the engine-specific fields stay on the handler-local `context` for the engine's own use.
- Each helper-issued request opens and closes its own `MongoClient`. Driver pooling makes this cheap in steady state but it's a real per-request cost. Documented as a risk in the engine spec. Acceptable for v1 (same posture every other module accepts).
- No transactional opt-in path. Community-plugin handlers don't expose sessions. Documented as deferred in the engine spec.
- The previous-generation engine implementation lives under `src/connections/old/` for reference (used as the source of this helper shape and the prior `StartWorkflow` / `UpdateWorkflowActions` / `CloseWorkflowActions` implementations). It is not wired into the plugin's `connections.js` export. Parts 5/6 will port the relevant handler bodies, renamed to current request type names (`StartWorkflow`, `SubmitWorkflowAction`, `CancelWorkflow`) and updated against the current engine spec. The `old/` tree comes out once parts 5/6 land.
