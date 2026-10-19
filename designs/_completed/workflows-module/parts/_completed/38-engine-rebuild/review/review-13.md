# Review 13 — Task 17: Start / Cancel / Close rewrite

Scope: `tasks/17-start-cancel-close-rewrite.md`, verified against the three
handlers it rewrites (`StartWorkflow.js`, `CancelWorkflow.js`,
`CloseWorkflow.js`), the landed Band-2/3 code (`fsm/tables.js`,
`planActionTransition.js`, `planWorkflowRecompute.js`, `loadWorkflowState.js`),
design.md (D2, D3, D10, D12, D13, "Modified — API + payload surfaces"),
state-machine.md, tasks 9–13, 15, 16, 19, the module API surfaces
(`modules/workflows/api/start-workflow.yaml` / `cancel-workflow.yaml` /
`close-workflow.yaml`), Part 45 review-1, and existing app workflow configs.

Prior coverage checked and not repeated: review-11 #1 / review-12 #5
(`trackerFires` producer + `parentWorkflowId` resolution — still open;
finding 4 below is task 17's slice of it, not a re-file), review-11 #2
(Submit return payload — the lifecycle-handler half lands here as finding 6),
review-11 #3 (engine-context setup shared with task 17 — resolved),
review-12 #6 (`getActionFields.js` disposition pointer — carried in
finding 7), review-4 #3 / review-7 #5 (`required_after_close` **submit-gate**
carve-out — resolved into task 9; finding 2 below is the distinct **sweep**
half), review-6 (auto-complete idempotency guard on re-submits — finding 3
below is a different interaction of the same guard), consistency-8 #7
(lifecycle preconditions recorded in task 17 — confirmed present).

## Stale against resolved decisions

### 1. The Start section contradicts the design's resolved direct-seed decision — the Part 45 resolution that claims to have amended this task was not applied

