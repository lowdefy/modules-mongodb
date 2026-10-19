# Review 1 — Design vs. concept spec, part-04 contract, and existing scaffold

Reviewing [`designs/workflows-module/parts/05-start-cancel-handlers/design.md`](../design.md) against the concept docs (`workflows-module-concept/engine/{spec,design}.md`, `action-authoring/spec.md`), the part-04 deliverables already on disk (`modules/workflows/resolvers/makeWorkflowsConfig.js`, `enums/action_statuses.yaml`, the `WorkflowAPI` connection schema), and the part-03 scaffold (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`). No code in scope yet — this is design-vs-design review.

## Real findings

### 1. Parent `entity_id` / `entity_collection` provenance contradicts the engine spec

> **Resolved.** Dropped `parent_entity_id` and `parent_entity_collection` from the `start-workflow` payload. Only `parent_action_id` is caller-supplied; the handler reads the parent action and copies `entity_id` / `entity_collection` off it. `design.md:15` updated with explicit "callers do not (and cannot) supply them" wording and a link to the engine spec.

`design.md:15` accepts `parent_entity_id` and `parent_entity_collection` as **optional payload fields**. The concept spec at `engine/spec.md:191` is explicit that those two fields are **read from the parent action**, not from the caller:

> "writes the new workflow's `parent_action_id` / `parent_entity_id` / `parent_entity_collection` (**latter two read from the parent action's `entity_id` / `entity_collection`**)"

Confirmed also in `engine/design.md:213`, `action-authoring/design.md:325`, and the worked example. Allowing payload override creates a class of bug the engine has no way to detect: a caller can supply a `parent_entity_id` that doesn't match the parent action's `entity_id`, and the link is silently inconsistent.

**Suggested fix:** drop `parent_entity_id` and `parent_entity_collection` from the payload contract. Keep only `parent_action_id`; the handler reads the parent action and copies `entity_id` / `entity_collection` off it. This also simplifies callers — the spawning code already has the parent action's id; it doesn't need to also know the parent entity layout.

### 2. Parent-side write list is missing `child_entity_id` and `child_entity_collection`

> **Resolved.** Rewrote `design.md:21` to spell out each parent-side field with its source ("`child_workflow_id` (new workflow's `_id`), `child_entity_id` (new workflow's `entity_id`), `child_entity_collection` (new workflow's `entity_collection`)") plus the `$push` to status. No more easy-to-miss bullet structure.

`design.md:21` lists what the handler writes back to the parent tracker action:

> "also write the parent tracker action's `child_workflow_id`, `child_entity_id`, `child_entity_collection`, and push `in-progress` to its status"

Actually this is fine in line 21 — but the in-scope bullet at `design.md:20-21` only ever mentions `child_workflow_id` and the status push as separate items, then folds in `child_entity_id` and `child_entity_collection` once. The engine spec is unambiguous (`engine/spec.md:191`, `engine/design.md:208-209`): all three fields must be written to the parent tracker action, plus the status push.

**Suggested fix:** the design already lists these in line 21; flagging only because the bullet structure makes it easy to miss in implementation. A one-line clarification: "Writes back to parent tracker action: `child_workflow_id` (new workflow's `_id`), `child_entity_id` (new workflow's `entity_id`), `child_entity_collection` (new workflow's `entity_collection`), and `$push` to `status[]` with `{ stage: in-progress, created, ... }`."

### 3. "Atomic on shared client" mis-claims atomicity

> **Resolved.** Struck "atomic on shared client" from `design.md:21`. Replaced with "Sequential through the shared dispatcher, not atomic — same posture as the rest of the engine (see engine spec § Client and transaction model)." The half-linked failure mode is addressed alongside finding #4 (write-order commitment).

`design.md:21` says **"Parent linking (atomic on shared client)"**. The engine spec at `engine/spec.md:93` is the load-bearing commitment:

> "**No Mongo transactions in v1.** Ordering inside a handler invocation is preserved (sub-steps are awaited sequentially), but atomicity is not."

What's actually true on `StartWorkflow` is the same thing as everywhere else: sequential writes through the per-collection dispatcher, no transaction, no rollback. The shared dispatcher gives consistent connection lifecycle and `changeLog` plumbing — not atomicity. Concept-doc sub-designs (review-sam-1 line 35, module-surface line 141, action-authoring/design.md:325) use the word "atomically" loosely too, but the engine spec is the canonical commitment and this design should match it.

This matters because part-05's worst-case failure mode is **half-linked parent/child**: workflow doc + child action docs written, then the parent tracker update fails. The next `start-workflow` call finds `parent_action_id` already on a workflow but `child_workflow_id` null on the parent — the existence check ("rejects when ... `child_workflow_id` is already set") at `design.md:60` will let the next retry succeed and silently relink to a different child. The reconciliation story for this case isn't in the design.

**Suggested fix:** strike "atomic" from line 21. Replace with "Parent linking (sequential through shared dispatcher; same atomicity posture as the rest of the engine — see [engine spec § Client and transaction model](../../../workflows-module-concept/engine/spec.md))." Then either commit a write order that makes retry safe (write parent-side first, child-side second — see finding #4) or call out the half-linked failure mode as a known v1 risk.

### 4. Write order on parent-link path isn't committed; affects retry safety

> **Resolved (option C — accept the half-linked state, document it).** Verified against the v0 `WorkflowAPI` implementation: v0 has no parent-link / tracker-subscription code at all (it only writes action docs, no workflow doc, no parent linking), so there's no v0 precedent for an ordering commitment. v0's broader posture is sequential writes through the dispatcher with no transaction wrapping and no special idempotency guards — matches engine spec § Client and transaction model. Added an explicit "Half-linked failure mode (accepted)" bullet to `StartWorkflow` calling out the failure mode, the reconciliation-catch-all story, and noting that the engine never reads "child" off the parent action for behaviour (subscription is child→parent), so the inconsistency is display-only until reconciliation runs. Write order is not pinned in v1.

The design lists what gets written but not in what order. Given finding #3 (no atomicity), order matters. Two options:

**Option A — parent-first.** Write the parent tracker action's `child_workflow_id` + `child_entity_id` + `child_entity_collection` + `in-progress` push **first**, then the new workflow doc + action docs. If step 1 fails, no orphan workflow exists. If step 2 fails, the parent action says it has a child that doesn't exist — but the engine never reads "child" off the parent action (the tracker subscription is child→parent, not parent→child), so the inconsistency is cosmetic until a UI surfaces it. A retry succeeds because the parent-side validation ("`child_workflow_id` is null") would reject — needs special handling.

**Option B — child-first.** Write workflow + child actions first; parent link last. If parent link fails, an orphan workflow exists with `parent_action_id` populated but the parent tracker doesn't know about it. A retry with the same payload writes a _second_ workflow and tries to link the parent — which then succeeds because `child_workflow_id` is still null. Now there are two child workflows pointing at one parent and the parent points at the second. Worse than option A.

**Suggested fix:** commit option A as the write order, plus an explicit "skip parent-side write if `child_workflow_id === <new workflow _id>`" idempotency check (covers a retry that crashed between parent-side and child-side). Document in the design.

### 5. Idempotent-retry verification claim isn't actually achievable

> **Resolved (option A — accept non-idempotent).** Struck the "Idempotent retry" verification line. Added an explicit "Retry posture" bullet to `StartWorkflow`'s `In scope` section stating the handler is not idempotent on retry, matches engine spec § Idempotency's posture for `summary` drift and side-effect duplication, and that callers needing exactly-once semantics guard at the entity-creation step. Option B (caller-supplied `_id` for idempotency) deferred — clean follow-up if a real consumer surfaces it.

`design.md:60` claims:

> "Idempotent retry: re-calling with same `(workflow_id, type, key)` doesn't double-write (unique index)."

The unique index lives on `actions`, not `workflows`. And `workflow_id` is server-generated (engine spec line 103, "server-generated"; `populateIds.js` exists). The caller cannot supply `workflow_id` to a retry — every retry creates a _new_ `_id`, so the action-doc unique index never sees the same `(workflow_id, type, key)` tuple twice across retries.

The only realistic retry-safety story for `StartWorkflow` is: caller-supplied `_id` (not currently in the payload), or caller-side check ("does a workflow already exist for this `(entity_type, entity_id, workflow_type)`?") before issuing the call. Neither is in the design.

**Suggested fix:** either (a) accept this and document "`StartWorkflow` is not idempotent on retry; callers needing exactly-once semantics check before calling" (matches `summary` writeback drift posture, mentioned in engine spec § Idempotency), or (b) add an optional `workflow_id` to the payload so callers can drive idempotency. Strike the verification claim either way.

### 6. Open Question #1 (keyed `starting_actions`) is actually a part-04 gap, not part-05

> **Resolved (folded into part 05 runtime).** Part 04 is implemented, so per the "review changes touching implemented parts" rule the check shifts from a build-time validator to a runtime one in part 05's handler-entry validation. Added an explicit "Validation" bullet to `StartWorkflow` listing the keyed-action check alongside the workflow-type and parent-action checks, with a cross-reference noting why it lives at runtime instead of build time. Struck the open question from part 05's design. The build-time path stays a follow-up if a future part 04 patch is warranted.

`design.md:69` raises:

> "Where YAML `starting_actions` resolves to concrete keys for instanced actions. Concept spec says payload must supply keys for keyed actions; raises error if YAML alone is used."

Cross-checked: the YAML grammar for `starting_actions` (`action-authoring/spec.md:33,85`) is `{ type, status }` only — no `key:` field. Keyed-action spawning at workflow start happens via the `start-workflow` payload's `actions:` field (`action-authoring/spec.md:339`, `:857`), never via YAML alone.

So a YAML-declared `starting_actions` entry pointing at an action with `key: $foo` is _always_ an authoring error. The part-04 resolver (`modules/workflows/resolvers/makeWorkflowsConfig.js`) doesn't currently validate this — it has no `key` cross-check in its `starting_actions` loop (lines 123–135). The engine running into this at `StartWorkflow` is the worst place to catch it (already on the write path, partial doc state on failure).

**Suggested fix:** kick this back to part 04. Add a validator: "If `starting_actions[i].type` resolves to an action with `key:`, fail at build with a precise message." Then part 05's engine code can assume YAML starting actions never need keys.

### 7. `summary` initialization claim is loose

> **Resolved.** Changed `design.md:19` to compute the initial `summary` from the just-built actions: `{ done: 0, not_required: <count of starting actions whose status is "not-required">, total: <N> }`. No more empty-summary edge case for UI consumers.

`design.md:19` says the workflow doc is written with **"empty `summary` (computed once actions exist)"**. But the action docs _do_ exist at the end of `StartWorkflow` — they're written in the same handler call. The current scaffold for `SubmitWorkflowAction` will recompute `summary` on first user submit, but until that happens the workflow doc carries an empty `summary` that disagrees with the underlying actions.

For consistency with the data model (`engine/spec.md:114`: `summary: { done, not_required, total }`) and to avoid downstream UI guards for the empty case, `StartWorkflow` should compute and write the initial `summary` from the actions it just wrote — typically `{ done: 0, not_required: <count of starting actions with status: not-required>, total: N }`. This is a one-liner over the just-built actions array.

The `groups` deferral to part 7 is fine — group recompute is genuinely orthogonal — but `summary` is trivially computable here and the design's "computed once actions exist" rationale is satisfied by computing it at the end of `StartWorkflow`.

**Suggested fix:** change line 19 from "empty `summary` (computed once actions exist)" to "initial `summary: { done: 0, not_required: <count>, total: <N> }` computed from the starting actions." Saves a class of UI edge case for "is `summary` empty or zero?".

### 8. `display_order` is missing from the workflow-doc write list

> **Resolved.** Added `display_order` (from the matching `workflowsConfig` entry) to the workflow-doc field list in `design.md:19`. `makeWorkflowsConfig` already carries it through `WORKFLOW_FIELDS`.

`engine/spec.md:106` declares `display_order` (number) as a workflow-doc field, sourced from YAML. `design.md:19`'s list of fields the handler writes — "`_id`, `workflow_type`, `key`, `entity_type`, `entity_id`, `entity_collection`, `status`, ... empty `summary`, empty `groups`, empty `form_data`, change stamps, parent back-references" — omits `display_order`.

`makeWorkflowsConfig.js:18` includes `display_order` in `WORKFLOW_FIELDS`, so the normalized config carries it. The handler should copy it onto the workflow doc.

**Suggested fix:** add `display_order` (from `workflowsConfig` entry for the matching `workflow_type`) to the workflow-doc field list in `design.md:19`.

### 9. `tracker.workflow_type` compatibility is unvalidated

> **Resolved.** Added `parent_action.tracker.workflow_type === payload.workflow_type` to the parent-link runtime validation bullet, with rationale ("rejects linking a child of the wrong shape — guards against the parent's `status_map` display text and tracker contract breaking silently"). Updated the StartWorkflow verification list to cover the new rejection case.

When a `start-workflow` call supplies `parent_action_id`, the design validates that the parent action is `kind: tracker` and unlinked (`design.md:21`, `design.md:60`). It does **not** validate that the parent action's `tracker.workflow_type` matches the new workflow's `workflow_type`.

`engine/spec.md:332` worked example: parent's `tracker.workflow_type: device-installation`, child's `workflow_type: device-installation`. The 1:1 contract assumes these match. Nothing today enforces it.

A mismatch would link an unrelated child workflow to a parent expecting a different child shape — the tracker subscription still works mechanically (it uses the hard-coded child-stage map), but the parent's `status_map` display text and any author-declared expectations break silently.

**Suggested fix:** add a validation to the parent-link check: "Validate that `parent_action.tracker.workflow_type === payload.workflow_type`; reject with a structured error otherwise." Add it to the verification list (`design.md:55-65`) too.

### 10. `changeStamp` connection field referenced but not in connection schema

> **Resolved.** Added a new "Connection schema extension" section to part 05 calling out the `schema.js` edit explicitly. Connection accepts `changeStamp` (optional object), engine reads it at handler entry, threads it through `created` / `updated` on every workflow + action doc — one stamp per handler invocation, all writes in the same call share the timestamp. Picks up the deferral logged in part 04 review-1 finding 5.

The engine spec (`engine/spec.md:74`) reads `connection.changeStamp` to thread the change stamp through every write. The part-04 review at finding 5 explicitly deferred `changeStamp` from the connection schema: "No `changeStamp` on the connection schema. Per design conversation, deferred to part 05."

Part 05 design at `design.md:19` says workflow + action docs are written with "change stamps". But the design doesn't call out _adding `changeStamp` to the connection schema_ (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`). Without the schema addition, app-side wiring (`connections/workflow-api.yaml` style) can't pass `changeStamp` in, and the handler reads `undefined`.

