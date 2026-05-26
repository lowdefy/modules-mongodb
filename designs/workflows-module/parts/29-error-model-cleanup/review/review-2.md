# Review 2 — Part 29 error-model cleanup

Focus: a second pass against shipped code and the upstream Lowdefy primitives, after the review-1 resolutions landed. The big surfaces (D2a, D5, Part 1 deviation, the test-rewrite call-out, "many callers push error" framing) are clean. New findings concentrate on the upstream PR's side-effect surface, post-cleanup dead annotations, and a couple of JSDoc / verification-prose nits.

## Findings

### 1. Upstream `runRoutine.js` tweak silently changes `context.handleError` invocation for propagated `:reject`s

> **Resolved.** Adopted option 1: branch on `error.isReject` *before* `context.handleError` runs in the upstream `runRoutine.js` catch. Preserves today's invariant (rejects never hit `handleError`), keeps production hosts' Sentry / alerting wiring free of noise from deliberate user-facing rejections, and stays symmetric with the line-49 routine-loop early-return (which also skips `handleError` for in-routine rejects). Updated the Upstream dependency section's `runRoutine.js` bullet with the explicit code block, and extended the Semantic note for the upstream PR to spell out the preserved `handleError` invariant alongside the existing reject-stays-a-reject framing.

Today, a `:reject` from `controlReject` returns `{ status: 'reject', error }` at [`runRoutine.js:46-52`](../../../../../lowdefy/packages/api/src/routes/endpoints/runRoutine.js) — the routine-loop early-return at line 49 picks it up before the throw catch at line 56 ever sees it. The catch only fires on a thrown error, which always lands as `{ status: 'error' }` and triggers `await context.handleError(error)` exactly once (the `error.handled = true` guard prevents double-handling on nested propagation).

Part 29's proposed upstream tweak rewrites that catch return from `{ status: 'error', error }` to `{ status: error.isReject ? 'reject' : 'error', error }`. Correct for the status discriminator — but a side-effect ships with it: `context.handleError(error)` at line 58 now also fires for propagated `:reject`s. Today no reject ever reaches that handler; after the tweak, every reject that crosses at least one nested-routine boundary as a throw does. In `testContext` ([`packages/api/src/test/testContext.js:42-44`](../../../../../lowdefy/packages/api/src/test/testContext.js)) `handleError` only calls `logger.error(error)`, but production hosts wire `handleError` to Sentry / alerting (that's exactly why the `error.handled` guard exists at all). After the tweak, deliberate user-facing rejections light up Sentry as if they were infrastructure errors.

The design's "Semantic note for the upstream PR" (line 148) frames the change as "today a nested `:reject` becomes an outer `'error'`; with the tweak it stays a `'reject'`" — i.e. status-coercion only. It doesn't flag the `handleError` side-effect.

**Fix.** Either:

- Move the proposed tweak above the `handleError` call: branch on `isReject` *before* invoking `context.handleError`, so rejects bypass `handleError` and only errors call it. Concretely:

  ```js
  } catch (error) {
    if (error.isReject) {
      return { status: 'reject', error };
    }
    if (!error.handled) {
      await context.handleError(error);
      error.handled = true;
    }
    return { status: 'error', error };
  }
  ```

  This preserves today's invariant (rejects never hit `handleError`) and gives the cleanest semantic match with the existing routine-loop early-return at line 49 (which also skips `handleError`).

- Or accept the side-effect and call it out in the upstream PR description and Part 29's "Semantic note" so app authors with custom `handleError` wiring can audit before adoption.

The first option is essentially free in upstream-PR diff size and matches today's reject-doesn't-hit-handleError semantics, so it should be the default.

### 2. `err.step` annotations become dead annotations after the catch-converter removes the consumer

> **Resolved.** Picked option 1: delete the four per-step `try/catch` blocks outright. No consumer for `err.step` exists or is planned in this PR; the lifecycle-step context is recoverable from the stack frame; bare propagation preserves the original error object (incl. `isLowdefyError`) identically. Aligns with D6's "engine catches nothing" rule. Updated Change 1's prose (drop the "stay as-is" framing, replace with bare-propagation justification) and added a shipped-code inventory bullet under `handleSubmit.js` naming all four line ranges to delete.

