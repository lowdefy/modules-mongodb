# Review 6 — Task 11 (workflow planners) behaviour-preservation against `recomputeWorkflowAfterActionWrite`

Scope: `tasks/11-workflow-planners.md` (`planWorkflowRecompute` + `planFormDataMerge`),
checked against the code it replaces (`shared/recomputeWorkflowAfterActionWrite.js`
and its test suite, `WorkflowAPI/SubmitWorkflowAction/mergeFormOverrides.js`,
`handleSubmit.js:290–312`, `recomputeGroups.js`), the design's Q6 resolution
(design.md:786–798), the auto-complete worked example (design.md:702, 742), the
auto-unblock⇄recompute fixpoint (design.md:143, 458–460), and prior reviews
(review-4 #2/#3, review-5, consistency-5).

Q6 is correctly reflected: task 11's deep-merge rule (objects deep-merge;
arrays/scalars/`null` replace whole; lodash `mergeWith` customizer) matches
design.md:790–792 exactly. The channel order and `submitted_form` exposure for the
event context (task 11 lines 19, 25) match design.md:324–332 / 703. The findings
below are guards and clarifications the task/design drop relative to the old code's
_tested_ behaviour, plus two ambiguities.

## Behaviour-preservation gaps (correctness)

### 1. Auto-complete drops the `total > 0` guard — empty workflow auto-completes

> **Resolved (auto).** Trigger restated as `total > 0 && total === done + not_required` in task 11 (plan bullet + AC) and design.md (worked-example step 7, test-strategy bullet); empty-workflow test case added to the `planWorkflowRecompute.test.js` spec. Preserves `recomputeWorkflowAfterActionWrite.js:82–84` and its pinned test.

Task 11 line 14 / AC line 30 trigger the `completed` push iff
`total === done + not_required`. The design uses the same bare formula
(design.md:702 "Check auto-complete: no — `total !== done + not_required`";
design.md:742 lists only the trigger + mutual exclusion).

But `recomputeWorkflowAfterActionWrite.js:82–84` requires at least one action:

```js
const allTerminal =
  workflowActions.length > 0 &&
  workflowActions.every((a) => TERMINAL.includes(a.status?.[0]?.stage));
```

`total === done + not_required` is **true at `total === 0`** (`0 === 0`), so a
zero-action workflow would auto-complete. The old behaviour is pinned by a test
(`recomputeWorkflowAfterActionWrite.test.js:75` seeds `total: 0` →
`shouldPushCompleted: false`). At Submit `total ≥ 1` so this is latent there, but
`planWorkflowRecompute` is the shared composer (Cancel/Close/tracker also drive it
per design.md:565, 591), and the old guard + test exist — so it is a genuine
regression, not dead defensiveness.

**Fix.** State the trigger as `total > 0 && total === done + not_required` in task 11
(line 14, AC line 30) and design.md:702/742; add the empty-workflow case to
`planWorkflowRecompute.test.js`.

### 2. Auto-complete is not idempotent — already-`completed` push guard missing

> **Resolved (auto).** Task 11 plan bullet + AC and design.md now state the full guard: no `completed` push when the current workflow stage is already `completed` **or** `cancelled` (idempotent on `required_after_close` re-submits). Both old test cases (already-completed, already-cancelled) added to the `planWorkflowRecompute.test.js` spec.

`recomputeWorkflowAfterActionWrite.js:85–89` guards on the _current_ stage:

```js
const shouldPushCompleted =
  allTerminal &&
  currentWorkflowStage !== "completed" &&
  currentWorkflowStage !== "cancelled";
```

