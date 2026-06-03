# Consistency Review 15

## Summary

First consistency pass since reviews 10 and 11 were actioned (consistency-14
covered reviews 8–9) and since the shipped-`callApi`-contract correction
landed (task 22 + design § "The shipped `callApi` contract"). All 16 findings
across reviews 10–11 carry resolution annotations, and the resolutions are
propagated correctly across `design.md`, the task files, and the landed
Band-1/3 code, with nine residual exceptions — all auto-resolved: four
inventory/typedef stragglers from the review-11 #2 `completedGroups` decision
(task 9 Plan sketch, the `types.js` catch-up owner, the data-flow compose step
and Plan output line), one D2↔D6 input-contract mismatch (review-10 #2's fire
list), four Files-changed inventory gaps (the `buildHookPayload` relocation;
`mergeFormOverrides` / `getActions` / `getActionFields` deletions), a stale
tracker-`none`-row exclusion in implemented task 2 (Part 45 review-1 #2), the
unstated cascade fire-list return in task 16, the missing shared
invocation-setup cross-reference in task 17, and three stale status notes
(`tasks.md` inventory frozen at "10–13 unactioned", "21 tasks", and the
"reviews 8–13 actioning" mislabel in task 21). No user decisions were
required.

**Out of scope, flagged:** reviews 12, 13, 14, and 15 (~22 findings against
tasks 16, 17, 18, 22 + adjacent surfaces) carry **no resolution annotations** —
they are not actioned, and their recommendations are deliberately *not*
treated as decisions by this pass. `tasks/tasks.md` now warns: action
review-15 (task 22) before implementing task 22, reviews 12–13 before
implementing Band 4, review-14 before Band 5. One
premise note for the action-review: review-13 #1's subject (Start direct-seed
+ tracker `none`-row flip) was already applied to task 17 / task 19 /
design.md / state-machine.md before review-13 was written — mark it stale-
premise when actioning; its secondary asks (seeding mechanism, legal-seed
validation home) are now partially in task 17 (runtime legal-seed check,
`makeWorkflowsConfig` restriction) but findings 2–7 remain live.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review-1.md` – `review-14.md`, `consistency-4.md`,
  `consistency-5.md`, `consistency-8.md`, `consistency-14.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01` – `tasks/22`
- **Plans:** none present.
- **Cross-checked external surfaces:** landed `shared/phases/types.js`
  (PreHookResult / Plan typedefs vs the review-10 #3 / review-11 #2
  decisions), engine source tree (helper locations for the inventory
  entries: `shared/getActions.js`, `shared/getActionFields.js`,
  `SubmitWorkflowAction/mergeFormOverrides.js`,
  `SubmitWorkflowAction/utils/buildHookPayload.js`);
  `workflows-module-concept/state-machine/design.md` (path-3
  `fields`/`metadata` grammar, `{ workflow_id, type }` form deleted, tracker
  `none` row + "Creation" § Start direct-seed); git history (`8a9fddd`
  actioning-commit scope vs annotation reality).

## Inconsistencies Found

### 1. Task 9's Plan typedef sketch missing `completedGroups`

**Type:** Review-vs-Task (review-11 #2)
**Source of truth:** review-11 #2 resolution — "D3's Plan gains the
`completedGroups` field, the single producer feeding both the handler return
and task 14's post-hook `result` bag." D3 and tasks 14/15 carry it; task 9's
Plan sketch (and the landed `types.js`, verified) do not.
**Files affected:** `tasks/09-load-phase-and-types.md`
**Resolution:** `completedGroups` added to the Plan sketch with a deviation
note (added post-implementation; typedef catch-up in task 14, producer in
task 15 planSubmit step 5) — same pattern as the existing `fields?`/`metadata?`
deviation note.

### 2. `completedGroups` typedef catch-up had no owner

**Type:** Design-vs-Task (same decision as #1)
**Source of truth:** task 14 already owns the `types.js` catch-up for the
review-10 #3 `fields?`/`metadata?` gap and runs before task 15 (Band 3:
22 → 14; Band 4: 15).
**Files affected:** `tasks/14-hook-phase-wrappers.md`
**Resolution:** Task 14's `types.js` Files entry extended to also add
`completedGroups` to the Plan typedef.

### 3. Design data flow never composes `completedGroups`

**Type:** Review-vs-Design (review-11 #2)
**Source of truth:** D3 `Plan.completedGroups` + task 15 planSubmit step 5
(loaded-vs-planned groups diff + `on_complete` join).
**Files affected:** `design.md` § Proposed data flow (PLAN phase)
**Resolution:** Added the compose step (diff + join, with the D3 pointer) and
added `completedGroups[]` to the PLAN output line
(`Plan { workflow, actions[], event, completedGroups[], trackerFires[], changeLog[] }`).
The data flow's post-hook `result` line already read `completed_groups` with
no producer upstream.

### 4. D2's post-hook input contradicts D6 / task 14

**Type:** Internal Contradiction (residual of review-10 #2)
**Source of truth:** review-10 #2 resolution → D6 + task 14 — post-hook input
is `LoadedState` + `Plan` + commit result **+ the tracker cascade's fire list**.
**Files affected:** `design.md` § D2 (post-hook phase)
**Resolution:** D2's input line gains "+ the tracker cascade's fire list (D6)".

### 5. Files-changed inventory missing the review-10 #8 / review-11 #6 dispositions

**Type:** Stale Reference (design inventory not updated by the actioning)
**Source of truth:** review-10 #8 (buildHookPayload relocation to
`shared/phases/`), review-11 #6 (`mergeFormOverrides` deleted per Q6;
`shared/getActions.js` deleted by task 15; `shared/getActionFields.js`
deleted by task 17) — all present in tasks 14/15/17, absent from the design's
Files-changed lists. Paths verified against the source tree.
**Files affected:** `design.md` § Files changed (New — `shared/phases/`,
Deleted)
**Resolution:** Added `buildHookPayload.js` (+ test) as relocated under
New — `shared/phases/` (and noted the cascade fire list on the
`invokePostHook.js` line); added `mergeFormOverrides.js`, `shared/getActions.js`,
`shared/getActionFields.js`, and the `buildHookPayload.js` relocation pointer
to the Deleted list with their owning tasks.

### 6. Task 2 (implemented) still asserts the tracker has no `none` row

**Type:** Stale vs resolved decision (Part 45 review-1 #2, recorded user
decision; applied to state-machine.md / design.md / task 17 but never
annotated back into task 2)
**Source of truth:** state-machine.md "Creation" (tracker `none` row:
`activate → action-required`, `block → blocked`) + task 17 Files (the
`tables.js` + `tables.test.js` flip).
**Files affected:** `tasks/02-fsm-tables-resolve-signal.md`
**Resolution:** Deviation note added at the `none`-row bullet: the tracker
exclusion was reversed post-implementation; task 17 owns the flip; the task's
exclusion text and assertions are as-implemented history.

### 7. Task 16 never states the cascade's fire-list return

**Type:** Review-vs-Task (review-11 #2)
**Source of truth:** review-11 #2 resolution — `tracker_fired` comes from
"`runTrackerCascade`'s returned fire list (today's shape:
`[{ parent_action_id, parent_workflow_id, new_status }]`)"; tasks 14/15 cite
"(task 14/16)" for a shape task 16 didn't define.
**Files affected:** `tasks/16-tracker-cascade.md`
**Resolution:** Added a bullet pinning the returned fire-list shape (today's
keys, `new_status` = FSM-resolved parent stage). Deliberately minimal — the
sketch-level asks (empty-plan skip branch, error accumulation, return
statement in the code sketch) are review-12 #3's **open** finding and were
not applied.

### 8. Task 17 missing the shared invocation-setup cross-reference

**Type:** Review-vs-Task (review-11 #3)
**Source of truth:** review-11 #3 resolution — "Task 17 composes via the same
shared step"; only task 15 carried the cross-reference.
**Files affected:** `tasks/17-start-cancel-close-rewrite.md`
**Resolution:** Notes bullet added: context composition + the
`{ event_id, now, newId }` mint come from task 15's shared invocation-setup
step — reuse, don't re-implement.

### 9. "Reviews 8–13 actioning" mislabel in task 21 + tasks.md

**Type:** Stale Reference
**Source of truth:** the review files (reviews 10–13 carried no annotations
at commit `8a9fddd`; consistency-14 verified) — the commit title overclaims.
**Files affected:** `tasks/21-entity-ref-key-catchup.md` (title + context),
`tasks/tasks.md` (row 21)
**Resolution:** Both corrected to "reviews 8–9", with a parenthetical in
task 21 noting the commit title's overclaim and the later actioning of 10–11.

### 10. tasks.md status notes frozen at the consistency-14 state

**Type:** Stale Status
**Source of truth:** the review folder (reviews 10–11 now actioned; 12–14
unactioned; review-14 + task 22 exist) and the task table (22 rows).
**Files affected:** `tasks/tasks.md` § Implementation Bands, § Scope
**Resolution:** "The 21 tasks" → "The 22 tasks"; the Scope review inventory
updated to reviews 1–11 + consistency-4/5/8/14 folded in, with the warning
repointed at reviews 12–13 (before Band 4) and review-14 (before Band 5).

## No Issues

Verified propagated with no drift:

### Review-10 (task 14 hook wrappers) ↔ design + tasks 9/14/15/19

- **#1 (`interaction`→`signal`):** task 14 envelope ("unchanged except" the
  two field fixes), signal-keyed hook resolution, task 19's `HOOK_SIGNALS`
  re-key (`submit`/`progress` in, `submit_edit` out) feeding both `emitHooks`
  and `emitEventOverrides`, design § "Modified — API + payload surfaces" all
  agree. (The resolution's task-20 demo-hook-body migration is moot — task 20
  is superseded; Part 45 re-authors the config in the new grammar.)
- **#2 (post-hook payload):** task 14 pins planned-doc `context` + the
  four-key `result` bag (no `dispatchErrors`); D6 and the data-flow post-hook
  lines match.
- **#3 (`fields`/`metadata` seeding):** state-machine.md path-3 grammar +
  semantics bullet carry it; D4 source 2, task 14 (passthrough + AC), task 15
  step 1, task 9 deviation note all agree.
- **#4 (resolves-to-current rule)** and **#6 (two error codes):** task 14
  specs both; D13 enumerates `prehook_redirect` / `invalid_prehook_response`.
- **#5 (`{ workflow_id, type }` deleted + strict key set):** state-machine.md
  grammar carries no `workflow_id` form (verified by grep); task 14 enforces
  the closed key set.
- **#7 (no try/catch / `UserError` reservation)** and **#8 (`buildHookPayload`
  relocation):** task 14 error-propagation block + Files; task 15 audit list.
  (Design inventory gap fixed — finding 5.)
- **#9 (`pre_hook_response` never null):** task 14 + task 15 both pin the
  single-valued normalized return.

### Review-11 (task 15 submit handler) ↔ design + tasks 14/15/16/17

- **#1 (`parent_workflow_id` + producer rule):** D3 producer rule, Schema
  additions (stamp mechanic + backfill stance), data-flow compose line,
  task 15 step 9, task 16 "fires arrive fully resolved", task 17 per-handler
  fire signals — all consistent.
- **#2 (six-key return + `completedGroups`):** task 15 pins the six keys with
  per-key producers; task 14's `result` bag cites `plan.completedGroups`; D3
  carries the field. (Typedef/sketch/data-flow stragglers fixed —
  findings 1–3.)
- **#3 (engine-context composition):** task 15 owns the full setup incl.
  async `getMongoDb`, `mongoDBConnection` drop. (Task 17 cross-ref added —
  finding 8.)
- **#4 (`now` read, not generated):** task 15's mint paragraph states it with
  the explicit warning.
- **#5 (test dispositions)** and **#6 (helper dispositions):** all three test
  files + four helpers have explicit dispositions in task 15; `getActions`
  deletion present; `getActionFields` pointer → task 17 Files. (Design
  Deleted-list gaps fixed — finding 5.)
- **#7 (planSubmit vs landed signatures):** steps 1–2 are entry composition
  (no orchestrator pre-resolution); merge-before-recompute order stated.
  (The list is now 1–10 after the #1/#2 resolutions added steps — the
  annotation's "renumbered 1–8" is historical, not a drift.)

### Task 22 / shipped `callApi` contract

Propagated everywhere: design § "The shipped `callApi` contract" (D9),
D3's no-notifications comment, data-flow commit steps 3–4
(`endpointId`-shaped calls), worked example, Connection-schema `endpoints`
property, module-manifest `notifications` dependency, task 13's preserved-as-
history deviation note pointing at task 22, task 14's shipped-contract call
shape, task 19's `_module.endpointId`-wrapping preservation, tasks.md row 22 +
Band 3 ordering (22 before 14). No live (non-history) text inspects
`result.success` or uses the `{ id, module }` form.

### Part 45 review-1 #2 (Start direct-seed + tracker `none`-row flip)

design.md § API + payload surfaces, task 17 (direct seed + runtime legal-seed
check + `makeWorkflowsConfig` restriction + `tables.js` flip in Files),
task 19, state-machine.md "Creation" — all aligned. (Task 2's stale exclusion
annotated — finding 6.)

### Earlier registers

Spot-checked against consistency-8/14: CAS workflow-first +
`updated.timestamp` scalar, `simple` FSM alias, interleaved unblock⇄recompute
fixpoint, `required_after_close` carve-out (task 9) vs lifecycle preconditions
(task 17), D13 error model, Q1–Q6 resolved markings, `entity_ref_key` thread
(tasks 4 → 6 → 21 → 12 → 17), uniform all-touched `action_ids` rule. Band
status notes (Bands 1–2 done; Band 3 tasks 9–13 + 21 done, 22 → 14 remaining)
agree with the landed source tree.
