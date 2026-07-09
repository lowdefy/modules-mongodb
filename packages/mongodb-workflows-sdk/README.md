# @lowdefy/mongodb-workflows-sdk

The MongoDB workflows engine, as a framework-agnostic Node package. It powers
the `WorkflowAPI` Lowdefy connection in `@lowdefy/modules-mongodb-plugins`, and
can equally run inside any Node service — an AWS Lambda, a queue consumer, a
cron job — to start workflows, submit signals, and query workflow state against
the same MongoDB collections a Lowdefy app uses.

> This README is the package's consumer documentation (npm consumers don't see
> the monorepo's `docs/` tree). For the Lowdefy authoring surface — YAML
> grammar, hooks, pages — see `docs/workflows/` in the
> [lowdefy/modules-mongodb](https://github.com/lowdefy/modules-mongodb) repo.

## Install

```bash
npm install @lowdefy/mongodb-workflows-sdk
```

Requires Node 18+ and a MongoDB 6-compatible server. Transactions are used
automatically on a replica set / mongos; on a standalone the engine falls back
to ordered writes (it logs which commit mode is live).

## Usage

```js
import { createWorkflowsEngine } from "@lowdefy/mongodb-workflows-sdk";

const engine = createWorkflowsEngine({
  // MongoDB
  databaseUri: process.env.MONGODB_URI,
  databaseName: "my-app", // optional; defaults to the URI's database
  workflowsCollection: "workflows", // default
  actionsCollection: "actions", // default
  eventsCollection: "log-events", // default; read by getWorkflowAction
  contactsCollection: "user-contacts", // default; avatar joins on reads

  // Workflow definitions — the normalized workflows config (in a Lowdefy app
  // this is the output of the makeWorkflowsConfig resolver).
  workflowsConfig,

  // Identity of the calling app deployment: keys event display blocks and
  // per-app access maps.
  app_name: "ops-app",
  // Module entry id used to build entry-scoped page links on action docs.
  entry_id: "workflows",

  // Optional: write one audit entry per doc mutation into this collection.
  changeLog: { collection: "log-changes", meta: { app: "ops-app" } },

  // Dispatch callbacks — how the engine reaches the outside world.
  callbacks: {
    // REQUIRED for writes. Persist the per-invocation event doc (one per
    // write call). In Lowdefy this is the events module's new-event endpoint.
    emitEvent: async (eventDoc) => insertEvent(eventDoc),
    // Optional. Fan out notifications for a committed event. Absent → no-op.
    sendNotification: async ({ event_ids }) => notify(event_ids),
    // Optional. Resolve host-shaped entity data ({ name, ... }) for read
    // envelopes. Absent → entity data degrades to null.
    resolveEntityData: async ({ workflow_type, entity_id }) =>
      lookupEntity(workflow_type, entity_id),
  },

  logger: console, // default
});
```

Every method takes `(params, { user, stamp, audit })`:

```js
const result = await engine.startWorkflow(
  { workflow_type: "onboarding", entity: { id: "L1" } },
  {
    // The acting user; `user.roles` drives the per-verb access gate and the
    // user appears as the event author.
    user: { id: "u1", profile: { name: "Sam" }, roles: ["account-manager"] },
    // The change stamp written onto every doc this call touches. By
    // convention `{ timestamp: new Date(), user: { id, name } }` — the engine
    // enforces only `timestamp` (it anchors optimistic concurrency).
    stamp: { timestamp: new Date(), user: { id: "u1", name: "Sam" } },
    // Optional opaque request identifiers stamped onto change-log entries:
    // { blockId, connectionId, pageId, requestId, payload }.
    audit: { requestId: "lambda-invocation-123", payload: event },
  },
);
```

### Methods

Write verbs (require `stamp.timestamp` and `callbacks.emitEvent`):

| Method                                        | What it does                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `startWorkflow({ workflow_type, entity, … })` | Insert a workflow + seed its starting actions; returns `{ workflow_id, action_ids, event_id }` |
| `submitAction({ action_id, signal, form?, hooks?, … })` | Fire an FSM signal at an action: load → pre-hook → plan → commit → tracker cascade → post-hook |
| `cancelWorkflow({ workflow_id, reason? })`    | Sweep non-terminal actions to `not-required`, push `cancelled`                            |
| `closeWorkflow({ workflow_id, reason? })`     | Forced completion; respects `required_after_close`                                        |
| `updateActionFields({ action_id, fields })`   | Update universal fields (assignees / due_date) — no FSM transition                        |

Read verbs (no stamp/callbacks required):
`getEntityWorkflows`, `getWorkflowOverview`, `getWorkflowActionGroupOverview`,
`getWorkflowAction`, `getEventsTimeline`.

### Pre/post hooks

Hooks are per-call, plain async functions on
`params.hooks[actionType][signal].{pre,post}`:

```js
await engine.submitAction(
  { action_id, signal: "submit", hooks: {
      qualify: {
        submit: {
          pre: async (payload) => ({ event_overrides: { … } }),
          post: async (payload) => { await followUp(payload); },
        },
      },
    } },
  { user, stamp },
);
```

The pre-hook runs after the access gate and before the plan (it may add
auxiliary action targets and event/form overrides — its response grammar is
validated); the post-hook runs after commit + tracker cascade and sees the
planned post-commit docs. Post-hooks must be idempotent: a post-hook failure
surfaces after the writes have landed.

### Errors

All engine throws extend `WorkflowEngineError` and are discriminated by
`.code` (never message text) — e.g. `workflow_not_found`, `access_denied`,
`stage_rejects_submit`, `invalid_params`, `missing_callback`. Named subclasses
for the catchable cases: `ConcurrentSubmitError` (`concurrent_submit` — the
optimistic-concurrency CAS missed; retry policy is the caller's) and
`TrackerCascadeDepthError` (`tracker_depth_exceeded`).

```js
import { ConcurrentSubmitError } from "@lowdefy/mongodb-workflows-sdk";
```

### FSM tables

The per-kind FSM transition tables are exported for tooling:

```js
import FSM_TABLES, { hasReview } from "@lowdefy/mongodb-workflows-sdk/fsm";
```

### Connection pooling / Lambda

The engine caches one pooled `MongoClient` per `databaseUri` at module scope —
warm Lambda invocations reuse the connection. `createWorkflowsEngine` itself is
cheap; build it per invocation or once at module scope, either works.

### Testing

An in-memory Mongo harness (backed by `mongodb-memory-server`, an optional
install) ships under the `./testing` entry:

```js
import inMemoryMongo, { clearMongoClientCache } from "@lowdefy/mongodb-workflows-sdk/testing";

const mongo = await inMemoryMongo(); // { uri, mongoClient, db, cleanup }
```
