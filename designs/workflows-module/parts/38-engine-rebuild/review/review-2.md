# Review 2 — Cross-design consistency after the concept edits landed

Scope: second review of Part 38, run after the review-1 actions were applied and
after the prerequisite concept edits (engine D4, submit-pipeline D3, the parent
`state-machine` row) actually landed in the tree. Verified against the current
concept docs (`state-machine`, `engine` D4 + D5, `submit-pipeline`), the engine
code under `plugins/modules-mongodb-plugins/src/connections/`, and
`WorkflowAPI/schema.js`.

**State of play.** Review-1 is fully actioned, and its finding #3 follow-ons are
genuinely resolved: the three model drifts (no `target_status`, no current-action
redirect, signal renames `submit_edit`→`submit` / `save_draft`→`progress`) are gone
from the design — no stale terms remain (`grep` for `submit_edit` / `save_draft` /
`target_status` / `force: true` finds only legitimate "removed/strip" references).
The prerequisite concept edits have poured: `engine/design.md` D4 is now
"Signal-driven FSM transitions," `submit-pipeline/design.md` D3 is "Per-template
button bars over the signal namespace," and the parent concept table has a
`state-machine` row. The Prerequisite's "assumes those edits are settled" is now
accurate.

The architecture still holds. The findings below are one correctness/consistency
contradiction against the cited authority, two under-specifications, and minor
schema-doc staleness.

## Correctness / consistency

### 1. The engine "auto-block" cascade contradicts state-machine.md — engine cascades are unblock-only

> **Resolved.** Verified against state-machine.md (line 110: `block` is "Pre-hooks only. The engine does not auto-block on `blocked_by` dep regression"; line 179: "engine cascades monotonic (unblock-only)"). Dropped `block` from the engine cascade everywhere in Part 38: D4 source-3 (now "auto-unblock re-evaluation … emit `unblock`", with `block` named as a pre-hook-only auxiliary signal via `preHookResult.actions[]`), D4 fixpoint paragraph (reframed unblock-only; the bound is now trivial — each action unblocks at most once), data-flow line, `planAutoUnblock.js` files-changed entry, and `planAutoUnblock.test.js` (now asserts the engine never auto-emits `block`). Pre-hook-driven `block` is unaffected — it resolves through the same FSM as a source-2 auxiliary signal.

Part 38 repeatedly describes the `blocked_by` re-evaluation as an
**auto-unblock/auto-block** fixpoint that emits *both* signals:

- Proposed change framing (D4, line 127): "auto-unblock/auto-block re-evaluation …
  Emit `unblock`/`block`/… signals against affected actions."
