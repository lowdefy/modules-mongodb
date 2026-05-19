# Task 6: Implement `CancelWorkflow`

## Context

The current `CancelWorkflow.js` at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` is a stub that throws `WorkflowAPINotImplemented` (shipped by part 03). This task replaces the body.

Per design § CancelWorkflow.js:

- **Payload**:
  - Required: `workflow_id`.
  - Optional: `reason` (written into the cancelled status entry).
  - Optional: `references` (spread onto the workflow doc on cancel, reserved-key merge order — references first, core fields including the cancelled status push last).
- **Writes**:
  - Push `{ stage: 'cancelled', created, reason? }` to the workflow's `status[]`.
  - For every action whose latest status is non-terminal (`status[0].stage NOT IN ('done', 'not-required')`), push `not-required` with `force: true`.
  - Recompute and write `summary`.
- **Returns**: `{ action_ids, event_id: null, tracker_fired: null }`.

Out of scope (deferred):
- Group recompute → owned by part 7's `CancelWorkflow integration`.
- Log event + notifications → part 8 (v1 cancel writes no event).
- Tracker subscription fire on parent cancel → part 10.

V0 reference: the v0 `CloseWorkflowActions.handleCloseActions` helper does the bulk non-terminal flip via `MongoDBUpdateMany` with the same `$push: { status: { $position: 0, $each: [...] } }` newest-at-index-0 pattern. Note v0 also filters out `required_after_close: true` non-blocked actions — that's deferred behaviour the design doesn't commit to here. Don't carry that filter into v1; flip every non-terminal action.

## Task

Replace the body of `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js`:

1. **Build the engine context** the same way `StartWorkflow.js` does — `mongoDBConnection`, `workflowsConfig`, `actionsEnum`, `changeStamp`, `params`. (Some of these aren't read in this handler — `workflowsConfig` and `actionsEnum` aren't strictly needed for cancel — but build them anyway so the context shape stays consistent across handlers.)

2. **Validate payload.** `workflow_id` is required (throw a precise error otherwise). `reason` and `references` are optional.

3. **Push cancelled status onto the workflow.** Use `mongoDBConnection('workflows').MongoDBUpdateOne` with the reserved-key merge order:

   ```js
   await context.mongoDBConnection('workflows').MongoDBUpdateOne({
     filter: { _id: payload.workflow_id },
     update: {
       $set: {
         ...payload.references,            // spread first (reserved-key merge order)
         updated: context.changeStamp,
       },
       $push: {
         status: {
           $position: 0,
           $each: [
             {
               stage: 'cancelled',
               created: context.changeStamp,
               ...(payload.reason ? { reason: payload.reason } : {}),
             },
           ],
         },
       },
     },
   });
   ```

   The `$push` is its own update operator — it's structurally separate from `$set` and runs after the `$set`, so even though `references` is spread first into the `$set` payload, the cancelled status push lands cleanly (`$set` and `$push` apply to disjoint fields). A malicious `references: { status: [...] }` would only collide with the status array; the `$push` still appends, but the malicious key would have already overwritten the array. To prevent that fully, omit `status` from the `references` spread defensively by deleting it before the `$set`, or document that consumers shouldn't try this (matches engine spec's "silently overridden" stance).

   Recommend the **defensive delete** approach: `const safeReferences = { ...payload.references }; delete safeReferences.status;` (and the same for the other reserved keys: `_id`, `workflow_id`, `type`, `entity_id`, `entity_collection`, `summary`, `groups`, `form_data`, `created`, `updated`). One inline reserved-keys list at the top of the file.

4. **Fetch non-terminal actions.** Query `mongoDBConnection('actions').MongoDBFind({ query, options })` with:

   ```js
   {
     query: {
       workflow_id: payload.workflow_id,
       'status.0.stage': { $nin: ['done', 'not-required'] },
     },
     options: {
       projection: { _id: 1, type: 1, key: 1 },
     },
   }
   ```

   This matches v0's filter (minus the `required_after_close` carve-out which is deferred).

5. **Flip every non-terminal action to `not-required`.** Either:
   - **Bulk path** — single `MongoDBUpdateMany` mirroring v0's `CloseWorkflowActions.handleCloseActions` bulk-flip pattern.
   - **Per-action loop** — call `updateAction(context, { actionId, newStage: 'not-required', force: true, eventId: null })` per match.

   Pick the bulk path — `MongoDBUpdateMany` is one round trip vs N. v0 does this for the same reason. `updateAction` (task 3) stays the single-doc helper; the cancel path doesn't gain anything by using it.

   Bulk update shape:

   ```js
   const actionIds = nonTerminalActions.map((a) => a._id);
   if (actionIds.length > 0) {
     await context.mongoDBConnection('actions').MongoDBUpdateMany({
       filter: { _id: { $in: actionIds } },
       update: {
         $set: { updated: context.changeStamp },
         $push: {
           status: {
             $position: 0,
             $each: [
               { stage: 'not-required', created: context.changeStamp },
             ],
           },
         },
       },
     });
   }
   ```

6. **Recompute summary.** After the action flips, recount:
   - Re-fetch the actions for this workflow (this time without the `status[0].stage` filter): `mongoDBConnection('actions').MongoDBFind({ query: { workflow_id } })`. Project just `status.0.stage` for cost.
   - `total = actions.length`. `done = count where status[0].stage === 'done'`. `not_required = count where status[0].stage === 'not-required'`.
   - Write back via `mongoDBConnection('workflows').MongoDBUpdateOne({ filter: { _id: workflow_id }, update: { $set: { summary, updated: context.changeStamp } } })`.

   `groups[]` recompute is **not** done here — owned by part 7's `CancelWorkflow` integration. Don't read or write `groups` in this handler.

7. **Return** `{ action_ids: <the ids that were flipped>, event_id: null, tracker_fired: null }`.

8. **Flip `meta.checkWrite`** from `false` to `true` (same posture as task 4 — part 03's commit message specifies this).

## Acceptance Criteria

- `CancelWorkflow.js` no longer throws `WorkflowAPINotImplemented`.
- Workflow doc gets a cancelled status entry pushed at position 0; `reason` is included when supplied.
- Every non-terminal action (status[0].stage not in `done`/`not-required`) gets flipped to `not-required`; terminal actions are left untouched.
- `summary` is recomputed and written back; `groups` is not touched.
- `references` payload uses the reserved-key merge order; a malicious `references: { status: [...] }` cannot overwrite the workflow's status array (defensive reserved-keys delete).
- Return shape: `{ action_ids, event_id: null, tracker_fired: null }` — explicit `null` for the deferred fields per design.md:41.
- `CancelWorkflow.meta.checkWrite === true`.
- Plugin builds cleanly.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — modify — replace stub body.

## Notes

- **Tracker fan-up on cancel is deferred to part 10.** The design says: "If the workflow has a `parent_action_id`, the engine's tracker subscription handles parent-side updates. The subscription itself lands in part 10; this handler simply marks the workflow cancelled — part 10 listens." So this handler does **not** touch the parent tracker action on cancel, even if `parent_action_id` is populated. Part 10's subscription will fire from the cancelled status push when it lands.
- **Two reads then a write.** Summary recompute requires a second action read after the bulk flip (you can't just decrement counts because the original `summary` could be stale). Cheap given typical action counts; matches the engine spec's "Recompute the workflow's `summary` (eager writeback)" pattern.
- **Open question (design.md:81)**: "Whether cancelling an already-cancelled workflow is a no-op or an error. Lean: no-op (idempotent)." For this task, the simplest realization of the lean: a re-call hits an already-cancelled workflow, pushes another `cancelled` status (so the status array grows), but the action flip finds zero non-terminal actions and the summary recompute is idempotent. If you prefer a true no-op, read the workflow's `status[0].stage` first and short-circuit if already `cancelled`. Either is acceptable for v1; pick the simpler one (no early-out check).
