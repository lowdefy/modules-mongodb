# Task 1: Add `changeStamp` to the `WorkflowAPI` connection schema

## Context

The `WorkflowAPI` connection schema lives at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` and was shipped in part 03 (commit `bdb2ea4`). Part 04's review-1 finding 5 explicitly deferred adding `changeStamp` to part 05: "`changeStamp` connection property deferred to part 05. It's a runtime engine property used by every insert/update handler."

`changeStamp` is the audit-stamp object the events module exposes via `_module.var: change_stamp` (see `modules/events/defaults/change_stamp.yaml`). At app build time it resolves to a `{ timestamp, user }` object; at request time, Lowdefy's operator pass has already filled in the live user. The engine reads it off the connection once at handler entry and stamps every doc it writes — one stamp per handler invocation, applied uniformly to workflow doc + N action docs.

Without this schema addition, the consumer app's `connections/workflow-api.yaml` cannot pass `changeStamp` in (the schema has `additionalProperties: false`), the handler reads `undefined`, and every doc carries `created: undefined`, `updated: undefined`.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`. Add a `changeStamp` property under `properties`, alongside `databaseUri`, `databaseName`, `workflowsCollection`, `actionsCollection`, `changeLog`, `workflowsConfig`, `actionsEnum`.

The property is optional (not added to `required`). Shape:

```js
changeStamp: {
  type: 'object',
  description:
    'Resolves to the events module change_stamp at app build time (typically via _ref: { module: events, component: change_stamp }). The engine reads it at handler entry and stamps every workflow + action doc write with it via `created` and `updated`. One stamp per handler invocation; all writes in the same call share the timestamp.',
},
```

No nested property schema — the object's internal shape is owned by the events module's `change_stamp.yaml`. Type `object` plus a description is enough.

Do not change anything else in the file. Do not flip the stubs' `meta.checkWrite` — that happens in tasks 4–6 when the real handler bodies land.

## Acceptance Criteria

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` exports a schema whose `properties.changeStamp` matches the shape above.
- `properties.changeStamp` does NOT appear in `required` (it's optional).
- The plugin builds cleanly: `pnpm --filter @lowdefy/modules-mongodb-plugins build` succeeds.
- The demo app builds cleanly: `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds (verifies the schema still parses).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — add `changeStamp` property under `properties`.

## Notes

The full chain `_ref: { module: events, component: change_stamp }` → connection wiring → `connection.changeStamp` at handler entry isn't exercised end-to-end until tasks 4–6 land. This task only opens the gate at the connection layer; the handlers reading the value come later.
