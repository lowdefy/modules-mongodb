# Review 2 — Part 11 group `on_complete` fan-out

Focus: carry-over findings from review-1 that the revised design still
doesn't address, plus new gaps surfaced against `handleSubmit.js`,
`fireTrackerSubscription.js`, `recomputeWorkflowAfterActionWrite.js`,
`CancelWorkflow.js`, and `makeWorkflowsConfig.js` on disk.

## Carry-over from review-1

### 1. Tracker-propagated parent group completions still unaddressed

> **Resolved (Option 1 — plumb through).** Part 11 design now extends `fireTrackerSubscription` to compute a per-level `completed_groups` diff from `recomputeWorkflowAfterActionWrite`'s already-returned `groupsBefore`/`groupsAfter` and attach it to each fire-chain entry. `handleSubmit` unions the originating workflow's `completed_groups` with `trackerFired.flatMap(f => f.completed_groups)` and passes the union to `fireGroupOnComplete`. The submit-pipeline spec ordering is amended (step 9 = tracker, step 10 = fan-out) because the data dependency forces fan-out to run after tracker. The deviation from Part 10's `_completed/` design is flagged inline at the top of that design. The reconciliation-job fallback (option 2) was rejected as a cop-out — no part builds it in v1 and "fires once when the group transitions to `done`" should hold regardless of cause. Auth context for parent-level fires (the submitter may have no roles in the parent workflow) is surfaced as an open question.

Review-1 finding #5 was not marked resolved and the revised design is
silent on it. The gap is now demonstrably real:

- [`fireTrackerSubscription.js:73–75`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js)
  calls `recomputeWorkflowAfterActionWrite` on the parent workflow.
- [`recomputeWorkflowAfterActionWrite.js:36–141`](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js)
  returns `groupsBefore` / `groupsAfter` (lines 132–140) — the exact
  diff Part 11 needs to detect parent-group completions — but
  `fireTrackerSubscription.js:73–93` discards both and returns only
  `{ parent_action_id, parent_workflow_id, new_status }`.
- `handleSubmit.js:286–300` only ever computes `completed_groups` from
  the originating workflow's `recomputeResult`. So if a child submit
  auto-completes the child workflow → tracker subscription flips the
  parent's tracker action to `done` → the parent recompute transitions a
  parent group to `done`, that group's `on_complete` is silently
  dropped.

The design must commit to one of the two options review-1 named:

1. Extend `fireTrackerSubscription` to compute a per-level
   `completed_groups` diff from `recomputeWorkflowAfterActionWrite`'s
   already-returned `groupsBefore` / `groupsAfter`, accumulate up the
   chain, and have `handleSubmit` pass the accumulated list through
   Part 11's helper alongside the originating workflow's
   `completed_groups`. The plumbing cost is small because the diff data
   is already on the recompute helper's return shape.
2. Explicitly document v1 fires only for the originating submit and
   that parent-level group completions land via the periodic
   reconciliation job. State this in "Out of scope / deferred" and in
   "Contract to neighbours".

Either is defensible; the design has to pick. Today it does neither.

### 2. Helper's `Returns nothing` is still misleading

> **Resolved.** Helper now returns `Array<{ workflow_id, group_id, on_complete_api_id, success: boolean, error?: any }>` — one entry per attempted call, in declaration order. `handleSubmit` threads the audit into the post-hook payload as `fan_out_results`. Cheap to populate now and required by the multi-workflow plumbing landed in finding #1 (a single fan-out call now sees entries from multiple workflows, so per-entry audit replaces "did the call succeed" with explicit per-fire success.)

Review-1 finding #11 wasn't resolved. Design line 27 still says the
helper returns nothing. Two reasons to revisit:

- If finding #1 above lands as option 1, the helper needs to accept
  _and_ return a structured list (so multi-level accumulation works).
- Even without finding #1, returning
  `Array<{ workflow_id, group_id, on_complete_api_id, success }>` lets
  `handleSubmit` thread the outcome into the post-hook payload
  (currently the post-hook gets `completed_groups` from
  `handleSubmit.js:415`, which carries the `on_complete` fire/skip
  signal but NOT whether the call actually succeeded). Post-hook
  authors who want to react to "did fan-out fire cleanly?" have no
  signal today.

Cheap to populate now; expensive to retrofit once the helper's
signature is locked.

## New findings

