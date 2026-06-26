# Task 19: Emitted API payload surfaces

## Context

The emitted per-workflow API payloads must carry the new signal model instead of the old `force` flag, so the rebuilt Submit handler receives `signal`. This builds on task 6's id-naming edits to `makeWorkflowApis.js` (same file, different concern — payload mapping). It gates the demo rebuild (task 20 → [Part 45](../../45-demo-rebuild/design.md)) and the Submit handler's input contract.

## Task

**`modules/workflows/resolvers/makeWorkflowApis.js`:**

- The emitted-Api payload mapping passes the **complete** set: `action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, `metadata`, plus the conditional `hooks` / `event_overrides` maps. Load-bearing and easy to miss: `action_id` is how Submit locates its target (`loadWorkflowState` Submit mode is `{ actionId, signal }`); `current_key` feeds task 12's event `metadata` composition and the keyed form_data path (Q6 / `planFormDataMerge`); `fields` is the planner's doc-merge bag (`planActionTransition.js`) — for `kind: simple` it *is* the submission content. (`comment` stays on the wire for [Part 33](designs/workflows-module/parts/_completed/33-comment-rendering/design.md)'s `foldCommentIntoEvent` — its D5 wire contract; the rebuilt engine itself writes no `metadata.comment`, see task 12.)
- **Drops the baked `action_type` / `workflow_type` literals** — the rebuilt handler derives both from the action doc loaded via `action_id`; no rebuilt code or task reads the params (review-16 #2; "build for what exists").
- **Drops `interaction` and `current_status`** (superseded by `signal`; state-machine.md removes the simple-selector path) and **adds `metadata`** (currently absent from the mapping). The submit-side **consumer** is threaded here as landed-code catch-up (review-18 #9, the twin of review-16 #4's start thread): `planSubmit.js:60` hardcodes `metadata: undefined` on the user's current-action transition — read `params.metadata` instead; the planner's update-side merge already exists (`planActionTransition.js:174`), so without the one-line thread a submitted `metadata` silently falls on the floor. `force` needs no removal — it never appeared in this mapping (the force *model* died with D4); the existing no-force assertion (`makeWorkflowApis.test.js` "no force slot") just stays green.
- **Re-key the hook/event emission loops by signal name.** `HOOK_INTERACTIONS` (`[submit_edit, not_required, resolve_error, approve, request_changes]`) becomes the signal list `[submit, progress, not_required, resolve_error, approve, request_changes]` — extracted as a shared `HOOK_SIGNALS` constant (see the `hookSignals.js` block below). The constant feeds both `emitHooks` and `emitEventOverrides`, so authored `hooks:` **and** `event:` blocks become signal-keyed — without this, the signal-keyed demo config (Part 45) never reaches the emitter (build-rejected by `makeWorkflowsConfig`, below) and no hook Api is emitted. Emitted hook Api ids follow the key (`{workflow_type}-{action_type}-{signal}-{pre|post}`, e.g. `…-submit-pre` not `…-submit_edit-pre`). Preserve task 22's `_module.endpointId` wrapping on the emitted `hooks` map values (`slot[phase] = { '_module.endpointId': api.id }`) — the engine receives pre-scoped opaque endpoint ids and passes them to `callApi` verbatim (design § "The shipped `callApi` contract").
- (Emitted Api ids already unprefixed from task 6 — don't re-touch the id naming.)

**`modules/workflows/resolvers/hookSignals.js` (new) + `makeWorkflowsConfig.js`:**

- `makeWorkflowsConfig.js` carries a **second, un-re-keyed copy** of `HOOK_INTERACTIONS`, and its `validateHooks` **hard-errors** on any `hooks:` key outside it — left old-keyed, the build rejects the signal-keyed demo config (`hooks.submit` → `"not a known interaction"`) before the re-keyed emitter ever runs (review-16 #1).
- **One shared constant** ("One correct way"): extract `HOOK_SIGNALS` (and `HOOK_PHASES`) into `resolvers/hookSignals.js`, imported by both `makeWorkflowApis.js` and `makeWorkflowsConfig.js`. Resolvers load via native dynamic `import()` (verified in `lowdefy/packages/build/src/build/buildRefs/getUserJavascriptFunction.js`), so the relative import works. Caveat: the dev-rebuild cache-bust query applies only to the entry file — edits to the shared module need a build restart in dev; acceptable for a constant.
- **Extend the key check to `event:` blocks**: `event:` keys currently get no build validation at all — the same legacy-key/typo hazard (a mistyped key is silently dropped by the emitter loop). Validate `event:` keys against the same constant with the same hard-error shape as hooks keys.

- Add `metadata` to the payload (Part 30 carry-over). Its consumer is task 17's StartWorkflow: `params.metadata` threads into each seed-mode `planActionTransition` call's `payload.metadata`, merging onto every seeded draft (review-16 #4).
- The `actions:` override keeps the `{ type, key?, status }` grammar — Start seeds drafts directly at the declared status (Part 45 review 1 #2; task 17); `key` is what makes the keyed-action carve-out real (config `starting_actions` can't carry a per-instance key, so StartWorkflow's guard directs keyed seeds here). No signal grammar at start. Carry a YAML comment in the file stating the current contract (no design/task references): the `actions:` override seeds actions directly at a declared status (`{ type, key?, status }`; legal seeds `action-required` | `blocked`, enforced at runtime; `key` for keyed action types); per-entry `fields`/`references` are not part of the contract (decided, not an oversight — the payload-level `metadata` bag merges onto every seeded draft, and payload-level `references` lands on the workflow doc); signals are the submit-time grammar only and do not apply at workflow start.
- Extend the `:return` mapping with **`event_id`** — Start now mints a real `workflow-started` event (task 17), and every handler surfaces its invocation's `event_id` uniformly (review-13 #6).

**Hook payload (`buildHookPayload.js`):** owned by task 14 — the envelope is unchanged except `interaction` → `signal` and `current_status` removed. This task's concern is the wire side: the emitted-Api payload no longer carries `interaction`/`current_status`, so confirm the task-14 envelope and this task's payload mapping agree.

## Acceptance Criteria

- Emitted Api payloads pass exactly `action_id`/`signal`/`current_key`/`fields`/`form`/`form_review`/`comment`/`metadata` (+ conditional `hooks`/`event_overrides`) and no longer pass `interaction`, `current_status`, or the baked `action_type`/`workflow_type` literals; `force` stays absent (never present in this mapping — existing assertion).
- The `hooks:` and `event:` emission loops are signal-keyed (`submit`/`progress` included; no `submit_edit`); emitted hook Api ids carry the signal name.
- Both resolvers read the key list from the shared `hookSignals.js` constant. `makeWorkflowsConfig` accepts signal-keyed `hooks:` and `event:` blocks; an unknown or legacy key in either (`hooks.submit_edit`, `event.surprise`) hard-errors at build.
- `start-workflow.yaml` payload includes `metadata`; the file carries the seed-grammar comment (`actions:` keeps `{ type, key?, status }`; per-entry `fields`/`references` dropped; signals don't apply at start); `:return` carries `event_id`.
- `makeWorkflowApis.test.js` asserts the payload mapping (the complete field set present; `force`/`interaction`/`current_status`/`action_type`/`workflow_type` absent) and the signal-keyed hook emission (a `hooks.submit` block emits `…-submit-pre`; a legacy-keyed `hooks.submit_edit` block is not emitted), in addition to the id-naming assertions from task 6.
- `makeWorkflowsConfig.test.js` hook-key cases are re-keyed to signals (`submit_edit` fixtures become `submit`; the unknown-key case still errors), plus new `event:`-key validation cases.
- `planSubmit` threads `params.metadata` into the current-action transition's `payload.metadata`; `planSubmit.test.js` asserts the submitted metadata lands on the planned action doc (consumption, not mere passage).

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (payload mapping)
- `modules/workflows/resolvers/hookSignals.js` — create (shared `HOOK_SIGNALS` / `HOOK_PHASES` constants)
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify (re-key `validateHooks` via shared constant; extend key check to `event:` blocks)
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify (signal-keyed hook cases; `event:`-key cases)
- `modules/workflows/api/start-workflow.yaml` — modify (add `metadata`; seed-grammar comment; `:return` `event_id`)
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify (payload assertions)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js` — modify (one-line thread: `params.metadata` replaces the hardcoded `undefined` at line 60)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js` — modify (metadata-consumption case)

## Notes

- Sequential dependency on task 6 (same file). If both haven't landed, do the id-naming first (task 6) then layer the payload mapping here.
- The demo rebuild (task 20 → Part 45) authors `workflow_config` directly in the signal grammar — this task is the resolver-side counterpart that makes the emitted endpoints accept the new shape.
- Consumer-facing docs (`modules/workflows/README.md` API Endpoints section — signal-keyed hook endpoint ids, `start-workflow` row's seed grammar + `metadata`) are deferred to the docs pass, task 24 — same convention as tasks 4 and 14.
