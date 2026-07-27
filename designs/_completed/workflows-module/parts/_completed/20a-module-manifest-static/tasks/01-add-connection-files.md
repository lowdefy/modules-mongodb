# Task 1: Author the three workflows-module connection files

## Context

`modules/workflows/` currently has `api/`, `components/`, `enums/`, `pages/`, `requests/`, `resolvers/`, `templates/` — but no `connections/` directory. The on-disk manifest (`modules/workflows/module.lowdefy.yaml` line 10) explicitly flags "WorkflowAPI connection, workflows-collection / actions-collection connections" as missing.

Three Lowdefy connection files need to land before the manifest can `_ref` them in task 2.

Two are stock `MongoDBCollection` connections (used directly by the operational APIs and `requests/get_action.yaml` for read access). The third is the `WorkflowAPI` server connection that owns engine-managed write paths.

Connection IDs are load-bearing — they're already referenced by `_module.connectionId:` in the on-disk APIs:

- `modules/workflows/api/get-action-group-overview.yaml:7` → `workflows-collection`
- `modules/workflows/api/get-entity-workflows.yaml:7` → `workflows-collection`
- `modules/workflows/api/get-workflow-overview.yaml:7` → `workflows-collection`
- `modules/workflows/requests/get_action.yaml:4` → `actions-collection`
- `modules/workflows/api/start-workflow.yaml:7`, `cancel-workflow.yaml:7`, `close-workflow.yaml:7` → `workflow-api`

The IDs in the three new files must match these strings exactly.

Reference patterns: `modules/contacts/connections/contacts-collection.yaml` (stock MongoDBCollection with `databaseUri: { _secret: MONGODB_URI }` + `changeLog: { collection: log-changes, meta: { user: { _user: true } } }` + `write: true`). The `WorkflowAPI` connection schema is in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — required: `databaseUri`; accepts `databaseName`, `workflowsCollection` (default `workflows`), `actionsCollection` (default `actions`), `changeLog`, `workflowsConfig` (array; the output of `makeWorkflowsConfig`), `changeStamp`, `app_name`, `actionsEnum`.

## Task

Create three files under a new `modules/workflows/connections/` directory.

### `modules/workflows/connections/workflows-collection.yaml`

Stock `MongoDBCollection` connection on the `workflows` collection. Mirrors the contacts-collection shape — `databaseUri: { _secret: MONGODB_URI }`, `collection: workflows`, `write: true`, and a `changeLog` block writing into the consumer app's `log-changes` collection with `meta.user: { _user: true }`. ID must be `workflows-collection`.

### `modules/workflows/connections/actions-collection.yaml`

Same shape as workflows-collection but on the `actions` collection. ID must be `actions-collection`.

### `modules/workflows/connections/workflow-api.yaml`

`WorkflowAPI` connection. Wire its properties from module vars where applicable:

- `databaseUri: { _secret: MONGODB_URI }`
- `workflowsCollection: workflows` (matches the MongoDBCollection on workflows-collection)
- `actionsCollection: actions`
- `workflowsConfig: { _module.var: workflows_config }` — the normalized config emitted by `makeWorkflowsConfig` (part 4); the WorkflowAPI plugin consumes it at runtime
- `app_name: { _module.var: app_name }`
- `actionsEnum: { _ref: ../enums/action_statuses.yaml }` — the canonical priority-bearing enum the engine reads (per the manifest header comment lines 13–16: "the connection will `_ref` the canonical enum file directly... so the engine always reads the shipped enum with its canonical priorities")
- `changeStamp: { _ref: { module: events, component: change_stamp } }` — wires the events module's change_stamp into engine writes
- `changeLog: { collection: log-changes, meta: { user: { _user: true } } }`

ID must be `workflow-api`.

## Acceptance Criteria

- Directory `modules/workflows/connections/` exists.
- Three files present: `workflows-collection.yaml`, `actions-collection.yaml`, `workflow-api.yaml`.
- Each file's top-level `id:` matches the file's expected ID exactly (kebab-case, no scoping prefix — the build scopes module connection IDs by entry).
- `workflow-api.yaml` passes the schema in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` (required: `databaseUri`; no extra unknown properties — `additionalProperties: false`).
- After task 2 wires the `_ref`s, `apps/demo` still builds.

## Files

- `modules/workflows/connections/workflows-collection.yaml` — **create**
- `modules/workflows/connections/actions-collection.yaml` — **create**
- `modules/workflows/connections/workflow-api.yaml` — **create**

## Notes

- The `changeStamp` `_ref` uses cross-module `_ref: { module: events, component: change_stamp }` shape. This relies on the `events` module being a declared dependency of `workflows` — task 2 adds that dependency, so the ref resolves once task 2 lands. If running task 1 standalone and validating with `pnpm ldf:b`, the ref will not resolve until task 2 + task 6.
- `WorkflowAPI` schema is `additionalProperties: false`. Don't add extra top-level keys.
- Do not declare a default `workflowsCollection` value here — defaulting happens in the schema (`default: 'workflows'`), but the design wants the value to land in the connection file explicitly so a future override doesn't silently flip collection names.
