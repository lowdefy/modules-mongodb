# Task 1: Scaffold `CloseWorkflow` handler and register it on `WorkflowAPI`

## Context

The workflows plugin lives at `plugins/modules-mongodb-plugins/`. Its server-side connection `WorkflowAPI` already ships three handlers — `StartWorkflow`, `CancelWorkflow`, `SubmitWorkflowAction` — each in its own directory under `src/connections/WorkflowAPI/`. The connection registers them via `WorkflowAPI.js`:

```js
import schema from "./schema.js";
import StartWorkflow from "./StartWorkflow/StartWorkflow.js";
import CancelWorkflow from "./CancelWorkflow/CancelWorkflow.js";
import SubmitWorkflowAction from "./SubmitWorkflowAction/SubmitWorkflowAction.js";

const WorkflowAPI = {
  schema,
  requests: {
    StartWorkflow,
    CancelWorkflow,
    SubmitWorkflowAction,
  },
};
```

This task adds a fourth handler — `CloseWorkflow` — as a runnable skeleton. The skeleton validates that `workflow_id` is present in the payload and throws "not implemented" otherwise. Body lands in Tasks 2–6.

Use shipped `CancelWorkflow.js` as the structural reference: same Lowdefy handler signature (`async (lowdefyContext) => result`), same context-building pattern (`createMongoDBConnection`, `workflowsConfig`, `actionsEnum`, `changeStamp`), same `.meta = { checkRead: false, checkWrite: true }` shape, same default export.

## Task

### 1. Create the directory

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/`.

### 2. Create `CloseWorkflow.js`

```js
import createMongoDBConnection from "../../shared/createMongoDBConnection.js";

async function CloseWorkflow(lowdefyContext) {
  const { request: payload = {}, connection } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    eventId: null,
    params: payload,
  };

  if (!payload.workflow_id) {
    throw new Error("CloseWorkflow: workflow_id is required");
  }

  // Body lands in Tasks 2–6.
  throw new Error("CloseWorkflow: not implemented");
}

CloseWorkflow.schema = {};
CloseWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CloseWorkflow;
```

### 3. Register on `WorkflowAPI.js`

Add the import + entry alongside the existing three handlers in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js`:

```js
import CloseWorkflow from "./CloseWorkflow/CloseWorkflow.js";

const WorkflowAPI = {
  schema,
  requests: {
    StartWorkflow,
    CancelWorkflow,
    CloseWorkflow,
    SubmitWorkflowAction,
  },
};
```

Order inside `requests` is conventional: `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, `SubmitWorkflowAction` (lifecycle handlers grouped, submit at the end).

### 4. Create `CloseWorkflow.test.js`

Mirror `CancelWorkflow.test.js`'s test-fixture pattern (in-memory MongoDB via `shared/inMemoryMongo.js`, `actionsEnum`, `changeStamp`, `makeLowdefyContext`, seed helpers). For this task, only assert that:

- The handler throws `"CloseWorkflow: workflow_id is required"` when payload is empty.
- The handler throws `"CloseWorkflow: not implemented"` when payload includes `workflow_id`.
- The package's `types.js` exports `CloseWorkflow` under `requests` — assert by importing the default export from `plugins/modules-mongodb-plugins/src/types.js` and checking `requests.includes('CloseWorkflow')`.

Use the same `beforeAll`/`afterAll`/`beforeEach` lifecycle from `CancelWorkflow.test.js`.

## Acceptance Criteria

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` exists with the skeleton above.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` exists with the three assertions named above; all pass under `pnpm test`.
- `WorkflowAPI.js` imports and registers `CloseWorkflow`.
- The plugin's default `types.js` export lists `CloseWorkflow` in `requests` (this falls out automatically because `types.js` flat-maps over `connections[c].requests`).
- `pnpm build` produces clean dist output for the package — no new errors.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — create — skeleton handler.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — create — basic registration + payload-validation tests.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — modify — add `CloseWorkflow` import + `requests` entry.

## Notes

- Do NOT touch `schema.js` — the design's "Connection schema" section commits "No change. Reuses the existing `WorkflowAPI` connection schema from part 3."
- Keep the `context` object shape identical to `CancelWorkflow.js` (line 19–27) so subsequent tasks can copy patterns without import-path surprises.
- The `eventId: null` field in the context object is deliberate — close, like cancel, doesn't generate its own log event in v1 ([design.md § Out of scope](../design.md)).
