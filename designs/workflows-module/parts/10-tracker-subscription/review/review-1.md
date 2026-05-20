# Review 1 — Part 10 Tracker subscription

Focus: contract drift against shipped code (part 6's `handleSubmit`, part 5's `CancelWorkflow`, part 7's auto-complete inlining, `shared/updateAction.js`), call-shape disagreement with the actual `updateAction` signature, and a small set of gaps that will trip implementation.

## Substantive issues

### 1. "Trigger sites" mis-describes part 6 — step 10 is the tracker step itself, not an action-transition step

> **Resolved.** Rewrote both "Trigger sites" bullets. `SubmitWorkflowAction` now names step 10 as the seam being lit up (between part 11's step 9 and the post-hook), references the bundled `$set` at [handleSubmit.js:288–309](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), and pins the no-fire-if-no-push invariant. `CancelWorkflow` now names the insertion point as "after [CancelWorkflow.js:118–127](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)'s final writeback, before the return" (folds finding 3).

[design.md:15](../design.md):

> `SubmitWorkflowAction` — after step 10 (currently no-op). When this submit transitioned the workflow stage (e.g. auto-complete from [part 7](../07-group-state-machine/design.md) pushed `completed`), fire.

Two problems:

- **Step 10 is the tracker step in the submit-pipeline numbering** that part 6 commits to ([06-submit-action-writes/design.md:65](../../06-submit-action-writes/design.md): "10. **Tracker subscription** — no-op, → part 10."). "Fire after step 10" reads like "fire after the tracker step" — which is a tautology if step 10 *is* the tracker subscription. The intended meaning is "step 10 currently no-ops; this part puts a body in it."
- The actual seam in shipped code is between step 5 (the bundled summary + groups + auto-complete `$set` at [handleSubmit.js:288–309](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) and step 11 (post-hook). Steps 7–11 are currently all no-ops; saying "after step 10" doesn't tell the implementer where in the file to wire the call.

**Fix.** Rewrite the bullet:

> `SubmitWorkflowAction` — light up the body of step 10 (currently a TODO comment between the step-9 group fan-out from [part 11](../11-group-on-complete-fanout/design.md) and step 11 post-hook). When step 5's bundled `$set` at [handleSubmit.js:288–309](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) included the `completed` `$push` (i.e. auto-complete fired), invoke the subscription with `newStage: 'completed'`. If no workflow-status push happened in this call, no-op.

### 2. The pseudo-code `updateAction(...)` call shape doesn't match the shipped signature

> **Resolved.** Step 4 of "Logic" now pins the per-action call shape verbatim: `updateAction(context, { actionId: tracker._id, newStage: targetStage, eventId, currentActionId: null, force: true })`, with an explicit note that the engine-spec pseudo-code's `actions: [...]` shape is the handler-level internal payload, not the helper's API. Engine-internal force-pushes call the per-action helper directly.

[engine/spec.md:280–286](../../../workflows-module-concept/engine/spec.md#tracker-subscription) (which the design defers to):

```js
await updateAction(context, {
  currentActionId: null,
  actions: [{ type: tracker.type, key: tracker.key, status: targetStage }],
  eventId,
  force: true,
});
```

But shipped `shared/updateAction.js` ([updateAction.js:36–46](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js)) takes a **per-action** payload:

```js
async function updateAction(context, {
  actionId,
  newStage,
  fields = {},
  eventId = null,
  currentActionId = null,
  force = false,
}) { ... }
```

There is no `actions: [...]` array shape. The pseudo-code is for the *handler-level internal payload* used inside `handleSubmit`'s step-4 loop, not `shared/updateAction.js`. Every existing caller (`StartWorkflow`'s parent-link push at [StartWorkflow.js:117–129](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js), `handleSubmit`'s per-entry loop at [handleSubmit.js:195–202](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) passes the per-action shape.

Part 10's design doesn't repeat the pseudo-code, but it does say at [design.md:34](../design.md): "Reuses `updateAction.js` from [part 6](../06-submit-action-writes/design.md) for the parent write." Without explicitly pinning the per-action call shape, an implementer reading the concept-spec pseudo-code will write a call that fails at runtime.

**Fix.** Add a one-line implementation note:

> The parent-tracker push uses the per-action shape of `shared/updateAction.js` ([updateAction.js:36–46](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js)): `updateAction(context, { actionId: tracker._id, newStage: targetStage, eventId, currentActionId: null, force: true })`. The concept spec's pseudo-code at [engine/spec.md § Tracker subscription](../../../workflows-module-concept/engine/spec.md#tracker-subscription) shows the handler-level `actions: [...]` shape, which is not the helper's API.

### 3. Step numbering for "tracker" inside `CancelWorkflow` — no such step exists

> **Resolved.** Folded into finding 1's rewrite — the second "Trigger sites" bullet now names "after the final summary + groups writeback at [CancelWorkflow.js:118–127](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js), before the return" as the insertion point. Drops the "no such step" framing.

[design.md:16](../design.md):

> `CancelWorkflow` — after the cancel push. Fires with the cancelled stage.

`CancelWorkflow` is not a numbered-lifecycle handler — the 11-step lifecycle is `SubmitWorkflowAction`-only ([06-submit-action-writes/design.md:48–67](../../06-submit-action-writes/design.md)). `CancelWorkflow`'s shipped flow is a flat sequence ([CancelWorkflow.js:53–127](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)):

1. Push `cancelled` to workflow `status[]` (lines 53–67).
2. Flip non-terminal actions to `not-required` (lines 69–94).
3. Re-read actions, recompute summary + groups, write both (lines 96–127).
4. Return `{ action_ids, event_id: null, tracker_fired: null }`.

The fan-up has to land somewhere in that sequence. Two options:

- **Between (1) and (2)** — fire before the action sweep, so the tracker reflects the parent-side `not-required` as quickly as possible.
- **After (3)** — fire as the last step, mirroring `SubmitWorkflowAction` where the tracker subscription comes after summary recompute.

Lean: **after (3)**, immediately before the return. Matches `SubmitWorkflowAction`'s ordering, and the action sweep is independent of the tracker write (the cancelled workflow's actions aren't read by the subscription — only its `parent_action_id` is, and that lives on the workflow doc).

**Fix.** Replace [design.md:16](../design.md) with:

> `CancelWorkflow` — after the final summary + groups writeback at [CancelWorkflow.js:118–127](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js), before the return. Fires with `newStage: 'cancelled'`. The handler's return shape grows a `tracker_fired` field (already present as `tracker_fired: null` at line 132) populated when the subscription wrote a parent.

### 4. "Re-firing the same stage is a no-op (priority rule)" — wrong guard

[design.md:53](../design.md):

> Re-firing the same stage is a no-op (priority rule).

The priority-rule guard does kick in for same-stage pushes on **non-self** entries (see [06-submit-action-writes/design.md:84–89](../../06-submit-action-writes/design.md): "priority(X) < priority(X) is false"), and the tracker push passes `currentActionId: null` so the self-exception doesn't apply. So in the no-force case, the priority rule would no-op.

**But the design itself says** at [design.md:34](../design.md):

> Reuses `updateAction.js` from [part 6](../06-submit-action-writes/design.md) for the parent write.

And the concept spec at [engine/spec.md:254](../../../workflows-module-concept/engine/spec.md#tracker-subscription):

> the tracker action is updated via an inner `updateAction` call with **`force: true`** (tracker writes bypass the priority rule).

`force: true` **bypasses** the priority rule (see [updateAction.js:47](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js): `if (force !== true) { ... priority check ... }`). So the priority-rule guard never runs on tracker writes — same-stage re-fires would write duplicate audit entries.

This is a real correctness gap. The concept spec's worked example ([engine/spec.md:344](../../../workflows-module-concept/engine/spec.md#worked-example-2-level-nested-auto-complete)) shows the **upstream** guard: the same-stage check on the *workflow's* status push (`B.status[0]='active' ≠ 'completed' → proceed`). That guard sits in `pushWorkflowStatus`, which gates whether the tracker subscription is even invoked. If the originating handler short-circuits the workflow push (no change ⇒ no fire), the subscription never runs.

But part 6's shipped `handleSubmit` doesn't call `pushWorkflowStatus` — it inlines the `completed` push into step 5's bundled `$set` (lines 288–309), with the guard reduced to "did `shouldPushCompleted` evaluate true." So the upstream guard is in place for `handleSubmit`'s auto-complete path; the issue is that part 10's verification bullet attributes idempotency to the wrong guard.

**Fix.** Replace [design.md:53](../design.md) with:

> Re-firing the same stage is a no-op because the upstream workflow-status guard prevents the subscription from running: `handleSubmit`'s auto-complete check ([handleSubmit.js:262–273](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) only emits the `completed` push when the workflow isn't already terminal, and `CancelWorkflow` is single-entry (the `cancelled` push is the workflow's transition into a terminal state and can't repeat). The tracker write itself uses `force: true` — the priority rule does **not** guard it.

(Also: add a verification entry that explicitly tests `handleSubmit`'s shipped same-stage guard in the auto-complete-then-retry path: a retry that no-ops the auto-complete push must not call `fireTrackerSubscription`.)

### 5. Same-stage idempotency on the parent tracker itself is unguarded

This is the gap finding 4 surfaces. The upstream guard prevents re-fire **of the originating handler**. But within a single call there is no guard on the tracker write itself: `force: true` bypasses the priority rule, and `updateAction` has no same-stage check of its own. So a tracker action already at `done` that gets pushed `done` again (e.g. a child workflow auto-completes inside a parent submit that's also auto-completing — the child push fires, the parent's auto-complete writes the parent action's `done`, the tracker write force-pushes `done` again) writes a duplicate audit entry.

In v1's scope this is mostly hypothetical — same-stage repeat tracker writes require a multi-source race that the synchronous-in-process posture rules out — but the design should pin it explicitly so the test matrix covers it:

**Fix.** Add to the "In scope > Logic" section:

> **Same-stage guard on the tracker action.** Before invoking `updateAction(...force: true)`, read `tracker.status?.[0]?.stage`. If it equals `targetStage`, no-op (don't write, don't surface `tracker_fired`). This restates the same-stage guard the action priority-rule would otherwise have provided — `force: true` bypasses it, so the subscription must check directly. Same posture as `pushWorkflowStatus`'s idempotency guard for workflow-status writes.

And update the verification bullet to test this guard directly (e.g. re-firing tracker on an already-`done` parent action no-ops without writing audit history).

### 6. `tracker_fired` shape — design says one field, but nested fan-up needs a list

> **Resolved (Option A).** Committed multi-level recurse. `tracker_fired` is now `Array<{ parent_action_id, parent_workflow_id, new_status }>` — empty when no fire, one entry per level (newest at index 0). Added a "Post-write recompute helper extraction" bullet to "Implementation": part 6's `handleSubmit` post-action-write sub-steps (4a/4b/4c/5) extract into `src/connections/shared/recomputeWorkflowAfterActionWrite.js` that both `handleSubmit` and `fireTrackerSubscription` invoke. Engine-internal writes do not re-enter the public `SubmitWorkflowAction` handler (per [engine/spec.md:307](../../../workflows-module-concept/engine/spec.md)). Added depth-limit guard (10 levels) per [engine spec § Open questions](../../../workflows-module-concept/engine/spec.md#open-questions-in-scope-deferred). Open question deleted; resolves the contradiction with [part 7 design.md:71](../../07-group-state-machine/design.md#auto-complete-check)'s auto-recursion reference.

[design.md:29](../design.md):

> Surface the fan-up on the originating submit response as `tracker_fired: { parent_action_id, parent_workflow_id, new_status }`.

[engine/spec.md § Worked example](../../../workflows-module-concept/engine/spec.md#worked-example-2-level-nested-auto-complete) demonstrates a 2-level auto-complete: child B completes → parent A's `track-installation` flips to `done` → A's auto-complete check runs (and finds A not all-terminal in the example, so no further fire). But imagine **A** also auto-completes (only one action, just terminated) — then A's parent (if any) gets a fire too. With nested workflows, one submit can produce N tracker fires.

The current `tracker_fired: { ... }` shape is a single object. A multi-level fan-up either:

- Overwrites the field with each fire (loses history), or
- Throws because the field is already populated.

[engine/spec.md:323](../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation) describes the return as `tracker_fired?` — optional but singular — and the worked-example trace shows only one fire, so the spec's narrative is implicitly v1-only-one-level.

But the design's "Open questions" includes:

> **Whether tracker fires recurse** (parent of parent). Concept doesn't call for it; v1 fires one level. Document explicitly.

This commits to **one level** in v1, which makes the singular shape internally consistent — but it directly contradicts the in-scope-section's "auto-recursion case" rationale that part 7's review-1 settled and that the engine spec carries forward. Reading [engine/spec.md:271](../../../workflows-module-concept/engine/spec.md#auto-complete-check) (and [part 7 design.md:71](../../07-group-state-machine/design.md#auto-complete-check)):

> Skipped entirely when the workflow is already in a terminal stage (`completed` / `cancelled`) — the terminal-workflow gate in part 6 step 1 would have rejected the submit before reaching this point, but the guard is restated here for the auto-recursion case (tracker subscription's parent push from [part 10](../10-tracker-subscription/design.md) may re-enter this handler).

That recursion *is* multi-level. The tracker push lands on parent action → triggers a recompute of the parent workflow → parent auto-completes → parent's tracker subscription fires → grandparent. Part 7 explicitly assumes this works; part 10's "v1 fires one level" reverses that decision without flagging the cross-part contradiction.

**Fix.** Pick one and pin it. Two coherent options:

- **Option A (recurse, multi-level).** The tracker subscription invokes the same machinery `SubmitWorkflowAction` uses for action transitions, so a parent auto-complete naturally fans up. Change `tracker_fired` to a list: `tracker_fired: Array<{ parent_action_id, parent_workflow_id, new_status }>` — empty when no fire, one entry per level. Resolves part 7's auto-recursion reference, fits the worked example, and the cycle-protection open question in [engine/spec.md § Open questions](../../../workflows-module-concept/engine/spec.md#open-questions-in-scope-deferred) already names a runtime depth-limit guard (default 10) as the v1 escape hatch.
- **Option B (one level only).** Keep the singular shape. Document explicitly that part 7's "auto-recursion case" is a no-op in v1 because the tracker write doesn't re-enter `handleSubmit` — it just writes the action's status and stops. Part 7's restated-guard rationale becomes a v2-readiness comment only. Update the engine spec's narrative to match.

Lean: **Option A**. Multi-level fan-up is the whole point of the worked example, and the alternative requires a contradiction with part 7's already-resolved review.

### 7. `parent_workflow_id` is on the workflow doc, not the tracker action — the return-shape field needs a fetch

> **Resolved.** Tightened step 5 of the "Logic" section to pin that `parent_workflow_id` is read from the fetched tracker action's `workflow_id` field — the action's own `workflow_id` per the schema. No extra DB read, no schema addition.

[design.md:29](../design.md):

> Surface the fan-up on the originating submit response as `tracker_fired: { parent_action_id, parent_workflow_id, new_status }`.

`parent_action_id` is on the child workflow doc ([engine/spec.md:109](../../../workflows-module-concept/engine/spec.md#schema), [StartWorkflow.js:86](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js)). Good — readily available.

`parent_workflow_id` is **not** stored on either the workflow doc or the tracker action — there's no such field in the schema. What's stored:

- Child workflow doc: `parent_action_id`, `parent_entity_id`, `parent_entity_collection`. No `parent_workflow_id`.
- Parent tracker action: `workflow_id` (its own parent workflow). That **is** the `parent_workflow_id` — but it's a field on the tracker action doc, not the child workflow doc. The subscription has to read it off the tracker action it just fetched (step 2 of the logic).

This is mechanically fine — the helper already does the tracker fetch — but the design should pin where the field comes from so an implementer doesn't add a third lookup or introduce a new schema field.

**Fix.** Tighten [design.md:29](../design.md):

> Surface the fan-up on the originating submit response as `tracker_fired: { parent_action_id, parent_workflow_id, new_status }`, where `parent_workflow_id` is read from the fetched tracker action's `workflow_id` field (no extra DB read — the tracker fetch in step 2 already returns it).

### 8. `eventId` propagation through the tracker write — what `eventId` does the parent action's audit entry carry?

The design's pseudo-code (via engine spec [§ Tracker subscription](../../../workflows-module-concept/engine/spec.md#tracker-subscription)) threads `eventId` through:

```js
await updateAction(context, { ..., eventId, force: true });
```

So the parent action's status entry carries the **child's** originating `eventId` (the one `handleSubmit` generated on entry to the child's submit). Is that the right semantics?

Two consumers of `event_id` on a status entry:

- **Audit trail / timeline UIs.** The event id links the action transition to the log event row that explains *why* the transition happened. If the parent action carries the child's `eventId`, clicking through the audit trail jumps to the child's log event — which is actually correct ("this tracker flipped because the child workflow completed; the child's event has the details").
- **Part 8's `dispatchLogEvent`.** When the child workflow's submit runs, it generates one log event. Currently the parent's action transition rides on that same event id. No separate "tracker-fired-the-parent" event is emitted in v1.

That's a reasonable default but should be called out. A reader might assume the tracker write either generates a fresh event id or skips event-id stamping entirely.

**Fix.** Add a one-line note to the "Logic" section:

> The parent-action status entry carries the **originating submit's `eventId`** (threaded through from `handleSubmit`'s entry). No separate "tracker-fire" event is generated in v1 — the parent action's audit history points back to the child's log event. Part 8's `dispatchLogEvent` does not run for the tracker write itself.

### 9. `CancelWorkflow`'s `eventId` is `null` — the parent action would carry `event_id: null`

[CancelWorkflow.js:132](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) returns `event_id: null`. The handler doesn't generate one (per [part 5 design.md:57](../../05-start-cancel-handlers/design.md): "Log event + notifications on cancel → part 8. v1 cancel writes no event").

If the tracker subscription fires from `CancelWorkflow`, the parent action's audit entry gets `event_id: null`. That's defensible (there's no event to point at), but again should be pinned so an implementer doesn't generate a synthetic event id.

**Fix.** Add to the cancel-path bullet in "Trigger sites":

> When the subscription fires from `CancelWorkflow`, the parent-action status entry's `event_id` is `null` — `CancelWorkflow` doesn't generate a log event in v1 ([part 8](../../08-side-effect-dispatch/design.md) covers the follow-up). Same shape as every other write `CancelWorkflow` emits.

### 10. Subscription invocation point inside `handleSubmit` — `tracker_fired` would only get set on the early-return path

> **Resolved.** Added a "`handleSubmit` return-shape wiring" bullet to "Implementation": replace the hard-coded `tracker_fired: null` literals at [handleSubmit.js:384, 405](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) with a `trackerFired` local. Error-path partial return keeps `null` (no subscription on error). Same wiring in `CancelWorkflow` at [CancelWorkflow.js:132](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js).

[handleSubmit.js:172–389](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) wraps steps 4 + 4a/b/c + 5 + 6 in a `try { ... } catch (err) { ... force-push error transition; return partial }`. The success path's return at lines 401–408 has `tracker_fired: null` hard-coded. If part 10 wires the subscription between step 5's `$set` and the success return, the implementation has to:

- Compute `tracker_fired` (Option A: array; Option B: single object).
- Set the local variable, not the literal in the return object.

Trivial code change, but worth pinning so an implementer doesn't write `tracker_fired: null` next to the new subscription invocation.

**Fix.** Add to the "Implementation" section:

> Inside `handleSubmit`, the subscription invocation slots between the form-data write (step 6) and the success return at [handleSubmit.js:401–408](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). Replace the hard-coded `tracker_fired: null` literal with a `trackerFired` local computed by `fireTrackerSubscription`. The error-path partial return at lines 380–388 keeps `tracker_fired: null` — no subscription on the error path.

### 11. Ordering vs part 11 — design says "Part 11 runs after this part in the lifecycle ordering" but part 11 says the opposite

> **Resolved.** Flipped the "Contract to neighbours" bullet to say part 11 runs **before** this part (step 9 fan-out before step 10 tracker subscription per part 6's submit-pipeline numbering), with a cross-link to [part 11 design.md:26](../11-group-on-complete-fanout/design.md). The "groups recompute happens on the parent's next submit, not now" line is preserved.

[design.md:65](../design.md):

> **Part 11** runs after this part in the lifecycle ordering

[11-group-on-complete-fanout/design.md:26](../../11-group-on-complete-fanout/design.md):

> Step 9 in `handleSubmit` now executes (previously no-op'd in [part 6](../06-submit-action-writes/design.md)). Runs after step 7 (log event) and step 8 (notifications) but **before step 10 (tracker subscription)** — because both step 9 (group fan-out) and step 10 may make in-process writes through `context.callApi`, the ordering matters for the `tracker_fired` signal.

Part 11's design pins step 9 (group fan-out) **before** step 10 (tracker subscription). Part 10 says part 11 runs **after** part 10. Direct contradiction.

The pipeline numbering (part 6's commitment) is canonical: step 9 = group fan-out, step 10 = tracker subscription, step 11 = post-hook. So part 11 is right; part 10 is wrong.

**Fix.** Rewrite [design.md:65](../design.md):

> **Part 11** runs **before** this part in the lifecycle ordering — step 9 (group `on_complete` fan-out) executes before step 10 (tracker subscription). This part reads workflow status from step 5's `$set` (auto-complete push) and the just-written parent action status; it does not depend on part 11's fan-out results. Document the ordering: tracker subscription writes the parent action; the parent workflow's groups recompute happens on the parent's next submit, not now.

### 12. Verification — no test for the in-memory cache invariant that part 7 relies on

> **Resolved.** Added two verification bullets: (a) a 3-level auto-complete chain integration test that asserts each level's persisted `summary`/`groups[]` reflect that level's own action list (catches the failure mode of threading the outer-scope cache into the recompute helper); (b) a depth-limit overflow test using a synthetic 11-level chain. The invariant itself ("helper fetches fresh per `workflowId`") is pinned in the "Post-write recompute helper extraction" bullet under "Implementation".

`handleSubmit` maintains `context.workflowActions` as an in-memory cache that step 5's summary recompute reads ([handleSubmit.js:208–221](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)). The tracker write lands on a **different workflow's action** (the parent's `track-installation`), not on `context.workflowActions`. So the subscription doesn't need to update the cache — it writes a doc that isn't in the current handler's view.

But if Option A from finding 6 is picked (multi-level recurse), the parent submit's view of its own actions needs to be fresh when the parent's auto-complete check runs. Part 7's invariant ([handleSubmit.js:252–260](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) is that `context.workflowActions` is refetched after `reevaluateBlockedActions` modifies actions. The tracker recursion would re-enter `handleSubmit` with a fresh `context` (new `getCurrentAction`, new `getActions`, new `workflow` find) — so the cache invariant holds *across* the recursion, but only because each level fetches fresh.

This is implicit in the design but should be pinned for the test matrix:

**Fix.** Add to "Verification":

> Cache invariant: the parent's recursive `handleSubmit` call must fetch fresh state (action docs, workflow doc, workflow config) rather than reusing the child's `context`. Add a unit test where the parent has multiple actions and the tracker fire's `updateAction` interleaves with the parent's own auto-complete recompute — verify the parent's `summary` and `groups[]` reflect the post-tracker-write state, not stale pre-write counts.

(If Option B is picked, this finding is moot — drop it.)

### 13. `populateIds`-style server-side id generation is not mentioned, but the parent push doesn't insert — no new ids

> **Resolved.** Added a one-liner to the "Implementation" section: no `populateIds` call — subscription updates via `MongoDBUpdateOne`, no new ids.

Per the engine spec ([§ Connection structure](../../../workflows-module-concept/engine/spec.md#connection-structure)) and [populateIds.js](../../../../plugins/modules-mongodb-plugins/src/connections/shared/populateIds.js), insertions use server-side `_id` generation. The tracker subscription does an **update** (`updateAction → MongoDBUpdateOne`), not an insert — so no id generation is needed. Worth a one-liner to head off a reviewer who reads the engine-spec connection structure and wonders where the id-generation seam is in this part.

**Fix.** Optional clarification in the "Implementation" section:

> No `populateIds` call — the subscription updates an existing tracker action document via `MongoDBUpdateOne`, no new ids generated.

## Smaller issues

### 14. `child-stage map` placement — module-level constant where, exactly?

> **Resolved.** Pinned in "Implementation": `CHILD_STAGE_MAP` lives as a `const` at the top of `fireTrackerSubscription.js`, exported for test-table iteration. Call sites import the function; only tests import the constant.

[design.md:35](../design.md):

> The map is module-level constant; not configurable per concept design.

Engine spec at [§ Tracker subscription](../../../workflows-module-concept/engine/spec.md#tracker-subscription) names it `CHILD_STAGE_MAP`. The natural seam is `src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` (top of file, before the function). Or `src/connections/shared/childStageMap.js` if `CancelWorkflow` consumes it without re-importing the whole subscription file.

Lean: define inside `fireTrackerSubscription.js` and export. Both call sites import the function, not the map.

**Fix.** Add to "Implementation":

> The child-stage map is a `const` at the top of `fireTrackerSubscription.js`, exported as `CHILD_STAGE_MAP` for testability (the unit-test table iterates over its entries to assert each mapping). Both `SubmitWorkflowAction` and `CancelWorkflow` import the function; only tests import the constant directly.

### 15. "Reuses `updateAction.js` from [part 6]" — actually part 5 introduced it

> **Resolved.** Rewrote the "Implementation" bullet: scaffold introduced in part 5, priority-rule branch added by part 6. Added the `force: true` cross-link to the engine spec's tracker subscription section.

[design.md:34](../design.md):

> Reuses `updateAction.js` from [part 6](../06-submit-action-writes/design.md) for the parent write.

`updateAction.js` was introduced as a scaffold in [part 5](../../05-start-cancel-handlers/design.md#shared-internal-helpers-in-srcconnectionsshared) and extended in place by part 6 with the priority-rule branch. Part 10 reuses the part-5-shipped, part-6-extended helper.

Minor doc-history note; doesn't affect implementation.

**Fix.** Tighten:

> Reuses `shared/updateAction.js` (introduced in [part 5](../../05-start-cancel-handlers/design.md), priority-rule branch added by [part 6](../../06-submit-action-writes/design.md)). The subscription invokes it with `force: true` per [engine spec § Tracker subscription](../../../workflows-module-concept/engine/spec.md#tracker-subscription).

### 16. Open question about "same Mongo client/session" is already settled

> **Resolved.** Moved the settled item from "Open questions" to a new "Notes" section above it, framed as a settled engine-architecture decision with a cross-link to [engine spec § Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model). The remaining "Open questions" entry (multi-level recurse) is now the only true open item — until finding 6 closes it.

[design.md:60](../design.md):

> **Tracker subscription inside the same Mongo client/session** as the originating handler. Yes — synchronous in-process per concept. No transaction wrapping in v1.

This isn't an open question — it's settled. The engine spec at [§ Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model) commits the architecture; review-2 supersedes the per-invocation client model with per-request community-plugin dispatchers. Either way, "same client" stops being a meaningful question — every read/write goes through the same `mongoDBConnection` dispatcher built from the originating handler's context.

**Fix.** Move from "Open questions" to "Notes" or "Out of scope / deferred":

> **Client model.** The subscription reuses the originating handler's `context.mongoDBConnection` dispatcher — same posture as every other helper inside the handler invocation. No transaction wrapping in v1 ([engine spec § Client and transaction model](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)). Not an open question; settled by the engine architecture.

## Out-of-scope / non-findings

- Cycle protection — already an engine-spec open question with the depth-limit guard committed as the v1 escape hatch. Not part 10's territory.
- Async / change-stream variant — explicitly deferred by part 10's "Out of scope" bullet.
- Multi-parent tracker scenarios — also explicitly out of scope; the one-parent-per-child constraint lives in `StartWorkflow`.
- Hooks on tracker transitions — correctly noted as out of scope.

## Suggested doc edits in order

1. Findings 1 + 3 — pin the invocation seams (between step 6 and step 11 in `handleSubmit`; after step 3 in `CancelWorkflow`'s flat flow). Tightens the most important "where does the code go" question.
2. Finding 6 — decide multi-level recurse (Option A) vs one-level (Option B); fix `tracker_fired` shape and resolve the contradiction with part 7's auto-recursion reference. Largest design-level decision in this review.
3. Finding 11 — fix the part 11 ordering contradiction. Adjacent parts disagreeing on lifecycle ordering is a high-confusion failure mode.
4. Findings 2 + 4 + 5 — pin the `updateAction` call shape, the upstream same-stage guard, and add a same-stage guard at the tracker-action level.
5. Findings 7 + 8 + 9 — pin where `parent_workflow_id` is read, how `eventId` propagates, and the `null` eventId on the cancel path.
6. Findings 10 + 12 — the in-handler invocation point and the in-memory cache invariant for recursion.
7. Findings 13, 14, 15, 16 — small in-place clarifications.