- D4 (line 129): "Auto-unblock/auto-block is itself a fixpoint over the Plan … The
  planner iterates until no further **unblocks/blocks** fire." The termination
  argument leans on `block` as a cascade signal ("`block` from `action-required`
  goes to `blocked`, which only accepts `unblock`/`activate` from this submit's
  cascade signals").
- Files changed (line 512): "`planAutoUnblock.js` — fixpoint loop … emits
  **unblock/block** signals via the FSM."
- Data-flow diagram (line 410): "auto-unblock/auto-block fixpoint over the
  in-progress Plan."

state-machine.md — the cited authority — says the opposite, explicitly and in two
places:

- "How signals get emitted" → `blocked_by` re-evaluation (line 196): "The engine
  does *not* emit `block` on dep regression — once unblocked, an action stays
  unblocked unless an author explicitly re-blocks it via a pre-hook. This keeps
  engine cascades **monotonic (unblock-only)** and reserves `block` as a deliberate
  author signal."
- Signal inventory (line 127): `block` is **"Pre-hooks only. The engine does not
  auto-block on `blocked_by` dep regression."**

`engine/design.md` D4 agrees — its engine-cascade emitter list is "`unblock` on
`blocked_by` satisfaction, `internal_mirror_child_*` …, `internal_cancel_action`"
with no `block`. And this was a deliberate, reviewed decision: state-machine.md's
own review-1 #2 resolution reads "changed the engine's `blocked_by` re-evaluation to
be unblock-only — the engine never auto-emits `block` … This keeps engine cascades
monotonic and removes the 'engine retroactively blocks a remediating user' UX
concern."

So Part 38 ships an engine cascade that the model it implements forbids. This isn't
cosmetic: `planAutoUnblock.js` as specced would re-block dependents on dep
regression, which is exactly the behavior state-machine.md removed. Review-1's own
"What checks out" note even flagged the correct semantics ("engine cascade is
unblock-only per state-machine.md") — the design text didn't get updated to match.

**Fix.** Drop `block` from the engine cascade everywhere in Part 38:
- D4 line 127: "auto-unblock re-evaluation … emit `unblock` signals" (engine emits
  `unblock` only; `block` stays a pre-hook auxiliary signal that arrives via
  `preHookResult.actions[]`, resolved through the same FSM call — that path is fine
  and should be named as the *only* `block` source).
- D4 line 129: reframe the fixpoint as unblock-only. The termination argument gets
  *simpler*, not weaker — a monotonic unblock-only cascade is trivially bounded
  (each action unblocks at most once; `unblock` no-ops from every non-`blocked`
  state per the FSM). Delete the `block`-based half of the bound argument.
- Files changed line 512: "`planAutoUnblock.js` — fixpoint loop … emits `unblock`
  signals via the FSM" (pre-hook `block` entries are planned by
  `planActionTransition`, not by the auto-unblock fixpoint).
- Data-flow line 410 and the worked example: "auto-unblock fixpoint."

Pre-hook-driven `block` is unaffected — it's an `actions[]` auxiliary signal and
resolves through the FSM like any other. The change is purely removing *engine*
auto-emission of `block`.

## Moderate

### 2. Whole-doc `$set` (Q1/D9) silently supersedes engine D5's per-field form_data write contract

> **Deferred to open questions (Q6).** Valid, and bigger than the supersession framing. Reference-project archaeology (`device-installation` site-check) shows D5's per-field `$set` protects a *sequential* requirement — a single action accumulates form_data across multiple submits of different shapes (submitter overwrites its namespace; reviewer scopes `$set` to `workflows.site-check.validation` only), not just concurrency. Whole-doc `$set` can meet it only with a deep-merge-onto-loaded rule, and the imperative model's per-handler write flexibility (replace vs scoped-merge, removal-by-omission, array handling) doesn't reduce cleanly to one declarative rule. Concurrency trade (CAS-serialize instead of field-merge) is **accepted**. Recorded as design Q6 with the prod evidence; the D5 reframe + supersession annotation become bookkeeping once the merge rule is chosen.

`engine/design.md` Decision 5 ("Form data layout") specifies the workflow write as
**field-level**:

> **Write semantics.** `SubmitWorkflowAction` writes form fields via per-field
> Mongo `$set` on dot-notation paths. Field-level granularity (**not a wholesale
> `form_data.{action} = { ... }` overwrite**) so concurrent edits on different
> fields of the same action don't clobber each other.

Part 38 commits the workflow as a **whole-doc `$set`** of the planned doc:

- D9 step 1 / worked example commit block:
  `findOneAndUpdateDoc(workflows, { _id, "updated.timestamp": … }, { $set: plan.workflow.doc })`.
- Q1 "Lean: whole-doc for workflow + actions."
- D3: "The commit phase does `findOneAndUpdate` with a `$set` of the whole doc
  minus `_id`."

This is precisely the "wholesale overwrite" engine D5 says not to do, and it
changes the concurrency story D5 relied on. D5's field-level merge let two
concurrent submits writing *different* fields both succeed. Under Part 38's
whole-doc `$set`, that race is instead caught by CAS on `updated.timestamp` (D15) —
the second submit's filter misses and it throws `ConcurrentSubmitError`. That is a
*defensible* trade (CAS is simpler and also protects summary/groups, which
field-level `$set` never did), but it's a real behavioral change — lower write
concurrency on the same workflow — and Part 38 makes it without acknowledging that
it supersedes engine D5.

This is the same supersession pattern review-1 #3 cared about: engine D4 and
submit-pipeline D3 got explicit "superseded by state-machine" annotations. Engine
D5's write semantics now need the same treatment.

**Fix.** Either (a) annotate engine D5's "Write semantics" / "Engine effects"
paragraphs that Part 38 replaces per-field `$set` with whole-doc `$set` + CAS, with
a one-line pointer to D15; or (b) add a sentence to Part 38 D9 (or D15) stating it
supersedes engine D5's field-level write contract and that the per-field clobber
case is now covered by CAS (one submit wins, the other retries). Confirm the
intended trade — CAS-throw instead of field-merge — is acceptable for the demo's
real flows. (b) plus a stub annotation on D5 is cleanest.

### 3. Event render context is specified only for the action event — Start/Cancel/Close lifecycle events are left undefined

> **Resolved.** Added a distinct workflow-lifecycle event render context to D12 — `{ user, workflow, interaction }` — matching what the lifecycle engine-default templates reference (`user.profile.name`, `workflow.workflow_type`). `planEventDispatch` branches on handler/event type: action events (`action-{interaction}`, tracker-mirror) get the full action-event context; lifecycle events (`workflow-started`/`-cancelled`/`-closed`) get the workflow-only context. Updated the `planEventDispatch.test.js` bullet to assert the two context shapes separately. Kept the lifecycle context minimal (no extra bindings) per "build for what exists."

Proposed change #11 and "Engine entry points emit events" add four new
workflow-lifecycle events (`workflow-started` / `workflow-cancelled` /
`workflow-closed`, plus tracker-mirror). D12 then defines the **event render
context** — but only the *action* event context:

```js
const renderCtx = {
  user, action: plannedActionDoc, workflow: plannedWorkflowDoc,
  interaction: signal, status_before: …, status_after: …,
  submitted_form: planInputs.mergedFormData,
};
```

Four of those six bindings (`action`, `status_before`, `status_after`,
`submitted_form`) are meaningless for Start / Cancel / Close, which operate on the
whole workflow and have no single target action and no submitted form. Yet
`planEventDispatch.test.js` (test strategy) is asked to assert "render context
bindings (`user`, `action`, `workflow`, `interaction`, `status_before`,
`status_after`, `submitted_form`)" *and* "per-event-type defaults
(`workflow-started` / `action-{interaction}` / `workflow-cancelled` /
`workflow-closed`)" — i.e. the same context across both, which can't hold. The
engine-default templates in the events table only reference `user.profile.name` and
`workflow.workflow_type`, confirming the lifecycle events want a smaller context.

The action-event context is also new for Cancel sweeps in another way: Cancel
transitions many actions but (per Q5) emits one workflow-level event with no single
`action`.

**Fix.** Specify a distinct workflow-lifecycle event render context in D12 — e.g.
`{ user, workflow: plannedWorkflowDoc, interaction }` — and state that
`planEventDispatch` branches on handler/event type (action events get the full
context; workflow-lifecycle events get the workflow-only context). Update the
`planEventDispatch.test.js` bullet so the two context shapes are asserted
separately.

## Minor

### 4. `WorkflowAPI/schema.js` carries two now-false descriptions the design doesn't flag for update

> **Resolved.** Verified both stale descriptions in `schema.js` (line 39 `changeLog` "forwarded to the community-plugin … automatically"; lines 83–84 `actionsEnum` priority "load-bearing — the engine compares priorities in the priority-rule check"). Added both rewrites to Part 38's "Connection schema (`WorkflowAPI/schema.js`)" section and the Files-changed entry: `actionsEnum[].priority` → "display-only … the engine no longer consults it for transition legality"; `changeLog` → native engine consumption rather than plugin forwarding.

Per CLAUDE.md, the manifest/schema is the source of truth and its descriptions must
track the design. Part 38's "Connection schema (`WorkflowAPI/schema.js`)" section
(and Files changed) only mentions adding `entry_id` and "keeping" `changeLog`. But
two existing descriptions in `schema.js` are made false by this part:

- **`actionsEnum`** (schema.js): "Each entry MUST carry priority (**load-bearing —
  the engine compares priorities in the priority-rule check in
  SubmitWorkflowAction**)." The priority-rule check is exactly what this part
  removes; engine D4 now says "`priority` is display-only now." The description
  should be rewritten to "priority is display-only (ordering in pickers /
  visualizations); the engine no longer consults it for transition legality."
