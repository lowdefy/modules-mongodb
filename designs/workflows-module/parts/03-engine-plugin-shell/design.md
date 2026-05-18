# Part 03 — Engine plugin shell

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md). **Layer:** foundational. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/`.

## Goal

Make `@lowdefy/modules-mongodb-plugins` dual-runtime (client blocks + server connections), introduce the `WorkflowAPI` plugin connection scaffold and request dispatcher, ship the shared MongoDB helper (a per-collection dispatcher over `@lowdefy/community-plugin-mongodb`), and commit the workflow + action document schemas. No request handlers yet — those land in parts 5–11.

## In scope

- **Dual-runtime build.** Hard `src/blocks/` vs `src/connections/` split. `dist/blocks` and `dist/connections` both populated and importable. The risk flagged in [concept design.md](../../../workflows-module-concept/design.md#cross-cutting-open-questions-and-risks) ("Plugin dual-runtime build complexity") closes here.
- **Shared MongoDB helper.** `src/connections/shared/createMongoDBConnection.js` — a thin per-collection dispatcher over `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection.requests`. Takes the Lowdefy request context and returns a function `(collection) => { MongoDBFind, MongoDBFindOne, MongoDBInsertOne, MongoDBUpdateOne, ... }` bound to that collection. Connection lifecycle, pooling, BSON, and `changeLog` writes are owned by the community plugin. See [engine review-2](../../../workflows-module-concept/engine/review/review-2.md) for the supersession of review-1's raw-driver direction.
- **WorkflowAPI connection scaffold.** `src/connections/WorkflowAPI/` with:
  - Connection schema (config shape, what apps pass into `connections/workflow-api.yaml`).
  - Request-handler dispatcher that routes by request type to handler modules (handlers themselves are empty stubs that throw "not implemented" — they land in parts 5, 6, 8 of the engine).
- **Document schemas (committed in code).** JSDoc typedefs matching the concept engine spec:
  - **Workflow doc**: `_id`, `workflow_type`, `key`, `display_order`, `entity_type`, `entity_id`, `entity_collection`, `parent_action_id`, `parent_entity_id`, `parent_entity_collection`, `status: [{ stage, created, ... }]` (history array), `summary: { done, not_required, total }`, `groups: []` (empty in this part — populated in part 7), `form_data: {}`, `created`, `updated`, plus reference-key spread.
  - **Action doc**: `_id`, `workflow_id`, `type`, `kind`, `key`, `status: [...]`, `entity_type`, `entity_id`, `entity_collection`, `assignees`, `due_date`, `description`, `tracker`, `child_workflow_id`, `child_entity_id`, `child_entity_collection`, plus reference-key spread.
- **Shared utilities placeholders.** `src/connections/shared/getActions.js`, `getActionFields.js`, `populateIds.js` — implemented against the dispatcher (`mongoDBConnection('actions').MongoDBFind / MongoDBFindOne`-style), minimum surface for parts 5+.

## Out of scope / deferred

- **`StartWorkflow` + `CancelWorkflow` handlers** → [part 5](../05-start-cancel-handlers/design.md). The previous-generation implementations under `src/connections/old/` are reusable reference material; parts 5/6 port them, renamed to the current spec's request type names.
- **`SubmitWorkflowAction` handler and its 11-step lifecycle** → [part 6](../06-submit-action-writes/design.md) and onwards.
- **`GetEntityWorkflows` and `GetWorkflowOverview` server-side** if those end up on the connection rather than as plain Apis → see [part 19](../19-operational-apis/design.md) for the decision.
- **Transaction / session model.** Not available through the community-plugin dispatcher; a future ACID path would require a parallel raw-driver helper. Flagged as deferred in concept.
- **Index assertion at runtime.** Engine indexes (`workflow_action_key_unique`, `actions_by_entity`, `workflows_by_entity` — see [engine spec § Indexes](../../../workflows-module-concept/engine/spec.md#indexes)) are documented in the workflows module README, consumer-created via the repo's `r:index-dev` migration pattern. Same convention as every other module in the repo.

## Depends on

Nothing. Can run in parallel with [part 4](../04-workflow-config-schema/design.md).

## Verification

- Plugin builds with both `dist/blocks.js` (existing client barrel) and `dist/connections.js` (new server barrel) populated, plus `dist/connections/WorkflowAPI/` and `dist/connections/shared/` directories.
- Importing the plugin from a Node-side context resolves to `dist/connections.js`; importing from a browser context resolves to `dist/blocks.js`. React-leak grep on `dist/connections/` is clean.
- Importing `dist/types.js` from Node yields `connections: ['WorkflowAPI']` and `requests: ['StartWorkflow', 'CancelWorkflow', 'SubmitWorkflowAction']`.
- Demo build (`pnpm --filter @lowdefy/modules-demo ldf:b`) succeeds.

The dispatcher's end-to-end correctness (Lowdefy plugin loader resolving each request type, stub returning the structured error to a caller) is verified by the real handler implementations landing in parts 5/6 — they exercise the same seam against real entity workflows. A dedicated fixture app for part 03 was considered and dropped: adding temporary wiring to verify a dispatcher that part 5 immediately exercises is overhead, not coverage.

## Open questions

Resolved in the task designs:

- **WorkflowAPI config schema**: declared in `src/connections/WorkflowAPI/schema.js` (task 05) — `databaseUri` required, optional `databaseName` / `workflowsCollection` / `actionsCollection`. Matches the engine spec.
- **Mongo client lifecycle**: community plugin owns it (one client per dispatched request, opened and closed in a `finally` block). No engine-side singleton. Same as every other module.
- **WorkflowAPI request shape**: one connection hosting `StartWorkflow`, `CancelWorkflow`, `SubmitWorkflowAction` as request types — confirmed by engine spec.

## Contract to neighbours

- **Parts 5, 6, 7, 8, 9, 10, 11** plug their handlers into the dispatcher this part creates.
- **Part 20 (module-manifest)** declares `connections/workflow-api.yaml` pointing at this connection.
