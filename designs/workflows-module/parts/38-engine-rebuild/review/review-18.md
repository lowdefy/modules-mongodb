# Review 18 — Tasks 17, 18, 19 (Band 4 remainder + Band 5)

Scope: `tasks/17-start-cancel-close-rewrite.md`, `tasks/18-display-surface-renames.md`,
`tasks/19-emitted-payload-surfaces.md`, verified against the post-task-23 landed
code (`planActionTransition.js`, `planWorkflowRecompute.js`, `fsm/tables.js`,
`runTrackerCascade.js`, `planTrackerLevel.js`, `planSubmit.js`, `handleSubmit.js`,
`loadWorkflowState.js`, `createEngineContext.js`, `commitPlan.js`,
`planEventDispatch.js`), today's `StartWorkflow.js` / `CancelWorkflow.js` /
`CloseWorkflow.js` / `createAction.js`, the resolvers (`makeWorkflowApis.js`,
`makeWorkflowsConfig.js`), the module tree (`module.lowdefy.yaml`, pages, README,
api YAMLs), and design.md. Findings already annotated in reviews 16–17 are not
repeated.

**Verified clean (no findings):** every line ref into today's lifecycle handlers
is accurate (`CancelWorkflow.js:35–41` no null check, `:49–53` reason entry,
`:71–96` unconditional sweep, `:5–18/:44–47` reserved-key filter;
`CloseWorkflow.js:52–54` idempotent no-op, `:56–60` cancelled throw, `:66–71/
:116–121` `required_after_close` + blocked exception, `:78–82` `completed` push;
`StartWorkflow.js:74–75/:82/:120–125`); all four task-23 contract extensions are
landed exactly as task 17 consumes them (`seedStage` with `invalid_seed` codes,
`lifecyclePush` with skip-entirely semantics and the pinned entry shape, the
tracker `none` row with birth signals only, `fire.payload` → `planTrackerLevel`
→ `planActionTransition.payload` passed whole — review-17 #5's double-nesting
fixed); `internal_cancel_action` exists in every non-terminal row of both FSM
tables, so Cancel's unconditional sweep and Close's filtered sweep resolve for
every sweepable stage; `loadWorkflowState`'s `{ workflowId }` mode throws
`workflow_not_found` and skips the Submit-specific stage/access checks, matching
task 17's split; `createEngineContext.js` is the shared invocation-setup task 17
is told to reuse; `commitPlan` dispatches `operation: "insert"` without a CAS
filter; `planEventDispatch` already branches on the three lifecycle
`handlerType`s; `computeEngineLinks.js:16/:86` and `computeEngineLinks.test.js:76`
match task 18's cites; the demo's only stale page refs are the
`schedule-followup.yaml` link cells task 18 already exempts, and the demo's
`starting_actions` all seed `action-required`, so task 17's legal-seed build
check breaks nothing in-repo; `makeWorkflowApis.js:40` carries the
`_module.endpointId` wrapping task 19 preserves; `makeWorkflowsConfig.js` has no
`event:` validation today (task 19's claim) and its `ACTION_STATUSES` membership
check for `starting_actions` (`makeWorkflowsConfig.js:363–368`) is where task
17's two-seed restriction lands; `current_key` has real landed consumers
(`buildHookPayload.js:34`, `invokePreHook.js:104`, `planFormDataMerge.js:52`).

## Design-vs-Task Drift

### 1. design.md still puts the parent-tracker transition inside Start's plan

> **Resolved (auto).** Reworded design.md's StartWorkflow bullet (line 674) to "plan (workflow doc + seeded action drafts), commit, tracker cascade (the parent-tracker mirror fire when started as a tracker child)" with the per-aggregate rationale — matching task 17:12 and D3.

design.md § "Rewritten — engine entry points" (line 674): "*plan (workflow doc +
initial action docs + **optional parent-tracker transition**), commit, optional
tracker cascade (the parent-tracker push)*". This is the pre-review-13 #4 shape.
Task 17:12 pins the opposite — "The parent-tracker transition is **not** in
Start's plan — the parent action belongs to a different workflow, and the Plan
is per-aggregate (D3/D10); it runs as a cascade level via the
`internal_mirror_child_active` fire" — and D3 (line 137) agrees. consistency-16
#1 fixed the same remnant in the D10 loop sketch but missed this line.

**Fix:** reword to "plan (workflow doc + seeded action drafts), commit, tracker
cascade (the parent-tracker mirror fire when started as a tracker child)".

