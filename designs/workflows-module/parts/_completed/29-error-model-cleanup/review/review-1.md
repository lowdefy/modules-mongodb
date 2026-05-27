# Review 1 — Part 29 error-model cleanup

Focus: factual claims against shipped code (handler + upstream Lowdefy primitives), the soft-reject upstream-dependency story, and the migration story for already-shipped Part 6.

## Blockers

### 1. The "today's status array is polymorphic" premise (D2a) doesn't match shipped code

> **Resolved.** Rewrote D2a per the review's proposed framing — names the three surfaces explicitly (concept spec, Part 6 design.md, `shared/types.js` typedef) and points out that shipped `updateAction` always wrote uniform `{ stage, event_id, created }` status entries; the polymorphic fields live only on the handler's `error_transition` *return* field. Cleanup is doc + types + return-field removal, not a write-format change. Added "no data migration" (no consumers exist; moot regardless because no historical action docs carry the old shape). Updated the engine/spec.md concept-spec entry to note "spec text only — no shipped writer ever populated the polymorphic fields." Expanded the shipped-code inventory to list the `error_transition` removal explicitly and added a `shared/types.js` entry covering both the `StatusEntry` typedef trim and the return-type trim.

D2a justifies the schema simplification by claiming today's error transitions carry `reason`/`error_message`/`error_metadata` on the status entry itself, and that Part 29 drops these fields from the action-doc schema.

That's true of the **concept spec** ([engine/spec.md:170-171](../../../workflows-module-concept/engine/spec.md)) and **Part 6's design.md** ([§ Failure shape, line 56](../_completed/06-submit-action-writes/design.md)). It is **not** true of shipped code:

- [`shared/updateAction.js:70-82`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js) writes a uniform `{ stage, event_id, created }` entry for every push, including the force-push from the catch-converter.
- [`handleSubmit.js:302-332`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) builds an `errorTransition` object (`{ reason, error_message, error_metadata }`) and surfaces it on the **return**, not on the status entry. The status entry pushed by `updateAction` is the uniform shape.
- [`shared/types.js:9-16`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/types.js) defines the `StatusEntry` typedef with optional `reason`/`error_message`/`error_metadata` — but no writer in the repo populates those fields on a status doc.

This matters for two reasons:

- The "clean win for the data contract" framing oversells what the cleanup actually does. There are no production action docs with polymorphic status entries to migrate. The work is doc + types cleanup (concept spec, Part 6 design.md, `shared/types.js`, the `error_transition` return field) — not a write-format change.
- A reader (or implementer following the design) is left chasing a phantom: they'll grep `handleSubmit.js` for the polymorphic write, not find it, and either conclude the design is wrong or "fix" something that was never broken.

**Fix.** Restate D2a as: "Concept spec, Part 6 design.md, and the `StatusEntry` JSDoc describe a polymorphic error-only shape that shipped code never wrote. The `error_transition` field on the handler return (the actual surface today) carries `reason`/`error_message`/`error_metadata`. Removing the polymorphic shape from the docs/types and removing `error_transition` from the return collapses the contract to the uniform `{ stage, created, event_id }` writers already use." Note that no action-doc migration is needed.

### 2. Pre-hook reject discrimination depends on the upstream change; fallback as described doesn't work

> **Resolved (superseded by D5 restructure).** Dropped the fallback paragraph. The `isReject` flag is now a hard precondition, but the upstream PR also extends to `runRoutine.js:56-62` — preserving `:reject` across caught throws via `error.isReject`. With that, the soft-reject channel becomes transparent propagation: `invokePreHook.js` no longer catches, `handleSubmit` no longer catches, the reject surfaces automatically once it reaches the wrapping endpoint's `runRoutine`. D5 was rewritten to this model; the in-engine discriminator (and the `{ rejected, reject_message }` return surface, and Part 13's trailing `:reject` step) all disappear.

D5 commits the soft-reject path on `error.isReject` (an upstream addition to `UserError`) and frames the fallback as:

> the fallback is a name-based check (`error.name === 'UserError'` plus a separate sniff to detect reject-vs-throw via the cause shape) — brittle and to be avoided.

