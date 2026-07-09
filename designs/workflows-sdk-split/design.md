# Workflows SDK Split

Extract the workflow engine out of the Lowdefy plugin package into a standalone, framework-agnostic package — `@lowdefy/mongodb-workflows-sdk` — so the same engine can run inside non-Lowdefy Node services (AWS Lambda microservices and similar). Those services need the full verb surface: start workflows, submit signals, cancel/close, update action fields, and query workflow state. The Lowdefy plugin (`@lowdefy/modules-mongodb-plugins`) keeps its `WorkflowAPI` and `EventsTimeline` connections but becomes a thin adapter over the SDK.

## Problem

The engine (FSM, load → plan → commit pipeline, tracker cascade, event/notification dispatch, raw-Mongo layer) lives at `plugins/modules-mongodb-plugins/src/connections/{WorkflowAPI,shared,mongo}` and is only invocable as Lowdefy connection request resolvers. A Lambda that wants to start a workflow today would have to fake a `lowdefyContext` — including `callApi`, a Lowdefy-only dispatch primitive — or reimplement the engine.

The engine is, however, already shaped for extraction:

- Every Lowdefy touchpoint funnels through one adapter, `shared/phases/createEngineContext.js`. Downstream code reads only `context.*`.
- All external dispatch goes through the uniform `callApi({ endpointId, payload })` at exactly five call sites: event insert (`commitPlan`), notifications (`dispatchNotifications`), pre/post hooks (`invokePreHook`/`invokePostHook`), and entity-data resolution (`resolveEntityData`).
- Handler tests already build a plain context with a mock `callApi` — the engine is decoupled at the test seam.

## Decisions

### D1 — SDK config vocabulary = connection-schema vocabulary

`createWorkflowsEngine(config)` takes a flat config using exactly the keys today's connection schema defines (`databaseUri`, `databaseName`, `options`, `useTransactions`, `workflowsCollection`, `actionsCollection`, `eventsCollection`, `contactsCollection`, `workflowsConfig`, `app_name`, `entry_id`, `enable_internal_comments`, `changeLog`) plus `callbacks` and `logger`. Internally `createContext` assigns `context.connection = config`, so the ~40 engine files that read `context.connection.*` move verbatim and the Lowdefy adapter is destructure-and-pass.

**Rejected:** renaming to camelCase / regrouping under a `mongo: {}` sub-object. Pure rename churn — it would touch every file that moves, split the vocabulary between the YAML schema and the SDK README, and buy nothing.

### D2 — Semantic callbacks per instance; hooks as per-call functions

The SDK never sees a Lowdefy `endpointId`. Instance config carries:

- `callbacks.emitEvent(eventDoc)` — required for write verbs (the engine emits exactly one event per invocation; silently dropping it would corrupt the timeline/notification pipeline).
- `callbacks.sendNotification({ event_ids })` — optional; absent → silent no-op, matching today's behaviour when an app's `send_notification` routine is empty.
- `callbacks.resolveEntityData({ workflow_type, entity_id })` — optional; absent → entity data degrades to `null`, the existing graceful-degrade path.

Pre/post hooks stay **per-call** (they are per-workflow-type × per-signal, and the Lowdefy wrapper only learns the hook endpoint ids from request params at call time): the leaves of `params.hooks[actionType][signal].{pre,post}` become plain async `(payload) => result` functions. The Lowdefy adapter wraps each endpointId leaf as `(payload) => callApi({ endpointId, payload })`. Non-Lowdefy consumers pass ordinary functions.

**Rejected:** a single generic `dispatch({ endpointId, payload })` callback. Thinnest possible wrapper, but it leaks the Lowdefy endpoint concept into the core and forces every Lambda consumer to route on opaque strings.

### D3 — Per-call input `(params, { user, stamp, audit })`

Values that are per-invocation in Lowdefy (evaluated by the framework per request) become explicit per-call arguments:

