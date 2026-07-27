# Consistency Review 8

## Summary

First consistency pass since reviews 5, 6, and 7 were actioned (consistency-5
predates them — it covered reviews 1–4). All 18 findings across reviews 5–7
carry resolution annotations, and the resolutions are propagated correctly
across `design.md` and the task files with five residual exceptions, all
auto-resolved: one cross-task type drift (`PreHookResult.upsert?` missing from
task 14), one error-model straggler (`TrackerCascadeDepthError` left outside
the D13 base class review-7 #4 established), two stale-inventory gaps
(design Files-changed missing files the resolutions introduced; tasks.md's
review-file inventory frozen at review-3), and one internal contradiction
(design Q1–Q5 still phrased as open "leans" while tasks.md declares Q1–Q6
resolved). No user decisions were required.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review-1.md` – `review-7.md`, `consistency-4.md`, `consistency-5.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01` – `tasks/20`
- **Plans:** none present.

## Inconsistencies Found

### 1. Task 14's `PreHookResult` shape omits `upsert?`

**Type:** Design-vs-Task drift (residual from review-4 #1)
**Source of truth:** review-4 #1 resolution → task 9's `PreHookResult` type
(`actions: [{ target, signal, upsert? }]`) and D4 source 2 / D13 (2).
**Files affected:** `tasks/14-hook-phase-wrappers.md`
**Resolution:** Task 14 — the wrapper that _validates_ the pre-hook response
shape — still declared the output as `{ actions: [{ target, signal }], ... }`,
so an implementer's validator would strip or reject the upsert-spawn entries
task 10 plans. Updated the output line to the task-9 type with `upsert?`, with
an explicit "the validator must accept and pass it through" note, and added
"optional `upsert: true` preserved through validation" to the AC.
(consistency-5 verified `upsert?` in task 09 but did not check task 14.)

### 2. `TrackerCascadeDepthError` left outside the D13 engine error model

**Type:** Review-vs-Design / Review-vs-Task drift (residual from review-7 #4)
**Source of truth:** review-7 #4 resolution → D13 engine error model: "Engine
throws share one base class in `shared/errors.js`," discriminated by `code`.
`ConcurrentSubmitError` was retrofitted (task 13, D13); `TrackerCascadeDepthError`
(D10 / task 16, defined back in review-1 #7) was not.
**Files affected:** `tasks/16-tracker-cascade.md`, `design.md` (D13)
**Resolution:** Task 16 now defines `TrackerCascadeDepthError extends
WorkflowEngineError` (`code: "tracker_depth_exceeded"`) in `shared/errors.js`
(base class from task 9), with the Files entry changed from a bare
"`TrackerCascadeDepthError` — create" to the `shared/errors.js` modify. D13's
named-class sentence now lists it alongside `ConcurrentSubmitError`.

### 3. Design "Files changed" inventory missing review-introduced files

**Type:** Stale Reference (design inventory not updated by review-6 #4 /
review-7 #4 resolutions)
**Source of truth:** review-6 #4 (relocation of `recomputeGroups.js` /
`deriveGroupStatus.js` to `shared/phases/planners/` by task 9), review-7 #4
(`shared/errors.js` created by task 9), tasks 15/16 (`planSubmit.js`,
`planTrackerLevel.js` — the latter named in D10 prose but absent from the
inventory).
**Files affected:** `design.md` § Files changed
**Resolution:** Added to the `shared/phases/` section: `planSubmit.js`,
`planners/planTrackerLevel.js`, the relocated `recomputeGroups.js` /
`deriveGroupStatus.js` (+ tests), and a "Plus, one level up at `shared/`"
entry for `errors.js` (base class + the two extending classes).

### 4. Design Q1–Q5 still read as open "leans"; tasks.md declares all resolved

**Type:** Internal Contradiction (stale status)
**Source of truth:** `tasks/tasks.md` ("Q1–Q6 are all resolved in the design
and baked into the relevant tasks as decisions") and the tasks that adopted
each lean verbatim: Q1 whole-doc (task 13 notes), Q2 throw (task 10, D13 (3)),
Q3 no cleanup (task 10 notes), Q4 option (b) document + CAS (task 15 notes),
Q5 workflow-level events only (task 17 AC). Q6 alone was already marked
RESOLVED in the design.
**Files affected:** `design.md` § Open questions
**Resolution:** Marked Q1–Q5 headings "(RESOLVED — …; task N.)" mirroring Q6's
style, changed each "Lean:" to "Resolved:", and replaced the section intro
("Resolve before tasking…") with "All six are resolved; each decision is baked
into the task noted in its heading." Analysis text preserved.

### 5. tasks.md review-file inventory frozen at review-3

**Type:** Stale Reference
**Source of truth:** the review folder (reviews 1–7, consistency-4/5 exist;
reviews 4–7's resolutions were actioned directly into the task files).
**Files affected:** `tasks/tasks.md` § Scope
**Resolution:** "Review files skipped" updated to list reviews 1–7 +
consistency-4/5, noting all review decisions are already folded into
`design.md` and the task files.

## No Issues

Verified propagated with no drift:

### Review-5 (task 10 input contracts) ↔ design + tasks 9/10/11/12/15

- **#1 (`event_id`/`now`/`newId` injection):** task 10's input is
  `{ action, signal, payload, actionConfig, loadedWorkflow, event_id, now, newId }`
  with the minted-once-injected rule; task 15 mints `{ event_id, now, newId }`
  at handler entry via a shared invocation-setup step; task 12 says
  `planEventDispatch` **receives** the per-invocation `event_id`; the design
  test-strategy input list matches.
- **#2 (`loadedWorkflow`, not `plannedWorkflowDoc`):** task 10 reads only the
  immutable `workflow_type` off the loaded doc with the chicken-and-egg note;
  design test-strategy input list matches.
- **#3 (unblock composed via `planActionTransition`):** task 10's
  `planAutoUnblock` bullet states the full-composition delegation and the
  reused `event_id`/`now`.
- **#4 (delta vs community-schema boundary + top-level `plan.changeLog`):**
  task 10 emits only the raw delta; task 12 names its inputs and owns the
  transform; the `Plan` type carries top-level `changeLog: ChangeLogEntry[]`
  in both D3 and task 9, with the distinguishing comments.
- **#5 (`payload.metadata` source):** named in task 10.

### Review-6 (task 11 behaviour preservation) ↔ design + tasks 9/10/11/15

- **#1 (`total > 0` guard):** stated in task 11 (plan bullet + AC) and
  design (worked-example step 7 + test-strategy); empty-workflow test case
  spec'd.
- **#2 (already-`completed`/`cancelled` idempotency guard):** full guard in
  task 11 + design; both old test cases carried over.
- **#3 (`mergeWith` purity / `cloneDeep`):** task 11 requires
  `mergeWith(cloneDeep(base), …)`, no-input-mutation for both planners, and
  "does not mutate `loadedState`" assertions in both test specs; design Q6
  implementation note matches.
- **#4 (shared `recomputeGroups` helper):** task 9 owns the relocation;
  tasks 10 and 11 both import the shared helper (neither reimplements nor
  exports); tasks.md dependency table + Band 3 parallel-safe claim stand;
  task 15's cleanup list notes the relocation is already done; design D4
  fixpoint paragraph names the shared helper.
- **#5 (`params.current_key`):** task 11 names the submit param with the
  action-doc `key` equivalence.
- **#6 (deep three-channel pre-merge):** task 11 and design Q6 state the
  uniform deep rule (old `mergeFormOverrides.js` spread not preserved);
  `a.b`/`a.c` cross-channel test case spec'd.

### Review-7 (task 9 load gate) ↔ design + tasks 5/9/13/17

- **#1 (`current_app` ← `context.connection.app_name`):** in task 9, with the
  gate/`planEventDispatch` agreement note.
- **#2 (`payload.signal` named):** in task 9's gate bullet.
- **#3 (JS gate inputs, fail-closed):** in task 9, mapped to task 5
  categories 4–5; `gates.fixtures.js` test required.
- **#4 (engine error model):** D13 defines `WorkflowEngineError` + codes;
  task 9 creates `shared/errors.js` and names the load-phase codes +
  `access_denied` distinguishability; task 13 extends with
  `ConcurrentSubmitError` (no `UserError.js` pointer remains); `UserError`
  reserved for pre-hook rejects (task 14). (Straggler: finding 2 above.)
- **#5 (gate replaces `access.roles`):** stated in task 9 with the
  `handleSubmit.js:104` anchor.
- **#6 (`targetAction` convenience alias):** noted in task 9 with the consumer
  chain (task 10 `action` input via task 15).
- **#7 (config lookups named; lifecycle preconditions in task 17):** task 9
  names the lookups and scopes the stage check to Submit; task 17 records the
  verified Close/Cancel/Start semantics incl. `stage_rejects_close` (also in
  D13).

### Reviews 1–4 and concept alignment

Spot-checked against consistency-5's register (which verified them in full):
CAS workflow-first + `updated.timestamp` scalar; `simple` kind naming +
FSM alias; `none` creation row + upsert spawn; interleaved
unblock⇄recompute fixpoint; `required_after_close` carve-out; `mongodb`
peer dep (task 01); change-log request-context parity (task 12); lifecycle
event contexts (task 12/17); unprefixed derived ids + `workflow-` fixed
pages (tasks 6/18); shared role-gate oracle (tasks 5/7/8/9);
`notification_roles` → Part 41 non-goal; no action-doc backfill (task 20).
No reopened decisions in reviews 5–7. Tasks 1–8, 18–20 carry no references
to the pre-review contract shapes (no `plannedWorkflowDoc` input, no
"produces the event_id", no bare-formula auto-complete).
