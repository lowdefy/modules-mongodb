# CallApi from Plugin Connections — Spec

`callApi` function in the request-resolver argument bag in `@lowdefy/api`. Full rationale in [design.md](designs/workflows-module-concept/call-api/design.md); this file carries only the committed decisions.

**Status: shipped.** Defined in [`callRequestResolver.js`](../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js). This spec documents the shipped contract, which differs from the originally proposed surface (see § Deviations from the original proposal). First consumer: [submit-pipeline](../submit-pipeline/design.md).

## API surface

`callApi` is passed in the request-resolver argument bag (alongside `connection`, `payload`, `request`, etc.):

```js
async function MyResolver({ payload, connection, callApi }) {
  const response = await callApi({ endpointId, payload });
}
```

```ts
type CallApi = (args: {
  endpointId: string; // required
  payload?: object; // already-evaluated literal; becomes the target's _payload
}) => Promise<any>;
```

- `endpointId` — **opaque string**. Module endpoints use a `<moduleEntryId>/<endpointId>` id; `callApi` does not parse or resolve it. Scoping happens at **app build time** via `_module.endpointId` (string form → own-module scope; `{ id, module }` form → dependency scope). Resolved ids reach the resolver as plain strings through connection properties or baked-in endpoint params — the engine never constructs prefixes at runtime.
- `payload` — optional object passed to the target routine as `_payload`. Already evaluated by the caller; the target's routine still goes through full operator evaluation.

**Return value.** The value returned by the target's `:return` step, or `null` if the target routine terminates without an explicit `:return`. There is **no envelope** — no `{ success, response, error }` wrapper.

## Errors

**`callApi` throws on failure.** The thrown error preserves its underlying class so resolvers can branch on it:

- `ConfigError` — unknown endpoint id, unauthorized against the target, or depth cap exceeded. Unauthorized collapses to the same "does not exist" message as a missing endpoint to avoid leaking endpoint existence.
- `UserError` — the target routine terminated with `:throw` or `:reject`. Catch this class to distinguish a deliberately-failed routine from a system fault. `:reject` carries `isReject: true`.
- Other Lowdefy error classes (`RequestError`, `ServiceError`) propagate unchanged from the target's failure site.

Caller decides what to do per call:

- **Pre-hook errors** → propagate; `:reject` surfaces as a rejection at the calling app ([Part 29 § D5](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md)).
- **Side-effect errors** (events, notifications, change-log) → caught per step by the commit phase and recorded on `dispatchErrors` (Part 38 D9) — the workflow/action writes are already durable by then.
- **Post-hook errors** → propagate; authors must make post-hooks idempotent.

## Auth context

**The caller's user identity authorizes the target endpoint — no auth bypass, no override.** There is no `options.user`; system-identity calls are not part of the shipped surface.

The target runs in an **isolated routine context**: fresh `_payload`, fresh `_state`, fresh `_step` namespace. The target inherits the caller's parser closure — `_user`, `_secret`, `_env` resolve to the same values as the caller.

Internal API endpoints (`type: InternalApi`) are reachable.

## Depth limit

Endpoint calls share a per-chain depth cap of **10** with routine `:call_api` steps. Exceeding the cap throws.

## Payload evaluation

- Resolver passes a **literal** payload (no `_state` — there's no page state server-side).
- Invoked Api's routine still goes through full operator evaluation.
- `_payload` resolves to the literal payload the resolver passed.
- `_state` starts fresh (empty) in the target's routine context.

## Deviations from the original proposal

The originally proposed surface (preserved in [Part 1's design](../../workflows-module/parts/_completed/01-call-api-primitive/design.md) for history) was never built. Shipped differences:

| Proposed | Shipped |
| --- | --- |
| `callApi(endpoint, payload, options?)` — positional args | `callApi({ endpointId, payload })` — single destructured object |
| `endpoint: string \| { id, module }` — runtime module resolution | `endpointId: string` — opaque, pre-scoped at build time via `_module.endpointId` |
| Returns `{ success, response, error? }`; never throws | Returns the `:return` value (or `null`); **throws** on failure |
| `options.user` identity override | No override — caller identity always |
| `options.pageId`, `options.timeout` | Not built |

Any resolver code that passes `{ id, module }` as the first argument, passes a third `{ user }` argument, or inspects `result.success` is written against the unshipped proposal and fails at runtime — `endpointId` destructures to `undefined` (ConfigError), and no shipped routine returns a `success` field. See Part 38 task 22 for the engine-side fix.

## Non-goals

- General-purpose RPC (use a normal HTTP client for external services).
- Page-side state access (`_state` deliberately unavailable).
- Replacing the page-side `CallApi` action.
- Streaming responses.
- Transaction propagation (v2 concern — the target runs on its own clients; see Part 38 § events-outside-transaction).
- Result caching (would hide side-effect bugs).

## Dependents

- **[submit-pipeline](../submit-pipeline/design.md)** — Decisions 1, 4, 6 all depend on this.
- **[engine](../engine/design.md)** — the engine calls events/notifications module APIs directly.
- **[action-groups](../action-groups/design.md)** — Decision 6's `on_complete` fan-out.
- **Part 38 (engine rebuild)** — commit-phase steps 3–4 dispatch via `callApi`; hook phases invoke pre/post hook endpoints.
