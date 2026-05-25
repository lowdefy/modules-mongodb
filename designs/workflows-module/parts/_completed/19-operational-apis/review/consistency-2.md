# Consistency Review 2

## Summary

Scanned part 19's full file tree (design, two reviews, seven task files, tasks.md index) after the first task pass. Found three drifts — all caused by parts 8 and 10 having shipped between when the design was written and now, leaving the "v1 ship contract" wording stale. Auto-resolved all three.

## Files Reviewed

- **Design:** [`design.md`](../design.md)
- **Reviews:** [`review-1.md`](designs/workflows-module/parts/_completed/19-operational-apis/review/review-1.md), [`consistency-1.md`](designs/workflows-module/parts/_completed/19-operational-apis/review/consistency-1.md)
- **Tasks:** [`tasks/tasks.md`](../tasks/tasks.md), [`01-cancel-workflow-api.md`](../tasks/01-cancel-workflow-api.md), [`02-start-workflow-api.md`](../tasks/02-start-workflow-api.md), [`03-close-workflow-api.md`](../tasks/03-close-workflow-api.md), [`04-access-filter-stage.md`](../tasks/04-access-filter-stage.md), [`05-get-entity-workflows-api.md`](../tasks/05-get-entity-workflows-api.md), [`06-get-workflow-overview-api.md`](../tasks/06-get-workflow-overview-api.md), [`07-register-apis-in-manifest.md`](../tasks/07-register-apis-in-manifest.md)
- **Cross-references checked:** shipped `CancelWorkflow.js`, `SubmitWorkflowAction/handleSubmit.js`; `_completed/{08-side-effect-dispatch,10-tracker-subscription}/` design directories; part 20 design's `exports.api` list.

## Inconsistencies Found

### 1. `tracker_fired` ship contract stale — part 10 has landed

**Type:** Stale status note (Phase 3f)
**Source of truth:** The shipped [`CancelWorkflow.js:143`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) returns `tracker_fired: <array>` (the result of `fireTrackerSubscription`), not `null`. Part 10 archived under `_completed/10-tracker-subscription/` on May 20 2026.
**Files affected:**
- [`design.md:27`](../design.md) — said "`event_id` and `tracker_fired` are `null` until parts 8 and 10 light them up."
- [`design.md:37`](../design.md) — said "Same v1 ship contract — `event_id` and `tracker_fired` are `null` until parts 8 and 10 land."
- [`tasks/01-cancel-workflow-api.md:11, 76, 78`](../tasks/01-cancel-workflow-api.md) — three notes mirroring the design's stale wording.
- [`tasks/03-close-workflow-api.md:13`](../tasks/03-close-workflow-api.md) — same wording.

**Resolution:** Updated all four locations to reflect the current state:
- `tracker_fired` is the array from `fireTrackerSubscription` (`[]` when the workflow has no `parent_action_id`).
- `event_id` is **still** `null` on the cancel and close paths — part 8 lit it up for `SubmitWorkflowAction` only, not for cancel/close. The follow-up posture is now "an event-log backfill is a separate follow-up against part 5's shipped behavior" rather than "blocked on part 8."

### 2. Stale link path for part 10

**Type:** Stale reference (Phase 3e)
**Source of truth:** Part 10 lives at `_completed/10-tracker-subscription/`, not `10-tracker-subscription/`.
**Files affected:** [`design.md:27`](../design.md) linked to `../10-tracker-subscription/design.md` instead of `../_completed/10-tracker-subscription/design.md`.

**Resolution:** Fixed inline as part of #1's rewrite. New links point at `../_completed/10-tracker-subscription/design.md` in the design and `../../_completed/10-tracker-subscription/design.md` from the task files (one level deeper).

### 3. Task notes treated `event_id` as a pending-from-part-8 deliverable

**Type:** Stale dependency note (Phase 3f) — adjacent to #1.
**Source of truth:** [`SubmitWorkflowAction/handleSubmit.js:369`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) returns a real `event_id` (string). [`CancelWorkflow.js:143`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) still returns `event_id: null`. So part 8 lit up `event_id` on the submit path but not cancel/close — there is no pending "part 8 fixes this" for the operational APIs; the contract is settled and a backfill is a separate follow-up.
**Files affected:** [`tasks/01-cancel-workflow-api.md:76`](../tasks/01-cancel-workflow-api.md) — said "Part 8 lights up `event_id`; part 10 replaces `tracker_fired`..."

**Resolution:** Folded into #1's rewrite. The task note now says "an event-log backfill onto cancel (would flip `event_id` to a real id) is a follow-up against part 5's shipped behavior, not blocked on this task." This matches what's actually going to happen: part 8 isn't going to re-open and add event-logging to cancel/close; a future ticket will.

## No Issues

- **`tracker_fired` shape (array, newest at index 0) is not specified in the design or tasks** beyond "the array from `fireTrackerSubscription`" — that's intentional and inherited from part 10's design, which owns the shape commitment. Not part 19's concern.
- **Access filter logic in task 4** matches review-1 #2 (verb-union) and #3 (empty/missing roles). The `_user: { _module.var: user_schema.roles_path }` operator threading matches #4. Verified by re-reading task 4's `$match` body.
- **Keyed-action multiplication** (review-1 #5) propagates correctly: tasks 5 and 6 both say "each action doc surfaces as its own entry in `actions[]`, with `key` populated" in their acceptance criteria.
- **`display_order` provenance** (review-1 #6) carried into task 5's acceptance criteria.
- **`action_ids` ordering** (review-1 #8) carried into task 2's acceptance criteria and notes.
- **Read-path-as-routines commitment** (review-1 #9) carried into the tasks.md ordering rationale and the design's "Read path: Lowdefy routines" section.
- **`{ workflow: null, actions: [] }` short-circuit** (review-1 #10) carried into task 6's acceptance criteria.
- **`close-workflow` everywhere** (review-1 #12, #13) carried; no remaining holes.
- **"User-initiated"** (review-1 #14) carried — no "author-initiated" wording remains in part 19's tree.
- **References pass-through** (review-1 #7) carried into the design and tasks 1, 2, 3 references the `RESERVED_WORKFLOW_KEYS` defense.
- **Tasks 02, 04, 05, 07** had no stale claims tied to the parts-8/10 ship state — they were already correct.
- **`pnpm ldf:b` claim** in task 7 self-corrects on the next line ("Until part 20 wires the workflows module into `apps/demo/modules.yaml`, the build doesn't import the module; this task verifies only that the manifest is syntactically valid"). Not stale.

## Out of scope — flagged for separate consistency reviews

- **Part 23's design** still says "Returns `{ action_ids, event_id: null, tracker_fired: null }`" ([line 36](../../23-close-workflow-handler/design.md)) while committing to call `fireTrackerSubscription` ([line 35](../../23-close-workflow-handler/design.md)) — internal contradiction in part 23 from the same parts-8/10 ship event. Belongs to part 23's own consistency review, not part 19's scope.
