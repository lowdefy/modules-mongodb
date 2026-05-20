# Part 09 — Hook invocation (pre/post + `force` + status resolution layers)

**Source rationale:** [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** engine handlers. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/`.

## Goal

Turn `SubmitWorkflowAction` into the full per-interaction lifecycle: invoke the author's pre-hook before writes, merge its return values into the engine's plan (status, actions[], event_overrides, form_overrides, hook_error), invoke the post-hook after writes, and implement the three-layer status resolution (engine default → action YAML `interactions:` → pre-hook `status`).

## In scope

### `invokePreHook.js`

- Resolves `hooks[interaction].pre` from the endpoint config (baked in by [part 13](../13-resolver-apis/design.md)).
- Invokes via `context.callApi({ id: <hook-api-id>, module: <auto-from-resolver-config> }, payload, { user })`.
- Payload shape:
  - `workflow_id`, `workflow_type`, `action_id`, `action_type`, `current_key`, `interaction`.
  - `form`, `form_review`, `fields`, `current_status`.
  - `user: { id, profile, roles }`.
  - `context: { workflow: <doc>, action: <doc> }`.
- Captures the return object; passes it through to merge logic below.

### Pre-hook return merge

All optional fields:

- **`status`** → overrides the engine default target status. Three-layer precedence:
  1. Engine default per interaction (from [part 6](../06-submit-action-writes/design.md)).
  2. Action YAML `interactions[interaction].status` (read from the endpoint config; part 13 bakes it in).
  3. Pre-hook return `status` (last wins).
  - Priority rule still applied to the resolved value.
- **`actions[]`** → merged with engine-computed auto-unblocks from [part 7](../07-group-state-machine/design.md). Pre-hook entries take precedence on `(type, key)` collision. Each entry may carry `force: true` to bypass the priority rule on its own write. `upsert: true` spawns instanced actions per [part 4](../04-workflow-config-schema/design.md) schema.
- **`event_overrides`** → merged over `action.event[interaction]` (YAML), which merges over the engine default from [part 8](../08-side-effect-dispatch/design.md)'s `buildDefaultLogEventPayload` (imported as the bottom layer; returns the unkeyed `{ type, display, references, metadata }` shape). Three-layer merge implemented as a single function.
- **`form_overrides`** → additive `$set` paths applied alongside the form-data write in step 6. Pre-hook overrides win on collision. Skipped on `hook_error`.
- **`hook_error`** → aborts the lifecycle. Engine writes `{ stage: error, reason: 'pre-hook', error_message: <message>, error_metadata? }` to the action's status (`force: true` so it bypasses priority). No further side effects. Returns `{ pre_hook_response: <pre-hook return>, ... rest null }`.

### `invokePostHook.js`

- After step 6 writes complete and side effects (parts 8, 11) fire, invokes `hooks[interaction].post` if declared.
- Payload includes everything from the pre-hook payload plus `result: { action_ids, completed_groups, event_id, tracker_fired? }` (post-write state).
- Return is free-form; surfaced as `post_hook_response` on the API return.
- Cannot abort (writes already landed). Failures are logged but do not propagate. Optionally surface as `post_hook_error` on the response.

### `action.interactions:` YAML override

Authors can override the default target status per interaction in YAML (part 4 already accepts the field). This part wires the override layer into the resolver chain above.

### `force: true` propagation

[Part 6](../06-submit-action-writes/design.md) plumbed per-entry `force` on `actions[]` entries (the only force surface — see [part 6 § Priority rule](../06-submit-action-writes/design.md#priority-rule)). This part makes pre-hook returns the v1 user of per-entry `force` (for replay/rollback) — each entry the pre-hook returns may set its own `force: true`.

### Build-time hook auth gate (handed off to part 13)

The auth gate (`hook.auth.roles ⊇ action.access.roles`, reject `auth.public: true`) is a build-time check in [part 13](../13-resolver-apis/design.md). This part assumes that validation; runtime enforcement happens because hooks won't have privileged access to bypass `access.roles` anyway. Document the contract here so the resolver's failure message points at this part for what runtime guarantees.

## Out of scope / deferred

- **`hook.auth.roles` validation** → [part 13](../13-resolver-apis/design.md).
- **Hook payload `context.shallow` flag** for large workflow docs — flagged as a concept open question; defer.

## Depends on

[Part 1](../01-call-api-primitive/design.md), [part 6](../06-submit-action-writes/design.md), [part 7](../07-group-state-machine/design.md), [part 8](../08-side-effect-dispatch/design.md).

## Verification

- Unit tests on each merge function:
  - Status: engine default < YAML override < pre-hook override.
  - Event: same three layers (import `buildDefaultLogEventPayload` from part 8 as the bottom layer).
  - Actions: pre-hook entry wins on (type, key) collision; per-entry `force` honored.
- `hook_error` writes the error transition, skips further side effects, returns the hook return.
- Post-hook return surfaces on the API response as `post_hook_response`.
- Post-hook failure does not propagate.
- Integration: the worked-example `qualify-pre-submit` and `send-quote-post-approve` fixtures exercise the full chain.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Default timeout for hook invocations** — inherit `context.callApi`'s default (10s) vs. tighter. Inherit; revisit if real apps need different.
- **Post-hook error surface** — silent swallow vs. `post_hook_error` on response. Lean surface (visible to callers but non-fatal).

## Contract to neighbours

- **Part 11** uses the same pattern this part establishes for `context.callApi` invocation with auth context.
- **Part 13** validates `hook.auth.roles ⊇ action.access.roles` at build time and bakes the hook map into the endpoint config this part reads.
