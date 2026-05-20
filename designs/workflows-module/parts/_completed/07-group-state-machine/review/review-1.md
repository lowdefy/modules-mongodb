# Review 1 — Part 07 Group state machine

Focus: contract drift against shipped code (part 4's validator, part 5's `StartWorkflow`, the engine spec's status-push guards), lifecycle-numbering disagreement with part 6, and a small set of substantive gaps that will trip implementation if left implicit.

## Substantive issues

### 1. Auto-complete bullet attributes the workflow-status push to the priority rule — wrong guard

> **Resolved.** Rewrote the auto-complete bullet around `pushWorkflowStatus` and the same-stage no-op guard from [engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency); explicitly noted that workflow lifecycle has no priority numbers and called out the auto-recursion case (part 10 tracker push) as the reason the guard is restated. Fix from finding 10 (name the helper) is folded into the same rewrite.

[design.md:46](../design.md):

> After group + `blocked_by` re-evaluation, if every action is terminal, push `{ stage: completed }` to the workflow's status array (subject to the same priority rule).

Workflow status pushes are **not** governed by the priority rule. The engine spec is explicit at [engine/spec.md:294](../../../workflows-module-concept/engine/spec.md):

> **Workflow status pushes** have no priority ordering. Guarded by a same-stage no-op check at the top of `pushWorkflowStatus` — reads `status[0].stage`, returns early if it equals the new stage. Prevents duplicate `$push` and double-firing tracker subscription on retry.

And the worked example at [engine/spec.md:344](../../../workflows-module-concept/engine/spec.md#worked-example-2-level-nested-auto-complete) shows the same-stage guard explicitly: `same-stage guard: B.status[0]='active' ≠ 'completed' → proceed`. The priority rule applies only to action status (which has the 8-value priority enum); workflow lifecycle is a 3-value enum with no priority numbers (see [enums/workflow_lifecycle_stages.yaml](../../../../modules/workflows/enums/workflow_lifecycle_stages.yaml) — `active`, `completed`, `cancelled`, no priorities).

This matters because:

- A retry that lands after the workflow already auto-completed should no-op, not "be rejected because priority(completed) is not less than priority(completed)" — the rule doesn't compose for workflows at all.
- Cancellation + auto-complete interaction: a workflow at `cancelled` could be pushed to `completed` under a priority rule (cancelled has no priority); the same-stage guard plus the terminal-workflow gate (part 6 step 1) are what actually prevent that path.

**Fix.** Rewrite [design.md:46](../design.md):

> After group + `blocked_by` re-evaluation, if every action is terminal, call `pushWorkflowStatus(workflowId, 'completed', eventId)` — which applies the same-stage no-op guard from [engine spec § Idempotency](../../../workflows-module-concept/engine/spec.md#idempotency) (reads `status[0].stage`, returns early on equality). No priority rule for workflow lifecycle. Skipped entirely when the workflow is already in a terminal stage (`completed` / `cancelled`) — the terminal-workflow gate in part 6 step 1 would have rejected the submit before reaching this point, but the guard is restated here for the auto-recursion case (tracker subscription's parent push from [part 10](../10-tracker-subscription/design.md) may re-enter this handler).

### 2. `blocked_by` re-evaluation bullet — "subject to the priority rule" is right for actions, but two adjacent statements muddy the contract

> **Resolved.** Rewrote the walk bullet to name `shared/updateAction.js`, spell out the priority pass (`action-required` (6) < `blocked` (7)), and note the same-stage no-op. Finding 14's self-exception note folded into the same bullet.

[design.md:38](../design.md):

> If its `blocked_by` is now fully satisfied (every entry resolves to terminal action or `done` group), push `action-required` (subject to the priority rule).

This one is correct in isolation — `action-required` (priority 6) onto a `blocked` (priority 7) action passes `priority(new) < priority(current)`. But pairing the same phrase with the (incorrect) auto-complete attribution above invites a reader to read both as "the engine has one priority rule that covers everything." It doesn't.

**Fix.** Tighten the phrasing to disambiguate. Either:

- Spell it out: "push `action-required` via `updateAction` (the priority rule allows `action-required` < `blocked`; same-stage on already-`action-required` actions no-ops);" or
- Cross-link to the priority rule once at the top of the section ("All action-status pushes in this part go through `shared/updateAction.js` and inherit part 6's priority-rule semantics") and stop restating "subject to the priority rule" on every bullet.

### 3. Build-time `blocked_by` resolution validation is still unbuilt — part 4 deferred it to "part 7," and part 7 doesn't pick it up

> **Resolved.** Added a dedicated "Build-time `blocked_by` resolution check" sub-section to "In scope" naming `makeWorkflowsConfig.js` as the seam and pointing at the deferral; tightened the resolution bullet to call out part 4's existing collision check vs the new resolution check; added a `makeWorkflowsConfig.test.js` verification entry; updated "Depends on" to reflect that part 7 extends the resolver (not just reads its output). Cost is O(N × B̄) hash lookups per workflow — negligible at realistic scales.

[design.md:30–31](../design.md):

> For each entry in `blocked_by`, first match against declared `action_groups[].id`; if matched, evaluate against that group's persisted status (`done` ⇒ unblocked). Otherwise match against an action `type`; evaluate against the action's status. Build-time validation in [part 4](../04-workflow-config-schema/design.md) already prevents collisions.

This says collisions are caught at build, which is true ([makeWorkflowsConfig.js:109–118](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)). But the _other_ build-time check from the concept spec — that every `blocked_by` entry resolves to _something_ (a declared group or a declared action type) — was deferred by part 4 _to part 7_:

> [part 4 design.md:28](../04-workflow-config-schema/design.md):
>
> - `blocked_by` resolution → part 7 (group state machine reads `blocked_by` for the unblock walk).

And the concept spec at [action-groups/spec.md:57](../../../workflows-module-concept/action-groups/spec.md):

> Otherwise → build-time error.

Part 7's design doesn't mention adding this validator. The result: with neither part 4 nor part 7 owning it, an unknown `blocked_by` entry silently never unblocks (the resolution falls through both branches at runtime), producing a permanently-blocked action with no error surfaced. This is exactly the silent-foot-gun class the build-time validator is supposed to catch.

**Fix.** Add an "In scope" bullet to part 7:

> **Build-time `blocked_by` resolution check.** Extend `modules/workflows/resolvers/makeWorkflowsConfig.js` to walk every action's `blocked_by` and verify each entry resolves to either a declared `action_groups[].id` or a declared `actions[].type` in the same workflow. Fail the build with a precise message naming the action and the unresolved entry. Picks up the deferral from [part 4 design.md:28](../04-workflow-config-schema/design.md).

This is also the one spot where part 7 touches the resolver (not just the engine handler), so verification needs a unit-test fixture in `makeWorkflowsConfig.test.js`.

### 4. Lifecycle step numbering disagrees with part 6 and is internally inconsistent

> **Resolved.** Added a "Lifecycle ordering" sub-section at the top of "In scope" with a table pinning sub-steps 4a (group recompute), 4b (`blocked_by` walk), 4c (auto-complete stage) between part 6's step 4 and step 5; pinned that step 5 now writes `summary`, `groups[]`, and the (optional) auto-complete status push in one `$set`. Reconciled the `groups[]` persistence / `blocked_by` walk / auto-complete bullets to reference the new sub-step numbering.

[design.md:21](../design.md):

> Eager writeback on every `SubmitWorkflowAction` call (lifecycle step 5 — promoted from "summary only" to "summary + groups").

Part 6 [design.md:60](../06-submit-action-writes/design.md) commits to submit-pipeline numbering:

> 5. **Recompute workflow summary** — counts only. `groups[]` defer to part 7.
> 6. **Write `form_data`** — ...

So in part 6's numbering, step 5 is "Recompute workflow summary." Part 7 says it's promoting step 5 to "summary + groups" — fine, that lines up. But the rest of part 7's flow refers to "step 4 writes a transition" ([design.md:35](../design.md)) which matches part 6's step 4 ("Write action transitions") — good.

Then [design.md:46](../design.md) says "after group + `blocked_by` re-evaluation, ... push `completed`" — but doesn't number this. In part 6's numbering, there's no dedicated auto-complete step in the 11-step lifecycle; the engine spec's _internal_ write-ordering view ([engine/spec.md:318](../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation)) has auto-complete as its step 6, but that's a different numbering (engine spec's internal order has 10 sub-steps; submit-pipeline has 11; part 6 follows submit-pipeline).

Net: part 7 silently adds the auto-complete check and the `blocked_by` re-evaluation step **between** part 6's step 5 (summary recompute) and step 6 (form_data write), with no map of which-goes-where. A reader of part 7 cannot tell:

- Whether the `blocked_by` re-evaluation runs before or after summary recompute.
- Whether `groups[]` writeback happens inside step 5 (alongside summary) or as a new step between 4 and 5.
- Where auto-complete sits relative to all of this.

Part 6's review-1 specifically called out this same problem (finding 11) and resolved it by adding a one-line cross-link to engine spec's alternate write-ordering view. Part 7 needs the equivalent.

**Fix.** Add a short "Lifecycle ordering" sub-section at the top of "In scope" that pins:

| Sub-step                                                                          | Owner                             | After                             | Before                     |
| --------------------------------------------------------------------------------- | --------------------------------- | --------------------------------- | -------------------------- |
| Recompute affected `groups[]`, write to workflow doc                              | Part 7                            | Step 4 (write action transitions) | `blocked_by` re-evaluation |
| `blocked_by` re-evaluation walk (push `action-required` on satisfied blocks)      | Part 7                            | `groups[]` writeback              | Auto-complete check        |
| Auto-complete check (push `completed` to workflow status if all actions terminal) | Part 7                            | `blocked_by` re-evaluation        | Step 5 (summary recompute) |
| Recompute workflow `summary`                                                      | Part 6 (already shipped contract) | Auto-complete                     | Step 6 (form_data write)   |

…and reconcile this with [engine/spec.md § Ordering inside one SubmitWorkflowAction invocation](../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation) which has summary recompute as its step 10 (last engine-internal write). The two views can both be right; part 7 just has to say which it's following.

Lean: follow part 6's submit-pipeline numbering, insert the new work as steps 4a / 4b / 4c between 4 and 5. Auto-complete pushes `completed` _before_ `summary` recompute so the `summary` counts and the `status[0].stage = completed` write happen in the same Mongo update (one workflow-doc write, not two).

### 5. Cascading `blocked_by` chains — single-pass walk doesn't converge

> **Resolved.** Added an invariant line to the `blocked_by` walk bullet: single-pass is sufficient because the walk only pushes `action-required` (non-terminal), which cannot cause another group to transition to `done` in the same call. Downstream chains unwind one user submit at a time.

[design.md:35–38](../design.md):

> After step 4 writes a transition, walk every action in `blocked` status:
>
> - If its `blocked_by` is now fully satisfied (every entry resolves to terminal action or `done` group), push `action-required` (subject to the priority rule).

This is a **single-pass** O(N) walk. Concept spec says the same: [action-groups/spec.md:109](../../../workflows-module-concept/action-groups/spec.md) — "Single scan of every `blocked` action."

But the walk pushes `action-required`, not a terminal status. So an action B with `blocked_by: [A]` flipping to `action-required` because A just terminated doesn't cascade — B is now `action-required`, not terminal, so any action C with `blocked_by: [B]` stays blocked. That's correct per the spec ("unblocked when an action with that type reaches terminal status").

Where it breaks: **`not-required` cascades via group completion.** Cancellation flips all open actions to `not-required` (terminal). A group containing only those just-flipped actions becomes `done`. Another action with `blocked_by: [that-group]` is now satisfied — should be pushed to `action-required`. But that group's transition to `done` happened in the same recompute step _before_ the walk; the walk catches it.

The real issue: a single submit can transition multiple actions (auto-unblocks from part 6, pre-hook actions from part 9, plus the `currentActionId`). If three actions in three different groups all transitioned in one call, the affected-groups recompute makes all three groups `done` in one shot, and the walk pushes the downstream `action-required` correctly. But if one of those downstream actions is **itself** in a group whose only blocker just unblocked, AND has a `blocked_by` against a group that _just became `done` because of this walk's pushes_… the single pass misses it.

Concretely: imagine

- group X = [action a1 (action-required → done in this submit)]
- group Y = [action b1 (blocked on group X)] → walk pushes b1 to action-required
- group Z = [action c1 (blocked on group Y)] → walk does **not** catch this, because group Y isn't `done` (b1 is `action-required`, not terminal). Correct.
- group Z = [action c1 (blocked on action-type b1)] → walk does **not** catch this either; b1 is `action-required`, not terminal. Correct.

OK — by construction the walk _can't_ cascade because pushes are to `action-required`, not terminal. The single-pass is sufficient. **But the design doesn't say this**, and the "Open questions: Incremental vs. full recompute" open question reads like it's wrestling with cascade concerns that don't actually exist for the walk (they exist for `groups[]` recompute, which is different).

**Fix.** Add a one-line invariant in the bullet:

> Single-pass is sufficient: the walk only pushes `action-required` (non-terminal), so a newly-unblocked action can never cause another group to transition in the same walk. Group transitions happen in the prior `groups[]` recompute step; the walk reads its output and never feeds back into it.

This kills the cascade-anxiety reading and makes the O(N) cost obvious.

### 6. Initial `groups[]` state: `StartWorkflow` writes `[]`, but the first submit only recomputes "affected" groups

> **Resolved.** Part 7 extends shipped `StartWorkflow.js` to pre-populate the full `groups[]` array at workflow creation (using `deriveGroupStatus` against the just-built `actionDrafts`; all data already in memory, no extra DB read). Same in-place extension pattern as part 6's extension of `updateAction.js`. With a complete array written at creation, the submit-side recompute can stay incremental — the open question on incremental-vs-full is closed in favor of incremental, and the open question was deleted from the design. Added a verification entry for the `StartWorkflow` integration and updated "Depends on" to reflect the cross-part extension.

[part 5 design.md:23](../05-start-cancel-handlers/design.md):

> empty `groups[]` (populated by part 7 on first transition)

And [StartWorkflow.js:83](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js):

```js
groups: [],
```

So a freshly-started workflow has `groups: []`. The first `SubmitWorkflowAction` lands; part 7's "Eager writeback on every `SubmitWorkflowAction` call" runs. Concept spec at [action-groups/spec.md:107](../../../workflows-module-concept/action-groups/spec.md):

> **Step 2 — affected groups.** "Affected" means the group containing the requesting action, plus groups containing any actions transitioned in this call. Handler MAY recompute every group (correctness fine; performance trade-off).

If the implementer literally recomputes only the affected groups on the first submit, `groups[]` ends up with one entry (the group of the submitted action) and the others are missing. Apps that read `groups[]` positionally for UI ordering ([part 18 — entity-components](../18-entity-components/design.md)) see a partial array until every group has had a transition in it — and groups whose actions never get touched (e.g. an emergency-only group) never appear.

The concept spec says "Handler MAY recompute every group (correctness fine; performance trade-off)" — but the design's "Open questions" leans `incremental` ([design.md:75](../design.md)):

> **Incremental vs. full recompute.** Lean incremental (only affected groups) for write efficiency; full recompute as a correctness fallback if drift surfaces.

This is the wrong default for v1. Without a full recompute on every submit (or at least: a full recompute on first submit, then incremental), positional reads of `groups[]` are broken until every group has been written to. The concept spec hedges; the design should commit.

**Fix.** Commit full recompute in v1:

> **Recompute strategy.** v1 recomputes every group in `connection.workflowsConfig[<workflow_type>].action_groups[]` on every `SubmitWorkflowAction` call (and on `CancelWorkflow`). Writes `groups[]` as the full array in declaration order so positional UI reads are stable from the first submit. Incremental recompute is a v2 optimisation if write contention surfaces ([concept risks: groups[] write contention](../../../workflows-module-concept/action-groups/design.md#risks)).

Then either delete or rephrase the open question to reflect the v2-optimisation framing.

Alternative: have `StartWorkflow` write the initial `groups[]` array with every group entry pre-populated (status computed from starting actions). That's a smaller code change but spans parts 5 and 7. Lean: full recompute in part 7 — it's the simpler seam.

### 7. `groups[]` entry shape — `summary` field structure committed but the part-7 spec doesn't pin the empty-group case

> **Resolved.** Pinned empty-group serialisation as `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`; called out that consumers should read `status` (not derive from counts) and noted `summary.total === 0` as the derived-view input for distinguishing "completed" from "empty." Stayed with the 3-value enum (no `empty` status) — adding a 4th value would force "either `done` or `empty` counts as terminal" branches across every engine `blocked_by` evaluator for a small UI / analytics gain.

[design.md:23](../design.md):

> Group entry shape: `{ id, status, summary: { done, not_required, total } }`.

Concept spec at [action-groups/spec.md:81](../../../workflows-module-concept/action-groups/spec.md):

```js
groups: [
  {
    id: "phase-1",
    status: "done",
    summary: { done: 2, not_required: 0, total: 2 },
  },
  {
    id: "phase-2",
    status: "in-progress",
    summary: { done: 1, not_required: 0, total: 3 },
  },
  {
    id: "phase-3",
    status: "blocked",
    summary: { done: 0, not_required: 0, total: 1 },
  },
];
```

Fine. But:

> **Empty groups** are `done` by convention.

What's the `summary` for an empty group? `{ done: 0, not_required: 0, total: 0 }`. The implementer needs to know that — it's the one case where `total: 0` and `status: done` co-exist, and a naive "status: done implies done === total" invariant breaks.

**Fix.** Add a one-liner:

> Empty groups (no actions reference the group's `id` via `action_group`) serialise as `{ id, status: 'done', summary: { done: 0, not_required: 0, total: 0 } }`. The `done === total` invariant doesn't apply to empty groups; consumers reading group completion should check `status === 'done'`, not derive it from `summary`.

### 8. `CancelWorkflow` integration — design says "add a group recompute + writeback after that loop" but the shipped handler already writes `summary` after the loop

> **Resolved.** Rewrote the `CancelWorkflow` integration section: extend the existing projection at `CancelWorkflow.js:86–108` to include `action_group`, compute `groups[]` from the same in-memory action list, `$set` both fields in one `MongoDBUpdateOne` — no new round-trip. Finding 9's "no `completed_groups` on cancel" invariant folded into the same rewrite.

[design.md:50](../design.md):

> Part 5 already cancels actions to `not-required` with `force: true`. This part adds a group recompute + writeback after that loop so the cancelled workflow doc has `groups[]` consistent with its actions (all `done` per the empty-group convention).

[CancelWorkflow.js:86–108](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) shows the existing flow:

1. Push `cancelled` to workflow `status[]`.
2. Find all non-terminal actions.
3. `MongoDBUpdateMany` to flip them to `not-required`.
4. Re-read all actions (only `status.0.stage` projection).
5. Compute summary counts.
6. `MongoDBUpdateOne` to write `summary`.

Part 7's recompute will need to add **either**:

- A second pass reading all actions with full `action_group` + `status` fields (the projection at line 90 is `{ 'status.0.stage': 1 }` — no `action_group`); or
- Re-fetch with `action_group` included; or
- Fold the group recompute into the existing summary recompute by changing the projection at line 90 to include `action_group`.

Lean: option 3 — change the projection (one line), compute `groups[]` from the same in-memory array used for `summary`, write both in the same `$set`. The design should pin this so an implementer doesn't add a third Mongo round-trip.

**Fix.** Replace [design.md:50](../design.md) with:

> Extend [CancelWorkflow.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)'s existing summary recompute: change the projection at line 90 to include `action_group`, compute `groups[]` from the same in-memory action list (every group lands at `done` per the empty-group convention since every action is now terminal), and `$set` both `summary` and `groups` in the same `MongoDBUpdateOne` call. No new round-trip.

### 9. `completed_groups` return — `CancelWorkflow` must explicitly NOT populate it, even though every group transitions to `done`

> **Resolved.** Folded into finding 8's rewrite — the `CancelWorkflow` integration section now explicitly states the handler does not compute or return `completed_groups`, with a cross-link to the concept spec's cancellation rule.

[design.md:42](../design.md):

> `SubmitWorkflowAction` returns `{ ..., completed_groups: [{ workflow_id, id, on_complete? }] }` for every group that transitioned from non-`done` to `done` in this call.

[Part 11 design.md:30](../11-group-on-complete-fanout/design.md):

> **Cancellation exclusion.** `CancelWorkflow` ([part 5](../05-start-cancel-handlers/design.md)) flips actions to `not-required`, which means groups land at `done` — but per concept, `on_complete` does **not** fire on cancel. Implementation: `CancelWorkflow` doesn't return a `completed_groups` list (or returns an empty one); only the submit path emits the fan-out.

[CancelWorkflow.js:110](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) returns `{ action_ids: actionIds, event_id: null, tracker_fired: null }` — no `completed_groups` key. Good.

But part 7's "CancelWorkflow integration" section doesn't say "this part also confirms `CancelWorkflow` does NOT populate `completed_groups`." Without that, an implementer extending `CancelWorkflow` to also compute `completed_groups` (for consistency with `SubmitWorkflowAction`) breaks the fan-out invariant — part 11 would fire `on_complete` hooks on cancel.

**Fix.** Add a one-line note to the CancelWorkflow integration bullet at [design.md:50](../design.md):

> `CancelWorkflow` writes `groups[]` consistent with the cancellation state but **does NOT compute or return `completed_groups`** — per concept, `on_complete` hooks do not fire on cancel ([action-groups/spec.md § Cancellation](../../../workflows-module-concept/action-groups/spec.md#group-status--derived-three-value-enum)). The handler's return shape stays `{ action_ids, event_id: null, tracker_fired: null }`; part 11's fan-out reads `completed_groups` only from `SubmitWorkflowAction`'s return.

### 10. "Subject to the priority rule" in the auto-complete bullet conflates two different writes

> **Resolved.** Folded into finding 1's rewrite — the auto-complete bullet now names `pushWorkflowStatus` explicitly, so the same-stage guard is invoked by the helper rather than being implicit in a `$push`.

[design.md:46](../design.md):

> After group + `blocked_by` re-evaluation, if every action is terminal, push `{ stage: completed }` to the workflow's status array (subject to the same priority rule).

Already covered in finding 1 for the priority-rule attribution. But there's a _second_ hidden issue: the auto-complete check's predicate is "every action is terminal." That's the **predicate**, not the **write guard**. Part 7 doesn't say what happens when the predicate is true but the workflow is already `completed`:

- The same-stage no-op guard inside `pushWorkflowStatus` handles it (per finding 1's fix).
- But if part 7's implementation directly does `$push` without going through `pushWorkflowStatus`, the guard is missed.

The engine spec ([engine/spec.md:259](../../../workflows-module-concept/engine/spec.md#tracker-subscription)) declares `pushWorkflowStatus` as a named helper. Part 7 should pin that the auto-complete check goes through it.

**Fix.** Already covered by finding 1's rewrite — make the bullet say "call `pushWorkflowStatus(...)`," not "push to the status array." Naming the helper makes the guard explicit.

## Smaller issues

### 11. "Empty groups are `done` by convention" is restated three times

> **Rejected.** After finding 7's resolution sharpened the empty-group serialisation bullet, the three mentions carry distinct information: derivation defines the rule, persistence shows the on-disk shape, cancel integration explains why every group lands at `done`. Each is load-bearing in its own context.

[design.md:17](../design.md), [design.md:50](../design.md), and implicitly in the `groups[]` shape — three places. The concept spec says it once at [action-groups/spec.md:69](../../../workflows-module-concept/action-groups/spec.md). Drop the repetition; refer to the concept spec.

### 12. Open question 2 ("`action_groups` display overrides scope") is the wrong place to surface this

> **Resolved.** Deleted the open question and the matching "Out of scope" bullet from part 7. Display-override merging is part 4 / part 20 territory; part 7 has no business owning a display-merge question.

[design.md:76](../design.md):

> **`action_groups` display overrides scope.** Concept spec mis-scopes them under `workflow_lifecycle_stages_display`; clarify in implementation. Doesn't block ship.

Display overrides are a part-4 concern (the resolver merges `vars.action_statuses_display` and `vars.workflow_lifecycle_stages_display` onto the shipped enums — [part 4 design.md:14, 33](../04-workflow-config-schema/design.md)). Part 7 owns engine state machine, not display merging. If the concept spec mis-scopes the var, that's a part-4 finding (or a part-20 manifest-vars finding), not part-7's.

**Fix.** Move this open question to part 4 (or open a new finding against part 4 / part 20). Delete from part 7.

### 13. Verification section says "regression: every part-6 unit test still passes" — fine, but doesn't name the seam

> **Resolved.** Tightened the verification bullet to name `SubmitWorkflowAction/handleSubmit.test.js` and call out step 5 as the seam where `groups[]` writeback gets enabled.

[design.md:69](../design.md):

> Regression: every part-6 unit test still passes with `groups[]` writeback enabled.

The seam is `handleSubmit.js`'s lifecycle step 5 — part 6 ships it as "counts only," part 7 promotes it to "counts + groups." Worth naming the file the implementer extends (`SubmitWorkflowAction/handleSubmit.js` per [part 6 design.md:100](../06-submit-action-writes/design.md#sub-modules)) so an implementer doesn't add a parallel file.

**Fix.** Tighten to:

> Regression: every part-6 unit test in `SubmitWorkflowAction/handleSubmit.test.js` still passes with `groups[]` writeback enabled in step 5.

### 14. `priorityRule self-exception` interaction with the `blocked_by` re-evaluation walk isn't noted

> **Resolved.** Folded into finding 2's rewrite — the walk bullet now explicitly says walk-pushed entries don't use the `currentActionId` self-exception because they're never the user's submitted action.

The walk pushes `action-required` on previously-`blocked` actions. The priority rule says `action-required` (6) < `blocked` (7), so the push lands. The self-exception isn't relevant here (the user's submitted action isn't in the walk's scope — it just transitioned in step 4). One-line note for the reader so they don't go hunting for "do walk-pushed entries get the self-exception?"

**Fix.** Add to the `blocked_by` re-evaluation bullet:

> Walk-pushed entries don't use the `currentActionId` self-exception — they're never the user's submitted action (the submitted action was already transitioned in step 4 and isn't in `blocked` status by the time the walk runs).

## Out-of-scope / non-findings

- The "Incremental vs. full recompute" open question is closed by finding 6's full-recompute commit.
- `on_complete` fan-out semantics (which Api receives the call, payload shape, error handling) — part 11's territory, correctly deferred.
- The `workflow_lifecycle_stages_display` mis-scope — see finding 12; it's a part-4 / part-20 concern.

## Suggested doc edits in order

1. Finding 1 + 10 — rewrite auto-complete bullet around `pushWorkflowStatus` and the same-stage guard; remove "priority rule" attribution.
2. Finding 6 — commit full recompute in v1; close the open question.
3. Finding 4 — add the lifecycle ordering sub-section pinning where steps 4a/4b/4c sit relative to part 6's numbering.
4. Finding 3 — add the build-time `blocked_by` resolution validator to "In scope."
5. Finding 8 + 9 — pin `CancelWorkflow` extension as a projection change + same-update write; explicitly say no `completed_groups` return.
6. Findings 2, 5, 7, 11, 12, 13, 14 — small in-place clarifications.
