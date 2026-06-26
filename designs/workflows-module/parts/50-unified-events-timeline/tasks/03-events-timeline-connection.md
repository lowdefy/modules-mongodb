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
  import schema from "./schema.js";
  import GetEventsTimeline from "../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js";

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
  - `actionsCollection` (string, optional) — actions collection joined to enrich
    events with action cards. When absent/null the **engine** falls back to
    `actions` (the `?? 'actions'` default stays — D4); the join is inert when events
    carry no `action_ids`, so it is left **unconditional** (no skip branch).
  - `contactsCollection` (string, optional) — contacts collection for the
    author-avatar join. When absent/null the engine falls back to `user-contacts`
    (the `?? 'user-contacts'` default stays); the join is **unconditional** and
    degrades to initials (`$ifNull`) when unmatched.
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
export { default as WorkflowAPI } from "./connections/WorkflowAPI/WorkflowAPI.js";
export { default as EventsTimeline } from "./connections/EventsTimeline/EventsTimeline.js";
```

### 3. No engine pipeline change — both `$lookup`s stay unconditional

**Do not** add skip branches and **do not** change the engine's collection defaults
(this reverses review-1's instinct; see D4 and review-2 finding #1). The engine
keeps both `$lookup` stages **unconditional** and keeps its `?? 'actions'` /
`?? 'user-contacts'` / `?? 'log-events'` fallbacks (`GetEventsTimeline.js:35–37`)
exactly as they are:

- The actions `$lookup` keys on `localField: action_ids`. A pure-CRM app's events
  carry no `action_ids`, so it matches nothing and returns `actions: []`; the
  dependent dedup stages no-op on the empty array, and the block guards card
  rendering on `Array.isArray(event.actions) && event.actions.length > 0`. The stage
  is **inert without action data**, so there is nothing to skip — and the
  `?? 'actions'` fallback is _needed_, since it gives the no-op lookup a valid `from`
  (`$lookup` against a non-existent collection is valid in MongoDB and returns empty).
- The contacts `$lookup` keys on `created.user.id` (always present), so it runs
  unconditionally against `user-contacts` and only ever _adds_ a `created.user.picture`
  field — degrading to initials via `$ifNull` when unmatched.

Consequence: after task 2 dropped `workflowsConfig`, **the engine handler needs no
further change in this task** — it is hosted as-is by the new `EventsTimeline`
connection. The `actions_collection` / `contacts_collection` vars (task 4) are
**collection-name overrides**, not on/off gates: a null var lands on the connection
field and the engine's `??` supplies the effective default.

### 4. Tests

No new gated-path tests are needed (there is no gating). Confirm the existing
`GetEventsTimeline.test.js` enrichment coverage still passes unchanged after task 2.
If not already covered, an _optional_ assertion that events with no `action_ids`
yield `actions: []` (the inert-lookup path) documents the data-driven default — but
do **not** add `actionsCollection: null ⇒ no join` cases, since the engine does not
gate on the collection name.

## Acceptance Criteria

- `EventsTimeline` is exported from `connections.js` and resolves to
  `{ schema, requests: { GetEventsTimeline } }`.
- `EventsTimeline/schema.js` requires `databaseUri` and `app_name`, defaults
  `eventsCollection` to `log-events`, and omits all workflows-only fields.
- The `GetEventsTimeline` engine handler is **unchanged** by this task: both
  `$lookup`s stay unconditional and the `?? 'actions'` / `?? 'user-contacts'`
  fallbacks remain. Enrichment behaviour is identical to before this task.
- An event with no `action_ids` yields `actions: []` via the inert actions lookup
  (no skip branch involved).
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/EventsTimeline.js` — create — `{ schema, requests: { GetEventsTimeline } }`, importing the engine from the `WorkflowAPI/GetEventsTimeline` path.
- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/schema.js` — create — read-only schema (databaseUri, app_name, eventsCollection, actionsCollection, contactsCollection, databaseName, user).
- `plugins/modules-mongodb-plugins/src/connections.js` — modify — export `EventsTimeline`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js` — **no change in this task** — both `$lookup`s stay unconditional; the `?? 'actions'` / `?? 'user-contacts'` defaults stay. (The only engine edit is task 2's `workflowsConfig` removal.)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetEventsTimeline/GetEventsTimeline.test.js` — no new gated-path cases; confirm existing enrichment coverage stays green.

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
