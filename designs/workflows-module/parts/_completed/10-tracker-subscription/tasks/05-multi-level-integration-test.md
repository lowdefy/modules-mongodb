# Task 5: Multi-level integration coverage

## Context

Tasks 1–4 land the tracker subscription. The single-level happy path is covered in `fireTrackerSubscription.test.js` (task 2), `handleSubmit.test.js` (task 3), and `CancelWorkflow.test.js` (task 4). What's left is the multi-level integration coverage the design's "Verification" section calls out — exercising the recursion path through a real chain of three workflows and the depth-limit overflow.

These tests live alongside `fireTrackerSubscription.js` because the recursion logic is the helper's responsibility, but they exercise the full path through `handleSubmit` (or `CancelWorkflow`) → `fireTrackerSubscription` → `recomputeWorkflowAfterActionWrite` → `updateAction` to assert end-to-end behaviour. They use `inMemoryMongo` and seed a fixture of workflows and actions directly.

The 3-level chain below **subsumes the design's "worked-example 2-level integration test"** (design.md Verification, "completing the child `device-installation` workflow flips the parent's `track-installation` to `done`"). The 3-level fixture covers every assertion the 2-level worked example would — child auto-complete pushes parent tracker to `done` in one server-side call — plus the additional grandparent level needed to exercise the recursion mechanics. No separate 2-level test required; one fixture, both bullets.

## Task

### 1. Add the integration tests to `fireTrackerSubscription.test.js` (created in task 2).

Add two new `describe` blocks at the bottom of the file: one for the 3-level chain, one for the depth-limit overflow. Both use `inMemoryMongo` to spin up a fresh Mongo, seed the fixture via the dispatcher's `MongoDBInsertOne` / `MongoDBInsertMany`, then drive the chain by invoking `handleSubmit` directly (importing the orchestrator from `./handleSubmit.js`).

### 2. 3-level chain — cache invariant under recursion.

```js
describe("3-level chain integration", () => {
  // Setup:
  //   Workflow A (grandparent) on entity X. 2 actions:
  //     - qualify (form, in-review)
  //     - track-B (tracker, in-progress, child_workflow_id: B._id, ...)
  //   Workflow B (parent) on entity Y, parent_action_id: track-B._id. 1 action:
  //     - track-C (tracker, in-progress, child_workflow_id: C._id, ...)
  //   Workflow C (child) on entity Z, parent_action_id: track-C._id. 1 action:
  //     - install (form, in-review)
  //
  // Action: submit install with interaction submit_edit → install becomes done.
  // Chain: install done → C auto-completes → fires track-C done → B has only
  //   the tracker action which is now done → B auto-completes → fires track-B
  //   done → A still has the in-review `qualify` action → A does NOT auto-
  //   complete; chain stops there.

  it("propagates two levels and assembles tracker_fired as a chain", async () => {
    // Assert handleSubmit returns:
    //   action_ids includes install._id
    //   tracker_fired is an array of length 2:
    //     [0] = { parent_action_id: track-C._id, parent_workflow_id: B._id, new_status: 'done' }
    //     [1] = { parent_action_id: track-B._id, parent_workflow_id: A._id, new_status: 'done' }
    //   (newest at index 0 per the helper contract)
  });

  it("writes consistent per-workflow summary and groups[] at each level", async () => {
    // After the call:
    //   - install is `done` on workflow C; C.status[0] = completed; C.summary = { done: 1, not_required: 0, total: 1 }
    //   - track-C is `done` on workflow B; B.status[0] = completed; B.summary = { done: 1, not_required: 0, total: 1 }
    //   - track-B is `done` on workflow A; A.status[0] = active (NOT completed);
    //     A.summary = { done: 1, not_required: 0, total: 2 } (qualify still in-review)
    //
    // This is the cache-invariant assertion: each level's persisted summary and
    // groups reflect that level's own action list, not a stale cache from an
    // outer-scope workflow. An implementer who threaded the child's
    // context.workflow / context.workflowActions into recomputeWorkflowAfterActionWrite
    // would write the child's counts onto the parent — this assertion catches that.
  });

  it("threads the originating eventId through every level", async () => {
    // The handleSubmit call generates eventId E1 on entry. Assert:
    //   - install's just-pushed status entry has event_id: E1
    //   - C's just-pushed `completed` workflow status entry has event_id: E1
    //   - track-C's just-pushed status entry has event_id: E1
    //   - B's just-pushed `completed` workflow status entry has event_id: E1
    //   - track-B's just-pushed status entry has event_id: E1
    // Every write in this invocation rides the same eventId. No fresh ids generated
    // by the recursion.
  });
});
```

### 3. Depth-limit overflow.

