# CallApi from Plugin Connections — Spec

`context.callApi` primitive on `@lowdefy/api` request handlers. Full rationale in [design.md](designs/workflows-module-concept/call-api/design.md); this file carries only the committed decisions.

**Status:** Upstream-Lowdefy work in `@lowdefy/api`. First consumer: [submit-pipeline](../submit-pipeline/design.md). Submit-pipeline is gated on this landing.

## API surface

Added to the existing plugin-connection request-handler signature:

```ts
type CallApiEndpoint = string | { id: string; module: string };

interface CallApiOptions {
  user?: object; // override caller's user context; defaults to inheriting
  pageId?: string; // override caller's pageId; defaults to inheriting
  timeout?: number; // ms; defaults to remaining handler budget
}

interface CallApiResult {
  success: boolean;
  response: object;
  error?: { type: string; message: string; stack?: string };
}

type CallApi = (
  endpoint: CallApiEndpoint,
  payload: object,
  options?: CallApiOptions,
) => Promise<CallApiResult>;
```

Available on the handler context:

```js
async function MyHandler({ payload, connection, context }) {
  const result = await context.callApi('some-endpoint', { ... });
  if (!result.success) {
    // handle error
  }
}
```

**Endpoint resolution:**

- `string` form → resolves against the host app's Api registry (top-level Api ids).
- `{ id, module }` form → resolves a module-scoped Api (same semantics as YAML's `_module.endpointId: { id, module }`).

## Auth context

**Default: inherit caller's user.** Hook resolves `_user` to the same identity that initiated the parent request. Inherited:

- User object (`_user.id`, `_user.profile`, `_user.roles`)
- `pageId` (for `apps.{app_name}.roles` resolution on `user_contacts`)
- App globals (`_global`, `_module.*`)

**Override:** Set `options.user` to call as a different identity (e.g. system writes). Logged on the call.

## Depth limit

Every `context.callApi` invocation increments a request-scoped `_depth` counter. Default limit **10**. Exceeded → throws structured error citing the call chain:

```
CallApiDepthError: depth limit (10) exceeded in chain:
  SubmitWorkflowAction → pre-hook(qualify-pre-submit) → update-action-qualify → SubmitWorkflowAction → ...
```

Counter rides on the request-scoped context object handlers can't accidentally drop. Per-handler override possible if a real use case surfaces.

## Error propagation

Errors raised inside an invoked Api return as `{ success: false, error }` to the caller. Caller decides what to do:

- **Pre-hook errors** → submit-pipeline aborts the submit, writes `status: error` with captured context (engine Decision 5).
- **Side-effect errors** (events, notifications) → logged, submit continues.
- **Post-hook errors** → never abort; surfaced as `post_hook_response.error` on caller's API return.

Behaviour is per-call. `context.callApi` itself doesn't decide.

## Payload evaluation

- Handler passes a **literal** payload (no `_state` — there's no page state server-side).
- Invoked Api's routine still goes through full operator evaluation.
- `_user` resolves to inherited user (or `options.user` if overridden).
- `_payload` resolves to the literal payload the handler passed.
- `_state` is **not available**. APIs requiring `_state` aren't safely callable via `context.callApi`; documented in README.

## Implementation

In `@lowdefy/api`:

1. Extend the handler signature — all existing handlers get the new `context` parameter; ignore-by-default for handlers that don't use it.
2. Implement `context.callApi` as a thin wrapper over the existing Api-invocation machinery (the same path the page-side `CallApi` block uses).
3. Add depth counter on the request-scoped context.
4. Add auth-context inheritance / override surface.

## Test coverage required

- Cross-module reference (`{ id, module }`) resolves correctly from JS.
- Auth inheritance: `_user` inside invoked API resolves to caller's identity.
- Auth override: `options.user` works and is logged.
- Depth limit: chain of `n+1` recursive calls throws structured error.
- Error propagation: thrown error inside invoked Api returns `{ success: false, error }`.
- Payload evaluation: `_payload` resolves; `_state` is undefined / errors.

## Non-goals

- General-purpose RPC (use a normal HTTP client for external services).
- Page-side state access (`_state` deliberately unavailable).
- Replacing the page-side `CallApi` block.
- Streaming responses (out of scope; not in v1).
- Transaction propagation (v2 concern when transactional engine writes land).
- Result caching (would hide side-effect bugs).

## Open questions

1. **Spike before implementation.** Confirm cross-module Api invocation works from a JS handler — reuse the YAML-side `_module.endpointId: { id, module }` resolver against the in-process Api registry.
2. **Telemetry.** Per-call timing + depth + success rate. Recommended but not blocking.
3. **Streaming.** Not in scope but flagged for v2.

## Dependents

- **[submit-pipeline](../submit-pipeline/design.md)** — Decisions 1, 4, 6 all depend on this.
- **[engine](../engine/design.md)** — Future opt-in for the engine to call events/notifications module APIs directly.
- **[action-groups](../action-groups/design.md)** — Decision 6's `on_complete` fan-out implementable once this lands.
