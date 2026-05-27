---
"@lowdefy/modules-mongodb-workflows": patch
"@lowdefy/modules-mongodb-plugins": patch
---

Workflows Part 32 — drop static `interactions.status` override.

Per-interaction target-status resolution collapses from three layers to two: engine default, then pre-hook return `status`. The static action-YAML `interactions: { <interaction>: { status } }` block is dropped from the build pipeline — pre-hooks are now the only override channel for status.

- `modules-mongodb-workflows`: `makeWorkflowApis` no longer bakes the `interactions:` literal into the per-action endpoint payload (the `emitInteractions` helper and its `interactionsMap` plumbing are removed). The `event_overrides:` literal is unchanged. `makeWorkflowsConfig` has no unknown-keys rejection, so stale `interactions:` fields on existing action YAMLs are silently accepted and ignored.
- `modules-mongodb-plugins`: `resolveTargetStatus` drops the `yamlInteractions` parameter and adds a runtime enum-membership check on the pre-hook `status` return. A non-`action_statuses` value throws `UserError(isReject: false)` inside `resolveTargetStatus` — fired after pre-hook invocation but before step-4 writes, so the action doc is unchanged on a misspelled-status throw; `runRoutine` classifies the throw as `{ status: 'error' }` (not `:reject`). `handleSubmit` stops passing `params.interactions` through both `resolveTargetStatus` call sites; the `mergeEventOverrides` call site is unchanged. A small local `UserError` class lives in `SubmitWorkflowAction/UserError.js` (matches `runRoutine`'s `name === 'UserError'` / `isReject` discrimination shape).

Behavioural change in the demo onboarding workflow: `send-quote.request_changes` now lands `changes-required` (engine default) instead of the previous `action-required` Layer-2 override. Accepted per the design — the static override existed only to demonstrate Layer 2, not because the demo flow depended on it.