This is the part where it lands per part-04 review-1 finding 5; the design should commit that work explicitly.

**Suggested fix:** add to part-05 in-scope: "Extend `schema.js` with `changeStamp` property (`{ type: 'object', description: 'Resolves to the events module change_stamp at app build time.' }`, optional). Update `WorkflowAPI` handlers to spread `changeStamp` onto `created` / `updated` on every workflow + action doc write."

### 11. Parent action priority-rule for `in-progress` push could fail silently

> **Resolved.** Added `force: true` to the parent-side status push in `design.md:21`, with rationale ("engine-driven write — bypasses the priority rule so the push lands regardless of the action's current status; same posture as the tracker subscription in part 10").

The design says the handler pushes `in-progress` to the parent tracker action's status (`design.md:21`). The priority rule (`engine/spec.md:296`) applies: a transition is allowed iff the new status's priority is strictly less than current. From `enums/action_statuses.yaml`:

- `in-progress` priority: 5
- `action-required` priority: 6
- `blocked` priority: 7
- `in-review` priority: 4
- `done` priority: 3

If the parent tracker is currently at `in-review` (priority 4) — say a hook moved it there — pushing `in-progress` (priority 5) would be **rejected** by the priority rule (5 is not strictly less than 4). The design doesn't say whether the parent-link path uses `force: true` for this push.

