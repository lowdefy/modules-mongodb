# Task 3: Engine — drop `description` from the universal-fields write path, the action-doc seed, and the `Action` typedef

## Context

Part 64 deletes the editable universal-field `description` everywhere. The action doc no longer carries a `description` field, and the `update-fields` write path no longer writes it. Universal fields shrink to `assignees` + `due_date` on the write side.

Three engine files declare `UNIVERSAL_FIELDS = ["assignees", "due_date", "description"]` or seed `description` onto new docs:

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.js` — the `UpdateActionFields` planner. `UNIVERSAL_FIELDS` (line ~10) is the `$set` allowlist for the fields-write operation. Also has JSDoc referencing `description`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — `UNIVERSAL_FIELDS` (line ~12) is the kind-based strip set on the update path (`applyUpdateFieldsRule`), and the **insert** path seeds `description: null` onto every new action doc (line ~188). Also has JSDoc referencing `description` (the `@param payload` and module-level notes).
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — the `Action` typedef declares `@property {string | null} description` (line ~55).

This task is independent of Task 2 (read path) — different concern, no shared file — and can run in parallel.

## Task

**`planFieldsUpdate.js`:**

1. Change `UNIVERSAL_FIELDS` to `["assignees", "due_date"]`.
2. Update the comment ("The three action-level metadata fields…" → two) and the JSDoc: drop `description` from `{ assignees?, due_date?, description? }` param shapes.

**`planActionTransition.js`:**

3. Change `UNIVERSAL_FIELDS` to `["assignees", "due_date"]`.
4. Remove the `description: null,` line from the insert-path new-doc seed (line ~188, between `due_date: null,` and `tracker: null,`).
5. Update the kind-based-rule comment/JSDoc: the universal keys are now `assignees` / `due_date` (drop `description` from the prose and the `@param payload` description, e.g. "the three universal keys" → "the two universal keys").

**`types.js`:**

6. Remove the `@property {string | null} description` line from the `Action` typedef.

**Tests:**

7. `planFieldsUpdate.test.js` — drop any assertion that `description` is written / honoured on the fields-update path; if a test passes `description` in `fields`, it should now be ignored (not in `UNIVERSAL_FIELDS`), so update expectations accordingly.
8. `planActionTransition.test.js` — drop the assertion that a new action doc is seeded with `description: null`; verify new docs no longer carry `description`. On the check-kind update path, `description` in `fields` is no longer a passthrough universal key — adjust any expectation.
9. `WorkflowAPI/UpdateActionFields/UpdateActionFields.js` + `UpdateActionFields.test.js` — update the JSDoc (lines ~10/24/26 mention the three fields / `{ assignees?, due_date?, description? }`) to the two-field shape; drop `description` assertions in the test. (The handler itself just forwards `fields` to the planner; no functional change beyond JSDoc.)

## Acceptance Criteria

- `UNIVERSAL_FIELDS` is `["assignees", "due_date"]` in both `planFieldsUpdate.js` and `planActionTransition.js`.
- New action docs produced by `planActionTransition` (insert path) do **not** carry a `description` key.
- The `update-fields` path writes only `assignees` / `due_date`; a `description` in the `fields` bag is ignored.
- The `Action` typedef in `types.js` has no `description` property.
- JSDoc across the three source files no longer lists `description` as a universal field.
- `npx jest planFieldsUpdate planActionTransition UpdateActionFields` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.js` — modify — `UNIVERSAL_FIELDS` → two; JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — `UNIVERSAL_FIELDS` → two; remove `description: null` seed; JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — drop `Action.description`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/UpdateActionFields.js` — modify — JSDoc only (two-field shape).
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFieldsUpdate.test.js` — modify — drop `description` write assertions.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — drop `description: null` seed assertion.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/UpdateActionFields.test.js` — modify — drop `description` assertions.

## Notes

- The `StartWorkflow` seeding of action-doc `description` (design point 1) flows through `planActionTransition`'s insert path — removing the `description: null` seed there covers StartWorkflow; no separate `StartWorkflow.js` change is needed. (`StartWorkflow.js:40`'s `description?` reference is the unrelated _event display_ slice, not the action doc — leave it.)
- "No migration" (design): the module is unreleased with deleted test data, so docs simply stop carrying `description`. No data cleanup.
