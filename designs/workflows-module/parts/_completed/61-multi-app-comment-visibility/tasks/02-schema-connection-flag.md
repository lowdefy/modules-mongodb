# Task 2: Add the `enable_internal_comments` connection property to the WorkflowAPI schema

## Context

Each app's workflow connection is configured by `WorkflowAPI/schema.js` — a JSON Schema with `additionalProperties: false`, so any new connection property must be declared there or the connection config is rejected at validation. Existing properties include `app_name`, `write`, `changeLog`, `workflowsConfig`, etc. (see the `properties` block).

Part 61 adds a per-app, opt-in flag: `enable_internal_comments`. When `true`, this app may write `internal` (single-app) comments and its comment surfaces show the shared/internal control. When `false` (the default), the **engine** coerces any `internal` request to `shared`, so every comment from this app is visible to all apps that see the event. The engine reads this property at runtime (via `planEventDispatch` → `foldCommentIntoEvent`); it is **not** UI-only.

## Task

In `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`, add a new optional property to the connection `properties` object:

```js
enable_internal_comments: {
  type: "boolean",
  default: false,
  description:
    "When true, this app may write `internal` (single-app) comments and its " +
    "comment surfaces offer the shared/internal control. When false, the engine " +
    "coerces any `internal` request to `shared`, so every comment from this app " +
    "is visible to all apps that see the event. Comments default to `shared` " +
    "regardless. Apps wire this from `_module.var: enable_internal_comments` on " +
    "connections/workflow-api.yaml.",
},
```

Place it near the other per-app behavioural flags (e.g. beside `app_name` or `write`). Do **not** add it to the `required` array — it is optional and defaults to `false`.

## Acceptance Criteria

- `enable_internal_comments` is a declared optional boolean property with `default: false` and the description above.
- It is not in the schema's `required` list.
- A connection config that omits the property still validates (default applies); a config that sets `enable_internal_comments: true` validates.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes (no schema-validation regressions).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — add the optional `enable_internal_comments` boolean property.

## Notes

- Schema validation does not itself enforce the coercion — enforcement lives in `foldCommentIntoEvent` (task 1) and the threading in `planEventDispatch` (task 3). This task only makes the property a legal, documented part of the connection contract.
