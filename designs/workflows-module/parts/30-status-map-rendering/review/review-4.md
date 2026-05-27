# Review 4 — Codebase-fit gaps still open from review-3 + new mismatches

Review 3 flagged three concrete codebase mismatches and three under-specified signatures. None of them were resolved in the design (no inline "Resolved" markers, design text unchanged). This review re-files the ones that still hold against the current code, names each by the design section that needs an edit, and adds four fresh findings turned up while verifying the rest.

## Still open from review 3

### 1. `bulkWrite` is not exposed by `@lowdefy/community-plugin-mongodb`

D11 ([design.md:201](../design.md)) and the Cancel/Close "Modified" bullets ([design.md:585-586](../design.md)) still commit the cascade to `bulkWrite`. The community plugin (verified at `node_modules/.pnpm/@lowdefy+community-plugin-mongodb@3.0.0_*/node_modules/@lowdefy/community-plugin-mongodb/dist/connections/MongoDBCollection/`) ships:

```
MongoDBDeleteMany / MongoDBDeleteOne
MongoDBInsertConsecutiveId / MongoDBInsertMany / MongoDBInsertManyConsecutiveIds / MongoDBInsertOne
MongoDBUpdateMany / MongoDBUpdateOne / MongoDBVersionedUpdateOne
```

No `MongoDBBulkWrite`. Today's cascades (`CancelWorkflow.js:84`, `CloseWorkflow.js:125`) go through `MongoDBUpdateMany` — there is no path to a bulk-write request from engine JS without adding a request type to the community plugin or bypassing the plugin's `mongoDBConnection` wrapper.

**Fix:** pick one of (a) N `MongoDBUpdateOne` calls in a loop — the regression D11 dismisses but matches "build for what exists"; (b) add `MongoDBBulkWrite` to the community plugin and flag as a hard dependency in "Related"; (c) keep `MongoDBUpdateMany` with a `$switch`-on-`_id` pipeline (unreadable, not recommended). Update D11 to name the chosen mechanic — the current "bulkWrite" answer doesn't work.

### 2. `context.action` is the pre-write doc when event display renders

D14 ([design.md:286, 290, 302](../design.md)) ties the event-render context to the post-write action doc and lists `action.{slug}.message`, `action.metadata.*`, and `action.status[0]` as the bindings authors will write against. The "Modified" bullet for `handleSubmit.js` ([design.md:587](../design.md)) still reads "already routes through `updateAction`. No structural change; verify metadata flows through."

`handleSubmit.js` fetches `context.action` once at line 63 and assigns it at line 101. The per-entry write loop at lines 226-249 mutates `doc.status` and `doc.updated` on `context.workflowActions[i]` — a different object reference from `context.action`. By the time `buildDefaultLogEventPayload({ action: context.action, ... })` runs at line 320, `context.action.metadata`, `context.action.status[0].stage`, and every `action[slug]` subdoc are the pre-write values.

**Fix:** add an explicit handler-side edit to the "Modified" bullet: refresh `context.action = await getCurrentAction(context, { actionId: context.action._id })` after the step-4 write loop and before step 7, or pass `recomputeResult.workflowActions.find(a => a._id === context.action._id)` to `renderEventDisplay` as the post-write doc. "No structural change" is wrong.

### 3. `workflow_type` is not on the action doc — and D10 contradicts D14 about this

D10 ([design.md:196](../design.md)) says "Workflow-level fields (`workflow_type`, `entity_id`, `entity_collection`) are already on the action doc — accessible." D14 ([design.md:290](../design.md)) says the opposite: "`workflow` exposes workflow-level fields that aren't on the action: `_id`, `workflow_type`, `key`, ...". D11 ([design.md:572](../design.md)) sides with D10: "`actionDoc.workflow_type` (form `pageId`)".

Code sides with D14. [`createAction.js:29-58`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js) builds action docs with `type, kind, key, action_group, status, entity_id, entity_collection, assignees, due_date, description, tracker, child_*`. The only `workflow_type` on an action doc is nested at `tracker.workflow_type` for `kind: tracker` — that's the *child* workflow's type, not the action's owning workflow type. `workflow_type` lives on the workflow doc (`StartWorkflow.js:77`).

The form-pageId rule (`${actionDoc.workflow_type}-${actionDoc.type}-${verb}`, D4 [design.md:90](../design.md)) and `computeEngineLinks(actionConfig, stage, actionDoc)` ([design.md:572](../design.md)) can't read `workflow_type` from the action.

**Fix:** pick one: (a) extend `createAction.js` to persist `workflow_type` on every action doc (one extra field, makes the entity-rendering claim in D10 true and unifies the action-vs-workflow boundary for renderers); (b) change `computeEngineLinks`'s contract to take the workflow doc (or `workflowType`) as an extra arg and remove the line-196 claim from D10. Then resolve the D10-vs-D14 contradiction either way.

### 4. `updateAction` and `createAction` parameter additions are still not enumerated

D11 ([design.md:238-240](../design.md)) names `payload.action_display` and `payload.metadata` as new caller-facing inputs. The "Modified" bullets for `updateAction.js` ([design.md:584](../design.md)) and `createAction.js` ([design.md:583](../design.md)) don't enumerate the new parameters those helpers must accept. Today's signatures are:

- [`updateAction(context, { actionId, newStage, fields, eventId, currentActionId, force })`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js)
- [`createAction(context, { workflow, action, eventId })`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js)