## Contract Gaps

### 2. The seed-entry grammar `{ type, status }` can't express keyed actions — but the keyed-action carve-out carries over

> **Resolved.** Grammar pinned as `{ type, key?, status }` in task 17 (both mentions), task 19's payload bullet, the seed-grammar YAML comment spec, and task 19's AC. Per-entry `fields` and `references` explicitly dropped (nothing in-repo passes them; "build for what exists") — the YAML comment states the drop so the authored contract reads as decided, not overlooked. Per-entry `metadata` deliberately not added: start-time metadata is the payload-level bag merged uniformly onto every seeded draft (review-16 #4 thread); workflow-level `references` carries over unchanged.

Today's start entry shape is `{ type, key?, status, fields?, references? }`
(`createAction.js:14` doc block; `key` consumed at `:35`, `fields` at `:46–48`,
`references` spread at `:30`), and StartWorkflow's keyed-action guard
(`StartWorkflow.js:42–51`) exists precisely to direct keyed seeds to the
`actions:` payload — its error message says "pass them via the actions: payload
instead". Task 17:29 carries that guard over ("keyed `starting_actions`"
precondition), yet task 17:14 and task 19:24 pin the override grammar as
`{ type, status }`, and task 19's YAML comment would document that as the
authored contract. As written, the carve-out is dead: the guard points at a
payload that can't carry `key`. `planActionTransition` already accepts `key`
(`planActionTransition.js:83`), so the thread is one word.

**Fix:** pin the grammar as `{ type, key?, status }` in task 17, task 19's
payload bullet, and the seed-grammar YAML comment. While there, decide the other
two legacy entry channels explicitly: per-entry `fields` and `references` are
dropped (nothing in-repo passes them — the demo's only start call sends
`workflow_type`/`entity_id`/`entity_collection`; "build for what exists") — say
so, since the YAML comment becomes the authored contract and silence reads as
oversight.

### 3. No end-of-invocation `post_commit_dispatch_failed` surfacing specced for Start/Cancel/Close

> **Resolved.** Task 17 gains a `throwIfDispatchFailed` paragraph (extract `handleSubmit.js:88–102` to `shared/phases/throwIfDispatchFailed.js`, handler name parameterised; called at the end of all four handlers, `handleSubmit` adopts it too), an AC bullet with a Cancel dispatch-failure test, and Files entries for the new helper + the `handleSubmit` refactor. Close's idempotent no-op carve-out and the no-cascade case (Start not as tracker child) are pinned in the paragraph.

D9/D13 require **every** handler to throw `post_commit_dispatch_failed` at the
very end of the invocation when commit steps 3–5 recorded `dispatchErrors[]` or
the cascade recorded `cascadeErrors[]`. Task 15 implemented this inline in
`handleSubmit.js:88–102` — Submit only. Task 17 pins each handler's return
surface precisely (`{ workflow_id, action_ids, event_id }` /
`{ action_ids, event_id, tracker_fired }`) but never mentions
`dispatchErrors`/`cascadeErrors`, and all three handlers run `commitPlan` +
`runTrackerCascade`, both of which only *record* these failures. A literal
implementation returns success while a failed event dispatch or an exhausted
mirror-fire retry vanishes — exactly what D9's "no engine side-channel logging"
stance forbids.

