# Review 1 — Internal Consistency & Edge Cases

The model change is sound — signals + per-state FSM resolves the priority-rule frictions cleanly, and the worked examples are convincing. Findings below are internal-consistency gaps, regression cases the FSM tables drop silently, and a few wart-level concerns worth resolving before this design lands and the engine/submit-pipeline sub-designs get rewritten against it.

## Table / inventory inconsistencies

### 1. `block` signal source states disagree between the signal inventory and the form FSM table

> **Resolved.** Widened the form FSM table so `changes-required` and `error` accept `block` (matching the inventory). Separately changed the engine's `blocked_by` re-evaluation to be unblock-only — the engine never auto-emits `block` on dep regression. `block` is now a pure author signal: pre-hooks emit it deliberately when they want a dependent re-blocked. This keeps engine cascades monotonic and removes the "engine retroactively blocks a remediating user" UX concern that motivated the original narrow table reading.

The signal inventory (line 98) lists `block` source states as `action-required, in-progress, in-review, changes-required, error`. The form FSM table (lines 120–129) shows `—` in the `block` column for both `changes-required` and `error`:

```
| `changes-required`     | … | — | `not-required` | — | — | — | — | `action-required` | — | `not-required` |
| `error`                | … | — | —              | — | — | `in-review` | — | `action-required` | — | `not-required` |
```

This matters: the engine `blocked_by` re-evaluation is documented to fire `block` whenever a dependency goes non-terminal. If `changes-required` and `error` actions silently ignore `block`, then a workflow whose dep regresses while one of its dependents is `changes-required` ends up with that dependent still in `changes-required` (its inputs may now be stale) instead of being pushed back to `blocked`. Pick one — either widen the table or narrow the inventory — and update both. (My reading is the table is correct and the inventory is overly broad; `changes-required` is already a user-driven "we sent this back, fix it" state, and re-blocking it on dep regression is more confusing than letting the submitter rework with current info. Same call for `error`.)

### 2. The "task" (now `simple`) FSM table is not tabulated, only described in prose

> **Resolved.** Simple kind is now stated as **identical to the form-kind table** — and that's literally true, because the `submit_edit → blocked/error` special case is gone (see #6: the status selector / `target_status` is removed). The Simple kind section enumerates the signals it listens to and points at the form table as its source of truth, rather than re-tabulating. The `task` → `simple` rename was already applied across the design (the only remaining "task" is the English word in the Risks section). Decision also drove a model fix: `error` is reachable for every kind via a new author-cascade `error` signal (the inventory had no path into `error` at all — a dropped v0 regression).

Lines 132–136 say:

> Same as form kind, with one specialization on `submit_edit`: … `target_status ∈ { done, blocked, error, not-required }`.

But the form FSM table has no rows for `submit_edit → blocked` or `submit_edit → error`. "Same as form kind" therefore can't be literally true. Either tabulate the simple-kind table explicitly (preferred — the whole point of this design is that the FSM is the source of truth) or rephrase to "form kind table, plus the following overlay on `submit_edit`."

Related: the rename from `kind: task` → `kind: simple` is already accepted in [parts/35-rename-task-kind-to-simple/design.md](../../../workflows-module/parts/35-rename-task-kind-to-simple/design.md). The state-machine design still uses "task kind" throughout (lines 131, 134, 138). Flip to `simple` so the design lands consistent with the kind rename.

## Regressions the FSM silently introduces

### 3. `not_required` is unreachable from `in-review`

> **Resolved.** Widened the form FSM table so `in-review` and `error` accept `not_required`, and widened the inventory's source-state list accordingly. Codified a new **Signal source-state principle** subsection in the design: signals express intent; the FSM accepts them from any current state where the intent is coherent; the FSM no-op is reserved for structural safety (re-fire against terminal states) and semantic contradiction. Page templates do the user-side gating independently. `done → not_required` stays excluded as semantic contradiction (done means "applied + completed"; not-required means "didn't apply"). `unblock` stays narrow to preserve re-fire safety. Resolution also informs #4.

