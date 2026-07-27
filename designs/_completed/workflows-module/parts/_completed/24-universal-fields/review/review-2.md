# Review 2 — The decoupled-operation rewrite vs. its neighbours and Part 38

Review-1 was resolved by a substantial rewrite: universal fields on form-kind actions are now a
**state-orthogonal operation** (`update-action-fields-{action_type}` → `UpdateActionFields` handler),
fully decoupled from form submit. This review checks the new contract against the parts it now leans
on — Part 39 (which must stop sending `fields`), Part 38 (whose phase helpers the handler reuses),
and Part 35 (the `task`→`simple` rename the prose assumes).

One verification came back clean and worth recording up front: the **"re-render the cell, write only the
action doc" claim is correct.** The rendered status-map cell is stored at the top level of the action doc
(`action[app_name].message`, Part 30 design.md:15–24; Part 38 D14), and the entity card sources it directly
from the action doc via `api/get-entity-workflows.yaml:62–71` — never from a denormalized copy on the
workflow doc. So skipping the workflow write does not strand the card. The rationale in design.md:26–28 holds.

The findings below are the gaps.

## Contract contradictions with neighbouring parts

### 1. Part 39 does **not** drop the `fields` payload — it still sends it, with the old regex

> **Resolved.** The contradiction is removed structurally by the kind-based guard adopted in #2: `planActionTransition.js` writes the universal fields only for `kind: simple`, so form submit cannot clobber them regardless of whether Part 39 still sends `fields`. Part 24's "Consumed by" / "Contract to neighbours" bullets now describe the Part 39 `fields`-drop + regex-narrow as **hygiene** (don't validate sidebar inputs on submit, don't post dead `_state.fields`), explicitly **not** a correctness precondition, and note the two parts are independent. The actual Part 39 design.md edit is being handled by the agent working on Part 39 in parallel.

This is the load-bearing finding. design.md:11 and :147 and :221 all rest on the premise that the form
submit payload **omits** `fields`:

> design.md:147 — "Once the form-submit payload omits `fields`, an unconditional `$set` would write
> `undefined`/`null` over existing values. So this part amends … `planActionTransition.js` to set the
> universal fields only when `fields` is present in the payload; when absent (every form submit) the loaded
> values carry through untouched."
>
> design.md:221 — "the `submit` / `progress` button payloads **drop the `fields` key**; the submit
> `Validate` regex narrows from `[^form\., ^fields\.]` to `[^form\.]`."

But Part 39's current design does the opposite on every point:

- `39-form-submit-buttons/design.md:45` — submit `Validate` is still `params: { regex: [^form\., ^fields\.] }`.
- `39-form-submit-buttons/design.md:58` — the submit payload still carries `fields: { _state: fields }`.
- `39-form-submit-buttons/design.md:108` — the `progress` payload still carries `fields: { _state: fields }`.

Part 39 contains no mention of dropping `fields` anywhere; it is purely an `interaction:`→`signal:` rewrite.
The two designs were edited in the same window (both appear in `git status`) but the decoupling premise never
landed in Part 39.

This is not cosmetic. With Part 39 as written, every form submit still posts `fields: { _state: fields }`,
and in edit mode the universal-fields component primes `_state.fields.*` from the loaded doc (design.md:64).
So `payload.fields` is _present_ on every submit, the no-clobber guard's "only when present" branch fires, and
**form submit writes the universal fields again** — exactly the clobber the rewrite claims to have eliminated,
and exactly the coupling ("you can't touch metadata without a transition") the rewrite's "Why decouple" section
(design.md:18–28) says is gone. The sidebar Update and the form submit would both write the fields, with submit
overwriting whatever the sidebar last saved using stale primed state.

**Fix:** Reconcile the two. Either (a) Part 39's design must be amended to drop `fields` from the `submit`/`progress`
payloads and narrow the regex to `[^form\.]` — and Part 24's "Consumed by" / "Contract to neighbours" bullet should
say "requires the Part 39 changes below" rather than asserting them as already true — or (b) if Part 39 is meant to
keep `fields` for some reason, the guard logic in design.md:147 is wrong and the decoupling doesn't actually hold.
Given the rewrite's intent, (a) is correct: Part 39's design.md needs the edit. Until it does, the contradiction
should be flagged in both files.

