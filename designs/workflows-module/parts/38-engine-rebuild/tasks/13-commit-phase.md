# Task 13: Commit phase — `commitPlan`

## Context

The commit phase is the single point that touches multiple collections. It writes the Plan and nothing else — no reads, no renders, no logic that wasn't in the plan. It must implement: workflow-first ordering (D9), the conditional transaction vs standalone-fallback paths (D11), and the compare-and-swap concurrency gate on `workflow.updated.timestamp` (D15). It consumes the task-1 Mongo helpers and the task-9 `Plan` type.

## Task

**Create `shared/phases/commitPlan.js`** as the single commit-phase entry point.

**Write ordering (D9) — workflow-first:**

1. **Workflow** — `findOneAndUpdateDoc` on the workflows collection with the planned post-commit doc, carrying the **CAS filter**:
   ```js
   findOneAndUpdateDoc(workflows, {
     filter: { _id: workflow._id, "updated.timestamp": loadedState.workflow.updated.timestamp },
     update: { $set: plannedWorkflowDoc },  // whole doc minus _id (Q1)
   });
   ```
   This is the **claim step**: a `null` return (filter matched zero docs → concurrent submit moved the workflow between load and commit) → **throw `ConcurrentSubmitError` before any action write**. Pin the **timestamp scalar**, not the whole `updated` sub-document (order/shape-independent compare).
2. **Actions** — `bulkWriteActions` with all inserts + updates from `plan.actions` (whole-doc `$set` minus `_id` per op).
3. **Events** — `callApi("new-event", { module: "events" }, { _id: event_id, display, references, type, metadata })` per `plan.events`. **Outside the transaction; community-plugin client** (it can't join the engine session — D8/D9).
4. **Notifications** — `dispatchNotifications(context, { event_ids })` → `callApi("send-notification", { module: "notifications" }, { event_ids })`, a single call carrying the `_id`s of the events written in step 3. **The engine builds no notification doc and inserts nothing.** This is the surviving `dispatchNotifications.js` helper (unchanged mechanic): the notifications module's `send-notification` endpoint runs the app's `send_routine`, which re-fetches each event doc and owns fan-out + any notification-doc write — nothing in the repo produces a `NotificationDoc`, so composing one would be speculative surface. Must run after step 3 (the routine reads the committed event). Outside the transaction; community-plugin client. Silent no-op when no `send_routine` is wired.
5. **Change-log** — `insertManyDocs` (single call) of all `plan.changeLog` entries. **Last step, outside the txn** so any earlier failure prevents an audit entry claiming a write that didn't happen.

**Transaction path (D11):**

```js
async function commitPlan(context, plan) {
  if (!context.useTransactions) return commitWithoutTransaction(plan); // standalone fallback (D9 ordering + CAS)
  const session = context.mongoClient.startSession();
  try {
    return await session.withTransaction(() => commitWithSession(plan, session));
  } finally {
    await session.endSession();
  }
}
```

- On a replica set, **steps 1–2 run inside one transaction** (workflow + actions atomic). Steps 3–5 always run outside it.
- `context.useTransactions` is set by topology detection at connection init (task 1).
- A CAS miss inside the transaction surfaces as a null `findOneAndUpdate` → throw `ConcurrentSubmitError` → clean abort. (`withTransaction` auto-retries transient errors, but the retry re-issues the same planned writes; the now-stale CAS filter misses → null → clean throw rather than committing stale writes.)

**Define `ConcurrentSubmitError`** — `extends WorkflowEngineError` (`shared/errors.js`, created by task 9 per D13's engine error model) with `code: "concurrent_submit"`. It keeps a named class because callers catch it by name as the retryable case. The engine does **not** auto-retry (each retry re-runs the pre-hook, which may be non-idempotent — caller's policy decides).

**Output:** `CommitResult` — the doc IDs written (`action_ids`, `event_ids`, …).

## Acceptance Criteria

- Workflow is claimed first; a CAS miss throws `ConcurrentSubmitError` **before any action write** (verify: zero action writes on a miss).
- The CAS filter pins `updated.timestamp` (scalar), not the whole `updated` object.
- On a replica set, steps 1–2 are atomic (a forced step-2 failure rolls back step 1); steps 3–5 are outside.
- On standalone, the ordered-writes fallback runs and the CAS gate still throws before action writes on a miss.
- Events go through `callApi("new-event")` on the community client, never the engine session.
- Change-log is the last write; a change-log failure leaves committed writes intact (smallest failure mode).
- Tests: CAS happy path + miss path; concurrent submit (one wins, one throws); transaction rollback of steps 1–2 on a single-node `MongoMemoryReplSet`; standalone fallback ordering.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/commitPlan.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/commitPlan.test.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/errors.js` — modify — add `ConcurrentSubmitError extends WorkflowEngineError` (base class created by task 9 per D13)

## Notes

- Q1: whole-doc `$set` for workflow + actions (revisit only if write size becomes an issue).
- The denormalised summary/groups on the planned workflow come from the same Plan as the action states, so writing workflow-before-actions is internally consistent.
- Threading the engine session into callApi'd subroutines (so events/notifications join the txn) is an explicit Non-goal — do not attempt it here.
