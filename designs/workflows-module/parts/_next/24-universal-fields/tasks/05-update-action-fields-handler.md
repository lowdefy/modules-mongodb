# Task 5: `UpdateActionFields` handler + connection registration

## Context

The `WorkflowAPI` connection (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`) registers its request handlers in `WorkflowAPI.js`:

```js
const WorkflowAPI = {
  schema,
  requests: { StartWorkflow, CancelWorkflow, CloseWorkflow, SubmitWorkflowAction },
};
```

(`src/types.js` derives the package's request-type list from this map automatically — no other registration point exists.)

`SubmitWorkflowAction/SubmitWorkflowAction.js` is the reference handler shape: a thin entry that composes the engine context once via `createEngineContext(lowdefyContext)` and delegates to a phase composition (`handleSubmit.js`). Prior tasks have landed everything this handler needs:

- Task 2: `loadWorkflowState(context, { actionId, verb: 'edit' })` — signal-less, verb-gated load, no stage check.
- Task 4: `planFieldsUpdate({ loadedState, fields, comment, metadata, context })` — pure plan, `workflow: null`.
- Task 3: `commitPlan(context, plan)` accepts the workflow-less plan (no CAS; action bulk-write + event + notifications + change-log).

The operation is deliberately minimal: **no pre/post hooks, no tracker cascade, no FSM signal** (design: "No pre/post hook in v1"; it is an operation, not a transition — the deliberate operations/transitions boundary from critique-concepts §3).

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/UpdateActionFields.js`:

   - Entry mirrors `SubmitWorkflowAction.js`: `createEngineContext(lowdefyContext)` then the phase composition (inline in the same file — the body is short enough not to warrant a separate `handleFieldsUpdate.js`):

     ```
     load (verb: 'edit' gate, no stage check)
       → planFieldsUpdate
       → commitPlan
       → surface dispatch errors
       → return { action_id, event_id }
     ```

   - Params (from `context.params`): `action_id` (required), `fields` (`{ assignees?, due_date?, description? }`), `comment` (optional), plus the build-time literals `action_type` / `workflow_type` the emitted endpoint sends (accepted for parity with the submit endpoint shape; `action_id` is the authoritative target locator).
   - Set `context.loadedState = loadedState` before `commitPlan` (commit reads it for `workflow_id` resolution on workflow-less plans — task 3).
   - Dispatch-error policy, same as `handleSubmit.js`'s tail: when `commitResult.dispatchErrors` is non-empty, throw `WorkflowEngineError` with `code: 'post_commit_dispatch_failed'` naming the failed steps — after composing nothing else (there is no cascade or post-hook here, so the throw follows commit directly).
   - Return `{ action_id: commitResult.action_ids[0], event_id: context.event_id }` — matching the emitted endpoint's `:return` mapping (task 8).
   - `UpdateActionFields.schema = {}` and `UpdateActionFields.meta = { checkRead: false, checkWrite: true }`, same as the sibling handlers.

2. Register it in `WorkflowAPI.js`'s `requests` map (import + key). `schema.js` is unchanged — the handler reads the same `databaseUri` / `app_name` / `entry_id` / `changeLog` / `endpoints` connection config the other handlers use.

3. Create `UpdateActionFields/UpdateActionFields.test.js` (mirror `SubmitWorkflowAction.test.js`'s harness conventions — mocked mongo helpers / callApi):

   - **Fields write:** assignee/due-date/description changes land on the action doc; omitted keys preserved; `null` clears.
   - **Cell re-render:** a status-map cell referencing `assignees` reflects the new value after the operation (the staleness class this part exists to kill).
   - **No workflow write:** zero writes to the workflows collection; no CAS evaluation.
   - **No status change:** the action's `status` array and stage are identical before/after.
   - **Role reject:** caller without the `edit` verb gate → `access_denied`, and no write of any kind occurs.
   - **Lifecycle freedom:** action on a `completed` workflow (no `required_after_close`) updates fine; a `done` action updates fine.
   - **Event + return:** `action-fields-updated` event dispatched via `endpoints.new_event` with **no** `metadata.comment` (the `comment` payload routes through the planner's `comment` param; Part 33 owns rendering it into `display.{app_name}.description`); handler returns `{ action_id, event_id }`.
   - **Dispatch failure:** a `new_event` callApi throw → committed action write survives, handler throws `post_commit_dispatch_failed`.

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test UpdateActionFields` passes.
- `WorkflowAPI.requests` exposes `UpdateActionFields` (and `src/types.js` therefore lists it — assert or eyeball via the existing types snapshot if one exists).
- No hooks, cascade, or FSM code paths are touched by the handler.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/UpdateActionFields.js` — create — handler.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/UpdateActionFields.test.js` — create — handler tests.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — modify — register the request type.

## Notes

- The design names the registration file "`WorkflowAPI/index.js` (or the connection's request-type map)" — the actual file is `WorkflowAPI.js`.
- Concurrency: two near-simultaneous fields updates are last-write-wins by design (no per-action CAS). Don't add one.
- Notifications (commit step 4) run as part of `commitPlan`; for `action-fields-updated` they're a no-op unless an app's notification config subscribes to that event type. Nothing to do here — just don't suppress the step.