**Fix:** add the aggregation + end-of-handler throw to task 17's body and AC
(after the cascade; Close's idempotent no-op returns before any of this).
Since this makes four handlers repeating the same ~15-line block, extract it to
a shared helper (e.g. `shared/phases/throwIfDispatchFailed.js`) consumed by
`handleSubmit` too — "one correct way"; the task already imports the phase
layer, so this is a natural companion to `createEngineContext`.

### 4. Start's planned workflow doc — `summary`/`groups` composition unspecified

> **Resolved.** Adopted the recommended mechanism: task 17's plan bullet now specs the base insert doc (status `active`, `form_data: {}`) followed by `planWorkflowRecompute({ loadedState: { workflow: baseDoc, workflowConfig }, plannedActions: seededDrafts, event_id, now })` — no `lifecyclePush`; call shape verified against the landed planner's signature, and both safety claims re-verified (seeds non-terminal → no auto-complete; `total > 0` guards the zero-action case). The 17:27 parenthetical reworded so it no longer reads as "Start skips the recompute".

Today `StartWorkflow.js:97–108` computes `summary` (counting `not-required`
drafts) and `groups` (`recomputeGroups` over the drafts) onto the insert doc.
Task 17's Start plan bullet enumerates the doc's new fields (`entity_ref_key`,
`parent_workflow_id`), the `active` status seed, and the draft mechanism — but
not who composes `summary`/`groups`/`form_data: {}`, and 17:27's "(Start
inserts; it doesn't run the recompute against loaded state)" reads as "Start
doesn't call `planWorkflowRecompute` at all", leaving the mechanism open. Two
notes that change the answer from today's code: under the legal-seed rule the
seeded drafts are always non-terminal, so the `notRequiredCount` logic dies
(`summary` is always `{ done: 0, not_required: 0, total: N }`); and the planner
is the design's single workflow-doc composition site.

**Fix:** one sentence in the plan bullet. Recommended: compose the base insert
doc (status seeded `active`), then run
`planWorkflowRecompute({ loadedState: { workflow: baseDoc, workflowConfig }, plannedActions: seededDrafts, event_id, now })`
— no `lifecyclePush`; auto-complete can't fire (seeds are non-terminal, and the
`total > 0` guard covers the zero-action workflow), and the planner stamps
`updated: now` consistently. This mirrors review-17 #7's resolution (seed mode
already passes the planned insert doc as `loadedWorkflow`). If a manual literal
is preferred instead, pin that — but then the AC's "groups[] recomputed"
language needs a stated mechanism.

## Missed Deletion Scope

### 5. `pushWorkflowStatus.js` and `populateIds.js` are orphans missing from every deletion ledger

> **Resolved (auto).** Orphan status re-verified by grep (pushWorkflowStatus referenced only by its own test; populateIds by nothing). Added both files (+ the test) to task 17's Files with the orphan rationale and to design.md § Deleted.

`shared/pushWorkflowStatus.js` (+ `pushWorkflowStatus.test.js`) and
`shared/populateIds.js` have **zero** src importers today (verified by grep —
pushWorkflowStatus is referenced only by its own test; populateIds by nothing) —
orphaned by the task-15/16 rewrites of their former call sites. Neither appears
in design.md § Deleted, tasks.md's Band-4 deferred-deletion ledger, nor task
17's Files list. Task 17 is the close-out of the old write path, so they belong
in its sweep.

**Fix:** add both files (+ the test) to task 17's Files with the orphan
rationale, and to the design § Deleted list.

## Stale References (post-task-23 line drift)

### 6. Task 17's planner line refs predate task 23's edits; the importer claim for `getActionFields` is wrong as stated

> **Resolved (auto)** — except the third bullet, which is **rejected**: `getCurrentAction.js` names `getActionFields` in a doc comment only, not an import (grep confirms exactly two importers), so task 17:54's claim was correct; a parenthetical noting the comment-only mention was added anyway. Line refs updated to re-verified values (`:138–205` downstream steps; `:166` insert-side metadata merge — the review's `:164`/`:172` were themselves off by two; recompute auto-complete `:93–107`), and 17:27 re-tensed to "landed by task 23 — don't re-extend".

- Task 17:12's "`planActionTransition.js:101–168`" (the seed-mode downstream
  steps) is now `:136–203`, and 17:14's "the landed planner already does the
  merge, `planActionTransition.js:129`" is now `:164` (insert) / `:172`
  (update) — the file gained ~35 lines of seedStage guards/JSDoc at the top.
