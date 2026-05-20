# Task 3: Wire `fireTrackerSubscription` into `handleSubmit` step 10

## Context

Step 10 of the submit-pipeline lifecycle is currently a TODO comment in [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):

```js
// Step 10 — Tracker subscription. → part 10.
```

It sits between step 9 (group `on_complete` fan-out, owned by [part 11](../../11-group-on-complete-fanout/design.md)) and step 11 (post-hook, owned by part 9). The success-path return at the bottom of the file currently hard-codes `tracker_fired: null`. The error-path early return inside the outer `catch` block keeps `tracker_fired: null` — no subscription on the error path; that stays.

This task replaces the TODO marker with a live call to `fireTrackerSubscription` (task 2) and threads the result into the success-path return value.

The subscription only fires when the workflow's lifecycle stage actually transitioned in this call. The signal is `recomputeResult.shouldPushCompleted` (returned by the helper from task 1) — when it's `true`, step 5's bundled `$set` included a `completed` `$push` on the workflow doc, and the tracker should mirror that change to the parent action. When it's `false`, no workflow-status change happened, so no fire.

## Task

### 1. Add the import.

At the top of [handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):

```js
import fireTrackerSubscription from "./fireTrackerSubscription.js";
```

### 2. Replace the step 10 TODO with the subscription call.

Currently (after part 8's step 7/8 wiring, after [part 11](../../11-group-on-complete-fanout/design.md) lands step 9):

```js
// Step 10 — Tracker subscription. → part 10.
```

Becomes:

```js
// Step 10 — Tracker subscription.
let trackerFired = [];
if (recomputeResult.shouldPushCompleted) {
  trackerFired = await fireTrackerSubscription(context, {
    workflowId: context.workflow._id,
    newStage: "completed",
    depth: 0,
  });
}
```

Notes:
- The guard `if (recomputeResult.shouldPushCompleted)` mirrors the design's "If no workflow-status push happened in this call, no-op" — only fire when step 5's bundled `$set` actually wrote the `completed` `$push`.
- `recomputeResult` is in scope here from task 1's refactor (the `await recomputeWorkflowAfterActionWrite(...)` call earlier in `handleSubmit`).
- The default `trackerFired = []` reads consistently with the helper's "no fire" return.
- Don't wrap in `try/catch` here. The subscription throwing (depth-limit overflow, Mongo error in the parent write) should propagate out of `handleSubmit`'s success path and surface to the caller — same posture as steps 7 and 8 which let their dispatchers' errors bubble.

### 3. Replace the success-path `tracker_fired: null` literal.

The success-path return at the bottom of `handleSubmit`:

```js
return {
  action_ids: actionIds,
  completed_groups: completedGroups,
  event_id: eventId,
  tracker_fired: null,     // <-- replace this
  pre_hook_response: null,
  post_hook_response: null,
};
```

Becomes:

```js
return {
  action_ids: actionIds,
  completed_groups: completedGroups,
  event_id: eventId,
  tracker_fired: trackerFired,
  pre_hook_response: null,
  post_hook_response: null,
};
```

### 4. Leave the error-path return alone.

The error-path partial return inside the outer `catch` block still returns `tracker_fired: null` — that's correct. The subscription doesn't fire on the error path (mid-write failure pushes an `error` transition onto the action and short-circuits before reaching step 10).

## Acceptance Criteria

- `handleSubmit.js` imports `fireTrackerSubscription` from `./fireTrackerSubscription.js`.
- The step 10 TODO comment is replaced with the guarded call to `fireTrackerSubscription`.
- The success-path return reads `tracker_fired: trackerFired` (a local populated by the call, defaulting to `[]`).
- The error-path return keeps `tracker_fired: null` literally.
- **Behaviour guard:** with `recomputeResult.shouldPushCompleted === false`, `fireTrackerSubscription` is NOT called and `trackerFired` stays `[]`.
- Test coverage in `handleSubmit.test.js`:
  - Submit that does NOT auto-complete the workflow → `tracker_fired` is `[]` on the return; no calls to `fireTrackerSubscription` (spy/mock the import, or assert no writes to the parent tracker action's collection).
  - Submit that auto-completes a workflow with `parent_action_id: null` → `tracker_fired` is `[]` (the subscription itself returns `[]`); the workflow's `status[0].stage` is `completed`.
  - Submit that auto-completes a workflow with a valid `parent_action_id` → `tracker_fired` is a non-empty array; the parent action's status was force-pushed to `done`.
  - Error-path retains `tracker_fired: null` and does not call the subscription.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — add import, replace step 10 TODO with subscription call, replace success-path `tracker_fired: null` literal.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the four test cases above; update any case that asserted on `tracker_fired === null` for an auto-complete-with-parent scenario.

## Notes

- The decision to use `recomputeResult.shouldPushCompleted` rather than re-reading the workflow doc is deliberate: the helper already computed it from in-memory state, and re-reading would add an unnecessary Mongo round-trip. The signal is authoritative because it gates whether step 5's `$set` included the `$push` — same predicate, same source of truth.
- **Why fire after step 9 (group fan-out) and not earlier?** Per [part 11 design.md:26](../../11-group-on-complete-fanout/design.md): step 9 (group `on_complete` fan-out) may make in-process writes through `context.callApi`. The tracker fire runs after, so the parent workflow's recompute can read any state the group hooks might have touched on the parent (via cross-workflow updates from the hook). The current ordering also keeps `tracker_fired` populated in the return shape after the `event_id` field is finalised by step 7.
- **Recursion happens inside `fireTrackerSubscription`** — `handleSubmit` calls the subscription once and gets back the whole chain. No loop or per-level call lives in `handleSubmit`.
