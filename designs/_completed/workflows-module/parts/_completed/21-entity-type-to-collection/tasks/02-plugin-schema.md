# Task 2: Update `workflowsConfig` JSON schema in the plugin

## Context

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` is the JSON-schema validator the Lowdefy plugin loader uses to check the connection config a host app provides. Today it documents — and requires — `entity_type` on each entry of the `workflowsConfig` array (see lines 30–53). Part 21 swaps that to `entity_collection`.

The schema today (relevant slice):

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
    ...
  },
},
```

Per the design's "Shipped code edits" section, part 21 owns this edit directly — part 3's `design.md` and `tasks/` are frozen.

## Task

In `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`:

1. In the `workflowsConfig.description` string, replace `entity_type` with `entity_collection` in the workflow-shape sentence: `'Workflow shape: { type, entity_collection, display_order?, starting_actions, actions, action_groups? }. '`.
2. In `workflowsConfig.items.required`, replace `'entity_type'` with `'entity_collection'`.

No per-property schema entry is needed for `entity_collection` because `additionalProperties: true` on the items already permits arbitrary fields. The `required` list documents the contract.

## Acceptance Criteria

- `schema.js` no longer contains the token `entity_type`.
- `workflowsConfig.items.required` reads `['type', 'entity_collection', 'starting_actions', 'actions']`.
- `workflowsConfig.description` references `entity_collection` in the workflow-shape sentence.
- `pnpm -F modules-mongodb-plugins build` (or whatever the package's build command is) still succeeds.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — two token swaps (description string + `required` array).

## Notes

The package also ships a `dist/` copy of `schema.js`. That's a build artifact — leave it; the build step in CI regenerates it.
