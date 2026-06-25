# Task 3: Introduce the `EventsTimeline` plugin connection type

## Context

After task 2, `GetEventsTimeline` is config-free — a pure function of stored action
data plus the session user's roles. It currently lives on the `WorkflowAPI`
connection, whose schema **requires** workflows-only fields (`entry_id`,
`endpoints`) and carries `workflowsConfig`. The events module cannot host a
`WorkflowAPI` connection (it would pull in workflows config and identity), and its
only connection today is a generic `MongoDBCollection` (`events-collection`) that
cannot host a plugin-defined request type.

This task introduces a **new** read-only plugin connection type, `EventsTimeline`,
parallel to `WorkflowAPI`, that exposes the `GetEventsTimeline` request and nothing
else. Its schema is fully determined by what the (now config-free) engine reads off
its connection. The engine handler itself is **not moved** — it stays at
`plugins/.../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js`; the new connection
imports it from there.

`createEngineContext` (verified) reads `connection.databaseUri` (via `getMongoDb`),
`connection.user`, `connection.workflowsConfig` (now unused by this engine —
resolves to `undefined`, harmless), and `connection.changeStamp` (used only for
`now`, which `GetEventsTimeline` never writes — also harmless when absent). It does
**not** hard-require `entry_id` or `endpoints`. So no `createEngineContext` change
is needed; the new schema simply omits the workflows-only fields.

## Task

### 1. New connection directory

Create `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/`:

- `EventsTimeline.js` — the module-shaped `{ schema, requests }` export, modelled
  on `WorkflowAPI/WorkflowAPI.js`:

  ```js
  import schema from './schema.js';
  import GetEventsTimeline from '../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js';

  const EventsTimeline = {
    schema,
    requests: {
      GetEventsTimeline,
    },
  };

  export default EventsTimeline;
  ```

- `schema.js` — a JSON schema with `type: 'object'`, `additionalProperties: false`,
  exactly the fields the engine reads:
  - `databaseUri` (string, **required**) — Mongo access, typically `_secret: MONGODB_URI`.
  - `app_name` (string, **required**) — the display/access namespace key; the engine
    reads display blocks as `$<app_name>.title` and access as `access[app_name]`.
    (The events module wires its existing `display_key` var here — see task 4 / D3.)
  - `eventsCollection` (string, default `'log-events'`) — events collection.
  - `actionsCollection` (string, **no default** — see Notes) — actions collection;
    null/absent ⇒ the engine skips the actions `$lookup` and its dependent dedup
    stages (D4).
  - `contactsCollection` (string, **no default**) — contacts collection for the
    author-avatar join; null/absent ⇒ skip that join.
  - `databaseName` (string, optional) — passthrough for `getMongoDb`.
  - `user` (object, optional) — session user, wired via `_user: true`; the engine
    reads `user.roles` for role-gating.

  Copy field descriptions from `WorkflowAPI/schema.js` where they overlap
  (`databaseUri`, `app_name`, `eventsCollection`, `contactsCollection`, `user`,
  `databaseName`) so the docs stay consistent. **Do not** include `entry_id`,
  `endpoints`, `workflowsConfig`, `write`, `changeLog`, `changeStamp`,
  `workflowsCollection`, `actionsEnum`, or `entities` — none are read by this
  read-only engine.

### 2. Register the connection

In `plugins/modules-mongodb-plugins/src/connections.js`, export `EventsTimeline`
alongside `WorkflowAPI`:

```js
export { default as WorkflowAPI } from './connections/WorkflowAPI/WorkflowAPI.js';
export { default as EventsTimeline } from './connections/EventsTimeline/EventsTimeline.js';
```

### 3. Engine gating for null collections (verify / implement)

The engine must render identically to today's events-only timeline when
`actionsCollection` is null/absent (D4): skip the actions `$lookup` **and its
dependent dedup stages** (`$unwind` / `$setWindowFields` / `$group` / `$replaceRoot`
/ the `last_event_id` `$project` / the reference-value `$filter`), and skip the
`contactsCollection` `$lookup` + `created.user.picture` `$addFields` when
`contactsCollection` is null/absent.

`GetEventsTimeline.js` today defaults both collections to non-null literals
(`?? 'actions'`, `?? 'user-contacts'`, lines 36–37). Change those to honour an
explicit null:

- `const actionsCollection = connection.actionsCollection ?? null;`
- `const contactsCollection = connection.contactsCollection ?? null;`

and build the pipeline conditionally: include the actions stages only when
`actionsCollection != null`, and the contacts stages only when
`contactsCollection != null`. When the actions join is skipped, still tack an
`actions: []` key onto each event so the JS post-processing and the
`EventsTimeline` block's `Array.isArray(event.actions) && length > 0` guard behave
(D4 "renders identically, not byte-for-byte"). Keep the eventsCollection default
(`?? 'log-events'`).

### 4. Tests

Add/extend `GetEventsTimeline.test.js` cases for the gated paths:

- `actionsCollection: null` ⇒ no actions join; every event has `actions: []`;
  event-display fields (`title`/`description`/`info`) still present; output matches
  the events-only shape.
- `contactsCollection: null` ⇒ no `created.user.picture` field added.
- Both set ⇒ existing enrichment behaviour (already covered) unchanged.

(The test fixture builds a connection object directly, so it can exercise these
without the new schema; the schema is validated by the framework at app build.)

## Acceptance Criteria

- `EventsTimeline` is exported from `connections.js` and resolves to
  `{ schema, requests: { GetEventsTimeline } }`.
- `EventsTimeline/schema.js` requires `databaseUri` and `app_name`, defaults
  `eventsCollection` to `log-events`, and omits all workflows-only fields.
- With `actionsCollection: null`, `GetEventsTimeline` runs no actions `$lookup`
  and emits `actions: []` per event; with `contactsCollection: null`, no avatar
  join runs.
- With both collections set, enrichment behaviour is unchanged from before this task.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes, including the new
  gated-path cases.

## Files

- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/EventsTimeline.js` — create — `{ schema, requests: { GetEventsTimeline } }`, importing the engine from the `WorkflowAPI/GetEventsTimeline` path.
- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/schema.js` — create — read-only schema (databaseUri, app_name, eventsCollection, actionsCollection, contactsCollection, databaseName, user).
- `plugins/modules-mongodb-plugins/src/connections.js` — modify — export `EventsTimeline`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js` — modify — default `actionsCollection`/`contactsCollection` to null; gate the actions and contacts pipeline stages on non-null.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.test.js` — modify — add null-collection gated-path cases.

## Notes

- Do **not** modify `WorkflowAPI` in this task. It still exposes `GetEventsTimeline`
  (harmless duplicate) until the workflows request that uses it is deleted in
  task 6 — removing it earlier would break the workflows module's
  `get_events_timeline.yaml` request and the demo build.
- The handler file stays under `WorkflowAPI/GetEventsTimeline/` per the design's
  Files-changed list (it is not relocated). Both connections import it from there
  until task 6 de-registers the `WorkflowAPI` side.
- `connection.changeStamp` and `connection.workflowsConfig` will be `undefined` on
  an `EventsTimeline` connection; this is safe because the engine is read-only and
  no longer reads `workflowsConfig` (task 2). No `createEngineContext` change needed.
