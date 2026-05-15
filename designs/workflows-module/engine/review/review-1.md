# Review 1 — Engine sub-design

Verified against the actual codebase (`@lowdefy/modules-mongodb-plugins`, the events / contacts / notifications modules, and the upstream `@lowdefy/community-plugin-mongodb` for the connection-handler contract). Focus on plugin shape, references contract, and the tracker subscription mechanism.

## Critical findings

### 1. The "events module's contract" the design claims to match doesn't exist at the plugin layer

> **Resolved.** Dropped the "matches the events module's contract" framing in three places in Decision 2: the opening sentence now grounds the design in the consumer-facing flat-query shape (and notes the enforcement is in the plugin handler, not the YAML layer), the "Reserved-keys enforcement" paragraph drops "Matches the events module's pattern," and the "Validation throws" paragraph justifies the deferral on its own merits (short reserved-keys list, debuggable failure mode, purely-additive upgrade path) instead of cross-module consistency. Validation throws (build-time or runtime) remain deferred to v1.x.

Decision 2 says: _"The plugin builds the doc by spreading `references` first, then layering core fields on top via `_object.assign`-equivalent semantics. … Matches the events module's pattern."_

The events module has no plugin code at all. Its `references` merge happens **in the YAML routine of `new-event.yaml`** ([modules/events/api/new-event.yaml:9-25](modules/events/api/new-event.yaml)):

```yaml
doc:
  _object.assign:
    - _payload: display
    - _payload: references
    - _id: { _uuid: true }
      # ... core fields ...
```

It writes via stock `MongoDBInsertOne` from `@lowdefy/community-plugin-mongodb` — there is no plugin handler reading `references`. The "events module pattern" is a YAML idiom, not a plugin idiom.

This matters because the design's claim that v1 isn't doing reserved-key validation throws _"to match the events module's pattern for cross-module consistency"_ is over-justified — there is no cross-module precedent either way. The actual decision rests on its own merits: simpler implementation, silent-collision tradeoff. Fix: drop the "matches events module" framing; state the merge-order decision on its own. Optionally consider write-time validation throws in `createAction.js` since the workflows plugin is breaking new ground and won't break consistency with anything.

### 2. Plugin package is client-only today — the design under-states the bootstrap work

> **Resolved.** Two-part fix. (1) The `types.js` factual error is corrected in Decision 1's "Package shape changes" (Lowdefy's actual `Object.keys(connections)` plus flattened-request-keys contract; `src/connections.js` re-export; `{ schema, requests: { ... } }` per-connection shape). (2) A new "Dual-runtime build — a v1 milestone, not a config tweak" sub-section calls out the package's first-ever server-side bundle as its own deliverable: hard `src/blocks/` vs `src/connections/` split, `.swcrc` audit with dist/-output grep for React/JSX leakage, dependency-placement guide (mongodb in deps, React in peerDeps), and a smoke-test step before declaring the plugin done. The Risks list in both this sub-design and the parent design is updated to point at the milestone section instead of the previous vague "verify SWC config" mitigation.

The design says the package is "client-side only today" (Decision 1) but doesn't reckon with how deep that goes. Concrete state ([plugins/modules-mongodb-plugins/package.json:29-43](plugins/modules-mongodb-plugins/package.json) and [plugins/modules-mongodb-plugins/src/types.js:1-13](plugins/modules-mongodb-plugins/src/types.js)):