- Task 17:27's "the landed `planWorkflowRecompute` (`planWorkflowRecompute.js:69–83`)
  would push a phantom `completed`" — the auto-complete block is now `:92–107`,
  and the surrounding "Extend `planWorkflowRecompute` with an optional
  `lifecyclePush`" instruction is now history: task 23 landed the extension
  (17:56 already notes the ownership; re-tense the body so the implementer
  doesn't re-extend).
- Task 17:54: "`shared/getActionFields.js` — delete: its only importers are
  `StartWorkflow.js` … and `fireTrackerSubscription.js`" — there is a third,
  `SubmitWorkflowAction/utils/getCurrentAction.js`. The conclusion holds
  (getCurrentAction is itself deleted by task 17 per the Band-4 ledger), but
  the two-importer claim is false; name all three or say "all importers die in
  this task".

### 7. Task 18's "exact sites" enumeration misses the fixture task 23 added

> **Resolved (auto).** Added line 336 (task 23's seedStage fixture) to the Files entry; lines 155/247/251 re-verified as still accurate, so the enumeration keeps its precision.

Task 18:44/51 lists `planActionTransition.test.js` lines 155, 247, 251 and
claims the Files list "enumerates the exact sites". Task 23 (landed after task
18 was written) added the seedStage tests, which assert
`workflows/workflow-simple-edit` at `planActionTransition.test.js:336`. The
grep criterion still catches it, but the enumeration should be updated (or the
line-number precision dropped in favour of the grep).

## Task-18 Enumeration Cleanups

### 8. README under-enumeration + a now-resolvable hedge

> **Resolved (auto)** — overtaken by events on the first bullet: task 24's docs pass (commit c9513e4, landed after this review) already rewrote the README onto the final ids (intro, Pages table incl. the `workflow-group-overview` row, URL column; grep-clean re-verified), so task 18's README Files entry now reads "no edits — verify grep-clean" instead of widening. Second bullet resolved as fact: the manifest has no `exports:` section — hedge replaced in the reference list, Files, and AC 3.

- `modules/workflows/README.md` carries the old ids in more places than the
  Files entry ("Pages table rows for `simple-edit`/`simple-view`/`simple-review`")
  names: the intro paragraph (line 3) lists all three pages **and**
  `group-overview`; the Pages-table URL column embeds them
  (`/{entryId}/simple-edit`, lines 145–147); and the `group-overview` row (line
  149) needs the rename too. The Notes grep
  (`workflow-simple|simple-view|simple-edit|simple-review`) catches the
  simple-* sites but **not** the README's `group-overview` row, and AC 2's
  `group-overview` clause is scoped to `_module.pageId:` references — so that
  row can survive both checks. Widen the Files entry and add `group-overview`
  to the Notes grep pattern.
- "The `exports.pages` ids in `module.lowdefy.yaml` (if listed)" — resolvable
  now (CLAUDE.md: resolve, don't defer): the manifest has **no** `exports:`
  section (pages live under `pages:` only). Replace the hedge with the fact.

## Cross-Task Gap

### 9. `metadata` on the **submit** payload has no consumer — `planSubmit` hardcodes `metadata: undefined`

> **Resolved.** Took the recommended thread (option 1): task 19's payload bullet now specs `planSubmit.js:60` reading `params.metadata` (landed-code catch-up, twin of review-16 #4's start thread; planner update-side merge verified at `planActionTransition.js:174`), with a new AC bullet asserting consumption (submitted metadata lands on the planned action doc) and Files entries for `planSubmit.js` + its test. Drop-from-mapping rejected — it would edit design.md's emitted-mapping list against the Part 30 carry-over and leave submit asymmetric with start.

Task 19:11/13 adds `metadata` to the emitted per-action submit payload (per
design.md § "Modified — API + payload surfaces", which lists it), and review-16
#4 resolved the consumer question for **start-workflow** only (task 17's seed
threading). On the submit side, the landed `planSubmit.js:60` passes
`payload: { fields: params.fields, metadata: undefined }` for the user's
current-action transition — only pre-hook auxiliary entries thread metadata
(`planSubmit.js:88`). So a submit-payload `metadata` falls on the floor exactly
like review-16 #4's start case, and nothing in task 19's AC catches it (the AC
asserts the field is *passed*, not consumed).

**Fix (recommended):** spec the one-line thread — `planSubmit.js:60` reads
`params.metadata` — plus a `planSubmit.test.js` case, as task-19 scope (it's
the same landed-code catch-up shape as the start thread; the planner merge
already exists at `planActionTransition.js:172`). Alternative: drop `metadata`
from the submit mapping and keep it start-only ("build for what exists") — but
that requires editing design.md's emitted-mapping list and contradicts the Part
30 carry-over, so the thread is the smaller change.

## Summary

Tasks 18 and 19 are in good shape — their findings are enumeration drift (#7,
#8) and one real consumer gap (#9, the submit-side twin of review-16 #4). Task
17's findings are heavier: one design-body remnant review-13 #4 should have
caught (#1), a dead keyed-seed carve-out the pinned grammar creates (#2), the
missing per-handler dispatch-failure throw that D9/D13 mandate (#3), an
unspecified workflow-doc composition mechanism for Start (#4), two orphaned
files every deletion ledger missed (#5), and post-task-23 line-ref drift (#6).
Nothing structural: the phase composition, sweep semantics, lifecycle
preconditions, event emission, and tracker-fire producer rules all check out
against the landed code and today's handlers.
