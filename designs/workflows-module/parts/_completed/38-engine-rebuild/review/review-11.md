# Review 11 — Task 15: Submit handler rewrite

Scope: `tasks/15-submit-handler-rewrite.md`, verified against the code it
rewrites/deletes (`SubmitWorkflowAction.js`, `handleSubmit.js`,
`fireTrackerSubscription.js`, `shared/getActions.js`, the existing test files
under `SubmitWorkflowAction/`), the **landed** Band-1/3 code
(`mongo/getMongoDb.js`, `shared/phases/loadWorkflowState.js`, the task-10/11
planners — their real signatures, since tasks 9–11 are done), the consuming
surfaces (`resolvers/makeWorkflowApis.js`, `connections/workflow-api.yaml`,
`WorkflowAPI/schema.js`, the events module's `change_stamp`), design.md
(D3, D9–D13, D15, data flow), and tasks 9–14, 16, 17, 19.

Prior coverage checked and not repeated: review-8 #9 (CommitResult
`event_id` singular/plural — still open), review-9 #2 (`comment` payload
drop), #3 (`mergeEventOverrides`/`deriveEntityRefKey` relocation ownership),
#6 (request-context threading assigned to task 15's mint step), review-10 #1
(`buildHookPayload` hook-resolution key), #2 (post-hook payload), #8
(`buildHookPayload` destination), #9 (`pre_hook_response` surfacing). Several
findings below adjoin those; the overlap is flagged where it exists.

## Missing producers

### 1. `plan.trackerFires` has no producer — and `parentWorkflowId` is not purely derivable

> **Resolved.** Neither (a) nor (b) — a third option: workflow docs gain a denormalised **`parent_workflow_id`** beside `parent_action_id`, stamped by `StartWorkflow` from the loaded parent action's `workflow_id` (in hand at insert time; same copy mechanic as `entity_ref_key`). The fire is then purely derivable at plan time — `LoadedState` untouched, no per-level cascade read, D3 fire shape unchanged, bidirectional parent↔child linking as a data-model win. Producer rule written once in D3 (Submit: `internal_mirror_child_completed` iff `completed` pushed ∧ `parent_action_id != null`; Start: `_active` from the loaded parent action; Cancel/Close: `_cancelled` — **corrected by review-13 #3:** Close fires `_completed`, not `_cancelled`; close is forced completion, so the parent tracker lands `done` per today's `CHILD_STAGE_MAP`, and only Cancel fires `_cancelled`); producing step added to task 15's `planSubmit` (step 9 after #2's renumber) + data flow; task 17 stamps the field and cites the shared rule; task 16 notes fires arrive fully resolved. Backfill for pre-existing child workflows is author-owned (no fallback read), per the schema-additions note.

`planSubmit`'s composition (task 15 steps 1–9) never composes `trackerFires`.
Step 9 "Assemble the `Plan` object" implies the field exists, but no step — and
no planner in tasks 10–12 — produces it. The handler then calls
`runTrackerCascade` (task 16), whose loop consumes
`{ parentWorkflowId, parentActionId, signal }` fires and loads each level by
`fire.parentWorkflowId`.

