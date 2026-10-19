# Consistency Review 16

## Summary

First consistency pass since reviews 12–15 were actioned (consistency-15
covered through reviews 10–11) and since the design.md cleanup commit
(`0f05eea`) extracted `carried-surfaces.md` / `worked-example.md`. All ~20
findings across reviews 12–15 carry resolution annotations, and the
resolutions are propagated correctly across `design.md`, the supporting
files, the task files, and the landed Band-3/4 code, with five residual
exceptions — all auto-resolved: one D10-sketch field the review-13 #4
`fire.payload` decision missed (the design copy of the cascade loop), one
stale interim-id reference in task 3's Context (`workflow-simple-*` vs the
review-14 #1 final `workflow-action-*` ids its own AC already carries), the
tasks.md row-18 summary still echoing the read-switch review-14 #3 dropped,
the tasks.md § Scope review inventory frozen at the pre-review-14/15 state
(and silent on the new unactioned review-16), and a satisfied-but-stale
tasking note in carried-surfaces.md. No user decisions were required.

**Out of scope, flagged:** review-16 (5 findings against task 19 + adjacent
resolver surfaces — `makeWorkflowsConfig`'s un-re-keyed `HOOK_INTERACTIONS`
hard-erroring signal-keyed configs at build, payload-mapping completeness
(`action_id`/`current_key`/`fields`), the "drops `force`" wording, the start
`metadata` consumer gap, the unverifiable "`signal` is documented" AC)
carries **no resolution annotations** — it is not actioned, and its
recommendations are deliberately _not_ treated as decisions by this pass.
`tasks/tasks.md` now warns: action review-16 before implementing task 19 /
Band 5.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `carried-surfaces.md`, `worked-example.md`
- **Reviews:** `review-1.md` – `review-16.md`, `consistency-4.md`,
  `consistency-5.md`, `consistency-8.md`, `consistency-14.md`,
  `consistency-15.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01` – `tasks/23`
