# Task 13: Commit phase — `commitPlan`

> **Deviation (implemented; corrected by task 22).** Steps 3–4 below describe `callApi` with the unshipped contract: a `({ id, module }, payload, { user })` three-argument shape and a "`callApi` does not throw — it returns `{ success, error }`" claim. Both are wrong against the shipped framework (`callApi({ endpointId, payload })`, single object arg, **throws** on failure, returns the `:return` value or `null` — see design § "The shipped `callApi` contract" and [call-api/spec.md](../../../../workflows-module-concept/call-api/spec.md)). The landed `commitPlan.js` reproduces the wrong contract (`dispatchEvent`'s `!result.success` check misfires on every successful dispatch; the `{ id, module }` first argument destructures to `endpointId: undefined`). Task 22 fixes the landed code: opaque pre-scoped endpoint ids from `connection.endpoints.*`, per-step try/catch (already present) as the sole failure capture, no success-check. The text below is preserved as written for history.

## Context

The commit phase is the single point that touches multiple collections. It writes the Plan and nothing else — no reads, no renders, no logic that wasn't in the plan. It must implement: workflow-first ordering (D9), the conditional transaction vs standalone-fallback paths (D11), and the compare-and-swap concurrency gate on `workflow.updated.timestamp` (D15). It consumes the task-1 Mongo helpers and the task-9 `Plan` type.

## Task

**Create `shared/phases/commitPlan.js`** as the single commit-phase entry point.

**Write ordering (D9) — workflow-first:**

1. **Workflow** — `findOneAndUpdateDoc` on the workflows collection with the planned post-commit doc, carrying the **CAS filter**:
   ```js
   findOneAndUpdateDoc({
     mongoDb: context.mongoDb,
     collection: "workflows",
     filter: { _id: workflow._id, "updated.timestamp": loadedState.workflow.updated.timestamp },
     update: { $set: plannedWorkflowDoc }, // whole doc minus _id (Q1)
     session, // undefined on the standalone fallback path
   });
   ```
   This is the **claim step**: a `null` return (filter matched zero docs → concurrent submit moved the workflow between load and commit) → **throw `ConcurrentSubmitError` before any action write**. Pin the **timestamp scalar**, not the whole `updated` sub-document (order/shape-independent compare).

   Step 1 branches on `plan.workflow.operation` (D3): `"update"` (Submit/Cancel/Close/tracker — the default) → the CAS `findOneAndUpdateDoc` above; `"insert"` (StartWorkflow, task 17 — there is no loaded workflow and no timestamp to pin) → `insertOneDoc` with **no CAS filter** — a freshly minted `_id` can't race, there is nothing to claim. Steps 2–5 are identical in both modes, and the transaction still wraps steps 1–2 for both.
2. **Actions** — `bulkWriteActions` with all inserts + updates from `plan.actions` (whole-doc `$set` minus `_id` per op).
3. **Events** — the single per-invocation dispatch of `plan.event` (D3 — exactly one per invocation): `context.callApi({ id: "new-event", module: "events" }, { _id: event_id, display, references, type, metadata }, { user: context.user })` — the real three-argument shape; both existing call sites pass the `{ user }` third argument (`dispatchLogEvent.js:107–111`). **`callApi` does not throw** — it returns `{ success, error }`; the success-check-and-throw lives in `dispatchLogEvent.js:113–121` today, which task 15 deletes, so `commitPlan` must reproduce the check — a `!result.success` return is a step-3 failure, recorded per the failure policy below (not thrown) — or event failures pass silently. **Outside the transaction; community-plugin client** (it can't join the engine session — D8/D9).
4. **Notifications** — `dispatchNotifications(context, event_id)` → `context.callApi({ id: "send-notification", module: "notifications" }, { event_ids: [event_id] }, { user: context.user })`, one call carrying the `_id` of the event written in step 3. **The engine builds no notification doc and inserts nothing.** This is the surviving `dispatchNotifications.js` helper, **unchanged**: its `(context, eventId)` signature already wraps the id into the batch-shaped `event_ids` wire field (the notifications endpoint's existing contract — the field stays plural on the wire even though the engine always sends exactly one). The dispatch mechanic is unchanged: the notifications module's `send-notification` endpoint runs the app's `send_routine`, which re-fetches each event doc and owns fan-out + any notification-doc write — nothing in the repo produces a `NotificationDoc`, so composing one would be speculative surface. Must run after step 3 (the routine reads the committed event). Outside the transaction; community-plugin client. Silent no-op when no `send_routine` is wired.
5. **Change-log** — `insertManyDocs` (single call) of all `plan.changeLog` entries into `collection: context.connection.changeLog.collection` (D7's opt-in config). **Skip the step when `plan.changeLog` is empty** (the unconfigured case — task 12 emits an empty array; don't rely on the helper's empty-batch no-op to dodge the `undefined` collection name). **Last step, outside the txn** so any earlier failure prevents an audit entry claiming a write that didn't happen.

**Transaction path (D11):** the topology branch covers **steps 1–2 only**; steps 3–5 run once, after it, shared by both paths:

```js
async function commitPlan(context, plan) {
  if (context.useTransactions) {
    const session = context.mongoClient.startSession();
    try {
      // steps 1–2 only — the txn body must contain nothing else: withTransaction
      // re-runs its whole callback on transient errors, and a retried step 3/4/5
      // would double-fire events/notifications/change-log (their writes are on
      // other clients / outside the txn, so our abort doesn't roll them back).
      await session.withTransaction(() => commitWorkflowAndActions(context, plan, session));
    } finally {
      await session.endSession();
    }
  } else {
    await commitWorkflowAndActions(context, plan); // standalone fallback: D9 ordered writes, CAS-gated
  }
  // steps 3–5 — once, both paths, never inside the driver's retry loop.
  // Each is caught + recorded on CommitResult.dispatchErrors (step 4 skipped when
  // step 3 failed) — the handler throws post_commit_dispatch_failed after the
  // cascade + post-hook (failure policy below / task 15).
  const event_id = await dispatchEvent(context, plan);     // step 3
  await dispatchNotifications(context, event_id);          // step 4
  await writeChangeLog(context, plan);                     // step 5
  return buildCommitResult(plan);
}
```

**Failure policy.** Steps 1–2 throw — they are the atomicity gate; nothing downstream may run. Steps 3–5 **never throw out of `commitPlan`**: each step is caught individually and recorded as `{ step, error }` on `CommitResult.dispatchErrors[]`. Rationale: by step 3 the workflow + actions are durably committed, and a propagated throw would strand `plan.trackerFires` (a committed child completion that never mirrors to its parent — unrecoverable, since a retry CAS-misses against the advanced state) and skip the post-hook. Step 4 is **skipped** when step 3 recorded a failure (no committed event id to dispatch); step 5 **always runs** (its entries audit the steps-1–2 writes, which did commit). The failures still surface — through Lowdefy's own error reporting, not a side log: after the tracker cascade and post-hook complete, the **handler** (task 15) throws `WorkflowEngineError` with `code: "post_commit_dispatch_failed"` if any `dispatchErrors` were recorded. This is a deliberate behaviour change from today's `dispatchLogEvent.js` / `dispatchNotifications.js`, which throw immediately and abort the cascade + post-hook.

- `commitWorkflowAndActions(context, plan, session?)` is the single steps-1–2 body (workflow claim/insert + bulk action writes) shared by both topology paths; `CommitResult` is composed in exactly one place.
- On a replica set, **steps 1–2 run inside one transaction** (workflow + actions atomic). Steps 3–5 always run outside it — structurally, not just by convention.
- `context.useTransactions` is set by topology detection at connection init (task 1).
- A CAS miss inside the transaction surfaces as a null `findOneAndUpdate` → throw `ConcurrentSubmitError` → clean abort. (`withTransaction` auto-retries transient errors, but the retry re-issues the same planned writes; the now-stale CAS filter misses → null → clean throw rather than committing stale writes.)

**Define `ConcurrentSubmitError`** — `extends WorkflowEngineError` (`shared/errors.js`, created by task 9 per D13's engine error model) with `code: "concurrent_submit"`. It keeps a named class because callers catch it by name as the retryable case. The engine does **not** auto-retry (each retry re-runs the pre-hook, which may be non-idempotent — caller's policy decides). Scope note: the CAS miss throws this for **every** handler's `update` commit — Cancel, Close, and each tracker cascade level claim the workflow the same way — so despite the name it is "the concurrent-workflow-write retryable case", not Submit-specific; a Cancel/Close/tracker caller catches it too.

**Output:** `CommitResult` — `{ workflow_id, action_ids, event_id, dispatchErrors }`: the doc IDs written, `event_id` **singular** (one event per invocation — D3 `Plan.event`; matches the handler's existing `event_id` return surface, no unwrap mapping), `dispatchErrors[]` empty on a clean commit (failure policy above).

## Acceptance Criteria

- Workflow is claimed first; a CAS miss throws `ConcurrentSubmitError` **before any action write** (verify: zero action writes on a miss).
- The CAS filter pins `updated.timestamp` (scalar), not the whole `updated` object.
- Post-commit, `workflow.updated.timestamp` differs from `loadedState.workflow.updated.timestamp` — the planned doc carries the fresh per-invocation stamp (task 11), so every commit advances the stored timestamp; the concurrent-submit test depends on this (D15).
- `plan.workflow.operation: "insert"` commits the workflow via `insertOneDoc` with no CAS filter (Start's path); steps 2–5 and the transaction wrapping of steps 1–2 behave identically to the update mode.
- On a replica set, steps 1–2 are atomic (a forced step-2 failure rolls back step 1); steps 3–5 are outside.
- Events/notifications/change-log execute **after** the transaction commits (assert call ordering with a spy), so a transient retry of steps 1–2 can never re-fire them.
- Failure policy: a forced step-4 or step-5 failure does **not** throw out of `commitPlan` — the `CommitResult` returns with the failure recorded on `dispatchErrors[]`; a forced step-3 failure additionally skips step 4 (step 5 still runs). (The end-of-handler `post_commit_dispatch_failed` throw is task 15's criterion.)
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
- Empty plans never reach `commitPlan` — callers short-circuit (D3; the one real producer is a no-op tracker level, task 16). `commitPlan` executes whatever it's given, logic-free; the helpers' empty-batch no-ops are a backstop, not the mechanism.
- The task-1 helpers are **already implemented** (Band 1 done) with an options-object API: `findOneAndUpdateDoc` / `bulkWriteActions` / `insertManyDocs` all take `({ mongoDb, collection, …, session })` — `mongoDb` is part of the options object, not a positional first argument. Match the landed signatures.
- The denormalised summary/groups on the planned workflow come from the same Plan as the action states, so writing workflow-before-actions is internally consistent.
- Threading the engine session into callApi'd subroutines (so events/notifications join the txn) is an explicit Non-goal — do not attempt it here.
