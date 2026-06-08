# Task 2: Rename `simple` → `check` in the engine FSM, render layer, typedef, and plugin tests

## Context

The runtime engine lives in `plugins/modules-mongodb-plugins`. It resolves each action submission against a **per-kind finite-state machine** and routes actions to pages by kind. The `simple` kind is implemented as an alias of the `form` FSM table (by object identity, so it can never silently diverge), and the render layer branches on `kind === 'simple'` to map verbs to the shared `workflow-action-*` pages. The `ActionKind` JSDoc typedef enumerates the legal kinds.

We are renaming the kind value `simple` to `check` — a pure vocabulary swap, no behavioural change. This task is package-scoped to `plugins/modules-mongodb-plugins` and is independent of the validator rename (Task 1). After this task, the plugin engine test suite must be green.

Current sites:

`plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js`
- Line ~31: comment "Same rule for form and simple kinds."
- Line ~35: comment "Form kind (inherited by `simple` via the alias below)."
- Lines ~139–142: the alias —
  ```js
  // `simple` is IDENTICAL to form — aliased by object identity, never a copy,
  // so a future edit to `form` can't silently diverge from `simple`
  // (state-machine.md "Simple kind"; CLAUDE.md "One correct way").
  simple: form,
  ```

`plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js`
- Lines ~16–18: doc comment describing `simple -> fixed module pages workflow-action-{verb}` and "no error page exists for the simple kind".
- Line ~38: comment "shared by simple + form".
- Lines ~117–120: the branch — `kind === 'simple' ? verb === 'error' ? 'workflow-action-view' : \`workflow-action-${verb}\` : ...`

`plugins/modules-mongodb-plugins/src/connections/shared/types.js`
- Line ~43: `@typedef {'form' | 'simple' | 'tracker'} ActionKind`

## Task

1. **FSM table** (`tables.js`): rename the `simple: form` map key to `check: form`. Update the two surrounding comments (lines ~31, ~35) and the three-line alias comment (lines ~139–141) to say "check" instead of "simple". Preserve the object-identity aliasing — `check: form` (a reference, never a copy). The concept-doc citation `state-machine.md "Simple kind"` may stay or be updated to "Check kind"; prefer updating it for accuracy.
2. **Render layer** (`computeEngineLinks.js`): change the `kind === 'simple'` branch to `kind === 'check'`. Update the doc comments (lines ~16–18, ~38) to say "check" instead of "simple".
3. **Typedef** (`types.js`): change `ActionKind` to `{'form' | 'check' | 'tracker'}`.
4. **Tests**: replace every `kind: "simple"` / `kind: 'simple'` fixture with `kind: 'check'`, and update test description strings that say "simple kind" / "simple action" to use "check". Files:
   - `src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js`
   - `src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js`
   - `src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js`
   - `src/connections/shared/render/computeEngineLinks.test.js`
   - `src/connections/shared/phases/planners/planActionTransition.test.js`
   - `src/connections/shared/phases/loadWorkflowState.test.js`
   - `src/connections/shared/fsm/resolveSignal.test.js`

After editing, grep the whole `plugins/modules-mongodb-plugins/src` tree for `simple` (case-insensitive) and confirm no action-kind reference remains. The `resolveSignal.test.js:66` test "returns null for an unknown kind" is about an arbitrary unknown kind, not `simple` specifically — confirm its fixture/assertion no longer depends on `simple` meaning "valid".

## Acceptance Criteria

- `grep -rn "simple" plugins/modules-mongodb-plugins/src/` returns no action-kind references (FSM key, render branch, typedef, fixtures, comments, or test descriptions).
- The FSM table exposes a `check` key aliased to `form` by object identity (`tables.check === tables.form` style identity preserved); there is no `simple` key.
- The render layer routes `kind === 'check'` actions to `workflow-action-{verb}` (with `error → workflow-action-view`); no `simple` branch remains.
- `ActionKind` is `{'form' | 'check' | 'tracker'}`.
- The plugin engine test suite passes: `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or the repo's scoped test command).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` — modify — rename alias key + comments.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — modify — rename kind branch + comments.
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — `ActionKind` typedef.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify — fixtures + descriptions.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — fixtures + descriptions.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify — fixtures + descriptions.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.test.js` — modify — fixtures + descriptions.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — fixtures + descriptions.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js` — modify — fixtures.
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/resolveSignal.test.js` — modify — fixture.

## Notes

- The aliasing pattern is load-bearing: keep `check` pointing at the same `form` object (a reference assignment), never a duplicated table — this is the "One correct way" guarantee from CLAUDE.md that a future edit to `form` can't diverge from `check`.
- Behaviour is unchanged: `check` resolves through the `form` FSM table and uses the shared `workflow-action-*` pages exactly as `simple` did.