Tracker subscription (part 10) uses `force: true` per `engine/spec.md:282` ("`force: true` — tracker writes bypass the priority rule"). The same logic applies here: this is an engine-driven write that needs to land regardless of the parent's current state.

**Suggested fix:** add to `design.md:21`: "Parent tracker action's status push uses `force: true` (engine-driven write, same posture as tracker subscription in part 10)."

### 12. CancelWorkflow's `references` spread vs. engine reserved keys

> **Resolved.** Extended the `references` payload bullet in `design.md:29` to commit the engine's reserved-key merge order — "references first, core fields including the cancelled status push last" — with a link to `engine/spec.md § References write contract`.

`design.md:29` says CancelWorkflow optionally spreads `references` onto the workflow doc on cancel. The engine reserved-keys list (`engine/spec.md:238`) includes `status`, `summary`, `groups`, `form_data`, etc. — and the engine spec's "merge order" pattern (`engine/spec.md:222-238`) protects against collisions by writing reserved keys _after_ the references spread.

The design doesn't say which merge order CancelWorkflow uses. If references are spread _after_ the status push, a malicious or buggy caller could pass `references: { status: [...] }` and rewrite the entire status array.

**Suggested fix:** explicit one-liner: "References spread uses the engine's reserved-key merge order — references first, core fields including the new status push last (per `engine/spec.md` § References write contract)."

