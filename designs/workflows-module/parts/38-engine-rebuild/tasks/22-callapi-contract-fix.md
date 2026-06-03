# Task 22: Catch-up — fix landed code to the shipped `callApi` contract

## Context

Every landed `callApi` call site was implemented against the unshipped `{ success }`-envelope proposal (concept [call-api spec](../../../../workflows-module-concept/call-api/spec.md), pre-correction) instead of the shipped framework contract (design § "The shipped `callApi` contract"). The shipped function — defined in `lowdefy/packages/api/src/routes/request/callRequestResolver.js` — is:

```js
const response = await callApi({ endpointId, payload });
```

- Single destructured object argument. The landed `callApi({ id, module }, payload, { user })` shape destructures `endpointId: undefined` → `ConfigError` ("endpoint does not exist") on **every** call. No third argument exists; the caller's identity authorizes the target implicitly.
- `endpointId` is an **opaque pre-scoped string** (`<moduleEntryId>/<endpointId>`); scoping happens at app build via `_module.endpointId`. The engine never constructs prefixes at runtime.
- **Throws on failure**, preserving the error class (`ConfigError`, `UserError` for `:throw`/`:reject`, `RequestError`/`ServiceError` pass through). There is no `{ success, error }` envelope.
- Returns the target's `:return` value (`new-event` returns `{ eventId }`) or `null` when the routine ends without `:return` (`send-notification` under the default empty `send_routine`). Even with the signature fixed, the landed `!result.success` checks misfire on every **successful** call — `new-event`'s return has no `success` field (spurious throw), and `send-notification`'s `null` return TypeErrors on property access.

All unit tests pass because they mock the invented contract. Nothing works against a real Lowdefy server.

Five landed call sites: `shared/phases/commitPlan.js` (`dispatchEvent`), `SubmitWorkflowAction/dispatchNotifications.js` (shared by `commitPlan` step 4 and the legacy handler), and the legacy `SubmitWorkflowAction/invokePreHook.js` / `invokePostHook.js` / `dispatchLogEvent.js` (live in the current engine until tasks 14/15 move/delete them).

## Task

**Wiring — build-time endpoint resolution:**

1. `modules/workflows/module.lowdefy.yaml` — declare `notifications` as a dependency (commit step 4 / `dispatchNotifications` already hard-depends on it; previously undeclared). Also extend the `events` dependency description (currently only "Provides the change_stamp component…") to cover events as the `new-event` dispatch target.
2. `modules/workflows/connections/workflow-api.yaml` — add the `endpoints` property with build-resolved dispatch targets, nested under the file's `properties:` key (the connection file's top level is `id`/`type`/`properties` — beside `type:` the build would ignore it):

   ```yaml
   properties:
     # ...existing properties...
     endpoints:
       new_event:
         _module.endpointId:
           id: new-event
           module: events
       send_notification:
         _module.endpointId:
           id: send-notification
           module: notifications
   ```