Both branches are tested:
`recomputeWorkflowAfterActionWrite.test.js:132` ("already-completed … →
shouldPushCompleted:false; no $push") and `:147` ("already-cancelled … → false").

Task 11 line 14 and design.md:742 only say "`completed` and `cancelled` are mutually
exclusive." That captures the _cancelled_ branch but **not idempotency on
`completed`**: a second submit on an already-`completed` workflow (the
`required_after_close` path restored by review-4 #3) would push a second `completed`
status entry. The guard is "no push when current stage is `completed` **or**
`cancelled`."

**Fix.** Reword task 11 line 14 / AC line 30: do not push `completed` when the
current workflow stage is already `completed` or `cancelled`. Carry over both
old test cases into `planWorkflowRecompute.test.js`.

### 3. `lodash.mergeWith` mutates its target — purity violation for both planners

> **Resolved (auto).** Task 11 now requires `mergeWith(cloneDeep(base), submitted_form, customizer)` (never merging onto `loadedState` directly), states "no input mutation — build new `status`/`groups`/`summary` values" for `planWorkflowRecompute`, and adds "does not mutate `loadedState`" assertions to both test specs. design.md Q6 implementation note updated to match.

Task 11 calls both planners "Pure … no reads" (lines 15, 26), and line 23 specs
`mergeWith` with the array-replace customizer. But `mergeWith(dest, src, fn)`
**mutates `dest` in place**. If the merge target is `loadedState.workflow.form_data`
(or its `{action}` sub-object), the planner mutates the loaded state — purity is
about not mutating inputs, not only about not doing I/O. Same hazard in
`planWorkflowRecompute` if it `unshift`es a `completed` entry onto the loaded
`workflow.status` array or reuses the loaded `groups`/`summary` arrays.

**Fix.** Require `planFormDataMerge` to `mergeWith` onto a **deep clone** of the
loaded `form_data.{action}` sub-object (e.g. `mergeWith(cloneDeep(base), ...)`),
and `planWorkflowRecompute` to build new `status`/`groups`/`summary` values rather
than mutating the loaded doc. Add a "does not mutate `loadedState`" assertion to
both test files.

## Consistency / clarity

### 4. Group-recompute reuse is unstated; task 10↔11 coupling isn't in the dependency graph

> **Resolved.** Adopted the shared-helper option: task 9 relocates `recomputeGroups.js` + `deriveGroupStatus.js` (+ tests) to `shared/phases/planners/` (task 9 is the common dependency, so neither 10 nor 11 owns the move); tasks 10 and 11 both import the relocated helper — task 10's fixpoint no longer references a `planWorkflowRecompute` export, task 11 says "reuse, don't reimplement". The `tasks.md` dependency table and Band 3 parallel-safe claim are correct as-is. design.md fixpoint paragraph names the shared helper. Task 15's cleanup list updated (relocation already done by 9; verify no stale copies).

review-4 #2 / design.md:143 / consistency-5 (line 57) resolved that
`planWorkflowRecompute`'s group recompute "participates in the fixpoint" that
`planAutoUnblock` (task 10) drives — i.e. task 10 _consumes_ the recompute task 11
_exposes_. Yet `tasks.md` lists task 10's `Depends On` as `2, 3, 9` (no 11) and
Band 3 calls tasks 10/11 "parallel-safe after 9" — neither reflects the coupling.
An agent implementing 10 before 11 hits a missing dependency.

The clean resolution is already implied by task 15 line 47 ("keep and relocate …
group-status derivation for `planWorkflowRecompute`"): the pure `recomputeGroups.js`

- `deriveGroupStatus.js` already exist and already emit
  `{ id, status, summary: { done, not_required, total } }` with correct `not-required`
  (hyphen) stage handling and the `blocked → in-progress` label logic the fixpoint
  needs. If **both** planners import that _relocated shared helper_ (rather than task 10
  reaching into a function task 11 owns), they stay genuinely parallel-safe and the
  dependency table is correct as-is.

**Fix.** In task 11, state that group/summary recompute reuses the relocated
`recomputeGroups` / `deriveGroupStatus` helpers (don't reimplement — _one correct
way_), and that the fixpoint shares that helper rather than a `planWorkflowRecompute`
export. Alternatively, if task 11 truly owns and exports the recompute, add `11` to
task 10's `Depends On` and drop the "parallel-safe" claim for 10/11 in Band 3.

### 5. `current_key` mislabeled as an action-doc field

> **Resolved (auto).** Task 11 keyed-target bullet reworded: `key` is `params.current_key` (equivalently the loaded target action's `key`), noting `current_key` is a submit param, not an action-doc field. Matches `handleSubmit.js:299`.

Task 11 line 22 sets the keyed target path to `form_data[type][key]` "where `key`
is the action's `current_key`." `current_key` is a **submit param**, not an
action-doc field — `handleSubmit.js:299` builds the keyed path from
`context.params.current_key`, and the action doc's own field is `key` (task 10
line 25; `key: null` on action docs in fixtures). Since `planFormDataMerge` is pure
over `params + preHookResult + loadedState`, name the source precisely: the keyed
path uses `params.current_key` (equivalently the loaded target action's `key`).

**Fix.** Reword task 11 line 22 to read `params.current_key` (note the equivalence
to the loaded action's `key`).

### 6. Three-channel pre-merge depth unspecified

> **Resolved.** Deep — the inter-channel pre-merge uses the same `mergeWith` customizer as the merge onto the loaded base (one merge rule everywhere; the old `mergeFormOverrides.js` top-level spread is intentionally not preserved — under the old code shallowness was moot since fields were `$set` per top-level path anyway). Stated in task 11 and design.md Q6; `a.b`/`a.c` cross-channel test case added to the `planFormDataMerge.test.js` spec.

Task 11 line 19 and design.md:790 say `submitted_form` is built by "merging the
three channels in order" (`params.form` → `params.form_review` →
`preHookResult.form_overrides`), but neither states whether _that_ inter-channel
merge is shallow (old `mergeFormOverrides.js` does a flat top-level spread) or the
same deep `mergeWith` used for the merge onto the loaded base. Line 23's "uniform
across both channels" implies deep, but it's left implicit. If shallow,
`form_review` replaces a nested object `form` set wholesale; if deep, the two
combine. This changes the `submitted_form` value handed to the event context (task
12).

**Fix.** State that the three-channel pre-merge uses the same `mergeWith` customizer
(deep-merge objects; arrays/scalars/`null` replace), and add a
`planFormDataMerge.test.js` case where `form` sets `a.b` and `form_review` sets
`a.c` (both survive under deep merge).

## Summary

Findings 1–2 are behaviour-preservation regressions: task 11 and design.md:702/742
drop the `total > 0` and already-`completed` guards that
`recomputeWorkflowAfterActionWrite.js` enforces and its tests pin — same class as
review-4's findings, not yet caught. Finding 3 is a concrete `mergeWith` purity
trap. Findings 4–6 are clarifications; 4 also closes a dependency-graph gap left
open after review-4 #2 / review-5 #2 by naming the existing `recomputeGroups`
reuse.
