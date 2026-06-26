# Task 6: Cancel/Close — collapse flat entity keys in RESERVED_WORKFLOW_KEYS

## Context

`CancelWorkflow.js` and `CloseWorkflow.js` each define a `RESERVED_WORKFLOW_KEYS` array (~line 14) listing workflow-doc field names that callers may not overwrite via `references`/payload spread. Both lists include the flat `'entity_id'` and `'entity_collection'` (~lines 19-20). The loop that enforces it iterates these keys (`CancelWorkflow.js:111`, `CloseWorkflow.js:127`).

Part 59 nests the entity pointer into a single `entity` object, so the two flat reserved keys collapse into one: `'entity'`.

## Task

In **both** `CancelWorkflow.js` and `CloseWorkflow.js`, in `RESERVED_WORKFLOW_KEYS`, replace the two entries `'entity_id'` and `'entity_collection'` with a single `'entity'`. Leave all other reserved keys unchanged.

### Tests

`CancelWorkflow.test.js` and `CloseWorkflow.test.js` — wherever fixtures or assertions reference the reserved flat entity keys, update to the nested `entity` shape; if a test asserts that a reserved key cannot be overwritten, ensure it now exercises `'entity'`.

## Acceptance Criteria

- Both `RESERVED_WORKFLOW_KEYS` arrays contain `'entity'` and neither `'entity_id'` nor `'entity_collection'`.
- `CancelWorkflow.test.js` and `CloseWorkflow.test.js` pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — modify — reserved-keys list.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — reserved-keys list.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify — nested fixtures/assertions.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — nested fixtures/assertions.
