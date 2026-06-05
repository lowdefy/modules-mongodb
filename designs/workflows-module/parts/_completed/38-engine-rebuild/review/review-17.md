# Review 17 — Task 23 (planner contract catch-up)

Scope: `tasks/23-planner-contract-catchup.md`, verified against the landed
Band-3/16 code (`planActionTransition.js`, `planWorkflowRecompute.js`,
`fsm/tables.js` + `tables.test.js`, `runTrackerCascade.js`,
`planTrackerLevel.js`, `phases/types.js`), the owning specs (tasks 10/11/16/17),
review-13 (#1/#3/#4/#5), Part 45 review-1 #2, state-machine.md (tracker table +
"Creation"), design.md (:124 D3 fire typedef, :641 planner list, :717 Start
surface), and today's `CancelWorkflow.js`.

**Verified clean (no findings):** the `tables.js:100–101` line refs are
accurate; state-machine.md already carries the flipped tracker table
(`none` row = `activate`/`block` only, lines 156–176) so the task's row spec
matches the authoritative source exactly; the `lifecyclePush` entry shape
matches today's cancelled entry (`CancelWorkflow.js:50–54` —
`{ stage, created, ...(reason ? { reason } : {}) }`) plus the intended
`event_id` addition; the mirrors the task claims exist do exist (task 10:25,
task 11:14, task 16:35/74/100, task 17:56, design.md:641/:717); Submit and
tracker levels pass no `lifecyclePush` (`planSubmit.js`,
`planTrackerLevel.js:116–121`), so "no behaviour change for existing callers"
holds; and the seedStage downstream-steps list matches the landed composition
order (`planActionTransition.js:101–168`) one-for-one.

## Resolved-now conditionals

### 1. Task 16 is landed — without the payload passthrough; drop the "in flight" conditionals

> **Resolved (auto).** Task 23 was implemented before this review was actioned — the passthrough is landed and tested (`runTrackerCascade.js:101`, `planTrackerLevel.js:97`, tests in both files). Spec updated to match: Context and the reconcile bullet state task 16's `a5c321b` landing as fact, AC/Files conditionals dropped, "Parallel-safe with task 15" removed, and the "each marked 'added by task 23'" claim corrected to tasks 10/11 only.

The task hedges three times: Context "task 16 may have landed against the
pre-amendment spec", the reconcile bullet "If task 16 landed without it, add
the passthrough", AC "(if task 16 is landed by the time this runs)", Files
"verify / modify (only if …)". The question is answerable today (CLAUDE.md:
"Resolve the open question; don't defer it"): task 16 landed in `a5c321b`,
and the landed code has **no** passthrough — `planTrackerLevel.js:83` passes
a hardcoded `payload: {}` into `planActionTransition`, the cascade loop
forwards only `parentActionId` + `signal` (`runTrackerCascade.js:93–101`),
and its JSDoc fire shape (`runTrackerCascade.js:59`) carries no `payload?`.

Fix: state it as fact and make the reconcile unconditional — add `payload`
to the fire dequeue → `planTrackerLevel` args → `planActionTransition` call,
plus the test. While there: the Notes' "Parallel-safe with task 15" is moot
(task 15 landed in `fbf54ed`), and Context's claim that the amended contract
is "marked 'added by task 23'" in each owning spec is true for tasks 10/11
but not task 16 (its payload lines attribute to task 17) — harmless, but
correct it or drop "each".

## Missed landed test sites (the `none`-row flip)

### 2. `planActionTransition.test.js:261–274` pins the exact behaviour the flip reverses

> **Resolved (auto).** The implementation already replaced the test with exactly the proposed coverage: "tracker spawn births via the none row" asserts insert at the birth stage with `tracker: { workflow_type }` populated, keeps the mirror-signal no-op check, and the comment cites state-machine.md "Creation". Task 23's tables bullet now owns the flip explicitly.

The landed test "tracker spawn is a structural no-op (tracker FSM has no
none row)" asserts an auxiliary `block` upsert-spawn of a tracker resolves
`null`. Once the tracker `none` row lands, `block` resolves `blocked` and
the same call produces `operation: 'insert'` — the test fails, and the
task's tables bullet names only `tables.test.js` as the test flip. The file
is in the Files list (for seedStage), so the implementer would trip over it,
but the spec should own the flip — especially since the replacement is
coverage the new row needs anyway: tracker spawn → insert at the birth stage
(`blocked` for `block`, `action-required` for `activate`), with
`tracker: { workflow_type }` populated from the config. Also update the
test's stale comment (same wording as `tables.js:100–101`).

### 3. The `tables.test.js` flip is three edits, not one — the exhaustive grid drives

> **Resolved (auto).** All three edits are landed: `none` row in `EXPECTED_TRACKER` (`tables.test.js:95–98`), `activate`/`block` in `TRACKER_SIGNALS` (`:86–87`), and the direct assertion flipped to `toEqual({ activate, block })` (`:170–173`). Task 23's tables bullet now spells out all three.

The task says "Flip the `tables.test.js` assertion that the tracker has no
`none` row" (i.e. `tables.test.js:162`). But the file's primary mechanism is
the exhaustive-grid test: `assertTableExhaustive` asserts key-set equality
(`tables.test.js:123`), so adding `none` to `tables.js` fails "tracker table
matches state-machine.md exactly" until `EXPECTED_TRACKER`
(`tables.test.js:92–119`) gains the row. And `TRACKER_SIGNALS`
(`tables.test.js:84–90`) lacks `activate`/`block` entirely — without adding
them, the grid never checks the two new cells, nor the state-machine.md:167
invariant that `activate`/`block` resolve **only from `none`** on a tracker
(absence from every live row is exactly what the signals-loop verifies).
Spec all three: `none` row in `EXPECTED_TRACKER`, `activate`/`block` in
`TRACKER_SIGNALS`, and the line-162 flip.

