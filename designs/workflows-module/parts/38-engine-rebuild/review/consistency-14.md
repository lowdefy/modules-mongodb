# Consistency Review 14

## Summary

First consistency pass since reviews 8 and 9 were actioned (consistency-8
covered reviews 5–7). All 15 findings across reviews 8–9 carry resolution
annotations, and the resolutions are propagated correctly across `design.md`,
the task files, and the landed Band-1/3 code, with six residual exceptions —
all auto-resolved: two stale-decision stragglers in the design (the D3 "open
question" pointer Q1's resolution missed; D15's pre-error-model
`extends Error`), one typed-shape shorthand (`PreHookResult = { actions,
overrides }` in the data flow + worked example), and three inventory gaps from
the review-9 resolutions (`comment` missing from the design's emitted-payload
list; `mergeEventOverrides` relocation / `deriveEntityRefKey` deletion missing
from Files changed; `entity_ref_key` missing from the design's schema /
resolver / demo inventory lines). No user decisions were required.

**Out of scope, flagged:** reviews 10–13 (~31 findings against tasks 14, 15,
16, 17 + adjacent surfaces) carry **no resolution annotations** — they have
not been actioned, and their recommendations are deliberately *not* treated as
decisions by this pass. The one apparent exception is review-13 #1's subject
matter: the Part 45 review-1 #2 package (Start direct-seed, tracker `none`-row
flip) **has** since been applied to task 17, task 19, design.md, and
state-machine.md — so that finding's premise is now stale and it can be marked
accordingly when reviews 10–13 are actioned. `tasks/tasks.md` now warns that
reviews 10–13 are unactioned. Run `/r:design-action-review` on them before
implementing tasks 14–17.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review-1.md` – `review-13.md`, `consistency-4.md`,
  `consistency-5.md`, `consistency-8.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01` – `tasks/20`
- **Plans:** none present.
- **Cross-checked external surfaces:** landed `shared/phases/types.js`,
  `mongo/insertManyDocs.js` (code ↔ actioned decisions);
  `workflows-module-concept/state-machine/design.md` (tracker `none` row /
  "Creation" per Part 45 review-1 #2); Part 42 `design.md` D4 (all-touched
  `action_ids` behaviour requirement per review-9 #3); link targets
  (Parts 24, 33, 41, 42, `_next/22`, `_next/28` all exist).

## Inconsistencies Found

### 1. D3 still carried Q1 as an open question

**Type:** Internal Contradiction (stale status; residual of consistency-8 #4)
**Source of truth:** Open questions Q1 — "(RESOLVED — whole-doc; task 13.)"
**Files affected:** `design.md` § D3
**Resolution:** The D3 note "(Open question: should commit phase set whole doc
or computed delta…)" rewritten to "(Q1, resolved: whole-doc…)". Consistency-8
marked the Q1–Q5 headings resolved but missed this in-decision pointer.

### 2. D15 still defined `ConcurrentSubmitError extends Error`

**Type:** Internal Contradiction (residual of review-7 #4 / consistency-8 #2)
**Source of truth:** D13 engine error model + task 13 —
`ConcurrentSubmitError extends WorkflowEngineError` (`code: "concurrent_submit"`).
**Files affected:** `design.md` § D15
**Resolution:** "(e.g. `class ConcurrentSubmitError extends Error`)" replaced
with the D13 shape + code.

### 3. `PreHookResult = { actions: [], overrides: {} }` shorthand

**Type:** Internal Contradiction
**Source of truth:** the typed shape — D2, task 9 / task 14, the landed
`shared/phases/types.js`, and the data-flow output line two lines below the
stale one: `{ actions[], event_overrides, form_overrides }`.
**Files affected:** `design.md` § Proposed data flow (no-pre-hook branch),
§ Worked example (pre-hook phase)
**Resolution:** Both occurrences rewritten to
`{ actions: [], event_overrides: {}, form_overrides: {} }`. (This is also
review-10 #9's second bullet — fixed here because it is mechanically
unambiguous against the typed contract; review-10 #9's first bullet, the
no-hook vs `pre_hook_response: null` surfacing question, remains open for
action-review.)

### 4. Design's emitted-payload list omitted `comment`

**Type:** Review-vs-Design drift (residual of review-9 #2)
**Source of truth:** review-9 #2 resolution — `comment` stays on the wire for
Part 33's `foldCommentIntoEvent`; task 19's payload list carries it.
**Files affected:** `design.md` § Modified — API + payload surfaces
**Resolution:** `comment` added to the `makeWorkflowApis.js` payload list with
the Part 33 wire-contract note (engine writes no `metadata.comment`).

### 5. Files-changed inventory missing the review-9 #3 file dispositions

**Type:** Stale Reference (design inventory not updated by review-9 #3)
**Source of truth:** review-9 #3 resolution + task 12 Files —
`mergeEventOverrides.js` (+ test) relocates to `shared/`;
`utils/deriveEntityRefKey.js` (+ tests) is deleted, not relocated; and
`planEventDispatch` absorbs the *whole* `buildDefaultLogEventPayload`
composition, not just template constants.
**Files affected:** `design.md` § Files changed
**Resolution:** Added `deriveEntityRefKey.js` to the Deleted list; added the
`mergeEventOverrides.js` relocation under the "Plus, one level up at `shared/`"
list; rewrote the `dispatchLogEvent.js` Deleted entry from "template constants
survive" to the full-composition absorption.

### 6. `entity_ref_key` absent from the design's per-file inventory

**Type:** Stale Reference (residual of review-9 #3 — the narrative section
documents it; the inventory lines don't)
**Source of truth:** review-9 #3 resolution → design "Engine entry points emit
events" + tasks 4 (schema), 6 (resolver validation), 17 (copy onto doc),
20 (demo configs).
**Files affected:** `design.md` § Connection schema, § Action and workflow doc
shapes, § Modified — resolver + manifest, § Modified — demo app
**Resolution:** Added `entity_ref_key` to the connection-schema field list
(task 4), the workflow-doc-shape additions (copied at start, task 17), the
`makeWorkflowsConfig.js` validator line (task 6), and the demo
`workflow_config` migration bullet (task 20).

### 7. tasks.md review-file inventory frozen at review-7

**Type:** Stale Reference
**Source of truth:** the review folder (reviews 1–13 + consistency-4/5/8
exist; reviews 8–9 actioned, 10–13 not).
**Files affected:** `tasks/tasks.md` § Scope
**Resolution:** Inventory updated to reviews 1–9 + consistency-4/5/8 as folded
in, with an explicit warning that reviews 10–13 (tasks 14–17) are written but
unactioned and should be actioned before implementing Band 4.

## No Issues

Verified propagated with no drift:

### Review-8 (task 13 commit contract) ↔ design + tasks 9/10/11/13/16/17 + code

- **#1 (`updated` stamp):** task 11 stamps `updated: now` with the
  differs-from-loaded AC; task 10 stamps on both insert and update ops;
  task 13 carries the post-commit-stamp-advanced AC.
- **#2 (`Plan.workflow.operation`):** D3, task 9, the landed `types.js`, and
  task 13's step-1 branch all carry it; task 17 names the Start insert
  mechanism; the `ConcurrentSubmitError` scope note (not Submit-specific) is in
  task 13.
- **#3 (txn skeleton):** task 13 and D11 share the
  `commitWorkflowAndActions` steps-1–2-only shape with steps 3–5 after the
  branch; call-ordering AC present.
- **#4 (defer-throw policy):** `dispatchErrors[]` + end-of-handler
  `post_commit_dispatch_failed` consistent across D9/D11/D13, tasks 13, 15,
  16, and the data-flow `CommitResult`.
- **#5/#7 (callApi arity, landed helper signatures):** task 13 shows the
  three-arg `callApi`, the `{ success, error }` check, and the options-object
  helper API.
- **#6 (change-log collection source):** task 13 step 5 sources
  `connection.changeLog.collection` + empty-skip; the landed
  `insertManyDocs.js` JSDoc no longer mentions notifications.
- **#8 (empty-plan skip):** D3 names the caller-short-circuit; task 16 owns
  the skip with an AC. (The D10 / task-16 loop *sketches* still lack the skip
  branch — that is review-12 #3's open finding, left for action-review.)
- **#9 (singular event):** `Plan.event` singular in D3, task 9, `types.js`;
  `CommitResult.event_id` singular in task 13 + data flow + worked example;
  `dispatchNotifications(context, event_id)` unchanged in task 13.

### Review-9 (event/change-log planners) ↔ design + tasks 4/6/12/15/17/19/20

- **#1 (per-type log-changes schema):** task 12 and D7 pin the per-type field
  sets (update: no `response`; insert: `args.doc` + `response`, no
  before/after; `payload` everywhere; verbatim `meta`); the test plan matches.
- **#2 (comment drop):** task 12 states the deliberate non-reproduction with
  the Part 33 pointer; task 19 carries `comment` on the wire. (Design list
  gap fixed — finding 4.)
- **#3 (full composition + `entity_ref_key` + all-touched `action_ids`):**
  task 12 specs display/references/metadata per event type; the uniform
  all-touched-actions rule is in design "Engine entry points emit events" and
  Part 42 D4 (verified — its D4 carries the behaviour requirement and the
  amended join-field note); `entity_ref_key` threads tasks 4 → 6 → 17 → 12 →
  20. (Design inventory gaps fixed — findings 5–6.)
- **#4 (merge scoped to Submit):** task 12 scopes the three-source merge,
  pins the signal-name YAML key, and asserts lifecycle/mirror render
  engine-default only.
- **#5 (mirror types + `interaction`→`signal`):** the three literal mirror
  type strings are pinned in task 12; `signal` is used uniformly in D12, the
  events table, the worked example, the test plan, and tasks 12/17 — no stray
  `interaction` key remains anywhere in the design or tasks.
- **#6 (request-context threading):** task 15's mint-at-entry step threads
  `{ blockId, connectionId, pageId, requestId }`, shared with task 17.

### Part 45 review-1 #2 (Start direct-seed + tracker `none`-row flip)

Applied everywhere the resolution claimed: design.md § API + payload surfaces
(`{ type, status }` grammar kept); task 17 (direct seed, legal seeds, `none`
row = pre-hook spawn path only; `tables.js`/`tables.test.js` flip in Files);
task 19 (`start-workflow.yaml` note); state-machine.md (tracker table `none`
row + "Creation" § `StartWorkflow` does not use the `none` row). Review-13 #1
flagged this as unapplied — it has since been applied; only its secondary asks
(seeding mechanism, legal-seed validation home) remain open.

### Reviews 1–7 and earlier consistency registers

Spot-checked against consistency-8's register: CAS workflow-first +
`updated.timestamp` scalar; `simple` FSM alias; interleaved unblock⇄recompute
fixpoint; `required_after_close` load carve-out; `mongodb` peer dep; D13 error
model incl. `TrackerCascadeDepthError`; Q1–Q6 resolved markings. No reopened
decisions in reviews 8–9. Landed code (`types.js`, `insertManyDocs.js`,
state-machine tracker table) matches the actioned design. Band/status notes in
tasks.md (Bands 1–2 done; Band 3 tasks 9–11 done) agree with the review-11/12
scope statements.
