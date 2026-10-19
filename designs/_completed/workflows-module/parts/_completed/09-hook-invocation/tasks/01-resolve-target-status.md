# Task 1: Extract `resolveTargetStatus` into a util with three-layer precedence

## Context

`handleSubmit.js` currently inlines `resolveTargetStatus` ([handleSubmit.js:25–52](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — a single-layer resolver that maps `interaction → target_status` using only the engine default, with a special branch for task `submit_edit` that reads `params.current_status`. Part 9 introduces two override layers on top:

1. Engine default per interaction (already implemented).
2. Action YAML `interactions[interaction].status` — baked into the endpoint config by Part 13 as `params.interactions` ([makeWorkflowApis.js:57–66](../../../../modules/workflows/resolvers/makeWorkflowApis.js)).
3. Pre-hook return `status` — runtime, from the pre-hook's response object.

The resolver must compose all three (last wins). The resolved value is then used by Part 6's per-entry write loop, which still applies the priority rule on top.

Pull the resolver out of `handleSubmit.js` into its own util so it has a clear unit-test surface and the layered semantics are visible at a glance.

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js`. Export a single default function with the signature:

   ```js
   resolveTargetStatus({
     interaction,             // 'submit_edit' | 'not_required' | 'resolve_error' | 'approve' | 'request_changes'
     actionConfig,            // workflow.actions[i] — has `kind`, `access`
     params,                  // handler params bag — provides `current_status` for task submit_edit
     yamlInteractions,        // params.hooks?.... no: params.interactions — { [interaction]: { status } }; may be undefined
     preHookStatus,           // top-level `status` from pre-hook return; may be undefined
   }) → string
   ```

2. Compute the engine default exactly as the inlined version does today (preserve `submit_edit` task branch on `params.current_status`, `review` verb detection for `submit_edit` / `resolve_error`, terminal mapping for `not_required` / `approve` / `request_changes`).

3. Apply layered overrides last-wins:

   ```js
   const engineDefault = /* current resolveTargetStatus logic */;
   const yamlOverride = yamlInteractions?.[interaction]?.status;
   return preHookStatus ?? yamlOverride ?? engineDefault;
   ```

   (`undefined` skips a layer; a string value wins over lower layers.)

4. Move the existing tests for status resolution that live inside `handleSubmit.test.js` into a colocated `resolveTargetStatus.test.js`. Add cases for:
   - Engine default only (no YAML, no pre-hook).
   - YAML override wins over engine default.
   - Pre-hook override wins over YAML.
   - Pre-hook override wins over engine default (no YAML present).
   - Task `submit_edit` still requires `params.current_status`; YAML/pre-hook can override the resolved stage on top.
   - Throw on unknown `interaction` is preserved.

5. In `handleSubmit.js`, replace the inline function. Step 1 (the call site at [handleSubmit.js:136](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) keeps calling it with `yamlInteractions: undefined` and `preHookStatus: undefined` for now — Task 7 plumbs the real values in. The behaviour for v1 callers is unchanged.

## Acceptance Criteria

- `resolveTargetStatus.js` exists as a standalone module with the signature above.
- `resolveTargetStatus.test.js` exists with the cases listed; all pass.
- `handleSubmit.js` imports the util and no longer defines the function inline.
- Existing handler tests continue to pass without modification.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.test.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify: delete inline `resolveTargetStatus`; import + call the util at step 1.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify only if existing status-resolution cases need to move out; keep handler-level coverage of the call.

## Notes

- The resolved value still passes through Part 6's priority rule at the per-entry write site — do **not** apply the priority rule here. This util produces the _intent_; the write loop owns enforcement.
- The util is called once per submit, at step 1. Task 7 may invoke it a second time after the pre-hook returns to graft the resolved status onto a `currentActionId` replacement entry; that re-call uses the same util with `preHookStatus` populated.