- **Plans:** none present.
- **Cross-checked external surfaces:** landed engine code
  (`shared/phases/runTrackerCascade.js` / `planTrackerLevel.js` —
  `payload: {}` hardcoded, confirming tasks.md's "16 landed without the
  passthrough"; `planActionTransition.js` / `planWorkflowRecompute.js` — no
  `seedStage` / `lifecyclePush` yet; `fsm/tables.js` — tracker still has no
  `none` row — all three confirming task 23 is genuinely pending);
  `modules/shared/workflow/visible_verbs.yaml` (exists on disk, confirming
  carried-surfaces' shared-stage factoring claim); Part 40 D4 (rewritten
  per review-14 #4 — cites the view-page link fix), Part 43 design
  (scope-change note per review-14 #1 — pure kind sweep, page ids out of
  scope), Part 42 D5 / files-changed (owns the `visible_verbs.yaml`
  re-parameterization and `resolve_action_link.yaml`); git history
  (review-15 annotated in the task-22 implementation commit `0e28910`;
  review-14 actioned in `35a7476`; review-16 written unactioned in
  `18d70e3`).

## Inconsistencies Found

### 1. design.md's D10 cascade sketch missing the `fire.payload` passthrough

**Type:** Design-vs-Task (residual of review-13 #4)
**Source of truth:** review-13 #4 resolution — fire entries gain optional
`payload: { fields }`, forwarded by `planTrackerLevel` into
`planActionTransition`'s `payload.fields`; the D3 `trackerFires` typedef and
task 16's sketch both carry it, and review-12 #3 pinned the two sketch
copies (task 16 + D10) as duplicates.
**Files affected:** `design.md` § D10 (the `planTrackerLevel` call in the
loop sketch)
**Resolution:** Added `payload: fire.payload, // optional — Start's child
link fields (task 17)` to the design copy, matching task 16's sketch
verbatim.

### 2. Task 3's Context still names the interim `workflow-simple-*` ids

**Type:** Stale Reference (residual of review-14 #1)
**Source of truth:** review-14 #1 resolution — final ids are
`workflow-action-view/edit/review`; task 3's own acceptance criteria
(updated by the actioning) already carry them, contradicting the Context
paragraph two sections above.
**Files affected:** `tasks/03-render-layer.md` (Context)
**Resolution:** Context now names `workflow-action-view/edit/review` with a
parenthetical that task 18 flips the implemented interim `workflow-simple-*`
strings (the catch-up task 18's Notes already own).

### 3. tasks.md row 18 summary echoes the dropped `message`/`links` read-switch

**Type:** Stale Reference (residual of review-14 #3)
**Source of truth:** review-14 #3 resolution — task 18's group-overview
scope shrank to rename + reference updates; the page-side reads are
unchanged and the `.links` map is the one thing the page must _not_ read
(Part 42 D5 owns the server-side link resolution).
**Files affected:** `tasks/tasks.md` (task table row 18)
**Resolution:** Summary rewritten to "Rename fixed pages
(`workflow-group-overview`, final `workflow-action-*`) + `_module.pageId`
refs + link table".

### 4. tasks.md § Scope frozen at the pre-review-14/15 state; review-16 unmentioned

**Type:** Stale Status
**Source of truth:** the review folder + git history — review-14 actioned
(`35a7476`), review-15 actioned in the task-22 implementation commit
(`0e28910`); review-16 written (`18d70e3`) with no annotations.
**Files affected:** `tasks/tasks.md` § Scope
**Resolution:** Inventory updated: consistency-15 added to the folded-in
list; "Reviews 14–15 are written but not yet actioned" replaced with
"Reviews 12–15 are actioned" (naming where each landed); a new warning
flags review-16 as unactioned, to be actioned before implementing task 19 /
Band 5.

### 5. carried-surfaces.md tasking note still phrased as a pending instruction

**Type:** Stale Status
**Source of truth:** `tasks/tasks.md` Band 2 — the access-model cluster
(tasks 5–8) exists and is implemented, which is exactly the split the note
instructed `r:design-task` to make.
**Files affected:** `carried-surfaces.md` § D16 (tasking note)
**Resolution:** Rephrased to past tense, naming tasks 5–8 / Band 2 as the
realized split.

## No Issues

Verified propagated with no drift:

### Review-12 (tracker cascade) ↔ design + tasks 15/16

- **#1 (per-level mint):** fresh `event_id` per level, `now` passes through
  (one stamp per user action), `newId` passes through — both sketch copies,
  D10 prose, task 16 bullet, and `planTrackerLevel`'s widened signature all
  agree.
- **#2 (bounded per-level CAS retry):** `MAX_ATTEMPTS = 3`, full fresh
  load→plan→commit per attempt, exhaustion → `{ fire, error }` recorded +
  continue, D15 exception note ("tracker levels are the only auto-retry
  site"), `TrackerCascadeDepthError` + unclassified propagate — consistent
  across D10/D13/D15, task 16, and the data flow.
- **#3 (sketch + return shape):** `{ fires, dispatchErrors, cascadeErrors }`
  return, `levelPlan === null` no-op convention, `fired` entry in today's
  `{ parent_action_id, parent_workflow_id, new_status }` shape — sketch
  copies match (after finding 1's fix); task 15's end-of-invocation throw
  keys on either error list; D13's `post_commit_dispatch_failed` sentence
  names both lists.
- **#4 (gone-parent policy):** record-and-continue with the
  deliberate-deviation note (vs today's silent `if (!tracker) return []`),
  `missing_target` thrown by the planner / policy owned by the loop —
  task 16 + D10 + D13 agree; AC carries the distinct missing-parent test.
- **#5 (producer recursion):** D3 producer rule + `parent_workflow_id`
  schema addition; task 16 Notes pin fires arriving fully resolved and the
  constant next-level signal.
- **#6 (file home):** `shared/phases/runTrackerCascade.js` relocation in
  task 16, design Files-changed (both the shared/phases list and the
  "Rewritten" entry), and tasks.md Band-4 notes; `CHILD_STAGE_MAP`
  death note with the only-importer correction.

### Review-13 (Start/Cancel/Close) ↔ design + tasks 10/11/16/17/19/23

- **#1 (direct seed + `seedStage`):** task 17 Start plan bullet, task 10's
  "(added by task 23)" mirror, design's start-workflow.yaml bullet
  (`seedStage` mode, legal seeds, `none` row = pre-hook spawn only),
  task 23 implementation home, legal-seed enforcement split (build-time
  `makeWorkflowsConfig` + runtime throw) and migration sentence — all
  aligned.
- **#2 (Close sweep exception):** task 17 pins the `required_after_close`
  filter + blocked-action exception, Cancel unconditional, the
  reachability rationale, and the survive-then-post-close-submit test.
- **#3 (`lifecyclePush`):** task 17 mechanism paragraph, task 11's
  "(added by task 23)" mirror, design planner-list entry, task 23 spec
  (skip-entirely semantics), per-handler fire signals (Cancel `_cancelled`,
  Close `_completed` with the forced-completion rationale) in D3 + task 17;
  exactly-one-entry Cancel test in AC.
- **#4 (Start push via cascade):** in-plan remnant gone (task 17 explicitly
  states the parent transition is _not_ in Start's plan, per-aggregate
  rationale); `payload: { fields }` on the fire in D3 typedef + task 16 +
  task 17; the two behaviour deltas (mirror event, parent recompute) owned
  in task 17's AC.
- **#5 (pinned stages):** Close pushes `completed`, Start seeds `active`,
  Cancel `cancelled`; D12's lifecycle comment reads the real stage names;
  `event_id` on lifecycle entries; `payload.reason` carryover.
- **#6 (payload/return surfaces):** task 17 "Payload and return surfaces"
  paragraph (`references` merge, per-handler returns incl. Start's new
  `event_id`); task 19 extends `start-workflow.yaml`'s `:return`; the Close
  idempotent no-op carve-out in both task 17's AC and design § "Engine entry
  points emit events".
- **#7 (Start's load mechanism):** named (`workflowsConfig.find` +
  `findDocs`, not `loadWorkflowState`); Cancel's `workflow_not_found`
  tightening owned as the deliberate exception; `getActionFields.js`
  deletion homed in task 17 Files.

### Review-14 (display renames) ↔ design + supporting + tasks 3/6/18

- **#1 (`workflow-action-*` finals):** design ¶13/¶14, § Modified — display
  surfaces, carried-surfaces D14/D16, worked-example link maps, task 18
  (targets, criteria, catch-up scope incl. the task-10 fixture sites),
  task 3 AC — all carry the final ids. Part 43's design carries the
  scope-change note; Part 40 references the final ids. (Task 3's Context
  straggler fixed — finding 2.)
- **#2 (glob reconciliation mooted):** task 18 Notes state no additional
  reserved name is needed; task 6's `workflow` reservation stands.
- **#3 (group-overview scope shrunk):** task 18 rename-only scope, reworded
  AC 4, interim broken-link window stated in Notes. (tasks.md row echo
  fixed — finding 3.)
- **#4 (simple-kind `error`-verb → view page):** task 18 instruction + AC +
  Files (incl. the test line), task 3 AC mirror, Part 40 D4 rewritten to
  cite the actual fix.
- **#5 (files-list gaps):** `actions-on-entity.yaml` in task 18 Files;
  grep criterion scoped to the module tree with the demo exemption.

### Review-15 (task 22) ↔ task 22 + adjacent

- **#1 (InternalApi):** task 22 item 4 + AC assert `emitHookApi` /
  `emitGroupOnCompleteApi` flip to `InternalApi`, submit Api stays `Api`,
  with the security rationale and `send-notification` precedent.
- **#2 (invoker docstrings):** item 7 fixes both headers' inverted
  rationale.
- **#3 (un-mocked wiring check):** the built-demo-artifact criterion is in
  task 22's AC with the no-existence-check rationale.
- **#4 (fixture/snippet details):** criterion 9's `connection.endpoints`
  stubs (naming the commitPlan failure mode), item 2's `properties:`
  nesting, item 1's events-dependency description extension.

### Landed-code state ↔ tasks.md Band 4

`seedStage` / `lifecyclePush` absent from the landed planners, tracker
`none` row absent from `tables.js`, `planTrackerLevel` passing a hardcoded
`payload: {}` — all confirming tasks.md's "Remaining: 23 → 17" and task 23's
reconcile clause. Band status notes (Bands 1–3 done; 15/16 done; deferred-
deletion ledger) agree with the source tree.

### Earlier registers

Spot-checked against consistency-15's register: the shipped `callApi`
contract (design § D9, D3 no-notifications comment, data-flow steps 3–4,
worked-example commit block, connection-schema `endpoints`, manifest
`notifications` dependency, task 13's preserved-as-history deviation note),
`completedGroups` thread (D3 → task 15 step 5 → task 14 result bag),
`entity_ref_key` thread (tasks 4 → 6 → 21 → 12 → 17), CAS workflow-first +
`updated.timestamp` scalar, `simple` FSM alias, Q1–Q6 resolved markings,
uniform all-touched `action_ids` rule. No reopened decisions in reviews
12–15.