Both `controlReject` ([controlReject.js:36](../../../../../lowdefy/packages/api/src/routes/endpoints/control/controlReject.js)) and `controlThrow` ([controlThrow.js:37](../../../../../lowdefy/packages/api/src/routes/endpoints/control/controlThrow.js)) construct **the same** `UserError` with the same `{ cause }` shape — they differ only in the `status` field on the resolver result (`'reject'` vs `'error'`). That `status` is read in [`callRequestResolver.js:43-44`](../../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js) where both branches `throw result.error` — so by the time `invokePreHook.js` catches, the `status` discriminator is gone.

There is no "cause shape" difference to sniff. The fallback as described would conflate a `:throw` and a `:reject`, defeating the whole point of D5.

**Fix.** Drop the fallback claim. Either commit to the upstream change as a hard dependency and pin the handoff, or rework the discrimination to live somewhere where the resolver `status` is still visible (e.g. extend `callRequestResolver.js` to preserve `status` on the thrown error before the throw, OR have `callApi` honor Part 1's never-throws contract and return `{ status, error }`). Without one of these, the design has no implementable reject channel.

### 3. Part 1's never-throws contract vs. callApi's actual throw behavior

> **Resolved.** Part 29 commits explicitly to the shipped throw-on-error contract. Added a deviation note at the top of Part 1's design (`_completed/01-call-api-primitive/design.md`) recording that the `{ success, response, error }` envelope was never built and shipped `callApi` (the only one — `callRequestResolver.js:29`) throws on `:reject` / `:throw` and returns raw response on success. The Part 1 spec text is preserved as-written; the deviation flags the divergence for future readers. Added a corresponding entry to Part 29's "What this changes → Concept specs" inventory. Re-specifying `callApi` to honour the never-throws contract is explicitly out of scope (blast radius across every existing routine step). The `result.success` pattern in `dispatchNotifications.js:23` is the invoked routine's own return body, not a callApi envelope. The D5 restructure (see #2) leans into this — `:reject` propagates as a throw through the throw-on-error `callApi`, exactly as the shipped contract intends.

D5 (line 111) reads "callApi throws it (Lowdefy errors pass through callRequestResolver.js:80-86 unchanged)" and the invokePreHook flow in D5 wraps the call in `try`/`catch`. That matches shipped callApi behavior ([`callRequestResolver.js:43-44`](../../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js)), but **contradicts Part 1's design**:

> `CallApiResult`: `{ success: boolean, response, error? }`. **Never throws** — error path returns `success: false`.
> — [Part 1 § In scope](../_completed/01-call-api-primitive/design.md)

Part 1 is in `_completed/` but shipped behavior diverges. This design (and the existing Parts 8, 9, 11 which call `context.callApi` and inspect return shape, e.g. `dispatchNotifications.js`) all rely on whichever interpretation they happened to grab. Part 9's design currently doesn't wrap callApi in try/catch (consistent with Part 1 spec); Part 29's D5 does wrap (consistent with shipped behavior).

Either:

- Part 1's spec needs amending to "throws Lowdefy errors; returns response on success" — and every "in scope" / verification line about `success: false` is wrong.
- Or shipped `callRequestResolver.js` needs amending to honor the never-throws contract — and D5's flow should be `{ status: 'reject', error } = await callApi(...)` instead of try/catch.

Pin which interpretation Part 29 is operating against, and flag the Part 1 inconsistency as a separate amendment (fold-in to Part 29's upstream-dependency section, or a tiny follow-on).

### 4. Existing handleSubmit tests assert the behavior Part 29 removes

> **Resolved.** Rewrote the Verification → Unit tests section to call out the two existing tests by line range and explicitly mark them as rewrites (not net-new). Spelled out the new assertions: handler throws, submitted action's `status[0].stage` stays `in-review` (no `error` layered on), step 5's summary write stays durable as proof of the partial-write story. Net-new tests follow under a "New unit tests" sub-header so the implementer doesn't double-count coverage. Added the `handleSubmit.js:312` inline-comment deletion (`// PART 9: hook_error path ...`) to the shipped-code inventory.

Two handler-level tests already in the repo lock in the old contract:

- [`handleSubmit.test.js:798-819`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js) (step 5 throw) — asserts `result.error_transition.reason === 'recompute-summary'`, `result.error_transition.error_message` matches the cause, and the action doc has `status[0].stage === 'error'` layered over the step-4 transition.
- [`handleSubmit.test.js:821-869`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js) (step 6 throw) — same shape: asserts `error_transition.reason === 'write-form-data'` and the layered `error` stage.

Under Part 29 both of these tests should:

- Stop expecting `error_transition` on the response (the handler throws instead).
- Stop expecting an `error` stage layered on the action — the step-4 transition is what's left after the throw.
- Add an assertion that the user-submitted `action_id`'s `status[0]` is **still** the step-4 transition (e.g. `in-review`), not `error`.

The "Verification → Unit tests" section in this design names the new assertions abstractly ("handler rethrows; no `error` transition is written"). Worth calling out explicitly that the **rewrite is of these two existing tests**, not a net-new add, so the implementer doesn't leave them in place and double-count "coverage."

Also flag: the inline comment `// PART 9: hook_error path takes the same shape but with reason: 'pre-hook'.` at [`handleSubmit.js:312`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) deletes alongside the catch-converter.

### 5. External-system "push error via SubmitWorkflowAction" path isn't usable for form/tracker actions

> **Resolved.** Rewrote D4's framing to clarify that the "many callers push `error`" claim describes the *domain shape* the priority table is designed for — not the current `SubmitWorkflowAction` API surface. The two working entry paths today (pre-hook `actions: [{ ..., status: 'error' }]` and task `submit_edit` + `current_status: 'error'`) are now named explicitly; form / tracker external pushes are explicitly flagged as out of scope here and covered by the deferred external-system error injection API. The priority table is stable across that domain expansion, which is the actual claim D4 needs to make.

Change 5's premise (and D4's "many callers push `error`" justification) includes "backend microservices like the production whatsapp Lambda" as a caller that pushes `error` via the regular submit channel. The "Out of scope" section then defers to a follow-on: "External pushers use `SubmitWorkflowAction` as a system user with a configured interaction."

But [`handleSubmit.js:25-52`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — `resolveTargetStatus` — maps interactions to fixed stages: `submit_edit → in-review|done`, `not_required → not-required`, `resolve_error → in-review|done`, `approve → done`, `request_changes → changes-required`. **No interaction resolves to `error`** unless the action is `kind: task` and the caller supplies `current_status: 'error'`. That means:

- Form actions: no path through `SubmitWorkflowAction` produces an `error` status push. A pre-hook returning `actions: [{ status: 'error' }]` works (per Change 2), but a bare `SubmitWorkflowAction` call from an external system cannot.
- Tracker actions: skipped by the resolver, no per-action endpoint at all.

So the only working "external system pushes error" channel today is:

- The action is a task,
- Caller calls `submit_edit` with `current_status: 'error'`,
- And the task-action enum allows `error` in its status-selector list.

The design appeals to "many callers push `error`" as the rationale for keeping `error.priority = 1` (D4 line 90), but the only working external-call path is the task one. Worth either:

- Naming this restriction explicitly in D4 / Change 5 (form / tracker external error pushes are out of scope until the follow-on lands), or
- Extending Change 1 / 5 to allow `error` as a target stage for an external pusher interaction (e.g. a new `system_error` interaction, or accepting `current_status` for form actions too).

Without that, "many callers push `error`" is aspirational — production code (whatsapp Lambda) is presumably doing a direct Mongo write, which the design neither sanctions nor disallows.

## Findings

### 6. Throw shape prescription is more invasive than the catch-converter removal

> **Resolved.** Dropped the `throw new Error(... { cause })` prescription from Change 1. Existing sub-step annotate-and-rethrow blocks (`err.step = err.step ?? '<step-name>'; throw err;`) stay as-is — preserves the original error object so `isLowdefyError` pass-through at `callRequestResolver.js:80-86` keeps working, preserves nested-step annotations, keeps Sentry trace shape unchanged. Change 1 now positively documents the kept pattern rather than prescribing a new one. The D5 restructure (see #2) reinforces this — no `try`/`catch` inside `handleSubmit` at all, so there's no rethrow shape to prescribe in the first place.

Change 1 reads:

> Sub-steps that decorate a caught error use the standard `throw new Error('<step-name> failed', { cause: originalError })` shape — same posture as the rest of Lowdefy

But sub-steps in `handleSubmit.js` today use a different shape — `err.step = err.step ?? "<step-name>"; throw err;` (see lines 217-218, 297-299, 339-341, 347-349). That preserves the original error and annotates it.

Removing the catch-converter doesn't require touching those annotate-and-rethrow blocks. Switching to `throw new Error(... { cause: err })` is a separate cleanup that:

- Loses any extra properties the original error carried (e.g. `err.step` from a nested rethrow).
- Wraps every Lowdefy error one layer deeper, which `callRequestResolver.js:80-86` already special-cases to avoid (`isLowdefyError` passes through unchanged); adding a wrapper undoes that.
- Changes the Sentry trace shape relative to today.

And the line-9 references (`runRoutine.js:55`, `engine/Actions.js:212`) don't actually demonstrate the prescribed shape. [`runRoutine.js:55`](../../../../../lowdefy/packages/api/src/routes/endpoints/runRoutine.js) is `throw new Error('Invalid routine.', { cause: { routine } });` — a guard, not a step-failure pattern. [`engine/Actions.js:208-217`](../../../../../lowdefy/packages/engine/src/Actions.js) wraps in `ActionError`, not bare `Error`, and only for non-Lowdefy errors (`err.isLowdefyError ? err : new ActionError(...)`).

**Fix.** Either drop the `throw new Error(...)` prescription (just remove the catch-converter, keep the annotate-and-rethrow), or commit to the rewrite explicitly and replace the bare-`Error` example with `ActionError`-shaped or `err.isLowdefyError ? err : new <SomeError>(...)` to match upstream posture.

### 7. Edits to Part 9's design need an owner

> **Resolved.** No handoff to pin — the author is updating Part 9's design concurrently on this branch as part of the same work. Single-author / single-branch lockstep across Parts 9 and 29 eliminates the coordination risk the review flagged.

The "Part 9 (unshipped, in-progress on this branch)" subsection lists the edits Part 9's design needs before it ships:

- Drop the `hook_error` field + merge branch
- Add the soft-reject branch in `invokePreHook.js`
- Drop the try/catch wrap in `invokePostHook.js`
- Drop `post_hook_error` from the return shape

The Depends-on line says "before ship" — but doesn't say whether Part 29 lands the edits to Part 9's `design.md` itself, or whether Part 9's author absorbs them as the next iteration of their own design.

Given that Part 9's `design.md` is currently modified on this branch (per [git status](#)), there's a real risk of overlap: Part 9 review-1 #5 just resolved the `hook_error` return shape; Part 29 deletes the field entirely; if both ship without coordination one of those resolutions becomes stale.

**Fix.** Pin the handoff. Either:

- Part 29 ships first and amends Part 9's `design.md` directly (matching the Part 21-style fold-in posture this design appeals to in "Shipped code" line 165), OR
- Part 9's author absorbs Part 29's mandated edits as the next pass of their own design (and Part 29 marks them as preconditions, not direct edits).

A note in the "Depends on" line saying "Part 29's edits to Part 9's design land in Part 29's PR; Part 9 reads the post-Part-29 shape" (or the reverse) would unblock the implementer.

### 8. The reject control step on Part 13's emitted endpoint isn't pinned

> **Resolved (superseded by D5 restructure).** Part 13's resolver-emitted endpoint no longer needs a trailing `:if` / `:then` / `:reject` control step. Under the new D5 model (see #2), `:reject` propagates transparently — the wrapping endpoint's `runRoutine` classifies the caught `UserError(isReject: true)` as `'reject'` automatically once the upstream tweak lands. No field-name pinning needed, no coordination with Part 13 needed beyond removing the never-emitted trailing step from Part 13's design (which the author is handling concurrently on this branch per #7).

Change 6 (line 113-114) says:

> Part 13's resolver-emitted endpoint adds a trailing control step that converts that into the wrapping endpoint's own `:reject`, so the calling app's `CallApi` sees a reject (not a return).

Part 13's design ([§ Routine](../13-resolver-apis/design.md)) currently commits a "single step that invokes the `SubmitWorkflowAction` plugin handler" — no trailing control step. The shape Part 29 sketches (`':if': { _eq: [{ _step: submit.rejected }, true] }, ':then': { ':reject': { _step: submit.reject_message } }`) is the right primitive, but:

- It requires `SubmitWorkflowAction`'s return on the reject path to surface as `_step: submit.rejected` / `_step: submit.reject_message`. Pinning the field names in the design (not just `rejected: true` prose) avoids implementer drift.
- The `:if` / `:then` syntax requires confirming `runRoutine.js` propagates `:reject`-from-`:then` upward correctly (`runRoutine.js:49` passes `reject` / `error` / `return` through, so it does — but worth a one-line verification bullet asserting the wrapping endpoint's overall status becomes `'reject'` end-to-end).
- The amendment to Part 13's design (insert this trailing step into the emitted routine) needs the same handoff treatment as #7 — Part 13 is also in-flight on this branch.

**Fix.** Pin the exact step shape (field names, step id) and add it to the "What this changes → Concept specs / Shipped code" inventory as a direct edit to Part 13's design.

## Minor

### 9. `current_status: 'error'` already works through the task path — surface it

> **Resolved.** Added a one-liner to D2 naming the task `submit_edit` + `current_status: 'error'` path as the second working entry channel today, alongside pre-hook `actions: [{ ..., status: 'error' }]`. Also surfaced in D4's domain-shape clarification (see #5).

D2 (line 53) says authors "scope notifications by target stage" but doesn't name the immediate "push error from a status selector" path. It's already supported today: task action + `submit_edit` + caller-supplied `current_status: 'error'` runs through `resolveTargetStatus` ([`handleSubmit.js:31-39`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) and writes a normal status push (with `error.priority = 1` passing the priority rule cleanly). The "Out of scope" `Status-selector inclusion of error` bullet hints at this but frames it as future authoring opt-in, not "this works on day-one for task actions."

Worth a one-liner in Change 2 / D2: "Task actions whose `task.statuses:` includes `error` can push it via `submit_edit` + `current_status: 'error'` today, no engine change."

### 10. Step-7 / step-8 duplicate-risk widens under propagate-everywhere

> **Resolved.** Added a fourth bullet to D6 linking back to D1's per-step table and naming the duplicate-event (step 7) and duplicate-notification (step 8) windows explicitly. Reaffirms the existing acceptance (events are append-only audit; notification idempotency is the notifications module's job) so a reader of D6 alone sees the consequence and the chosen trade-off without having to scroll back to D1.

The D1 table covers per-step duplicate risk correctly. But under D6 (propagate-everywhere), the duplicate-event risk amplifies: any step ≥ 7 that throws and gets retried causes step 7 to fire twice on the retry. Same for notifications and step ≥ 8.

The D1 table already lists this row-by-row; D6 doesn't re-link to it. A reader of D6 alone (which is where the "no engine-side catching" policy is committed) doesn't see the consequence. Worth a one-liner in D6: "Per the D1 table, duplicate-event and duplicate-notification windows widen — any step ≥ 7 throw plus retry can double-write step 7; any step ≥ 8 throw plus retry can double-fire step 8. Accepted; same posture as today."

### 11. Imprecise upstream references in Change 1

> **Resolved.** Both refs (`runRoutine.js:55`, `engine/Actions.js:212`) were attached to the dropped throw-shape prescription. With that prescription gone (see #6), the refs go with it. Change 1 no longer cites them.

Two references in Change 1 don't carry the weight implied:

- `api/runRoutine.js:55` — actual line is `throw new Error('Invalid routine.', { cause: { routine } });`, a routine-type guard, not the failure pattern the design wants to anchor on.
- `engine/Actions.js:212` — line 212 is `cause: err,` inside an `ActionError` constructor; the surrounding pattern is `err.isLowdefyError ? err : new ActionError(err.message, { cause: err, ... })`. That's class-wrapping with pass-through for Lowdefy errors, not bare `new Error(... { cause })`.

If the design wants to stand on Lowdefy's posture, point at the actual pattern (`ActionError`-style class wrapping with `isLowdefyError` pass-through) instead of the bare-`Error` shape. Aligns with the resolution to #6.
