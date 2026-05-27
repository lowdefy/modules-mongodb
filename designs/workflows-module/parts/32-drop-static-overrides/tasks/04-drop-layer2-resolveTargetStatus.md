# Task 4: Drop Layer 2 in `resolveTargetStatus` + add pre-hook status enum check

## Context

`resolveTargetStatus` is the per-interaction status resolver. Today it composes three layers (engine default → YAML `interactions[interaction].status` → pre-hook return `status`) and applies them last-wins:

```js
// plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js
function resolveTargetStatus({
  interaction, actionConfig, params, yamlInteractions, preHookStatus,
}) {
  // ... computes engineDefault per interaction ...
  const yamlOverride = yamlInteractions?.[interaction]?.status;
  return preHookStatus ?? yamlOverride ?? engineDefault;
}
```

Part 32 collapses this to two layers: engine default + pre-hook return. It also **adds** a runtime enum-membership check against the pre-hook return — there is no equivalent check today on either the YAML or pre-hook channel (`makeWorkflowsConfig` doesn't inspect `action.interactions[].status` and `makeWorkflowApis.emitInteractions` passes `v.status` through unchanged, so a typo silently ships and `updateAction` writes it). If the pre-hook returns a `status` that isn't a member of `action_statuses`, throw `UserError(isReject: false)` so the wrapping endpoint's `runRoutine` classifies it as `{ status: 'error' }` (not `:reject`).

The `action_statuses` set lives in `modules/workflows/resolvers/makeWorkflowsConfig.js`:

```js
const ACTION_STATUSES = [
  'not-required', 'error', 'changes-required', 'done',
  'in-review', 'in-progress', 'action-required', 'blocked',
];
```

The handler currently calls `resolveTargetStatus` twice (handleSubmit lines 127–132 and 162–168). The second call — after the pre-hook returns — is the right place for the enum check to fire (i.e. before step 4 writes, after step 2 pre-hook invocation).

`UserError` is not a Node built-in — it's a Lowdefy-side error class used by `:reject`. `runRoutine` discriminates on `name === 'UserError'` and `isReject`, not on `instanceof`. The canonical class is exported from `@lowdefy/errors` (`/Users/sam/Developer/lowdefy/lowdefy/packages/utils/errors/src/UserError.js`), but `@lowdefy/modules-mongodb-plugins` does not depend on that package (not in `dependencies`/`peerDependencies`/`devDependencies` of `plugins/modules-mongodb-plugins/package.json`). Adding it just for one throw site is overkill, and the existing test shims (`invokePreHook.test.js:139–146`, `handleSubmit.test.js:1677–1684`) already inline the same minimal shape.

**Decision:** mint a small local `UserError` class in a new helper file `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/UserError.js` mirroring the test shim shape, and import it from `resolveTargetStatus.js`. A single source-of-truth per "One correct way" — `resolveTargetStatus.js` and any future throw site reuse the same class without duplicating it. If/when `@lowdefy/errors` is added as a peer dep for some other reason, swap the import.

## Task

1. **Remove the `yamlInteractions` parameter** from `resolveTargetStatus`. The function signature becomes `{ interaction, actionConfig, params, preHookStatus }`. Remove the `yamlOverride` local and update the return to `return preHookStatus ?? engineDefault;`.
2. **Update the function's JSDoc** to describe two layers, not three. Drop the `yamlInteractions` param doc. Drop the "Part 9's two override layers" comment and replace it with a one-line summary.
3. **Add runtime enum check on `preHookStatus`.** If `preHookStatus !== undefined && !ACTION_STATUSES.includes(preHookStatus)`, throw a `UserError` with `isReject: false` and a message naming the bad status and the action type. Place the check inside `resolveTargetStatus` (cleaner than spreading it across the handler).
   - Decide where `ACTION_STATUSES` lives. Options:
     - (a) re-import from `modules/workflows/resolvers/makeWorkflowsConfig.js` — requires exporting it.
     - (b) duplicate the constant locally in `resolveTargetStatus.js`.
   - Pick (a) — export `ACTION_STATUSES` from `makeWorkflowsConfig.js` and import it here. (Per `CLAUDE.md` "One correct way" — single source of truth for the enum.)
4. **Create a local `UserError` helper.** Per the Context section's decision, add `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/UserError.js`:
   ```js
   export default class UserError extends Error {
     constructor(message, { isReject = false } = {}) {
       super(message);
       this.name = 'UserError';
       this.isReject = isReject;
     }
   }
   ```
   Import it from `resolveTargetStatus.js`. This shape matches `runRoutine`'s discrimination (`name === 'UserError'`, `isReject`) and matches the inline shims in `invokePreHook.test.js` and `handleSubmit.test.js`. Update those test files to import the same class on a follow-up if convenient — not blocking for this task.
5. **Update `resolveTargetStatus.test.js`**:
   - Drop the existing tests that exercise the `yamlInteractions` branch (search for `yamlInteractions:` in the test file — current matches at lines ~130, 141, 152, 165, 188, 200).
   - Add tests:
     - pre-hook `status` member of `ACTION_STATUSES` → resolves to that status, no throw.
     - pre-hook `status` not a member → throws `UserError`, `err.isReject === false`, message names the bad status.
     - pre-hook `status` undefined → falls through to engine default.
     - engine-default branches per interaction (keep one happy-path per interaction; the design doesn't change those defaults).

## Acceptance Criteria

- `resolveTargetStatus` accepts `{ interaction, actionConfig, params, preHookStatus }` only.
- Calling with `preHookStatus: 'not-a-real-stage'` throws an error whose `name === 'UserError'` and `isReject === false`.
- Calling with `preHookStatus: 'done'` (or any member of `ACTION_STATUSES`) returns `'done'` without throwing.
- Calling without `preHookStatus` returns the engine default for the given `interaction` + `actionConfig.kind`.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test resolveTargetStatus` passes.
- `ACTION_STATUSES` has a single source-of-truth export (exported from `makeWorkflowsConfig.js` or a small shared module — not duplicated).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js` — modify — drop `yamlInteractions`, add enum check, update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.test.js` — modify — drop Layer-2 tests, add enum-check tests.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/UserError.js` — create — local error class matching `runRoutine`'s `name === 'UserError'` / `isReject` discrimination.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — export `ACTION_STATUSES` (named export) without changing the internal validator usage.

## Notes

- The throw fires before step-4 writes in `handleSubmit`, so the action doc is unchanged on a misspelled-status throw. The design's § Verification expects a test for this — write it in `handleSubmit.test.js` if it doesn't already exist, or defer to Task 5 which rewires the handler.
- Pre-hook side effects re-run on retry per Part 29's idempotency contract — pre-hook authors own retry safety. No need to add machinery here.
- Do NOT short-circuit the enum check to "skip when pre-hook returned no status" — design intent is the check fires only when a value is present.
