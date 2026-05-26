# CallApi from Plugin Connections

A new Lowdefy primitive: invoking a Lowdefy `Api` from inside a plugin connection's request handler. Currently plugin handlers can read connection-shaped Mongo / S3 / SQL but can't call back into the Lowdefy Api layer to invoke other modules' Apis or app-supplied routines.

This sub-design carves out the primitive on its own because it's load-bearing for [submit-pipeline](../submit-pipeline/design.md) and likely useful for any future plugin that needs to compose Lowdefy Apis server-side. The workflows module is the first concrete consumer; the capability is upstream-Lowdefy work in `@lowdefy/api`.

## Problem

Plugin connection handlers in `@lowdefy/api` have access to `{ blockId, connection, connectionId, pageId, request, requestId, payload }` — Mongo client, S3 client, the request payload, page context. They have no way to invoke another Lowdefy `Api` by id.

What we want server-side:

1. **Submit-pipeline pre/post hooks.** Engine handler runs a workflow submit; needs to call author-supplied Lowdefy Apis (the pre and post hooks declared on the action YAML — see submit-pipeline Decision 4) by endpoint id.
2. **Cross-module API invocation from the engine.** Same handler logs an event via `events.new-event` and dispatches notifications via `notifications.send-notification` — both Lowdefy Apis the engine needs to invoke directly rather than asking the caller to route them.
3. **Action-groups `on_complete` fan-out.** Engine computes which groups completed in this submit and fires the `on_complete` Lowdefy Api per declared group ([action-groups](../action-groups/design.md) Decision 6).

The status-quo workaround is to push all these calls back through the caller's routine — page or app-side hook routes through `CallApi` blocks in YAML before/after invoking the plugin connection. That's exactly the inversion submit-pipeline rejects: orchestration in the routine layer instead of the engine. To pull orchestration into the engine, the engine needs to be able to call APIs itself.

## Proposed shape

Add `context.callApi(endpointId, payload, options?)` to the request-handler signature in `@lowdefy/api`:

```js
async function SubmitWorkflowAction({ payload, connection, context }) {
  // ... validate, compute auto-unblocks ...

  if (preHookId) {
    const preResult = await context.callApi(preHookId, {
      workflow_id, action_id, interaction, form, ...
    });
    // merge preResult.actions[] with auto-unblocks
  }

  // ... engine writes ...

  await context.callApi(
    { id: 'new-event', module: 'events' },
    { type: 'action-submit_edit', references: { workflow_ids: [workflow_id], action_ids: [action_id] }, ... }
  );

  // ... post hook ...
}
```

The `context` object is added to the existing handler signature, alongside the current `{ blockId, connection, connectionId, pageId, request, requestId, payload }`. Plugins that don't need to call APIs ignore it; plugins that do get the capability without each implementing it.

## Decision 1 — API surface

Single function on `context`:

```ts
context.callApi(
  endpoint: string | { id: string; module: string },
  payload: object,
  options?: {
    user?: object,                  // override caller's user context; defaults to inheriting
    pageId?: string,                // override caller's pageId; defaults to inheriting
    timeout?: number,               // ms; defaults to remaining handler budget
  }
): Promise<{ success: boolean, response: object, error?: object }>
```

**Endpoint resolution.**

- String form `'my-endpoint'`: resolves against the host app's Api registry.
- Object form `{ id: 'new-event', module: 'events' }`: resolves the events module's `new-event` Api, scoped under the events module's entry id. Matches the existing `_module.endpointId: { id, module }` operator semantics so cross-module references work the same way they do from YAML.

**Return shape.** Always `{ success, response, error? }`. Success means the API ran to completion and returned its body; failure means the API threw / aborted. Plugin handler decides what to do on failure (abort the submit, log and continue, retry, etc.).

**Async by default.** Returns a Promise; handler `await`s. Caller can fire-and-forget by intentionally not awaiting (with the usual concurrency caveats).

## Decision 2 — Auth context inheritance

Pre/post hooks and cross-module API calls happen inside an already-authenticated user's submit request. The hook's `auth:` block + per-API role checks need the caller's user context to evaluate correctly.

**Default: inherit.** `context.callApi` passes through:

- The original caller's user object (`_user` operator resolves to the same identity).
- The original caller's `pageId` (so `_user.roles` resolves against the right `apps.{app_name}` roles entry).
- The original caller's app context (lowdefy `_global`, `_module.*` resolutions).

**Override allowed.** `options.user` lets the plugin call an API as a different user (e.g. a "system" identity for internal writes). Use sparingly; logs the override on the call.

**Why pass-through is the default.** The realistic case is "the engine is invoking a hook on behalf of the user who clicked submit; the hook needs to know who that is." Any other default would force every hook to re-resolve the user from the payload, which is fragile and easy to bypass.

## Decision 3 — Depth-limit guard

A pre-hook calls back into another Api that calls back into a per-action endpoint (`update-action-{action_type}`) that fires another pre-hook... pathological recursion is possible. Engine-driven recursion (tracker subscription cascading, group `on_complete` triggering another submit) is also possible.

**Mitigation:** `context.callApi` carries a hidden `_depth` counter on every invocation. Default limit 10. Exceeded → throws a structured error citing the call chain. Configurable per-handler if a real use case surfaces a need to go deeper.

Matches the tracker-subscription depth-limit mitigation already documented in [engine](../engine/design.md) Decision 3 "Failure-mode story." Same mitigation family, applied at the CallApi layer so every recursive path is covered.

## Decision 4 — Error propagation

