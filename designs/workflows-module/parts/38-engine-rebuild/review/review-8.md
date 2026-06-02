# Review 8 — Task 13 (commit phase) contract completeness

Scope: `tasks/13-commit-phase.md`, focused on the `commitPlan` contract and its
consistency with the design (D3, D9, D11, D15), the tasks it consumes (task 1
mongo helpers — **already implemented**, Band 1 done; task 9 types; task 12
planners) and the tasks that consume it (task 15 Submit, task 16 tracker, task 17
Start/Cancel/Close), and the code it replaces (`dispatchLogEvent.js`,
`dispatchNotifications.js`, `handleSubmit.js`, `recomputeWorkflowAfterActionWrite.js`).
Same class as reviews 5–7's per-task contract passes.

What's correct and grounded: workflow-first ordering + the "zero action writes on
a CAS miss" invariant match D9/review-1 #1; the scalar `updated.timestamp` pin
matches D15/review-1 #5; `ConcurrentSubmitError extends WorkflowEngineError`
(`code: "concurrent_submit"`) matches the D13 error model as consistency-8 #2
left it; the no-auto-retry stance and its pre-hook-idempotency rationale match
D15; the test list covers both topology paths. The implemented task-1 helpers
already return `null` on a zero-match filter and no-op on empty batches, exactly
as the CAS gate and the opt-out change-log path need.

## Correctness

### 1. Nobody stamps the planned workflow doc's fresh `updated` — the CAS gate silently degrades

> **Resolved (auto).** Task 11: `planWorkflowRecompute` stamps `updated: now` on the planned doc (never carries the loaded `updated` through), with an acceptance criterion asserting the planned stamp differs from the loaded one. No separate user threading needed — `now` is already the full `{ timestamp, user }` change stamp (task 15 mints it mirroring `context.changeStamp`); task 10's wording clarified to say so. Task 10: `now` is written to `updated` on **both** insert and update ops (preserving `updateAction.js:67`). Task 13: acceptance criterion added that post-commit `updated.timestamp` differs from the loaded timestamp.

