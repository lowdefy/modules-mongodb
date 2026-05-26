# Implementation Tasks — Part 09: Hook invocation (pre/post + `force` + status resolution layers)

## Overview

Light up step 2 (pre-hook, pre-write) and step 11 (post-hook, after all side effects) of the 11-step lifecycle skeleton committed by [part 6](../../_completed/06-submit-action-writes/design.md). Add the three-layer status resolver (engine default → action YAML `interactions:` → pre-hook return `status`), the per-channel pre-hook return merges (actions[] with auto-unblock + `currentActionId` collision rules, four-layer event overrides, field-path form overrides), the two abort modes (`throw` for crashes, `:reject` for user-facing rejections — both propagate transparently), and post-hook invocation that includes post-write `result` state on the payload. Surfaces `pre_hook_response` and `post_hook_response` (raw returns, pre-merge) on the handler API return. Derived from `designs/workflows-module/parts/09-hook-invocation/design.md`.

## Tasks

| #   | File                                                | Summary                                                                                                                                                                                                                                                | Depends On |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | `01-resolve-target-status.md`                       | Extract `resolveTargetStatus` from `handleSubmit.js` into a standalone util that applies the three-layer precedence (engine default < YAML `interactions[interaction].status` < pre-hook return `status`).                                              | —          |
| 2   | `02-merge-pre-hook-actions.md`                      | `mergePreHookActions.js` — pure function: normalize singular `key` → plural `keys`; expand both pre-hook and auto-unblock entries across `keys`; pre-hook entry replaces on `(type, key)` collision (incl. `currentActionId` entry); graft resolved status on `currentActionId` replacement when `status` omitted. | —          |
| 3   | `03-merge-event-overrides.md`                       | `mergeEventOverrides.js` — pure function: composes the four-layer merge (engine default + comment from `buildDefaultLogEventPayload`, YAML override, pre-hook return). Layer 3 is already folded into layer 1 by task 9.                              | 9          |
| 4   | `04-merge-form-overrides.md`                        | `mergeFormOverrides.js` — pure function: field-path level merge of user `form` + `form_review` + pre-hook `form_overrides`. Pre-hook wins on field collision.                                                                                          | —          |
| 5   | `05-invoke-pre-hook.md`                             | `invokePreHook.js` — resolves `params.hooks[interaction].pre`, builds payload (workflow_id, workflow_type, action_id, action_type, current_key, interaction, form, form_review, fields, current_status, comment, user, context); invokes via `context.callApi({ id, module: 'workflows' }, payload, { user })`. **No try/catch.** Returns raw pre-hook response (or `null` when no pre-hook declared). | —          |
| 6   | `06-invoke-post-hook.md`                            | `invokePostHook.js` — resolves `params.hooks[interaction].post`; payload = pre-hook payload + `result: { action_ids, completed_groups, event_id, tracker_fired? }`; invokes via `context.callApi(...)`. **No try/catch.** Returns raw post-hook response (or `null`). | —          |
| 7   | `07-wire-step-2-pre-hook.md`                        | Wire step 2 into `handleSubmit.js`: invoke pre-hook before step 3; apply status / actions / event-overrides / form-overrides merges; extend `logEventInputBag` with `comment: params.comment ?? null`; surface `pre_hook_response` on the return. Throws propagate transparently. | 1, 2, 3, 4, 5, 9 |
| 8   | `08-wire-step-11-post-hook.md`                      | Wire step 11 into `handleSubmit.js`: invoke post-hook after step 10 (tracker subscription); surface `post_hook_response` on the return. Throws propagate transparently.                                                                                | 6, 7       |
| 9   | `09-extend-build-default-log-event-payload.md`      | Extend `buildDefaultLogEventPayload` to accept `comment` and inject into `metadata.comment` when non-empty (layer-1+3 fold-in). Update `dispatchLogEvent` to pass `context.params.comment ?? null` through. Supersedes Part 13 § Pending handler work. | —          |

## Ordering Rationale

**Layer-1+3 fold-in first (9).** Task 9 extends `buildDefaultLogEventPayload` to accept `comment` (the runtime layer-3 channel folded into the bottom layer). It blocks Task 3 (the four-layer merge function reads the already-composed layer 1+3 from this function) and Task 7 (the handler wiring threads `params.comment` through the input bag). It can ship as its own PR ahead of everything else — `dispatchLogEvent` keeps working without callers passing `comment` (defaults to `null`).

**Pure utils in parallel (1, 2, 4).** Each merge function is small, pure, fully unit-testable in isolation, and has no interdependencies on its peers. Task 3 has a single prerequisite (task 9) — it can ship as soon as task 9 lands. All four pure utils land before step 2 wiring (task 7) can compose them.

**Hook invokers in parallel (5, 6).** `invokePreHook.js` and `invokePostHook.js` are independent — neither imports the other. Both are thin wrappers around `context.callApi` with payload construction; both share the no-try/catch posture. They can ship in parallel and before either is wired into the handler.

