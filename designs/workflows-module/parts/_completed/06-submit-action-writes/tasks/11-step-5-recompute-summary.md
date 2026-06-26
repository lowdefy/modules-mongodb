# Task 11: Step 5 — Recompute workflow `summary` counts (groups defer to part 7)

## Context

[design.md § Lifecycle scaffold step 5](../design.md#lifecycle-scaffold):

> Recompute workflow summary — counts only. `groups[]` defer to part 7.

[engine/spec.md § Workflow doc](../../../../workflows-module-concept/engine/spec.md#workflow-doc) commits the shape: `summary: { done, not_required, total }`.

By this point in the lifecycle:

- Step 4 (task 10) wrote action transitions and updated `context.workflowActions` in place with the post-write status entries.
- The `summary.total` is the count of all actions on the workflow.
- `summary.done` counts actions with `status[0].stage === 'done'`.
- `summary.not_required` counts actions with `status[0].stage === 'not-required'`.

Part 7's [§ `groups[]` persistence](../../07-group-state-machine/design.md#groups-persistence) extends step 5 to also write the per-group `groups[]` array. v1 of step 5 in this part only handles the workflow-level summary; the in-memory cache update from task 10 carries through to part 7's extension naturally (part 7 reads the same `context.workflowActions` to compute per-group rollups).

V0 reference: there's no exact v0 equivalent — v0's workflow summary was computed inside `handleUpdateActions.js` inline. The new design promotes it to a named step so part 7 has a clean seam to extend.

## Task

Replace the `// Step 5 — Recompute workflow summary` TODO in `handleSubmit.js` with:

```js
// Step 5 — Recompute workflow summary (counts only; groups[] → part 7).
const summary = {
  done: context.workflowActions.filter((doc) => doc.status[0]?.stage === "done")
    .length,
  not_required: context.workflowActions.filter(
    (doc) => doc.status[0]?.stage === "not-required",
  ).length,
  total: context.workflowActions.length,
};

await context.mongoDBConnection("workflows").MongoDBUpdateOne({
  filter: { _id: context.workflow._id },
  update: {
    $set: {
      summary,
      updated: context.changeStamp,
    },
  },
});

// PART 7 EXTENSION: part 7 also writes `groups[]` here (per-group `{ id, status, summary }`
// entries). The same `MongoDBUpdateOne` call adds `groups` to the `$set` block alongside `summary`.
```

Key behaviour:

- Reads `context.workflowActions` (the in-memory cache, updated by step 4 in place).
- Computes the three counts as a plain reduction.
- Writes via `MongoDBUpdateOne` on the workflows collection — single `$set` operation including `updated: context.changeStamp`.
- The `groups[]` defer is a one-line `$set` extension when part 7 lands.

## Acceptance Criteria

- Step 5's TODO marker in `handleSubmit.js` is replaced with the body above.
- `summary` is computed from `context.workflowActions` (the post-write in-memory cache, not a fresh DB read).
- Counts: `done` is the count of actions whose `status[0].stage === 'done'`; `not_required` is the count whose `status[0].stage === 'not-required'`; `total` is the array length.
- One `MongoDBUpdateOne` call against the workflows collection sets `summary` and `updated`.
- Inline comment names part 7 as the `groups[]` extension owner.
- `handleSubmit.test.js` extended with cases (using `inMemoryMongo`):
  - Workflow with 3 actions, all `action-required` before submit; user submits the first to `done` (form action with review verb, but force the test config so the target is `done`): post-step-5 summary = `{ done: 1, not_required: 0, total: 3 }`.
  - Workflow with 2 actions; user submits one to `not-required`: summary = `{ done: 0, not_required: 1, total: 2 }`.
  - Workflow with 4 actions, one already `done`, one already `not-required`; user submits a third to `done`: summary = `{ done: 2, not_required: 1, total: 4 }`.
  - Workflow with 0 actions (edge case — shouldn't happen in practice): summary = `{ done: 0, not_required: 0, total: 0 }`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — fill in step 5 body.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the four cases above.

## Notes

- **Auto-complete is NOT here.** [Part 7 § Auto-complete check](../../07-group-state-machine/design.md#auto-complete-check) owns the "if every action is terminal, push `completed` to workflow status" check. Step 5 of part 6 only writes the `summary` counts; pushing the workflow status to `completed` is part 7's extension. Part 7 bundles its `completed` `$push` inline into the `summary`/`groups` `$set` for one round-trip; [part 23](../../23-close-workflow-handler/design.md)'s `CloseWorkflow` reuses shipped `shared/pushWorkflowStatus.js` and `recomputeGroups.js` inline (no shared close helper — the bundle isn't delegable across the two action-set shapes).
- **Why read from `context.workflowActions` instead of re-fetching from Mongo.** Two reasons: (1) avoids an extra round-trip to Mongo for state we already have in memory after step 4's in-place updates; (2) keeps the engine spec's "sequential through the shared dispatcher" posture — no additional reads in the lifecycle that aren't strictly necessary.
- **`changeStamp` reuse.** All writes in this invocation share the same `context.changeStamp` (per [engine/spec.md § Client and transaction model](../../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)). Step 5's `updated` is the same value step 4 used.
- This step can run in parallel with step 6 (task 12) — both write to the workflow doc but on disjoint field sets (`summary` vs `form_data.{action_type}.*`). However, the design's sequential posture means they run in declared order anyway; if a future optimization wants to combine them into one `MongoDBUpdateOne` call, that's a follow-up refactor, not part of this task.
