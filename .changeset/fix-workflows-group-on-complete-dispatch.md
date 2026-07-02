---
"@lowdefy/modules-mongodb-workflows": patch
"@lowdefy/modules-mongodb-plugins": patch
---

**Fix: group `on_complete` routines were never dispatched** — `makeWorkflowApis` emitted the `{type}-group-{id}-on-complete` InternalApis and `planSubmit` computed `completedGroups`, but nothing ever fired the endpoints, so an authored group `on_complete` silently never ran (the docs promised the engine fires it). A new `dispatchGroupOnComplete` phase now runs post-commit — after the workflow/actions/event/notifications commit, ahead of the tracker cascade and post-hook (matching the documented lifecycle) — and fires each completed group's routine. The submit endpoint carries the group→endpoint id map on `params.group_on_complete` (same build-resolved `_module.endpointId` mechanism as hooks). The `on_complete` payload mirrors the post-hook `context` so a routine can reach the committed workflow doc. Failures propagate after writes have landed, so `on_complete` routines must be idempotent — the same contract as post-hooks.
