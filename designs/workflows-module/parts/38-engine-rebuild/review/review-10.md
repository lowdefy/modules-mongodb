# Review 10 — Task 14: Hook phase wrappers

Scope: `tasks/14-hook-phase-wrappers.md`, verified against the current hook code
(`SubmitWorkflowAction/invokePreHook.js`, `invokePostHook.js`,
`utils/buildHookPayload.js`, `handleSubmit.js`, `mergePreHookActions.js`,
`resolvers/makeWorkflowApis.js`), design.md D2/D5/D6/D13, state-machine.md
"How signals get emitted", tasks 9/10/15/19/20, and the reference project's
pre-hook returns (`apps/shared/workflow_config`). Prior coverage checked:
consistency-8 #1 (`upsert?` in task 14 — resolved), review-7 #4 (error model /
UserError reservation), review-4 #1 (upsert spawn preserved), review-3 #9
(access-before-pre-hook). None of the findings below repeat those.

## Payload contract correctness

### 1. "`buildHookPayload.js` is unchanged" is false — it reads two params the rebuild removes, and the hook-resolution key breaks

> **Resolved.** `interaction` renamed to `signal` everywhere (user decision — completes the D12 one-concept-one-name rename; greenfield, no compat shim): the hook payload field becomes `signal` (populated from `params.signal`), `current_status` is dropped, and hook resolution reads `params.hooks?.[params.signal]`. Task 14 + design.md "API + payload surfaces" reword the "unchanged" claim to "envelope unchanged except `interaction`→`signal` and `current_status` removed", with envelope-shape tests. The resolver re-key is added to task 19's scope: `HOOK_INTERACTIONS` becomes the signal list (`submit`/`progress` added, `submit_edit` gone), feeding both `emitHooks` and `emitEventOverrides`, with emitted hook Api ids following; AC asserts a `hooks.submit` block emits and a legacy `hooks.submit_edit` block doesn't. Task 20 additionally migrates demo hook routine bodies (`_payload: interaction` → `_payload: signal`).

Task 14's Context and AC (and task 19's "confirm it still builds the same
payload") assert `buildHookPayload.js` is unchanged. It can't be:

- `invokePreHook.js:21` resolves the hook id via
  `params.hooks?.[params.interaction]?.pre`. The rebuilt payload carries
  `signal`, not `interaction` (task 19; design.md "Modified — API + payload
  surfaces"). Unadapted, `hooks[undefined]` resolves nothing and **every
  pre-hook silently stops firing** — the no-hook default masks it, so no test
  fails until the demo e2e.
- `buildHookPayload.js:33` sets `interaction: params.interaction` and
  `buildHookPayload.js:37-40` passes through `params.current_status`. Both
  source fields are removed: state-machine.md supersedes the
  `submit_edit` + `current_status` selector path (its "Supersedes" list), and
  task 19's emitted payload list has neither. The "unchanged" payload would
  carry `interaction: undefined, current_status: null`.

The *intent* ("the payload contract authors code against doesn't change
gratuitously") is right; the literal file can't survive the field rename. Fix:

- Task 14 specs the wrapper's resolution key as `params.hooks?.[params.signal]`.
- Decide the author-facing payload field: rename `interaction` → `signal`, or
  keep the key `interaction` populated from `params.signal` (D12 already treats
  "interaction" as the signal's user-facing name). Pick one and state it —
  hook routines are author code reading `_payload:` paths.
- Drop `current_status` from the payload (its source is gone).
- Reword task 14/19's AC from "`buildHookPayload.js` is unchanged" to "the
  payload envelope is unchanged except `interaction`→`signal` and
  `current_status` removed" (or equivalent).

Related resolver gap: `makeWorkflowApis.js:1-7` (`HOOK_INTERACTIONS = [submit_edit,
not_required, resolve_error, approve, request_changes]`) emits the `hooks` map
keyed by **old interaction names** and is missing `submit`/`progress`. Task 20
re-keys the demo (`hooks.submit_edit` → `hooks.submit`) and asserts "hooks:
blocks are signal-keyed", but no task re-keys the resolver's emission — task 19
touches `makeWorkflowApis.js` for payload mapping only. Without that edit a
signal-keyed `hooks:` block is silently skipped by the emitter loop. Add the
re-key (and `progress`) to task 19's scope.

### 2. Post-hook payload is unspecified — and three sources disagree on it; "fresh state via the Plan" is unimplementable with a moved-verbatim `buildHookPayload`

> **Resolved.** As proposed: the author-facing post-hook payload keeps the `buildHookPayload` envelope (with finding-1's field fixes), but `context` is populated from the **planned** docs (`{ workflow: plan.workflow.doc, action: <planned target-action doc> }`) — the concrete mechanism behind D6's fresh-state promise — and `result` is pinned to today's bag `{ action_ids, completed_groups, event_id, tracker_fired }` (`completed_groups` from the planned group recompute; `tracker_fired` the cascade's per-level `[{ parent_action_id, parent_workflow_id, new_status }]`). `dispatchErrors` is deliberately not exposed (the handler's `post_commit_dispatch_failed` throw is the surfacing mechanism). Task 14's input gains the cascade fire list; its AC asserts plan-visible freshness and the exact `result` shape; design.md's data-flow lines and D6 now match.

Task 14 specs only the *function input* (`LoadedState` + committed `Plan` +
`CommitResult`) and promises "Authors see fresh state via the Plan — no
re-read." But what goes over `callApi` to the hook routine — the thing authors
actually receive — is pinned nowhere, and the three existing descriptions
conflict:

- `buildHookPayload.js:47` builds `context: { workflow, action }` from the
  **loaded (pre-commit) docs**. A moved-verbatim wrapper hands post-hook
  authors stale state — exactly the staleness class this rebuild exists to
  kill (today's `context.action` is never refreshed after step-4 writes;
  `handleSubmit.js` mirrors into `workflowActions` docs, not `context.action`).
- design.md data flow (line 513) says
  `callApi(post-hook) with { loadedState, plan, commitResult, trackerFires }` —
  a completely different envelope, and one that leaks engine-internal types
  (the whole Plan incl. changeLog deltas) into the author contract.
- Today's `result` bag is `{ action_ids, completed_groups, event_id,
  tracker_fired }` (`handleSubmit.js:353-358`); the data flow's `CommitResult`
  is `{ action_ids, event_ids, ... }` — plural, no `completed_groups`.

Task 14 must pin the author-facing payload. Proposed: keep the
`buildHookPayload` envelope (with finding-1's field fixes) but populate
`context` from the **planned** docs — `context: { workflow: plan.workflow.doc,
action: <planned target-action doc> }` — and define `result` explicitly
(`action_ids`, `event_id`(s), `completed_groups`, `tracker_fired`-equivalent
from the cascade). That is the concrete mechanism behind D6's "fresh state
through the Plan". Then fix the data-flow line 513 to match (it currently
contradicts both D6's framing and the payload-stability claim), and add
`trackerFires` to task 14's stated input (the data flow includes it; the task's
input list omits it — today's post-hook receives `tracker_fired`, so dropping
it is a regression).

Until this is pinned, the AC bullet "post-hook fresh-state access" is not
testable — there is no defined payload to assert against.

### 3. The auxiliary-entry shape drops the `fields`/`metadata` seeding channel that real upsert spawns use

> **Resolved.** Option (a): optional `fields?` / `metadata?` added to the auxiliary-entry grammar, allowed on any entry (not just upserts) — `fields` spread verbatim, `metadata` merged, matching today's `entry.fields` behaviour in both create and update paths. Edits: state-machine.md path-3 grammar + semantics bullet; design.md plan-input #2; task 14 output shape + validator passthrough + AC; task 15 planSubmit step 3 threads entry `fields`/`metadata` into `planActionTransition`'s `payload`. Tasks ≤13 are already implemented, so the only implemented-code deviation — task 9's `shared/phases/types.js` `PreHookResult` typedef — is folded into task 14 as a catch-up edit (deviation note added to task 9). `planActionTransition` (task 10) already accepts `payload.fields`/`metadata` generically; no other implemented code changes.

Today's pre-hook `actions[]` entries carry `fields`
(`mergePreHookActions.js` shape `{ type, key?, status?, fields?, upsert?,
force? }`; the upsert branch threads `fields` into `createAction` —
`handleSubmit.js:206-214`). The reference project's spawn entries carry
`additional_fields` and `metadata` (e.g.
`device-query/api/device-query-initial-details-edit-submit.yaml:232-236`
seeds `device_ids` + metadata on the spawned doc) — the very usage review-4 #1
cited to preserve the spawn. The rebuilt entry is `{ target, signal, upsert? }`
(tasks 9/14; state-machine.md's grammar shows no data fields), so a spawned
keyed action can't be seeded with fields or metadata, and task 14's validator
— told to preserve `upsert` but given no posture on other keys — would strip
or reject them.

The plumbing already exists on the consuming side: `planActionTransition`
(task 10) accepts `payload.fields` (verbatim passthrough) and `metadata`.
Resolve now (CLAUDE.md: don't defer verifiable questions): either

- add optional `fields?` / `metadata?` to the auxiliary-entry grammar
  (state-machine.md path-3 + task 9 `PreHookResult` + task 14 validator +
  task 10's auxiliary planning input), or
- explicitly decide spawns are seeded bare and document the capability loss in
  the external-app migration notes (the in-repo demo's rebuilt spawn, task 20,
  happens to need no fields — the reference app does).

## Validation spec gaps

### 4. "Reject a current-action signal redirect" has no matching rule

> **Resolved (auto).** Task 14 now specs the resolves-to-current rule: an entry redirects iff `action_id` equals the target's `_id`, or its key-normalised `(type, key)` (absent → `null`, today's `normalisePreHook` rule) equals the target's `(type, current_key-normalised)`. Sibling keyed instances (`{ type: currentType, key: <other> }`) explicitly pass; AC + test list cover both rejection forms and the sibling-passes case.

State-machine.md (lines 200-205) gives four target forms: `{ type }`,
`{ workflow_id, type }`, `{ action_id }`, `{ type, key }`. Task 14 says
"reject a return that attempts to redirect the root/current action" without
defining what matches. The cases the validator must distinguish:

- `{ action_id: <targetAction._id> }` — redirect, reject.
- `{ type: currentType, key: currentKey }` — redirect, reject (keyed actions:
  current identity is `(type, params.current_key)`).
- `{ type: currentType }` with no `key` when the current action's `key` is
  `null` — redirect, reject (today's key-normalisation treats absent key as
  `null`, `mergePreHookActions.js` `normalisePreHook`).
- `{ type: currentType, key: <other> }` — a **sibling keyed instance**, legal
  auxiliary target; must NOT be rejected.

Spec the rule in the task (entry resolves-to-current iff `action_id` equals
the target's `_id`, or `(type, key-normalised)` equals the target's
`(type, key)`), and add the sibling-instance-passes case to the test list —
it's the case a naive `type === currentType` check gets wrong.

### 5. Cross-workflow `{ workflow_id, type }` targets can't land in a per-aggregate Plan — validator posture needed

> **Resolved.** Sharper than proposed (user decision): the `{ workflow_id, type, signal }` form is **deleted** from state-machine.md's grammar rather than caveated — no engine version ever honoured it, and the per-aggregate Plan can't (build for what exists). The semantics bullet now states targets are current-workflow only (cross-workflow signalling needs its own load-plan-commit cycle; tracker cascade is the only such path). No `workflow_id`-specific validator rule; instead task 14's shape validator enforces a **strict closed key set** (`type`, `key`, `action_id`, `signal`, `upsert`, `fields`, `metadata`) — any other key rejects the entry, covering the ghost form and typos alike; today's lax spread-through posture doesn't carry over. AC + test list gain unknown-key rejection.

State-machine.md's grammar allows `{ workflow_id: <id>, type, signal }`
(line 203), but Part 38's Plan is per-aggregate (D10: "recursion across
workflows can't share a Plan") and the load phase reads only the current
workflow's actions (task 9). An entry targeting another workflow would either
throw `missing_target` (misleading error for a "supported" grammar form) or —
worse, with `upsert: true` — **spawn a same-type action into the current
workflow**, silently corrupting it.

Today's engine doesn't actually support the form either: entries are matched
only against `context.workflowActions` (`handleSubmit.js:198-202`), so
rejecting is behaviour-preserving. Fix: task 14's validator rejects entries
carrying a `workflow_id` that isn't the loaded workflow's, and state-machine.md
gets a v1 caveat on the `{ workflow_id, type }` form (it documents a grammar
no engine version has honoured). If cross-workflow auxiliary signals are ever
wanted, they need their own load-plan-commit cycle like the tracker cascade —
out of scope here, but the validator must not let the entry through to be
misinterpreted.

### 6. The rejection has no error class or code — D13's enumeration doesn't cover the pre-hook phase

> **Resolved.** Two codes (user decision — so the author can tell what they did wrong from the code alone), both `WorkflowEngineError`: `prehook_redirect` for a return entry that re-signals the current action (the resolves-to-current rule, finding 4), and `invalid_prehook_response` for any other malformed manifest (entry keys outside the closed grammar per finding 5's strict key set, bad shape). Added to D13's enumeration as pre-hook response-validation codes; task 14's validation bullets name the codes (with the explicit not-`UserError` warning) and the AC asserts both by code.

D13: "Callers and tests discriminate on `code`, never on message text," with
codes enumerated for load-phase invariants, plan-phase signal validation, and
lifecycle handlers. The pre-hook response validation (current-action redirect,
finding-5 rejection, malformed entries) sits in a phase D13 doesn't cover, and
task 14 says only "with a clear error." Spec it: `WorkflowEngineError` with a
code (e.g. `prehook_redirect`, or one `invalid_prehook_response` code for all
shape rejections), added to D13's list and asserted by code in the task's
redirect-rejection test. Without this, the implementer's most likely reach is
a bare `Error` or — worse — `UserError`, which D13 explicitly reserves for the
hook's *own* `:reject`.

## Contract carry-over

### 7. The `:reject`/UserError propagation contract points at task 14 but isn't in it

> **Resolved (auto).** Task 14 gains an "Error propagation" block carrying the load-bearing contract D13 already decided: no try/catch in either wrapper; `:reject` (`UserError(isReject: true)`) and generic crashes propagate transparently to the endpoint's `runRoutine`; no re-wrap in `WorkflowEngineError`; pre-hook rejects propagate pre-plan (no writes), post-hook throws propagate after writes (idempotency obligation per D6). AC + tests assert the unwrapped `UserError` surfaces.

D13 reserves `UserError` "for surfacing pre-hook rejects (D5 / task 14)" —
task 14 is named as the home of that behaviour, yet never mentions it. The
current wrapper's load-bearing contract (`invokePreHook.js:12-15`): **no
try/catch** — both generic crashes and `:reject` (`UserError` with
`isReject: true`) propagate transparently, and classification happens at the
wrapping endpoint's `runRoutine` (discriminated on `name === "UserError"`,
`UserError.js`). An implementer adding a defensive try/catch or re-wrapping in
`WorkflowEngineError` breaks reject classification for every authored hook.

Add to task 14: wrappers contain no try/catch; a hook `:reject` propagates
pre-plan (no writes); a test asserts a `UserError(isReject: true)` thrown by
the callApi'd routine surfaces unwrapped. Same for the post-hook's existing
documented posture (`invokePostHook.js:10-13`): throws propagate after writes
landed; authors keep the idempotency obligation (D6's README note).

### 8. `buildHookPayload.js` has no destination — `shared/phases/` would import from a handler directory

> **Resolved (auto).** Task 14's Files list now relocates `buildHookPayload.js` (+ test) to `shared/phases/` and deletes the `SubmitWorkflowAction/utils/` original after task 15 rewires; task 15's dangling-helper audit list gains `utils/buildHookPayload` with a no-stale-copy check. Contents of the file are finding 1's subject, handled there.

Task 14 moves the two wrappers to `shared/phases/` but lists no disposition
for `buildHookPayload.js` (+ its test), which both wrappers import. Left in
`SubmitWorkflowAction/utils/`, the moved wrappers import
`../../WorkflowAPI/SubmitWorkflowAction/utils/buildHookPayload.js` — shared
phase code reaching into one handler's directory, exactly the layering D2
says the file layout exists to enforce ("a planner that imports a Mongo
driver is a code smell caught in review" — same mechanism). Task 15's
dangling-helper audit doesn't list it either. Fix: relocate
`buildHookPayload.js` + test to `shared/phases/` in task 14's Files list
(contents per finding 1), and add it to task 15's audit so no stale copy
remains under `utils/`.

## Minor

### 9. No-hook default vs the surfaced `pre_hook_response`, and design.md shorthand drift

> **Resolved.** Bullet 1 (user decision, simplest-final-code): the wrapper's return stays single-valued — the normalized `PreHookResult` is both plan input and the surfaced `pre_hook_response` (task 15 pins it: always `{ actions, event_overrides, form_overrides }`, empty when no hook, never `null`). The no-hook/`null` distinction is deliberately dropped: no consumer reads the field (grepped this repo + the reference project), and today a null-returning hook already surfaces `null`, so the distinction never really existed. Bullet 2 was already fixed as a side effect of the finding-1/2 resolutions — design.md's data flow and worked example both show the full typed shape.

- Today no-hook returns `null`, and the handler surfaces it
  (`pre_hook_response: null` in the return payload; exposed by
  `makeWorkflowApis.js`'s `:return` block). Task 14's empty-result default
  (`{ actions: [], event_overrides: {}, form_overrides: {} }`) is right as
  *plan input*, but if the wrapper's return is also what task 15 surfaces,
  "no hook" and "hook returned nothing" become indistinguishable to callers.
  One sentence in task 14 settles it (e.g. wrapper returns the normalized
  result plus the raw response, or task 15 surfaces `null` when no hook was
  declared).
- design.md's data flow (line 468) and worked example (line 711) both say
  `PreHookResult = { actions: [], overrides: {} }` — a stale shorthand for the
  typed `{ actions, event_overrides, form_overrides }` (D2, task 9, task 14).
  Align the two lines.