**Amended by [Part 29 § D6](../../workflows-module/parts/29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws) and [Part 1 Deviation note](../../workflows-module/parts/_completed/01-call-api-primitive/design.md).** Shipped `callApi` throws on `:reject` / `:throw` rather than returning a `{ success: false, error }` envelope. The 11-step submit lifecycle catches nothing — every step that throws propagates to `CallApi`. Concretely:

- **Pre-hook throws** propagate. Authors choose between `:reject` (user-facing rejection — propagates as `UserError(isReject: true)`, surfaced as a `'reject'` by the wrapping endpoint's `runRoutine`; see [Part 29 § D5](../../workflows-module/parts/29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently)) and `throw` (infrastructure failure — surfaced as a transient error toast). No engine-side `error` transition is written; no `hook_error` return field exists.
- **Side-effect throws** (events module call fails, notifications call fails) propagate. The user sees the submit as failed — honest reporting, since they may want to manually notify the affected party while the system retries. The notifications module's own retry/queue still operates independently.
- **Post-hook throws** propagate. Writes from steps 4–10 stay durable (deliberately non-atomic); authors must make post-hooks idempotent. No `post_hook_error` soft-surface field.

The single rule: failures throw; success returns the structured success shape. `context.callApi`'s contract is unchanged — it still throws on inner-routine `:reject` / `:throw` and returns the raw response on success.

## Decision 5 — Payload evaluation

The Lowdefy Api layer normally evaluates operators (`_state`, `_user`, `_payload`, etc.) on inbound payloads before the handler sees them. When `context.callApi` invokes an Api from inside a handler:

- The handler builds a literal payload (no `_state` — it's not running in a page context).
- The Api's routine still goes through standard operator evaluation against the inherited user/page context.
- `_user` resolves to the inherited caller. `_payload` resolves to the literal payload the handler passed.
- `_state` is **not available** — there's no page state inside a server-side call. APIs that depend on `_state` aren't safely callable via `context.callApi`. Document this in the README.

## Decision 6 — Implementation location

Add the capability in `@lowdefy/api` (the existing Lowdefy package that handles Api request types — Mongo, S3, JS, CallApi blocks, etc.). Two implementation steps:

1. **Extend the handler signature.** All existing handlers get the new `context` parameter; ignore-by-default for handlers that don't use it.
2. **Implement `context.callApi`** as a thin wrapper around the Api invocation flow that already serves the page-side `CallApi` block. Reuse the existing Api-resolution, operator-evaluation, and execution machinery; add the depth counter and the auth-context inheritance / override surface.

The `WorkflowAPI` plugin connection in `@lowdefy/modules-mongodb-plugins` is the first consumer; no plugin changes needed in other packages.

## Open Questions

1. **Spike before implementation.** First-time work — cross-module reference from inside a handler is verified to work in YAML (the contacts module's `update-contact` calls cross-module Apis); the same machinery should be reachable from JS. Spike confirms before commitment.
2. **Streaming responses?** `context.callApi` returns a single response. If an upstream Api ever streams (e.g. an `Api` of type `JS` that yields incrementally), the contract needs revisiting. Not in scope for v1.
3. **Transaction propagation.** If the engine handler is wrapped in a Mongo session (v2 transactional atomicity), should `context.callApi` propagate the session to invoked APIs that also write Mongo? Out of scope for v1; flagged as a v2 concern.
4. **Caching.** If a handler calls the same API multiple times with the same payload, should results be cached? No — pre/post hooks are side-effecting by nature; caching would hide bugs. Documentation note only.
5. **Telemetry.** Per-call telemetry (timing, depth, success rate) for observability. Recommended but not blocking.

## Non-Goals

- **General-purpose RPC.** This is a single primitive for Lowdefy Apis. Plugins that need to call external HTTP services use whatever HTTP client they already use.
- **Page-side state access.** Already covered in Decision 5 — `_state` is intentionally unavailable.
- **Replacing the page-side `CallApi` block.** The block stays; nothing about page-to-Api invocation changes.

## Risks

- **Behavioural drift between handler-side and YAML-side Api invocation.** Two paths to call an Api means two surfaces to keep in sync. Mitigation: handler-side is a thin wrapper over the YAML-side machinery — single implementation, two entry points.
- **Depth-limit miscounting.** The depth counter has to ride invisibly through every Api invocation, including ones that pass through plugin connections that don't know about it. Mitigation: counter lives on a request-scoped context object that handlers can't accidentally drop; verified by tests of recursive paths.
- **First-time work on a critical primitive.** Mitigation: spike (Open Question 1) + reuse of existing machinery wherever possible.

## Interaction with the workflows module

This sub-design is a dependency:

- **[submit-pipeline](../submit-pipeline/design.md)** — Cannot be implemented until this lands. Submit-pipeline's Decisions 1, 4, and 6 all require `context.callApi`.
- **[engine](../engine/design.md)** — Once available, the engine's submit lifecycle calls the events module's `new-event` and the notifications module's `send-notification` directly via `context.callApi`. The status-quo where these are routed through the caller's routine becomes optional.
- **[action-groups](../action-groups/design.md)** — Decision 6's `on_complete` fan-out is implementable via `context.callApi` once the primitive lands.

## Next Step

1. Spike to confirm cross-module Api invocation works from a JS handler — reuse the YAML-side `_module.endpointId: { id, module }` resolver against the in-process Api registry.
2. Land the handler-signature extension + `context.callApi` implementation in `@lowdefy/api`.
3. Add depth-limit guard + auth-context inheritance.
4. Tests covering recursive paths, error propagation, auth pass-through, payload evaluation.
5. Release `@lowdefy/api` with the new capability; bump `@lowdefy/modules-mongodb-plugins` peerDep.
6. Submit-pipeline implementation can then proceed.