## Files-list gap

### 4. `types.js`'s `trackerFires` typedef misses `payload?` — and the file isn't listed

> **Resolved (auto).** The one genuinely open code gap — the implementation missed it too. Added `payload?: { fields?: Object }` to the `Plan.trackerFires` typedef (`shared/phases/types.js`) with the D3 fire-shape note, and listed types.js in task 23's Files.

design.md:124's D3 fire typedef carries
`payload?: { fields: object } // optional — Start's child link fields`, but
the landed Plan typedef (`shared/phases/types.js:97–104`) still reads
`{ parentWorkflowId, parentActionId, signal }`. The task reconciles the two
consumers (`runTrackerCascade.js` / `planTrackerLevel.js`) but not the
typedef that documents the shape they consume — the exact "landed code vs
amended spec" gap this catch-up exists to close. Add
`plugins/modules-mongodb-plugins/src/connections/shared/phases/types.js` to
Files with the one-line typedef addition.

## Contract ambiguity

### 5. "Forward `fire.payload` into `planActionTransition`'s `payload.fields`" reads as double-nesting

> **Resolved (auto).** The implementation read it correctly — `planTrackerLevel.js:97` passes the bag whole (`payload: payload ?? {}`), no double-nesting, and the passthrough tests assert the fields land flat on the doc. Reworded task 23 (Task bullet + AC) and task 16:74 to "pass the fire's `payload` bag through whole as `planActionTransition`'s `payload` (its `fields` key lands as `payload.fields`)".

The fire shape is `payload?: { fields }` (this task's own line 28, task
17:35's pinned `payload: { fields: { child_workflow_id, … } }`,
design.md:124). Read literally, "forward `fire.payload` into …
`payload.fields`" (Task bullet + AC) means
`payload: { fields: fire.payload }` — producing
`fields: { fields: { … } }` on the doc. The correct operation is passing
the bag whole: `payload: fire.payload ?? {}` (the fire's payload *is* the
planner's payload bag, fields-only). The described test would catch the
mistake, but one clause prevents it: say "pass the fire's `payload` bag
through as `planActionTransition`'s `payload` (its `fields` key lands as
`payload.fields`)". Task 16:74 has the same phrasing — fix it in the same
stroke (it's a one-word edit in an owning spec).

### 6. The two seedStage misuse throws carry no error `code`

> **Resolved (auto).** The implementation pinned exactly the suggested code — both misuse throws carry `code: 'invalid_seed'` (`planActionTransition.js:92/98`) and the landed tests discriminate on it. Pinned `invalid_seed` in task 23's Task bullets and AC.

"Both present throws `WorkflowEngineError`" and "a `seedStage` with a loaded
action throws" pin the class but not the `code`. The landed error model
discriminates on `code` everywhere (`missing_target`, `signal_not_allowed`
in this same file; task 16: "callers/tests discriminate on `code`"), and the
AC's two throw cases need something stable to assert. Pin one code for both
misuse shapes — e.g. `code: 'invalid_seed'` — in the task and the AC.

### 7. What is `loadedWorkflow` in seedStage mode? Task 10's bolded rule forbids Start's only option

> **Resolved (auto).** Added the sentence in both places: task 10's seedStage bullet now states that in seed mode the caller passes its planned workflow **insert** doc as `loadedWorkflow` (the "do not pass `plannedWorkflowDoc`" rationale doesn't apply — Start composes the doc before seeding and runs no recompute; immutable fields are minted before any draft), and the landed `planActionTransition.js` JSDoc `loadedWorkflow` param carries the same clarification.

Task 10:13 bolds "Do **not** pass `plannedWorkflowDoc`", and the landed
JSDoc says `loadedWorkflow` is "the loaded workflow doc (NOT the recomputed
one — that doesn't exist yet)" (`planActionTransition.js:45–48`). Start has
no loaded workflow — it must pass its planned workflow **insert** doc, the
only source for the fields the insert path reads (`_id`, `entity_id`,
`entity_collection` at `planActionTransition.js:108–115`; `workflow_type` at
`:146`). That's safe — the rule's chicken-and-egg rationale doesn't apply
(Start composes the workflow doc before seeding drafts and runs no recompute,
task 17:27) — but neither task 10's seedStage bullet nor this task says so,
and a careful implementer hits the apparent contradiction when writing the
mode's JSDoc and tests. One sentence in task 10's seedStage bullet (mirrored
in the JSDoc this task writes): in seed mode the caller passes its planned
workflow insert doc as `loadedWorkflow`; the immutable-fields constraint
holds because Start mints them before any draft is seeded.

## Summary

No structural problems — the task's three contract extensions match the
resolved review-13 decisions and the landed code's extension points
precisely. The findings are landed-state drift and pinning: #1 resolves the
now-answerable "is task 16 landed" conditionals (it is, without the
passthrough); #2–#3 are landed test assertions the `none`-row flip breaks
that the task doesn't own; #4 is a missed typedef site; #5–#7 pin wording
that currently admits a wrong implementation (double-nested `fields`,
codeless throws, an apparently forbidden `loadedWorkflow` input).