- `connections: []` and `requests: []` are empty in `types.js`. The design says _"Update types.js to register the connection: `connections: [{ id: 'WorkflowAPI', type: WorkflowAPI }]`"_ — but the existing pattern (from `@lowdefy/community-plugin-mongodb/dist/types.js`) is `connections: Object.keys(connections)` and `requests: Object.keys(connections).map(c => Object.keys(connections[c].requests)).flat()`. The proposed `[{ id, type }]` shape doesn't match what Lowdefy's plugin loader actually consumes.
- `dependencies` contains only `dayjs` and `dompurify`. No `mongodb` driver. The build pipeline is React-flavored: `.swcrc` sets `jsx: true` and `transform.react.runtime: classic`. Building server-side Mongo handlers through this same SWC config is fine in principle but the package has never produced a server bundle.
- Peer deps include `react`, `react-dom`, `antd`, `@lowdefy/blocks-*` — all client-side. Adding `mongodb` and `@lowdefy/connection-mongodb` puts the package on both runtimes, and the React JSX transform will run over the server-side files too. Verifying clean separation in dist/ output is a non-trivial spike.

Fix: rewrite Decision 1's "Package shape changes" to match the actual `types.js` export shape (object whose values are connection definitions, then `Object.keys` mapped) and call out the package-going-dual-runtime explicitly as a v1 milestone, not a build-config tweak.

### 3. The tracker subscription's "synchronous in-process" claim conflicts with how Lowdefy connections execute

> **Resolved — option 1 (single client per invocation, no transactions in v1).** Added "Client and transaction model" sub-section under Decision 1: `WorkflowAPI` handlers open one `MongoClient` at handler entry, thread a shared `ctx` ({ client, workflowsCollection, actionsCollection }) through every sub-step (action write, auto-complete, tracker recursion, summary writeback), and close on exit. No Mongo transactions in v1 — sequential writes with idempotent retry as the recovery story. The "Why synchronous in-process" justification list dropped the "same transactional semantics as the underlying write" bullet (it was conflating ordering with atomicity) in favour of "shared connection lifetime, sequential writes, idempotent retry," pointing at Decision 1's transaction model for the precise contract. "Failure-mode story" updated to state the no-transaction limit explicitly. Risks list now has a dedicated "No transactional atomicity in v1" entry stating the trade-off and the purely-additive `session.withTransaction(...)` upgrade path. The handler-shape pseudo-code in the new section matches the actual Lowdefy connection-handler signature.

