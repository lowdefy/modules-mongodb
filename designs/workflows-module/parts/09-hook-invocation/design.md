# Part 09 — Hook invocation (pre/post + `force` + status resolution layers)

**Source rationale:** [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

Turn `SubmitWorkflowAction` into the full per-interaction lifecycle: invoke the author's pre-hook before writes, merge its return values into the engine's plan (status, actions[], event_overrides, form_overrides), let deliberate user-facing rejections propagate transparently via Lowdefy's `:reject` control (per [Part 29 § D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently)), invoke the post-hook after writes, and implement the three-layer status resolution (engine default → action YAML `interactions:` → pre-hook `status`).

This part lights up step 2 (pre-hook, pre-write) and step 11 (post-hook, after all side effects) of the 11-step lifecycle skeleton committed by [Part 6 § Lifecycle scaffold](../_completed/06-submit-action-writes/design.md#lifecycle-scaffold).

## In scope

### `invokePreHook.js`

- Reads the hook id from `context.params.hooks?.[interaction]?.pre`. The `hooks` slot is baked onto the routine step's `properties` by [`makeWorkflowApis.js`](../../../../modules/workflows/resolvers/makeWorkflowApis.js) (see `emitHooks`) — the resolver emits the slot only when the action declares hooks, and omits per-interaction / per-phase entries that have no body. The id follows the template `update-action-{action_type}-{interaction}-pre` (post-hook: `…-post`), per [Part 13 § Hook emission](../_completed/13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate).
- **Skip on missing — no-op invocation.** If `params.hooks` is undefined (no `hooks:` declared on the action), or `params.hooks[interaction]` is undefined (this interaction has no hooks), or `params.hooks[interaction].pre` is undefined (no pre-hook declared for this interaction, even if `.post` is), `invokePreHook.js` returns `null` without calling `callApi`. Downstream consequences: `pre_hook_response: null` on the handler return; the four-layer event merge collapses to three layers (no layer-4 contribution); the `actions[]` merge sees only the step-1 `currentActionEntry` and auto-unblock entries; `form_overrides` merge sees only `form` + `form_review`; the status resolver collapses to engine-default + YAML override. Use optional chaining on every level — `params.hooks?.[interaction]?.pre` — so the read never throws on a missing parent.
- Invokes via `context.callApi({ id: <hook-api-id>, module: 'workflows' }, payload, { user: context.user })`. The module is the literal `'workflows'` — hook Apis are emitted under the workflows module entry by `makeWorkflowApis`, so the `{ id, module }` form is required; a bare string would silently dispatch into the consuming app's own-Api namespace. Matches the call shape established in [dispatchNotifications.js:17–21](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js) and reused by [part 11](../11-group-on-complete-fanout/design.md).
- Payload shape:
  - `workflow_id`, `workflow_type`, `action_id`, `action_type`, `current_key`, `interaction`.
  - `form`, `form_review`, `fields`.
  - `current_status` — caller-supplied for task `submit_edit` (status-selector pattern, per [Part 6 § Interaction → target-status mapping](../_completed/06-submit-action-writes/design.md#interaction--target-status-mapping-engine-default-only)); `null` for form actions and all other interactions.
  - `comment` — the user-supplied free-text comment (top-level scalar; `null` if not supplied). Inspect-only on the payload — pre-hooks rewrite the comment via `event_overrides.metadata.comment` on the return (the layer-4 channel), not via a top-level return field. No separate `comment` slot on the pre-hook return.
  - `user: { id, profile, roles }`.
  - `context: { workflow: <doc>, action: <doc> }`.
- Captures the return object; passes it through to merge logic below. The raw return object (pre-merge, exactly what the hook returned) is surfaced as `pre_hook_response` on the handler's API return — symmetric with `post_hook_response` below. Defaults to `null` when no pre-hook is declared. Surfacing the raw return rather than the post-merge composite keeps hook-author debugging direct ("what did my hook return?") and avoids leaking engine-internal normalization (e.g. the singular-`key` → plural-`keys` translation in the actions-merge collision pass) into the response.
- **No try/catch.** `invokePreHook.js` does not wrap the `context.callApi` invocation. Any throw — whether a crash or a `:reject` (`UserError(isReject: true)`) — propagates transparently up through `handleSubmit.js` → the `SubmitWorkflowAction` plugin handler → the wrapping per-action endpoint's `runRoutine`, which classifies it as `{ status: 'reject' | 'error' }` based on `error.isReject` (per the upstream `runRoutine.js` tweak — see [Part 29 § D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently) and [§ Upstream dependency](../29-error-model-cleanup/design.md#upstream-dependency)). The handler does not see the discriminator; there is no `{ rejected, reject_message }` return surface on the handler.
- **Timeout.** Pre-hook and post-hook invocations omit `options.timeout`; the [part 1 `callApi` default (10s)](../_completed/01-call-api-primitive/design.md) applies. Revisit if real apps need a different value.

### Pre-hook return merge

All optional fields:

- **`status`** → overrides the engine default target status. Three-layer precedence:
  1. Engine default per interaction (from [part 6](../_completed/06-submit-action-writes/design.md)).
  2. Action YAML `interactions[interaction].status` (read from the endpoint config; part 13 bakes it in).
  3. Pre-hook return `status` (last wins).
  - Priority rule still applied to the resolved value.

  **Required inputs are validated before the pre-hook fires.** The engine default is computed at step 1 ([`resolveTargetStatus` in `handleSubmit.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)), before step 2's pre-hook invocation. Any input the engine default depends on — e.g. `current_status` for task `submit_edit`, which `resolveTargetStatus` requires and throws on if missing — must be present on the payload at submit time. The pre-hook **cannot rescue missing required inputs**: the throw fires before the pre-hook ever runs. The three-layer precedence is about *resolving* a target status the engine can already compute a default for; it does not extend to *recovering* from malformed input. Authors who need post-hook computation of target status (e.g. derive the stage from data the hook fetches) still need the layer-1 inputs present — they can return any `status` they want via layer 3, but they cannot bypass the layer-1 input contract.
- **`actions[]`** → merged with engine-computed auto-unblocks from [part 7](../_completed/07-group-state-machine/design.md). Entry shape (matches [submit-pipeline/spec.md § Pre-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional)):
  ```
  { type, key?, status?, fields?, upsert?, force? }
  ```
  - `type` — action type to write.
  - `key` — keyed/instanced actions only; null or omitted for non-keyed.
  - `status` — target stage. Omit for form-data-only writes (no status push; `fields` `$set` ops only).
  - `fields` — form-data fields to `$set` at `form_data.{type}[.{key}].{field}` alongside the transition.
  - `upsert: true` — spawns an instanced action if one doesn't exist, per [part 4](../04-workflow-config-schema/design.md) schema.
  - `force: true` — bypasses the priority rule on this entry's write (see [Part 6 § Priority rule](../_completed/06-submit-action-writes/design.md#priority-rule)). Use for replay / rollback (e.g. `done → action-required`).

  **Trusted-channel posture — no per-entry access check.** Pre-hook `actions[]` entries write through Part 6's per-entry loop with **no per-entry `access.roles` check**. The user-side auth boundary is the per-endpoint role check at step 1 ([`handleSubmit.js:115–124`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)), which gates user access to the submitted action's `access.roles`. Pre-hooks are server-side trusted code authored by the same workflow YAML author who declares `access.roles` — they're the engine's controlled escape hatch and can write to action types the user does not directly have access to. A pre-hook author who wants cross-action writes gated does so inside the hook routine (read `user.roles` from the payload, check, `:reject` on mismatch).

  This is consistent with the other trusted-channel surfaces pre-hooks already expose: `force: true` bypasses the priority rule (a write-time invariant), `event_overrides` rewrites the audit-log payload, `:reject` surfaces arbitrary author messages to the user. Adding per-entry role enforcement only to `actions[]` would be the single gate the pre-hook can't bypass — an inconsistent posture. The step-1 role check still binds: a user without access to the *submitted* action can't reach the pre-hook at all, so the pre-hook only gets to fan out if the user has already cleared *some* author-defined role check.

  **Engine-internal normalization.** Pre-hook entries use the spec's singular `key?` field; Part 6's shipped per-entry write loop reads plural `keys` (`const keys = entry.keys ?? [null];` in [`handleSubmit.js:188`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — the canonical loop input shape per [Part 6 § Payload](../_completed/06-submit-action-writes/design.md#payload)). The merge function normalizes **both** pre-hook entries and Part 7 auto-unblock entries to the engine-internal `{ type, keys, status, fields, force }` shape before the collision pass:

  - Pre-hook entries: singular `key` → `keys: [<key>]`; omitted/null key → `keys: [null]`.
  - Auto-unblock entries from [`computeAutoUnblocks.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js) arrive **keyless** (`{ type, status: 'action-required' }`, no `key` / `keys` field); the merge function defaults `keys: undefined → [null]`, matching the write-loop default. Keyed-action fan-out behaviour for auto-unblock is a separate question tracked under [Part 31](../31-keyed-auto-unblock-fanout/design.md) and is out of scope here.

  Normalization lives in the merge function (not upstream in `computeAutoUnblocks`) so the new code owns the engine-internal shape and Part 7's producer stays untouched. The two `keys ?? [null]` defaults (merge function + write loop) are intentional and aligned.

  **Collision rule.** Collision is evaluated per `(type, single-key)` pair after both pre-hook and auto-unblock entries are expanded across their `keys` arrays. On `(type, key)` match with an auto-unblock entry, the pre-hook entry **replaces** the auto-unblock entry for that pair in the merged list — not a per-field overlay. Rationale: auto-unblocks are engine defaults; if the pre-hook returned an entry for the same `(type, key)`, the author signaled full control over that write, and silently mixing engine-default fields with author intent invites debugging traps ("why is `status` `action-required` when my hook said `done`?"). The merged `actions[]` feeds into Part 6's per-entry write loop — that loop owns the priority-rule + `currentActionId` self-exception + per-entry `force` logic and is the canonical superset of the entry shape above.

  **`currentActionId` collision.** The step-1 `currentActionId` entry is also subject to the same `keys: undefined → [null]` expansion before collision evaluation (the entry is built at [`handleSubmit.js:152–161`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) with `keys: params.current_key ? [params.current_key] : undefined`, so non-keyed actions land at `keys: undefined` and expand to `[(type, null)]`). It is also subject to the same replace rule: a pre-hook `actions[]` entry whose `(type, key)` matches the `currentActionId` entry **replaces** it in the merged list. The top-level pre-hook `status` field is sugar for the common case (just changing the target stage of the `currentActionId` entry); an explicit `actions[]` entry is the explicit form and lets the hook also attach `fields`, `force`, or omit `status` to make the entry form-data-only. If the replacement entry omits `status`, the engine grafts in the three-layer-resolved status (engine default → YAML `interactions[interaction].status` → pre-hook top-level `status`) so the entry's effective target stage matches what the top-level channel would have produced. This keeps the channels semantically aligned: the explicit `actions[]` entry never silently drops a resolved target status authors set via the top-level channel.
- **`event_overrides`** → four-layer merge implemented as a single function (last wins):
  1. Engine default from [part 8](../_completed/08-side-effect-dispatch/design.md)'s `buildDefaultLogEventPayload` (imported as the bottom layer; returns the unkeyed `{ type, display, references, metadata }` shape).
  2. Action YAML `event_overrides[interaction]` — baked into the endpoint config by [part 13](../13-resolver-apis/design.md).
  3. Runtime `comment` — handler injects into `metadata.comment` if present and non-empty (drop the key when falsy). Sits above YAML so a YAML-defined `event.{interaction}.metadata.comment` can't clobber the user-supplied comment; below pre-hook so a pre-hook can still rewrite it (e.g. PII scrubbing). Per [Part 13 § Comment mapping](../13-resolver-apis/design.md#comment-mapping).
  4. Pre-hook return `event_overrides` — unkeyed runtime bag, merges last.

  **Implementation note.** Part 9 ships the `buildDefaultLogEventPayload(comment)` extension as a prerequisite to the four-layer merge (see [Task 9 — Extend `buildDefaultLogEventPayload`](./tasks/09-extend-build-default-log-event-payload.md)). The extension folds layer 3 (runtime `comment`) into the bottom-layer function — `buildDefaultLogEventPayload` accepts `comment` and returns layers 1 + 3 already composed; `handleSubmit.js`'s `logEventInputBag` is extended in Task 7 to source `comment` from `params.comment`. Part 9's `mergeEventOverrides.js` (Task 3) applies layer 2 (YAML) and layer 4 (pre-hook) on top. Do not re-inject `comment` as a separate layer-3 step in the merge function — that would double-inject. This supersedes [Part 13 § Pending handler work step 2](../13-resolver-apis/design.md#pending-handler-work-part-6-follow-up) (which framed the fold-in as a "part 6 follow-up" with no owner).
- **`form_overrides`** → additive `$set` paths applied alongside the form-data write in step 6. The merge is at the **field-path** level (matching Part 6's per-field `$set` writes), not a document-level replace: a pre-hook `form_overrides: { a: 1 }` plus a user `form: { b: 2 }` results in `$set` ops for both `a` and `b`. Pre-hook overrides win on collision.

There is no `hook_error` field. A pre-hook that wants to mark the action errored pushes `actions: [{ ..., status: 'error' }]` through the normal merge (no `force` needed — `error.priority = 1` is below every non-terminal stage, so the priority rule allows the write). A pre-hook that wants to abort the lifecycle uses one of the abort modes below. Rationale: [Part 29 § D2](../29-error-model-cleanup/design.md#d2-why-pre-hooks-no-longer-get-a-hook_error-field).

### Pre-hook abort modes — `throw` vs `:reject`

A pre-hook aborts the lifecycle in one of two ways. The choice belongs to the hook author; both modes propagate as throws through the engine — `invokePreHook.js`, `handleSubmit.js`'s step-2 wiring, and the plugin handler catch nothing. Discrimination happens at the wrapping per-action endpoint's `runRoutine`, which reads `error.isReject` and classifies as `'reject'` or `'error'` (per the upstream `runRoutine.js` tweak — see [Part 29 § D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently) and [§ Upstream dependency](../29-error-model-cleanup/design.md#upstream-dependency)). Same one-rule propagate-everywhere failure posture as the rest of the 11-step lifecycle ([Part 29 § D6](../29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws)).

**Mid-write catch — known inconsistency window.** The shipped handler currently wraps steps 4–6 in a `try { … } catch { … }` block that synthesises an `error_transition` and returns a partial response ([`handleSubmit.js:185–333`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)). Removing that catch is owned by [Part 29 Task 5 — Remove `handleSubmit` catch-converter](../29-error-model-cleanup/tasks/05-handlesubmit-remove-catch-converter.md), not by Part 9. Part 9 ships **with the catch in place**. Until Part 29 Task 5 lands, the handler has two failure postures simultaneously:

- **Pre-hook throws (step 2)** propagate transparently — Part 9's new wiring matches the propagate-everywhere posture.
- **Step 4–6 throws** still hit the existing catch, force-write an `error` transition on the user-submitted action, and return a partial `{ ..., error_transition }` shape.

This is a known, documented, time-bounded inconsistency window — not a contract gap. Part 9 chose not to hard-block on Part 29 Task 5 because (i) the catch is unchanged from its pre-Part-9 behaviour (so no regression for existing callers), (ii) the propagate-everywhere posture for *pre-hook* throws is correct and independently useful, and (iii) Part 29 owns the cleanup as a single coherent change. The `error_transition` field on the success-return shape's JSDoc stays until Part 29 Task 5 removes it.

- **`throw`** — for infrastructure failures the user can't fix (upstream timeout, downstream service unreachable). The `UserError` has `isReject: false` (default); the wrapping endpoint classifies as `'error'`; the calling app's `CallApi` surfaces a transient error. The user sees a generic retry-prompting error toast; the same submission can be retried.
- **`:reject`** — for user-facing validation failures the user *can* fix (e.g. "Company name already exists in CRM" from an upstream validator). The hook's routine fires Lowdefy's `:reject` control, which throws a `UserError` with `isReject: true`. The throw propagates transparently across every routine boundary; the wrapping endpoint classifies as `'reject'`; the calling app's `CallApi` sees a reject with the author's message. Page templates render it through the platform's standard reject-surface convention — no workflows-specific UI mechanism.

**No writes happen on either abort mode.** The throw fires from inside step 2 of the lifecycle (pre-hook invocation), so it propagates before step 4 (action writes) ever runs.

**There is no `{ rejected, reject_message }` return surface on the handler.** The handler has no failure-return shape at all — failures throw. The success-return shape is just `{ action_ids, completed_groups, event_id, tracker_fired, pre_hook_response, post_hook_response }` ([Part 29 § change 5](../29-error-model-cleanup/design.md#proposed-change)).

**Idempotency under retry.** A pre-hook that performs side effects (calls an external API, writes to another collection) before aborting — whether via `throw` or `:reject` — must be idempotent. Both abort modes re-fire on retry: a `throw` surfaces a transient error toast the user can retry; a `:reject` surfaces a user-fixable validation message the user resubmits past. Either way the pre-hook re-runs from the top. Same contract as post-hooks (`invokePostHook.js` below) and the rest of the 11-step lifecycle under [Part 29 § D1](../29-error-model-cleanup/design.md#d1-why-throwing-is-safer-than-force-writing-error).

### `invokePostHook.js`

- After step 6 writes complete and side effects (parts 8, 10, 11) fire, reads the hook id from `context.params.hooks?.[interaction]?.post`. Same resolver-emission rules as the pre-hook (see `invokePreHook.js` above — the resolver only emits per-phase entries with a body). Fires after step 10 (tracker subscription) so a post-hook reading `result.tracker_fired` sees the final post-subscription state.
- **Skip on missing — no-op invocation.** Mirrors the pre-hook skip posture: if any of `params.hooks` / `params.hooks[interaction]` / `params.hooks[interaction].post` is undefined, return `null` without calling `callApi`. `post_hook_response: null` on the handler return; no side effects beyond steps 4–10 fire. Use optional chaining on every level.
- Payload includes everything from the pre-hook payload plus `result: { action_ids, completed_groups, event_id, tracker_fired? }` (post-write state).
- Return is free-form; surfaced as `post_hook_response` on the API return.
- **Throws propagate. No try/catch wrap.** A thrown post-hook surfaces to `CallApi` as a failed submit even though writes (steps 4–10) have landed. Authors must make post-hooks idempotent — standard contract for any retryable side effect. Authors who want a best-effort branch wrap that branch in `:try` inside their hook routine; that's the author's choice, not engine policy. There is no `post_hook_error` field on the response — success means "everything completed cleanly"; any failure throws. Rationale and trade-offs in [Part 29 § D6](../29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws). **Deliberate departure** from [submit-pipeline/spec.md § Post-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#post-hook-return)'s "logged but not propagated" posture: silent swallow makes failures in critical downstream side effects (contracts for signature, external sync) invisible to clients.

### `action.interactions:` YAML override

Authors can override the default target status per interaction in YAML (part 4 already accepts the field). This part wires the override layer into the resolver chain above.

### `force: true` propagation

[Part 6](../_completed/06-submit-action-writes/design.md) plumbed per-entry `force` on `actions[]` entries (the only force surface — see [part 6 § Priority rule](../_completed/06-submit-action-writes/design.md#priority-rule)). This part makes pre-hook returns the v1 user of per-entry `force` (for replay/rollback) — each entry the pre-hook returns may set its own `force: true`.

### Hook auth — by construction in part 13

The resolver synthesizes each emitted hook Api's `auth.roles` directly from `action.access.roles` (never `auth.public: true`), so the `hook.auth.roles ⊇ action.access.roles` invariant holds by construction. See [Part 13 § Auth by construction](../_completed/13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate). No separate validation pass and nothing for this part to assume.

## Out of scope / deferred

- **Hook payload `context.shallow` flag** for large workflow docs — flagged as a concept open question; defer.

## Depends on

[Part 1](../_completed/01-call-api-primitive/design.md), [part 6](../_completed/06-submit-action-writes/design.md), [part 7](../_completed/07-group-state-machine/design.md), [part 8](../_completed/08-side-effect-dispatch/design.md). Upstream: the [`@lowdefy/errors` `UserError.isReject` flag, `controlReject.js`, and `runRoutine.js` tweak](../29-error-model-cleanup/design.md#upstream-dependency) must land before end-to-end `:reject` propagation works. Part 9's unit-test surface for the `:reject` path (handler rethrows; no writes) can be exercised without the upstream tweak; integration-layer reject classification depends on it. Rationale for the no-`hook_error` / no-`post_hook_error` / propagate-everywhere shape lives in [Part 29](../29-error-model-cleanup/design.md) — this part incorporates those decisions directly.

**Not blocked on, but landing in parallel:** [Part 29 Task 5 — Remove `handleSubmit` catch-converter](../29-error-model-cleanup/tasks/05-handlesubmit-remove-catch-converter.md) removes the existing mid-write `try`/catch and drops `error_transition` from the success-return shape. Part 9 ships with the catch in place — see § Mid-write catch — known inconsistency window. The two parts land independently; downstream consumers that read `error_transition` should plan for it to disappear when Part 29 Task 5 ships.

## Verification

- Unit tests on each merge function:
  - Status: engine default < YAML override < pre-hook override.
  - Event: four layers (engine → YAML → comment → pre-hook), importing `buildDefaultLogEventPayload` from part 8 as the bottom layer. Include a test asserting `metadata.comment` survives a YAML override of other `metadata.*` fields (the regression Part 13's layer-3 placement guards against), and a test asserting a pre-hook `event_overrides.metadata.comment` still overrides the runtime comment.
  - Actions: pre-hook entry wins on (type, key) collision (auto-unblock and `currentActionId` both replaced); per-entry `force` honored. `currentActionId` replacement entry without `status` gets the three-layer-resolved status grafted in.
  - Form overrides: pre-hook `form_overrides: { a: 1 }` + user `form: { b: 2 }` produces `$set` ops at both `a` and `b` (field-path merge, not document replace).
- Pre-hook entries without `force` are subject to the priority rule; unreachable transitions (e.g. `done → action-required`) are silently dropped per Part 6's per-entry semantics ([Part 6 § Priority rule](../_completed/06-submit-action-writes/design.md#priority-rule)). Surface dropped entries in test output for assertion.
- Pre-hook `:reject` (mock `context.callApi` to throw a `UserError` with `isReject: true`): handler **rethrows** (no internal catch); no writes performed; no side effects fire. End-to-end reject classification (the `UserError` reaching the wrapping endpoint's `runRoutine` and being labelled `'reject'`) is exercised at the integration layer once the upstream `runRoutine.js` tweak lands, not in this unit.
- Pre-hook throw (non-`isReject` error): error propagates to caller; no writes performed; the action's status array is unchanged from pre-submit. Idempotent retry of the same submission converges to success.
- Pre-hook returning `actions: [{ ..., status: 'error' }]` writes the error transition via the normal priority path (no `force` needed — `error(1)` is below every non-terminal stage); log event and notifications fire normally, user sees normal completion.
- Pre-hook return surfaces on the API response as `pre_hook_response` (raw return, pre-merge). `null` when no pre-hook is declared.
- Post-hook return surfaces on the API response as `post_hook_response`.
- Post-hook throw: error propagates to caller; writes from steps 4–10 stay (deliberately non-atomic). No `post_hook_error` field on the response (the field does not exist).
- **Mid-write throw (steps 4–6) while Part 29 Task 5 is unlanded:** the existing catch still fires — `error` transition is force-written on the user-submitted action; response returns `{ ..., error_transition }`. Behaviour unchanged from pre-Part-9. Part 9's tests for the *new* failure path (step-2 pre-hook throws) explicitly mock at step 2, not mid-write, so they don't depend on Part 29 Task 5 having landed. Once Part 29 Task 5 ships, the post-removal behaviour ("mid-write throw propagates; no `error_transition`; partial writes stay") is verified in Part 29 Task 6.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

_(None.)_

## Contract to neighbours

- **Part 11** uses the same pattern this part establishes for `context.callApi` invocation with auth context.
- **Part 13** emits hook Apis with `auth.roles` synthesized from `action.access.roles` ([§ Auth by construction](../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)) and bakes the derived hook ids into the endpoint config this part reads. **No trailing `:if` / `:reject` control step** on per-action endpoints — a pre-hook `:reject` propagates transparently as a `UserError(isReject: true)` throw and is classified at the wrapping endpoint's `runRoutine` (see [Part 29 § D5](../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently)).
