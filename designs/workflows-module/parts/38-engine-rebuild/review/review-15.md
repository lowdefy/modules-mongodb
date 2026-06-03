# Review 15 — Task 22 (callApi contract fix)

Scope: `tasks/22-callapi-contract-fix.md`, verified against the shipped framework (`lowdefy/packages/api`, `lowdefy/packages/build`) and the landed engine code.

**Verification notes — the task's factual core holds.** Every load-bearing claim was checked against source and is correct: the shipped signature and throw-on-failure semantics (`callRequestResolver.js:29–57`, `invokeEndpoint.js:23–45`); `endpointId: undefined` → `ConfigError "API Endpoint "undefined" does not exist."` (`getEndpointConfig.js:22`); `_module.endpointId` string + `{ id, module }` forms resolving to `${entryId}/${id}` (`walker.js:449–474`), matching the build's endpoint scoping exactly (`buildModules.js:102`); resolver output walked under the module entry's context (`walker.js:683` step 11; `forRef` inherits `moduleEntry`, `walker.js:106`); cross-module form requiring a declared dependency (`resolveDepTarget.js:37–43` — justifying item 1; demo's `modules.yaml:31` has a `notifications` entry, so auto-wiring works); `new-event` returning `{ eventId }` and honoring a payload `_id` (`new-event.yaml:13–16,27–29`); `send-notification` defaulting to an empty routine → `null` return; the five landed call sites and the affected-test list (grep-confirmed: exactly `commitPlan.js:124`, `dispatchNotifications.js:23`, `dispatchLogEvent.js:123` inspect `result.success`; the two hook invokers carry the wrong shape); and the cross-references (task 13 deviation note, Part 1 correction note, task 14's dependence on this task). The findings below are additions, not corrections.

## Design gap

### 1. Hook (and group on-complete) Apis are emitted as HTTP-exposed `type: 'Api'` — they should be `InternalApi`, and this task is the natural owner

> **Resolved.** Folded into task 22 as proposed: item 4 now also flips `emitHookApi` and `emitGroupOnCompleteApi` to `type: 'InternalApi'` (submit Api stays `Api`), with the security rationale and the `send-notification` precedent; criterion 10 and the acceptance criteria assert the emitted types.

`emitHookApi` (`makeWorkflowApis.js:11–17`) emits hook routines with `type: 'Api'`, and `emitGroupOnCompleteApi` (`:95–102`) does the same. Built `Api` endpoints are HTTP-callable; the shipped framework blocks only `InternalApi` over HTTP (`callEndpoint.js:36–37`) and from client `CallAPI` actions (`validateCallApiRefs.js:45`), while keeping them reachable via `callApi` (`callApi.integration.test.js:333` — "InternalApi endpoint is reachable via callApi").

Hooks are engine-only by design — "Single `callApi` to the hook routine" (design § Pre-hook phase), and the load-phase access gate exists precisely so "unauthorized users never trigger pre-hook external side effects" (design.md:62, **"Do not move the check after the pre-hook"**). A direct HTTP call to the predictable id `{entry}/{workflow}-{action}-{interaction}-{pre|post}` bypasses that gate — and the whole engine — entirely, firing pre-hook side effects (third-party writes, callApi chains) with an attacker-chosen payload. Depending on the consuming app's `auth.api` config these endpoints are public or merely session-gated; either way the engine's per-verb access model (Part 34 D16) never runs.

The fix is one line per emitter: `type: 'InternalApi'` in `emitHookApi` and `emitGroupOnCompleteApi` (the per-action submit Api in `emitActionEndpoint` must stay `Api` — it is the client-invoked surface). In-repo precedent: `notifications/api/send-notification.yaml:2` is already `InternalApi` for exactly this reason. Since task 22 item 4 is already rewriting the hook-emission/dispatch seam, fold it in here (plus a `makeWorkflowApis.test.js` assertion per criterion 10); if deliberately deferred, assign an owner explicitly — today no design or task owns it.

## Stale text the task leaves behind

### 2. The legacy hook invokers' docstrings state the *inverted* rationale — item 7 should fix them the way item 5 fixes `commitPlan`'s

> **Resolved (auto).** Item 7 now instructs fixing both invokers' docstring headers (the `{ id, module: 'workflows' }` rationale becomes the inverse of the contract) the same way item 5 fixes `commitPlan`'s.

`invokePreHook.js:6–10`: "Hook Apis are emitted under the workflows module entry by makeWorkflowApis (Part 13), so dispatch uses the `{ id, module: 'workflows' }` form — **a bare string would dispatch into the consuming app's own-Api namespace**." After items 4/7, a bare (pre-scoped) string is exactly the contract. The task explicitly fixes the equivalent false docstring in `commitPlan.js` ("fix the false '`callApi` never throws' docstring", item 5) but items 7/8 say nothing about the hook invokers' headers. Even granting these files are legacy (task 14 moves them), the task's own premise is that the legacy engine stays coherent in the interim — a comment asserting the opposite of the code below it isn't coherent. Add the docstring update to item 7 (and the equivalent `{ id, module }` mention in `invokePostHook.js` if any survives the edit).

## Verification gap

### 3. Every acceptance criterion is mock- or grep-based; nothing checks the *resolved* wiring — and the build performs no existence check on endpoint ids

> **Resolved.** Added the un-mocked acceptance criterion as proposed: after `pnpm build` on the demo, the built artifact must show the connection's resolved `endpoints` map (`events/new-event`, `notifications/send-notification`) and emitted submit Apis' hook values as `workflows/...` strings matching emitted Api ids in the same build output. Verified `resolveModuleEndpointId` (walker.js:449–474) only concatenates — no existence check — so this is the sole build-level check of the real wiring.

`resolveModuleEndpointId` (`walker.js:449–474`) only concatenates `${targetEntry.id}/${arg.id}` — it never validates that the target module actually exports an endpoint with that id. A typo (`id: new-events`) builds clean and fails at runtime with `ConfigError`, which is precisely the failure class this task exists to eliminate: the landed code shipped broken because "all unit tests pass because they mock the invented contract" (task Context), and criterion 9's re-mocked tests are equally blind to a wrong endpoint *string*. The only non-mock criterion is "the demo app builds", which catches a missing dependency declaration (`resolveDepTarget` throws) but not a wrong id.

Add one un-mocked acceptance criterion against the built demo artifact: the workflow-api connection's resolved properties carry `endpoints: { new_event: 'events/new-event', send_notification: 'notifications/send-notification' }`, and at least one emitted submit Api's `hooks.{interaction}.{pre|post}` values are `workflows/...` strings that exactly match emitted Api ids in the same build output. Cheap (read the build dir after `pnpm build` on the demo), and it closes the loop the mocks can't. Part 45's e2e covers this eventually, but that is bands away — the same "verified only by mocks" gap shouldn't ship twice.

## Small gaps

### 4. Fixture and snippet details worth one line each

> **Resolved (auto).** All three applied: criterion 9 now requires stubbing `connection.endpoints.{new_event,send_notification}` in the five shared context builders (naming the commitPlan dispatchErrors failure mode); item 2's snippet nests `endpoints:` under `properties:` with a note on why; item 1 now also extends the `events` dependency description to cover the `new-event` dispatch target.

- **Test fixtures must stub `connection.endpoints`.** Criterion 9 lists the affected test files but not that every shared context builder (`handleSubmit.test.js:49`, `worked-example.test.js:139`, `event-id-round-trip.test.js:99`, `fireTrackerSubscription.test.js:582/727`, `commitPlan.test.js`) needs `connection.endpoints.{new_event,send_notification}` added. Without it, `context.connection.endpoints.new_event` TypeErrors — and in `commitPlan` that lands inside the step-3 try/catch as a confusing `dispatchErrors` entry rather than a failed assertion. State it so the mocks assert real id strings rather than `undefined`.
- **Item 2's YAML snippet shows `endpoints:` at file top level.** In `workflow-api.yaml` it must nest under `properties:` (`workflow-api.yaml:3`) — the connection file's top level is `id`/`type`/`properties`. The snippet as written would put it beside `type:` where the build ignores it.
- **Manifest dependency descriptions.** While item 1 declares `notifications`, also touch the `events` dependency description (`module.lowdefy.yaml:27` — "Provides the change_stamp component…"), which becomes incomplete once events also supplies the `new-event` dispatch target.
