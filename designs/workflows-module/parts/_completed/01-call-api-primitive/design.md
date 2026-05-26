# Part 01 — `context.callApi` primitive

**Source rationale:** [workflows-module-concept/call-api/spec.md](../../../workflows-module-concept/call-api/spec.md). **Layer:** foundational. **Size:** S. **Repo:** upstream `@lowdefy/api`.

> **Shipped-behaviour deviation (recorded by Part 29).** The "In scope" entry below describes `CallApiResult` as `{ success, response, error? }` with a never-throws contract. That envelope was never built. Shipped `callApi` (the only one — defined in [`callRequestResolver.js:29`](../../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js)) **throws** on a routine-side `:throw` or `:reject` (the resolver inspects `result.status` and re-throws the underlying error), and returns the **raw response** on success. Callers that look like they inspect `result.success` (e.g. [`dispatchNotifications.js:23`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js)) are reading the *invoked routine's own return body* shape, not a callApi envelope. Part 29 operates against the shipped throw-on-error contract; see [Part 29 § D5](../../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-surfaces-as-a-rejection-at-the-calling-app) for the soft-reject discrimination path. Re-specifying `callApi` to the never-throws envelope is out of scope (large blast radius across every existing routine step); the spec text below is preserved for history.

## Goal

Add the `context.callApi(endpoint, payload, options?)` primitive to the Lowdefy request-handler signature so server-side JS handlers can invoke another Lowdefy Api in-process. Gate for every cross-Api flow in the workflows engine (hooks, log events, notifications, `on_complete`).

## In scope

- `context.callApi` function on the handler `context` argument.
- Endpoint resolution:
  - String form `'<endpoint-id>'` — resolves against current app's Api registry.
  - Object form `{ id, module }` — resolves against a specific module's Api registry.
- `CallApiOptions`: `user` (override caller identity for system writes), `pageId`, `timeout`.
- `CallApiResult`: `{ success: boolean, response, error? }`. Never throws — error path returns `success: false`.
- Auth context inheritance: `_user` resolves to the caller's identity by default; `options.user` overrides and the override is logged.
- App globals (`_global`, `_module.*`) inherited from caller's request scope.
- Request-scoped `_depth` counter starting at 0 on the outermost request; default cap 10.
- Payload evaluation: invoked routine sees `_payload` as the literal payload object; `_state` is unavailable inside an invoked routine (throws or undefined per Lowdefy's operator semantics).

## Out of scope / deferred

- **Transaction / session passthrough** — flagged as a follow-up under the concept's [cross-cutting risks](../../../workflows-module-concept/design.md#cross-cutting-open-questions-and-risks). Not in v1.
- **Per-handler depth override** — fixed default-10 cap ships. Revisit if a real consumer hits it.
- **Telemetry** (per-call timing, success rate) — out of v1.

## Depends on

Nothing. First-time work in `@lowdefy/api`.

## Verification

- Unit tests in `@lowdefy/api`:
  - String endpoint resolves to current app's Api map.
  - `{ id, module }` resolves to module-scoped Api map (the cross-module resolution spike).
  - `_user` inheritance: default carries caller identity; `options.user` overrides.
  - Depth cap: chain 11 deep returns the depth error structurally; 10 deep succeeds.
  - Error result: target Api throws → caller receives `{ success: false, error }`, no thrown exception.
  - `_state` unavailable inside invoked routine.
- Integration smoke: a fixture app where an Api routine calls another Api via the primitive (routine-side surface confirmed during implementation) and asserts the chained response.

## Open questions

- Routine-side operator surface for `callApi` (e.g. would migrations want a YAML-side invocation?). Out of scope for the primitive itself.
- Should the depth cap be configurable per app? Default-only in v1.

## Contract to neighbours

- **Parts 8 (side-effect-dispatch), 9 (hook-invocation), 11 (group-on-complete-fanout)** call `context.callApi` to invoke other modules' Apis (events, notifications, hook Apis, `on_complete` Apis). Their contract: pass either string endpoint (own-app Api) or `{ id, module }` (cross-module Api), inspect `success`, surface or swallow `error` per policy.