- **`changeLog`** (schema.js): "Optional changeLog config **forwarded to the
  community-plugin MongoDBCollection handlers** … writes every workflow + action
  mutation … **automatically**." Under D7/D8 the engine consumes `changeLog`
  **natively** and bypasses the plugin for engine writes — the "forwarded to the
  community plugin … automatically" framing is no longer true. D7 already says as
  much in prose; the schema description needs to match.

**Fix.** Add both description rewrites to Part 38's `schema.js` file-changed entry
(it currently reads as "add `entry_id`" only). Small, but it's the kind of stale
manifest text CLAUDE.md calls out specifically.

### 5. `fsm/tables.js` shipping a separate `simple` table invites form/simple drift

> **Resolved.** Verified state-machine.md line 144 ("Identical to the form-kind table above — no specialization"). Updated the `tables.js` files-changed note to specify `simple` is aliased (`FSM_TABLES.simple = FSM_TABLES.form`), not a hand-maintained copy, per "One correct way." `tables.test.js` now asserts the alias identity (`FSM_TABLES.simple === FSM_TABLES.form`) instead of re-testing every simple cell.

Files changed: "`tables.js` — exports the three FSM tables (form, simple, tracker)."
state-machine.md "Simple kind" is unambiguous: **"Identical to the form-kind table
above — no specialization, no parameterized signal."** Shipping `simple` as a
hand-maintained second copy of the form table means a future edit to one can silently
diverge from the other, and the "exhaustive `tables.test.js`" would then encode the
divergence as intended. Per CLAUDE.md "One correct way," alias rather than duplicate:
`FSM_TABLES.simple = FSM_TABLES.form` (or resolve `simple`→`form` in `resolveSignal`),
so there is one form/simple table and the identity is mechanical, not a convention a
maintainer must remember. Worth one line in the Files-changed note so the
implementer doesn't copy-paste two tables.

## What checks out (re-verified this pass)

- The three review-1 #3 model drifts are fully reconciled in the design text
  (`submit_edit`/`save_draft`/`target_status`/current-action-redirect all gone).
- Prerequisite concept edits landed (engine D4, submit-pipeline D3, parent
  `state-machine` row) — the Prerequisite's "settled" claim is now true.
- Notifications in the Plan are **not** speculative: `dispatchNotifications.js` is a
  real step-8 in today's `handleSubmit`, so Plan `notifications[]` + commit step 4
  carry an existing concern forward (no "build for what exists" violation).
- `new-event.yaml` accepts a caller-supplied `_id` and derives `date`/`created`
  server-side without rendering — consistent with the resolved review-1 #6 (engine
  doesn't snapshot the event into `log-changes`; the events module logs itself).
- Tracker mirror signals (`internal_mirror_child_active/_completed/_cancelled`) and
  the per-fire `depth` guard match state-machine.md's tracker table and the
  carried-over `MAX_DEPTH = 10` from `fireTrackerSubscription.js`.
- CAS pins `updated.timestamp` (scalar), matching the `ChangeStamp` shape in code
  and the resolved review-1 #5.