Form table line 125: in-review row, `not_required` column = `—`. Today's priority rule allowed `in-review(4) → not-required(0)` (lower priority). A reviewer realising mid-review "this case actually doesn't apply" could mark it `not-required` directly; under the new FSM they have to either (a) `request_changes` back to the submitter and have the submitter click `not_required`, or (b) author a pre-hook chain that emits `activate` then `not_required`.

Either widen the row to `in-review → not_required → not-required`, or document explicitly that reviewers cannot terminate as not-required without round-tripping through the submitter. The signal inventory line 88 doesn't list `in-review` as a source for `not_required` either — so this is intentional, but the design doesn't explain why. A line of rationale would help. Same question for `error → not_required` (line 127, also `—`).

### 4. Tracker `not-required` is a hard sink — drops the "child uncancelled" recovery path

> **Resolved.** Widened the tracker FSM table: `done` and `not-required` rows now accept the relevant `internal_mirror_child_*` signals so the parent recovers when the child re-activates or completes after the tracker landed terminal. Updated the inventory source-state lists for the three `internal_mirror_child_*` signals to match. Updated the Terminal states subsection to articulate why trackers are kind-specific: tracker terminality is always conditional on the child's terminality, so a child reversal must reverse the tracker. Resolves the engine D4 case for `force: true` on tracker writes.

Tracker FSM table line 147: `not-required` row has zero outgoing transitions. Engine sub-design Decision 4 explicitly called out the inverse case as a real reason for `force: true` on tracker writes:

> "the child-stage map permits backward moves too (e.g. a child workflow uncancelled would push the parent from `not-required` back to `in-progress`, which violates strict-lower-priority and the universal-terminal rule)" — [engine/design.md:441](../../engine/design.md)

Under the new FSM, `internal_mirror_child_active` against a `not-required` tracker no-ops silently. The parent workflow is now permanently divergent from its child if the child re-activates. The Risks section (line 310) gestures at this ("Worth confirming no app currently force-writes a tracker action to a status the FSM doesn't permit") but doesn't resolve it. Either:

- Add `not-required → internal_mirror_child_active → in-progress` (and the `_completed` / `_cancelled` rows) explicitly, with rationale that engine-internal mirroring is allowed to reverse author "not applicable" decisions because the engine, not an author, owns tracker state; or
- Document that child-workflow uncancel is an out-of-band admin operation, same as undoing `not-required` on a form action.

Same question for the unaddressed `done → internal_mirror_child_*` rows: a tracker that landed in `done` because the child completed, then the child gets uncancelled (or a new sibling fires), can't update. The current FSM gives no path back.

### 5. Tracker is missing the `block` signal

> **Rejected.** The premise dissolves with #1's resolution. The engine no longer auto-emits `block` on `blocked_by` regression (only `unblock`), and trackers don't accept pre-hook signals (only `internal_mirror_child_*` + `unblock` + `internal_cancel_action`). So there's no emitter that could fire `block` at a tracker; the column would be unreachable. Trackers can still _start_ in `blocked` because that's the kind's default initial status when `blocked_by` is unsatisfied at workflow start, not a `block` signal transition.

Trackers can start in `blocked` ([parent design.md worked example](../../design.md), `track-installation, status: blocked`) and therefore have `blocked_by` deps. The tracker FSM (lines 141–148) has no `block` column at all. So if a tracker is `action-required` and its dep regresses, the engine fires `block` and the tracker no-ops — stays `action-required` despite unmet deps.

Add `block` to the tracker table, mirroring the form table's coverage. If trackers shouldn't accept author-emitted `block`, the inventory can scope `block` to engine-only for tracker kind without needing the `internal_*` prefix — but the FSM row still needs to exist for the `blocked_by` re-evaluation path.

## Model warts

### 6. `submit_edit` is the only parameterized signal — breaks the uniform model