### 2. Part 24 amends a field-setting behaviour Part 38 never specifies

> **Resolved.** Two changes. (1) Switched the guard from presence-based ("write fields only when `payload.fields` present") to **kind-based** ("write the universal fields only for `kind: simple`") — it keys on the already-loaded `kind`, can't be defeated by a stray payload, and makes Part 39's `fields`-drop hygiene rather than a correctness precondition. (2) Added an explicit "Contract to neighbours" bullet pinning the baseline: Part 38 must carry the existing universal-field `$set` (today inside monolithic `SubmitWorkflowAction`) into `planActionTransition.js`; Part 24 constrains it to `kind: simple`, and owns adding it if Part 38 ships the planner without it.

design.md:147 says: "Today's submit write path sets the three universal fields from `payload.fields`
unconditionally. So this part amends Part 38's `planActionTransition.js` to set the universal fields only
when `fields` is present."

Two problems with the precondition:

- **Part 38 doesn't say `planActionTransition.js` sets universal fields at all.** Its spec for that planner is
  one line — `38-engine-rebuild/design.md:512`: "given an action + signal + payload + context, returns the planned
  post-commit action doc + change-log delta." Neither D12 nor the worked example (lines 608–649) shows `assignees`
  / `due_date` / `description` being populated from `payload.fields`. The behaviour exists today only in the
  monolithic `SubmitWorkflowAction` (no `shared/phases/` exists in-tree yet — verified). So Part 24 is amending a
  line that Part 38 must first _establish_, and Part 38's design doesn't pin where field-setting lives in the new
  planner split.

**Fix:** Add a one-line contract note: Part 38 must carry the existing universal-field `$set` into
`planActionTransition.js`, and Part 24's guard wraps that `$set` in an "iff `payload.fields` present" condition.
Better, since Part 24 declares it "owns the full write path," spell out the post-amendment field-setting block here
rather than describing it as a delta against an unspecified baseline. Otherwise the implementer of Part 24 inherits
a guard whose target may not exist in the shape assumed.

### 3. Missing dependency on Part 35 (`task` → `simple`)

> **Resolved.** Added Part 35 to "Depends on" with a "sequence after Part 35" note, recording that every `kind: simple` reference is only coherent once the rename lands and that the `form`-emission path is unaffected. Part 35 item 6 already flips this design's `task` references in place.

design.md uses `kind: simple` throughout (lines 41, 59, 88, 95, 222) and the component table is keyed on
`'form' | 'simple'`. But the shipped resolver still keys on `kind === 'task'` (`makeWorkflowApis.js`,
`ACTION_KINDS` in `makeWorkflowsConfig.js`), and Part 35 is the part that performs the rename
(`35-rename-task-kind-to-simple/design.md:1,6`). Part 24's "Depends on" list (design.md:235–242) names Parts 38,
5, 18, 24a — **not 35**.

The form-emission path (design.md:202, "emit … for every `kind: form` action") is unaffected by the rename —
`form` stays `form`. But every `simple`-kind reference in the prose and the simple-page consumption row
(design.md:88, 222) is only coherent once Part 35 lands. List Part 35 under "Depends on" (or at minimum
"sequence after Part 35"), matching how Part 39 already records "sequences after Part 35"
(`39-form-submit-buttons/design.md:22`).

## Engine-reuse assumptions

### 4. `commitPlan` with no workflow-doc write is unverified

> **Resolved.** Verified concrete and real: the shipped `commitWorkflowAndActions` destructures `plan.workflow` unconditionally and `buildCommitResult` reads `plan.workflow.doc._id` — a workflow-less plan throws today. Task 3 amends `commitPlan` + the `Plan` typedef (`types.js`) to accept `workflow: null` (skip the claim step cleanly, no CAS), and design.md's Files-changed list + commit bullet now carry the amendment explicitly (review-3 #2).