Render-on-write needs both to accept `actionDisplay` (per-call override per D8) and `metadata` (caller-supplied accumulating bag per D10). Without naming them on the "Modified" entries, the implementer is left to guess the call shape; tasks 7 and 8 ([`tasks/07-wire-createAction-and-StartWorkflow.md`](../tasks/07-wire-createAction-and-StartWorkflow.md), [`tasks/08-wire-updateAction.md`](../tasks/08-wire-updateAction.md)) inherit the gap.

**Fix:** spell the new signatures into D11 and the "Modified" entries: `updateAction(context, { actionId, newStage, fields, actionDisplay, metadata, eventId, currentActionId, force })`, `createAction(context, { workflow, action, actionDisplay, metadata, eventId })`.

## New findings

### 5. `force=true` path in `updateAction` skips the pre-write fetch — render needs it

Review-1 finding #5 was resolved by committing render to live inside `updateAction` (so `fireTrackerSubscription`, `reevaluateBlockedActions`, `StartWorkflow`'s parent push, and any other `force: true` caller inherit it). But [`updateAction.js:47-61`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js) only fetches `fetchedAction` when `force !== true`:

```js
if (force !== true) {
  const fetchedAction = await getCurrentAction(context, { actionId });
  ...
}
return context.mongoDBConnection("actions").MongoDBUpdateOne({ ... });
```

`renderStatusMap` and `computeEngineLinks` both take `actionDocBeforeWrite` as input. Moving render inside `updateAction` means the helper must fetch the doc on **every** call, not just non-force calls — adding a Mongo round-trip to every `force: true` engine-internal call site (StartWorkflow parent push, fireTrackerSubscription, reevaluateBlockedActions, etc.). D11 doesn't acknowledge this cost.

**Fix:** call this out in D11 — either pull the fetch out of the `if (force !== true)` block (one fetch per `updateAction` call, used both for shouldUpdate gating and for render), or have `force: true` callers pass the pre-write doc in to avoid the re-fetch (`StartWorkflow.js` already has the parent doc on hand at line 117).

### 6. `context.workflow` is stale at event-render time — `workflow.summary` won't resolve

D14 ([design.md:292](../design.md)) puts `workflow` in the event-render context and says "`workflow.summary` matters for group-complete and workflow-close events." `recomputeWorkflowAfterActionWrite` ([recomputeWorkflowAfterActionWrite.js:132-140](../../../../plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js)) returns `{ workflow, summary, workflowActions, ... }`. `handleSubmit.js:270-272` only reassigns `context.workflowActions = recomputeResult.workflowActions` — `context.workflow` is the pre-recompute object, and `context.workflow.summary` is the pre-write summary (or unset on a fresh workflow).

Same shape as finding 2 but for `workflow` instead of `action`. By the time `dispatchLogEvent` runs at `handleSubmit.js:318+`, `context.workflow.summary.done` is stale.

**Fix:** add `context.workflow = recomputeResult.workflow` after the recompute at `handleSubmit.js:272`, or pass `recomputeResult.workflow` to `renderEventDisplay` explicitly. Either way, name the edit in the "Modified" bullet.

### 7. The `parseNunjucks` consumer named in "Modified" doesn't exist

"Modified" ([design.md:582](../design.md)):

> `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.jsx` — update the `parseNunjucks` import from `./parseNunjucks.js` to `../../utils/parseNunjucks.js`.

There is no `ContactSelector.jsx` — the block file is `ContactSelector.js` and doesn't import `parseNunjucks`. The actual consumer is [`ContactSelector/ContactListItem.js:5`](../../../../plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js):

```js
import parseNunjucks from "./parseNunjucks.js";
```

**Fix:** rewrite the bullet to name `ContactListItem.js` (and any other importer — `grep -rn "parseNunjucks" plugins/modules-mongodb-plugins/src/` returns only `ContactListItem.js` today, but rerun before the move).

### 8. `access`-shape inconsistency between the design and the existing demo configs

The design's worked example ([design.md:460-462](../design.md)) and the link-table reasoning in D4 ([design.md:71-89](../design.md)) treat `access[slug]` as an array of verbs:

```yaml
access:
  demo: [view, edit]
  customer: [view]
```

Existing demo configs split into two shapes:

- Array-of-verbs (matches the design): [`onboarding/send-quote.yaml`](../../../../apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml), [`onboarding/schedule-followup.yaml`](../../../../apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml) — `access.demo: [edit, view]`.
- Nested `{ roles, verbs }` per slug: [`installation/install-step.yaml`](../../../../apps/demo/modules/workflows/workflow_config/installation/install-step.yaml) — `access.demo: { roles: [admin], verbs: [view] }`.

`handleSubmit.js:104` reads `actionConfig.access?.roles` (top-level), which only fits the array-of-verbs shape — install-step.yaml currently has no top-level `access.roles`, so role-gating is silently skipping it. Both shapes co-exist in the repo today because nothing yet reads per-slug verbs; once `computeEngineLinks` does, the two shapes produce different results.

**Fix:** call the canonical shape out in D4 ("`access[slug]` is an array of verbs; `access.roles` and `access.notification_roles` are top-level reserved keys; per-slug nested `{ roles, verbs }` is not supported"), and add a "Demo + tests" bullet to migrate `installation/install-step.yaml` to the canonical shape as part of this part. Otherwise the engine-link computation will silently behave differently for the two demo workflows.

## Summary

Findings 1–4 are unresolved review-3 items still encoded in the design text — they need to land before tasks 5/8/9/14 begin (they change file lists and helper signatures). Findings 5–8 are fresh: a missing fetch on the force path (5), `context.workflow` staleness mirroring the `context.action` problem (6), a non-existent filename in the move bullet (7), and an access-shape inconsistency that the engine-link computation will surface (8).

Next: `/r:design-action-review 30-status-map-rendering` to resolve, reject, or defer each finding.
