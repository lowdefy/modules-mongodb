# Review 5 — Verifying review-4's "resolved" claims against the code

Reviews 1–4 closed out a long list of mismatches. This pass spot-checks the resolutions against the actual source, and three of them turn out to be mechanically wrong (or load-bearing on facts the design hasn't established). Two fresh items round it out.

## Resolutions that don't hold against the code

### 1. `context.workflow = recomputeResult.workflow` does not refresh `workflow.summary`

> **Resolved.** Fixed the helper, not the caller. `recomputeWorkflowAfterActionWrite.js` now composes a post-write `workflow` object from `summary` / `groupsAfter` / `shouldPushCompleted` / `changeStamp` and returns that as `result.workflow`, so `handleSubmit`'s `context.workflow = recomputeResult.workflow` resolves to fresh values without a caller-side recipe. New Modified bullet for the helper added to design.md alongside the updated handleSubmit edit 3.

Review-4 #6 was "resolved" with the edit (design.md:592-594):

> After the step-5 recompute, reassign `context.workflow = recomputeResult.workflow` so `workflow.summary` (and any other post-recompute workflow field) is fresh for templates like `"{{ workflow.summary.done }}/{{ workflow.summary.total }}"`.

That's not what `recomputeWorkflowAfterActionWrite` returns. [`recomputeWorkflowAfterActionWrite.js:36-40`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js) fetches the workflow doc once at the top:

```js
const workflow = await context
  .mongoDBConnection("workflows")
  .MongoDBFindOne({ query: { _id: workflowId } });
```

It then computes the post-recompute `summary` (lines 91-97) and `groupsAfter` (lines 61-64 / 76-79) **in local variables**, writes them to Mongo (lines 122-126), and returns:

```js
return { workflow, workflowActions, groupsBefore, groupsAfter, ..., summary };
```

The returned `workflow` is the **pre-write** doc — its `summary` field is whatever was on disk before the write. The fresh post-write summary is at `recomputeResult.summary`, not `recomputeResult.workflow.summary`.

So an implementer doing `context.workflow = recomputeResult.workflow` and then writing `"{{ workflow.summary.done }}"` in an event template will render the pre-write `done` count — the bug review-4 #6 was supposed to fix.

**Fix:** rewrite the bullet to compose the post-write workflow explicitly. Either:

- `context.workflow = { ...recomputeResult.workflow, summary: recomputeResult.summary, groups: recomputeResult.groupsAfter, updated: context.changeStamp }` and, when `recomputeResult.shouldPushCompleted` is true, prepend a `{ stage: 'completed', ... }` entry to `status[]`; **or**
- have `recomputeWorkflowAfterActionWrite` return an updated `workflow` object that reflects the same writes it just persisted (one place, not every caller); **or**
- re-fetch the workflow doc once post-recompute (one extra round-trip — cleanest but costs a read).

Pick one and name the mechanic on the `handleSubmit.js` Modified bullet (and `fireTrackerSubscription` for parity — see finding 5).

### 2. Engine-written `link.pageId` has no defined relationship to module-scoped IDs

> **Resolved (option a).** Threaded the workflows module entry id into the engine. New `entry_id` field on the WorkflowAPI connection schema (`WorkflowAPI/schema.js` Modified bullet), wired at build time via `entry_id: { _module.id: true }` in `modules/workflows/connections/workflow-api.yaml` (verified: `_module.id: true` resolves to `moduleEntry.id` at lowdefy build/walker.js:479). D4's mechanic paragraph rewritten to spell this out; the per-kind page-id table now shows the `{entry_id}/` prefix explicitly. `computeEngineLinks` accepts `entryId` and composes `${entryId}/<convention-name>` to match Lowdefy's build-time `_module.pageId` scoping (`${entryId}/${pageId}`, walker.js:387). Test plan updated to assert the prefix across multi-mount entry ids.

D4 ([design.md:88-93](../design.md)) defines the per-kind page-id rule (`task-{verb}`, `{workflow_type}-{action.type}-{verb}`, `workflow-overview`) and then says:

> Mechanic: engine produces `{ pageId, urlQuery }` (or `null`) per slug, every transition. Pages are resolved via `_module.pageId` — engine writes `pageId: <module-scoped-id>` and Lowdefy's normal page-id resolution takes it from there.

`_module.pageId` is a **build-time** operator that expands inside YAML before the bundle is shipped — e.g. `_module.pageId: task-edit` in [`actions-on-entity.yaml:62`](../../../../modules/workflows/components/actions-on-entity.yaml) becomes the concrete string `<entryId>-task-edit` at build, where `<entryId>` is whatever the host app put in the workflows module entry's `id` field. The runtime engine doesn't get to run `_module.pageId` — it's gone by then.

The `ActionSteps` block ([`ActionSteps.js:171`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js)) reads `action.link.pageId` as a literal string and passes it to a Lowdefy Link block. Lowdefy Link expects a fully-qualified page ID — no runtime scoping.

So when `computeEngineLinks` emits `pageId: "task-edit"` (or `"installation-install-step-edit"` for form), `ActionSteps` will try to navigate to a page id that doesn't exist in the app's compiled page set — the real id is `<entryId>-task-edit`. The engine has no access to the workflows module entry id today (`WorkflowAPI/schema.js:70` declares `app_name` but nothing like `entry_id`). Three concrete consequences:

- Once Part 30 ships, every engine-written `link.pageId` is broken in any deployment where the module entry id differs from the page id (i.e. always, since `_module.pageId` prefixes).
- Existing pre-Part-30 surfaces that read engine-written-but-unused link fields don't currently exercise this — but [`workflow-overview.yaml`](../../../../modules/workflows/pages/workflow-overview.yaml) does read `actions_list.$.link.pageId`. After Part 30, navigation from that page fails.
- The reference codebase the design draws from likely sidesteps this because it hardcodes the entry id into config or has only one mount.

**Fix:** either (a) thread the workflows module entry id into the WorkflowAPI connection (new `entry_id` schema field, wired in `modules/workflows/connections/`), and have `computeEngineLinks` prefix the page id — `${entryId}-task-${verb}` etc.; or (b) drop engine-side scoping and write the bare page id, with a page-side hop that runs `_module.pageId` against the stored value (a build-time `_ref`-style resolver, not currently a thing in Lowdefy as far as I can tell); or (c) document a constraint that module entry id must equal the convention name (`workflows`) and inline it. Option (a) is the realistic one. D4 needs a one-paragraph mechanic; `computeEngineLinks.js` New-files entry needs the new input.

### 3. `workflow_type` is now ambiguous on tracker action docs

> **Resolved (rename).** Renamed the action-doc field `tracker.workflow_type` → `tracker.child_workflow_type`, paralleling the existing `child_workflow_id` / `child_entity_id` / `child_entity_collection` siblings on the tracker subtree. Schema additions § Action doc has a new row calling out the rename; `createAction.js` Modified bullet updated (write `child_workflow_type` at line 51); `StartWorkflow.js` Modified bullet updated (read `parent.tracker?.child_workflow_type` at lines 67-71 + error string at line 69); D14 `action` binding paragraph updated. The action **config** side (`actionConfig.tracker.workflow_type` in YAML) is unchanged — no nested-doc collision at config-authoring time, so the simpler name stays there. Restoring the top-level `workflow_type` from the reference impl (which the modules-mongodb implementation lost) was the original driver; the rename closes the collision the restoration created.

Review-4 #3 (option a, "resolved") commits to denormalising `workflow_type` onto every action doc — D11/D14/Schema additions all updated. But `kind: tracker` action docs already carry a `tracker.workflow_type` (set in [`createAction.js:51`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js)): the child workflow's type that the tracker subscribes to.

After the denormalisation:

- `action.workflow_type` = the parent workflow type (this action's owning workflow).
- `action.tracker.workflow_type` = the child workflow's type.

For a tracker action of type `track-onboarding` living inside a `installation` workflow that subscribes to `onboarding`, the two fields hold different strings (`installation` vs `onboarding`). The design's worked example doesn't cover trackers, and the form-pageId rule D4 line 90 (`${actionDoc.workflow_type}-${actionDoc.type}-${verb}`) is only invoked for `kind: form` — so the rule itself is unaffected, but the ambiguity is real for:

- Any event template that references `{{ action.workflow_type }}`. Author needs to know which one.
- Future report aggregations querying `actions` by workflow type — must specify which field.

**Fix:** rename one of them. Cheapest is to keep the new top-level field as `workflow_type` and rename `tracker.workflow_type` to `tracker.child_workflow_type` on action docs (parallel to `child_workflow_id`, `child_entity_id`). One paragraph under "Schema additions" calling out the rename, and the corresponding lines in `createAction.js:51` ("Modified" bullet) and `StartWorkflow.js:67-71` ("Modified" bullet — currently not in the file list — needs to change `parent.tracker?.workflow_type` to `parent.tracker?.child_workflow_type`). The reader-side cost is small and the conceptual collision goes away.

If the rename is rejected, add an explicit "no, the two fields are intentionally both `workflow_type`; templates that want the child's type read `action.tracker.workflow_type`" note to D14's `action` binding paragraph (design.md:292), so author confusion is at least documented.

## New findings

### 4. `StartWorkflow`'s parent-tracker `updateAction` push isn't named in the "Modified" list

> **Resolved.** Rewrote the `StartWorkflow.js` Modified bullet to enumerate both the `createAction` `metadata` pass-through and the parent-tracker `updateAction` push at lines 117-128 (defaults for `actionDisplay`/`metadata`, canonical test case for D11's engine-link merge rule).

The `StartWorkflow.js` Modified bullet (design.md:597) says only:

> pass `payload.metadata` through to `createAction` for each starting action.

But [`StartWorkflow.js:117-128`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) also calls `updateAction` to push the parent tracker to `in-progress`:

```js
await updateAction(context, {
  actionId: payload.parent_action_id,
  newStage: 'in-progress',
  fields: { child_workflow_id: workflowDoc._id, child_entity_id, child_entity_collection },
  eventId: null,
  force: true,
});
```

Per D11, `updateAction` now invokes `renderStatusMap` + `computeEngineLinks` + `buildActionStageUpdate` on every call — including this one. Two implications:

- **Render context for the parent push.** This call doesn't carry caller-supplied `actionDisplay` or `metadata`. With the safe defaults committed in D11 (`actionDisplay = {}`, `metadata = null`), the parent's `in-progress` cell renders against `{ ...actionDocBeforeWrite, ...fields }` with prior `actionDoc.metadata` only — fine, sticky display fills the gap. But the design doesn't say so explicitly. Should be one line on the `StartWorkflow.js` Modified bullet: "the parent-tracker push at lines 117-128 omits `actionDisplay` / `metadata`; sticky display + prior metadata cover the render."
- **Tracker link computation must see `child_workflow_id`.** D11's "Engine-link merge rule" already covers this (compute `engineLinks` against `{ ...actionDocBeforeWrite, ...fields }`), and the `computeEngineLinks.test.js` plan explicitly asserts the StartWorkflow parent-tracker case. Good — but the `StartWorkflow.js` Modified bullet doesn't reference this constraint, so an implementer reading only the bullet has to cross-reference D11 to know the parent push is the canonical test case for the merge rule. Worth a forward pointer.

**Fix:** rewrite the `StartWorkflow.js` Modified bullet to enumerate:

1. Pass `payload.metadata` through to `createAction` for each starting action.
2. The parent-tracker `updateAction` push at lines 117-128 inherits render + link computation; it omits `actionDisplay` / `metadata` (defaults), and is the call site that produces the tracker's first non-null `link` once `child_workflow_id` is set.

### 5. `fireTrackerSubscription` triggers the same workflow-staleness bug as handleSubmit

> **Resolved.** Added a forward-looking note to the `recomputeWorkflowAfterActionWrite.js` Modified bullet (where #1's resolution lives): future engine paths that dispatch a log event after the recompute must read templates from `recomputeResult.workflow` rather than an earlier-fetched parent workflow doc. Since #1 was resolved by fixing the helper (it now returns a fresh post-write workflow), the path of least resistance for any future caller is already correct — the note guards against the inverse mistake.

[`fireTrackerSubscription.js:73-75`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js) calls `recomputeWorkflowAfterActionWrite` against the parent workflow. The design lists it (design.md:599) as "calls `updateAction` and inherits render + link computation automatically — no edits needed."

That's true for the parent tracker's `updateAction` push. But `fireTrackerSubscription` doesn't dispatch a log event for the parent push, so the workflow-staleness from finding 1 doesn't bite here. Confirmed by reading [`fireTrackerSubscription.js:64-71`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js) (no `dispatchLogEvent` call).

What *does* exercise the staleness: the recursive submit's own `dispatchLogEvent` on the original action runs **after** `fireTrackerSubscription` returns (handleSubmit.js step 10, lines 342-349, runs after step 7's dispatch — so chronologically the child event dispatches first). But if a future part adds a "tracker advanced" event dispatched from inside `fireTrackerSubscription`, the same `recomputeResult.workflow` staleness applies. Mentioning this as a forward-looking note, not a blocker for Part 30.

**No fix needed for Part 30**, but file an explicit note next to finding 1's resolution: "any future engine path that dispatches a log event after `recomputeWorkflowAfterActionWrite` must apply the same workflow-refresh."

## Summary

Two structural problems (workflow-staleness in `recomputeResult`, and the module-scoped pageId mechanism never connecting to engine context) are encoded into the design as "resolved" but won't survive first contact with the code. One naming collision (`workflow_type` on tracker docs) is mechanically tolerable but a future debugging hazard. Findings 4 and 5 are tidy-ups on the StartWorkflow path.

Findings 1 and 2 block tasks 8 and 3 respectively — both rest on assumptions about return shape (1) and runtime context (2) that haven't been verified. Land them before the implementer hits the gap mid-task.

Next: `/r:design-action-review 30-status-map-rendering` to resolve, reject, or defer each finding.