D15's mechanic assumes **every commit advances the stored `updated.timestamp`**
("the first commit advances the stored timestamp, so the second's filter then
misses"). Today that stamp is written by
`recomputeWorkflowAfterActionWrite.js:102` (`updated: context.changeStamp`). In
the rebuild, no task owns it:

- Task 11's `planWorkflowRecompute` composes the whole planned workflow doc
  (groups, summary, completed push, form_data) but never mentions `updated`; its
  input list carries no `now`/user.
- Task 10 stamps `created`/`updated` only on action **inserts** (line 29).
- Task 13's commit writes the plan verbatim — "No reads. No renders. No logic
  that wasn't in the plan."

If the planned doc carries the *loaded* `updated` through, commit writes the old
timestamp back. A concurrent submit B that loaded the same state then CAS-matches
*after* A committed — filter pins the old timestamp, the stored value is still
the old timestamp — and **both submits win**. The whole-doc `$set` makes this a
silent lost update: no error, and no test fails unless a test asserts the stamp
advanced. The task-13 acceptance tests ("concurrent submit — one wins, one
throws") would only pass if the implementer happens to stamp the doc; nothing in
the contracts tells them to.

**Fix.** Add the stamp to task 11's `planWorkflowRecompute` contract: the planned
workflow doc carries `updated: { timestamp: now, user }` from the per-invocation
mint (task 15 already threads `now`; add the user). Add a task-13 acceptance
criterion: post-commit `workflow.updated.timestamp` differs from
`loadedState.workflow.updated.timestamp` (the concurrent-submit test depends on
it). While there, confirm task 10's *update* path also stamps the action doc's
`updated` (today's `updateAction.js:67` does; task 10 only lists it for inserts)
— not CAS-relevant, but a behaviour-preservation drop of the same kind.

### 2. `commitPlan` has no workflow-insert mode — StartWorkflow can't commit through it

> **Resolved.** Added `operation: "insert" | "update"` to `Plan.workflow` (D3 + task 9), mirroring `Plan.actions[]`. Task 13 step 1 branches: `update` (default — Submit/Cancel/Close/tracker) → CAS `findOneAndUpdateDoc`; `insert` (Start) → `insertOneDoc`, no CAS filter (fresh `_id` can't race). Steps 2–5 and the txn wrapping of steps 1–2 identical in both modes; acceptance criterion added. Scope sentence added to the `ConcurrentSubmitError` definition: it's the concurrent-workflow-write retryable case for every update commit, not Submit-specific. Task 17's Start section now names the mechanism. Kept one function over two: the modes differ in exactly one write; the transaction/ordering/failure skeleton is shared, and splitting it would duplicate the seam D11 exists to protect.

Task 17's Start plans "workflow doc + initial action docs" and then runs
"Commit"; D11 states "`commitPlan` is the only function that touches multiple
collections"; design.md:504 says Start/Cancel/Close "use the same helpers." But
task 13's step 1 is hardwired to `findOneAndUpdateDoc` carrying a CAS filter on
`loadedState.workflow.updated.timestamp` — for Start there **is no loaded
workflow and no timestamp to pin**; the planned workflow doc is an insert. And
D3's `Plan.workflow` is `{ doc, changeLog }` with no `operation` discriminator
(only `Plan.actions[]` has one), so the Plan can't even express the difference.

As written, an implementer either bolts a hand-rolled commit into task 17
(violating the D11 seam and "one correct way") or guesses an insert mode into
`commitPlan` that no contract describes.

**Fix.** Add `operation: "insert" | "update"` to `Plan.workflow` (D3 + task 9),
defaulting to `update`. Commit step 1 branches: `update` → the CAS
`findOneAndUpdateDoc` as specced; `insert` → `insertOneDoc` with no CAS filter (a
fresh `_id` can't race — there is nothing to claim). Steps 2–5 are unchanged;
the transaction still wraps steps 1–2 for both modes. One more sentence while
here: the CAS miss throws `ConcurrentSubmitError` for **every** handler's update
commit — Cancel, Close, and each tracker level claim the workflow the same way —
so the class name is "the concurrent-workflow-write retryable case," not
Submit-specific. (Acceptable name; just say it so a Cancel caller knows to catch
it.)

### 3. The transaction-path skeleton leaves steps 3–5 homeless — and invites double-fire on `withTransaction` retry

> **Resolved.** Restructured the skeleton in both task 13 and design.md D11 (the source task 13 copied from): the topology branch covers steps 1–2 only via a shared `commitWorkflowAndActions(context, plan, session?)`, steps 3–5 run once after the branch (never inside the driver's retry loop), `context` is threaded through both paths, and `CommitResult` is composed in one place. Acceptance criterion added: events/notifications/change-log execute after the transaction commits (spy-asserted call ordering).

The task's code shape is:

```js
if (!context.useTransactions) return commitWithoutTransaction(plan);
...
return await session.withTransaction(() => commitWithSession(plan, session));
```

Nothing runs after `withTransaction` — yet the prose says "Steps 3–5 always run
outside it." The symmetric naming (`commitWithoutTransaction(plan)` necessarily
runs all five steps) tells an implementer `commitWithSession` runs all five too —
**inside the transaction callback**. `withTransaction` re-runs the whole callback
on a `TransientTransactionError`: steps 1–2 roll back and retry cleanly, but a
retried callback would re-fire `callApi("new-event")` (a different client — its
write is *not* rolled back by our abort), re-dispatch notifications, and
double-insert change-log entries. The design's own retry note (task 13 line 42)
covers only the CAS behaviour under retry, not the side-effect steps.

Two smaller problems in the same snippet: `commitWithoutTransaction(plan)` drops
`context`, which steps need (`mongoDb`, `callApi`, `connection.changeLog.collection`,
`user`); and the early `return` shape means `CommitResult` would be composed in
two places.

**Fix.** Restructure the skeleton so the topology branch covers **steps 1–2
only**, and steps 3–5 run once, after it, shared by both paths:

```js
async function commitPlan(context, plan) {
  if (context.useTransactions) {
    const session = context.mongoClient.startSession();
    try {
      await session.withTransaction(() => commitWorkflowAndActions(context, plan, session));
    } finally {
      await session.endSession();
    }
  } else {
    await commitWorkflowAndActions(context, plan); // D9 ordered fallback, CAS-gated
  }
  // steps 3–5 — once, both paths, never inside the driver's retry loop
  const event_ids = await dispatchEvents(context, plan);      // step 3
  await dispatchNotifications(context, event_ids);            // step 4
  await writeChangeLog(context, plan);                        // step 5
  return buildCommitResult(plan);
}
```

Add an acceptance criterion: events/notifications/change-log execute **after**
the transaction commits (assert call ordering with a spy), so a transient retry
of steps 1–2 can never re-fire them.

## Contract gaps

### 4. Failure policy for steps 3–5 is unspecified — and it decides whether the tracker cascade and post-hook run

> **Resolved.** Adopted a defer-throw policy (a synthesis beyond the review's two options): steps 1–2 throw; steps 3–5 are caught per step and recorded on `CommitResult.dispatchErrors[]` (step 4 skipped when step 3 failed; step 5 always runs); the cascade and post-hook always run; then the **handler** throws `post_commit_dispatch_failed` (cause-chained, message states the commit succeeded) when any errors were recorded. Rationale: catch-and-continue would bury failures in a side log the engine doesn't have, while immediate throw strands `trackerFires` unrecoverably — defer-throw keeps the state work *and* surfaces the failure through Lowdefy's real error-reporting path. Deliberate behaviour change from today's throwing dispatch helpers, noted in task 13. Specced in task 13 (catch + record + criteria), task 15 (end-of-handler throw + criterion), task 16 (cascade collects per-level errors, never stops for them), design.md D9/D11/D13.

If step 3, 4, or 5 throws and `commitPlan` propagates, the handler aborts
**after** the workflow + actions committed: the caller gets an error for a submit
that actually happened, `runTrackerCascade` never runs (`plan.trackerFires` is
lost — a committed child completion that never mirrors to its parent), and the
post-hook is skipped. The design pulls in two directions: D11 says events and
notifications are "best-effort downstream dispatch," while today's helpers
**throw** on `!result.success` (`dispatchLogEvent.js:113–121`,
`dispatchNotifications.js:24–31`) and run before tracker fire
(`handleSubmit.js:334–345`), so today a notification failure does abort the
cascade. D9's partial-failure bullets describe resulting *states* ("flag in
monitoring", "log loudly") without saying throw-or-continue. Task 13 inherits the
ambiguity; an implementer must invent the policy.

**Fix.** Pin per-step semantics in the task (resolve now, per CLAUDE.md):

- Steps 1–2: throw — this is the atomicity gate; nothing downstream may run.
- Step 3 (events): **throw** (preserves today's behaviour; an invocation whose
  anchoring event doc is missing is a real failure worth surfacing, and step 4
  must not dispatch ids that don't exist).
- Step 4 (notifications) and step 5 (change-log): **catch, log loudly, continue**
  — D11's best-effort semantics; a notification or audit-entry failure should not
  fail a committed submit nor strand `trackerFires`. Note explicitly that step 4
  continuing is a deliberate behaviour change from today's throw.

If the user prefers preserving today's throw-everything behaviour instead, that's
defensible too — but write whichever policy is chosen into the task and its
acceptance criteria (e.g. "a forced step-5 failure still returns a CommitResult
and the cascade runs").

### 5. `callApi` mechanics: arity, success-check, and the `dispatchNotifications` signature change

> **Resolved (auto).** Task 13 step 3 now shows the real three-arg `context.callApi({ id, module }, payload, { user })` shape, states that `callApi` returns `{ success, error }` rather than throwing, and requires `commitPlan` to reproduce the deleted `dispatchLogEvent.js` success-check. Step 4 now states the `dispatchNotifications` signature update from `(context, eventId)` singular to the `(context, { event_ids })` batch (one call, no per-event fan-out), with JSDoc + test updates; the file added to the task's Files list. *(Batch-signature part later superseded by #9's singular-`Plan.event` resolution: the helper keeps `(context, eventId)` unchanged.)*

Three concrete mismatches against the code this step absorbs:

- The real signature is
  `context.callApi({ id: "new-event", module: "events" }, payload, { user: context.user })`
  (`dispatchLogEvent.js:107–111`) — not
  `callApi("new-event", { module: "events" }, payload)` as the task writes. Both
  existing call sites also pass the `{ user }` third argument; the task should
  show the real shape.
- `callApi` **does not throw** — it returns `{ success, error }`, and the
  success-check-and-throw lives in `dispatchLogEvent.js` today. Task 15 deletes
  that file ("dispatch part folded into commit phase"), so `commitPlan` step 3
  must reproduce the check or event failures pass silently. Say so.
- `dispatchNotifications.js` is `(context, eventId)` **singular**, wrapping
  `event_ids: [eventId]` internally. Task 13 calls it as
  `dispatchNotifications(context, { event_ids })`. The mechanic is unchanged but
  the signature isn't — state that the helper is updated to accept the batch
  (one `send-notification` call carrying all ids, per D9 "a single call"), with
  its JSDoc and `dispatchNotifications.test.js` updated, so an implementer
  doesn't loop it per event and fan out N calls.

### 6. Step 5 never names the change-log collection source, and the implemented helper's JSDoc is stale

> **Resolved (auto).** Task 13 step 5 now sources the collection from `context.connection.changeLog.collection` and skips the step when `plan.changeLog` is empty (explicitly not relying on the helper's empty-batch no-op to dodge the `undefined` collection name). The landed `insertManyDocs.js` JSDoc fixed directly — "and notifications" dropped, pointing at the D9 step-4 dispatch instead.

`insertManyDocs` needs `collection: context.connection.changeLog.collection`
(D7's opt-in config); task 13 just says "insertManyDocs (single call) of all
`plan.changeLog` entries." The unconfigured case works by a chain of accidents —
task 12 emits an empty `plan.changeLog`, and the implemented helper no-ops on
empty `docs` (`insertManyDocs.js:9–12`) before ever touching the `undefined`
collection name — but the task should state it: source the collection from
`connection.changeLog.collection`; skip step 5 when `plan.changeLog` is empty.

Drive-by for this task: the landed `insertManyDocs.js` doc comment still reads
"Used for change-log entries **and notifications** (design D7/D9)" — written
before the no-`NotificationDoc` decision. Fix the comment when touching the
commit phase (the design and task 1 text already say "not notifications").

## Minor

### 7. Snippets don't match the landed task-1 helper signatures

> **Resolved (auto).** Task 13's step-1 snippet rewritten to the landed options-object API (`findOneAndUpdateDoc({ mongoDb, collection, filter, update, session })`), and a Notes bullet added stating all three helpers take `({ mongoDb, collection, …, session })` with `mongoDb` in the options object, matching the implemented Band-1 code.

Band 1 is implemented, so the helper API is no longer hypothetical:
`findOneAndUpdateDoc({ mongoDb, collection, filter, update, session })` — one
options object including `mongoDb`, not `findOneAndUpdateDoc(workflows, { filter,
update })` as task 13's two snippets show; same shape for `bulkWriteActions` /
`insertManyDocs` (both take `{ mongoDb, collection, ... }`). Update the snippets
to the real API so the implementer prompt and the committed code agree.

### 8. The D3 empty-plan no-op has no home

> **Resolved.** Caller-short-circuit (the review's first option): a tracker level whose mirror signal FSM-no-ops returns an empty plan and the cascade loop skips `commitPlan` for that level entirely — no workflow write (no `updated` stamp advance, avoiding spurious CAS pressure on the parent after finding #1's fix), no mirror event, no change-log entries, no follow-on fires. Submit can never produce an empty plan (the user signal throws on an FSM no-op, D13), so the skip lives in one place: task 16, with an acceptance criterion. D3's sentence rewritten to name the owner and drop the "write just the stamp" case (it can't arise — no transitions means nothing else changed). Task 13 notes commit executes whatever it's given; the helpers' empty-batch no-ops are a backstop, not the mechanism.

D3: "commit on an empty Plan is a no-op write of just the workflow's `updated`
stamp if anything else changed, or a complete no-op if nothing changed." Commit
is barred from logic that isn't in the plan, so *something else* must decide
"nothing changed" — and no task says what. The live producer of empty plans is
the tracker level (task 16: a mirror signal that FSM-no-ops against the parent).
Pick one: the planner/handler short-circuits and never calls `commitPlan` when
the plan carries no action ops, no workflow change, and no events (cleanest —
commit stays logic-free and the implemented helpers' empty-batch no-ops cover
stragglers), or `commitPlan` documents that it executes whatever it's given and
callers own the skip. Also state whether a no-op tracker level still emits its
mirror event + change-log entry (presumably not — nothing changed).

### 9. `CommitResult` shape: singular vs plural `event_id`

> **Resolved.** Pinned **singular end-to-end** — further than the review's plural suggestion, for a reason the finding surfaced on interrogation: the id model *forbids* a second event per Plan (the event doc's `_id` IS the per-invocation `event_id`, so two entries would collide), making the `Plan.events[]` array unusable headroom — speculative surface. Now: `Plan.event: { doc }` (D3 + task 9), `CommitResult = { workflow_id, action_ids, event_id, dispatchErrors }` (task 13 + flow diagram), commit step 3 is a single dispatch, and the handler's existing singular `event_id` return needs no mapping (the live YAML consumers — cancel/close API routines, demo post-hook — stay untouched). The one plural that remains is the `send-notification` wire field `event_ids: [event_id]` — the notifications endpoint's existing contract. Supersedes part of #5's resolution: `dispatchNotifications.js` keeps its `(context, eventId)` signature unchanged; no batch update.

Task 13's output line says `CommitResult` carries "`action_ids`, `event_ids`, …"
while the design's worked example returns `{ action_ids: [...], event_id: e1, ... }`
(design.md:743, singular — one invocation mints one event). Pin the shape once —
e.g. `{ workflow_id, action_ids, event_ids }` with `event_ids` an array that
currently always has length ≤ 1 (`plan.events` is an array, so plural matches the
Plan) — and align the worked-example return and task 15's handler-return wording
with it.

## Summary

Findings 1–3 are blockers in the same sense as review-5 #1: the contracts as
written produce a broken CAS (1), a Start handler with no commit path (2), and a
transaction body that double-fires side effects on driver retry (3) — each
invisible until integration. Finding 4 is a real open policy the task forces the
implementer to invent. Findings 5–7 are mismatches against code that already
exists (the deleted dispatch helpers and the landed Band-1 helpers); 8–9 are
clarifications.