> **Resolved.** Most of the listed edits landed between this review and now (direct-seed rewrite, legal-seed grammar + build/runtime validation, the tracker `none`-row flip homed in this task's Files). The residuals resolved here: the seeding mechanism is now concrete — `planActionTransition` gains a **`seedStage` mode** (mutually exclusive with `signal`, insert-only, bypasses the `upsert` gate, skips `resolveSignal`, all downstream composition unchanged — one composition site, no hand-built drafts), specced in task 17, mirrored in task 10 and design.md:738, implemented by the task-23 catch-up (landed-code change); and a migration sentence added to task 17 (existing configs seeding out-of-set stages, e.g. `in-review`, must re-author — the build-time check breaks loud).

Part 45 review-1 #2 is marked **Resolved** with: `starting_actions` /
`start-workflow` `actions:` keep the `{ type, status }` grammar; "task 17's
Start planner seeds drafts **directly at the declared status** (legal seeds:
`action-required`, `blocked`)"; and — a recorded user decision — the tracker
`none`-row exclusion is **reversed** (`none → activate/block` added to the
tracker table). The resolution note says it updated "state-machine.md (tracker
table + 'Creation' section), Part 38 design.md:658, task 17 (Start plan +
payload line + `tables.js`/`tables.test.js` flip), task 19, and [Part 45's]
D3." Only design.md:658 actually carries the change. Task 17 still says the
opposite on both points:

- Line 12: initial drafts "via `planActionTransition` with
  `operation: "insert"`". The landed planner has **only** the signal path:
  a null target requires `upsert: true` and resolves the signal against the
  FSM `none` pseudo-row (`planActionTransition.js:73–98`). There is no
  "seed at a declared status" mode, and for a tracker the `none` row doesn't
  exist in the landed table (`tables.js:100–102`), so Start structurally
  cannot create the drafts the task describes.
- Line 14: "document `signal` as the replacement for the implicit 'what
  status do we start in' path" — the reverse of the resolved decision
  (design.md:658: "the `actions:` payload override keeps the
  `{ type, status }` grammar … creation at workflow start is not an FSM
  transition").

Fix — rewrite the Start plan bullet and payload line to the resolved
decision, and give the two homeless pieces owners:

- **Seeding mechanism.** Spec it concretely: either a `seedStage` mode on
  `planActionTransition` (skip `resolveSignal`, otherwise identical) or a
  thin `planStartingAction` wrapper. Note the drafts need the planner's full
  composition either way — `access`/`workflow_type` denormalisation,
  status_map render at the seed stage, `computeEngineLinks`
  (`planActionTransition.js:103–161`) — so "build the doc by hand like
  today's `createAction`" is the wrong implementation.
- **The tracker `none`-row flip.** Task 2 is implemented, so the
  `tables.js` + `tables.test.js` + state-machine.md edits (which still
  carries the exclusion text at its "Creation" section) need a task home —
  this task is the natural one since its Notes already instruct an FSM-table
  check ("`internal_cancel_action` must exist … task 2").
- **Legal-seed validation + migration note.** "Legal seeds:
  `action-required`, `blocked`" narrows what today's handler accepts —
  current `StartWorkflow.js:97–99` counts `not-required` drafts, and an
  existing app's config seeds a starting action at `in-review`
  (`starting_actions: [{ type: review-approve, status: in-review }]`). Say
  where out-of-set seeds are rejected (build-time in `makeWorkflowsConfig`
  for `starting_actions`; runtime throw for `payload.actions`) and that
  existing configs seeding other stages must migrate — or widen the legal
  set deliberately. Don't leave it for the implementer to discover.

### 2. Close drops the `required_after_close` sweep exception — which also kills the submit carve-out task 9 just restored

> **Resolved (auto).** Task 17's Close section now keeps today's sweep filter explicitly — sweep only non-terminal actions where `required_after_close !== true` OR currently `blocked` (the blocked-action exception), survivors stay at their stage — with the reachability rationale (empty form-FSM `not-required` row means a swept action never moves again, killing the D2/task-9 carve-out). Cancel's sweep is stated as unconditional (today's behaviour). AC gains the survive-then-post-close-submit test case.

Today's Close does **not** sweep non-terminal actions whose config declares
`required_after_close: true` (unless they sit at `blocked` — the
blocked-action exception): `CloseWorkflow.js:66–71` builds the per-type map,
`:116–121` filters the sweep. Task 17 line 22 says Close is "same shape as
Cancel", and line 19 / AC line 32 say "mark all **non-terminal** actions
`not-required`" — the exception is silently gone, contradicting the task's
own "Preserve today's actual semantics, no new guards" (line 24).

This isn't just a semantics drift — it makes another restored behaviour
unreachable. Review-4 #3 restored the load-phase carve-out: a
`completed`/`cancelled` workflow accepts a submit when
`actionConfig.required_after_close === true` (D2, task 9, implemented in
`loadWorkflowState`). But if Close sweeps those actions to `not-required`,
the carve-out can never fire: the form FSM's `not-required` row is empty
(`tables.js:97` — `'not-required': {}`), so no signal ever moves the action
again. The two surfaces only make sense together.

Fix: spec Close's sweep filter explicitly — non-terminal AND
(`required_after_close !== true` OR currently `blocked`) — and state that
Cancel sweeps unconditionally (today's behaviour, `CancelWorkflow.js:71–96`
has no such filter). "Same shape as Cancel" needs the one-line caveat. Add a
test case: close a workflow with a non-terminal `required_after_close`
action → action survives at its stage → post-close submit on it succeeds.

## Planner interactions

### 3. "Sweep → recompute → push cancelled" triggers the auto-complete push — spurious `completed` entry and a wrong tracker mirror

> **Resolved.** Both halves. (1) `planWorkflowRecompute` gains an optional `lifecyclePush: { stage, reason }` input — when present the auto-complete check is skipped entirely and the planner pushes the declared entry instead (single entry-composition site; carries `event_id`/`created`/`reason`). Cancel passes `{ stage: "cancelled", reason }`, Close `{ stage: "completed", reason }`; Submit/tracker levels omit it. Specced in task 17, mirrored in task 11 and design.md's planner list, implemented by the task-23 catch-up (landed-code change); exactly-one-entry Cancel test added to AC. (2) Fire signals pinned per handler: Cancel → `internal_mirror_child_cancelled`, Close → `internal_mirror_child_completed` — a user decision **amending** review-11 #1's recorded "Cancel/Close: `_cancelled`" (close is forced completion: the child's status reads `completed`, so the parent tracker lands `done` per today's `CHILD_STAGE_MAP`); D3, task 17, and the review-11 #1 annotation corrected.

Task 17 line 19 orders Cancel's plan: "mark all non-terminal actions
`not-required` …; recompute; push `cancelled`". The landed
`planWorkflowRecompute` auto-completes when all planned actions are terminal
and the **loaded** workflow stage is not `completed`/`cancelled`
(`planWorkflowRecompute.js:69–83`). During a Cancel of an active workflow,
the sweep makes every action terminal and the loaded stage is `active` — so
the recompute pushes `completed` (stamped with the lifecycle `event_id`),
and the handler then pushes `cancelled` on top. Result: a phantom
`completed` entry in the status history of a workflow that was cancelled,
plus whatever fire-producer rule lands from review-11 #1 ("fire iff the
recompute pushed `completed`") emitting `internal_mirror_child_completed` —
the parent tracker mirrors to `done` instead of `not-required`.

Close has the twin problem: it pushes `completed` itself, and the recompute
_also_ pushes `completed` → duplicate entries (except when a
`required_after_close` survivor keeps `allTerminal` false — exactly the
finding-2 case — which is why Close can't simply delegate its push to the
recompute).

Fix — pick the mechanism and write it down in this task (and mirror in
task 11's planner doc if its signature changes):

- Cleanest: `planWorkflowRecompute` gains an opt-out
  (`suppressAutoComplete: true`, or a `lifecyclePush: { stage, reason }`
  input that replaces the auto push), used only by Cancel/Close.
- Then pin the per-handler fire signals so the producer rule doesn't
  misfire: Cancel → `internal_mirror_child_cancelled`, Close →
  `internal_mirror_child_completed`, both iff
  `workflow.parent_action_id != null` (today's `newStage` argument,
  `CancelWorkflow.js:134–138` / `CloseWorkflow.js:174–178`). The task
  currently names no signal for either handler — "Commit; tracker cascade"
  is the whole spec.
- Test case: Cancel an active workflow → status history gains exactly one
  new entry (`cancelled`), parent tracker lands `not-required`.

### 4. Start's parent-tracker push: in-plan and via-cascade are both stated, and neither works as specced

> **Resolved.** Cascade route (already settled by review-11 #1's D3 producer rule between this review and now); the residuals fixed here: task 17's in-plan remnant ("Plus optional parent-tracker transition") removed with an explicit per-aggregate rationale; fire entries gain optional `payload: { fields }` — Start's fire carries the child link fields (`child_workflow_id`, `child_entity_id`, `child_entity_collection`), `planTrackerLevel` forwards it into `planActionTransition`'s `payload.fields` (D3 typedef, task 16 sketch + bullet, task 17 fires paragraph). The two behaviour deltas are owned in task 17's AC: parent timeline gains `action-internal-mirror-active` (today's push is silent) and parent `groups[]`/`summary` recompute (today's push leaves them stale). The pure `parentWorkflowId` resolution from the loaded parent action was already folded into D3.

Line 12 puts "optional parent-tracker transition" **in Start's plan**;
line 13 routes "the parent-tracker push → `runTrackerCascade`". These are
different mechanisms with different problems:

- **In-plan:** the parent action belongs to a _different_ workflow — a
  cross-aggregate write. Start's commit has no CAS claim on the parent
  workflow and no parent recompute, so the parent's `groups[]`/`summary`
  go stale (the tracker leaving `blocked`/`action-required` →
  `in-progress` changes its group's derived status). Today's code has
  exactly this staleness (`updateAction` with no recompute,
  `StartWorkflow.js:117–129`); the rebuild's own machinery fixes it for
  free if the push runs as a cascade level — and D3/D10 say the Plan is
  per-aggregate, which an in-plan parent write violates.
- **Via cascade:** `planTrackerLevel`'s specced signature is
  `(levelLoaded, { parentActionId, signal })` (task 16 lines 19, 30–34) —
  no channel for the link fields today's push sets (`child_workflow_id`,
  `child_entity_id`, `child_entity_collection`,
  `StartWorkflow.js:120–125`). The mirror would transition the parent but
  never link it to the child.

Fix: route it through the cascade (one mechanism — the same argument
review-12 #5 makes), with the fire entry gaining an optional
`payload: { fields }` that `planTrackerLevel` forwards to
`planActionTransition` (which already accepts `payload.fields`,
`planActionTransition.js:42–43`). Name the signal
(`internal_mirror_child_active`; FSM lands `in-progress` from
`blocked`/`action-required`/`done`/`not-required`, `tables.js:103–127`,
matching today's forced `in-progress`). Two consequences to state
explicitly: Start uniquely _can_ resolve `parentWorkflowId` purely (its
load reads the parent action doc, which carries `workflow_id`) — fold that
into review-11 #1's resolution; and the parent's timeline now gains an
`action-internal-mirror-active` event where today the push is silent —
consistent with cascade levels, but it's new emission the AC should own.
Update task 16's fire shape in the same stroke.

## Smaller gaps

### 5. Pin the pushed stages — "same shape as Cancel" plus D12's comment invites `stage: "closed"`

> **Resolved (auto).** Task 17 now pins all three: Close pushes **`completed`** (not `closed`, with the consumer-breakage rationale), Start seeds **`active`**, Cancel pushes `cancelled`. Added: lifecycle status entries carry the invocation `event_id`, and `payload.reason` still lands on the entry. design.md's D12-adjacent comment fixed from "(status pushed: started/cancelled/closed)" to the real stage names.

Nowhere does task 17 say Close pushes **`completed`**
(`CloseWorkflow.js:78–82`) and Start seeds **`active`**
(`StartWorkflow.js:82`). The surrounding signals all point the wrong way:
the event is `workflow-closed`, Close is "same shape as Cancel" (which
pushes the stage matching its event name), and design.md D12's
lifecycle-context comment reads "(status pushed: started/cancelled/closed)"
— two of those three stage names don't exist. An implementer pushing
`closed` breaks every `status.0.stage === 'completed'` consumer (the D2
load gate, the recompute guard, `get-entity-workflows`). One sentence in
the task; fix the D12 comment too. While here: state that the lifecycle
status entries carry the invocation `event_id` (the landed recompute already
stamps it on its `completed` push, `planWorkflowRecompute.js:80`; today's
lifecycle entries carry none) and that `payload.reason` still lands on the
entry (`CancelWorkflow.js:49–53`).

### 6. Payload and return surfaces are unpinned — `references`, `reason`, and the `:return` keys

> **Resolved.** Task 17 gains a "Payload and return surfaces" paragraph: `payload.references` merges into the planned workflow doc (Start spread at insert; Cancel/Close minus `RESERVED_WORKFLOW_KEYS`, the filter now applied at plan time); returns pinned per handler — Start `{ workflow_id, action_ids, event_id }` (**user decision: `event_id` added** for a uniform surface; task 19 extends `start-workflow.yaml`'s `:return` + AC), Cancel/Close `{ action_ids, event_id, tracker_fired }` with `event_id` real and `tracker_fired` from `runTrackerCascade`'s `fires` (task 16). The Close idempotent-no-op carve-out is reconciled in both places: task 17's AC ("exactly one lifecycle event… except Close's idempotent no-op") and design.md's "Engine entry points emit events" intro. (`payload.reason` landing on the status entry was pinned under #5.)

The module API yamls fix the wire contract: `start-workflow.yaml` maps
`{ workflow_id, action_ids }`; `cancel-workflow.yaml` / `close-workflow.yaml`
map `{ action_ids, event_id, tracker_fired }` and pass
`reason` + `references` in. Task 17 mentions none of it:

- `payload.references` — Start spreads it into the workflow doc
  (`StartWorkflow.js:74–75`); Cancel/Close `$set` it minus
  `RESERVED_WORKFLOW_KEYS` (`CancelWorkflow.js:5–18, 44–47`). The plan
  bullets don't carry it, so the rebuilt planned workflow doc silently
  drops it. Say it merges into the planned doc (same reserved-key filter).
- Return shapes — pin them per handler: Start
  `{ workflow_id, action_ids }` (+ now a real `event_id`? the yaml's
  `:return` must be extended in task 19 if so — decide); Cancel/Close
  `{ action_ids, event_id, tracker_fired }` with `event_id` now real
  (today hardcoded `null`) and `tracker_fired` from `runTrackerCascade`'s
  return (shape per review-12 #3). This is the lifecycle half of
  review-11 #2.
- The Close idempotent no-op (completed → early return,
  `CloseWorkflow.js:52–54`, preserved by line 24) emits **no** event —
  reconcile with AC line 31 ("each emits exactly one lifecycle event") and
  proposal #11's "every engine handler invocation produces exactly one
  `event_id`": one carve-out sentence ("…except Close's idempotent no-op,
  which returns the empty result without an event") in both places.

### 7. Start's load phase can't be `loadWorkflowState` — say what it is

> **Resolved (auto).** Start's load bullet now names the mechanism: not `loadWorkflowState` (throws `workflow_not_found`; no workflow exists yet) — own reads via `workflowsConfig.find(type)` + `findDocs` for the optional parent action. Cancel's load bullet names `loadWorkflowState` `{ workflowId }` mode and owns the `workflow_not_found` tightening as the deliberate exception to "no new guards". `getActionFields.js` deletion was already homed in Files (review-11 #6).

`loadWorkflowState` requires an existing workflow (`{ workflowId }` mode
throws `workflow_not_found`, `loadWorkflowState.js:92–102`) — Start has no
workflow yet. Its load is: config lookup (`workflowsConfig.find(type)`) +
optional parent-action read by `_id`. The task's "Load: `workflowConfig` +
parent action" implies this but names no mechanism; the parent read is
today `getActionFields.js`, whose disposition review-12 #6 already flagged
as unowned (after tasks 15/16 its only importer is `StartWorkflow.js`).
One sentence: Start performs its own two reads via `findDocs`, and
`getActionFields.js` + its test are deleted here. Also note in passing
that Cancel via `loadWorkflowState` now throws `workflow_not_found` where
today it proceeds silently against a missing workflow
(`CancelWorkflow.js:35–41` has no null check) — a fine and intended
tightening, but it brushes against line 24's "no new guards", so own it
explicitly.

## Summary

Findings 1–3 are load-bearing. 1 is a stale-task hazard with a recorded but
unapplied resolution — as written, Start cannot create tracker (or any
direct-seeded) drafts through the mechanism the task names, and the
tracker-`none`-row flip the user already decided has no implementing task.
2 and 3 are behaviour regressions an implementer would faithfully build:
Close killing post-close required actions, and Cancel recording a phantom
`completed` + mirroring the wrong terminal state to parent trackers.
4 resolves a contradiction between two stated mechanisms before it becomes
two implementations; 5–7 pin surfaces ("which stage", "which return keys",
"which loader") that the task currently leaves to inference.