Decision 3 commits to running tracker updates synchronously inside `UpdateWorkflowActions`, citing _"same transactional semantics as the underlying write."_ Verified against the actual Lowdefy connection runtime ([community-plugin-mongodb/dist/connections/MongoDBCollection/getCollection.js:14-32](https://github.com/lowdefy/community-plugins/) and `MongoDBInsertOne.js`):

- Every Mongo request handler opens a **new `MongoClient` per call** (`new MongoClient(databaseUri, options); await client.connect()`), and closes it in a `finally` (`await client.close()`).
- There is no shared transaction context across handler invocations.
- The handler signature is `({ blockId, connection, connectionId, pageId, request, requestId, payload }) => result` — no `ctx` parameter to thread state through.

The design's pseudo-code at line 124-145 calls `await ctx.actionsCollection.find(...)` and `await updateAction(ctx, ...)` from inside `pushWorkflowStatus`. This assumes the handler has a long-lived collection handle and can call helpers that themselves take `ctx`. The connection model gives you neither.

The implementation can still be synchronous (run trackers inside the same handler invocation), but the design needs to commit to **one of**:

1. Open a single `MongoClient` at the top of `UpdateWorkflowActions`, do all work (transition + auto-complete check + tracker subscription + summary writeback) against that one client, and close at the end. State this explicitly; show it in the pseudo-code.
2. Use a Mongo transaction wrapping the whole sequence (`session.withTransaction(...)`) — gives real ACID across the writes but requires a replica set / Atlas. v1 deferral?
3. Accept that "synchronous in-process" means each sub-step opens its own client and the failure-mode story (currently Decision 3 "Failure-mode story") is the only guarantee. In that case, drop the "same transactional semantics" framing — there is no transaction.

The current design conflates three things: ordering (one handler does step 1 then step 2 then …), atomicity (all-or-nothing), and durability (if I see a success, all writes happened). Without an explicit transaction, only ordering is guaranteed.

### 4. The reverse-lookup index is over-narrow

> **Resolved — option 2 (partial index on `key` alone).** The "Reverse-lookup index" section now ships a partial index `{ key: 1 }` filtered by `{ "tracker.workflow_type": { $exists: true } }`. Justification rewritten: workflow `_id`s are globally unique across workflow types, so the `key` value alone pinpoints matching parent actions — the composite `tracker.workflow_type` filter added bytes without narrowing the plan. The pseudo-code's tracker query drops the `tracker.workflow_type` clause to match, with a comment pointing at the index. Added a "Multi-parent case" note stating that two parent actions on different parent workflows tracking the same child are handled automatically by the existing loop — no code change, worth a README example.

Decision 3 specifies a sparse index `{ key: 1, "tracker.workflow_type": 1 }` on the `actions` collection, with the lookup query `actions.find({ key: <child workflow_id>, "tracker.workflow_type": <child workflow_type> })`.

Two issues:

- The action doc stores `key` as the child workflow `_id` (per action-authoring sub-design line 138). Workflow `_id`s are unique across all workflow types, so `tracker.workflow_type` adds nothing to the query selectivity. The index could just be `{ key: 1 }` partial on `tracker.workflow_type: { $exists: true }`. Smaller index, same plan.
- More importantly: nothing in the design or the action-authoring sub-design rules out **two parent actions on different parent workflows tracking the same child workflow** (Decision 3 line 188-190 explicitly allows it: _"Different parent workflows can each track the same child"_). The tracker handler must process all of them. The pseudo-code `for (const tracker of trackers)` already loops, so this is fine — but worth noting that the loop is non-trivial in the multi-parent case, and the per-tracker `updateAction` calls compound the client-lifecycle issue in #3.

Fix: simplify the index to `{ key: 1 }` partial (or just `{ key: 1 }` non-sparse and rely on selectivity); confirm that the loop body handles multiple matching parents correctly; add a worked example with two parents tracking the same child to make this concrete.

## Important issues

### 5. `connections` overlap between `workflows-collection`, `actions-collection`, and `workflow-api` is not reconciled

> **Resolved — keep all three exports, document the separation.** Rejected the "collapse into one connection" recommendation in favour of keeping `workflows-collection`, `actions-collection`, and `workflow-api` as three separate exported connections — apps need direct read access to the underlying collections for custom views, ad-hoc aggregations, dedicated list pages, and reporting that doesn't go through the engine. The new "Client and transaction model" sub-section under Decision 1 states explicitly that the `MongoDBCollection` connections are separate from `WorkflowAPI` (separate clients, separate lifecycles, by design): `WorkflowAPI` owns engine-managed write paths with the priority rule, tracker subscription, and summary writeback running inside one shared-client invocation, while the `MongoDBCollection` exports give apps direct read access to the raw docs. Apps that want app-specific indexes on `*_ids` reference fields layer them via the collection connections.

Module-surface sub-design (Decision 1, [designs/workflows-module/module-surface/design.md:43-49](designs/workflows-module/module-surface/design.md)) declares three connections:

- `workflows-collection` (MongoDB collection for workflow instances)
- `actions-collection` (MongoDB collection for action instances)
- `workflow-api` (the server-side `WorkflowAPI` connection)

But `WorkflowAPI`'s handlers need to write to both collections. The design never says whether `workflow-api` is an entirely separate connection (carrying its own `databaseUri` + collection names), whether it re-uses the other two collection configs somehow, or whether the two `*-collection` connections are just there for ad-hoc reads (e.g. for `get-entity-workflows`).

Concrete questions for Decision 1:

- Does `workflow-api.yaml` declare `databaseUri: { _secret: MONGODB_URI }` and `workflows_collection: workflows`, `actions_collection: actions` as its own properties?
- If yes, the two `MongoDBCollection` connections are redundant — `get-entity-workflows` can go through a `WorkflowAPI` request type (`GetEntityWorkflows`), keeping the read path on the same connection as the write path.
- If no, the engine ends up reading collection config from two different sources, and apps have to keep them in sync.

Recommendation: drop `workflows-collection` and `actions-collection` from `exports.connections`; let `workflow-api` own both the read and write paths via additional request types (`GetEntityWorkflows`, etc.). This also fixes the client-lifecycle issue in #3 — one connection class, one client lifecycle policy.

### 6. `keys: [...]` zero-ops semantics for `[]` create a silent-no-op footgun

> **Resolved — documentation only.** Decision 1's `keys: [...]` capability bullet now explicitly calls out the silent-no-op behavior as a footgun and points to `skip` / `_if` gating on `keys.length` as the author-side mitigation, with a note that the README's `unblocks` reference will show both shapes. Risks section also gains a "`keys: []` silent no-op" entry stating the v1 mitigation is documentation only and that an `allowEmpty: true` flag is a purely-additive future change if real apps surface confusion.

Decision 1 line 58 specifies: _"`[]` → zero operations — typical for fan-out where the form has no items."_ This is reasonable for the fan-out case but creates a subtle bug class: an author who computes `keys` via `_array.map` over a payload field that's accidentally empty (e.g. the user submitted the form before adding any rows) produces zero ops with no error. The transition silently doesn't happen.

The events module has a similar shape — if `display` is empty, the event is logged anyway. But in `submit-action` an empty `unblocks[].keys: []` could mean either "no fan-out targets" (legitimate) or "I expected the form to have rows but it didn't" (bug).

Fix options:

- Document the silent-skip behaviour prominently in README + show how to gate the unblock with `_if` on `unblocks[].keys.length`.
- Validate at the API boundary: if `keys` is present but empty, log a warning or accept a flag like `allowEmpty: true`. v1 can stay silent; v1.x adds the flag if footgun manifests.

### 7. `force: true` and same-stage transitions are under-specified

> **Resolved.** Decision 4 now has three new paragraphs after the exceptions list: (1) `currentActionId` is the plugin-internal name for the action the user submitted on — the `submit-action` API aliases `payload.action_id` to it; auxiliary entries (unblocks, fan-outs, tracker writes) still get the strict priority check. (2) `force: true` is a top-level field on the `UpdateWorkflowActions` payload (per-call only), bypasses the priority rule and the universal-terminal exception for every entry in the call; per-entry forcing is a purely-additive future change. (3) Tracker subscription uses `force: true` internally because tracker writes are engine-driven and need to move parent actions in any direction the child workflow takes (including backward through `not-required`). Decision 3's `pushWorkflowStatus` pseudo-code now passes `force: true` to the inner `updateAction` call with a comment pointing at Decision 4.

Decision 4 mentions two priority-rule exceptions:

- _"The engine permits same-stage transitions for the action being submitted (`currentActionId` self-exception)."_
- _"A `force: true` override on `UpdateWorkflowActions` allows any transition."_

What's not specified:

- Where does `currentActionId` come from in the payload? The `submit-action` payload (module-surface Decision 4 line 211-213) has `action_id`, not `currentActionId`. Is there a rename mid-flight? Or does the API map one to the other?
- Is `force: true` per-call or per-action-entry? The pseudo-code in Decision 3 line 138-142 calls `updateAction` with `actions: [{ type, key, status }]` — no `force` field on the entry, and no top-level. Engine-internal tracker writes happen to be forced past the priority rule (a stage going `done → in-progress` violates strict-lower-priority), or they don't?
- If the tracker subscription is using `force: true` internally, that's a real semantic — tracker writes are by definition non-user-driven and can move actions in either direction. Worth stating explicitly.

Fix: add a "Force and exceptions" sub-section to Decision 4 covering: where `force` appears in the payload, whether tracker subscription uses it internally, and whether `force` skips reserved-key collision-silencing too (probably yes — a migration tool needs the escape hatch).

### 8. `summary` writeback ordering after auto-complete recursion is wrong

> **Resolved — accept redundant recompute + add worked example.** Added a "Summary recompute is idempotent" paragraph to the "Ordering relative to other engine work" section stating explicitly that nested cases produce duplicate recomputes against the same workflow, that the recompute is idempotent (reads N actions, writes one summary), and that the alternative (dedup by tracking visited workflow IDs in handler state) is rejected as added complexity for negligible gain. Added a full "Worked example: 2-level nested auto-complete" sub-section with a concrete trace through `Workflow A (lead) → track-installation → Workflow B (ticket) → install-device`, the retry case (showing how the workflow-status guard from #9 + action priority rule together produce a clean idempotent retry), and a same-level-auto-complete variation. The example doubles as the implementation verification target.

Decision 3 "Ordering relative to other engine work" (lines 188-196) specifies the order:

1. Write the action's status
2. Auto-complete check on the workflow
3. Tracker-update for any sub-workflow actions referencing this workflow
4. Recompute the workflow's `summary` (eager writeback)
5. Return action ids and event id

Step 4 happens once at the end of the original handler invocation. But step 3 calls back into `updateAction`, which (per the same ordering doc) **also** does its own steps 1-5. So tracker writes recompute the **parent action's parent workflow's** summary inside step 3, but the **original workflow's** summary is recomputed only at step 4 of the outer call.

That's correct in most cases — but consider: the tracker write completes a sub-workflow action on the original workflow, which causes the original workflow to auto-complete (push `completed`), which then needs to fire its own tracker subscription (this workflow is being tracked by some higher parent). The current ordering doesn't visit this chain.

The pseudo-code as written (line 117-145) only triggers tracker logic from `pushWorkflowStatus` (step 2 → step 3). When an action transitions to terminal _but its parent workflow doesn't auto-complete_ (because other actions are still open), no `pushWorkflowStatus` runs and no tracker logic fires on that action. That's correct.

But when step 4 of an outer call runs after step 3 has triggered a workflow status push deeper down, the outer summary recomputation is reading a workflow state that was already mutated by the inner tracker call. If both wrote to the same action doc (unlikely but possible — different parent workflows on the same entity), the last write wins.

This is mostly an integration risk, not a design bug. Fix: add a concrete worked example showing a 2-level nested case (Workflow A's sub-workflow action tracks Workflow B; B completes; B's auto-complete recurses up; verify A's summary reflects the chain correctly). The worked example in the parent design is single-level only.

### 9. Idempotency claim is too strong for `pushWorkflowStatus` retries

> **Resolved — option 2 (same-stage no-op guard).** The `pushWorkflowStatus` pseudo-code now reads the workflow's current `status[0].stage` as step 0 and returns early when the new stage equals the current — preventing the duplicate `$push` and double-firing tracker subscription on retry. The "Idempotency" sub-section in Decision 3 now distinguishes two stories explicitly: action status pushes are guarded by the priority rule (automatic), workflow status pushes are guarded by the same-stage no-op check (because the workflow lifecycle enum has no priority ordering — its legal transitions don't form a strict-less-than relationship). Legal-transition enforcement on workflow status (rejecting `completed → active` etc.) is called out as deferred to v1.x.

Decision 3 "Idempotency" (line 173) says _"Repeating the call is harmless because the priority-based transition rule no-ops repeated stage pushes — pushing the same stage twice is rejected as a redundant write."_

This is the priority-rule behaviour for the action's status array, not for the workflow status. The workflow status push is documented as _"Push `{ stage: 'completed' }` to the workflow's `status` history"_ (Decision 1 line 54). A `$push` to an array is not idempotent — two retries produce two `completed` entries.

Either the workflow status writes use the same priority rule (need to state explicitly — Decision 4 talks about action statuses only), or `pushWorkflowStatus` checks the current `status[0].stage` before pushing.

Fix: state explicitly that the priority rule applies to workflow status pushes too, and the `pushWorkflowStatus` helper checks before write. Or document a different idempotency strategy for workflow status.

## Minor issues

### 10. `entity-agnostic field shape` decision is buried

> **Resolved.** Pulled out of the capabilities bullet list into its own "Entity-agnostic field shape" sub-section under Decision 1, with a sentence stating what it rules out (multi-entity actions) and pointing at the `tracker:` mechanism for the cross-entity case.

Decision 1's capabilities list (line 51) calls out scalar `entity_type` + `entity_id` as a single bullet. This is actually a significant design commitment — it rules out an action belonging to multiple entities at once and is what makes `get-entity-workflows` simple. Worth pulling up to a named sub-decision (or noting in the parent design's invariants list).

### 11. `populateIds.js` and `getActionFields.js` are referenced in the directory tree but never explained

> **Resolved.** Added a short `shared/` helpers section under Decision 1's connection-structure tree, one line each for `createMongoDBConnection`, `getActions`, `getActionFields`, and `populateIds`. Stated explicitly that action `_id`s are server-generated.

The connection structure tree (line 28-46) lists `shared/populateIds.js` and `shared/getActionFields.js`, but neither is explained in the capabilities. What populates which ids? Are action `_id`s generated server-side (`_uuid: true` per stored doc) or supplied by the caller? Best guess from context is server-generated; worth stating.

### 12. `eventId` is referenced before being defined

> **Resolved.** Added a header comment above the `pushWorkflowStatus` pseudo-code stating that `eventId` and `actions[]` are part of the `UpdateWorkflowActions` payload (generated upstream by `submit-action`'s `:set_state:` step), and clarifying that `ctx` is shorthand for the handler-local Mongo handle (proper modeling deferred to the client-and-transaction discussion in #3).

The pseudo-code at line 124 takes an `eventId` parameter and passes it to `updateAction`, comment-line 141 saying _"reuse the same eventId — the sub-workflow action update is part of this transition."_ Decision 4 of module-surface (line 311) shows `event_id` being generated by the API routine via `_uuid: true` in a `:set_state:` step. But the engine pseudo-code reads it as a function parameter — where does the plugin's request handler receive it from?

The likely answer: `eventId` is part of the `UpdateWorkflowActions` payload schema. The engine should state that — _"UpdateWorkflowActions accepts `eventId` in the payload; same value is reused by tracker subscription recursion."_

## Open Questions raised by this review

1. **Transaction scope.** Decision needed: single client + manual ordering (the most likely v1 shape), Mongo transactions, or "no transaction, partial-state risk acknowledged." Currently the design assumes all three at different points.
2. **Should `get-entity-workflows` go through `WorkflowAPI` instead of through `MongoDBCollection`?** This collapses `workflows-collection` and `actions-collection` into the `WorkflowAPI` connection's scope and makes the connection-list cleaner.
3. **Build-time validation of `references` collisions.** Decision 2 line 105 calls it _"nice-to-have"_ but the workflow YAML is static, so build-time collision detection in `makeWorkflowsConfig` is cheap and catches a real category of authoring bugs. Worth considering for v1.

## Suggested next steps

- Reframe Decision 2 to drop the "matches events module" justification and add concrete pseudo-code that matches the actual `MongoDBInsertOne`-style handler signature (`async ({ payload, connection, ... })`).
- Add a "Connection and client lifecycle" sub-section to Decision 1 — answer: one client per handler invocation, shared across all sub-steps inside that invocation; no cross-handler transactions in v1.
- Reconcile the connection-export list with module-surface Decision 1 — drop the redundant `workflows-collection` and `actions-collection` if `WorkflowAPI` owns both paths.
- Tighten Decision 4 to specify where `force:` lives in the payload and how tracker writes interact with the priority rule.
- Add a 2-level-nested worked example for tracker recursion to confirm summary writeback ordering is correct.