design.md:143 — "Commit — `bulkWriteActions` (one action update) + event via `new-event` + change-log. Because
no workflow doc is written there is no CAS gate."

But Part 38's commit phase is built workflow-first, and the workflow write **is the CAS claim step**:

> `38-engine-rebuild/design.md:204–212` (D9) — "Commit writes are ordered workflow-first: 1. Workflow —
> `findOneAndUpdateDoc` … carrying the CAS filter … This is the claim step."

Part 24 reuses `commitPlan` (design.md:139) but hands it a plan with **no** `plannedWorkflowDoc`. Whether
`commitPlan` accepts an action-only plan — skipping its first/claim step cleanly — is an assumption about a helper
Part 38 designed around always having a workflow write. If `commitPlan` unconditionally performs the workflow
`findOneAndUpdate`, a fields-only plan either no-ops the claim step (fine) or throws on a missing planned doc (not
fine).

**Fix:** Confirm with Part 38 that `commitPlan` supports an action-only commit (no workflow write, no CAS gate),
and state that as an explicit contract bullet under "Contract to neighbours." If it doesn't, Part 24 needs either a
commit variant or a thin direct-write path — which would re-raise the "duplicate the render/commit helpers in YAML"
concern design.md:28 is trying to avoid.

### 5. `renderStatusMap` is not a "phase helper" — it lives in `shared/render/`

> **Resolved.** Reworded design.md to label each reused helper with its directory: `loadWorkflowState` / `commitPlan` (`shared/phases/`), `planEventDispatch` (`shared/phases/planners/`), `renderStatusMap` (`shared/render/`).

design.md:139 groups the reused helpers as "Part 38's phase helpers (`loadWorkflowState`, `commitPlan`,
`renderStatusMap`, `planEventDispatch`)." Per `38-engine-rebuild/design.md:527–534`, `renderStatusMap.js` lives in
`shared/render/`, not `shared/phases/`. Minor, but since this part explicitly enumerates the files it reuses and is
sequenced tightly against Part 38, get the path right: `loadWorkflowState` / `commitPlan` are in `shared/phases/`,
the planners in `shared/phases/planners/`, and `renderStatusMap` in `shared/render/`.

## Event surface

### 6. `action-fields-updated` event type — registration and type-name plumbing unspecified

> **Resolved.** Task 1: the type isn't signal-derived — `planEventDispatch` gains an `UpdateActionFields` handler type that stamps `type: action-fields-updated` directly, plus a `DEFAULT_TITLES` entry so the event carries a real rendered title at plan time. Icon/colour registration stays app-wired (`event_types.yaml`), matching the unregistered lifecycle event types — Part 38's stated "apps wire what they want" posture.

design.md:142 and :193 introduce a new log-event type, `action-fields-updated`, but the design says nothing about
how it gets a display (icon/color/title) or how the type string reaches the dispatcher. Today the engine builds the
type as `action-${interaction}` (`dispatchLogEvent.js`), driven by the signal — but the fields operation has no
signal/interaction, so `planFieldsUpdate` must set the literal type itself (fine, but unstated). Separately, the
events module renders timeline rows from per-type display config (`event_types.yaml` in the demo); an unregistered
`action-fields-updated` renders without an icon or title unless the app or the module ships a default.

**Fix:** State that `planFieldsUpdate` stamps `type: action-fields-updated` directly (no signal), and decide where
its display config comes from — a module-shipped default in the events surface, or "apps register it like any custom
type." This is the same gap review-1 #2 closed for `fields_diff`; don't reintroduce an event-channel claim without
its plumbing.

## Smaller things

### 7. "drop `universal_fields_required` from the allowlist" is a no-op

> **Resolved.** Verified neither `ACTION_FIELDS` (makeWorkflowsConfig.js) nor `ACTION_FIELDS_FOR_TEMPLATE` (makeActionPages.js) contains `universal_fields_required`. Reworded the instruction to "do not add `universal_fields_required` … there is nothing to remove."

