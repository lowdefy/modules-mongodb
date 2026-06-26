# Task 2: Validate payload and gate by workflow stage

## Context

After Task 1, `CloseWorkflow.js` is a skeleton that throws "not implemented" once payload validation passes. This task replaces the "not implemented" throw with the validation block from [design.md § Validation](../design.md):

> - Workflow exists.
> - Workflow's current stage is `active` — already-`completed` is a no-op (idempotent), already-`cancelled` rejects (cancel is a stronger signal than close).

The validation is a runtime check at handler entry — three distinct outcomes per current `status[0].stage`:

| Current stage | Outcome                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| (no workflow) | Throw `"CloseWorkflow: workflow <id> not found"`                               |
| `active`      | Proceed to writes (Tasks 3–6)                                                  |
| `completed`   | No-op: return `{ action_ids: [], event_id: null, tracker_fired: [] }` silently |
| `cancelled`   | Throw `"CloseWorkflow: workflow <id> is cancelled; cannot close"`              |

The idempotent no-op on already-`completed` matches the design's "already-`completed` is a no-op (idempotent)" line. Returning the empty action-ids shape keeps the return contract consistent for downstream callers; they don't need to special-case the no-op.

## Task

Inside `CloseWorkflow.js`, after the `workflow_id` payload check, add a workflow-doc fetch + stage gate. Use the same `MongoDBFindOne` pattern shipped in `CancelWorkflow.js:34–37`:

```js
const workflowDoc = await context
  .mongoDBConnection("workflows")
  .MongoDBFindOne({
    query: { _id: payload.workflow_id },
    options: {
      // Project the first status entry as a 1-element slice — MongoDB can't
      // dot-project nested-array-index fields like `status.0.stage`.
      projection: { status: { $slice: 1 }, workflow_type: 1 },
    },
  });

if (!workflowDoc) {
  throw new Error(`CloseWorkflow: workflow ${payload.workflow_id} not found`);
}

const currentStage = workflowDoc.status?.[0]?.stage;

if (currentStage === "completed") {
  return { action_ids: [], event_id: null, tracker_fired: [] };
}

if (currentStage === "cancelled") {
  throw new Error(
    `CloseWorkflow: workflow ${payload.workflow_id} is cancelled; cannot close`,
  );
}
```

The `workflow_type` projection lands here (not later) because Tasks 4 and 5 will need it to resolve `workflowsConfig` for the sweep filter and `declaredGroups` for the groups recompute. Stash the doc on `context` so subsequent tasks can read it without a re-fetch:

```js
context.workflow = workflowDoc;
context.currentStage = currentStage;
```

Drop the `throw new Error('CloseWorkflow: not implemented');` line — it's about to be replaced by Task 3's status push. For this task, leave the function falling off the end (returning `undefined`) on the `active` happy path; tests will only assert validation behaviour.

## Acceptance Criteria

Add unit tests to `CloseWorkflow.test.js`:

- Empty/missing workflow throws `"CloseWorkflow: workflow <id> not found"` with the correct id interpolation.
- Workflow whose `status[0].stage === 'completed'` returns `{ action_ids: [], event_id: null, tracker_fired: [] }` and writes nothing to either collection (assert via `mdb` reads — workflow doc untouched, no new action docs).
- Workflow whose `status[0].stage === 'cancelled'` throws `"CloseWorkflow: workflow <id> is cancelled; cannot close"`.
- Workflow whose `status[0].stage === 'active'` falls through (returns `undefined` for now — Task 3 swaps this to the actual writes). Assert no throw; that's sufficient.
- Workflow doc projection: assert `MongoDBFindOne` is called once with the `{ status: { $slice: 1 }, workflow_type: 1 }` projection (use a spy or just check post-call state — the in-memory fixture doesn't need projection enforcement, but the test asserts the call was made).

Use the `seedWorkflow` helper pattern from `CancelWorkflow.test.js:54–66`; add a `stage` parameter so tests can seed `completed` / `cancelled` workflows.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — add validation block; drop "not implemented" throw.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — add four validation tests.

## Notes

- The no-op return on already-`completed` is silent (no console warning). This matches `pushWorkflowStatus.js`'s same-stage guard posture — repeated calls converge without surfacing as errors.
- The error messages should name the workflow id verbatim — error messages with concrete ids help operators diagnose stuck workflows in production.
- Use `MongoDBFindOne` (single-doc), not `MongoDBFind` — `CancelWorkflow.js:34` uses the singular form; match it.