### 3. `workflow_id` payload source disagrees with the entry shape

> **Resolved.** Payload sources are now pinned to the entry, not `context.workflow`: `workflow_id` ← `entry.workflow_id`, `workflow_type` ← `entry.workflow_type`, `group_id` ← `entry.id`, `group_title` ← `entry.group_title`. The `completed_groups` entry shape is enriched at the producer site (both `handleSubmit` for the originating diff and `fireTrackerSubscription` for parent-level diffs emit entries carrying `workflow_id`, `workflow_type`, `id`, `group_title`, `on_complete`). This is the natural shape required by finding #1's multi-workflow plumbing — a single fan-out call sees entries spanning multiple workflows, and reading from `context.workflow._id` would tag every payload with the originating workflow's id. A new unit test ("Per-entry sources") proves the implementation reads from the entry.

Design line 18:

> `workflow_id` — `context.workflow._id`.

But `handleSubmit.js:294–299` puts a per-entry `workflow_id` on each
`completed_groups[]` entry (carrying `context.workflow._id` today). The
entry already telegraphs that the workflow is a per-row attribute, not
a handler-context constant.

These are identical today because only `handleSubmit` produces entries
and they all share `context.workflow`. But if finding #1 lands as
option 1, a single fan-out call will see entries for multiple
workflows (the originating one + tracker-propagated parents), and
reading from `context.workflow._id` would tag every payload with the
wrong workflow id. Pin the source as `entry.workflow_id` (the field
already on the data) instead of `context.workflow._id`. Same posture
for `workflow_type` — read it from the workflow doc keyed by
`entry.workflow_id` (or attach it to the entry shape in Part 7), not
from `context.workflow.workflow_type`.

### 4. `group_title` "Part 4 validates non-empty" claim is unsupported

> **Resolved.** Dropped the "part 4 validates non-empty" parenthetical. The `completed_groups` entry shape now describes `group_title` as "`workflowConfig.action_groups[].title` indexed by `id`, or `null` if not declared (validator does not require it)" with a direct link to `makeWorkflowsConfig.js:106–126` so a reader can verify. Payload reads `entry.group_title` directly. Adding a `validateGroupTitle` rule to Part 4 was considered but deferred — it's a Part 4 cleanup, not Part 11's concern, and `null` is a defensible payload value for hooks that don't depend on the title.

Design line 21:

> `group_title` — `workflowConfig.action_groups[].title` indexed by
> `group_id` (required; part 4 validates non-empty).

Looking at the actual validator
[`makeWorkflowsConfig.js:106–126`](../../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)
and the broader `validateAction`/`validateGroup` paths: nothing
enforces that `action_groups[].title` exists or is a non-empty string.
The Part 4 design only commits to `title` on the top-level workflow
(line 16 of part 4 design: "Top-level: `type`, `title`, ...,
`action_groups[]`") — not on group entries.

Two ways to fix:

- Add a `validateGroupTitle` rule to `makeWorkflowsConfig` (in scope of
  Part 4 cleanup, not Part 11), then the design's claim becomes true.
- Drop the "required; part 4 validates non-empty" parenthetical and
  fall back to `group_title: cfg?.title ?? null`. Less strict but
  doesn't make a promise the resolver doesn't keep.

Either is fine; today the design is just wrong on the validation fact.

### 5. Fan-out concurrency model isn't pinned

> **Resolved.** Added a "Concurrency" bullet pinning sequential `for-of` with two reasons: (a) "fire in declaration order" commitment, (b) small per-fire cost makes `Promise.all` a non-win. Added a unit test ("Sequential ordering") that asserts multiple completed groups produce sequential — not concurrent — `callApi` invocations in the union's array order.

Design line 27 says "Returns nothing — fan-out runs after all writes
are durable" and "Out of scope" line 45 says "fire in
`completed_groups` array order". But the design never says whether the
fan-out is:

- a `for (const entry of completed_groups) await context.callApi(...)`
  loop (sequential — preserves declaration order, slower under
  multi-group completion), or
- `await Promise.all(completed_groups.map(...))` (parallel — faster but
  side-effect ordering is non-deterministic; "declaration order" loses
  meaning for any author code that observes externally).

Pin it. Sequential `for-of` is the right v1 default given the design's
explicit "fire in declaration order" commitment and the small per-fire
cost (one `callApi` invoking an inline routine). Spell it out in the
`fireGroupOnComplete.js` § so the implementer doesn't reach for
`Promise.all` thinking it's a parallelisation win.

### 6. Verification doesn't separate "hook threw" vs "hook returned `{ success: false }`"

> **Resolved.** Single "hook errors are logged" verification line replaced with an "Error isolation" sub-case block enumerating three cases: (1) target routine throws → `result.success === false` → log + continue; (2) target routine returns `{ success: false, error: ... }` → log + continue; (3) `callApi` itself throws (e.g. unknown `{ id, module }`) → caught locally → log + continue. All three assert "submit returns successfully" so the implementer can't copy `dispatchNotifications.js`'s shape verbatim and miss case 3.

Design line 24:

> Match `dispatchNotifications.js`'s `result.success` check shape but
> invert the policy: on `result.success === false`, log instead of throw.

The verification list at lines 53–58 only has the unit case:

> Hook errors are logged but the submit returns successfully.

That conflates two failure surfaces:

- The target Api's routine threw synchronously (becomes a thrown error
  inside `callApi`, which `dispatchNotifications.js:17` would catch and
  set `result.success: false` plus `result.error`).
