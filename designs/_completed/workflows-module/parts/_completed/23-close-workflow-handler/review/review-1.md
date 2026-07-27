# Review 1 — Seam gaps with shipped neighbours

Part 23 was scoped against a state of the world where parts 5–8 and 7 had not yet shipped. Several of its "fold into part X" deferrals named contract changes those parts were expected to absorb; in practice parts 5, 6, 7, and 8 all landed in `_completed/` without absorbing them. The result is uncommitted work that now has nowhere to land except this part. This review focuses on those seam gaps and on factual claims the design makes about its neighbours.

## Seam gaps with shipped neighbours

### 1. Part 7 already shipped without absorbing close group-recompute

> **Resolved.** Cascaded from #5 (Option A). Updated the Writes bullet at [design.md:32](../design.md) to commit Part 23 does its own inline `recomputeGroups` against the post-sweep action set (same shape as `CancelWorkflow.js:96–127`). Removed the "Group recompute on close" entry from Out-of-scope. Rewrote the Part 7 "Light dependency" paragraph and Contract-to-neighbours bullets to drop the shared-helper seam.

[design.md:32](../design.md) and [design.md:63](../design.md) both park group-recompute on close inside part 7:

> `groups[]` recompute follows the same posture as [part 7's CancelWorkflow integration](../07-group-state-machine/design.md#cancelworkflow-integration); the group recompute hook lands there alongside the cancel recompute when part 7 ships.

> **Group recompute on close** → folds into [part 7's CancelWorkflow integration](../07-group-state-machine/design.md#cancelworkflow-integration) — part 7 picks up both cancel and close group-recompute writeback when it ships.

Part 7 has shipped ([`_completed/07-group-state-machine/design.md`](../../_completed/07-group-state-machine/design.md) — note path drift; see finding #6). Its `CancelWorkflow integration` section ([`_completed/07-group-state-machine/design.md:73`](../../_completed/07-group-state-machine/design.md)) only covers cancel. It says nothing about close. Shipped `CancelWorkflow.js` ([CancelWorkflow.js:102–127](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)) calls `recomputeGroups` inline; there's no helper part 23 can plug into.

**Fix.** Either (a) commit that part 23 does its own `groups[]` recompute inline (matching CancelWorkflow's inline pattern), or (b) extract a `recomputeGroupsAfterTermination` helper as part of this part's "Shared close/auto-complete write helper" section. Option (a) is the smaller change. Either way, the "folds into part 7" text needs to be replaced with a concrete commitment in this part's In-scope block — there is no longer a future part 7 to fold into.

### 2. The close group-recompute isn't the same as the cancel group-recompute

> **Resolved — Option (a) (accept the asymmetry).** Added an explicit bullet to the Writes block committing that groups with `required_after_close: true` survivors land at whatever `deriveGroupStatus` returns (`in-progress` or `blocked`, not `done`). Forcing `done` would lie about the open work that the spec explicitly says remains submittable. Added a verification bullet to assert the asymmetry under test.

Even if a helper existed, the cancel posture doesn't transfer. Cancel sweeps every non-terminal action to `not-required`, so every action is terminal post-sweep — `recomputeGroups` derives `done` for every group (the empty-non-terminal-set convention). Close's sweep is conditional ([design.md:28–31](../design.md)): `required_after_close: true` non-blocked actions survive. Groups containing surviving actions land at `blocked` or `in-progress`, not `done`.

The design doesn't say what `groups[].status` should be for groups with survivors post-close. The "same posture as part 7's CancelWorkflow integration" pointer is misleading because cancel's posture (every group goes to `done`) doesn't apply.

**Fix.** State explicitly that `recomputeGroups` runs against the post-sweep action set and that groups containing `required_after_close: true` survivors land at whatever `deriveGroupStatus` returns — likely `in-progress` (open work) or `blocked`. Then either (a) accept that the workflow is in `completed` with non-`done` groups (consistent state, since the workflow is terminal but those actions remain submittable per the spec), or (b) commit a post-close override (e.g. force surviving groups to a sentinel value). Pick one, write it down.

### 3. Part 10 doesn't list `CloseWorkflow` as a trigger site

> **Resolved — Option (a).** Rewrote the Tracker fan-up bullet to commit the explicit call site: `CloseWorkflow.js` invokes `fireTrackerSubscription(context, { workflowId, newStage: 'completed', eventId: null })` directly after the close write, same posture as `CancelWorkflow.js`. Updated the Out-of-scope bullet to clarify that Part 10 ships the helper implementation, not a listener — this handler owns the call site. Dropped the "part 10 reads workflow status changes" mischaracterization.

[design.md:33–34](../design.md):

> **Tracker fan-up**: If the workflow has a `parent_action_id`, the engine's tracker subscription (lands in [part 10](../10-tracker-subscription/design.md)) fires the parent action's `done` transition per the hard-coded `completed → done` mapping. This handler simply writes the workflow `completed` push; part 10 listens.

And [design.md:62](../design.md): "part 10 reads workflow status changes and fires the tracker."

Part 10's "Trigger sites" section ([10-tracker-subscription/design.md:11–16](../../10-tracker-subscription/design.md)) is explicit:

> The subscription fires inside every handler that changes a workflow's status:
>
> - `SubmitWorkflowAction` — light up the body of step 10 …
> - `CancelWorkflow` — after the final summary + groups writeback …

It does **not** include `CloseWorkflow`, and part 10 is synchronous-in-process, not a change-stream listener. "Part 10 reads workflow status changes and fires the tracker" mischaracterizes part 10 — there's no listener; each handler must call `fireTrackerSubscription` explicitly.

**Fix.** Either (a) commit in this part's In-scope block that `CloseWorkflow.js` calls `fireTrackerSubscription(context, { workflowId, newStage: 'completed', eventId: null })` directly (after the close write, before return) — same posture as `CancelWorkflow.js`; or (b) add a contract bullet committing that part 10's "Trigger sites" must grow a `CloseWorkflow` entry. (a) is the cleaner commitment because it keeps the tracker call inside the handler that issued the status change. Rewrite [design.md:62](../design.md)'s "reads workflow status changes" line — part 10 doesn't read anything; it fires from caller hooks.

### 4. Part 8 already shipped without absorbing close events

> **Resolved.** Rewrote the Out-of-scope bullet to drop the "→ part 8" pointer (part 8 shipped without close-side work) and instead say "deferred to a follow-on" with a pointer to shipped part 8 as the action-side dispatch surface close could later opt into.

[design.md:61](../design.md):

> **Log event + notifications on close** → [part 8](../08-side-effect-dispatch/design.md) — same deferral posture as `CancelWorkflow`. v1 close writes no event; opt-in in a follow-up.

Part 8 has shipped ([`_completed/08-side-effect-dispatch/`](../../_completed/08-side-effect-dispatch/)). Its design has no mention of `close` or `CloseWorkflow`. The "same deferral posture as `CancelWorkflow`" is fine — cancel also writes no event in v1 — but the language "→ part 8" suggests part 8 is the destination. It isn't; the destination is a future part. Same shape as finding #1: a shipped part can't absorb future scope.

**Fix.** Change "→ part 8" to "deferred to a follow-on" (or name a specific future part if one is planned). Same posture as how part 5's cancel-side defers to a future event/notification follow-on rather than to shipped part 8.

### 5. Shared `closeWorkflow.js` helper overlaps with shipped `shared/pushWorkflowStatus.js`

> **Resolved — Option A.** Rewrote the "Shared close/auto-complete write helper" subsection as "Write shape — reuse shipped helpers, no new shared helper." `CloseWorkflow.js` reuses shipped `shared/pushWorkflowStatus.js` for the status push and `SubmitWorkflowAction/recomputeGroups.js` for groups recompute, then mirrors `CancelWorkflow.js`'s two-write inline shape (status push, sweep, summary+groups writeback). Part 7's bundled `$set` left untouched.

[design.md:36–46](../design.md) introduces `src/connections/shared/closeWorkflow.js` carrying "the workflow-close write (status push + summary recompute + reserved-key merge)" and says both `CloseWorkflow.js` and `SubmitWorkflowAction/handleSubmit.js`'s auto-complete delegate to it.

Two problems:

**a. `shared/pushWorkflowStatus.js` already exists** ([pushWorkflowStatus.js:1–62](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js)) and already does the workflow-status push with same-stage idempotency guard. Its docstring even names this part:

> Used by: auto-complete check (part 7, inlined into handleSubmit's bundled $set), future tracker subscription (part 10), future CloseWorkflow handler (part 23).

The design doesn't reference it. It introduces a new helper that overlaps with the existing one without explaining which one wins.

**b. Part 7's auto-complete is not delegable as currently shipped.** Shipped [handleSubmit.js:287–321](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) inlines the `completed` `$push` into the same `MongoDBUpdateOne` that writes `summary` + `groups` — one Mongo round-trip. Refactoring it to "delegate to the shared helper" splits that into two writes (helper's status push + summary writeback), losing the bundle. Either we lose the optimization, or the helper has to take pre-computed summary/groups + emit one bundled `$set` — which makes "shared" awkward since `CloseWorkflow.js` computes summary differently (its sweep produces a different action set than auto-complete's all-terminal set).

**Fix.** Two options:

- **Option A (minimal):** Drop the "shared close helper" idea. `CloseWorkflow.js` calls `pushWorkflowStatus` (the existing helper) for the status push, computes its own summary/groups on the post-sweep action set, and writes them in a second `MongoDBUpdateOne`. Same posture as shipped `CancelWorkflow.js` (push status in one update, summary + groups in a second). Drop the "part 7 refactors to delegate" contract — part 7 has shipped with its inline bundle; leave it alone.

- **Option B (consolidate):** Promote part 10's planned `shared/recomputeWorkflowAfterActionWrite.js` extraction ([10-tracker-subscription/design.md:39](../../10-tracker-subscription/design.md)) to cover both submit-side recompute and close-side recompute. That helper already covers groups + summary writeback; close adds the sweep + status push around it. But that's bigger scope, and part 10 hasn't shipped its extraction yet, so this part can't depend on it landing first.

Recommend Option A. It's smaller, matches the shipped CancelWorkflow shape, and doesn't require touching part 7.

## Smaller corrections

### 6. Stale paths to completed parts

> **Accepted.** The cascading edits from #1, #5, #7 already retargeted the load-bearing links (Part 7 light dependency, Part 8 out-of-scope, top-level Part 6 source). Remaining `../03-...`, `../04-...`, `../05-...` paths are part of a project-wide broken-link inventory across all unshipped parts (Part 10 has the same). User will address path drift in a separate sweep across all unshipped parts.

[design.md:3](../design.md) sources part 6 review-1 at `../06-submit-action-writes/review/review-1.md`, but part 6 has been archived to `_completed/`. The actual file is at [`_completed/06-submit-action-writes/review/review-1.md`](../../_completed/06-submit-action-writes/review/review-1.md). Same pattern for the references to parts 3, 4, 5, 7, 8 throughout the design.

This is a project-wide convention in unshipped designs (part 10 has the same broken paths), but it's worth noting because [design.md:32, 63](../design.md) link to `../07-group-state-machine/design.md#cancelworkflow-integration` — that anchor existed in part 7's design but the entire directory has moved. A reader following the link from this part hits 404 silently.

**Fix.** Either (a) update the paths to `../../_completed/{part}/` for the references that are load-bearing in this design (the cancelworkflow-integration anchor especially), or (b) accept the project convention and leave them; consistency review can sweep all unshipped parts once.

### 7. Top-level `design.md` and Part 23 disagree on dependency

> **Resolved.** Cascaded from #5 (Option A). Updated top-level [`designs/workflows-module/design.md:101`](../../../design.md) to "light dependency on shipped part 7 (reuses recomputeGroups.js and pushWorkflowStatus.js helpers as-is, no contract change)." Updated [`design.md:109`](../../../design.md) follow-on narrative to drop the "shared workflow-close write helper at the seam to part 6's auto-complete" wording and reflect the inline-reuse posture. Also fixed the stale `parts/06-submit-action-writes/review/review-1.md` link to point at `_completed/`.

[design.md:70–72](../design.md) lists "Depends on: parts 3, 4, 5" and "Light dependency on [Part 7]", which matches the consistency-3 resolution (decision #5: "auto-complete attribution: part 7, not part 6").

But top-level [designs/workflows-module/design.md:101](../../../design.md) still says:

> **Part 23** introduces the `CloseWorkflow` handler + `close-workflow` operational API. Depends on parts 3, 4, 5; light dependency on part 6 (shares a workflow-close write helper).

And [designs/workflows-module/design.md:109](../../../design.md):

> with a shared workflow-close write helper at the seam to part 6's auto-complete.

Consistency-3 fixed this inside part 23 but missed the top-level design's two narrative bullets.

**Fix.** Update [design.md:101](../../../design.md) and [design.md:109](../../../design.md) to point at part 7. Since the "shared helper" plan itself is shaky (see finding #5), the cleaner fix is to drop both narrative mentions of the shared helper and just say "depends on parts 3, 4, 5; light dependency on part 7 (calls `pushWorkflowStatus`/recompute helpers established there)."

### 8. "Force: true (same posture as `CancelWorkflow`'s sweep)" is inaccurate

> **Resolved — bulk path.** Rewrote the Action sweep block as a three-step bulk pattern: `MongoDBFind` candidates with sliced status, in-memory filter against `workflowsConfig` for `required_after_close` + blocked exception, bulk `MongoDBUpdateMany` against the resulting `_id` set. Dropped the "force: true" wording in favor of "bypasses the priority rule by writing directly via the bulk dispatcher rather than going through `updateAction`." Also corrected the pre-existing inaccuracy at engine spec line 307 (which listed both Cancel and Close sweeps as `updateAction(...force: true)` callers) — split the force-surface paragraph into per-doc-force vs bulk-bypass mechanisms.

[design.md:30](../design.md):

> Pushes use `force: true` (same posture as `CancelWorkflow`'s sweep — engine-driven write bypasses the priority rule).

Shipped CancelWorkflow's sweep doesn't call `updateAction(...force: true)`. It uses a single bulk `MongoDBUpdateMany` ([CancelWorkflow.js:80–93](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)), which bypasses the priority rule by going around the helper, not through its force branch:

```js
await context.mongoDBConnection('actions').MongoDBUpdateMany({
  filter: { _id: { $in: actionIds } },
  update: {
    $set: { updated: context.changeStamp },
    $push: { status: { $position: 0, $each: [{ stage: 'not-required', created: ... }] } },
  },
});
```

Part 5's task 6 explicitly picked bulk over per-action loop ([\_completed/05-start-cancel-handlers/tasks/06-cancel-workflow.md:80–84](../../_completed/05-start-cancel-handlers/tasks/06-cancel-workflow.md)):

> Pick the bulk path — `MongoDBUpdateMany` is one round trip vs N. v0 does this for the same reason. `updateAction` (task 3) stays the single-doc helper; the cancel path doesn't gain anything by using it.

Part 23 inheriting "same posture" implies it should do the same — but it can't, because close's sweep is **conditional on `required_after_close` and `blocked` status**, not a blanket flip. A single `MongoDBUpdateMany` against `{ workflow_id, 'status.0.stage': { $nin: [...] } }` plus an additional `required_after_close ≠ true OR status.0.stage = blocked` filter is possible but requires joining action docs with their YAML config (the `required_after_close` field is in the workflow YAML / `actionsEnum`, not the action doc).

**Fix.** Spell out the actual mechanism. Two viable options:

- **Bulk with two queries:** fetch matching action docs with `type` + `key`, filter in-memory against `workflowsConfig` for `required_after_close ≠ true OR status.0.stage = 'blocked'`, then `MongoDBUpdateMany` against the resulting `_id` set. One bulk update, no priority rule (bulk update doesn't go through `updateAction`).
- **Per-action loop:** fetch matches, loop over them calling `updateAction(...force: true)` per match. N round-trips, but the helper handles the write shape and event-stamp threading uniformly.

Pick the bulk path (consistent with cancel; cheaper) and replace "force: true (same posture)" with the explicit mechanism: "Bulk `MongoDBUpdateMany` over the filtered action set; bypasses the priority rule by writing directly rather than through `updateAction`."

### 9. `references` write — design says "merge order"; shipped cancel uses defensive delete

> **Resolved.** Replaced the "reserved-key merge order" wording in the `references` payload bullet with a pointer to the shipped `RESERVED_WORKFLOW_KEYS` deletion pattern in `CancelWorkflow.js:4–18`, and spelled out why merge-order alone is insufficient when `$set` is combined with `$push: status`.

[design.md:22](../design.md):

> Optional: `references` (spread onto workflow doc on close using the engine's reserved-key merge order — references first, core fields including the `completed` status push last, per [engine spec § References write contract](../../../workflows-module-concept/engine/spec.md#references-write-contract)).

The engine spec's merge-order pattern is the action-doc convention for `$set` (spread references first, then core fields override). It works for action docs because the entire doc is being written.

The workflow close write is a `$set` + `$push`. `$set` can be guarded by merge order — but `$push` is a separate operator that runs after `$set`. A malicious `references: { status: [...] }` would set `status` to whatever the caller passed, then `$push` would append to it. Merge-order alone doesn't protect the `status` array.

Shipped CancelWorkflow.js solves this with explicit reserved-key deletion ([CancelWorkflow.js:4–18](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)):

```js
const RESERVED_WORKFLOW_KEYS = ['_id', 'workflow_id', ..., 'status', ..., 'updated'];
const safeReferences = { ...(payload.references ?? {}) };
for (const key of RESERVED_WORKFLOW_KEYS) {
  delete safeReferences[key];
}
```

Part 23 should match. The engine spec's "merge order" wording is for action-doc writes, not workflow status pushes.

**Fix.** Replace the "merge order" pointer with "defensive `RESERVED_WORKFLOW_KEYS` delete — same pattern as `CancelWorkflow.js:4–18`," and cross-reference the shipped list of reserved workflow keys.

## Open question worth elevating

### 10. Cancel-side `required_after_close` contradiction

> **Resolved — Option (ii) (amend the spec).** Updated `action-authoring/spec.md`'s Terminal-behaviour field row to say `required_after_close: true` applies to `completed` (close path only), not `cancelled`. Rationale documented inline in the spec: cancel is the stronger termination signal; audit/notes work is meaningless on a cancelled workflow. v0 backs this — v0 had only `CloseWorkflowActions` (no cancel handler), so the v0 filter only ever applied to close. Moved Part 23's open question to a new "Resolved questions" subsection capturing the decision and the v0 evidence. No follow-up against shipped Part 5.

[design.md:86](../design.md) flags as an open question whether `CancelWorkflow` should adopt the same sweep filter. The action-authoring spec ([action-authoring/spec.md:181](../../../workflows-module-concept/action-authoring/spec.md)):

> When `true`, the action remains submittable after the workflow lifecycle reaches `completed` **or `cancelled`**. Default rejects.

Shipped Part 5's cancel sweeps all non-terminal actions including `required_after_close: true` ones. Shipped Part 6's terminal-workflow gate lets `required_after_close: true` actions pass post-cancel. So post-cancel, `required_after_close: true` actions are:

- Gated through (Part 6 lets them be submitted), but
- Already terminal at `not-required` (Part 5 swept them), so
- The priority rule rejects the submit anyway.

That's the contradiction. The shipped behaviour silently violates the spec; close-side just inherits the same incoherence.

This is bigger than "open question for a follow-up." If close honors the filter and cancel doesn't, the two terminations have inconsistent semantics for the same flag, which is a spec violation on the cancel side. The open question should either be **closed** (committing one direction with a Part 5 follow-up filed) or **escalated** to top-level consistency review.

**Fix.** Either:

- Close the question in favor of "yes, cancel adopts the same filter" and file a follow-on against shipped part 5 to fix it; or
- Close the question in favor of "no, cancel's blanket-sweep is the v1 contract" and amend `action-authoring/spec.md:181` to say `required_after_close` only applies to `completed`, not `cancelled`.

Don't ship part 23 with the contradiction live and an open question pointing at it. Pick one.
