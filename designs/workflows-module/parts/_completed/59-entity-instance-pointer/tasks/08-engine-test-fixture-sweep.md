# Task 8: Sweep nested entity fixtures across the remaining engine test suites

## Context

Several engine test suites construct workflow/action documents (or assert on docs the planners write) but their **source files** do not change behaviourally in Part 59. Once the planners (Task 2) and StartWorkflow (Task 3) emit the nested `entity` shape, these suites' flat `entity_collection` / `entity_id` fixtures and assertions break — `planActionTransition` reads `loadedWorkflow.entity.*`, so a flat fixture produces `entity.connection_id: undefined` and fails downstream assertions.

This task makes the **full plugins engine suite green** by nesting entity fixtures wherever they remain flat.

## Task

Search the engine test tree for residual flat entity references and convert them to the nested shape, keeping the workflow/action/parent/child distinction:

```bash
grep -rln "entity_collection\|entity_id\|entity_ref_key\|parent_entity_\|child_entity_" \
  plugins/modules-mongodb-plugins/src/connections
```

For each remaining test file (those whose source was not already updated in Tasks 2–7), convert fixtures and assertions:

- workflow docs: `{ entity_collection, entity_id, entity_ref_key }` → `entity: { connection_id, id, ref_key }`; `parent_entity_collection`/`parent_entity_id` → `parent_entity: { connection_id, id } | null`.
- action docs: `{ entity_collection, entity_id }` → `entity: { connection_id, id }`; `child_entity_collection`/`child_entity_id` → `child_entity: { connection_id, id } | null`.

Known suites in scope (verify against the grep; the source of each is unchanged by this part):

- `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js`
- `WorkflowAPI/UpdateActionFields/UpdateActionFields.test.js`
- `shared/phases/loadWorkflowState.test.js`
- `shared/phases/runTrackerCascade.test.js`
- `shared/phases/planSubmit.test.js`
- `shared/phases/planners/planTrackerLevel.test.js`
- `shared/phases/planners/foldCommentIntoEvent.test.js`
- `shared/phases/planners/planFieldsUpdate.test.js`
- `shared/phases/planners/planAutoUnblock.test.js`
- `shared/phases/planners/planWorkflowRecompute.test.js`
- `shared/render/resolveActionAccess.test.js`

(Skip any file already handled in Tasks 2–7. The keyword sentinel `entity_id: true` inside link/urlQuery fixtures stays flat — see Task 7.)

## Acceptance Criteria

- The grep above returns no flat `entity_collection` / `entity_id` / `entity_ref_key` / `parent_entity_*` / `child_entity_*` occurrences in `src/connections` **except** the `entity_id` link sentinel keyword (Task 7) and any deliberately-flat authoring tokens.
- The full plugins engine test suite passes (`pnpm --filter @lowdefy/modules-mongodb-plugins test`).

## Files

- `plugins/modules-mongodb-plugins/src/connections/**/*.test.js` — modify — nest residual flat entity fixtures/assertions in the suites listed above (and any others the grep surfaces).

## Notes

This is the gate that confirms the whole engine layer agrees on the nested shape. Run the full package test suite, not just individual files, to catch fixtures shared via helpers.