Per-step catches at [`handleSubmit.js:216-218`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [297-300](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [339-341](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), and [347-349](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) do `err.step = err.step ?? "<step-name>"; throw err;`. Today the *only* reader of `err.step` is the catch-converter at line 307 (`reason: err.step ?? "mid-write"`). Part 29 removes that reader.

Change 1 (design line 9) frames keeping these blocks as preserving the original error object (including `isLowdefyError`) for `callRequestResolver.js:80-86` pass-through. The pass-through part is right — but that's a property of *not catching and re-wrapping*, not of the `err.step` annotation. After the cleanup, `err.step` is set and never read.

Two clean options; either is fine, but the design should pick one:

- **Delete the per-step catches outright.** A bare propagation has the same `isLowdefyError` pass-through and removes the dead annotation. The lifecycle-step context is recoverable from the stack frame.
- **Keep them and document a consumer.** If the intent is for Sentry / `context.handleError` to read `err.step` as a tag, point at where that read happens (or stage that wiring in this same PR). Otherwise the annotation rots and a future reader will delete it as unused.

Today the design's framing implies the first ("just preserve the original object") while the prescribed change keeps the second (the `err.step =` assignment). Pick one and align Change 1's text.

### 3. Handler-level JSDoc still advertises `error_transition` in the return type

> **Resolved.** Added a bullet to the shipped-code inventory naming `handleSubmit.js`'s `@returns` JSDoc at lines 60-70: drop the `error_transition?` field, and narrow `pre_hook_response` / `post_hook_response` from `any | null` to the success-only shape (failures throw, so the never-on-failure nullable union isn't accurate).

The Shipped code inventory (design lines 184-191) names `shared/types.js` for the `StatusEntry` typedef and return-type-typedef trims, but doesn't name the inline JSDoc block at [`handleSubmit.js:60-70`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):

```js
 * @returns {Promise<{
 *   action_ids: string[],
 *   ...
 *   error_transition?: { reason: string, error_message: string, error_metadata: any | null },
 * }>}
```

Add a bullet under "Shipped code → Files touched in `.../SubmitWorkflowAction/`" naming `handleSubmit.js`'s `@returns` JSDoc — drop the `error_transition` field and the `pre_hook_response: any | null` / `post_hook_response: any | null` should narrow to the success-only shape (since failures throw, the nullable union for never-on-failure isn't accurate either).

### 4. D2's "task path works today" needs one more line of detail

> **Resolved.** Folded both precision notes into D2's task-path paragraph: (a) `task.statuses:` is a UI-only gate — the engine doesn't validate `current_status` against it; the priority rule is the only engine-side check, and `error.priority = 1` lets the write through. (b) Task `submit_edit` requires `current_status` on the payload (the engine throws otherwise); it's narrower than form `submit_edit`. Kept as pre-existing-constraint context so the "no engine change" framing isn't misread.

D2 (line 55) reads:

> Task actions whose `task.statuses:` list includes `error` can push it via `submit_edit` + caller-supplied `current_status: 'error'` today, with no engine change.

Verified at [`handleSubmit.js:31-39`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js): `resolveTargetStatus` returns `params.current_status` verbatim for task `submit_edit`. Two precision nits worth folding in:

- The engine **does not validate** `current_status` against `task.statuses:` — `task.statuses:` is a UI-only gate (the status-selector dropdown). An external pusher with knowledge of the endpoint can pass any `current_status`, including `error`, regardless of `task.statuses:`. That's fine for the priority-table argument D4 is making, but a reader of D2 in isolation will assume the engine filters — which it doesn't.
- The throw at `handleSubmit.js:34-37` for missing `current_status` means task `submit_edit` *requires* the caller to supply one; there's no fallback. Out-of-scope for Part 29 (it's existing behavior) but the "no engine change" framing in D2 elides this — task `submit_edit` is more constrained than form `submit_edit`, not just an opt-in feature.

Tighten D2 to: "Task actions whose `task.statuses:` list includes `error` can push it via `submit_edit` + caller-supplied `current_status: 'error'` today, with no engine change. The engine does not validate `current_status` against `task.statuses:` — that's a UI-side gate; the priority rule is the only engine-side check, and `error.priority = 1` lets the write through."

### 5. Test-rewrite spec is right on the throw assertion, but doesn't spell out the side-effect verification

