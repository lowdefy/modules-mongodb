---
"@lowdefy/mongodb-workflows-sdk": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Split the workflow engine out of the Lowdefy plugin into `@lowdefy/mongodb-workflows-sdk`, a framework-agnostic package consumable from any Node service (AWS Lambda microservices etc.) to start workflows, submit signals, and query workflow state.

- New package `@lowdefy/mongodb-workflows-sdk`: `createWorkflowsEngine(config)` exposes the full verb surface (`startWorkflow`, `submitAction`, `cancelWorkflow`, `closeWorkflow`, `updateActionFields`, and the read envelopes). External dispatch is injected via semantic callbacks (`emitEvent`, `sendNotification`, `resolveEntityData`) and pre/post hooks are plain async functions — no Lowdefy concepts in the core. FSM tables export at `@lowdefy/mongodb-workflows-sdk/fsm`; an in-memory Mongo test harness at `@lowdefy/mongodb-workflows-sdk/testing`.
- `@lowdefy/modules-mongodb-plugins`: the `WorkflowAPI` and `EventsTimeline` connections are now thin adapters over the SDK (mapping `callApi`, connection properties, and hook endpoint ids onto the SDK's callbacks). The Lowdefy-facing surface — connection schemas, request types, YAML — is unchanged. The unused `@lowdefy/community-plugin-mongodb` and `mongodb` peer dependencies were dropped.
- Breaking for deep importers only: engine internals are no longer shipped in the plugin's `dist` (the `"./*"` wildcard no longer reaches them). The `"./fsm"` entry still works via re-export; prefer `@lowdefy/mongodb-workflows-sdk/fsm`.
