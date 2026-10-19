# Task 2: Add `app_name` to `WorkflowAPI` connection schema

## Context

The workflows module already declares `app_name: string (required)` as a manifest var (see [Part 20 design § module.lowdefy.yaml](../../20-module-manifest/design.md) and the corresponding concept spec [module-surface/spec.md](../../../../workflows-module-concept/module-surface/spec.md)). It's used today by the resolvers to filter `access.{app_name}` verb maps when emitting per-action pages.

Part 8 needs the same `app_name` reachable from the engine handler at submit time, because the default log event's `display` block is keyed by app_name (mirroring the events module's per-`display_key` projection in [events-timeline.yaml:34-50](../../../../../modules/events/components/events-timeline.yaml)). The events module already keys `display: { [app_name]: { title } }` per app — the workflows engine has to read the same key when constructing its default event.

The `WorkflowAPI` connection schema lives at [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js). Today it declares: `databaseUri` (required), `databaseName`, `workflowsCollection`, `actionsCollection`, `changeLog`, `workflowsConfig`, `changeStamp`, `actionsEnum`. No `app_name` yet.

This task adds the field so:

1. App authors can pass `app_name: { _module.var: app_name }` from `connections/workflow-api.yaml` (Part 20's wiring).
2. The handler reads `context.connection.app_name` at entry (task 5 uses it; task 7 captures it in the input bag).

## Task

### 1. Add `app_name` to `schema.js`

Edit [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js). Add a new property to the `properties` block (alphabetical-ish — slot near the top after `actionsEnum` since it groups with other engine-runtime knobs):

```js
app_name: {
  type: 'string',
  description:
    'Host app deployment name. Consumed by the engine at submit time to ' +
    'key the default log event\'s display block (matching the events ' +
    'module\'s display_key projection). Apps wire this from _module.var: app_name ' +
    'on connections/workflow-api.yaml.',
},
```

Required? **No** at the schema layer — the schema's `required: ['databaseUri']` list stays as-is, so fixture-app tests can spin up a `WorkflowAPI` connection without `app_name`. Defense is in the runtime: `buildDefaultLogEventPayload` (task 4) throws if `appName` is missing or empty. No silent default — see [design.md § `app_name` plumbing](../design.md#app_name-plumbing-workflowapi-connection-schema) for the rationale.

### 2. Confirm `additionalProperties: false` doesn't block app-level YAML

`schema.js` declares `additionalProperties: false`. After this task, `app_name` is a known field, so apps passing it through `_module.var: app_name` won't trip validation. No change needed here — calling it out to confirm.

## Acceptance Criteria

- `schema.js` has an `app_name` field declared on `properties` with `type: 'string'` and a descriptive comment.
- The field is **not** added to the `required` array — stays optional in v1.
- `pnpm -r build` succeeds in `plugins/modules-mongodb-plugins/`.
- Loading a `WorkflowAPI` connection with `app_name: 'demo'` validates cleanly.
- Loading a `WorkflowAPI` connection without `app_name` still validates (backwards-compat with the current state).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — add the `app_name` property to `properties`.

## Notes

- The actual `connections/workflow-api.yaml` wiring (passing `app_name: { _module.var: app_name }`) is owned by [Part 20](../../20-module-manifest/design.md) — do not edit `modules/workflows/connections/workflow-api.yaml` here. This task only ships the schema-side acceptance of the field.
- Don't add `app_name` to `required` even though Part 20's manifest declares it `required: true` at the module-var layer. The two `required` lists are at different layers — the manifest's var-level requirement is enforced when an app build instantiates the module; the connection-schema requirement is enforced when the connection is instantiated. Keeping the schema permissive lets fixture-app tests (task 9) spin up a `WorkflowAPI` connection without setting `app_name` if they want to test a fallback path.
- No JSDoc typedef updates needed — this is a runtime config field, not a doc-shape field.