Worse, the data isn't purely derivable. Today's discovery
(`fireTrackerSubscription.js:46–57`) is: read the child workflow's
`parent_action_id` → read the parent tracker action by that id
(`getActionFields`) → its `workflow_id` is the parent workflow. The first half
is fine (the loaded workflow doc carries `parent_action_id`, so the pure plan
can read it). The second half — `parentActionId → parentWorkflowId` — is a
**cross-workflow read**: the parent action belongs to a workflow the load phase
never reads (task 9 loads "the workflow doc, all action docs for that
workflow"). The plan phase is barred from I/O (D2), so as specced, nothing can
fill the D3 `trackerFires` shape.

Fix — two decisions, both cheap, pick one home for each:

- **Trigger:** spec in `planSubmit` that a fire is emitted iff
  `planWorkflowRecompute` pushed `completed` **and**
  `loadedState.workflow.parent_action_id != null` — signal
  `internal_mirror_child_completed` (mirrors `handleSubmit.js:343–348`'s
  `shouldPushCompleted` gate; the no-parent case short-circuits as today,
  `fireTrackerSubscription.js:50–51`).
- **Resolution of `parentWorkflowId`:** either (a) the plan emits fires keyed by
  `parentActionId` only, and `runTrackerCascade` resolves
  `parentActionId → parentWorkflowId` with one `findDocs` read at the top of
  each level — the cascade is already the impure orchestration layer, and its
  per-level `loadWorkflowState` follows immediately; or (b) the load phase
  additionally reads the parent tracker action when
  `workflow.parent_action_id != null`. Option (a) keeps `LoadedState` untouched
  (task 9 is already implemented) and puts the read next to its consumer;
  either way the D3/D10/task-16 `trackerFires` shape and the producing step
  must be written down. Update task 16's loop sketch to match the choice
  (its current signature presumes resolution already happened).

This also affects task 17: Start's parent-tracker push and Cancel/Close's
cascades produce fires the same way; whatever resolution home is chosen,
say it once in shared terms (the cascade entry), not per handler.

### 2. The handler return payload is unpinned — and `completed_groups` has no producer anywhere

> **Resolved.** Task 15 pins the handler return to today's six keys verbatim (matching the emitted Api `:return` block, which task 19 doesn't touch), with per-key producers: `action_ids` from `CommitResult`, `completed_groups` from the new `plan.completedGroups`, `event_id` singular (review-8 #9 had already pinned it end-to-end), `tracker_fired` from the cascade's fire list. `planSubmit` gains step 5 — the loaded-vs-planned groups diff + `on_complete` join — and D3's Plan gains the `completedGroups` field, the single producer feeding both the handler return and task 14's post-hook `result` bag (task 14 now cites it). AC added: integration test asserts all six keys, including a joined `completed_groups` entry when a submit completes a group.

Task 15's flow ends "→ return handler payload" and the AC never says what that
payload is. The consumer is concrete: the emitted per-action Api's `:return`
block (`makeWorkflowApis.js:82–89`) maps six keys —
`action_ids`, `completed_groups`, `event_id`, `tracker_fired`,
`pre_hook_response`, `post_hook_response` — and task 19 (the `makeWorkflowApis`
task) touches only the payload mapping, not the `:return` block. `_step`
lookups of missing keys resolve to nothing silently, so a handler that returns
a `CommitResult`-shaped bag (`{ action_ids, event_ids, ... }`, review-8 #9)
ships `event_id: undefined` / `completed_groups: undefined` to every app with
no failing test until the demo e2e.

`completed_groups` is the substantive half: today it's computed by diffing
`recomputeResult.groupsBefore/groupsAfter` and joining `on_complete` from
`workflowConfig.action_groups` (`handleSubmit.js:273–288`) — it's the group
on_complete fan-out contract (`emitGroupOnCompleteApi`,
`makeWorkflowApis.js:95–102`). In the rebuild **no planner emits a groups
delta**: `planWorkflowRecompute` returns only the planned doc. The diff is
trivially derivable in `planSubmit` (loaded `workflow.groups` vs planned
`groups`, join `on_complete`), but someone must be told to do it.

Fix: pin the handler return shape in task 15 — keep today's six keys
(`event_id` singular per invocation, resolving review-8 #9's plural/singular
drift in the same stroke; `tracker_fired` populated from `runTrackerCascade`'s
return) — and add the loaded-vs-planned groups diff (+ `on_complete` join) as
an explicit `planSubmit` step. Review-10 #2 already asks for the *post-hook*
result bag to be pinned; this is the handler/API half of the same contract —
resolve them to one shape.

## Unowned wiring

### 3. Engine-context composition is unowned — nobody calls `getMongoDb`

> **Resolved.** Task 15's shared invocation-setup step now owns the full engine-context composition: `await getMongoDb(connection)` → `{ mongoDb, mongoClient, useTransactions }` plus `callApi`/`user`/`connection`/`params`/`workflowsConfig`, the mint, and the request-context fields — with the async-at-handler-entry note. The rebuilt Submit context drops `mongoDBConnection` (verified: loads via `findDocs`, hooks/events/notifications via `callApi` — nothing in the rebuilt path uses the community wrapper); the `createMongoDBConnection` import goes with the rewrite. Task 17 composes via the same shared step.

The phases consume `context.mongoDb` (load `findDocs`, commit helpers),
`context.mongoClient` (commit `startSession`, D11), and
`context.useTransactions` — all produced by the landed
`mongo/getMongoDb.js` (task 1). But no task says **the handler calls it**.
Task 1 built the helper; task 13 consumes the flags; task 15 — the task that
rewrites the context builder `SubmitWorkflowAction.js:6–19` (today wiring only
the community client) — specs nothing beyond the `{ event_id, now, newId }`
mint. As tasked, the rebuilt handler has no instruction to construct the
engine context at all.

Fix: extend task 15's "small shared invocation-setup step" to own the full
engine-context composition: `await getMongoDb(connection)` →
`{ mongoDb, mongoClient, useTransactions }`, plus `callApi`, `user`,
`connection`, `params`, `workflowsConfig`, the mint, and the four
request-context fields review-9 #6 already routes here. Note that `getMongoDb`
is async (it awaits `connect` + the `hello` probe on first use) — it belongs at
handler entry, not module scope. Task 17's handlers reuse the same setup step
(it's the "one correct way" rationale the task already gives for the mint).
While here: state whether the rebuilt Submit context still carries
`mongoDBConnection` (the community wrapper) — nothing in the rebuilt Submit
path needs it (hooks/events/notifications go through `callApi`), so presumably
it's dropped; say so, since `createMongoDBConnection` is imported today.

### 4. `now` is *read* off `connection.changeStamp`, not generated — the task's "generated here" invites the wrong implementation

> **Resolved (auto).** Task 15's mint paragraph now states `event_id`/`newId` are generated (`randomUUID()`) while `now` is read from `connection.changeStamp` (per-request evaluated events-module stamp; one stamp per invocation), with an explicit warning against constructing `{ timestamp: new Date(), user }` in the handler.

Task 15: the minted values "are nondeterministic, so they are generated here."
True for `event_id`/`newId`; wrong for `now`. Today's stamp is the
**connection property** `changeStamp` — `workflow-api.yaml` wires
`_ref: { module: events, component: change_stamp }`, which is
`{ timestamp: { _date: now }, user: { name: { _user: profile.name }, id: { _user: id } } }`,
runtime operators evaluated per request; `WorkflowAPI/schema.js:74`'s
description says exactly "The engine reads it at handler entry." An implementer
following "generated here" writes `{ timestamp: new Date(), user: context.user }`
— changing the stamped user shape (the events-module `{ name, id }` projection
becomes the whole Lowdefy user object) and bypassing the app-configurable stamp
(apps can override the `change_stamp` var). Review-8 #1's resolution wording
("mirroring `context.changeStamp`") gestures at this but the task text pulls
the other way.

Fix: one sentence — `event_id`/`newId` are generated (`randomUUID()`); `now`
is read from `connection.changeStamp` (already per-request evaluated; one
stamp per invocation, all writes share it, per the schema description).

## Dispositions

### 5. Three existing integration test files have no disposition

> **Resolved.** All three added to task 15's Files list as delete-after-fold into `SubmitWorkflowAction.test.js` (the single integration home): `handleSubmit.test.js` deleted with a named salvage list (pre-hook auxiliary flows incl. wire-level upsert spawn, end-to-end form-data merge, `completed_groups` + `on_complete` join — everything else dies with the deleted behaviour, `required_after_close`/upsert-split already mirrored in task 9/10 unit tests); `worked-example.test.js` folded per the AC, re-driven through the new payload grammar; `event-id-round-trip.test.js` preserved as a named assertion block (the invariant is now designed-in, D3/task 12).

Task 15 deletes the `.test.js` of each deleted source file and
creates/rewrites `SubmitWorkflowAction.test.js`. It says nothing about:

- `handleSubmit.test.js` (2,267 lines) — exercises the old flow end-to-end:
  priority rule, `resolveTargetStatus`, the removed action-wide
  `access.roles` check, `required_after_close`. `handleSubmit.js` is rewritten,
  so this file fails wholesale. Most cases die with the behaviour they test;
  some must be salvaged into the new integration test (the
  `required_after_close` carve-out is already mirrored in task 9's load tests;
  upsert spawn moved to task 10's; say which others carry).
- `worked-example.test.js` — the Part 30 worked-example assertions task 15's
  own AC cites. It drives the **old** payload (`interaction:`, shorthand
  `access: { app: [verbs], roles }`), so it can't pass unmodified. Is it
  folded into `SubmitWorkflowAction.test.js` (the AC implies so) and deleted,
  or rewritten in place?
- `event-id-round-trip.test.js` — asserts the one-`event_id`-per-invocation
  round trip (status[] entries ↔ event doc `_id`), which is now a designed
  invariant (task 12 / D3). Worth preserving as a named assertion rather than
  silently deleting.

Fix: add the three files to task 15's Files list with explicit dispositions.

### 6. The deletion audit re-opens decisions design.md already made — and misses `shared/getActions.js`

> **Resolved (auto).** Task 15's audit sentence replaced with the four design-settled dispositions (`mergeEventOverrides` kept/relocated by task 12; `mergeFormOverrides`, `mergePreHookActions`, `shouldCreate` deleted, citing Q6 and the design Deleted list). `shared/getActions.js` (+ test) added to task 15's deletion list (importers verified: only `handleSubmit.js` + `recomputeWorkflowAfterActionWrite.js`). `shared/getActionFields.js` disposition assigned to task 17 (deletion entry added there; pointer note in task 15).

Task 15 line 51 says to "audit each" of `mergeEventOverrides`,
`mergeFormOverrides`, `mergePreHookActions`, `shouldCreate` — "keep and
relocate the ones the planners reuse … delete the ones fully superseded." The
design already resolved every one of these: `mergePreHookActions` and
`shouldCreate` are in design.md's **Deleted** list with their fold-in homes
(lines 634–635); `mergeFormOverrides` is superseded by Q6 ("the old
`mergeFormOverrides.js` top-level spread is not preserved" — task 11
implemented `deepMerge.js` accordingly, and the landed `planFormDataMerge`
doesn't import it); `mergeEventOverrides` is kept (D14), with its relocation
ownership already argued into task 12 by review-9 #3. Deferring to an
implementation-time audit is the "verify at code time" punt CLAUDE.md rejects —
state the four dispositions.

Meanwhile the audit misses the file that actually goes dangling:
**`shared/getActions.js`** — its only importers are `handleSubmit.js`
(rewritten here) and `recomputeWorkflowAfterActionWrite.js` (deleted here).
After task 15 it's dead code on no list. Add it (and its test) to the deletion
list, conditional on the task-17 lockstep note already in the task (no other
handler imports it — verified). Same pattern one band later:
`shared/getActionFields.js`'s importers are `fireTrackerSubscription.js`
(task 16) and `StartWorkflow.js` (task 17) — neither task lists its
disposition; a pointer from task 15's audit note (or additions to 16/17) closes
it.

## Minor

### 7. The `planSubmit` step list drifts from the landed planner signatures

> **Resolved (auto).** Steps 1–3 restated as entry composition (build the transition-entry list with `source` tags; `planActionTransition` resolves signals internally — no orchestrator pre-resolution), and the merge order fixed: `planFormDataMerge` runs first, `planWorkflowRecompute` consumes the merged `formData` (landed task-11 signature). List renumbered 1–8.

Tasks 10–11 are implemented, so the orchestration contract is no longer
hypothetical. Two adjustments:

- Steps 1–2 ("Resolve current-action signal → target stage", "Resolve
  auxiliary signals → target stages") describe work the landed
  `planActionTransition` does **internally** — it takes `signal` +
  `source: 'user' | 'auxiliary' | 'cascade'` and resolves via `resolveSignal`
  itself (`planActionTransition.js:37–38`). Read literally, the steps have the
  orchestrator resolving signals once and the planner resolving them again.
  Restate steps 1–3 as entry composition: build the transition-entry list
  (current entry with `source: 'user'`; `preHookResult.actions[]` entries with
  `source: 'auxiliary'`, carrying `upsert`/`key`) and hand each to
  `planActionTransition`.
- Step 5 says "`planWorkflowRecompute` + `planFormDataMerge`" — but the landed
  `planWorkflowRecompute` takes `formData` (the merged whole) as an input
  (`planWorkflowRecompute.js:36`), so the merge runs **first**. Swap the order
  in the step text so the implementer doesn't have to discover the dependency
  from JSDoc.

## Summary

Findings 1–3 are the load-bearing ones, all the same species: task 15 is the
task where the phase pieces finally meet the outside world (cascade, emitted
API `:return`, Lowdefy context), and at each seam the producer is unspecced —
`trackerFires` (with a genuinely unobtainable `parentWorkflowId` as written),
`completed_groups`/the return contract, and the engine Mongo context. Finding 4
prevents a quiet change-stamp regression; 5–6 are disposition bookkeeping that
the task's own "no dangling imports" AC depends on; 7 aligns prose with code
that already landed.
