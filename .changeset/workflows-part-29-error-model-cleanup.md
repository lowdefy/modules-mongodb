---
"@lowdefy/modules-mongodb-plugins": patch
---

Workflows Part 29 — error-model cleanup.

`SubmitWorkflowAction` no longer synthesises an `error` transition on mid-write failure. Steps 4–11 of the lifecycle propagate throws to `CallApi` via bare propagation — the user retries the same submit and the priority rule + same-stage-self exception converge under partial writes. The `error_transition` field on the handler return is removed; failures throw, success returns the structured shape only. The `StatusEntry` typedef drops the polymorphic `reason` / `error_message` / `error_metadata` fields (no shipped writer ever populated them) and gains `event_id` to match what `shared/updateAction.js` writes today. Behaviour for pre-hook `actions: [{ status: 'error' }]` returns, `resolve_error` recovery (still uses internal `force: true`), and the priority table are all unchanged.

Pin bump: requires `@lowdefy/*` peer deps at `0.0.0-experimental-20260526123919` (or later) for `UserError.isReject` + `runRoutine` reject reclassification — the upstream support for transparent `:reject` propagation from pre-hooks.
