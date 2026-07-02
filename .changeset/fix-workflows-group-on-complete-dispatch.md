---
"@lowdefy/modules-mongodb-workflows": patch
"@lowdefy/modules-mongodb-plugins": patch
---

**Fix: group `on_complete` routines were never dispatched** — `makeWorkflowApis` emitted the `{type}-group-{id}-on-complete` InternalApis and `planSubmit` computed `completedGroups`, but nothing ever fired the endpoints, so an authored group `on_complete` silently never ran (the docs promised the engine fires it). A new `dispatchGroupOnComplete` phase now fires each completed group's routine post-commit, after the tracker cascade and ahead of the post-hook.

Fan-out covers **both the submitted workflow and any parent workflow** reached by tracker propagation: when a child completes and a parent group thereby transitions to `done`, that parent group's `on_complete` fires too, with `context.workflow` set to the parent doc. `planTrackerLevel` computes each cascade level's completed-group diff; the submit endpoint carries a build-resolved `workflow_type → group_id → endpoint` bundle (own workflow + ancestors) on `params.group_on_complete`, and the dispatcher resolves each completion by its `workflow_type` (same `_module.endpointId` mechanism as hooks). The payload mirrors the post-hook `context` so a routine can reach the committed workflow doc. Failures propagate after writes have landed, so `on_complete` routines must be idempotent — the same contract as post-hooks. Does not fire on cancel or close.
