# Part 03 — Engine plugin shell

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md). **Layer:** foundational. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/`.

## Goal

Make `@lowdefy/modules-mongodb-plugins` dual-runtime (client blocks + server connections), introduce the `WorkflowAPI` plugin connection scaffold and request dispatcher, ship the shared MongoDB connection helper, and commit the workflow + action document schemas with indexes. No request handlers yet — those land in parts 5–11.

## In scope

- **Dual-runtime build.** Hard `src/blocks/` vs `src/connections/` split. `dist/blocks` and `dist/connections` both populated and importable. The risk flagged in [concept design.md](../../../workflows-module-concept/design.md#cross-cutting-open-questions-and-risks) ("Plugin dual-runtime build complexity") closes here.
- **Shared MongoDB connection helper.** `src/connections/shared/createMongoDBConnection.js` — exposes `{ client, workflowsCollection, actionsCollection }` from a connection config; reused across every handler.
- **WorkflowAPI connection scaffold.** `src/connections/WorkflowAPI/` with:
  - Connection schema (config shape, what apps pass into `connections/workflow-api.yaml`).
  - Request-handler dispatcher that routes by request type to handler modules (handlers themselves are empty stubs that throw "not implemented" — they land in parts 5, 6, 8 of the engine).
- **Document schemas (committed in code).** TypeScript-style or JSDoc types matching the concept engine spec:
  - **Workflow doc**: `_id`, `workflow_type`, `key`, `display_order`, `entity_type`, `entity_id`, `entity_collection`, `parent_action_id`, `parent_entity_id`, `parent_entity_collection`, `status: [{ stage, created, ... }]` (history array), `summary: { done, not_required, total }`, `groups: []` (empty in this part — populated in part 7), `form_data: {}`, `created`, `updated`, plus reference-key spread.
  - **Action doc**: `_id`, `workflow_id`, `type`, `kind`, `key`, `status: [...]`, `entity_type`, `entity_id`, `entity_collection`, `assignees`, `due_date`, `description`, `tracker`, `child_workflow_id`, `child_entity_id`, `child_entity_collection`, plus reference-key spread.
- **Mongo indexes.** Index declarations:
  - `actions` unique `(workflow_id, type, key)`.
  - `actions(entity_type, entity_id)`.
  - `workflows(entity_type, entity_id)`.
- **Shared utilities placeholders.** `src/connections/shared/getActions.js`, `getActionFields.js`, `populateIds.js` — implemented to the minimum needed by parts 5+.

## Out of scope / deferred

- **`StartWorkflow` + `CancelWorkflow` handlers** → [part 5](../05-start-cancel-handlers/design.md).
- **`SubmitWorkflowAction` handler and its 11-step lifecycle** → [part 6](../06-submit-action-writes/design.md) and onwards.
- **`GetEntityWorkflows` and `GetWorkflowOverview` server-side** if those end up on the connection rather than as plain Apis → see [part 19](../19-operational-apis/design.md) for the decision.
- **Transaction / session model.** Plain sequential writes in v1; flagged as deferred in concept.

## Depends on

Nothing. Can run in parallel with [part 4](../04-workflow-config-schema/design.md).

## Verification

- Plugin builds with both `dist/blocks/index.js` (existing client code) and `dist/connections/index.js` (new server code) populated.
- Importing the plugin from a Node-side context resolves to `dist/connections`; importing from a browser context resolves to `dist/blocks`.
- Unit tests for `createMongoDBConnection`: single client per (connection-config hash), idempotent across calls, clean shutdown.
- A WorkflowAPI connection wired into a fixture app with a stub handler dispatch returns a clear "not implemented: <handler>" error for each request type.
- Index assertions: running `db.actions.getIndexes()` after first write returns the expected unique + lookup indexes.

## Open questions

- Where does `WorkflowAPI` register its config schema? Reference events module's connection config shape during implementation.
- Mongo client lifecycle across hot reloads in dev. Singleton via the events module's pattern.
- Whether to expose `WorkflowAPI` as a request-type union (one connection with many request types) or one connection per request. Concept spec calls for one connection with `SubmitWorkflowAction` / `StartWorkflow` / `CancelWorkflow` request types — confirm.

## Contract to neighbours

- **Parts 5, 6, 7, 8, 9, 10, 11** plug their handlers into the dispatcher this part creates.
- **Part 20 (module-manifest)** declares `connections/workflow-api.yaml` pointing at this connection.
