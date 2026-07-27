# Task 5: `WorkflowAPI` connection scaffold with stub-handler dispatcher

## Context

Part 03 lands the **shape** of the `WorkflowAPI` plugin connection — the surface real handlers plug into in parts 5, 6, 8, etc. The connection is one module exporting `{ schema, requests }`, where `requests` is a map of `RequestType → handlerFn`. Three request types are committed by the engine spec:

- `SubmitWorkflowAction` (part 6+)
- `StartWorkflow` (part 5)
- `CancelWorkflow` (part 5)

This task ships:

- The connection module + its handler dispatcher.
- A connection-config JSON schema describing what apps pass into `connections/workflow-api.yaml`.
- Stub handler functions — each throws a clear `not implemented: <handler>` error so a fixture app calling the connection sees structured feedback per request type.

**Open question from the design — "request-type union vs one connection per request":** Resolved here. Concept spec calls for **one `WorkflowAPI` connection** that hosts all three request types (`SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`). This task implements the union shape. Rationale: each request type uses the same MongoDB ctx, the same access model, and the same caller surface — collapsing to one connection per request would force apps to wire three connection blocks for one feature and would split shared schema validation.

**Open question — "schema registration":** The events module's [connections/events-collection.yaml](../../../../modules/events/connections/events-collection.yaml) is the closest analogue. The `WorkflowAPI` connection ships a JSON-schema describing the same shape the helper in task 3 validates (`databaseUri`, optional `databaseName`, optional `workflowsCollection`, `actionsCollection`). This is what the Lowdefy build validates app-side before invoking the handler.

The handler signature (per call-api spec + engine spec):

```js
async ({
  blockId,
  connection,
  connectionId,
  pageId,
  request,
  requestId,
  payload,
  context,
}) => result;
```

The dispatcher receives this; routes to a per-request handler by `request.type` (or by being mounted under the named `requests` key — the upstream convention is the latter, so the "dispatcher" is just the `requests:` map).

## Task

1. **Create `src/connections/WorkflowAPI/schema.js`** — JSON schema for the connection config:

   ```js
   // src/connections/WorkflowAPI/schema.js
   const schema = {
     type: "object",
     required: ["databaseUri"],
     additionalProperties: false,
     properties: {
       databaseUri: {
         type: "string",
         description:
           "MongoDB connection URI; typically resolved via _secret in app YAML.",
       },
       databaseName: {
         type: "string",
         description: "Optional database name; defaults to the URI default.",
       },
       workflowsCollection: {
         type: "string",
         description: 'Workflows collection name. Defaults to "workflows".',
         default: "workflows",
       },
       actionsCollection: {
         type: "string",
         description: 'Actions collection name. Defaults to "actions".',
         default: "actions",
       },
       changeLog: {
         type: "object",
         description:
           "Optional changeLog config forwarded to the community-plugin MongoDBCollection handlers. Mirrors the events module pattern: `{ collection, meta }` writes every workflow + action mutation into the consumer app's log-changes collection automatically.",
       },
     },
   };

   export default schema;
   ```

2. **Create per-request stub handlers.** Each lives at `src/connections/WorkflowAPI/<RequestType>/<RequestType>.js`. All three throw a structured `NotImplementedError` so fixture-app callers see consistent feedback:

   ```js
   // src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js
   async function StartWorkflow() {
     const err = new Error("not implemented: StartWorkflow");
     err.code = "WorkflowAPINotImplemented";
     err.handler = "StartWorkflow";
     throw err;
   }

   StartWorkflow.schema = {};
   StartWorkflow.meta = {
     checkRead: false,
     checkWrite: false,
   };

   export default StartWorkflow;
   ```

   Repeat for `CancelWorkflow` and `SubmitWorkflowAction`. Each in its own directory so parts 5 and 6 can drop sibling files (e.g. `handleSubmit.js`, `createAction.js`) next to the entry point without restructuring.

   `.schema` and `.meta` are not optional — Lowdefy's request runtime reads `handler.meta.checkRead` / `handler.meta.checkWrite` for every connection-request handler before invoking it, and crashes with `Cannot read properties of undefined (reading 'checkRead')` if `.meta` is missing.

   **Both flags are `false` for the stubs** — they throw before touching Mongo, so neither the read-flag nor the write-flag gate on the connection should fire. When parts 5 and 6 land the real handler bodies, they'll switch to `checkRead: false, checkWrite: true` (all three engine request types mutate state) and the consumer's connection config will need `write: true` — matches the pattern every community-plugin write handler uses (`MongoDBInsertOne.meta = { checkRead: false, checkWrite: true }`).

3. **Create `src/connections/WorkflowAPI/WorkflowAPI.js`** — the connection module:

   ```js
   // src/connections/WorkflowAPI/WorkflowAPI.js
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

   export default WorkflowAPI;
   ```

4. **Wire into `src/connections.js`** (created in task 1) — replace the placeholder comment with the export:

   ```js
   // src/connections.js
   export { default as WorkflowAPI } from "./connections/WorkflowAPI/WorkflowAPI.js";
   ```

5. **Re-verify `src/types.js`.** After this change, `Object.keys(connections)` resolves to `['WorkflowAPI']` and the flattened `requests` is `['StartWorkflow', 'CancelWorkflow', 'SubmitWorkflowAction']`. No further code change in `types.js` — it was already shaped in task 1. Confirm by importing `dist/types.js` from Node after a build.

No dedicated dispatcher unit test — the connection module is a hand-rolled `{ schema, requests }` literal; the integration value (plugin loader resolving each request type) is covered by the fixture-app build in task 6.

## Acceptance Criteria

- `src/connections/WorkflowAPI/` exists with `WorkflowAPI.js`, `schema.js`, and three sub-directories (`StartWorkflow/`, `CancelWorkflow/`, `SubmitWorkflowAction/`), each containing a stub `<RequestType>.js`.
- `src/connections.js` exports `WorkflowAPI`.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build` succeeds; `dist/connections/WorkflowAPI/WorkflowAPI.js` and all stubs are emitted with **no React imports** (`grep -r 'react' dist/connections/WorkflowAPI/` returns nothing).
- Importing `dist/types.js` from Node yields `connections: ['WorkflowAPI']` and `requests: ['StartWorkflow', 'CancelWorkflow', 'SubmitWorkflowAction']`.
- Each stub throws an error with `code === 'WorkflowAPINotImplemented'` and a `handler` property identifying the request type (verified manually via the fixture in task 6).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — create
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — create
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — create — stub
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — create — stub
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` — create — stub
- `plugins/modules-mongodb-plugins/src/connections.js` — modify — export `WorkflowAPI`

## Notes

- The stubs are intentionally **directory-shaped** rather than a flat file each. Parts 5 and 6 will drop sibling files (`handleSubmit.js`, `createAction.js`, `updateAction.js`, `utils/...`) next to the entry point — having the directory already in place avoids a rename in those parts' diffs.
- Do **not** import `createMongoDBConnection` or any shared util into the stubs. They're literal `throw` functions — bringing in the helper would make the test surface impure (the helper opens a real Mongo connection). Real handlers in parts 5/6 will import and use `ctx`.
- `additionalProperties: false` on the schema is deliberate. If apps pass an unknown key (typo, accidentally re-using events-connection shape with `changeLog`), the build surfaces it before runtime.
- The handler context argument (`{ blockId, connection, connectionId, pageId, request, requestId, payload, context }`) is documented but the stubs accept no args explicitly — JS lets extra args pass through. Parts 5/6 will destructure properly.