> **Resolved.** Removed the parameter entirely rather than documenting it. Simple actions no longer carry a status selector or `target_status` / `current_status` payload — they emit the same **nullary** signals as form actions (`submit`, `progress`, `not_required`, `approve`, `request_changes`, plus cascade signals). The simple FSM table is now literally the form table. Pushing a simple action straight to `blocked` / `error` is a pre-hook `block` / `error` cascade, not a self-set. Also renamed `submit_edit` → `submit` throughout (pure verb, pairs with `progress`, reads correctly as re-submit from `changes-required` / `done`) and `save_draft` → `progress` (unifies form "save draft" + simple "mark started"). Removal of the selector is recorded in Supersedes (submit-pipeline D3, ui `simple-edit`) and the Next-step list re-specs the ui page. Note: `submit` still resolves `in-review` vs `done` from the action's _static_ review verb — that's a build-time branch, not a runtime payload parameter, so the nullary framing holds.

Lines 132–134 introduce `target_status` as a payload field on the `submit_edit` signal for simple/task kind. Every other signal in the inventory is nullary (signal name fully determines the transition). The design calls this out as "the one piece of FSM dynamism in v1" — but presenting it as a parameter on a single signal in a single kind, hidden inside prose, is the kind of one-off that creates ongoing confusion.

Two cleaner shapes:

- **One signal per terminal target.** `submit_done`, `submit_blocked`, `submit_error`, `submit_not_required` on simple kind. The selector picks the signal name; the FSM is fully tabulated. This is the path the design's own "Interactions are signals; signals are nullary" framing implies.
- **Keep `submit_edit` parameterized but document the parameter on the signal itself in the inventory.** Make it explicit that simple-kind `submit_edit` carries `target_status`, list the allowed values, show it in the table even if the cell reads `target_status` instead of a concrete status.

Picking either is fine; the current shape (nullary everywhere except one undocumented case for one kind) is the worst option.

### 7. `request_changes` on the view template is a user-facing change beyond the FSM scope

> **Deferred to ui sub-design.** The decision is the recommended option 2: surface `request_changes` on the view template but gate it on the `review` verb so plain viewers don't see it. But the authoritative per-template button-bar spec + access gating belongs to ui (Next-step item 3 / Supersedes), not the state-machine model — the model's only stake is that `done → request_changes → changes-required` is a valid transition. To avoid this doc preempting ui, the "Templates and buttons" table is now marked illustrative, and the `view` row's `request_changes` is tagged "(gated on `review` verb — ui sub-design)."

Line 210, the templates table: `view` template surfaces `request_changes (modal for comment)`. Today's submit-pipeline (Decision 3, line 145) only surfaces `request_changes` on the `review` template. Adding it to `view` means any user who can see a `done` action can demand changes from it — a new UX surface, not just a model change. The FSM table technically supports it (`done → request_changes → changes-required`), but the page-template change should be called out explicitly in "What gets added" (line 226) and probably gated on access verbs (presumably only reviewers should see the button on the view page).

The design's framing is "page templates declare which signals surface as buttons" (line 11), so this is in scope — but the leap from "the FSM permits it" to "the default view template ships the button" is silent. Either drop it from the default view button bar and add it as an opt-in per app, or document the access gate explicitly.

## Smaller items

### 8. Unknown signal names silently no-op — combined with the build-time validator gap, typos leak