> **Resolved.** Added explicit test-body restructure notes to both the step-5 and step-6 rewrite bullets in Verification → Unit tests. Calls out that `rejects.toThrow` consumes the `await handleSubmit(...)` call, so the side-effect read has to happen as a separate `findOne` after the throw assertion (or via `try`/`catch` swallow then read). Spelled out the concrete assertions for step 5 (`status[0].stage === 'in-review'`, `status.length === 2`) and the matching sequencing requirement for step 6's existing `wf.summary` assertion.

Verification → Unit tests (design lines 228-230) prescribes:

> handler **throws** (use `expect(handleSubmit(...)).rejects.toThrow(/simulated step 5 failure/)`), and the submitted action's `status[0].stage` is **still** `in-review` (the step-4 transition) — no `error` entry layered on.

Mechanically that's two assertions, not one: the throw assertion *and* a `findOne` against `actions` after the throw to read `doc.status[0].stage`. The existing tests' shape is `const result = await handleSubmit(...); expect(result.error_transition)...; ...; const doc = await mongo.db.collection("actions").findOne(...)` — pivoting to a `rejects.toThrow` means the test body restructures: the `await handleSubmit(...)` line is consumed by the matcher, so the side-effect read has to happen as a separate await *after* the throw assertion (or wrap the call in `try { await handleSubmit(...) } catch { /* swallow */ }` and read state).

Worth one extra line in the rewrite spec — "After the `rejects.toThrow` assertion, separately `findOne` the action doc and assert `status[0].stage === 'in-review'` (no `error` layered on) and `status.length === 2` (the original `action-required` + step-4's `in-review`)". Without that, an implementer following the abstract description might write only the throw assertion and silently lose the partial-write-durability coverage that lines 864 / 815-818 carried.

The same applies to the step-6 test: the existing `wf.summary` assertion at line 864 is named in the design as "stays as-is" — but mechanically the existing assertion happens *after* a successful `await handleSubmit(...)`. Once the call throws, the summary read needs to be sequenced after the `rejects.toThrow`. Cheap fix; just spell it out.

## Minor

### 6. `dispatchLogEvent.js`'s read of `result.success` is the routine's *return body*, not a callApi envelope — already verified, just call it out

> **Resolved.** Added a one-liner to the Part 1 deviation entry under "What this changes → Concept specs" (where the Part 1 deviation is folded in): shipped `callApi` returns the invoked routine's return body verbatim on success, and the `result.success` patterns in `dispatchNotifications.js` / `dispatchLogEvent.js` are reading author-defined fields, not a framework envelope. Closes the thread so a future reader grepping `result.success` doesn't re-spawn it.

Review 1 #3's resolution paragraph noted "The `result.success` pattern in `dispatchNotifications.js:23` is the invoked routine's own return body, not a callApi envelope." Worth a parallel sentence in Part 29 design where Part 1's deviation note is folded in (line 178), so a future reader doesn't re-spawn the same review thread when they grep for `result.success`. Just a one-liner saying "shipped callApi returns the routine's return body verbatim on success; `result.success` patterns in `dispatchNotifications.js` / `dispatchLogEvent.js` are reading author-defined fields, not a framework envelope" would close it.

### 7. Out-of-scope bullet on duplicate notifications could name the concrete risk

> **Resolved.** Tightened D6 bullet 4 to state that the notifications module is idempotent today, so a step ≥ 8 throw + retry resolves to a single user-visible notification — the user-facing blast radius of the widened duplicate-write window is bounded. Replaces the prior "notification idempotency is the notifications module's responsibility" framing, which left the actual blast radius unstated.

D6 bullet 4 (line 159) names the duplicate-event and duplicate-notification windows but treats them as one risk class. They're not symmetric in real impact:

- Duplicate event log entries are easy to live with — events are append-only audit, the UI tolerates duplicates, and an audit trail showing "tried twice" is arguably more honest than collapsing it.
- Duplicate notifications can mean duplicate user-facing emails / push notifications / outbound webhook calls. Idempotency lives in the notifications module per the design — but if the notifications module's idempotency isn't yet wired (it might not be — out-of-scope to check here), the user-visible failure mode is "submit fails, retry, receive two emails."

Not a blocker — the design already defers notification idempotency to the notifications module. But one extra sentence acknowledging that the user-visible blast radius of step ≥ 8 failure + retry depends on what notifications-module does today (and surfacing whether it's already idempotent, or whether that's an open dependency) would let a reader judge whether the accepted risk is actually accepted.
