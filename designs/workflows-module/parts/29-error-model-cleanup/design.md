# Part 29 — Error-model cleanup

**Source rationale:** [workflows-module-concept/engine/spec.md § Action `error` transition](../../../workflows-module-concept/engine/spec.md#action-error-transition), [workflows-module-concept/submit-pipeline/spec.md § Pre-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional). **Layer:** engine handlers + concept-spec amendment. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`, `modules/workflows/`, plus concept-spec edits.

Today the `error` action stage does two unrelated jobs. The engine force-writes it whenever a sub-step throws mid-submit — a 500-class infrastructure surface — and authors also set it to signal that a real-world process failed (a manual task that couldn't complete, a backend microservice that failed to process a file). Workflow authors end up modelling recovery UX for transient infra blips, and the audit trail mixes "the network blipped" with "the gating process actually broke." This part separates the two: engine throws stay as throws, and the `error` stage becomes purely a domain signal authors / external systems push deliberately.

## Proposed change

1. **Engine sub-step failures throw instead of writing an `error` transition.** The mid-write `try`/convert-to-`error`-transition block in [Part 06 § Failure shape](../_completed/06-submit-action-writes/design.md#failure-shape) is removed. Failures in lifecycle steps 4–11 propagate to `CallApi` and surface as a transient client error; the user retries the same submit and the priority rule + same-stage-self exception make it safe. The existing per-step `try { ... } catch (err) { err.step = ...; throw err; }` annotate-and-rethrow blocks are deleted along with the catch-converter — bare propagation preserves the original error object (including `isLowdefyError` for resolver pass-through at [callRequestResolver.js:80-86](../../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js)), and the lifecycle step that failed is recoverable from the stack frame. No custom error class.
2. **Remove the `hook_error` pre-hook return field.** A pre-hook that wants to push the action to `error` returns it through the regular `status` / `actions[]` channels (typically `actions: [{ ..., status: 'error' }]` — no `force` needed under the current priority table since `error(1)` is below every non-terminal stage). A pre-hook that wants to *abort* the submit throws — same path as any other engine failure. Status entries become uniform `{ stage, created, event_id }` — the `error_message` / `error_metadata` fields disappear; pre-hooks carry context into the log via `event_overrides.metadata` like every other status transition.
3. **Keep `resolve_error` and the `-error` page as first-class, opt-in surfaces.** The recovery flow mirrors the review flow: `-error` page is emitted iff `error` is in the action's `access.{app_name}` verb list (same gating rule as `-review`), the template-shipped button posts `interaction: resolve_error`, and `update-action-{type}-resolve_error-{pre,post}` hook endpoints are emitted alongside the other four interactions. No change to button vocabulary, hook emission, or page template — the interaction stays at parity with `submit_edit` / `approve` / `request_changes` / `not_required`.
4. **Priority table unchanged. `resolve_error` continues to force-write its recovery transition.** The asymmetry — `error.priority = 1` makes entry from any stage cheap, recovery requires `force: true` — matches the asymmetry of the domain: many callers push `error` (pre-hooks, manual task-status selectors, backend microservices like the production whatsapp Lambda) and they should all do so cleanly; recovery happens once per error event from a single well-defined path that can carry its own `force: true`. Localised friction in one place beats friction at N call sites. The shipped `updateAction(..., force: true)` mapping for `interaction === 'resolve_error'` stays.
5. **Propagate-everywhere as the uniform failure rule. No engine-side catching of sub-step throws.** Every step in the 11-step lifecycle (1 Validate, 2 Pre-hook, 3 Auto-unblocks, 4 Action writes, 5 Summary, 6 form_data, 7 Log event, 8 Notifications, 9 Group on-complete fan-out, 10 Tracker subscription, 11 Post-hook) throws on failure and the throw propagates to `CallApi`. The handler does not catch step 8 (notifications) as "best effort," does not catch step 11 (post-hook) as "soft surface." Authors who want a post-step to be best-effort wrap their own logic in `:try` inside their hook routine and decide what to swallow. The `SubmitWorkflowAction` return shape collapses to `{ action_ids, completed_groups, event_id, tracker_fired, pre_hook_response, post_hook_response }` — both `hook_error` (per change 2) and `post_hook_error` (because there is no success-with-soft-error case anymore) are removed. `pre_hook_response` and `post_hook_response` stay as success-return surfaces for arbitrary hook return data.
6. **Pre-hook soft-reject channel via Lowdefy's `:reject` control — transparent propagation.** A pre-hook that needs to surface a user-facing rejection (e.g. "Company name already exists in CRM" returned from an upstream validation API) calls Lowdefy's standard `:reject` control with a message. The reject propagates as a `UserError(isReject: true)` throw all the way up through `invokePreHook.js` → `handleSubmit.js` → the `SubmitWorkflowAction` plugin handler → the wrapping per-action endpoint's `runRoutine`, which classifies it as `{ status: 'reject', error }` per the `isReject` flag. The calling app's `CallApi` sees a reject. **No engine-side discrimination, no `{ rejected, reject_message }` return surface, no Part 13 trailing control step.** Depends on a small upstream change to `@lowdefy/errors`'s `UserError` (add an `isReject` flag), to `controlReject.js` (pass `isReject: true`), and to `runRoutine.js` (preserve `:reject` across caught throws when `error.isReject`) — see [Upstream dependency](#upstream-dependency) below.

## Key decisions

### D1. Why throwing is safer than force-writing `error`

The current engine catches a sub-step failure and synthesises an `error` transition with `force: true`. That puts three different concerns on the action doc:

- A **stale write** that retries can't reach (because the `error` is now the latest status and the priority rule will reject anything trying to overtake it without `force`).
- An **audit entry** for an event the workflow author didn't model (the docs don't show `error` in their state diagram).
- A **recovery UX requirement** — the workflow author has to render a `-error` page, hook up `resolve_error`, and write copy explaining what went wrong.

Throwing instead leaves the action in its **pre-submit state** (step 4's writes may have partially landed, but the priority rule makes the retry converge), surfaces the failure to the calling client as a transient API error, and lets the user retry the exact same submission with no special UI. The cost is that step 4–6 writes are non-atomic across retries — but they already are today, and the spec ([engine/spec.md § No Mongo transactions in v1](../../../workflows-module-concept/engine/spec.md#client-and-transaction-model)) already accepts this risk class.

**What partial writes look like after a throw:**

| Step that threw | Visible state                                                                          | Retry behaviour                                                          |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Step 4 (writes) | Some `actions[]` entries pushed, others not                                            | Priority rule + self-exception → re-writes the missing entries, no-ops on landed ones. |
| Step 5 (summary)| Action transitions written, workflow `summary` stale                                   | Step 4 no-ops; step 5 recomputes from current state.                     |
| Step 6 (form)   | Action transitions + summary written, `form_data` paths missing                        | Step 4 no-ops; step 5 idempotent; step 6 re-applies `$set` ops (idempotent). |
| Step 7 (event)  | Writes durable, `events` collection has no entry                                       | Step 4–6 idempotent; step 7 writes the event. **Duplicate event risk** if step 7 actually wrote then the response was lost. Accept; events collection is append-only audit.|
| Step 8 (notify) | All writes + event durable, notification not dispatched                                | Step 4–6 idempotent; step 7 may double-write; step 8 fires. **Duplicate notification risk** — same risk as today (transactions wouldn't help; notifications are external sends). |
| Step 9 (fan-out)| All local state durable, `on_complete` `context.callApi` not fired                     | Re-fires the fan-out callApi. Fan-out targets need to be idempotent — same requirement as today. |
| Step 10 (tracker)| Writes durable, parent action not pushed                                              | Tracker subscription re-fires on retry; uses `force: true` per shipped helper. |
| Step 11 (post-hook)| Writes + side effects all landed, post-hook didn't run                              | Post-hook re-runs. Author-supplied post-hooks must already be idempotent under the part 9 contract (which surfaced `post_hook_error` precisely because post-hooks fire after the irreversible work). |

The current design's idempotency story already covers all of this; the change just stops layering an `error` transition on top.

### D2. Why pre-hooks no longer get a `hook_error` field

`hook_error` exists because the engine needs a way for a pre-hook to abort the submit without throwing — the spec wanted a "graceful abort with a structured message." But it's an attractive-nuisance API:

- Authors reach for `hook_error` when they actually want to push `status: error` (most common observed intent). That's a status change, not an abort — and goes through `actions[]` / `status` like every other status change.
- Authors who genuinely need to abort (e.g. "validation failed, don't write anything") throw from the hook with `{ cause }` per change 1. The engine doesn't catch it; CallApi surfaces it. Same retry posture as any other engine failure.
- Removing the `pre-hook` reason path from `updateAction(..., force: true)` deletes a whole branch in the failure-shape spec.

The hook chooses between two clean modes: push `status: error` via `actions[]` and return cleanly (action lands in error, log event + notifications fire normally, user sees normal completion), or throw (no writes, user sees a transient error and may retry).

Side-effect semantics on the "land in error" path are deliberately the same as any other status push — log events and notifications fire. Authors who don't want notifications on the `error` push scope notifications by target stage in the action config; this is already how the notifications layer works, no new lever needed.

Task actions whose `task.statuses:` list includes `error` can push it via `submit_edit` + caller-supplied `current_status: 'error'` today, with no engine change — the existing `resolveTargetStatus` path for task `submit_edit` returns whatever `current_status` the caller sends, and `error.priority = 1` lets it through the priority rule cleanly. That's the second working entry path alongside pre-hook `actions: [{ ..., status: 'error' }]`. Two precision notes on the task path: (a) `task.statuses:` is a UI-only gate (the status-selector dropdown) — the engine does not validate `current_status` against it, so an external caller with knowledge of the endpoint can pass any `current_status`, including `error`, regardless of `task.statuses:`; the priority rule is the only engine-side check, and `error.priority = 1` lets the write through. (b) Task `submit_edit` *requires* `current_status` on the payload (the engine throws otherwise) — there's no fallback to a default; that's a pre-existing constraint, narrower than form `submit_edit`.

### D2a. Status-entry shape simplification (docs/types/return-field cleanup)

The concept spec ([engine/spec.md § Action doc / status field](../../../workflows-module-concept/engine/spec.md)), Part 6's design.md § Failure shape, and the `StatusEntry` typedef in [`shared/types.js:9-16`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/types.js) describe a polymorphic error-only shape with optional `reason` / `error_message` / `error_metadata` fields on the status entry itself. **Shipped code never wrote those fields onto a status entry.** [`shared/updateAction.js:71-78`](../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js) writes a uniform `{ stage, event_id, created }` for every push — including the force-push from the catch-converter. The polymorphic fields live on the handler's *return* surface, as an `error_transition: { reason, error_message, error_metadata }` object built in [`handleSubmit.js:302-332`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js).

This part collapses the contract to what writers already do. Concretely:

- **Doc cleanup** — engine/spec.md § Action doc, Part 6 design.md § Failure shape: rewrite to state status entries are uniform `{ stage, created, event_id }`.
- **Type cleanup** — `shared/types.js` `StatusEntry` typedef: drop the optional `reason` / `error_message` / `error_metadata` fields.
- **Return-shape cleanup** — handler return drops the `error_transition` field entirely (handler throws instead of returning a partial; see change 1).

Failure context lives where every other status-change context lives: on the `events` collection entry written by step 7. Pre-hooks that want to capture diagnostics on an `error` push do so via `event_overrides.metadata` on the return — same channel for all other status pushes ([engine/spec.md § Event overrides](../../../workflows-module-concept/engine/spec.md), [Part 09 § event_overrides](../09-hook-invocation/design.md#pre-hook-return-merge)).

**No data migration.** The module is unshipped and has no consumers, but the question is moot regardless: no shipped writer ever populated the polymorphic fields on a status entry, so there are no historical action docs carrying the old shape.

### D3. Why `resolve_error` stays as its own interaction

The first draft of this design proposed collapsing `resolve_error` into `submit_edit`. That was wrong. Two reasons recovery deserves its own interaction:

1. **Per-interaction hooks.** Authors who care about recovery commonly want different hooks for it than for normal edit submits — log to a different system, ping a different channel, run a stricter validation. Today's hook-emission template gives every interaction its own `pre` / `post` endpoint pair (`update-action-{type}-{interaction}-{pre|post}`); collapsing `resolve_error` into `submit_edit` would force authors to branch inside a single pre-hook on `context.action.status[0].stage === 'error'`. Less declarative, no real gain.

2. **Parity with `-review`.** `-error` is the recovery analogue of `-review`: optional, gated by the verb in `access.{app_name}`, with its own page chrome and its own pair of buttons / interactions. Treating `-error` differently from `-review` would make the action-authoring surface asymmetric for no payoff.

The mechanical reason the first draft wanted to drop `resolve_error` was that today's priority table (`error.priority = 1`) makes recovery transitions require force-write — so `resolve_error` was the engine's signal to bypass the priority rule. On closer look, that's correctly-placed plumbing, not a leak: `resolve_error` is a single well-defined recovery path, and centralising one `force: true` inside it is cheap. The interaction stays at parity with `submit_edit` / `approve` / `request_changes` / `not_required` from authors' point of view; the handler-internal force-write is invisible to them.

**What stays unchanged:**

- Button vocabulary keeps all five entries.
- Interaction → target status table keeps the `resolve_error` row.
- Hook emission keeps `update-action-{type}-resolve_error-{pre,post}` alongside the others.
- `-error` page template + status guard `[error]` unchanged.
- `pages.error.events.onSubmit`, `pages.error.buttons.submit.{title, modal}` unchanged.
- Priority table unchanged. `error.priority = 1` stays.
- Shipped handler-internal `updateAction(..., force: true)` for `interaction === 'resolve_error'` stays.

### D4. Why we keep the priority table

The priority rule's job is to gate transitions. Two failure modes:

- **Too permissive** — anyone can write any status from anywhere; the state machine loses meaning.
- **Too restrictive** — common transitions need `force: true` everywhere, force becomes meaningless noise on every call site.

The asymmetry in the *domain* is that entry into `error` happens from many sources — pre-hooks, manual task-status selectors, backend microservices (production apps commonly run an external Lambda that mirrors status enums and pushes `error` when its own processing fails). Exit from `error` happens from exactly one path: the `resolve_error` interaction wired into the `-error` page template. The priority table is shaped to match that domain asymmetry: `error.priority = 1` puts the friction at the rare site (recovery) and keeps the common sites (push-to-error) frictionless. That's the right shape *even though* today's engine surface only exposes two of those entry paths through `SubmitWorkflowAction` — pre-hook `actions: [{ ..., status: 'error' }]` (any action kind) and task `submit_edit` + caller-supplied `current_status: 'error'` (if `task.statuses:` includes `error`). The remaining domain pathways (form / tracker external pushes from outside a hook) are out of scope for this part and covered by the deferred external-system error injection API (see Out of scope). Designing the priority table for the broader domain shape — not the narrower current surface — keeps the table stable as that follow-on lands.

Bumping `error` to a high priority (the first draft's proposal) would invert this: free recovery, force-required entry. It would also require a coordinated rollout across the module enum, every consumer app's local enum, and the Lambda mirror. Not worth it.

### D5. Soft-reject channel — `:reject` from a pre-hook propagates transparently

The cleanup leaves no obvious channel for the "your submission is invalid, fix and retry" case — `hook_error` is gone (it conflated abort, write, and message), and a bare `throw` produces a generic transient-error toast that doesn't communicate the upstream's user-facing message.

The right primitive is Lowdefy's existing `:reject` control. Hook authors already use `:reject` in routines for validation rejections, and once `runRoutine.js` preserves `:reject` across nested throws (per the [Upstream dependency](#upstream-dependency)), no engine-side handling is needed — the reject propagates transparently across every routine boundary it crosses.

**End-to-end flow:**

1. Pre-hook routine:
   ```yaml
   routine:
     - id: check_crm
       type: HttpsRequest
       # ... call upstream validator
     - ':if': { _eq: [{ _step: check_crm.duplicate }, true] }
       ':then': { ':reject': 'Company name already exists in CRM' }
   ```
2. The pre-hook's `runRoutine` returns `{ status: 'reject', error: UserError(isReject: true) }` for the reject step. `invokePreHook.js` invokes the pre-hook via `context.callApi`, which throws the `UserError` on a `'reject'` result ([callRequestResolver.js:43-44](../../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js)). `invokePreHook.js` **does not catch**.
3. The throw propagates out of `invokePreHook.js` → `handleSubmit.js` → the `SubmitWorkflowAction` plugin handler. No engine-side catch anywhere.
4. The wrapping per-action endpoint's step (which called the plugin) sees the throw. Lowdefy errors pass through `callRequestResolver.js:80-86` unchanged (resolver doesn't re-wrap), so the `UserError(isReject: true)` reaches the wrapping endpoint's `runRoutine` catch unchanged.
5. `runRoutine.js`'s catch (post-upstream-tweak) returns `{ status: error.isReject ? 'reject' : 'error', error }`. Since `isReject` is true, the wrapping endpoint's overall status is `'reject'`.
6. The calling app's `CallApi` sees a reject with the original message. Page templates handle it through Lowdefy's standard reject-surface convention — same as any other `:reject` from any other app routine. No workflows-specific UI mechanism.

**No writes happen.** The reject fires from inside the pre-hook (step 2 of the lifecycle), so the throw propagates before step 4 ever runs.

**Why `:reject` and not a workflows-specific error class:**

- Standard primitive. Hook authors already know it; no new convention to learn.
- Upstream-improvable. If Lowdefy adds a richer reject-rendering pattern (structured fields, i18n keys, field-level errors), workflows hooks pick it up for free.
- Symmetric with the rest of the platform. A reject from a workflows pre-hook surfaces the same way a reject from any other API routine does — and now propagates correctly across nested routines for *all* Lowdefy apps, not just workflows.

**Crash vs reject is decided by the hook author, not the engine.** A hook that wants "user can see the message and fix it" calls `:reject`. A hook that wants "infra error, retry later" calls `:throw` (or just lets a thrown error propagate). Both throw out of the handler identically; the discriminator is `isReject` on the propagated `UserError`, read once at the outermost `runRoutine` catch.

## Upstream dependency

This part has a **hard dependency** on a small change to `@lowdefy/errors` and the routine-runner layer in the Lowdefy repo. D5's soft-reject channel is unimplementable without it — `controlReject.js` and `controlThrow.js` both construct identical `new UserError(message, { cause })`; `callRequestResolver.js` throws the same `error` object for both; and `runRoutine.js`'s outer catch unconditionally labels every caught throw as `{ status: 'error' }`. So by the time a `:reject` has crossed any routine boundary as a throw, the discriminator is gone.

Hand-off scope (single PR against the Lowdefy repo):

- **`packages/utils/errors/src/UserError.js`** — add `isReject` to the constructor options; default `false`; assign to `this.isReject`.
- **`packages/api/src/routes/endpoints/control/controlReject.js`** (line 40) — pass `isReject: true` when constructing the `UserError`.
- **`packages/api/src/routes/endpoints/runRoutine.js`** (lines 56-62) — rewrite the catch to branch on `isReject` *before* `context.handleError` runs, so propagated rejects bypass `handleError` (preserving today's invariant: rejects never hit `handleError`) and only errors trigger it:

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

  This preserves `:reject` semantics across every nested-routine boundary a throw crosses, *and* keeps `handleError` (and any Sentry / alerting wiring behind it) fired only on infrastructure errors — never on deliberate user-facing rejections. Matches the routine-loop early-return at line 49, which also skips `handleError` for in-routine rejects.

- **`controlThrow.js`** unchanged (no flag).

Consumers of `callApi` keep their natural posture — they either inspect the return (when the inner step's status is `'return'`) or let the throw propagate (when it's `'reject'` or `'error'`). No signature change to `callApi` itself.

**Semantic note for the upstream PR.** The `runRoutine` tweak changes how every `:reject` in every Lowdefy app surfaces if it propagates past its own routine. Today a nested `:reject` becomes an outer `'error'`; with the tweak it stays a `'reject'`. This is almost certainly what apps want — a reject is a reject regardless of nesting depth — but the PR description should call it out so reviewers can sanity-check against any routines that depended on the implicit reject-→-error coercion. We're not aware of any such routines in current Lowdefy use, but flagging it lets reviewers confirm. The tweak also preserves today's `handleError`-doesn't-fire-on-rejects invariant: by branching on `isReject` *before* `context.handleError`, propagated rejects bypass `handleError` entirely — symmetric with the routine-loop early-return at line 49 (which also skips `handleError` for in-routine rejects) and keeping production hosts that wire `handleError` to Sentry / alerting free of noise from deliberate user-facing rejections.

Part 29 does not ship until the upstream PR merges. Part 29's implementation tasks block on it.

### D6. Propagate-everywhere — no engine-side catching of sub-step throws

The handler runs all 11 steps sequentially. Any step that throws propagates. The engine catches nothing. One rule, no exceptions. Three things this means concretely:

- **Notifications (step 8):** a failed `context.callApi` to the notifications module throws → user sees the submit toast as failed. Notifications module's own retry/queue still works (the throw means "this submit's relay failed," not "the notification is permanently lost"). Surfacing the failure to the user is honest: they might want to manually notify the relevant party while the system retries.
- **Post-hook (step 11):** a thrown post-hook propagates → user sees submit as failed even though writes (steps 4–10) have landed. This is deliberate — post-hooks commonly drive critical downstream side effects (contracts for signature, external sync), and silent swallow makes those failures invisible. Authors must make post-hooks idempotent (standard contract for any retryable side effect). Authors who genuinely want a best-effort branch wrap that branch in `:try` inside the hook routine; that's their choice, not engine policy.
- **No soft-surface fields on the response.** The originally-designed `post_hook_error: { message, metadata? }` field from part 9 disappears. The success return is "everything completed cleanly"; any failure is a throw. Removes ambiguous "succeeded but with a problem" states.
- **Duplicate-write windows widen.** Per the D1 table, any step ≥ 7 throw plus retry can double-write the events-log entry (step 7); any step ≥ 8 throw plus retry can double-fire notifications (step 8). Same risk class as today (Mongo transactions wouldn't help for the cross-API steps), and the existing acceptance applies: the `events` collection is append-only audit and the UI tolerates duplicates; the notifications module is idempotent today, so a step ≥ 8 throw + retry resolves to a single user-visible notification — the user-facing blast radius of this widened window is bounded.

The pre-hook `hook_error` removal *does* affect part 9 (deletes the merge-and-write-error-transition branch from `invokePreHook.js`'s merge logic). Post-hook handling in part 9 also changes — `invokePostHook.js` no longer wraps the callApi in try/catch; thrown errors propagate.

**Pre-existing wart this surfaces (out of scope here):** part 6's priority-rule self-exception writes a fresh status entry on every retry of a same-stage push on the `currentActionId`. Designed for "user genuinely clicked twice"; means transient-failure retries grow audit history. Worth a follow-on consideration once we see real retry frequency. Out of scope for this part.

## What this changes

### Concept specs

- **[engine/spec.md § Action `error` transition](../../../workflows-module-concept/engine/spec.md#action-error-transition)** — rewrite. New text describes `error` as an author-driven domain stage only. Removes the "Engine-driven mid-submit failure" path and the "Author-driven (via `hook_error`)" path. Adds: "Pre-hooks push `error` via `actions: [{ ..., status: 'error', force: true }]` when they need to mark the action errored; external systems write directly to the action doc; authors can also configure a status selector to allow a user to choose `error` from a task `submit_edit`. Diagnostic context is carried on the events-log entry via `event_overrides.metadata`, same as every other status push — status entries themselves are uniform `{ stage, created, event_id }`."
- **[engine/spec.md § Action doc / status field](../../../workflows-module-concept/engine/spec.md#action-doc)** — status entry shape note changes from "`[{ stage, created, ... }]` plus error-only `{ reason, error_message, error_metadata }` fields" to a uniform `{ stage, created, event_id }`. Spec text only — no shipped writer ever populated the polymorphic fields. Also updates [`shared/types.js` `StatusEntry` typedef](../../../../plugins/modules-mongodb-plugins/src/connections/shared/types.js) to drop the optional `reason`/`error_message`/`error_metadata` fields.
- **[engine/spec.md § Priority rule](../../../workflows-module-concept/engine/spec.md#priority-rule)** — priority table values unchanged. Update the per-doc force callers list: the submit-pipeline's catch-converter is gone, so its `force: true` `error` write disappears; remaining per-doc force callers are `resolve_error`'s recovery transition, tracker subscription's parent push, and `StartWorkflow`'s parent-link push.
- **[engine/spec.md § Capabilities](../../../workflows-module-concept/engine/spec.md#capabilities)** — `SubmitWorkflowAction` return shape: drop `pre_hook_response: null`, `hook_error`, `post_hook_error: null` from the failure-mode wording. Failures throw.
- **[submit-pipeline/spec.md § Button vocabulary](../../../workflows-module-concept/submit-pipeline/spec.md#button-vocabulary-template-shipped-open-validate)** — unchanged structurally (all five buttons remain). Remove any prose tying `resolve_error` to engine force-write semantics; it's now a regular priority-allowed transition.
- **[submit-pipeline/spec.md § Interaction → target status](../../../workflows-module-concept/submit-pipeline/spec.md#interaction--target-status)** — unchanged.
- **[submit-pipeline/spec.md § Pre-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional)** — drop the `hook_error` field. Update prose noting that pre-hooks abort by throwing.
- **[ui/spec.md](../../../workflows-module-concept/ui/spec.md)** — unchanged for `-error`; clarify in the page-emission section that the page exists for author-driven recovery from `error` (not engine-driven mid-submit failure, which no longer happens).
- **[action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md)** — `interactions:` examples unchanged; `resolve_error` row in the examples stays.
- **[Part 01 § In scope](../_completed/01-call-api-primitive/design.md)** — deviation note added at the top of the Part 1 design recording that shipped `callApi` throws on `:reject` / `:throw` and returns raw response on success (no `{ success, response, error }` envelope was ever built). Part 29's D5 reject-discrimination flow operates against the shipped throw-on-error contract via `error.isReject` (see [Upstream dependency](#upstream-dependency)). Re-specifying `callApi` to the never-throws shape is out of scope here — the change radiates across every existing routine step. Part 1's spec text is preserved as-written; the deviation note flags it for future readers. **`result.success` is not a callApi envelope.** Shipped `callApi` returns the invoked routine's return body verbatim on success; the `result.success` patterns observable in `dispatchNotifications.js` / `dispatchLogEvent.js` are reading author-defined fields from those routines' own return bodies, not a framework-level success envelope. Noted here so a future reader grepping `result.success` doesn't re-spawn the same review thread.

### Shipped code (part 06, parts 16/17/19/20a if affected)

Per the workflows-module convention ([design.md § Conventions across parts](../../design.md#conventions-across-parts)), shipped parts aren't reopened. Part 29 amends shipped code directly — same posture as part 21 (which amended shipped parts 3, 4, 14) and part 23 (which reused shipped part 5's helpers).

Files touched in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`:

- **`handleSubmit.js`** — remove the `try`/catch around steps 4–11 ([lines 302-333](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) that builds an `errorTransition` object and force-pushes a `{ stage: 'error' }` status entry. Let throws propagate. The `errorTransition` was only ever a *return-field* surface — shipped `updateAction` always wrote a uniform `{ stage, event_id, created }` status entry (per D2a).
- **`handleSubmit.js`** — drop the `error_transition` field from the handler return entirely. Also remove the partial-return shape with `pre_hook_response: null` / `post_hook_response: null` from the failure path (no failure path exists anymore — failures throw).
- **`handleSubmit.js`** — delete the inline comment at [line 312](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (`// PART 9: hook_error path takes the same shape but with reason: 'pre-hook'.`) — it references a path being removed entirely.
- **`handleSubmit.js`** — delete the four per-step `try/catch` blocks at [lines 216-218](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [297-300](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [339-341](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), and [347-349](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). Their only purpose was to set `err.step` for the catch-converter's `reason` field; with the catch-converter removed there's no reader, and bare propagation preserves the original error object identically.
- **`handleSubmit.js`** — update the handler's `@returns` JSDoc at [lines 60-70](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js): drop the `error_transition?` field, and narrow `pre_hook_response` / `post_hook_response` from `any | null` to the success-only shape (no nullable union — failures throw, so the never-on-failure nullable isn't accurate).
- **`shared/types.js`** — drop `reason`, `error_message`, `error_metadata` from the `StatusEntry` typedef and drop the `error_transition` field from the `SubmitWorkflowActionResult` typedef (or wherever the return type is documented).
- **`shared/updateAction.js`** — no contract change; the `force: true` per-doc surface stays (tracker subscription + StartWorkflow still use it). Only one caller goes away (the catch-converter).
- **No change** to the priority-rule helpers (`utils/shouldUpdate.js`, `utils/getCurrentAction.js`).

Files touched in `modules/workflows/`:

- **`enums/action_statuses.yaml`** — no changes. Priority table unchanged.
- **Per-action page resolver / template emissions** — no interaction-string change; `-error` page button keeps posting `resolve_error`. Shipped `force: true` handling for `resolve_error` recovery stays.
- **Tests** — priority table fixtures unchanged. Add fixtures asserting that engine sub-step throws don't write an `error` transition and that retries converge under idempotency.

### Part 9 (unshipped, in-progress on this branch)

Part 9 is currently being written ([git status](#) shows `09-hook-invocation/design.md` modified). Amendments before it ships:

- **`invokePreHook.js`** spec — remove the `hook_error` branch entirely. The merge logic shrinks: `status`, `actions[]`, `event_overrides`, `form_overrides`. The "skipped on `hook_error`" rules go away.
- **`invokePreHook.js`** spec — **no soft-reject branch.** Per the upstream `runRoutine.js` tweak (see [Upstream dependency](#upstream-dependency)), a `:reject` from the pre-hook propagates transparently as a `UserError(isReject: true)` throw — `invokePreHook.js` does not catch, the handler does not catch, and the wrapping endpoint's `runRoutine` classifies it as `'reject'` automatically. No `{ rejected, reject_message }` return surface on the handler.
- **`invokePostHook.js`** spec — drop the try/catch wrap around `context.callApi`. Post-hook throws propagate per D6. `post_hook_error` return field disappears.
- **Pre-hook return shape** in the design — drop the `hook_error` field. No `rejected` / `reject_message` fields either (reject propagates as a throw, not a return).
- **Pre-hook abort example** — add the two abort modes: `throw` (crash, generic transient error toast) and `:reject` (deliberate, user-facing message via the standard Lowdefy reject surface, propagated transparently).
- **Failure-shape return** — no longer carries `pre_hook_response` on the error path (because there is no error path through the handler — failures throw).

## Out of scope / deferred

- **MongoDB transactions for true atomicity.** Considered and rejected for this part — adds dependency on a Lowdefy framework feature (declarative `transaction:` on API routines), requires replica-set infrastructure, and the partial-write story is already adequate under idempotent retry. Revisit if a real consumer surfaces a corruption case retry can't reach.
- **Duplicate-event mitigation for retried submits.** Step 7's log-event write is theoretically duplicable on retry (handler crashed after writing the event doc but before responding). Same risk as today. Accepted; the `events` collection is append-only audit and the UI tolerates duplicates.
- **External-system error injection API.** Deferred to a follow-on design that exposes operational helpers for external systems (scheduled Lambdas, backend microservices) to push status transitions. Until then, external pushers use `SubmitWorkflowAction` as a system user with a configured interaction.
- **Status-selector inclusion of `error`.** Whether `error` shows up in a task action's status-selector dropdown ([Part 06 § Interaction → target-status mapping](../_completed/06-submit-action-writes/design.md#interaction--target-status-mapping-engine-default-only)) is an authoring decision (`task.statuses:` list). Default behaviour: not included; authors opt in.
- **Consumer audit for failure-path partial return shape.** The module isn't shipped and no host apps exist yet, so there are no consumers reading `event_id: null` / `tracker_fired: null` / `hook_error` / `post_hook_error` to verify. Any future consumer will be reading the new (throw-on-failure) shape this design specifies, so the audit is moot.
- **Reject-rendering UX at the page/template layer.** D5 assumes Lowdefy's standard `:reject` surface (whatever toast / form-error / banner the platform shows for any other API reject) is sufficient for the workflows pre-hook reject path. If that assumption doesn't hold — or if workflows pages want richer rendering (field-level errors, structured fields, i18n keys, distinct chrome from a regular reject) — it's a separate design covering page templates, button states, and the reject-message contract. Out of scope here; revisit when a real consumer surfaces the need.

## Depends on

[Part 6](../_completed/06-submit-action-writes/design.md) (handler — removes catch-converter), [part 9](../09-hook-invocation/design.md) (in-flight; drops `hook_error`, no soft-reject branch — `:reject` propagates transparently per D5/upstream), [part 13](../13-resolver-apis/design.md) (in-flight; **no trailing `:reject` control step needed** — the wrapping endpoint's `runRoutine` classifies the propagated reject automatically once the upstream tweak lands). Upstream change in [`@lowdefy/errors` UserError](../../../../../lowdefy/packages/utils/errors/src/UserError.js), [`controlReject`](../../../../../lowdefy/packages/api/src/routes/endpoints/control/controlReject.js), and [`runRoutine.js`](../../../../../lowdefy/packages/api/src/routes/endpoints/runRoutine.js) — single small PR, see [Upstream dependency](#upstream-dependency). No edit to part 16 (error template unchanged).

## Verification

### Unit tests

**Two existing tests are rewrites, not net-new additions:**

- [`handleSubmit.test.js:798-819`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js) (`step 5 throws → action_ids still set; summary write durable; error layered on action`) — rewrite. Drop the `result.error_transition` assertions (lines 808-810); drop the layered-`error`-on-status assertions (lines 816-818). Replace with: handler **throws** (use `expect(handleSubmit(...)).rejects.toThrow(/simulated step 5 failure/)`), and the submitted action's `status[0].stage` is **still** `in-review` (the step-4 transition) — no `error` entry layered on. Rename the test (drop "error layered" framing). **Test body restructure note:** the existing test shape is `const result = await handleSubmit(...); ...; const doc = await mongo.db.collection("actions").findOne(...)`. Pivoting to `rejects.toThrow` consumes the `await handleSubmit(...)` call inside the matcher, so the side-effect read has to happen as a *separate* `await mongo.db.collection("actions").findOne(...)` after the throw assertion (or wrap the call in `try { await handleSubmit(...) } catch { /* swallow */ }` and read state). Concretely: after the `rejects.toThrow` line, `findOne` the action doc and assert `status[0].stage === 'in-review'` (no `error` layered on) and `status.length === 2` (the original `action-required` + step-4's `in-review`). Without this explicit sequencing, an implementer following the abstract description might write only the throw assertion and silently lose the partial-write-durability coverage.
- [`handleSubmit.test.js:821-869`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js) (`step 6 throws → ... error layered on action`) — same rewrite. Drop the `error_transition` and layered-`error` assertions. Replace with: handler throws; step 5's summary write is still durable (the test's existing `wf.summary` assertion at line 864 stays as-is — that's the proof the partial-write story holds); submitted action's `status[0].stage` remains `in-review`. **Same test-body restructure note as above:** the existing `wf.summary` assertion happens after a successful `await handleSubmit(...)`; once the call throws, the `wf.summary` read needs to be sequenced after the `rejects.toThrow` (separate `findOne` against `workflows`, or `try`/`catch` swallow then read).

**New unit tests:**

- `handleSubmit` with a throwing step-4 sub-step: handler rethrows; **no `error` transition** is written; the action's status array is unchanged from pre-submit.
- `handleSubmit` with a throwing pre-hook: handler rethrows; no writes performed; matches "pre-hook abort by throw" contract.
- `handleSubmit` with a `:reject`-ing pre-hook (mock `context.callApi` to throw a `UserError` with `isReject: true`): handler **rethrows** (no internal catch); no writes performed. End-to-end propagation (the `UserError` reaching the wrapping endpoint's `runRoutine` and classifying as `'reject'`) is exercised at the integration layer once the upstream PR lands, not in this unit.
- `handleSubmit` with a throwing step-7 (event log via callApi): handler rethrows; steps 4–6 writes have landed and stay; no `post_hook_error`-style soft surface. Retry converges via idempotency (duplicate event possible — accepted).
- `handleSubmit` with a throwing step-8 (notifications callApi): handler rethrows; writes have landed and stay; notification module's own retry continues independently. Retry converges (duplicate notification possible — accepted; same risk as today).
- `handleSubmit` with a throwing post-hook (step 11): handler rethrows; writes have landed and stay; no `post_hook_error` field on the response. Author contract: post-hooks must be idempotent.
- Retry of a partial step-4 write: priority rule no-ops landed entries, writes missing entries; final state matches a single-shot success.
- Pre-hook returning `status: 'error'` (no `force` needed — `error(1)` is below every non-terminal stage) writes the error transition cleanly via the normal priority path; no special `hook_error` branch invoked.
- `resolve_error` recovery still writes via internal `force: true` in the handler — unchanged from shipped behaviour.

### Integration / handler-level

- `update-action-{type}-resolve_error-{pre,post}` endpoints emitted iff `error` is in `access.{app_name}` — same gating as `-review` interactions.
- The `-error` page submit posts `interaction: resolve_error` and recovers via the handler-internal `force: true` write (same as today).
- A pre-hook that throws surfaces as a `CallApi` error to the caller; no `error` transition appears on the action.

### E2E (part 22)

- Add a spec exercising the "transient infra failure → user retry → success" path: mock a step-5 throw, assert the action's status array doesn't grow an `error` entry, assert the retry succeeds.
- Add a spec exercising "author pushes error via pre-hook → user recovers via `-error` page submit": status goes `action-required → error → in-review` (or `→ done`) with no force needed on the recovery leg; the `resolve_error` pre/post hooks fire on the recovery submit.
- Keep the existing `resolve_error` spec slice — it still exercises the interaction; only the priority semantics under it changed.

## Contract to neighbours

- **Part 6 (shipped)** — direct amendment in `handleSubmit.js`. No new file; remove the catch-converter branch and the partial-return shape. Drop the polymorphic status-entry fields (`reason`, `error_message`, `error_metadata`) anywhere they're written.
- **Part 9 (in-flight)** — design + implementation drop `hook_error` before merging. `invokePreHook.js` does **not** catch around `context.callApi` for reject discrimination — `:reject` propagates as a throw transparently. `invokePostHook.js` drops its try/catch wrap. Pre-hook return type narrows (no `hook_error`, no `rejected`/`reject_message`).
- **Part 13 (in-flight)** — resolver does **not** emit a trailing `:if` / `:reject` control step on per-action endpoints. The reject surfaces automatically via the `runRoutine.js` upstream tweak.
- **Part 16 (shipped)** — no change. `-error` page, `resolve_error` button, and the handler-internal `force: true` recovery all stay.
- **Part 22 (in-flight)** — keep the `resolve_error` recovery slice; add the new "engine sub-step throw → user retry → success" slice.
- **Parts 19, 20a (shipped)** — unaffected. No surface change.