### 13. CancelWorkflow leaves `groups[]` stale even when `summary` is recomputed

> **Rejected — part 7 already covers this.** Re-read part 7's design: lines 48–50 already commit `CancelWorkflow` integration ("This part adds a group recompute + writeback after that loop so the cancelled workflow doc has `groups[]` consistent with its actions"), and the verification at line 70 covers it. The original finding was based on a missed section. Tightened part 5's cross-reference to point at the specific section so future readers don't have to search part 7 to confirm.

`design.md:33` commits to recomputing and writing `summary` on cancel, but defers `groups[]` recompute to part 7. After a cancel, the workflow's actions are mostly `not-required`. Per `action-groups/spec.md` (referenced from `engine/spec.md:115`), a group's three-value status (`blocked` / `in-progress` / `done`) is derived from its actions. A cancelled workflow's groups should presumably all be `done` (since every action is terminal: either was-done-already or now-`not-required`).

Leaving `groups[]` un-recomputed on cancel means consumers reading the workflow doc post-cancel see groups that don't reflect reality until _something else_ triggers a `SubmitWorkflowAction` — which never happens on a cancelled workflow.

This is fine _iff_ part 7 commits to recomputing `groups[]` on cancel too. But part 7's design (`parts/07-group-state-machine/design.md:21`) says "Eager writeback on every `SubmitWorkflowAction` call (lifecycle step 5)" — it doesn't mention CancelWorkflow at all.