- The target Api's routine returned `{ success: false }` explicitly
  (Lowdefy `Api` return convention).

Both should produce a single log + continue, and the test should
assert both. Same for the `callApi` invocation throwing directly
(which can happen for shape errors before the routine runs — e.g.
unknown `{ id, module }`). Three small unit cases:

1. Target routine throws → `result.success === false` → log + continue.
2. Target routine returns `{ success: false, error: ... }` → log + continue.
3. `callApi` itself throws (unknown module/id) → caught locally → log + continue.

Without these, an implementer who copies `dispatchNotifications.js`'s
`if (!result.success) throw` block verbatim and only inverts the
"throw" to "return" misses case 3 (which `dispatchNotifications.js`
also doesn't handle — it relies on the throw bubbling).

### 7. Line reference to `CancelWorkflow.js:132` is stale

> **Resolved.** Updated the citation in "Cancellation exclusion" to `CancelWorkflow.js:143`. The "omits `completed_groups` entirely" point still holds and the inline comment at lines 140–142 makes the intent explicit on disk; the `tracker_fired` value detail (now `trackerFired`, not `null`) is Part 10's concern, not Part 11's, so left as-is here.

Design line 35:

> `CancelWorkflow.js:132` — committed in [part 7 § CancelWorkflow integration]

The actual return is now at
[`CancelWorkflow.js:143`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)
and reads
`return { action_ids: actionIds, event_id: null, tracker_fired: trackerFired };`
— note `tracker_fired: trackerFired`, not `tracker_fired: null` as the
review-1 #6 resolution claimed. The "omits `completed_groups` entirely"
point still holds (and is now explicitly commented at lines 140–142),
but the line reference drifted when Part 10's tracker wiring landed.
Update the citation.

### 8. "Depends on" misses Part 13

> **Resolved.** Added Part 13 to "Depends on" with the "Api id template" note inline so the dependency is visible to anyone scanning the section.

Design line 49 lists Parts 1, 7, 9 — but the whole "Api id template"
contract (lines 15, 54) sits on Part 13's emission convention. If Part
13's id template changes, this part breaks. Add Part 13 to "Depends
on" with the same note Part 11's body already carries: "the handler
hard-codes the template; the unit test pins it so divergence fails
loudly."

## Minor

### 9. "Idempotency" section over-claims

> **Resolved.** Renamed the section to "Engine-side idempotency" and added a paragraph that separates engine bookkeeping (no double-emit of `completed_groups` entries) from hook-side idempotency (author code, hook author's responsibility), cross-linking to the existing "Out of scope / deferred" v1 risk note.

Design lines 38–39:

> Retry of an idempotent `SubmitWorkflowAction` call produces
> `completed_groups: []` (the group was already `done`), so no
> double-fire.

True for the engine's bookkeeping, but the section title is
"Idempotency" and the surrounding paragraph implies the fan-out itself
is idempotent. It's not — the _engine_ is idempotent (won't re-emit
the entry), but each `on_complete` Api is arbitrary author code. The
"Out of scope / deferred" note at line 44 already names this as the v1
risk; reword the Idempotency section to "Engine-side idempotency" or
similar so readers don't conflate engine bookkeeping with hook-side
idempotency.
