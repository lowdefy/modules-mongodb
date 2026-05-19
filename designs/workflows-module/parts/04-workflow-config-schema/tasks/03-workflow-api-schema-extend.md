# Task 3: Extend the `WorkflowAPI` connection schema with `workflowsConfig` and `actionsEnum`

## Context

The `WorkflowAPI` connection scaffold landed in commit `bdb2ea4` (part 03). Its current JSON schema is at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` and declares:

- `databaseUri` (required)
- `databaseName`, `workflowsCollection`, `actionsCollection`, `changeLog` (optional)
- Top-level `additionalProperties: false`.

The top-level `additionalProperties: false` is the reason this task is **blocking real usage** — until `workflowsConfig` and `actionsEnum` are declared, the canonical app YAML for the connection fails validation:

```yaml
- id: workflow-api
  type: WorkflowAPI
  properties:
    changeStamp: { _ref: ../shared/change_stamp.yaml }
    changeLog: { collection: log-changes, meta: { user: { _user: true } } }
    databaseUri: { _secret: MONGODB_URI }
    workflowsConfig:
      _ref:
        resolver: ../shared/workflow_utils/resolvers/makeWorkflowsConfig.js
        vars:
          workflows: { _ref: ../shared/workflow_config/workflows.yaml }
    actionsEnum: { _ref: ../shared/enums/action_statuses.yaml }
```

Three properties used by app YAML are not yet declared: `workflowsConfig`, `actionsEnum`, `changeStamp`. **Only the first two are part of this task.** `changeStamp` is engine-handler runtime machinery (used by every insert/update in `StartWorkflow` / `SubmitWorkflowAction`); its schema entry lands in part 05 alongside the handlers that consume it.

## Task

Edit `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`. Add two new entries to the `properties` object. Keep the existing top-level `additionalProperties: false` and the existing `required: ['databaseUri']`.

### `workflowsConfig`

```js
workflowsConfig: {
  type: 'array',
  description:
    'Normalized workflows config — output of the makeWorkflowsConfig resolver. ' +
    'Each entry is one workflow with its actions and action_groups. ' +
    'Consumed by the engine at runtime. ' +
    'Workflow shape: { type, entity_type, display_order?, starting_actions, actions, action_groups? }. ' +
    'starting_actions entries: { type: string, status: string } where type matches an actions[].type and status is a key in actionsEnum.',
  items: {
    type: 'object',
    additionalProperties: true,
    required: ['type', 'entity_type', 'starting_actions', 'actions'],
    properties: {
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['type', 'kind'],
        },
      },
    },
  },
},
```

Required fields at both levels catch the case where an app bypasses the resolver and passes raw config to the connection. The resolver does the heavy validation; the schema catches the obvious cases at the connection boundary.

### `actionsEnum`

The shipped `action_statuses.yaml` is an **object keyed by status name** (see task 1), not an array. The schema mirrors that shape — `additionalProperties` on the top-level object describes any-status-name keys; each value is an object carrying `priority` (required, load-bearing) plus permissive display fields.

```js
actionsEnum: {
  type: 'object',
  description:
    'Action status enum keyed by status name (e.g. "done", "blocked"). ' +
    'Typically loaded from enums/action_statuses.yaml. ' +
    'Each entry MUST carry priority (load-bearing — the engine compares priorities ' +
    'in the priority-rule check in SubmitWorkflowAction). ' +
    'Display fields (title, color, borderColor, titleColor) are optional in the schema ' +
    'but present on every shipped status; apps providing their own actionsEnum ' +
    'should populate them too for consistent UI rendering.',
  additionalProperties: {
    type: 'object',
    additionalProperties: true,
    required: ['priority'],
    properties: {
      priority: { type: 'number' },
      title: { type: 'string' },
      color: { type: 'string' },
      borderColor: { type: 'string' },
      titleColor: { type: 'string' },
    },
  },
},
```

`required: ['priority']` on each entry is the **one place strictness is worth it** — a missing or non-numeric `priority` causes the engine's priority-rule check to silently misbehave. Catching at connection-init is far cheaper than at status-push time.

`additionalProperties: true` on each entry covers app overrides that introduce extra display fields (e.g. `icon`) without needing to enumerate them here.

### What stays untouched

- `additionalProperties: false` at the top level — keep it.
- `required: ['databaseUri']` at the top level — keep it. Do NOT add `workflowsConfig` or `actionsEnum` to top-level `required` (a connection without workflows is degenerate but not broken; handlers will fail loudly when they reach in for missing config).

## Acceptance Criteria

- `properties.workflowsConfig` and `properties.actionsEnum` exist in `schema.js`.
- The two entries match the JSON Schema fragments above exactly (description text wording may be polished, but `type`, `items`, `required`, `additionalProperties` settings must match).
- Top-level `additionalProperties: false` is preserved.
- Top-level `required: ['databaseUri']` is preserved (no entries added).
- The example app YAML above (minus `changeStamp`) validates against the schema. With `changeStamp` included, it still fails — that's expected until part 05 adds it.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build` still succeeds.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify; add the two new properties.

## Notes

- **`workflowsConfig` is `type: 'array'`, not `type: 'object'`.** The `makeWorkflowsConfig` resolver returns `workflows.map(...)` (verified against the old resolver and the new shape in task 2). Don't conflate "config" with "object" — the *output* of the resolver is an array of workflows.
- **`changeStamp` deliberately deferred to part 05.** The part 03 task design (`tasks/03-shared-mongodb-connection.md`) explicitly anticipates this — the connection-config object carries `changeStamp` alongside `workflowsConfig` and `actionsEnum`, and "see part 04/05" is the deferred-decision marker. Part 05 (start/cancel handlers) is the right home because that's where `changeStamp` first gets *consumed*.
- **Why not `additionalProperties: false` on the items of `workflowsConfig`?** Because that would silently reject any workflow YAML field we haven't enumerated — a footgun in v1, when the field set is still settling and the resolver hasn't pinned every key. Permissive items + the resolver's pass-through approach work together.
- **Why `additionalProperties: true` on each `actionsEnum` entry?** Display attributes (`title`, `color`, etc.) are optional and may grow. Permissive entry + required `priority` is the right balance.
- **The shape is object-keyed, not an array.** A previous draft of this task used `type: 'array'`; that's wrong. The concept doc and the override-merge mechanism both require object-keyed shape (engine reads `enum[status].priority`).