**Suggested fix:** either (a) extend part 5's CancelWorkflow scope to recompute groups too (small lift if part 7's `recomputeGroups` helper is in place), or (b) explicitly note that `CancelWorkflow` groups recompute lands in part 7 — and update part 7's design to add it. The current "groups recompute deferred to part 7" line in part 5 doesn't have a corresponding scope entry in part 7.

### 14. The "shared internal helpers" list at design.md:37-40 duplicates files already in `shared/`

> **Resolved.** Committed `src/connections/shared/` as the home for `createAction.js` and `updateAction.js`, matching the existing pattern (part 03's shipped `shared/` directory already holds `createMongoDBConnection.js`, `getActions.js`, etc.). Updated the design's "Shared internal helpers" section with the path and an explicit note that the concept-spec's `SubmitWorkflowAction/`-nested example is being diverged from because `StartWorkflow` and `CancelWorkflow` also consume these. Updated the "Contract to neighbours" line so part 6 imports from `shared/` and extends `updateAction.js` in place rather than introducing a duplicate. Concept-spec text at `engine/spec.md:23-25` left as-is — it's an example layout, not a normative contract.

`design.md:39-40` says:

> - `createAction.js` — inserts an action doc; consumed by both handlers and by part 6.
> - `updateAction.js` (minimal scaffold) — sufficient for the cancel path's `force: true` writes. Full priority-rule implementation in part 6.

The engine spec (`engine/spec.md:11-36`) places these under `src/connections/WorkflowAPI/SubmitWorkflowAction/`, not at the top of `WorkflowAPI/`. The actual files on disk (`plugins/modules-mongodb-plugins/src/connections/shared/`) already include `createMongoDBConnection.js`, `getActions.js`, `getActionFields.js`, `populateIds.js` — but **not** `createAction.js` or `updateAction.js`.

This is a question of file layout:

- Option A: put `createAction.js` / `updateAction.js` in `shared/` since they're shared across `StartWorkflow`, `CancelWorkflow`, and `SubmitWorkflowAction`. Matches the existing `shared/` convention.
- Option B: nest them under `SubmitWorkflowAction/` as the engine spec lays out, and have `StartWorkflow.js` / `CancelWorkflow.js` import from there. Awkward — `StartWorkflow` is logically prior to submit, not a submit subroutine.

**Suggested fix:** part 05 commits the file layout. Recommend option A (move to `shared/`) for symmetry with the existing helpers. Update the engine spec at line 23-25 to reflect this (it currently nests them under `SubmitWorkflowAction/` which doesn't compose with start/cancel needing them).

## Items deliberately not flagged

- **Part 5 doesn't emit a log event on cancel.** Already explicitly deferred (`design.md:45`).
- **Tracker subscription on parent cancel.** Deferred to part 10 (`design.md:46`).
- **`groups[]` populated on workflow start.** Deferred to part 7 (`design.md:19`).
- **No JSDoc types file for the workflow doc shape.** Repo convention (events, contacts, etc. don't carry one).
- **Open question #2** (cancel-an-already-cancelled-workflow no-op vs. error). Lean is recorded (no-op), fine for v1.