3. `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — add `endpoints` (required object; required string fields `new_event`, `send_notification`) with descriptions stating these are build-resolved opaque endpoint ids consumed verbatim by the engine's dispatch helpers.
4. `modules/workflows/resolvers/makeWorkflowApis.js` — `emitHooks` wraps emitted hook ids: `slot[phase] = { '_module.endpointId': api.id }` (string form — own-entry scope; the build walker resolves resolver output the same way it resolves the already-emitted `_module.connectionId`). `params.hooks.{interaction}.{pre|post}` then arrive at the engine as pre-scoped opaque strings. Also change `emitHookApi` and `emitGroupOnCompleteApi` to emit `type: 'InternalApi'` (the per-action submit Api in `emitActionEndpoint` stays `type: 'Api'` — it is the client-invoked surface). Hooks are engine-only by design: built `Api` endpoints are HTTP-callable, and a direct HTTP call to the predictable hook id (`{workflow}-{action}-{interaction}-{pre|post}`) would bypass the engine and its load-phase access gate entirely, firing pre-hook side effects with an attacker-chosen payload. `InternalApi` blocks HTTP (`callEndpoint.js`) and client `CallAPI` actions (`validateCallApiRefs.js`) while staying reachable via engine `callApi` — in-repo precedent: `notifications/api/send-notification.yaml`.

**Engine call sites — shipped call shape, no success checks:**

5. `shared/phases/commitPlan.js` `dispatchEvent` — `context.callApi({ endpointId: context.connection.endpoints.new_event, payload: eventDoc })`; delete the `!result.success` block (commitPlan's existing per-step try/catch is the sole failure capture — a throw from `callApi` lands on `dispatchErrors[]` exactly as D9 specifies); fix the false "`callApi` never throws" docstring to cite the shipped contract.
6. `SubmitWorkflowAction/dispatchNotifications.js` — `context.callApi({ endpointId: context.connection.endpoints.send_notification, payload: { event_ids: [eventId] } })`; delete the `!result.success` block and the synthetic error construction; throws propagate to the caller (commitPlan step-4 catch; legacy handleSubmit step 8).
7. `SubmitWorkflowAction/invokePreHook.js` / `invokePostHook.js` (legacy, until task 14 moves them) — `context.callApi({ endpointId: hookId, payload })` with the pre-scoped id from `params.hooks` passed verbatim; drop the `{ user }` third argument; the no-try/catch posture is already correct and stays. Fix the docstrings the same way item 5 fixes `commitPlan`'s: the `invokePreHook.js` header asserts the inverted rationale ("dispatch uses the `{ id, module: 'workflows' }` form — a bare string would dispatch into the consuming app's own-Api namespace") — after this fix a bare pre-scoped string is exactly the contract. Update both files' headers (and any equivalent `{ id, module }` mention in `invokePostHook.js`).
8. `SubmitWorkflowAction/dispatchLogEvent.js` (legacy, until task 15 deletes it) — same fix as `dispatchEvent`: shipped call shape via `context.connection.endpoints.new_event`, delete the `!result.success` block (a `callApi` throw propagates, preserving the current "throws to request layer" behaviour); keep returning `context.eventId`.

**Tests — re-mock to the shipped contract:**

9. Every affected test re-mocks `callApi` as: resolves the `:return` value (`{ eventId }` for `new-event` targets, `null` for `send-notification`, the hook's response body for hook ids) and **throws** to simulate failure — never `{ success, response }` envelopes, never error-objects-as-return-values. Mocks assert the single-object call shape (`expect(callApi).toHaveBeenCalledWith({ endpointId, payload })`). Affected: `commitPlan.test.js`, `dispatchNotifications.test.js`, `dispatchLogEvent.test.js`, `invokePreHook.test.js`, `invokePostHook.test.js`, `handleSubmit.test.js` (incl. `makeHookCallApi`), `worked-example.test.js`, `event-id-round-trip.test.js`, `fireTrackerSubscription.test.js`, `dispatchNotifications`-adjacent fixtures. Every shared context-builder fixture must also stub `connection.endpoints.{new_event,send_notification}` (`handleSubmit.test.js`, `worked-example.test.js`, `event-id-round-trip.test.js`, `fireTrackerSubscription.test.js`, `commitPlan.test.js`) so mocks assert real id strings rather than `undefined` — without it, `context.connection.endpoints.new_event` TypeErrors, and in `commitPlan` that lands inside the step-3 try/catch as a confusing `dispatchErrors` entry rather than a failed assertion.
10. `makeWorkflowApis.test.js` — emitted `hooks` map values are `{ '_module.endpointId': '<workflow>-<action>-<interaction>-<pre|post>' }` objects, not bare strings. Emitted hook Apis and group on-complete Apis carry `type: 'InternalApi'`; the per-action submit Api carries `type: 'Api'`.

## Acceptance Criteria

- No `result.success` inspection anywhere under `plugins/modules-mongodb-plugins/src/connections/` (grep-clean).
- Every `callApi` invocation passes exactly one argument of shape `{ endpointId: string, payload: object }`; no `{ id, module }` first argument; no third argument.
- `endpoints.new_event` / `endpoints.send_notification` flow from `workflow-api.yaml` through `schema.js` validation into `context.connection.endpoints`; hook ids flow pre-scoped through `params.hooks`.
- `commitPlan` records a `callApi` throw from step 3/4 on `dispatchErrors[]` (test simulates by mock-throwing) and reports **success** (no dispatchErrors entry) when the mock resolves `{ eventId }` / `null` respectively — the case the landed code gets backwards.
- Legacy `handleSubmit` path: a `new-event` mock-throw still surfaces to the request layer; a successful dispatch (mock resolving `{ eventId }`) no longer throws.
- `module.lowdefy.yaml` declares the `notifications` dependency; the demo app builds.
- **Un-mocked wiring check against the built demo artifact** (the build performs no endpoint-id existence check — `resolveModuleEndpointId` only concatenates, so a typo'd id builds clean and fails at runtime): after `pnpm build` on the demo, the workflow-api connection's resolved properties carry `endpoints: { new_event: 'events/new-event', send_notification: 'notifications/send-notification' }`, and at least one emitted submit Api's `hooks.{interaction}.{pre|post}` values are `workflows/...` strings that exactly match emitted Api ids in the same build output. This is the only criterion that exercises the real wiring — the re-mocked tests (criterion 9) are blind to a wrong endpoint string, the same class of gap that shipped the landed code broken.
- Hook Apis and group on-complete Apis are emitted `type: 'InternalApi'` (engine-reachable via `callApi`, blocked over HTTP and from client `CallAPI`); the per-action submit Api stays `type: 'Api'`.
- Test mocks follow the shipped contract per criterion 9.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify (notifications dependency)
- `modules/workflows/connections/workflow-api.yaml` — modify (endpoints property)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify (endpoints field)
- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (`_module.endpointId` hook-id wrapping)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/commitPlan.js` — modify (`dispatchEvent` + docstring)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js` — modify
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePreHook.js` — modify (legacy; task 14 moves later)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePostHook.js` — modify (legacy; task 14 moves later)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — modify (legacy; task 15 deletes later)
- affected `*.test.js` per criterion 9/10 — modify

## Notes

- **Sequencing: before task 14.** The hook wrappers task builds on the corrected contract (its task file now references this one); landing 22 first keeps the legacy engine coherent in the interim — once `makeWorkflowApis` emits pre-scoped hook ids, the legacy `{ id: hookId, module: "workflows" }` form would double-scope.
- Group `on_complete` Api ids (`emitGroupOnCompleteApi`) are emitted but not yet dispatched (Part 11 fan-out, unimplemented). When that lands, the same `_module.endpointId` wrapping applies to the emitted on-complete ids.
- `connection.entry_id` is no longer needed for hook-id prefixing (the build resolves scoping); it remains for `computeEngineLinks`' pageId mechanic — don't remove it.
- Task 13's deviation note points here; the concept [call-api spec](../../../../workflows-module-concept/call-api/spec.md) and Part 1's corrected deviation note document the shipped contract authoritatively.
