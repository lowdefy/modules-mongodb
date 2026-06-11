# Task 1: Thread the session user, `entities` map, and `eventsCollection` through the WorkflowAPI connection

## Context

The new read methods (tasks 4–6) must resolve per-user verb access server-side,
the overview methods must build entity back-links from the host-app `entities`
map, and `GetEventsTimeline` (task 6) must query the events collection. All
three need data that is **not** on the connection today. The design names these
as the **three new top-level connection properties** that require `schema.js`
declarations (`user`, `entities`, `eventsCollection` — "Validated config
additions", "The read methods"); declare all three here so the schema work lives
in one task.

Two facts from the design (D8 / "The read methods"), verified against framework
source:

1. `_user` resolves per-request during connection-property operator evaluation
   (`callRequest.js` runs `evaluateOperators` unconditionally for every request,
   read or write). The resolved value lands at **`lowdefyContext.connection.user`**,
   **not** a top-level `user` argument — `callRequestResolver.js` passes the
   resolver `{ blockId, callApi, connection, connectionId, endpointId, pageId,
payload, request, requestId }` with no `user` key.
2. `createEngineContext.js` today destructures a **top-level** `user` off
   `lowdefyContext` (`createEngineContext.js:45`). On the real request path that
   is always `undefined` — which means the **shipped submit gate** denies every
   role-**array** gate (empty roles); only `true` gates pass. The unit tests mask
   this by hand-building a context with `user` (`SubmitWorkflowAction.test.js:198`).

So this task repairs the seam for the read methods **and** fixes the latent
submit-gate bug in one change.

The connection schema (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`)
is `additionalProperties: false` (`schema.js:4`), so both new top-level
properties (`user`, `entities`) **must** be declared or `validateSchemas`
rejects them.

The `entities` module var already exists with shape
`{ [entity_collection]: { page_id, id_query_key, title } }`
(`module.lowdefy.yaml:66–79`) and host apps already set it. **No host-app
migration** — the only change is that the connection now reads it server-side.

## Task

**1. `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`** — add two
top-level properties inside `properties`:

- `user` — type `object`, description noting it is wired from `_user: true` on
  the connection YAML and resolves per-request to the session user
  (`{ apps: { [app_name]: { roles: [...] } }, ... }`); the engine reads
  `user.apps.{app_name}.roles` for the verb gate.
- `entities` — type `object` whose `additionalProperties` is an object with
  `{ page_id, id_query_key, title }` (all strings). Description: per-`entity_collection`
  host-app routing map; the engine resolves `workflow.entity_link` from it.
  Mirror the style of the existing `actionsEnum` / `app_name` declarations.
- `eventsCollection` — type `string`, **default `"log-events"`**. Description:
  the events collection name `GetEventsTimeline` (task 6) queries (today
  `collection: log-events` on the events connection). With the default, host apps
  need not set it unless they override the collection name.

**2. `modules/workflows/connections/workflow-api.yaml`** — add the user and
entities properties under `properties:`, mirroring the existing
`app_name: { _module.var: app_name }` line (`eventsCollection` relies on its
schema default, so it need not be set here unless a host overrides it):

```yaml
user:
  _user: true
entities:
  _module.var: entities
```

**3. `plugins/modules-mongodb-plugins/src/connections/shared/phases/createEngineContext.js`** —
change the user source from the (always-undefined) top-level `user` to
`connection.user`:

- Remove `user` from the top-level destructure of `lowdefyContext`.
- After destructuring `connection`, read `const user = connection?.user;` (or
  inline `user: connection?.user` in the returned object).
- Keep exposing it as `context.user` exactly as before — downstream
  (`loadWorkflowState` verb gate, `planEventDispatch`) reads `context.user`
  unchanged.

Update the JSDoc that documents the `user` parameter to say it now comes off
`connection.user`.

## Acceptance Criteria

- `schema.js` declares `user`, `entities`, and `eventsCollection` (default
  `"log-events"`); `validateSchemas` accepts a connection config carrying all
  three (no `additionalProperties` rejection).
- `createEngineContext` reads the user from `connection.user`; `context.user` is
  populated on the real request path.
- The shipped submit-gate behavior is now correct on the real path: an
  array-gated submit passes when the user holds a matching role.
- **All handler-test `buildContext` helpers are updated to nest `user` under
  `connection`** (design Ripple "Shipped submit gate" / review-3 #3). Today every
  handler test returns `user` as a **top-level sibling** of `connection`
  (`StartWorkflow.test.js:161`, `CancelWorkflow.test.js:126`,
  `CloseWorkflow.test.js:135`, `SubmitWorkflowAction.test.js:198`) — which is what
  masks the latent bug. Once `createEngineContext` reads `connection.user`, those
  fixtures must nest `user` under `connection` (mirroring the real
  `user: { _user: true }` property), or `context.user` goes `undefined`,
  `userRoles` collapses to `[]`, and every role-array-gated case fails (e.g. the
  "No Edit"/role tests at `SubmitWorkflowAction.test.js:345`/`:364`/`:396`). The
  shared `buildContext` pattern covers `StartWorkflow`, `CancelWorkflow`,
  `CloseWorkflow`, `SubmitWorkflowAction`, and `SubmitWorkflowAction/dispatchNotifications`
  — update all of them.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes for the touched
  plugin tests.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — declare top-level `user`, `entities`, and `eventsCollection` (default `"log-events"`) properties.
- `modules/workflows/connections/workflow-api.yaml` — modify — add `user: { _user: true }` and `entities: { _module.var: entities }`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/createEngineContext.js` — modify — source the user from `connection.user`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` — modify — nest `user` under `connection` in `buildContext`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify — same `buildContext` fix.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify — same `buildContext` fix.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — same `buildContext` fix.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.test.js` — modify (if it relies on the shared `buildContext` user pattern) — same fix.

## Notes

- This is a behavior change for the submit gate (it begins denying/allowing
  array gates correctly). Do not "preserve" the old empty-roles behavior.
- `loadWorkflowState.gateAllows` and the per-app roles extraction
  (`context.user?.apps?.[currentApp]?.roles`) already exist — this task only
  feeds them a real `user`.