design.md:203 instructs the passthrough change to "drop `universal_fields_required` from the allowlist." That field
was only ever added in review-1 #11's _design-level_ resolution; it was never implemented — `ACTION_FIELDS` in
`makeWorkflowsConfig.js` and `ACTION_FIELDS_FOR_TEMPLATE` in `makeActionPages.js` contain `required_after_close` but
not `universal_fields_required`. So there's nothing to drop in code. Reword to "do not add `universal_fields_required`
to the allowlist (it was proposed in review-1 but is dropped here)" so the implementer doesn't go hunting for a line
that isn't there.

### 8. Metadata editable on a cancelled/completed workflow — intentional but unstated

> **Resolved.** Stated explicitly in both places: task 2 pins "a fields update on a `completed` workflow's action is legal regardless of `required_after_close`", and design.md's Lifecycle paragraph now says the same for the workflow lifecycle — `required_after_close` gates form _submit_ after close, not this operation; the divergence is deliberate.

design.md:151 says the operation is "editable in any stage the user has access to — including `done` /
`not-required` / `error`" with "no `required_after_close` interaction." That's about the _action's_ stage. It's
silent on the _workflow's_ lifecycle: can you reassign or re-date an action whose workflow is `cancelled` /
`completed`? `required_after_close` exists precisely because writes-after-close are normally gated. The decoupled
operation has no such gate, so as written, metadata is editable on a closed workflow's actions. That may be the
intended "metadata is always editable" stance — but say so explicitly (one sentence under "Lifecycle"), because it's
a deliberate divergence from how submit treats a closed workflow, and a reviewer will otherwise read it as an
oversight.

### 9. `comment` → `event.metadata.comment` flow is asserted, not anchored

> **Rejected — premise removed.** The comment no longer targets `event.metadata.comment` at all: Part 33 D2 drops the key everywhere; the operation's `comment` routes through `planEventDispatch`'s `comment` param and Part 33's `foldCommentIntoEvent` renders it into `display.{app_name}.description`. Design + tasks swept onto that route in review-3 #1.

design.md:108, :142, :261 route the optional `comment` payload to `event.metadata.comment`. Part 38 doesn't mention
`metadata.comment` (verified). The existing submit path does carry `comment` (`makeWorkflowApis` emits it today), so
the mechanism exists — but since Part 24 "owns the full write path" for this operation, cite where comment lands on
the event (the same place submit's does) so `planFieldsUpdate` has a concrete target rather than an assumed one.

## Summary

| #   | Severity | Finding                                                                                                                                                     |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | Part 39 still sends `fields` + the `^fields\.` regex; Part 24's decoupling premise is unmet and submit would re-clobber the fields. Reconcile both designs. |
| 2   | Moderate | Part 24 amends `planActionTransition.js` field-setting that Part 38 never specifies; pin the baseline or own the full block.                                |
| 3   | Moderate | Part 35 (`task`→`simple`) not in "Depends on" though the prose uses `kind: simple`.                                                                         |
| 4   | Moderate | `commitPlan` with no workflow write (no CAS) is unverified against Part 38's workflow-first commit.                                                         |
| 5   | Minor    | `renderStatusMap` lives in `shared/render/`, not among the `shared/phases/` helpers.                                                                        |
| 6   | Moderate | `action-fields-updated` event type lacks display registration + type-name plumbing.                                                                         |
| 7   | Minor    | "drop `universal_fields_required` from the allowlist" — it was never in the allowlist.                                                                      |
| 8   | Minor    | Metadata-editable-on-closed-workflow is an unstated deliberate divergence.                                                                                  |
| 9   | Minor    | `comment` → `event.metadata.comment` target asserted, not anchored.                                                                                         |

**Verified sound (no action):** the "write only the action doc, re-render the cell" rationale — the entity card
reads the cell from the action doc (`get-entity-workflows.yaml:62–71`), so skipping the workflow write is correct.
