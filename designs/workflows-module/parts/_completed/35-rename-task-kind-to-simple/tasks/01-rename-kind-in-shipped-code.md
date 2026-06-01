# Task 1: Rename `kind: "task"` → `"simple"` in Shipped JS Code and Tests

## Context

The workflow-action kind currently spelled `task` is being renamed to `simple` across the workflows module. This task handles the JS-side changes: the resolvers that validate / route on `kind`, the plugin's JSDoc typedef, and every `*.test.js` file that seeds fixtures with `kind: "task"` or asserts validator error messages mentioning `task`.

The shipped code uses `kind: "task"` in three sites today:
- `ACTION_KINDS = ['form', 'task', 'tracker']` in `makeWorkflowsConfig.js`, plus a `validateAction` branch that keys on `'task'` and two error messages that mention `task` literally.
- `const isTask = action.kind === 'task'` in `makeWorkflowApis.js`.
- `actionConfig.kind === "task"` in `resolveTargetStatus.js` (one site).
- The `@typedef {'form' | 'task' | 'tracker'} ActionKind` in `plugins/modules-mongodb-plugins/src/connections/shared/types.js`.

After this task, the validator accepts `kind: simple` and rejects `kind: task` with the standard "unknown kind" error wording. This unblocks Task 3, which flips the demo's `workflow_config` to `kind: simple`.

Tests must move in lockstep with the code: fixtures that previously seeded actions with `kind: "task"` for table-driven coverage flip to `"simple"`, and the strict-string assertions on validator error messages flip to the new wording.

## Task

### Shipped resolvers and plugin types

1. **`modules/workflows/resolvers/makeWorkflowsConfig.js`**
   - Change `ACTION_KINDS` from `['form', 'task', 'tracker']` to `['form', 'simple', 'tracker']`.
   - In `validateAction`, rename the `kind === 'task'` branch handler to use `'simple'`.
   - Update the two error messages that mention `task` literally:
     - The "unknown kind" message currently produces text along the lines of `expected form, task, or tracker` — flip the literal to `expected form, simple, or tracker`. (Match whatever the current source string is; do not invent wording. The test assertion in step 5 will pin the exact final wording.)
     - The "kind: task but defines form: or tracker:" mismatch message flips its `task` literal to `simple`.

2. **`modules/workflows/resolvers/makeWorkflowApis.js`**
   - Rename local variable: `const isTask = action.kind === 'task'` → `const isSimple = action.kind === 'simple'`.
   - Update every read of `isTask` in the file to `isSimple`.

3. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js`**
   - Change `actionConfig.kind === "task"` to `actionConfig.kind === "simple"`. There is one such site in this file (line ~54).
   - **Conflict note with Part 28:** If Part 28 (custom-action-kind) has already landed before this task, the expression at this site will read `actionConfig.kind === "task" || actionConfig.kind === "custom"` (or similar) — flip only the `"task"` half to `"simple"`, leave the `"custom"` half untouched.

4. **`plugins/modules-mongodb-plugins/src/connections/shared/types.js`**
   - Update the JSDoc typedef: `@typedef {'form' | 'task' | 'tracker'} ActionKind` → `@typedef {'form' | 'simple' | 'tracker'} ActionKind`.

### Unit tests

5. **`modules/workflows/resolvers/makeWorkflowsConfig.test.js`**
   - Flip all `kind: "task"` fixtures to `kind: "simple"` (~19 sites).
   - Update the "unknown kind" assertion message from the old wording (`expected form, task, or tracker`) to the new wording (`expected form, simple, or tracker`) — match exactly what the source produces after step 1.
   - Update the "`kind: "task"` but defines `form:` or `tracker:`" assertion to use `simple` in its expected message.

6. **`modules/workflows/resolvers/makeWorkflowApis.test.js`** — Flip fixture `kind: "task"` → `"simple"`.

7. **`modules/workflows/resolvers/makeActionPages.test.js`** — Flip fixture `kind: "task"` → `"simple"`.

8. **`modules/workflows/resolvers/makeActionFormConfigs.test.js`** — Flip fixture `kind: "task"` → `"simple"`.

9. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.test.js`** — Flip fixture `kind: "task"` → `"simple"`.

10. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js`** — Flip all `kind: "task"` fixtures (~17 sites).

11. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.test.js`** — Flip fixture `kind: "task"` → `"simple"`.

12. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js`** — Flip all `kind: "task"` fixtures (~5 sites).

13. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js`** — Flip fixture `kind: "task"` → `"simple"`.

14. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js`** — Flip all `kind: "task"` fixtures (~11 sites), including the `kind = "task"` default-param value if present.

### Sweep check

After applying the above, run a repo-wide search for `kind: "task"`, `kind: 'task'`, `kind === "task"`, `kind === 'task'`, and `isTask` outside of design files and `_completed/`. Anything that turns up in shipped JS code or unit tests should be flipped. (Hits in `designs/`, `workflows-module-concept/`, or `_completed/` belong to other tasks — leave them.)

## Acceptance Criteria

- `pnpm test` (or the project's test command for `modules/workflows/resolvers/` and `plugins/.../WorkflowAPI/`) passes.
- `makeWorkflowsConfig.test.js`'s "unknown kind" rejection path asserts the new error wording and passes.
- A search for `kind: "task"` / `kind: 'task'` / `kind === "task"` / `kind === 'task'` / `isTask` returns no hits in `modules/workflows/resolvers/`, `plugins/modules-mongodb-plugins/src/connections/`, or their test files.
- The JSDoc `ActionKind` typedef reads `'form' | 'simple' | 'tracker'`.
- No behavioural changes — only the kind string value flips.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — flip `ACTION_KINDS`, the `'task'` branch in `validateAction`, and the two error messages.
- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — rename `isTask` → `isSimple`, flip the equality check.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js` — modify — flip the one `kind === "task"` check.
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — flip the JSDoc typedef.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — flip all `kind: "task"` fixtures and two error-message assertions.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — flip fixture.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — flip fixture.
- `modules/workflows/resolvers/makeActionFormConfigs.test.js` — modify — flip fixture.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.test.js` — modify — flip fixture.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — flip all fixtures.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.test.js` — modify — flip fixture.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify — flip all fixtures.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify — flip fixture.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — flip all fixtures and any default-param.

## Notes

- The flip is mechanical. Don't introduce behavioural changes, add validation for the old `task` value, or write a deprecation message — the design's "Out of scope" section explicitly defers the reserved-keyword treatment.
- Be careful with replace-all: only flip occurrences in the `kind:` field position (or `kind === "..."` comparisons). Do not touch unrelated uses of the word "task" — the workflows module references "workflow tasks" in some comments, and the file `track-step-*.yaml` (referenced in Part 30) is unrelated.
- After this task, `pnpm build` for `apps/demo` will fail because the demo still has `kind: task` in its workflow_config. Task 3 fixes that — they ship together.
