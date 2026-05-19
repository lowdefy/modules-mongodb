# Task 3: Drop `entity_type` from JSDoc typedefs and the `getActionFields` projection

## Context

Two shipped files in the plugin reference `entity_type` as part of the workflow/action document shape:

1. `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — JSDoc typedefs for `WorkflowDoc` and `ActionDoc` (no runtime behaviour; pure typing).
2. `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js` — `MongoDBFindOne` projection that pulls the action's core fields for status pushes and access checks.

Both shipped under part 3 (engine-plugin-shell). Per part 21's "Shipped code edits" section + "Implemented parts" rule, the code is edited directly here; part 3's design and tasks stay frozen.

## Task

### `types.js`

Drop the `entity_type` property from both `WorkflowDoc` and `ActionDoc` JSDoc typedefs.

Today's `WorkflowDoc` includes (relevant slice):

```js
/**
 * @property {string} entity_type
 * @property {string} entity_id
 * @property {string} entity_collection
 * ...
 */
```

Becomes:

```js
/**
 * @property {string} entity_id
 * @property {string} entity_collection
 * ...
 */
```

Same edit on `ActionDoc`. No changes to `parent_entity_id`, `parent_entity_collection`, `child_entity_id`, `child_entity_collection` — those stay.

### `getActionFields.js`

Drop `entity_type: 1` from the `projection` object in the `MongoDBFindOne` call, and drop `'entity_type'` from the return-type JSDoc `Pick<...>` union.

Today's projection (relevant slice):

```js
projection: {
  _id: 1,
  workflow_id: 1,
  type: 1,
  key: 1,
  kind: 1,
  status: 1,
  entity_type: 1,
  entity_id: 1,
  entity_collection: 1,
},
```

Becomes (with `entity_type: 1` line removed). Same edit on the JSDoc return type at the top of the file.

## Acceptance Criteria

- `types.js` no longer contains the token `entity_type`.
- `getActionFields.js` no longer contains the token `entity_type`.
- Both files still contain `entity_id`, `entity_collection`, and (for `types.js`) the parent/child fields.
- Package build (`pnpm -F modules-mongodb-plugins build` or equivalent) still succeeds — these are JSDoc-only changes plus one removed projection key, no behaviour change.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — drop two `@property {string} entity_type` lines.
- `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js` — modify — drop the projection key and the JSDoc Pick member.

## Notes

The `dist/` copies of these files are build artifacts — don't edit them directly.