> **Resolved.** Adopted the recommendation. Added a "Unknown signal names throw; unlisted transitions no-op" subsection: the engine throws at handler entry on any signal outside the locked v1 vocabulary (matching Open Question 2's "missing target throws"), while a _valid_ signal against a state that doesn't list it still no-ops (the structurally meaningful case that re-fire safety depends on). Reframed the build-time-validator risk from "only safety net, deferred" to a nice-to-have, since typos now hard-fail at runtime.

Risks section line 308 says runtime treats unknown signal names as no-ops (same as unlisted transitions). Combined with the build-time validator being deferred (also flagged as a risk), a pre-hook returning `{ signal: notrequired }` (missing underscore) or `{ signal: requestChanges }` (camelCase typo) silently produces no transition. Open question 2 (line 302) resolves the missing-target case as "throw" but punts on missing-signal-name as no-op.

Recommendation: treat unknown signal names the same as missing targets — throw. The vocabulary is engine-locked in v1 (Non-goals line 294), so the engine has a complete known-signal list at handler entry and can validate cheaply. Soft no-op for _unlisted transitions_ (signal valid, state doesn't accept it) is structurally meaningful — it's what makes re-fire safety work. Soft no-op for _typo'd signal names_ is just losing programmer errors.

### 9. The engine D3 pseudo-code contradiction is noted in "Next step" but not in the migration audit

> **Resolved.** Largely already addressed in engine/design.md: D3 has been rewritten to the signal model — `pushWorkflowStatus` recurses into `emitSignal(tracker, internal_mirror_child_*)` calling the same handler (engine:296 / :370), and the 2-level nested auto-complete worked example is already in signal terms (engine:386+). The recursion shape is unchanged from the priority-rule version, which is exactly the confirmation this finding asked for. Updated state-machine Next-step item 1 to note D3 is already done (recursion preserved) rather than listing it as pending, so the concrete pseudo-code spot isn't mistaken for outstanding work.

Lines 314–319 list four follow-ups (update engine D4, submit-pipeline D1/D3, ui design, pre-hook validator). The engine D3 pseudo-code (engine/design.md:240–296 — `pushWorkflowStatus`, `updateAction(..., force: true)`) is the concrete spot where the change happens. Worth calling out specifically in the next-step list so it doesn't get missed when engine D3's tracker subscription is rewritten to emit `internal_mirror_child_*` signals.

Also worth confirming in this design: the recursion shape stays the same. Today's `pushWorkflowStatus` recurses into `updateAction`; under the new model it should recurse into `emitSignal(tracker, internal_mirror_child_*)` which calls the same handler. The 2-level nested auto-complete worked example in engine D3 should keep producing the same end state — worth a one-paragraph confirmation.

### 10. Pre-hook root-level `{ signal }` redirect: how does it compose with the engine default?

> **Resolved by removing the feature.** Investigating this finding surfaced that the root-level `{ signal }` current-action redirect was unjustified: it's a v0 carry-forward, flagged as unproven by the design's own Open Question 1, redundant with `actions[]` self-targeting except for status-history cleanliness, and sidestepped by the canonical conditional-landing pattern (a separate thin action — worked example 4). The redirect has been **removed** across state-machine, submit-pipeline (D2/D4 + lifecycle diagram + audit-log note), engine (D4/D5), and action-authoring. The current action now always lands per the signal the user fired; all pre-hook signal emission is cross-action via `actions[]`; failing the current submission uses `:reject` / `throw`. Open Question 1 was deleted (the redirect it concerned is gone). The composition/audit questions this finding raised are therefore moot — with no redirect, the recorded event `signal` and `status_after` always reconcile against the FSM table.

Open question 1 (line 300) asks whether `{ signal }` at the root is concrete enough. One follow-on the design doesn't address: if the user clicked `submit_edit` and the pre-hook returns `{ signal: not_required }`, does the engine fire _only_ `not_required`, or does it fire both? Submit-pipeline Decision 3's interaction-to-target-status table had three-layer precedence (engine default → action-YAML `interactions[interaction].status` → pre-hook `status`); under the new model that collapses to one signal-firing event. The design implies "replace" (line 186: "replaces the user-clicked interaction for the current action") but doesn't say what happens to the original signal's audit trail. Worth one sentence — does the events-log entry record `submit_edit` (what the user clicked) or `not_required` (what the engine fired)?

## Suggested next step

Resolve findings 1, 2, 4, 5, 6, 7 inline in the design (table inconsistencies and missing tracker rows are mechanical; the `submit_edit` parameterization needs a model call). Findings 3 and 8 can resolve via a single sentence each (rationale or behaviour clarification). Findings 9 and 10 are flagged for the follow-on rewrites.

Once consistent, the design is ready to drive the engine D4 and submit-pipeline D1/D3 rewrites.