- `user` — replaces `connection.user` (`_user: true` wiring).
- `stamp` — becomes `context.now`; replaces `connection.changeStamp` (the events-module `change_stamp` component evaluated per request). The `{ timestamp, user }` shape stays app-defined; see D4 for what the SDK enforces.
- `audit` — an opaque `{ blockId, connectionId, pageId, requestId, payload }` bag consumed only by `planChangeLog` (replaces the raw `lowdefyContext` pass-through; `request` renamed `payload`). All fields optional — non-Lowdefy consumers can put whatever request identifiers they have here, or nothing.

### D4 — Write preconditions in one place

The facade's shared `writeCall()` throws `WorkflowEngineError` (`code: "invalid_params"` / `"missing_callback"`) when `stamp?.timestamp` or `callbacks.emitEvent` is missing on a write verb. These guard real, harmful mistakes (documents committed with `undefined` stamps break the CAS anchor; a missing emitEvent silently loses the invocation's event). Reads have no such gate. The stamp's shape beyond `timestamp` is deliberately not validated — it is app-defined.

### D5 — GetEventsTimeline logic moves into the SDK

`GetEventsTimeline` imports engine internals (`createEngineContext`, `collectionNames`, `resolveActionAccess`, order comparators). Rather than exporting SDK internals or duplicating them, its handler moves into the SDK as `getEventsTimeline`; the EventsTimeline *connection* (schema + Lowdefy wiring) stays in the plugin like WorkflowAPI's does.

### D6 — Package location and identity

New top-level `packages/mongodb-workflows-sdk` with a `packages/*` glob added to `pnpm-workspace.yaml`. It is not a Lowdefy plugin, so `plugins/` would mislabel it. Named `@lowdefy/mongodb-workflows-sdk` — outside the changesets `fixed` glob `@lowdefy/modules-mongodb-*` — so it versions independently of the blocks/plugin release train that Lambda consumers don't care about. The plugin depends on it via `workspace:^`.

### D7 — Dependencies

`mongodb: ^6` and `@lowdefy/nunjucks` are **regular dependencies** of the SDK (the plugin declared `mongodb` as a peer). Lambda consumers shouldn't have to manage peers, and `@lowdefy/nunjucks` (a standalone published package) is kept over plain `nunjucks` so rendered output can't drift from what Lowdefy apps render. The dead `shared/createMongoDBConnection.js` is deleted and the `@lowdefy/community-plugin-mongodb` peer dependency dropped (apps/modules declare that plugin in their own YAML manifests — unaffected).

### D8 — Internal shape: handlers become `(context)`

Handlers drop their `createEngineContext(lowdefyContext)` first line and their `.schema` / `.meta` statics (Lowdefy resolver concerns, now owned by the plugin adapter). `createEngineContext.js` becomes the SDK's `createContext(config, { params, user, stamp, audit })`. Downstream code keeps reading `context.connection.*`, `context.now`, `context.workflowsConfig` etc. unchanged; `context.callApi` → `context.callbacks`; `context.lowdefyContext` → `context.audit`.

## Compatibility notes

- **Deep imports break.** The plugin's `"./*": "./dist/*"` wildcard export meant engine internals were technically importable from `@lowdefy/modules-mongodb-plugins`; those paths vanish from the plugin's dist. The dedicated `"./fsm"` export is preserved via re-export from the SDK (`@lowdefy/mongodb-workflows-sdk/fsm` is the canonical location). Called out in the changeset.
- **Changesets ripple.** An SDK bump patch-bumps the dependent plugin, which bumps the whole fixed `modules-mongodb-*` group. Expected noise.
- **Client-side nunjucks.** `blocks/ContactSelector/ContactListItem.js` imported the engine's `parseNunjucks.js`; the four-line helper is duplicated under `blocks/shared/` rather than pulling a server SDK into the client bundle.
- **Mongo client cache.** The SDK keeps the module-scoped pooled `MongoClient` cache keyed by `databaseUri` — same behaviour class as today, and desirable in Lambda (connection reuse across warm invocations). `clearMongoClientCache()` remains test-only.
- **Testing export.** `@lowdefy/mongodb-workflows-sdk/testing` exposes the `inMemoryMongo` harness (mongodb-memory-server) so the plugin's adapter test — and any consumer — can run the engine against an in-memory replica set.