**Step 2 wiring (7).** Lands the pre-hook into `handleSubmit.js` step 2 (currently a TODO stub at [`handleSubmit.js:165`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)). Touches the `resolveTargetStatus` call site (task 1), the auto-unblock merge site at [`handleSubmit.js:179`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (task 2), the `dispatchLogEvent` payload assembly (tasks 3 + 9), and the `formMerged` merge at [`handleSubmit.js:274`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (task 4). Extends `logEventInputBag` with `comment: params.comment ?? null`. Replaces `pre_hook_response: null` on the success return with the captured raw return.

**Step 11 wiring last (8).** Post-hook only fires after tracker subscription completes ([`handleSubmit.js:355–362`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)), so it sequences after task 7 (which has already started touching the success-return shape). Replaces `post_hook_response: null` with the captured raw return.

**Parallelism map:**

- Task 9 ships first (or in parallel with 1, 2, 4 — task 3 blocks on it).
- Tasks 1, 2, 4 in parallel (foundational pure utils — no interdependencies).
- Task 3 needs 9.
- Tasks 5, 6 in parallel (invokers — no interdependencies on each other).
- Task 7 needs 1, 2, 3, 4, 5, 9.
- Task 8 needs 6, 7.

### Verification posture

Part 09 ships **unit tests per task** per the top-level § Testing conventions. Coverage floor:

- **Pure-function tasks** (1, 2, 3, 4) — table-driven `*.test.js` colocated next to source. No Mongo.
- **Hook invokers** (5, 6) — `*.test.js` colocated next to source. Use a `callApi` jest mock; assert payload shape, `{ id, module: 'workflows' }` dispatch form, `user` option pass-through, and that the function does **not** catch a thrown `UserError(isReject: true)` nor a generic throw.
- **Handler wiring tasks** (7, 8) — extend `handleSubmit.test.js` with cases covering:
  - Three-layer status resolution (engine default < YAML < pre-hook return).
  - Four-layer event merge (engine + comment, YAML, pre-hook) — including `metadata.comment` survives a YAML override of other `metadata.*` fields, and pre-hook `event_overrides.metadata.comment` overrides the runtime comment.
  - Actions[] (type, key) collision: pre-hook replaces auto-unblock; pre-hook replaces `currentActionId` entry; replacement without `status` gets the resolved status grafted in.
  - Form overrides field-path merge: `{ a: 1 }` (pre-hook) + `{ b: 2 }` (user) writes `$set` ops at both `a` and `b`.
  - Pre-hook entries without `force` honour the priority rule; unreachable transitions (e.g. `done → action-required`) are silently dropped per Part 6's per-entry semantics.
  - Pre-hook `:reject` (mock `context.callApi` to throw a `UserError` with `isReject: true`): handler rethrows; no writes performed; no side effects fire.
  - Pre-hook generic throw: error propagates; no writes performed; action status unchanged from pre-submit; retry converges.
  - Pre-hook returning `actions: [{ ..., status: 'error' }]`: writes the error transition via the priority path (no `force` needed); log event + notifications fire normally.
  - `pre_hook_response` raw return surfaces on the API response; `null` when no pre-hook declared.
  - `post_hook_response` raw return surfaces; post-hook throw propagates (writes from steps 4–10 stay).
- **End-to-end coverage** lands in [part 22 — workflows-e2e-suite](../../22-workflows-e2e-suite/design.md). The integration-layer reject-classification path (`isReject` reaches `runRoutine` and is labelled `'reject'`) depends on the upstream `runRoutine.js` tweak (see [Part 29 § Upstream dependency](../../29-error-model-cleanup/design.md#upstream-dependency)) and is verified there, not here.

### What's not in scope (deferred per design)

- **Hook payload `context.shallow` flag** for large workflow docs — flagged as a concept open question; defer.
- **Upstream `@lowdefy/errors` `UserError.isReject` flag, `controlReject.js` change, `runRoutine.js` tweak** — tracked in [Part 29 § Upstream dependency](../../29-error-model-cleanup/design.md#upstream-dependency). Part 9's unit-test surface for the `:reject` path can be exercised without the upstream tweak; integration-layer reject classification depends on it.
- **Build-time hook auth validation** — by construction in Part 13. No validation pass to author here.
- **Hook emission (resolver)** — shipped in [Part 13](../../13-resolver-apis/design.md). Part 9 reads the baked-in `params.hooks` / `params.event_overrides` / `params.interactions` maps.

## Scope

**Source:** `designs/workflows-module/parts/09-hook-invocation/design.md`

**Context files considered:**

- `designs/workflows-module-concept/submit-pipeline/spec.md` — pre-hook payload contract, pre-hook return shape, three-layer status resolution, post-hook payload + return.
- `designs/workflows-module/design.md` — top-level § Testing conventions.
- `designs/workflows-module/parts/_completed/01-call-api-primitive/design.md` — `context.callApi({ id, module }, payload, { user, timeout? })` contract; default 10s timeout.
- `designs/workflows-module/parts/_completed/06-submit-action-writes/design.md` — per-entry `actions[]` loop, priority rule + `currentActionId` self-exception + per-entry `force`, engine-default `interaction → target-status` mapping, form-data `$set` shape, mid-write error transition.
- `designs/workflows-module/parts/_completed/07-group-state-machine/design.md` — auto-unblock entry shape (plural `keys`).
- `designs/workflows-module/parts/_completed/08-side-effect-dispatch/design.md` — `buildDefaultLogEventPayload` import seam; runtime `comment` already folded into layer 1.
- `designs/workflows-module/parts/13-resolver-apis/design.md` — what the resolver bakes into the endpoint payload (`hooks`, `event_overrides`, `interactions`) and the comment-mapping merge order.
- `designs/workflows-module/parts/29-error-model-cleanup/design.md` — D1 (idempotency under retry), D2 (no `hook_error`), D5 (`:reject` propagates transparently), D6 (propagate-everywhere posture); Upstream dependency on `@lowdefy/errors`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — current 11-step scaffold with step 2 + step 11 stubs and PART 9 EXTENSION comments at lines 176–179, 197–202, 278–280, 312.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — `buildDefaultLogEventPayload` (pure, named export) layer-1 source.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js` — auto-unblock entry producer (entries arrive in singular shape today; task 2 normalises both sides).
- `modules/workflows/resolvers/makeWorkflowApis.js` — confirms `params.hooks`, `params.event_overrides`, `params.interactions` are baked onto the routine step's `properties` and arrive on the handler `context.params` bag.

**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-3.md` (the design.md already incorporates all resolved findings).
