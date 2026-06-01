# Review 3 — Engine-side mechanics that don't fit the existing code

Three load-bearing claims in the design rest on things that aren't true of the current codebase. Two are likely to surface on the first day of implementation; the third changes the public signature of helpers the design names. A handful of smaller gaps trail them.

## Load-bearing claims that don't match the code

### 1. `bulkWrite` is not exposed by `@lowdefy/community-plugin-mongodb`

> **Resolved (via review-4 #1).** Picked option (c) — Cancel/Close cascade loops `MongoDBUpdateOne` per action. D11 § Wire shape rewritten with the structural rationale (community plugin's change-log feature deliberately omits bulkWrite); Cancel/Close Modified bullets updated.

D11 ([design.md:198-200](../design.md)) commits the Cancel/Close cascade to `bulkWrite` and explicitly rejects the per-action-`updateOne`-in-a-loop alternative as "a real regression on sweeps hitting 20-100+ actions per workflow." That rationale is the design's only argument for the chosen mechanic, and it depends on the underlying connection plugin shipping a bulk-write request.

It doesn't. `@lowdefy/community-plugin-mongodb` ships exactly these request handlers (from `node_modules/@lowdefy/community-plugin-mongodb/dist/connections/MongoDBCollection/`):

```
MongoDBDeleteMany / MongoDBDeleteOne
MongoDBInsertConsecutiveId / MongoDBInsertMany / MongoDBInsertManyConsecutiveIds / MongoDBInsertOne
MongoDBUpdateMany / MongoDBUpdateOne / MongoDBVersionedUpdateOne
```

No `MongoDBBulkWrite`. The engine helpers go through `createMongoDBConnection.js` ([line 41-43](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/createMongoDBConnection.js)) which only forwards request keys present in `MongoDBCollection.requests`, so a hand-rolled `bulkWrite` call from engine JS isn't reachable without changes to the community plugin.

Options, none of them free:

- (a) Add `MongoDBBulkWrite` to `@lowdefy/community-plugin-mongodb`. External-package work; out of scope for a workflows-module part.
- (b) Bypass the community plugin and open a raw MongoDB driver client from `WorkflowAPI/` for the cascade. Splits the connection-lifecycle story (the community plugin owns pooling, change-log writes, serialization per [`createMongoDBConnection.js` doc-block](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/createMongoDBConnection.js)).
- (c) Accept the N-`updateOne` regression that D11 dismisses. For a Close sweep on a 100-action workflow that's 100 round trips at write latency — measurable but probably tolerable, and the cascade isn't a hot path.
- (d) Send one `MongoDBUpdateMany` with a `$set` pipeline that uses `$switch` on `_id` to pick per-doc rendered cells. Pipeline blows up in size and is unreadable; not recommended but mechanically possible.

**Fix:** pick one before the cascade work starts. (c) is the smallest path and matches the project's "Build for what exists" principle — engine-managed display is the feature; bulk-write tooling is incidental. If (a) is the right answer it should be flagged as a hard dependency in the design's "Related" section and scoped as a separate ticket.

### 2. Event-display render context uses `context.action`, which is the pre-write doc

> **Resolved (via review-4 #2).** Picked option (b) variant — reassign `context.action` from `recomputeResult.workflowActions.find(...)` after step 5. No extra Mongo trip (recompute already re-fetched the doc). handleSubmit Modified bullet enumerates the edit.

D14 ([design.md:302](../design.md)): "**Post-write action doc, not pre-write.** Events describe what just happened. `action = post-write action doc` and `status_after = newStage` give templates the obvious bindings to write `{{ user.profile.name }} moved {{ action.key }} to {{ status_after }}`."

The current submit pipeline doesn't have a post-write `context.action` to hand in. [`handleSubmit.js:63-65, 100-101`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) fetches the action once via `getCurrentAction` *before* step 4, stashes it on `context.action`, and never refreshes it. Step 4's per-entry write loop ([handleSubmit.js:226-249](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) does an in-memory cache update on the matching doc in `context.workflowActions`, but those are different object references from `context.action` (one comes from `getCurrentAction`, the other from `getActions(workflow._id)`). By step 7 (`buildDefaultLogEventPayload({ action: context.action, ... })` at [handleSubmit.js:319-328](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)), `context.action.metadata`, `context.action.status[0].stage`, and every newly-written `action[slug]` subdoc are the values that were on disk *before* this submit started.

This breaks the design in several concrete places:

- **`action.metadata.*` in event templates resolves to old metadata.** D14 explicitly relies on `action.metadata.*` for any metadata reference ("Action metadata reaches templates via `action.metadata.*` — no separate `mergedMetadata` parameter, since `action.metadata` is already the merged-and-written value by the time event display renders"). It isn't.
- **`action.{slug}.message` / `.link` references read the previous stage's render.** Templates of the form `"{{ user.profile.name }} closed {{ action.demo.message }}"` would render last-stage's message, not this transition's.
- **`action.status[0]` is the prior stage.** `status_before` / `status_after` come in via the dedicated bindings so the template stays correct, but anything that reaches into `action.status[0].stage` directly is wrong.

**Fix:** add an explicit step in the design — either (a) re-fetch the action doc after step 4 and before step 7 (`context.action = await getCurrentAction(...)`), (b) maintain `context.action` as a live reference to the post-write doc by reassigning it from the in-memory cache after each write, or (c) document that the event render context's `action` is **pre-write plus the just-applied fields** and pass an explicit `actionAfter` to `renderEventDisplay` built from the `mergedActionDoc` D11 already computes. Option (a) is the simplest and least surprising; cost is one MongoDBFindOne per submit. The handler-side change needs a bullet under "Files changed → Modified" — currently `handleSubmit.js` is annotated as "no structural change; verify metadata flows through", which understates the work.

### 3. `workflow_type` is not on the action doc

> **Resolved (via review-4 #3).** Picked option (a) — `createAction.js` now persists `workflow_type` on every action doc (alongside existing `entity_id` / `entity_collection` denormalisations). Justified by MongoDB conventions, report-aggregation usefulness, and reference-impl parity. New Schema additions row + D14 binding-list update + createAction Modified bullet.

Three places — D4's per-kind table ([design.md:90](../design.md)), the `computeEngineLinks` signature paragraph ([design.md:572](../design.md)), and `computeEngineLinks.test.js`'s test plan ([design.md:575](../design.md)) — all assume `actionDoc.workflow_type` is readable off any action doc. It isn't.

[`createAction.js`](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js) builds action docs with `type, kind, key, action_group, status, entity_id, entity_collection, assignees, due_date, description, tracker, child_*, created, updated`. **No top-level `workflow_type`.** The only place `workflow_type` lives on an action doc is inside `tracker.workflow_type` for `kind: tracker` ([createAction.js:49-52](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js)), and that's the tracker's *child* workflow type, not the action's own. The owning workflow's `workflow_type` lives on the workflow doc.

The `kind: form` link rule (`${actionDoc.workflow_type}-${actionDoc.type}-${verb}`, D4) therefore can't be computed from `actionDoc` alone. Today's `makeActionPages.js:48` interpolates `${workflow.type}` — the resolver reaches up to the workflow object, not the action.

**Fix — pick one:**

- (a) Add `workflow_type` as a top-level field on every action doc. Schema addition; needs a parallel update to `createAction.js`. Cheap and clean. The D12 "no backfill" decision still applies (engine-only field, no current consumers) so this doesn't reopen the migration story. Schema section under "Schema additions → Action doc (Mongo)" needs the row.
- (b) Change `computeEngineLinks`'s signature to take the workflow doc (or just `workflow_type`) as a separate parameter. Callers (`createAction`, `updateAction`, the cascade) all have the workflow doc in scope. Less doc surface but more parameters to thread through.

Either way, D4's per-kind table needs a footnote spelling out where `workflow_type` comes from, and the `computeEngineLinks.js` "New files" entry needs the corrected signature. Today both read like the action doc alone is enough.

## Spec gaps

### 4. `updateAction`'s new signature is not enumerated

> **Resolved (via review-4 #4 + loose-end close).** D11 now spells the full signature with safe defaults: `updateAction(context, { actionId, newStage, fields, actionDisplay = {}, metadata = null, ... })`. Engine-internal callers (`fireTrackerSubscription`, `reevaluateBlockedActions`) omit `actionDisplay` and `metadata`; defaults let sticky display fill the gap and keep `metadata` at its prior value. `actionConfig` lookup is implicit via `context.actionsConfig` (no new param).

The current signature ([updateAction.js:36-46](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js)) is `({ actionId, newStage, fields, eventId, currentActionId, force })`. D11 says `updateAction` now calls `renderStatusMap` + `computeEngineLinks` + `buildActionStageUpdate`. To do that, it needs:

- `actionConfig` — picks the cell from `status_map[newStage]` and the access slug set. Reachable via `context.actionsConfig.find(a => a.type === fetchedAction.type)` (handleSubmit already sets `context.actionsConfig` at [handleSubmit.js:89](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)).
- `actionDisplay` — per-call override (D8). Has to flow in from `params.action_display` somewhere.
- `payloadMetadata` — caller-supplied metadata (D5). Has to flow in from `params.metadata`.

None of those three are arguments today. Three call sites land on `updateAction` ([handleSubmit.js:227-234](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [fireTrackerSubscription.js:64](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js), [reevaluateBlockedActions.js:66](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/reevaluateBlockedActions.js)) — the latter two are explicitly called out in D11 as inheriting render automatically, but they have no caller-supplied `action_display` or `metadata` to pass.

**Fix:** spell out the new signature in the `updateAction.js` "Modified" bullet:

- Add `actionConfig`, `actionDisplay = {}`, `payloadMetadata = null` as keyed inputs.
- Document that `fireTrackerSubscription` and `reevaluateBlockedActions` pass `actionDisplay = {}` and `payloadMetadata = null` (their transitions don't carry caller copy/state — sticky display fills the gap).
- Note that `actionConfig` can be looked up inside `updateAction` from `context.actionsConfig` by `fetchedAction.type` — saves callers from passing it but makes the helper reach into context.

Either pattern works; pick one. Today the design leaves it implicit and the implementer has to choose under time pressure.

### 5. `handleSubmit.js` "Modified" entry understates the work

> **Resolved (via review-4 #2/#6 + loose-end close).** handleSubmit Modified bullet rewritten to enumerate three edits: (1) pass `actionDisplay: params.action_display` + `metadata: params.metadata` into `updateAction` / `createAction` in the per-entry loop; (2) refresh `context.action` from `recomputeResult.workflowActions`; (3) reassign `context.workflow = recomputeResult.workflow`. `makeWorkflowApis.js` modification already covers the emitted-API properties.

The current bullet ([design.md:587](../design.md)): "already routes through `updateAction`. No structural change; verify metadata flows through."

The actual changes needed:

- Pass `params.action_display` and `params.metadata` down to `updateAction` for each entry in the write loop.
- If finding #2's option (a) is chosen, re-fetch `context.action` after step 4 so `buildDefaultLogEventPayload` and the event-render context see post-write fields.
- `params.metadata` and `params.action_display` need to exist in the emitted-API properties (already covered by the `makeWorkflowApis.js` modification — good).

"No structural change" is wrong on at least the first point and possibly all three.

**Fix:** rewrite the bullet to enumerate the three edits.

### 6. `mergeEventOverrides` is unchanged but the override shape changes

> **Rejected.** No consumers — the module is wip and non-functional (per D12), and the demo has zero operator-literal overrides. D14 already establishes plain Nunjucks as the only supported shape going forward. Documenting a contract break for non-existent users is the kind of speculative scaffolding the codebase principle ("build for what exists") avoids.

[`mergeEventOverrides.js`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js) does a one-level overlay on `display` / `references` / `metadata`. Today the default's `display.{app}.title` value is a `_nunjucks: { template, on }` object. YAML overrides written today as plain strings (or as the same operator literal) replace it wholesale.

After the change, the default is a plain Nunjucks template string. A YAML or pre-hook override that still ships `_nunjucks: { template, on }` would silently replace the default with an unrenderable object — `renderEventDisplay`'s walker would either treat the `{ _nunjucks: ... }` object as a tree to recurse into (its keys are strings, the `template` value is a string and gets rendered against the context, but the result is `{ _nunjucks: { template: '<rendered>', on: <rendered> } }` and gets serialised to Mongo as-is) or pass it through unchanged. Either way the timeline block reads `[object Object]`.

The design doesn't mention auditing override authoring. The demo has none ([`apps/demo/modules/workflows/`](../../../../../apps/demo/modules/workflows/) has zero `_nunjucks` or `event:` references), so the demo isn't a problem — but the change is still a hidden contract break for any existing YAML override author outside the demo.

**Fix:** add a one-liner under D14 spelling out the contract change: "all four override layers (engine default, YAML `event_overrides.{interaction}.display`, pre-hook return `event_overrides.display`) now expect plain Nunjucks template strings; operator-shaped overrides are no longer supported. Audit existing YAML overrides on the engine event path."

## Minor

### 7. D14 leaves two candidate default templates in play

> **Resolved.** Kept the "marked X as Y" shape (`"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"`) that the `dispatchLogEvent.js` Modified bullet already commits to. Rewrote the D14 paragraph that previously showed the alternate `{{ interaction | replace... }}` candidate so it no longer reads as a competing default — it now just notes that `interaction` is what makes any single-template default possible. Reading-fluency improvements for `request_changes` are deferred to separate copy work.

D14 proposes two engine-default title strings without picking one:

- [design.md:294](../design.md) — `"{{ user.profile.name }} {{ interaction | replace('_',' ') }}d {{ action.key }}"`.
- [design.md:602](../design.md) — `"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"`.

The second reads oddly for `request_changes` → `changes-required` ("marked X as changes-required"). The first handles the verb gracefully but assumes every action has `key` set — the `action.key` field is nullable ([createAction.js:35](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js): `key: action.key ?? null`) and would render an empty string for tracker/group-aggregate actions that don't carry a per-row key.

**Fix:** pick one. The current default ([dispatchLogEvent.js:3-4](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js)) and the design's primary candidate ([design.md:602](../design.md)) point to the same shape ("marked X as Y") — keep that for continuity; if it needs to read better for `request_changes` interactions, that's a separate copy task and not blocked on Part 30.

### 8. Tests not in the "Demo + tests" list

> **Resolved.** Added a bullet to Demo + tests naming the five existing test files that need re-asserting (`updateAction`, `handleSubmit`, `fireTrackerSubscription`, `reevaluateBlockedActions`, `event-id-round-trip`) against the new aggregation-pipeline shape and rendered top-level fields.

`updateAction.test.js`, `handleSubmit.test.js`, `fireTrackerSubscription.test.js`, `reevaluateBlockedActions.test.js`, `event-id-round-trip.test.js` all assert against the current update-doc shape (`$set` + `$push`). The cutover to an aggregation `$set` pipeline with `$concatArrays` changes the on-disk shape and the test snapshots. The "Demo + tests" section enumerates new tests but doesn't call out the existing tests that need re-asserting against the new shapes.

**Fix:** add a sub-bullet to "Demo + tests": "Update existing tests for `updateAction`, `handleSubmit`, `fireTrackerSubscription`, `reevaluateBlockedActions`, and `event-id-round-trip` to assert against the new aggregation-pipeline update shape and rendered top-level fields."

## Summary

Three concrete codebase mismatches (`bulkWrite` missing, pre-write `context.action`, `workflow_type` not on action doc) and three under-specified signatures (`updateAction` inputs, `handleSubmit` edits, override-shape contract). All are mechanical fixes inside the design; the render-on-write architecture itself holds. Land #1 and #3 before implementation starts — they change file lists. #2 is a one-line edit in `handleSubmit.js` once the design names it.
