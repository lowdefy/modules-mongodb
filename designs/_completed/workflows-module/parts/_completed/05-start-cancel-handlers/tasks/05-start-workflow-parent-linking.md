# Task 5: Add parent-link support to `StartWorkflow`

## Context

Task 4 shipped the no-parent code path. This task adds the `parent_action_id` flow:

- Extra validation: parent action exists, is `kind: tracker`, has null `child_workflow_id`, and `parent_action.tracker.workflow_type` matches the new workflow's `workflow_type`.
- Parent-side writes: set `child_workflow_id`, `child_entity_id`, `child_entity_collection` on the parent tracker action and `$push` `in-progress` to its status with `force: true`.
- Child-side writes: populate `parent_action_id`, `parent_entity_id`, `parent_entity_collection` on the new workflow doc (read from the parent action's `entity_id` / `entity_collection`).

Important per design `Half-linked failure mode (accepted)` bullet: write order is **not pinned** in v1. The handler does sequential writes through the shared dispatcher; reconciliation handles half-linked state. Don't add retry-protection logic.

Per design § Validation (runtime, handler entry), this validation runs **before any writes** alongside the workflow-type and keyed-action checks task 4 added.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` (the one task 4 reworked).

1. **Detect the parent-link case.** If `payload.parent_action_id` is set, run the parent-link validation block. Otherwise the rest of the flow stays as task 4 shipped it.

2. **Fetch the parent action.** Use `getActionFields(context.mongoDBConnection, payload.parent_action_id)` — but note that helper's current projection (see `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js`) doesn't include `tracker` or `child_workflow_id`. Two options, pick the cleaner one:
   - (a) Extend `getActionFields` to add `tracker` and `child_workflow_id` to its projection (small change, future-friendly).
   - (b) Do a direct `mongoDBConnection('actions').MongoDBFindOne` in `StartWorkflow.js` with a wider projection.

   Recommend (a) — `getActionFields` is the named-helper boundary for "core fields per the engine spec"; `tracker` and `child_workflow_id` are core fields per the `ActionDoc` typedef. Extending the projection costs nothing and keeps callers consistent.

3. **Validate.** In order:
   - Parent action exists. Throw `parent action not found` if `getActionFields` returned `null`.
   - `parent.kind === 'tracker'`. Throw `parent action is not kind: tracker` otherwise.
   - `parent.child_workflow_id == null`. Throw `parent action is already linked to a child workflow` otherwise.
   - `parent.tracker.workflow_type === payload.workflow_type`. Throw `workflow_type does not match parent tracker.workflow_type` otherwise.

4. **Populate the child workflow's parent back-references.** When building the workflow doc (task 4's step 5), if `parent_action_id` is set, set:

   ```js
   parent_action_id: payload.parent_action_id,
   parent_entity_id: parent.entity_id,
   parent_entity_collection: parent.entity_collection,
   ```

   These overwrite the `null` defaults task 4 set. Reference-key merge order is preserved: `payload.references` still spreads first, core fields including these three are assigned after.

5. **Parent-side writes.** After inserting the workflow doc and action docs (task 4's steps 8–9), if `parent_action_id` is set, call:

   ```js
   await updateAction(context, {
     actionId: payload.parent_action_id,
     newStage: "in-progress",
     fields: {
       child_workflow_id: workflowDoc._id,
       child_entity_id: workflowDoc.entity_id,
       child_entity_collection: workflowDoc.entity_collection,
     },
     eventId: null,
     force: true,
   });
   ```

   `force: true` is mandatory per design § Parent linking — engine-driven write, must land regardless of the parent's current status (e.g. an `in-review` parent at priority 4 would reject a default `in-progress` push at priority 5 without `force: true`).

6. **No retry-safety logic.** Do not check whether the parent's `child_workflow_id` already matches the new workflow's `_id`. The half-linked failure mode is accepted per design.

## Acceptance Criteria

- `StartWorkflow.js` validates parent-link constraints before any writes when `parent_action_id` is in the payload.
- Each of the four parent-link rejection cases throws a precise, distinct error message.
- New workflow doc carries `parent_action_id`, `parent_entity_id`, `parent_entity_collection` read from the parent action (not from the payload — callers don't supply these per design.md:15).
- Parent tracker action gets `child_workflow_id`, `child_entity_id`, `child_entity_collection` set and `in-progress` pushed to status via `updateAction` with `force: true`.
- No-parent calls (no `parent_action_id`) behave exactly as task 4 specified.
- `getActionFields` projection (or whatever lookup path you chose) includes `tracker` and `child_workflow_id`.
- Plugin builds cleanly.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — add parent-link validation + parent-side write.
- `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js` — modify (if going with option a) — extend projection to include `tracker` and `child_workflow_id`.

## Notes

- **`updateAction` is task 3's `force: true`-only scaffold.** It throws if called without `force: true`. Task 5 always passes `force: true`, matching that contract.
- **Why no reciprocal `child_workflow_id === workflowDoc._id` retry guard.** The new workflow's `_id` is server-generated per task 4; a retry generates a fresh `_id`, so the guard could never match. The half-linked failure mode is accepted.
- **`eventId` threading.** Same as task 4 — pass `null` for v1. Part 8 (side-effect dispatch) introduces real `eventId` generation; this handler doesn't generate one because `StartWorkflow` writes no event in v1.
