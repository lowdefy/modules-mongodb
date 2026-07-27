# Task 4: Shared utility placeholders — `getActions`, `getActionFields`, `populateIds`

## Context

The engine connection layout ([engine/spec.md § Connection structure](../../../workflows-module-concept/engine/spec.md#connection-structure)) lists three shared helpers under `src/connections/shared/` consumed by the real handlers landing in parts 5–11. All three go through the community-plugin dispatcher built in task 03 — none open a `MongoClient` of their own.

- `getActions.js` — bulk fetch by `workflow_id` via `MongoDBFind`.
- `getActionFields.js` — current **core fields** for a payload `action_id` (the fields needed to compose a status push: `_id`, `workflow_id`, `type`, `key`, `kind`, `status`, `entity_type`, `entity_id`, `entity_collection`) via `MongoDBFindOne` with a projection.
- `populateIds.js` — server-side `_id` generation for **new** action docs (UUIDs per action so retries don't double-create).

Part 03's deliverable is **placeholder implementations** — enough surface to import and call without throwing, and enough behaviour that parts 5+ can lean on them without re-shaping the API. Full per-handler logic (e.g. priority-rule checks consuming `getActionFields`' result, summary recompute consuming `getActions`' result) lands in parts 5/6.

The engine spec settles the use sites:

- `SubmitWorkflowAction` calls `getActions(mongoDBConnection, workflow_id)` early in its lifecycle to load the workflow's full action set into memory for `blocked_by` evaluation and group recompute.
- `getActionFields(mongoDBConnection, action_id)` is used by the access-enforcement step and by `pushWorkflowStatus` to fetch the tracker action's primary-key fields.
- `populateIds(actions)` is called inside `StartWorkflow.createActions.js` and `SubmitWorkflowAction.createAction.js` to assign `_id`s before insert.

Note: these helpers take **`mongoDBConnection`** (the dispatcher factory returned by `createMongoDBConnection(lowdefyContext)`), not a raw `ctx` with collection handles. Engine spec lines up with this — `pushWorkflowStatus`' pseudo-code calls `mongoDBConnection('workflows').MongoDBFindOne(...)` directly.

## Task

Create three files. Each is small, pure, and matches the contract its downstream consumers will rely on.

### 1. `src/connections/shared/getActions.js`

```js
async function getActions(mongoDBConnection, workflowId) {
  return mongoDBConnection("actions").MongoDBFind({
    query: { workflow_id: workflowId },
  });
}

export default getActions;
```

No projection — handlers consume whatever fields they need.

### 2. `src/connections/shared/getActionFields.js`

```js
async function getActionFields(mongoDBConnection, actionId) {
  return mongoDBConnection("actions").MongoDBFindOne({
    query: { _id: actionId },
    options: {
      projection: {
        _id: 1,
        workflow_id: 1,
        type: 1,
        key: 1,
        kind: 1,
        status: 1,
        entity_type: 1,
        entity_id: 1,
        entity_collection: 1,
      },
    },
  });
}

export default getActionFields;
```

The projection list is the **engine-spec-defined core field set**. Don't add fields speculatively — handlers needing `assignees` or `description` should issue their own `MongoDBFindOne` with a custom projection. Keeping the helper narrow makes its purpose clear.

### 3. `src/connections/shared/populateIds.js`

```js
import { randomUUID } from "node:crypto";

function populateIds(actions) {
  for (const action of actions) {
    if (!action._id) action._id = randomUUID();
  }
  return actions;
}

export default populateIds;
```

Use `node:crypto.randomUUID` rather than reaching for a third-party `uuid` package — Node 18+ ships it natively and the repo's runtime targets are modern.

## Acceptance Criteria

- Three files exist under `src/connections/shared/` with the exact exports and signatures above.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build` emits `dist/connections/shared/getActions.js`, `getActionFields.js`, `populateIds.js`.
- A handler can import all three via `from '../../shared/<name>.js'` without circular-import warnings.
- No dedicated unit tests in this task — the helpers are thin pass-throughs (`getActions`, `getActionFields`) or trivial (`populateIds`). Behaviour-level coverage lands in parts 5/6 against the real `StartWorkflow` / `SubmitWorkflowAction` handler bodies that use them.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/getActions.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/populateIds.js` — create

## Notes

- The dispatcher passed in (`mongoDBConnection`) is the result of `createMongoDBConnection(lowdefyContext)` from task 03. It's a function: `(collection: string) => Record<string, (properties: object) => Promise<any>>`. Each call to it gives back the full set of community-plugin handlers bound to that collection (`MongoDBFind`, `MongoDBFindOne`, `MongoDBInsertOne`, `MongoDBUpdateOne`, etc.).
- `populateIds` does **not** know about action `key`s — fan-out over keys happens in `SubmitWorkflowAction.createAction` (part 6). This helper only stamps the `_id`. That's deliberate: the dispatch over `keys` is per-handler logic, not per-action logic.
- The previous-generation engine has a `getActionFields` with the **same name but a different job** — it's a config-resolver that derives display fields from `actionsConfig`, not a Mongo fetcher. The current engine spec defines `getActionFields` as the Mongo fetcher; this task ships the Mongo fetcher. Parts 5/6 will introduce a separate helper (likely under `WorkflowAPI/<RequestType>/utils/`) for any config-resolution work the prior generation handled.