```js
describe("depth-limit overflow", () => {
  it("throws a structured error past 10 levels", async () => {
    // Construct a synthetic 11-level chain: 11 workflows W_0 ... W_10, each
    // with a single tracker action linked to the next, except W_10's tracker
    // links back to some sink (or use a non-recursive fixture that exhausts
    // MAX_DEPTH via legitimate-looking linking).
    //
    // Submit on the leaf workflow's action so the chain auto-completes upward.
    //
    // Assert:
    //   - the call rejects (await expect(...).rejects.toThrow(/depth limit/))
    //   - the thrown error has err.step === 'tracker-subscription'
    //   - the error message mentions the MAX_DEPTH value (10)
    //   - writes up to and including level 10 landed; level 11 did NOT write
    //     (assert by reading the level-11 tracker action's status[0] — it
    //     should still be the pre-call value, not the recursion's target stage)
  });

  it("does not corrupt state on overflow — earlier writes persist", async () => {
    // Same fixture as above. After the throw, the workflows and actions written
    // in levels 0..10 should be in their post-write state (the throw happened
    // at level 11's depth check, after level 10's write committed).
    //
    // This documents the partial-write recovery story for the catch-all
    // reconciliation path mentioned in the design's risks.
  });
});
```

### 4. Cancel-path multi-level (optional, light coverage).

The cancel path also recurses. Add one case under a `describe('cancel-path recurse', () => { ... })` block:

```js
it("fans up not-required through a 2-level chain on cancel", async () => {
  // Setup:
  //   Workflow A (parent), 1 tracker action track-B (only action on A)
  //   Workflow B (child), parent_action_id: track-B._id, no other actions, in-review
  //
  // Action: invoke CancelWorkflow on B.
  //
  // Chain: cancel B → tracker fires `not-required` on track-B → A's recompute
  // runs → all A's actions are terminal (just track-B at not-required) → A
  // auto-completes → tracker fire recurses up (if A has a parent; in this
  // fixture A has no parent so the chain stops).
  //
  // Assert:
  //   - B.status[0] = cancelled
  //   - track-B.status[0] = not-required (fired from cancel)
  //   - A.status[0] = completed (auto-completed by the parent recompute)
  //   - A.summary = { done: 0, not_required: 1, total: 1 }
  //   - tracker_fired returned from CancelWorkflow has 1 entry (track-B's flip).
  //     If A had a parent, it'd have 2; here it stops at A because A has none.
});
```

Use the fixture liberally — the goal is end-to-end multi-level coverage, not exhaustive permutations. The unit-level cases in tasks 2/3/4 cover the per-level mechanics.

## Acceptance Criteria

- `fireTrackerSubscription.test.js` (file created in task 2) gains the new `describe` blocks above.
- All new tests pass with `inMemoryMongo`.
- The 3-level chain assertions verify the cache-invariant — each level's persisted state reflects that level's actions, not a stale cache.
- The eventId-threading test asserts the same id on every write in the invocation.
- The depth-limit overflow test asserts the structured error shape (`err.step`, message) and the partial-state-persists invariant.
- The cancel-path multi-level test (or equivalent) asserts both `tracker_fired` shape and the on-disk parent stage.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.test.js` — modify (created in task 2) — add the three `describe` blocks above.

## Notes

- **Why fold integration tests into the helper's test file?** The recursion logic and depth limit live in the helper; the multi-level chain is the helper's behaviour under realistic linkage. Keeping the multi-level cases colocated with the helper documents the invariant where the code lives. The cross-handler wiring tests (tasks 3 and 4) already cover the per-handler integration; this file covers the recursion itself.
- **Why not a separate `*.integration.test.js`?** Repo posture is colocated `*.test.js` only ([workflows-module design.md § Testing conventions](../../../design.md#testing-conventions)). Splitting into a separate file fights the convention without buying anything — the file is already organized into `describe` blocks for unit-level and integration-level.
- **End-to-end coverage** in [part 22](../../22-workflows-e2e-suite/design.md)'s Playwright suite will exercise the same chain through the full HTTP + page-render path. This task is the unit/integration level only — same posture as every other part.
- The fixture seeding (workflow + action docs with valid `parent_action_id` / `child_workflow_id` linking) is verbose but mechanical. Factor common setup into a `setupChain(levels)` helper at the top of the describe block if the duplication gets noisy.
- **Depth-limit fixture caveat:** constructing 11 levels with valid bidirectional linking is the truthful way to exercise the limit. If the fixture cost is excessive, an alternative is a unit-level test that mocks `recomputeWorkflowAfterActionWrite` to always return `shouldPushCompleted: true` and feeds a self-referential workflow chain. The mock-based variant lives in task 2's unit tests; this task uses the real fixture for the end-to-end assertion.
