# Task 1: Native Mongo driver layer

## Context

The rebuilt engine writes through the native MongoDB driver instead of the community `MongoDBUpdateOne` / `MongoDBInsertOne` plugin handlers (which auto-write `changeLog` entries via per-op double-reads and create a fresh client per request). The community plugin (`shared/createMongoDBConnection.js`) exposes neither its `MongoClient` nor `Db` — it closes over per-collection request dispatchers only — so there is nothing to extract or reuse. The engine therefore constructs and owns its own pooled client.

This layer is the bottom of the dependency stack: the load phase reads through it, the commit phase writes through it, and transactions (D11) require a persistent client because a session is bound to its client.

App-side YAML `CallApi` requests continue to use the community plugin unchanged. The engine's client and the community plugin's per-request client **coexist as two independent clients** — this is the accepted root cause of why callApi'd writes (events) can't join the engine transaction.

## Task

**Declare the `mongodb` dependency.** `getMongoDb.js` is the first engine code to `import { MongoClient } from "mongodb"` directly (today the community plugin owns the driver privately). The plugin's `package.json` declares no `mongodb` — it resolves today only by pnpm-hoist accident (`mongodb@6.21.0` at the workspace root). Add `mongodb` to **`peerDependencies`** with range `^6` (matching the community plugin's major, so a consuming app dedupes to one v6 driver build rather than bundling a second copy). Not `dependencies` — the engine wants to share the app's single driver build; bundling would lock in the doubled-driver coexistence D8 only tolerates as a quirk. (The community plugin pins an exact `mongodb@6.3.0` of its own; that's an external choice we can't change, and D8 already accepts the two clients coexisting — both are v6, so `findOneAndUpdate` returns the doc/`null` directly as the helpers assume.)

Create `plugins/modules-mongodb-plugins/src/connections/mongo/` with these helpers (all accept an optional `session` for transaction participation):

- `getMongoDb.js` — constructs a `MongoClient` from the connection's `databaseUri` (already in `WorkflowAPI/schema.js`), **caches it at module scope keyed by `databaseUri`**, and reuses it across handler invocations. Exposes both:
  - `context.mongoDb` — the raw `Db`, used by all helpers below.
  - `context.mongoClient` — the `MongoClient`, used by `commitPlan` for `startSession()`.
  - **Topology detection (D11):** at connection init run the `hello` command; set `context.useTransactions = true` when the result carries `setName` (replica set) or `msg: "isdbgrid"` (mongos), else `false`. **Log the detected mode at startup — never silent.** Allow `useTransactions` to be forced off via connection config.
- `findOneAndUpdateDoc({ collection, filter, update, session? })` — wraps `findOneAndUpdate({ returnDocument: "after" })`. Returns the post-write doc (or `null` when the filter matches zero docs — the CAS-miss signal).
- `bulkWriteActions({ operations, session? })` — wraps `bulkWrite` against the actions collection. `operations` is an array of `{ updateOne: {...} }` / `{ insertOne: {...} }`. Returns acknowledged counts only (no per-op post-write docs — the Plan already holds them).
- `insertOneDoc({ collection, doc, session? })` — wraps `insertOne`. Returns inserted ID.
- `insertManyDocs({ collection, docs, session? })` — wraps `insertMany`. Used for change-log entries and notifications.
- `findDocs({ collection, query, options?, session? })` — wraps `find().toArray()`. Used by the load phase.

Add a `*.test.js` per helper. For `getMongoDb`, test that repeated calls with the same `databaseUri` return the cached client and that topology detection sets `useTransactions` correctly. For `findOneAndUpdateDoc`, test both the happy path and the **CAS-miss path** (filter matches zero docs → returns null).

## Acceptance Criteria

- All six files exist under `src/connections/mongo/` with passing unit tests.
- `getMongoDb` caches the client at module scope; a second call with the same URI does not open a new connection.
- Topology detection logs the chosen commit mode at startup and respects a config override.
- Tests run against `mongodb-memory-server` (use `MongoMemoryReplSet` where the transaction path matters; standalone is fine for the basic helpers).
- `findOneAndUpdateDoc` returns `null` on a zero-match filter (this is what the CAS gate in task 13 relies on).
- `mongodb` is declared in the plugin's `peerDependencies` (`^6`); the direct `import` from `mongodb` no longer resolves by hoist accident.

## Files

- `plugins/modules-mongodb-plugins/package.json` — modify — add `mongodb: "^6"` to `peerDependencies`
- `plugins/modules-mongodb-plugins/src/connections/mongo/getMongoDb.js` — create
- `plugins/modules-mongodb-plugins/src/connections/mongo/findOneAndUpdateDoc.js` — create
- `plugins/modules-mongodb-plugins/src/connections/mongo/bulkWriteActions.js` — create
- `plugins/modules-mongodb-plugins/src/connections/mongo/insertOneDoc.js` — create
- `plugins/modules-mongodb-plugins/src/connections/mongo/insertManyDocs.js` — create
- `plugins/modules-mongodb-plugins/src/connections/mongo/findDocs.js` — create
- `plugins/modules-mongodb-plugins/src/connections/mongo/*.test.js` — create (one per helper)

## Notes

- Do **not** touch `shared/createMongoDBConnection.js` — the community plugin stays in use for app-side code.
- The helpers are engine-internal only. Keep their API JS-shaped (sessions, raw driver methods, bulk ops) — not the YAML-CallApi `{ filter, update }` serializable shape the community plugin uses.
- `bulkWriteActions` deliberately does not return per-doc before/after — the change-log builder (task 12) reads before/after from the Plan, not from the write.
