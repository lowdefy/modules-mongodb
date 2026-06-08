# Part 38 — Engine rebuild: FSM + load-plan-commit

**Layer:** engine handlers + shared write helpers + Mongo driver layer + audit log. **Size:** XL. **Repo:** `plugins/modules-mongodb-plugins/src/connections/`, `modules/workflows/`.

**Prerequisite.** Concept-level reconciliation lands first: [`state-machine`](../../../../workflows-module-concept/state-machine/design.md) becomes the authority for transition resolution, with [`engine`](../../../../workflows-module-concept/engine/design.md) Decision 4 and [`submit-pipeline`](../../../../workflows-module-concept/submit-pipeline/design.md) Decision 3 citing it. This implementation design assumes those edits are settled. This part also sequences **after** [Part 35 — rename `kind:task`→`simple`](../35-rename-task-kind-to-simple/design.md): the action kinds are `form` / `simple` / `tracker` throughout, and the FSM tables key on `simple` (not `task`).

**Supersedes** [Part 30 — Engine-managed display](../../_rejected/30-status-map-rendering/design.md). Part 30 is moved to `_rejected/` with a README pointing here. The on-disk contract Part 30 established (top-level per-app keys on action docs, sticky display, engine-computed links for built-in kinds, engine-rendered event display) is the right contract — Part 30's mistake was layering it onto the existing handleSubmit shape, which couples render context to mutable handler state and produces a class of staleness bugs that surface review after review (see Part 30 reviews 5 + 6). This part keeps Part 30's contract and rebuilds the API beneath it.

**Implements [Part 34 — Action access model](../34-action-access-model/design.md).** Part 34 is a design-only contract with no standalone implementation; its engine/resolver/display-touching decisions land here. Part 38 is the implementation vehicle for: (1) the per-app per-verb `access` shape and its resolver validation; (2) the per-verb `links` map on action docs (Part 34 D7), which **supersedes** Part 30's single `action[slug].link`; (3) signal→verb submit-time gating (Part 34 D6); (4) the `visible_verbs` query response replacing the binary `access_filter` (Part 34 D12); and (5) the emitted-id naming for central-auth globs (Part 34 D10) — derived per-workflow endpoints stay entry-scoped with no literal prefix, the `workflow-` prefix instead marking the module's fixed pages. Wherever this design previously carried a Part 30 surface that Part 34 changed (single link, the `access`-verb shorthand array), the Part 34 shape wins. See D16 for the consolidated list of surfaces touched.

## Why this rebuild

Today's `SubmitWorkflowAction.handleSubmit` interleaves 11 read/write/render steps over a mutable `context` bag. Each step's input is what previous steps left in `context`. Render points (Part 30's render-on-write at action transitions, and the always-needed event display render before `dispatchLogEvent`) need the "latest" version of action and workflow docs — but the latest version is spread across (a) the original reads, (b) per-call write returns, (c) helper-internal recomputes, (d) the form_data sidewrite at step 6. The handler tracks all four by mirroring writes back into `context.action` / `context.workflow` step by step. Adding any new write or any new render point opens a new staleness window.

The priority-rule + `force: true` transition model layers a second axis of complexity on top: every call to `updateAction` carries a `force` flag, the priority gate has a same-stage self-exception, engine-internal call sites bypass the gate, and the FSM that the action lifecycle actually expresses is implicit across priority numbers and code-path branches. [State-machine.md](../../../../workflows-module-concept/state-machine/design.md) is the concept-level answer to this axis.

This part addresses both axes at once because they share surface area:

- The signal-resolution model (FSM) restructures the per-entry write loop in handleSubmit.
- The load-plan-commit architecture restructures the surrounding read/write/render flow.
- They share the same shared helpers (`updateAction`, `createAction`, `recomputeWorkflowAfterActionWrite`, the cascade sweepers) and the same `context` shape.

Sequencing them is more churn than combining them. Combined, they collapse the recurring "render against stale in-memory doc" bug class into something structurally impossible: renders happen against the **planned** state, which is also exactly what gets committed.

## Proposed change

1. **Every engine write entry point (`SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, plus the tracker-recursion sub-handler) restructures into four phases:** load → pre-hook → plan → commit → post-hook. Reads happen in load. Writes happen in commit. The plan phase is pure (no I/O). Pre-hook returns intent (signals + overrides); post-hook fires against committed state.
2. **Signals replace the priority rule + `force: true`.** FSM tables per action kind (form/simple/tracker) drive transition resolution. Engine-internal call sites emit named `internal_*` signals. Pre-hook returns shift from `{ type, status }` to `{ type, signal }`. Per state-machine.md.
3. **One in-memory Plan object accumulates every consequence of a submit.** Per-action transitions (signal resolved → new stage + rendered cell + computed links + fields + merged metadata), workflow changes (summary, groups, form_data, optional `completed` push), the event payload (rendered against the planned post-state). Notifications are **not** in the Plan — the engine builds no notification doc; it dispatches `send-notification` keyed on the committed `event_id`(s) after commit (D9 step 4). Plan is purely additive — actions/workflow/events are written from the Plan; nothing reads back from Mongo during plan.
4. **Render-against-planned-state replaces render-on-write.** Part 30's action-doc display contract (rendered cell + engine links spread at top level of the action doc, sticky across transitions) is unchanged on disk. The difference is *when* the render happens: during the plan phase, against the doc shape the commit phase will write. There is no "pre-write doc" vs "post-write doc" gap because the Plan is the only source of truth for both render and commit.
5. **Engine writes go through new shared helpers using the native Mongo driver.** `findOneAndUpdate({ returnDocument: "after" })` for single-doc writes that the caller needs back; `bulkWrite` for batched action transitions. The community-plugin `MongoDBUpdateOne` / `MongoDBUpdateMany` is replaced for engine-internal write paths; the plugin stays in use for app-side YAML CallApi requests.
6. **Audit change-log reuses the community plugin's `changeLog` contract.** No new collection: the engine writes the same `log-changes` entries, in the same schema, configured by the same `changeLog: { collection, meta }` connection property — it just populates before/after from the Plan instead of from extra reads (D7). Because engine writes now bypass the community plugin (D8), the engine reproduces the audit the plugin used to write automatically.
7. **Pre-hooks are read-only with respect to the engine's atomicity boundary.** Pre-hooks may do their own callApi/MongoDB work for external coordination, but the engine's plan-then-commit treats pre-hook returns purely as input. Writes the pre-hook performs are independent of the engine's commit; this is a deliberate contract, documented for authors.
8. **Tracker recursion is its own load-plan-commit cycle per level.** `fireTrackerSubscription` becomes a loop that, for each parent workflow up the chain, runs the same four phases on that parent workflow. No shared in-memory state between levels; each level is independently atomic.
9. **`shared/` reorganizes around the phase model.** `createAction.js` / `updateAction.js` go away as primary call sites. Replaced by: `loadWorkflowState.js` (read phase), planners (`planActionTransition.js`, `planWorkflowRecompute.js`, `planEventDispatch.js`), `commitPlan.js` (write phase), and Mongo-driver helpers (`mongo/findOneAndUpdateDoc.js`, `mongo/bulkWriteActions.js`, `mongo/insertOneDoc.js`).
10. **Salvaged from Part 30 unchanged:** the on-disk action-doc shape (per-app cells spread at top level, sticky display, `status_title`, `metadata`); engine-computed links for built-in kinds with the `entry_id`-scoped pageId mechanic, now emitted as a **per-verb `links` map** (kind × stage × **verb**) per Part 34 D7 rather than Part 30's single `link`; the resolver shape-validator for status_map cells; engine-rendered event display with the fixed render context; the display-surface renames (task 18; the group-overview page's reads are unchanged — its single rendered link is resolved server-side per [Part 42 D5](../42-timeline-action-cards/design.md)); the engine-default event template rewrite to plain Nunjucks strings; the workflow-api connection `entry_id` wiring; the resolver `app_name` var description update.
11. **Start, Cancel, and Close each emit a log event** in addition to action-level events. Today only Submit dispatches log events; under this rebuild, every engine handler invocation produces exactly one `event_id` and a corresponding entry in the `events` timeline (`workflow-started`, `workflow-cancelled`, `workflow-closed`). One `event_id` per invocation anchors that invocation's events-timeline entry; the `log-changes` audit (D7) follows the community plugin's schema and is keyed/grouped the same way the plugin keys it (no engine-specific `commit_id` field).
12. **Concurrency: Compare-And-Swap on `workflow.updated`.** Each handler reads `workflow.updated` at load; the commit's workflow `findOneAndUpdate` filter pins that value. Concurrent writes between our load and commit make the filter miss; the engine throws a retryable error. No version field, no transactions required. See D15.
13. **Demo rebuild ships via [Part 45](../45-demo-rebuild/design.md)** (supersedes the in-place migration originally scoped here as task 20, now a stub pointing there). The demo `workflow_config` is deleted and re-authored from scratch in the post-rebuild grammar rather than converted. The demo remains the only in-tree end-to-end exercise of the engine; that integration test lands after this part's tasks 1–19 → Part 43 (`kind: check`; the shared-page renames originally scoped there were pulled forward into task 18 as `workflow-action-*` per review-14 #1) → Part 44 (`start_link`) → Part 45. The original task's non-config concerns (per-verb `action_allowed` template consumers, notification policy) carry over to Part 45.
14. **Part 34's access model is absorbed here.** The resolver validates the per-app per-verb `access` shape (verb-key whitelist, gate values `true | [roles]`; reject the empty-list / shorthand-array / action-wide `access.roles` / unknown top-level forms; lint-warn on `edit`/`review`/`error` without `view`). The submit handler runs the signal→verb access check against `access.{current_app}.{verb}` and `_user.apps.{current_app}.roles` before any write. `get-entity-workflows` (and its `get-workflow-overview` / `get-action-group-overview` `_ref` callers) replace `access_filter.yaml` with `visible_verbs_filter.yaml`, projecting a four-key `visible_verbs` bag per action and dropping actions with no true verb. Derived page ids (`makeActionPages`) and Api ids (`makeWorkflowApis`) stay `{workflow_type}-{action_type}-…` with no literal prefix (entry scoping namespaces them); the `workflow-` prefix is instead added to the module's fixed pages (`workflow-action-*`, `workflow-group-overview`, `workflow-overview`). See D16 and Part 34 D10 for full rationale.

## Key decisions

Index — one line per decision; details in the sections below.

- **D1.** Load-plan-commit over render-on-write + re-fetch: renders consume the Plan, commit writes the Plan — staleness is structurally impossible.
- **D2.** Phase contracts: load (all reads + access check) → pre-hook (intent only) → plan (pure, no I/O) → commit (writes only) → post-hook (against committed state).
- **D3.** The Plan object: one in-memory object holding every consequence of an invocation — planned docs, event, change-log, completed groups, tracker fires. Empty plans never reach commit.
- **D4.** FSM resolution at plan time: three signal sources, one resolver; the `submit` → in-review/done split (`hasReview`) is action-global; auto-unblock is an unblock-only fixpoint interleaved with group recompute.
- **D5.** Pre-hook contract: returns intent (auxiliary signals + overrides); its own writes are outside the engine's atomicity boundary; no current-action redirect.
- **D6.** Post-hook contract: fires after commit; sees fresh state via the Plan, no re-read.
- **D7.** Change-log: reproduce the community plugin's `changeLog` contract natively — same collection, schema, config; before/after from the Plan, no extra reads.
- **D8.** Mongo driver layer: engine-owned cached `MongoClient` + thin native-driver helpers; community plugin stays for app-side YAML.
- **D9.** Commit ordering: workflow claim first (CAS gate), then actions, then event → notification → change-log dispatches; steps 3–5 never abort a committed submit (`dispatchErrors[]` + end-of-handler throw).
- **D10.** Tracker recursion: a per-level load-plan-commit loop — chain-depth guard, bounded CAS retry, recorded (not thrown) per-fire failures.
- **D11.** Transactions conditional on replica-set detection (steps 1–2 only); standalone falls back to D9's ordered writes, which are correct on their own.
- **D12.** Render-against-planned-state: templates render against post-commit doc shapes; two render contexts (action events vs workflow-lifecycle events).
- **D13.** Signal validation + error model: user signals throw, cascade signals no-op; one `WorkflowEngineError` base discriminated by `code`.
- **D14.** Salvaged from Part 30: on-disk contract + display machinery carry over (inventory in [carried-surfaces.md](carried-surfaces.md)).
- **D15.** Concurrency: CAS on `workflow.updated.timestamp` pinned in the commit filter; tracker levels are the only auto-retry site.
- **D16.** Part 34's access model lands here: submit-time gate, per-verb links, `visible_verbs`, resolver validation, id naming (surfaces in [carried-surfaces.md](carried-surfaces.md)).

### D1. Why load-plan-commit (and not "render-on-write + re-fetch before event dispatch")

The lightweight alternative — keep handleSubmit's shape, add render-on-write, re-fetch before event dispatch — works mechanically but doesn't survive the next write site added to the flow: each one reopens the staleness bug class Part 30's reviews kept re-filing (e.g. review-6 #2). Load-plan-commit makes render staleness structurally impossible:

- During the plan phase, every consequence of the submit is computed against the loaded state plus accumulating planned changes. The Plan is the post-commit shape of every doc.
- Renders consume the Plan, not the loaded docs and not Mongo.
- The commit phase writes the Plan and nothing else.

New write sites extend the Plan; renders that depend on what they wrote are already reading from it. (Standard pattern — DDD aggregate + unit-of-work, functional-core / imperative-shell. The workflow doc is the aggregate root; a submit is one atomic mutation of the aggregate.)

### D2. Phase contracts

The four phases are not just labels — each has an explicit input/output contract that the code structure enforces.

**Load phase.** Input: handler context (params, user, connection). Output: a `LoadedState` object containing the workflow doc, all action docs, the workflowConfig, the actionConfig for the target action (Submit only — Start/Cancel/Close operate on the whole workflow). Performs N reads (workflow + actions for the target workflow; for Submit, also the target action; hooks haven't run yet). Throws if state is missing or invalid (workflow not found, action not found, **per-verb access check fails**, workflow stage doesn't accept submissions — a `completed`/`cancelled` workflow rejects the submit **unless** `actionConfig.required_after_close === true`, preserving the current `handleSubmit.js` carve-out for post-close required actions). The access check (Submit only) resolves the signal's required verb (Part 34 D6: `submit`/`progress`/`not_required`→`edit`, `resolve_error`→`error`, `approve`/`request_changes`→`review`) and rejects unless `access.{current_app}.{verb}` is `true` or intersects `_user.apps.{current_app}.roles` (D16). **The check living in the load phase — ahead of the pre-hook — is intentional: an unauthorized submit is rejected before any pre-hook fires, so unauthorized users never trigger pre-hook external side effects (callApi, third-party writes). Do not move the check after the pre-hook.** After load returns, no further reads happen until the next load (the tracker-recursion next-level load).

**Pre-hook phase.** Input: `LoadedState` + caller payload. Output: `PreHookResult` containing auxiliary signals (against *other* actions), form_overrides, event_overrides. A pre-hook **cannot** re-signal the current action — there is no root-level signal redirect (state-machine.md, "How signals get emitted"); the current action lands per the signal the user fired. Single `callApi` to the hook routine. Pure consumer of the result — the engine doesn't trust the hook to have done writes that affect engine state; if a hook does writes for external reasons (e.g. updating a third-party system), those are out-of-band by contract.

**Plan phase.** Input: `LoadedState` + `PreHookResult`. Output: a `Plan` object (see D3). Pure functions only. No I/O. Computes every consequence of the submit: per-action transitions via FSM resolution, per-action rendered cells + engine links + merged metadata, workflow summary/groups/form_data updates, workflow auto-complete push, event payload (rendered against planned post-state), change-log entries. (Notifications are not composed here — they are dispatched post-commit from the committed `event_id`; see D9 step 4.) The plan phase can throw — invalid signal target, invalid status transition that the FSM doesn't allow but the author asked for explicitly (noisy for user signals, silent for cascade signals — see D13), shape-validation errors caught at plan time rather than at commit time.

**Commit phase.** Input: `Plan`. Output: commit result (the doc IDs of what was written). Single ordered batch of writes through the new Mongo helpers. No reads. No renders. No logic that wasn't in the plan. If transactions are enabled (D11), the entire commit is one transaction; if not, writes are sequenced in a documented order with documented partial-failure semantics.

**Post-hook phase.** Input: `LoadedState` (pre-write) + `Plan` (committed) + commit result + the tracker cascade's fire list (D6). Output: post-hook return value, surfaced as part of the handler's return payload. Single `callApi`. Authors writing post-hooks see fresh state because the Plan contains it — no need to re-read.

The contract is enforced by the file layout (D8: `shared/` reorg). Phase functions live in different files; a planner that imports a Mongo driver is a code smell caught in review.

### D3. The Plan object

```ts
type Plan = {
  workflow: {
    doc: WorkflowDoc;              // post-commit shape — what commit phase writes
    operation: "insert" | "update"; // update (default) for Submit/Cancel/Close/tracker; insert for Start.
                                   // Commit step 1 dispatches accordingly: update → CAS findOneAndUpdate (D15);
                                   // insert → insertOneDoc, no CAS filter (a fresh _id can't race — nothing to claim).
    changeLog: ChangeLogDelta;     // before-after for audit; null `before` for insert
  };
  actions: Array<{
    doc: ActionDoc;                // post-commit shape (including rendered cell, engine links, metadata)
    operation: "insert" | "update"; // commit phase dispatches accordingly
    changeLog: ChangeLogDelta;     // before-after for audit; null `before` for inserts
  }>;
  event: {                         // exactly one per invocation — the doc's _id IS the per-invocation
    doc: EventDoc;                 // event_id (a second entry would collide on _id), so the type
  };                               // enforces the invariant. Fully rendered display, references, metadata.
  changeLog: ChangeLogEntry[];     // finished community-schema log-changes entries; commit step 5 inserts these.
                                   // Built by planChangeLog (D7) from the per-doc `changeLog` deltas above —
                                   // those deltas are the raw { before, after } pairs; this is the transformed output.
                                   // Empty when `changeLog` is not configured on the connection.
  // No `notifications` field: the engine builds no notification doc. After commit it
  // fires callApi("send-notification", { event_ids: [event_id] }) keyed on the committed event;
  // the app's send_routine owns recipient fan-out and any notification-doc write (D9 step 4).
  completedGroups: Array<{         // groups newly `done` in this plan — loaded `workflow.groups` vs
    workflow_id: string;           // planned `groups` diff, `on_complete` joined from
    id: string;                    // `workflowConfig.action_groups` (today's completed_groups shape).
    on_complete: object | null;    // Written nowhere — read by the handler return payload (task 15)
  }>;                              // and the post-hook `result` bag (D6 / task 14).
  trackerFires: Array<{            // recursion handled per-level outside this plan
    parentWorkflowId: string;
    parentActionId: string;
    signal: string;                // internal_mirror_child_active | _completed | _cancelled
    payload?: { fields: object };  // optional — Start's child link fields (child_workflow_id,
                                   // child_entity_id, child_entity_collection); planTrackerLevel
                                   // forwards it into planActionTransition's payload.fields (tasks 16/17)
  }>;
};
```

Notes:

- `workflow.doc` is the **whole** post-commit workflow doc, not a delta. The planner composes it from `loadedState.workflow` + each accumulated change (summary recompute, groups recompute, form_data merge, optional `completed` status push). The commit phase does `findOneAndUpdate` with a `$set` of the whole doc minus `_id`. (Q1, resolved: whole-doc — see "Open questions" below.)
- `actions[].doc` is the whole post-commit action doc. For inserts, that's the full draft. For updates, that's the loaded action with planned changes layered on (new status entry prepended, fields set, rendered cell spread, engine links computed, metadata merged).
- Renders run during planning: `actions[].doc.<app-slug>.message`, `actions[].doc.status_title`, and `event.doc.display.<app-slug>.{title,description}` are rendered Nunjucks strings at plan time, against the planned post-commit shape of the doc the template references. The per-verb `actions[].doc.<app-slug>.links` map (Part 34 D7) is **computed** in the same pass by `computeEngineLinks` (not a Nunjucks render) — one `{ view, edit, review, error }` map per slug.
- `changeLog` deltas (D7) capture before vs after for audit. Built during planning, alongside the planned doc shape.
- `trackerFires` records what tracker subscriptions should fire after the current workflow's commit completes — the tracker recursion loop runs the next-level load-plan-commit per entry. **Producer rule (one rule, all handlers):** fires are composed *purely* from ids already in hand — the loaded workflow doc's `parent_action_id` + `parent_workflow_id` (the latter a schema addition stamped by `StartWorkflow`; see "Schema additions") — never by a cross-workflow read, which the pure plan phase couldn't do. Per handler: Submit emits one `internal_mirror_child_completed` fire iff the recompute pushed `completed` **and** `parent_action_id != null` (today's `shouldPushCompleted` gate + no-parent short-circuit); Start emits `internal_mirror_child_active` with ids from the loaded parent action (`payload.parent_action_id` + that action's `workflow_id`) plus `payload.fields` carrying the child link fields (`child_workflow_id`, `child_entity_id`, `child_entity_collection`) — forwarded by `planTrackerLevel` into `planActionTransition`'s `payload.fields`; Cancel emits `internal_mirror_child_cancelled` and Close emits `internal_mirror_child_completed` (close is forced completion — the child's status reads `completed`, so the parent tracker lands `done` exactly as on a natural completion; today's `CHILD_STAGE_MAP` behaviour, review-13 #3), both iff the loaded workflow has `parent_action_id != null`. Tracker levels recurse identically — each level's loaded parent workflow carries its own `parent_action_id`/`parent_workflow_id`.

The Plan is immutable once handed to commit. **Empty plans never reach commit — the caller short-circuits.** A user-driven current-action signal with no FSM entry *throws* (D13 (3) / Q2), so Submit always plans at least one transition; the only real producer of an empty plan is a tracker cascade level whose mirror signal FSM-no-ops against the parent's target action. In that case nothing changed (no transitions → recomputed groups/summary equal the loaded ones), so `planTrackerLevel` returns `null` (the planner no-op convention, mirroring `planActionTransition`) and the cascade loop skips `commitPlan` for that level entirely (task 16) — no workflow write (no `updated` stamp advance, which would otherwise claim the parent and create spurious CAS pressure on concurrent real submits), no mirror event, no change-log entries, no further fires from that level. `commitPlan` itself stays logic-free: it executes whatever it's given; the mongo helpers' empty-batch no-ops are a backstop, not the mechanism.

### D4. FSM resolution at the plan phase

State-machine.md defines the FSM tables per kind. The planner resolves signals through them:

```js
function resolveSignal({ action, signal, actionConfig }) {
  const table = FSM_TABLES[action.kind];
  const currentStage = action.status[0].stage;
  const entry = table[currentStage]?.[signal];
  if (entry === undefined) return null; // no-op signal — non-listening state
  if (typeof entry === "string") return entry; // direct target
  return entry({ action, actionConfig }); // function — e.g. `submit` picks in-review vs done via `hasReview(actionConfig)` (see below); reads static config, app-agnostic, no payload input
}
```

**The `submit` → in-review/done split is an action-global property.** The function cell resolving `submit` from `action-required` chooses `in-review` vs `done` by whether the action declares a review stage in its design — computed app-global, not scoped to the submitting app:

```js
// does any app block in the action's access declare a review verb?
const hasReview = (actionConfig) =>
  Object.values(actionConfig.access ?? {})
    .some((appBlock) => appBlock != null && "review" in appBlock);
```

One action doc is shared across every app (all read the same `status[0].stage`), so whether a review step exists is a property of the action, not the submitter — `resolveSignal` takes no current-app argument for exactly this reason. Read live from the static `actionConfig`; editing `access` to add/remove a review stage on a live workflow is the author's migration responsibility — see D16. Per Part 34 D6.

Three signal sources, identical resolution:

1. **User signal** — `payload.signal` from the API endpoint. Submit applies this to the target action identified by `payload.action_id`.
2. **Pre-hook auxiliary signals** — `preHookResult.actions[]` carries `{ target, signal }` entries; each resolves through the FSM against its target action. An entry may also carry `upsert: true` to **spawn a missing target**: when no doc matches `(type, key)`, the planner resolves the signal against the FSM's `none` creation row (the absent doc's current stage is `none`, per state-machine.md) and routes the result to `operation: "insert"`, creating the action at the resolved birth stage. This is the rebuilt home of today's `handleSubmit` `upsert: true` spawn (`utils/shouldCreate.js` + `createAction`); the old `status` seed is gone — the birth stage now comes from the signal. A missing target *without* `upsert: true` throws (D13 (2)). An entry may also carry optional `fields?` / `metadata?` — the data seeding channel (state-machine.md path 3): threaded into `planActionTransition`'s `payload.fields` / `payload.metadata` for that target, seeding spawned docs and applying to existing-target transitions alike (today's `entry.fields` behaviour in both `createAction` and `updateAction`).
3. **Engine cascade signals** — auto-unblock re-evaluation, tracker subscriptions, cancel/close cascades. Emit `unblock`/`internal_mirror_child_*`/`internal_cancel_action` signals against affected actions. All resolved through the same FSM call. The engine never auto-emits `block`: per state-machine.md, engine cascades are monotonic (unblock-only), and `block` is a **pre-hook-only** auxiliary signal that arrives via `preHookResult.actions[]` (source 2) and resolves through the same FSM call.

Auto-unblock is a fixpoint over the Plan, **interleaved with group recompute**. Each `blocked_by` entry resolves as **either** an **action type** — satisfied iff *every* doc of that type is terminal in the Plan (the keyed-action rule: a type isn't terminal until all its keyed instances are) — **or** a **group id** declared in `action_groups[]` — satisfied iff that group's *planned (recomputed)* status is `done`. Because the group test reads recomputed status, the fixpoint alternates: recompute planned groups from the current planned action states, fire `unblock` against every blocked action whose `blocked_by` is now fully satisfied, and repeat until no new unblock fires; a final recompute then feeds the workflow doc's `groups[]` / `summary`. An `unblock` lands `action-required` (non-terminal), so it never makes a *new* group `done` — but it does change a group's label (`blocked → in-progress`), which is exactly why the recompute must run *after* the unblocks, not only before. The unblock-only cascade keeps the bound trivial: each action unblocks at most once, and `unblock` no-ops from every non-`blocked` state per the FSM (`unblock` from `blocked` goes to `action-required`, which doesn't itself accept `unblock`). The engine does **not** auto-emit `block` on dep regression — once unblocked, an action stays unblocked unless an author explicitly re-blocks it via a pre-hook (state-machine.md). Worst case: N iterations for N actions in the workflow. In practice 1-2. (Unifies today's `computeAutoUnblocks` + `reevaluateBlockedActions` into one interleaved fixpoint; the group recompute is the existing pure `recomputeGroups` / `deriveGroupStatus` helpers, relocated to `shared/phases/planners/` and imported by both `planAutoUnblock` and `planWorkflowRecompute`.)

### D5. Pre-hook contract: read-only relative to engine atomicity

A pre-hook returns intent (signals + overrides) and may have done external work (callApi, third-party integration). The engine treats pre-hook returns as plan input. Two consequences:

- **Pre-hook writes don't participate in the engine's transaction (if transactions are adopted — D11).** Authors writing pre-hooks that do their own Mongo writes must accept that their writes commit independently of the engine's atomicity boundary. Documented in module README.
- **Pre-hook returns are the only channel into the Plan.** A pre-hook that wants to influence *other* actions returns `{ actions: [...] }` (auxiliary signals); an entry may carry `upsert: true` to spawn a missing keyed instance, in which case the signal resolves through the FSM's `none` creation row instead of an existing doc's stage (D4). A pre-hook that wants to override event display returns `{ event_overrides: {...} }`; written form data, `{ form_overrides: {...} }`. There is no current-action signal redirect — where the current action lands is fixed by the signal the user fired and the FSM (state-machine.md). Conditional landing ("this submission should be marked not-required") is modelled as a separate thin action with its own button, not a redirect of the current submit. There is no "the pre-hook quietly mutated context" path because there is no shared mutable context across phases.

This contract is the same as today's pre-hooks structurally — today's hooks already return a structured response that handleSubmit consumes. What changes: the response shape (Part 30 + state-machine signal mapping), and the explicit "writes are out-of-band" framing.

### D6. Post-hook contract: against committed state

Post-hooks fire after the commit. The wrapper's input is `LoadedState` (pre-commit) + the committed `Plan` + the commit result (IDs written) + the tracker cascade's fire list. The author-facing payload keeps the `buildHookPayload` envelope, with `context` populated from the **planned** docs (`plan.workflow.doc` + the planned target-action doc — the concrete mechanism behind "fresh state through the Plan, no re-read") and `result` pinned to `{ action_ids, completed_groups, event_id, tracker_fired }` (task 14). The handler return value carries the post-hook response.

This is identical to today's post-hook semantically — the only difference is that the "what was just written" data structure is now the Plan rather than a soup of mirrored fields on `context`.

### D7. Change-log mechanic — reuse the community plugin's `changeLog` contract

The engine does **not** introduce a bespoke audit collection. It reproduces the community plugin's existing `changeLog` feature exactly: same collection (`log-changes` by convention), same per-entry schema, same connection configuration. The only difference is internal — how before/after are obtained (from the Plan, not from extra reads).

Today engine writes go through the community plugin's `MongoDBUpdateOne` / `MongoDBInsertOne`, which auto-write a `log-changes` entry per op (the `changeLog: { collection, meta }` property on `WorkflowAPI/schema.js` already configures this). Once D8 routes engine writes through native-driver helpers, the community plugin's `changeLog` stops firing for those writes — so the engine must produce the same entries itself.

**Configuration — unchanged.** The existing `changeLog: { collection, meta }` property on the WorkflowAPI connection is **kept and now honored by the engine natively**. Opt-in exactly like the community plugin and the events module (`{ collection: log-changes, meta: { user: { _user: true } } }`). When `changeLog` is not configured, the engine writes no audit entries — same behaviour as the community plugin.

**Schema — identical to the community plugin's `log-changes` entry, which is per-type** (verified against the `@lowdefy/community-plugin-mongodb@3.0.0` dist source). Per affected doc the engine writes one entry: **update entries** (`type: "MongoDBUpdateOne"`) carry `{ type, args: { filter: { _id }, update: { $set: <planned doc> } }, before, after, payload, timestamp, meta }` — no `response` (the plugin logs none on updates, and the engine's bulk writes return counts only anyway); **insert entries** (`type: "MongoDBInsertOne"`) carry `{ type, args: { doc: <planned doc> }, response: { acknowledged: true, insertedId }, payload, timestamp, meta }` — no `before`/`after` (the plugin logs none on inserts; the doc is in `args.doc`; `insertedId` is the plan-time minted `_id`, so the entry is truthful at plan time). `payload` (the request payload) appears on every entry, exactly as the plugin logs it. All entries also carry the request-context fields `blockId` / `connectionId` / `pageId` / `requestId`, populated from the engine handler's request context, shared across all entries from one invocation. These fields are reliably available with **exact parity** to the community plugin: Lowdefy's `callRequestResolver` passes `{ blockId, connectionId, pageId, requestId, endpointId }` to *every* connection request resolver, so the WorkflowAPI handler receives them on the same `lowdefyContext` object the community plugin reads — `SubmitWorkflowAction.js` just threads them into the engine context. When an invocation lacks a page/block (e.g. a server-side endpoint step), `pageId`/`blockId` are `undefined` — but that is identical for the community plugin, so an engine-written entry is never *less* populated than a plugin-written one. `type` reflects the logical operation (`MongoDBUpdateOne` for an action/workflow update, `MongoDBInsertOne` for an action insert). `meta` is a **verbatim copy** of `connection.changeLog.meta` — the plugin does no resolution (Lowdefy already evaluated operators like `_user` when building connection properties), and neither does the engine. No engine-specific fields are added — a `log-changes` reader can't tell an engine-written entry from a community-plugin-written one except by `type`/content.

**How before/after are obtained — from the Plan, no extra reads.** The community plugin captures `before`/`after` with extra reads (`findOneAndUpdate` + `findOne`) because it is stateless per op. The engine doesn't need to: `before` is the doc the load phase already read (`loadedState.action` / `loadedState.workflow`), and `after` is the doc the plan phase already composed (`plan.actions[i].doc` / `plan.workflow.doc`). The entries are built from the Plan and inserted with one `insertManyDocs`.

**Why bulkWrite is not a problem.** `bulkWriteActions` returns counts only — but the engine never derives before/after *from* the write; both halves are in the Plan before it runs. Bulk writes and full per-doc audit coexist with zero extra reads (strictly cheaper than the community plugin's per-op double-read).

**When written.** Commit phase, after the workflow + action writes, as one `insertManyDocs`. It's outside the transaction (the txn is scoped to workflow + actions — D11) and runs last, so a failure here is the smallest possible mode: a committed change with a missing audit entry, never an audit entry for a change that didn't commit. A commit of N action transitions + 1 workflow update produces N + 1 `log-changes` entries.

**What's logged.**

- Action transitions: `before` = loaded action doc; `after` = planned post-commit action doc.
- Workflow updates: `before` = loaded workflow doc; `after` = planned post-commit workflow doc.
- Events: logged by the events module's *own* `changeLog` config (the `new-event` write goes through the community plugin, which logs it). The engine does not double-log the event.
- Notifications: the engine builds and writes no notification doc, so there is nothing for it to audit. Dispatch is a post-commit `callApi("send-notification", { event_ids })` (D9 step 4); any audit of the resulting write is the notifications module's own concern.

**Rollback.** Out of scope (Non-goals), exactly as for any other `log-changes` consumer. The community `before`/`after` shape already supports a future inverse-apply tool; nothing engine-specific is needed.

**Diff storage.** v1 stores whole before/after docs (the community plugin's behaviour). Field-level diffs are a future optimization for whoever owns the `log-changes` collection, not this part.

### D8. Mongo driver layer

We roll our own helpers in `plugins/modules-mongodb-plugins/src/connections/mongo/`. These are used by engine-internal write paths only — app-side YAML CallApi requests continue to use the community plugin.

**Helpers:**

- `findOneAndUpdateDoc({ collection, filter, update, session? })` — wraps native driver `findOneAndUpdate({ returnDocument: "after" })`. Returns the post-write doc.
- `bulkWriteActions({ operations, session? })` — wraps native driver `bulkWrite` for the actions collection. `operations` is an array of `{ updateOne: {...} }` / `{ insertOne: {...} }` entries built from the Plan. Returns acknowledged counts; does NOT return per-op post-write docs (use case doesn't need them — the Plan already has them).
- `insertOneDoc({ collection, doc, session? })` — wraps native driver `insertOne`. Returns inserted ID.
- `insertManyDocs({ collection, docs, session? })` — wraps native driver `insertMany`. Used for change-log entries. (Not used for notifications — those dispatch via `callApi("send-notification")`, D9 step 4.)
- `findDocs({ collection, query, options?, session? })` — wraps native driver `find().toArray()`. Used by load phase.

**Obtaining the `Db` and client.** The community plugin does **not** expose its `MongoClient` or `Db` — `createMongoDBConnection.js` closes over the plugin's `MongoDBCollection` and returns per-collection request dispatchers, nothing more. Worse for our purposes, the community plugin creates a **fresh client per request** (it was written for single-operation Lowdefy requests in a serverless context and hasn't been updated for connection reuse). So there is nothing to "extract" and nothing worth reusing.

`mongo/getMongoDb.js` therefore **constructs and owns the engine's own `MongoClient`** from the connection's `databaseUri` (already in `WorkflowAPI/schema.js`), and **caches it at module scope keyed by `databaseUri`**, reusing it across handler invocations. This is a deliberate improvement over the community plugin's per-request client: a persistent pooled client is required for transactions anyway (a session is bound to its client — D11), and it avoids a cold-start connection storm in Lambda. `getMongoDb` exposes both:

- `context.mongoDb` — the raw `Db`, used by all D8 helpers.
- `context.mongoClient` — the `MongoClient`, used by `commitPlan` for `startSession()` (D11).

Engine code uses these; app-side and pre-hook code continue to use `context.mongoDBConnection` (the community-plugin wrapper). This means **two independent clients coexist** — the engine's cached pooled client and the community plugin's per-request client. That's the root cause of why callApi'd writes (events) can't join the engine's transaction (D9): they run on a different client. Accepted for v1; unifying on one client is the "thread the session across callApi" deferred work.

**Dependency declaration + single-driver-version expectation.** `getMongoDb.js` is the first engine code to `import { MongoClient } from "mongodb"` directly — today the community plugin owns the driver privately, so the engine never imported it. The plugin's `package.json` declares no `mongodb` (it resolves today only by pnpm-hoist accident → `mongodb@6.21.0`). This part adds `mongodb` to the plugin's **`peerDependencies`** at `^6` (matching the community plugin's major), so a consuming app provides and dedupes to **one** v6 driver build rather than bundling a second copy (task 01 records the `package.json` edit). It's a peer, not a bundled `dependency`, because the engine wants to share the app's single driver build; the two coexisting clients above are still *one driver build* under this expectation. The community plugin's own exact pin (`mongodb@6.3.0`) is an external choice we can't change — but since both are v6, `findOneAndUpdate` returns the document (or `null`) directly by default, exactly as D15's CAS check assumes, so a temporary version skew is behaviourally benign.

**Why not extend the community plugin.** (1) Its `changeLog` does an internal before/after read per op — the engine already holds both halves (D7) and would re-incur those reads; (2) its API surface is YAML-CallApi-shaped, where the engine needs JS-shaped (sessions, raw driver methods, bulk ops); (3) `MongoDBBulkWrite` is deliberately absent from it (Part 30 D11), and we need it. The community plugin stays in use for app-side code unchanged.

### D9. Commit ordering and partial-failure semantics

Commit writes are ordered **workflow-first**:

1. **Workflow** — `findOneAndUpdateDoc` on the workflows collection with the planned post-commit workflow doc, carrying the CAS filter (`updated.timestamp`, D15). **This is the claim step:** if the filter misses (a concurrent submit moved the workflow between our load and commit), `findOneAndUpdate` matches zero docs, writes nothing, and the engine throws `ConcurrentSubmitError` **before any action write happens**.
2. **Actions** — `bulkWriteActions` with all inserts + updates from `plan.actions`.
3. **Events** — the single per-invocation `new-event` dispatch of `plan.event` via `callApi` (the doc's `_id` is the per-invocation `event_id`; see "Events go through `callApi`" below).
4. **Notifications** — `callApi("send-notification", { event_ids: [event_id] })`, one call carrying the `_id` of the event just written in step 3 (the wire field stays the batch-shaped `event_ids` — the notifications endpoint's existing contract — even though the engine always sends exactly one). **The engine builds no notification doc and inserts nothing into a notifications collection.** This preserves today's mechanic (`dispatchNotifications.js`): the notifications module's `send-notification` endpoint runs the app-provided `send_routine`, which re-fetches each event doc to read its references/metadata and owns recipient fan-out + any notification-doc write. There is no engine-side `NotificationDoc` anywhere in the repo to build, so composing one would be speculative surface (CLAUDE.md "Build for what exists, not what might") — and it must run *after* step 3 because the routine reads the committed event. Like events (and for the same reason — it crosses the `callApi` boundary onto the community-plugin client), it is outside the transaction. Silent no-op when the app wired no `send_routine`.
5. **Change-log** — `insertManyDocs` (single call) of all `log-changes` entries (D7), built from the Plan. Last step (outside the txn) so an earlier failure prevents an audit entry claiming a write that didn't happen.

**Invariant: no action write is durable until the workflow claim succeeds.** Workflow-first is what makes the CAS gate meaningful — a concurrent submit is detected and thrown with *zero* writes, so a retry re-loads and re-plans from un-advanced state and never double-transitions (actions-first would leave orphaned action writes on a CAS miss and double-push `status[]` on retry — settled in review-1 #1). Events come after workflow+actions because event docs reference their IDs. Change-log last so an earlier failure can't leave an audit entry claiming a write that didn't happen.

The denormalised summary/groups on the planned workflow doc are computed from the *planned* action states, so writing the workflow before the actions is internally consistent — both come from the same Plan.

**On a replica set, steps 1–2 run inside one transaction (D11)** — workflow + actions commit atomically or not at all, which subsumes the ordering concern entirely. The ordering above is the **standalone-mongod fallback** path (no transactions available), where it is the sole correctness mechanism.

**Events go through `callApi("new-event")` and are outside the transaction boundary regardless.** The events module owns event-doc validation, type-keying, and the `display_key` projection — bypassing `new-event` and writing directly into `events` would duplicate that logic across modules. The event write also uses the community-plugin's MongoClient, not the engine's (D8/finding #2 root cause: two clients), so it *cannot* join the engine's session. Trade-off: an event write isn't rolled back if a later step (notifications, change-log) fails. The window is one step and events failing is more visible than events succeeding without notifications; acceptable for v1. Future work: thread the engine session into subroutine calls so callApi'd module endpoints can participate — a larger change tracked separately.

**The shipped `callApi` contract (task 22).** The shipped framework function (defined in [`callRequestResolver.js`](../../../../../lowdefy/packages/api/src/routes/request/callRequestResolver.js); full spec in [call-api/spec.md](../../../../workflows-module-concept/call-api/spec.md)) is `callApi({ endpointId, payload })` — a single destructured object, **not** the unshipped `callApi({ id, module }, payload, { user })` proposal that tasks ≤13 were implemented against. Rules the engine builds on:

- `endpointId` is an **opaque pre-scoped string** (`<moduleEntryId>/<endpointId>`). All scoping happens at app build time via `_module.endpointId`; the engine never constructs prefixes at runtime. Dispatch targets reach the resolver through connection properties — `connection.endpoints.new_event` and `connection.endpoints.send_notification`, resolved in `workflow-api.yaml` with the cross-module `{ id, module }` operator form — and hook endpoint ids arrive pre-scoped on `params.hooks.{interaction}.{pre|post}` because `makeWorkflowApis` emits them through `_module.endpointId` (string form, own-entry scope).
- `callApi` **throws** on failure, preserving the error class (`ConfigError` unknown/unauthorized/depth-cap, `UserError` for `:throw`/`:reject`, `RequestError`/`ServiceError` pass through). There is **no `{ success, error }` envelope** — commit steps 3–5 wrap each call in try/catch and record failures on `dispatchErrors[]`; hook phases let throws propagate. Code must never inspect `result.success`.
- On success it returns the target's `:return` value (`new-event` returns `{ eventId }`) or `null` when the routine ends without `:return` (`send-notification` under the default empty `send_routine`).
- The caller's user identity authorizes the target — there is no user-override option; no third argument exists.

**Partial-failure semantics.** Steps 1–2 throw (the atomicity gate). Steps 3–5 never throw out of `commitPlan`: each is caught and recorded on `CommitResult.dispatchErrors[]`, so a committed submit's tracker cascade and post-hook always run — then the **handler** throws `post_commit_dispatch_failed` (D13) at the very end of the invocation, so the failure still surfaces through Lowdefy's error reporting (the infra that actually exists — no engine side-channel logging) without stranding `trackerFires` or skipping the post-hook. Outcomes per step:

- Workflow claim succeeds, action write fails (standalone fallback only; the transaction path rolls steps 1–2 back together): workflow summary/groups claim transitions the actions didn't get. Recoverable — a future submit's load reads the un-advanced actions and `planWorkflowRecompute` corrects the summary; not silently broken. On a retry of the *same* submit, the action write is re-attempted (it didn't land), so no double-transition.
- Workflow + actions succeed, events fail: the submit happened but didn't log to the timeline. Recorded on `dispatchErrors[]`; step 4 is skipped (no committed event ids to dispatch); cascade + post-hook still run; the end-of-handler throw surfaces it. Authors can re-fire via a manual operational API.
- Events succeed, notifications or change-log fail: missed notification / audit gap. Recorded on `dispatchErrors[]` and surfaced by the same end-of-handler throw; the change-log insert is the last step specifically so its failure is the smallest possible mode.

### D10. Tracker recursion

`fireTrackerSubscription` becomes a loop, not a recursive function with shared engine context:

```js
const MAX_DEPTH = 10; // chain depth, not fan-out
const MAX_ATTEMPTS = 3; // per-level CAS retry bound
const RECORDED_CODES = ["concurrent_submit", "workflow_not_found", "missing_target"];

async function runTrackerCascade(initialFires, baseContext) {
  const fires = []; // [{ parent_action_id, parent_workflow_id, new_status }] — today's shape
  const dispatchErrors = []; // commit steps 3–5 failures, accumulated across levels (task 13)
  const cascadeErrors = []; // [{ fire, error }] — CAS exhaustion + gone parents
  // Each fire carries its own depth (chain length up the parent tree), seeded at 1.
  let pendingFires = initialFires.map((f) => ({ ...f, depth: 1 }));

  while (pendingFires.length > 0) {
    const fire = pendingFires.shift();
    if (fire.depth > MAX_DEPTH) throw new TrackerCascadeDepthError(fire); // config bug — propagates

    // Each level is its own invocation: fresh event_id; now + newId pass through (see below).
    const levelContext = { ...baseContext, event_id: randomUUID() };
    let attempts = 0;
    while (true) {
      try {
        const levelLoaded = await loadWorkflowState(levelContext, { workflowId: fire.parentWorkflowId });
        const levelPlan = await planTrackerLevel(levelLoaded, {
          parentActionId: fire.parentActionId,
          signal: fire.signal,
          payload: fire.payload, // optional — Start's child link fields (task 17)
          event_id: levelContext.event_id,
          now: levelContext.now,
          newId: levelContext.newId,
        });
        if (levelPlan === null) break; // FSM no-op — skip the level entirely (D3)
        const commitResult = await commitPlan(levelContext, levelPlan);
        dispatchErrors.push(...commitResult.dispatchErrors);
        fires.push(levelPlan.fired); // the plan carries the level's fired entry (FSM-resolved new_status)
        // Children inherit depth + 1 — the guard tracks chain depth, not total fan-out.
        pendingFires.push(...levelPlan.trackerFires.map((f) => ({ ...f, depth: fire.depth + 1 })));
        break;
      } catch (error) {
        if (error.code === "concurrent_submit" && ++attempts < MAX_ATTEMPTS) continue; // fresh load → plan → commit
        if (RECORDED_CODES.includes(error.code)) {
          cascadeErrors.push({ fire, error }); // exhausted CAS / gone parent — record, continue
          break;
        }
        throw error; // unclassified — propagate
      }
    }
  }
  return { fires, dispatchErrors, cascadeErrors };
}
```

Each level is its own load-plan-commit cycle on its own workflow. No shared in-memory state between levels. Each level's commit is independently atomic (or transactional). **Each level is also its own invocation for the mint:** a fresh `event_id` per level (the event doc `_id` — reuse would duplicate-key; see "Engine entry points emit events"), while `now` (the per-request `connection.changeStamp` — one user action, one timestamp, app-overridable) and the `newId` factory pass through from the base context to every level.

**Mid-cascade CAS policy (task 16).** A cascade level's `ConcurrentSubmitError` never propagates — the caller can't recover it by retrying the original submit (the child's commit already landed; D15's "retryable" framing doesn't hold post-commit). The loop retries the level, bounded at 3 attempts, each a full fresh load → plan → commit; the level's `event_id` is safely reused since a CAS miss writes nothing (D9). Tracker levels are the one engine site where auto-retry is safe by construction: no pre-hook, deterministic planner. On exhaustion the fire records `{ fire, error }` and the cascade continues; `TrackerCascadeDepthError` and unclassified errors propagate immediately (a depth cycle is a structural config bug, not a per-fire data state).

**Gone-parent policy (task 16).** A fire whose parent is gone — `workflow_not_found` on the level's load, no action doc matching `fire.parentActionId`, or an action type no longer in the workflow config — is a dangling reference with no legitimate producing flow (a parent closed early still *has* its tracker action; that case FSM-no-ops and skips silently per D3). The cascade records `{ fire, error }`, skips the level, and continues; the failure surfaces through the handler's end-of-invocation `post_commit_dispatch_failed` throw. This deliberately deviates from today's silent `if (!tracker) return []` — broken mirror chains become visible instead of quietly stopping. The `MAX_DEPTH = 10` guard carries over but tracks **chain depth, not loop iterations**: each fire carries a `depth` seeded at 1 and incremented per level, so a wide-but-shallow cascade doesn't trip the guard while a genuinely deep cycle does (a dequeue counter would measure fan-out, not depth).

This restructure is the only viable shape with load-plan-commit — recursion across workflows can't share a Plan because the Plan is per-aggregate. The good news is the per-level Plan reuses 100% of the per-Submit planner machinery; the only new piece is `planTrackerLevel`, which is a thin wrapper that emits the signal and then delegates to the same auto-unblock/recompute logic.

### D11. Transactions: conditional on replica-set detection (v1)

Mongo multi-document transactions wrap the two writes that must be atomic — **the workflow claim + the action transitions (D9 steps 1–2)** — and nothing more. The seam is clean: every Mongo helper accepts an optional `session`, and `commitPlan` is the only function that touches multiple collections.

What stays outside, and why:
- **Events and notifications** — *must* be outside: both go through `callApi` (`new-event` / `send-notification`) on the community plugin's client, which can't join the engine's session (D9, finding #2). A notification failure shouldn't roll back a committed submit anyway — it's recorded on `CommitResult.dispatchErrors[]` and surfaced after the cascade + post-hook via the handler's `post_commit_dispatch_failed` throw (D9 partial-failure semantics), rather than aborting them.
- **Change-log** — uses the engine's own client (`insertManyDocs`), so it *could* technically join, but v1 keeps the transaction minimal at the workflow+action aggregate. It runs last so its only failure mode is a missing audit entry (D7/D9), never a phantom one.

Transactions require a replica set (or mongos); a standalone `mongod` can't run them. This module is open source — we control our own deployments (all replica sets) but not external consumers', who may run standalone. So v1 **detects topology and adapts**, rather than hard-requiring a replica set or deferring transactions entirely:

```js
async function commitPlan(context, plan) {
  if (context.useTransactions) {
    const session = context.mongoClient.startSession();
    try {
      // steps 1–2 only — the txn body must contain nothing else: withTransaction
      // auto-retries transient/write-conflict errors by re-running its whole callback,
      // and a retried step 3/4/5 would double-fire events/notifications/change-log
      // (their writes are on other clients / outside the txn — our abort doesn't
      // roll them back). A CAS miss inside surfaces as a null findOneAndUpdate →
      // throw ConcurrentSubmitError → clean abort.
      await session.withTransaction(() => commitWorkflowAndActions(context, plan, session));
    } finally {
      await session.endSession();
    }
  } else {
    // standalone fallback: workflow-first ordered writes (D9). Correct on its own —
    // the CAS gate (D15) throws before any action write on a concurrency miss.
    await commitWorkflowAndActions(context, plan);
  }
  // steps 3–5 — once, both paths, never inside the driver's retry loop.
  // Each is caught + recorded on CommitResult.dispatchErrors (step 4 skipped when
  // step 3 failed) — the handler throws post_commit_dispatch_failed after the
  // cascade + post-hook (D9 partial-failure semantics).
  const event_id = await dispatchEvent(context, plan);     // step 3
  await dispatchNotifications(context, event_id);          // step 4
  await writeChangeLog(context, plan);                     // step 5
  return buildCommitResult(plan);
}
```

**Detecting the topology.** At connection init, run the `hello` command and set `context.useTransactions = true` when the result carries `setName` (replica set) or `msg: "isdbgrid"` (mongos); `false` otherwise. **Log the detected mode at startup** — never silent — so an operator debugging consistency knows which commit path is live. (`useTransactions` can also be forced off via connection config for consumers who want the ordered-writes path explicitly.)

**Why both paths stay correct, not just present.** The standalone fallback (D9 workflow-first + CAS) is fully correct on its own; transactions are an *additive* upgrade that removes the rare "workflow claim succeeds, action write fails" partial-failure window (D9). The two paths converge on the same observable outcome.

**Testing both paths.** CI runs the engine integration suite against a **single-node replica set** (`MongoMemoryReplSet`), so the transaction path — the one our deployments run — is the path the tests exercise. A smaller standalone-mode pass covers the fallback ordering + CAS so it doesn't rot.

Hook-side reads/writes don't participate in the transaction by contract (D5); confirmed acceptable against real workflows.

### D12. Render-against-planned-state

Action display render context, per affected action:

```js
const renderCtx = {
  ...plannedActionDoc, // includes _id, type, key, assignees, due_date, status[], <slug>.message (sticky from prior), metadata
  ...plannedActionDoc.metadata, // metadata fields hoisted; metadata wins over action-doc-field collisions
};
```

`plannedActionDoc` is the **after** version — the doc with the new status entry prepended, fields set, metadata merged. Templates can reference fields the current transition is setting (e.g. a simple action whose `submit` lands `done` and whose cell quotes `{{ assignees[0].name }}` where assignees was set in the same submit). The pre-write doc is no longer the render context — it's "the doc as it will look after the commit" because we have the plan.

Sticky display still works: `plannedActionDoc.<slug>.message` is the prior value carried through unless the new cell sets it. The `$mergeObjects` clobber hazard doesn't apply — the planner composes the full post-commit doc in JS, where deep merging is unambiguous, and commit writes one `$set` of the whole subtree.

Event display render context, per dispatched event:

```js
const renderCtx = {
  user: context.user,
  action: plannedActionDoc,         // post-commit shape
  workflow: plannedWorkflowDoc,     // post-commit shape including form_data, summary, groups
  signal,                           // e.g. "submit" — the resolved signal name (the legacy `interaction` key is renamed; one concept, one name)
  status_before: loadedActionDoc.status[0].stage,
  status_after: plannedActionDoc.status[0].stage,
  submitted_form: planInputs.mergedFormData, // pre-merged from params.form + params.form_review + preHookResult.form_overrides
};
```

`submitted_form` replaces `workflow.form_data` as the primary "what was just submitted" binding. `workflow.form_data` remains exposed for templates that need cross-action form data, and it's fresh because the plannedWorkflowDoc already has it merged. Two paths to the same data; the explicit `submitted_form` is clearer for templates that just want the current submission.

**Workflow-lifecycle event render context.** The context above is the **action-event** context (`SubmitWorkflowAction` and the tracker-mirror commit, which both have a single target action). `StartWorkflow` / `CancelWorkflow` / `CloseWorkflow` operate on the whole workflow — there is no single target action (Cancel/Close sweep many actions per Q5), no `status_before`/`status_after` for one action, and no `submitted_form`. They render against a smaller context:

```js
const renderCtx = {
  user: context.user,
  workflow: plannedWorkflowDoc,     // post-commit shape (status pushed: `active` seeded at Start / `cancelled` / `completed` at Close)
  signal,                           // lifecycle name (started / cancelled / closed)
};
```

This matches what the lifecycle engine-default templates reference (`user.profile.name`, `workflow.workflow_type` — see "Engine entry points emit events"); nothing more is bound until a concrete template needs it. `planEventDispatch` **branches on handler/event type**: action events (`action-{signal}`, `action-internal-mirror-{state}`) get the full action-event context; lifecycle events (`workflow-started` / `workflow-cancelled` / `workflow-closed`) get the workflow-only context. The tracker-mirror event is an action event (it has a single mirrored target action), so it uses the action-event context.

### D13. Signal validation and error model

Three places where signals can be invalid:

1. **Unknown signal name** — payload says `signal: "frobnicate"`. Planner throws at plan time. Surfaces to caller as a 400-shaped error.
2. **Missing target** — a pre-hook `actions[]` entry whose `(type, key)` matches no existing doc. **If the entry carries `upsert: true`**, this is an intentional spawn: the planner resolves the signal against the FSM's `none` creation row and emits `operation: "insert"` with the new action seeded at the resolved birth stage (e.g. `signal: activate` → `action-required`). **Without `upsert: true`**, a missing target is a programming error and the planner throws (today's `actions[]` behaviour). This is the rebuilt home of today's `handleSubmit` upsert path + `utils/shouldCreate.js`.
3. **Signal doesn't apply to current state** — payload says `signal: "approve"` against an `action-required` action. FSM table has no entry. **Engine policy:** for the user-driven current-action signal, throw (the user clicked a button that shouldn't have been available — actionable bug). For pre-hook auxiliary signals and engine cascade signals, no-op silently (the FSM's "structural safety" property; e.g. `unblock` against already-unblocked target).

The distinction is intentional: user-driven signals indicate an explicit intent that should not silently fail, while cascade signals are deliberately permissive so engine re-evaluation can fire broadly without regressing siblings.

**Engine error model.** Engine throws share one base class in `shared/errors.js`: `WorkflowEngineError extends Error`, constructor `(message, { code, cause })`. Callers and tests discriminate on `code`, never on message text. Load-phase invariant codes: `workflow_not_found`, `action_not_found`, `stage_rejects_submit`, `access_denied`. Plan-phase signal-validation codes (the throws in cases 1–3 above): `unknown_signal`, `missing_target`, `signal_not_allowed`. Pre-hook response-validation codes (task 14's validator): `prehook_redirect` — a return entry re-signals the current action (per the resolves-to-current rule); `invalid_prehook_response` — any other malformed manifest (entry keys outside the closed grammar, bad shape). Two codes so a hook author can tell *what* they did wrong from the code alone. Lifecycle-handler codes (task 17): `stage_rejects_close` (Close on a cancelled workflow); `unknown_workflow_type` / `unknown_action_type` — Start's config-shaped lookups (unknown `workflow_type` in `workflowsConfig`; seed action type not in the workflow config), deliberately distinct from the doc-lookup codes `workflow_not_found` / `action_not_found` so a caller can tell "bad type" from "gone doc"; `invalid_params` — a missing required request param (Start's `workflow_type`/`entity_id`/`entity_collection`; Cancel/Close's `workflow_id`); and `invalid_seed` — Start's seed-grammar/shape violations (illegal seed status, keyed `starting_actions` entry, tracker-parent shape violations; also thrown by `planActionTransition`'s seed-mode input validation). Post-commit dispatch code: `post_commit_dispatch_failed` — thrown by the handler at the very end of an invocation (after the tracker cascade + post-hook) when commit steps 3–5 recorded failures on `CommitResult.dispatchErrors[]` (D9) or the tracker cascade recorded fire errors on `cascadeErrors[]` (CAS-retry exhaustion / gone parents — D10); its message states the commit succeeded and names the failed steps, `{ cause }` chaining the first recorded error. `ConcurrentSubmitError extends WorkflowEngineError` (`code: "concurrent_submit"`, D15) keeps its named class because callers catch it by name as the retryable case; `TrackerCascadeDepthError extends WorkflowEngineError` (`code: "tracker_depth_exceeded"`, D10) likewise. The engine does **not** reuse `SubmitWorkflowAction/UserError.js` for these: `UserError` is Lowdefy's routine-reject vehicle (discriminated by `runRoutine` on `name === "UserError"`) and stays reserved for surfacing pre-hook rejects (D5 / task 14) — engine invariants are defensive gates, not author-defined user messaging, so they intentionally surface as server-shaped errors. **Cause chains:** a rethrow that adds engine context (phase, workflow id) must pass `{ cause }` so the original error is preserved; the default is not to wrap at all — driver and downstream errors bubble as-is unless the wrap genuinely adds context.

### D14. Salvaged from Part 30

Part 30's on-disk contract and display machinery carry over with no architectural change, rewired to fit the phase model: the action-doc shape (per-app top-level cells, sticky display, `status_title`, `metadata`), engine-computed links (now the per-verb `links` map per Part 34 D7), resolver shape-validation, engine-rendered event display, display-surface fixes, the `entry_id` connection wiring, and the engine-default template rewrite. Discarded: the old write helpers as primary call sites, in-memory mirroring, the `$mergeObjects` link composition, and the speculative `action_display` payload override. Full item-by-item inventory: [carried-surfaces.md § D14](carried-surfaces.md#d14-salvaged-from-part-30).

### D15. Concurrency: CAS on `workflow.updated`

Without transactions, concurrent submits on the same workflow could each read the workflow at load, each plan against the same pre-write state, and each commit a whole-doc `$set` that clobbers the other. The fix in v1: optimistic concurrency via compare-and-swap on `workflow.updated`.

**Mechanic.**

- Load phase reads `workflow.updated.timestamp` (already part of the workflow doc — `updated` is a `ChangeStamp` object `{ timestamp, user }`, not a scalar).
- Commit phase pins the **timestamp scalar** in the `findOneAndUpdate` filter (not the whole `updated` sub-document — embedded-doc equality is field-order/shape sensitive and brittle against future change-stamp fields; a scalar compare is order-independent):
  ```js
  findOneAndUpdateDoc(workflows, {
    filter: { _id: workflow._id, "updated.timestamp": loadedState.workflow.updated.timestamp },
    update: { $set: plannedWorkflowDoc },
  });
  ```
- If concurrent write happened in between, the filter matches zero docs; helper returns null. (Every commit stamps a fresh `updated.timestamp`; two submits in the same millisecond by the same user produce equal stamps, but CAS still catches the race — the first commit advances the stored timestamp, so the second's filter then misses.)
- Engine throws a retryable error (`ConcurrentSubmitError extends WorkflowEngineError`, `code: "concurrent_submit"` — D13). Caller's retry policy decides what to do; the engine itself does not auto-retry (each retry runs the pre-hook again, which may have non-idempotent side effects — author's call). **One exception:** tracker cascade levels auto-retry internally (bounded, 3 attempts) — they have no pre-hook and a deterministic planner, so the non-idempotence argument doesn't apply, and a mid-cascade CAS miss is unrecoverable by caller retry since the original submit already committed (D10).

**Action writes.** Actions are bulk-written without per-doc CAS in v1. The race here is narrower than the workflow case (per-action concurrency is rare — same user submitting same action twice typically lands in same-stage no-ops via the FSM), and adding per-action CAS would force the bulk write into a loop. If contention proves real, add per-action `_id` + `updated` filters to the bulkWrite operations as a follow-up.

**Why not version field.** `updated` is already on every workflow doc and advanced on every write — a parallel `version` integer would double the per-write bookkeeping for no benefit.

**Relationship to transactions (D11).** CAS is not replaced by transactions — it works *with* them. On the transaction path, two concurrent submits writing the same workflow produce a MongoDB write conflict; `withTransaction` auto-retries, but the retry re-issues the *same planned writes* without re-planning, so the CAS filter (now stale) misses, `findOneAndUpdate` returns null, and the engine throws cleanly rather than committing stale writes. On the standalone fallback path, CAS is the sole concurrency guard. Either way the CAS filter is what converts a race into a clean `ConcurrentSubmitError`.

### D16. Access model (Part 34) — what this part implements

[Part 34](../34-action-access-model/design.md) is design-only; its engine/resolver/display changes land here: the per-app per-verb `access` shape + resolver validation (`validateActionAccess`), the submit-time signal→verb gate (load phase, against `access.{current_app}.{verb}` ∩ user roles), the per-verb `links` map (`computeEngineLinks`), the `visible_verbs` query response replacing `access_filter`, the emitted-id naming (`workflow-` prefix on fixed pages only; derived ids unprefixed, entry-scoped), and the client `action_allowed` mirror. Known v1 limitation: access drives FSM reachability (D4 `hasReview`), so editing `access` on a live workflow is an author-owned migration. Surface-by-surface detail + tasking note: [carried-surfaces.md § D16](carried-surfaces.md#d16-access-model-part-34).

## Current state recap

(Verified against `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`, `shared/updateAction.js`, `shared/createAction.js`, `shared/recomputeWorkflowAfterActionWrite.js`, `StartWorkflow/StartWorkflow.js`, `CancelWorkflow/CancelWorkflow.js`, `CloseWorkflow/CloseWorkflow.js`, `SubmitWorkflowAction/fireTrackerSubscription.js`.)

- **handleSubmit:** 11 steps with mutable `context` carrying workflow + action + workflowActions through every step. Read at step 1; per-action read in updateAction (non-force); helper-internal read in step 5 recompute; in-memory cache updated step-by-step.
- **updateAction:** unconditional priority-gate fetch on non-force calls (D11 of Part 30 proposed making it unconditional); single `MongoDBUpdateOne` with `$set` + `$push`. No render.
- **createAction:** pure builder; no I/O. Caller does the insert.
- **recomputeWorkflowAfterActionWrite:** reads workflow + actions, computes summary/groups, runs reevaluateBlockedActions (which writes more actions), re-reads actions if anything changed, writes workflow doc with `$set` + optional `$push`. Returns pre-write workflow doc as `result.workflow` (the source of Part 30 review-5 #1).
- **StartWorkflow:** builds workflow doc + action drafts in memory, two `MongoDBInsertOne`/`Many` calls, optional parent-tracker `updateAction` push at the end. No render. No status_map handling.
- **CancelWorkflow / CloseWorkflow:** single `MongoDBUpdateMany` over non-terminal actions to push `not-required`. Workflow status push separately. No render.
- **fireTrackerSubscription:** recursive across parent workflows; each level reads + writes + recomputes + may recurse. `MAX_DEPTH = 10` guard.

The shapes the rebuild targets are derivable from the worked example in Part 30 (action doc shape) and from `recomputeWorkflowAfterActionWrite` (workflow doc shape) — they don't change on disk. Only the path to producing them changes.

## Proposed data flow (Submit, representative)

```
handler entry
   │
   ▼
LOAD phase
   ├─ findDocs(workflows, { _id: workflow_id }) ──→ workflow
   ├─ findDocs(actions, { workflow_id }) ──→ actions[]
   ├─ resolve workflowConfig + actionConfig
   ├─ per-verb access check (signal→verb, D16 / Part 34 D6), workflow-stage check (completed/cancelled rejected unless actionConfig.required_after_close === true)
   └─ output: LoadedState { workflow, actions, workflowConfig, actionConfig, targetAction }
   │
   ▼
PRE-HOOK phase
   ├─ if no pre-hook declared → PreHookResult = { actions: [], event_overrides: {}, form_overrides: {} }
   ├─ else → callApi(hook); validate response shape (no current-action signal redirect)
   └─ output: PreHookResult { actions[], event_overrides, form_overrides }   // current action lands per payload.signal
   │
   ▼
PLAN phase  (pure, no I/O)
   ├─ resolve current-action signal → target stage via FSM
   ├─ resolve auxiliary signals (preHookResult.actions[]) → target stages via FSM (entry with upsert:true against a missing target → resolve via FSM `none` creation row → operation: insert)
   ├─ initial planned action transitions (current + auxiliary)
   ├─ auto-unblock ⇄ group-recompute fixpoint: recompute planned groups, then fire `unblock` against every blocked action whose `blocked_by` is satisfied — action-type entry (all docs of the type terminal) OR group-id entry (planned group status `done`) — iterating to a fixpoint (unblock-only; pre-hook `block` already resolved above)
   ├─ final recompute groups + summary against planned actions (reflects the unblock transitions, e.g. blocked → in-progress)
   ├─ check auto-complete → optional 'completed' push on workflow
   ├─ merge form_data (params.form + form_review + preHookResult.form_overrides)
   ├─ compose planned workflow doc (summary, groups, form_data, optional completed)
   ├─ compose completedGroups: loaded workflow.groups vs planned groups diff — each group newly
   │     `done` emits { workflow_id, id, on_complete } with on_complete joined from
   │     workflowConfig.action_groups (D3; feeds the handler return + post-hook result bag)
   ├─ for each planned action transition:
   │     - compose planned action doc (status push, fields, metadata merge)
   │     - lookup status_map[targetStage] for action's kind
   │     - render cell against planned-action-doc + metadata context
   │     - compute per-verb engine links map `{view,edit,review,error}` (built-in kinds) against planned-action-doc + entry_id (D16 / Part 34 D7)
   │     - spread rendered cell + links map into planned action doc
   ├─ build event payload (default + YAML override + pre-hook override; render against engine render context)
   ├─ build log-changes entries (before vs after for every doc touched; D7)
   ├─ compose trackerFires: iff 'completed' pushed ∧ workflow.parent_action_id != null → one
   │     { parentWorkflowId: workflow.parent_workflow_id, parentActionId, signal: internal_mirror_child_completed }
   │     (ids read off the loaded workflow doc — D3 producer rule; no cross-workflow read)
   └─ output: Plan { workflow, actions[], event, completedGroups[], trackerFires[], changeLog[] }   // no notifications — dispatched post-commit (D9 step 4)
   │
   ▼
COMMIT phase   (steps 1–2 wrapped in one transaction on a replica set; ordered fallback on standalone — D9/D11)
   ├─ 1. findOneAndUpdateDoc(workflows, { _id, "updated.timestamp": loadedState.workflow.updated.timestamp }, $set: plan.workflow.doc)
   │        └─ CAS claim: null return → throw ConcurrentSubmitError before any action write (D15)
   ├─ 2. bulkWriteActions(plan.actions)
   ├─ 3. callApi({ endpointId: connection.endpoints.new_event, payload: { _id: event_id, ...plan.event.doc } })   [single per-invocation dispatch; outside txn; community client; id pre-scoped at build]
   ├─ 4. callApi({ endpointId: connection.endpoints.send_notification, payload: { event_ids: [event_id] } })   [outside txn; community client; engine builds no notification doc — D9 step 4]
   ├─ 5. insertManyDocs(<changeLog.collection, e.g. log-changes>, plan.changeLog)   [outside txn, last]
   └─ output: CommitResult { workflow_id, action_ids, event_id, dispatchErrors }
   │
   ▼
TRACKER cascade (loop, not recursion)
   ├─ for each fire in plan.trackerFires + any subsequent fires:
   │     - run load-plan-commit on the parent workflow with internal_mirror_child_* signal
   │     - append any new trackerFires to the queue
   ├─ per-fire chain-depth guard at 10 (depth tracked per fire, not loop iterations)
   └─ output: trackerFires log
   │
   ▼
POST-HOOK phase
   ├─ if no post-hook declared → return handler result
   ├─ else → callApi(post-hook) with the buildHookPayload envelope: context from the PLANNED docs
   │        ({ workflow: plan.workflow.doc, action: <planned target-action doc> }), plus
   │        result: { action_ids, completed_groups, event_id, tracker_fired } (task 14 pins this —
   │        the raw Plan/CommitResult engine types are NOT the author contract)
   └─ output: handler return payload
```

Start / Cancel / Close follow the same shape with different planners (no pre-hook for Start/Cancel/Close in v1; planner inputs differ; commit batches differ but use the same helpers). Each also dispatches its own log event during the commit phase — see "Engine entry points emit events" below.

## Engine entry points emit events

Today only `SubmitWorkflowAction` dispatches a log event. This rebuild extends event emission to every engine handler so the events timeline is a complete audit trail of workflow lifecycle changes — one `event_id` per handler invocation, anchoring that invocation's events-timeline entry. (One carve-out: Close on an already-`completed` workflow is an idempotent no-op — it returns the empty result without minting an event; task 17.)

| Handler | Event `type` | Engine-default title (plain Nunjucks string) |
|---|---|---|
| `StartWorkflow` | `workflow-started` | `{{ user.profile.name }} started {{ workflow.workflow_type }}` |
| `SubmitWorkflowAction` | `action-{signal}` (type strings unchanged — e.g. `action-submit`) | `{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}` |
| `CancelWorkflow` | `workflow-cancelled` | `{{ user.profile.name }} cancelled {{ workflow.workflow_type }}` |
| `CloseWorkflow` | `workflow-closed` | `{{ user.profile.name }} closed {{ workflow.workflow_type }}` |
| Tracker-mirror commit (per cascade level) | `action-internal-mirror-{state}` | `Tracker mirrored child {{ status_after }}` (system event; lower-prominence in the timeline) |

One `event_id` per invocation, used as the dispatched event doc's `_id`. (Tracker-mirror commits per cascade level each generate their own `event_id`.) The `log-changes` audit (D7) follows the community plugin's schema and is not keyed by `event_id`.

**Event references — uniform all-touched-actions rule.** Every event carries `references: { workflow_ids: [workflow._id], action_ids: [...], [refKey]: [workflow.entity_id] }`, where `refKey` is **`workflow.entity_ref_key` — new required authored config** — and **`action_ids` lists every action doc the invocation's plan touches** — one rule for all event types.

**`entity_ref_key` replaces the derivation.** Today's `deriveEntityRefKey(workflow.entity_collection)` mechanically appends `_ids` to the collection name (`leads-collection` → `leads_ids`) — but the repo-wide reference convention is singular (`lead_ids`, `contact_ids`, `company_ids`, `activity_ids`), and the demo already exhibits the break: engine events carry `leads_ids` while the lead page timeline and the demo's own hooks/routines use `lead_ids`, so engine-written events never surface there. Singularizing a collection name needs English heuristics that fail silently, so the key becomes explicit: workflow config gains a **required** `entity_ref_key` field beside `entity_collection` (demo: `entity_ref_key: lead_ids`), validated by the resolver (task 6), copied onto the workflow doc by `StartWorkflow` exactly like `entity_collection` (task 17), and read by `planEventDispatch` (task 12). `deriveEntityRefKey.js` is **deleted** (with its tests); the current demo configs gain the field in task 21's catch-up, and the Part 45 rebuilt configs carry it from authoring.

For Submit, `action_ids` is the submitted action plus auxiliary and auto-unblocked transitions; for tracker-mirror, the one mirrored tracker action; for `workflow-started`, all initially created actions; for Cancel/Close, the actions marked `not-required` (untouched done actions are not referenced). This widens today's single `action_ids: [action._id]` (v0's reference implementation already did this) and is load-bearing for [Part 42](../42-timeline-action-cards/design.md)'s timeline action cards: each action's live card attaches to the *latest event referencing it*, so referencing every touched action is what makes a newly-unblocked or newly-created action appear in the timeline at all, and what makes its card migrate as later events touch it. Event `metadata`: action events carry `{ action_type, workflow_type, signal, current_key, status_before, status_after }` (today's composition, minus the `metadata.comment` fold — Part 33 owns the comment); lifecycle events carry `{ workflow_type, signal }`. The legacy `metadata.interaction` key is renamed to `metadata.signal`, matching the render-context rename (D12) — greenfield, no compat shim; one concept, one name. Full composition is specced in task 12.

Apps that subscribe to events (notifications, external syncs) will start seeing the new event types. App-side handling: either explicitly route the new types or ignore them. The notifications module's subscription config is the primary integration point — Part 8's contract is unaffected, but apps will want to opt into (or out of) the new types. Demo's notification config gets the necessary update as part of the Part 45 demo rebuild (one notification wired — `action-approve` filtered to the `send-quote` action type; the rest default-ignored).

## Schema additions

### Change-log: no new collection

The engine reuses the community plugin's `log-changes` collection and entry schema (D7), configured by the existing `changeLog: { collection, meta }` property on the WorkflowAPI connection. No new collection, no new schema. Indexing the `log-changes` collection is the owning app's concern (as it already is for community-plugin and events-module writes), not this part.

### Action and workflow doc shapes

No additions beyond what Part 30 already specified (see § D14 Salvaged), with two access-model touches from Part 34: the per-app cell now carries a per-verb `links` map (`<slug>.links: { view, edit, review, error }`) instead of Part 30's single `<slug>.link` (D16); and the denormalised `access` on the action doc follows Part 34's verb→gate map shape (`access.{app}.{verb}: true | [roles]`), consumed by `visible_verbs_filter.yaml`. Two workflow-doc additions:

- `entity_ref_key` — copied from the workflow config onto the workflow doc by `StartWorkflow` exactly like `entity_collection` (see "Engine entry points emit events"; task 17).
- `parent_workflow_id` — denormalised beside the existing `parent_action_id` on tracker-child workflow docs, stamped by `StartWorkflow` from the loaded parent action's `workflow_id` (Start already loads that action to transition it — the id is in hand at insert time; same copy-onto-doc mechanic as `entity_ref_key`). This completes the child→parent link bidirectionally (the tracker action already references its child) and makes the tracker-mirror fire **purely derivable at plan time** (D3 producer rule) — without it, resolving `parentActionId → parentWorkflowId` is a cross-workflow read the pure plan phase can't perform. Both fields are set once at Start and never change, so drift between them is structurally impossible. **Backfill:** child workflows created before this lands carry `parent_action_id` but not `parent_workflow_id`, and the cascade skips them — no fallback read (the greenfield stance; no compat shim). Author-owned one-line backfill (copy the parent action's `workflow_id`), consistent with the module's V1 migration stance; the in-repo demo is re-authored by Part 45, so no in-repo backfill is needed.

This part doesn't otherwise change the docs; it changes how they're produced.

### Connection schema (`WorkflowAPI/schema.js`)

- `entry_id` (string, required) — per Part 30. Wired from `_module.id: true` in `workflow-api.yaml`.
- `endpoints: { new_event, send_notification }` (object of strings, required; task 22) — the build-resolved opaque endpoint ids for the engine's cross-module dispatch targets. Wired in `workflow-api.yaml` via the cross-module operator form (`_module.endpointId: { id: new-event, module: events }` / `{ id: send-notification, module: notifications }`), which requires `notifications` declared as a manifest dependency (it is already a hard runtime dependency of commit step 4 — previously undeclared). See "The shipped `callApi` contract" under D9.
- `entity_ref_key` (string, required) — added to the workflow shape beside `entity_collection`: the event-references key for the workflow's entity (e.g. `lead_ids`). Replaces the deleted `deriveEntityRefKey` derivation — see "Engine entry points emit events" (task 4; resolver validation in task 6).
- `changeLog: { collection, meta }` — **kept** (already present). Previously forwarded to the community plugin so its auto-changeLog logged engine writes; now consumed by the engine's native `log-changes` writer (D7), since engine writes bypass the plugin. Same shape, same behaviour from the app's perspective. **The field description is rewritten**: the current "forwarded to the community-plugin MongoDBCollection handlers … automatically" text is now false (engine writes bypass the plugin — D8), so it's updated to describe native engine consumption.
- `actionsEnum[].priority` **description rewrite** — the current "load-bearing — the engine compares priorities in the priority-rule check in SubmitWorkflowAction" is made false by this part (the priority-rule check is removed; engine D4 makes priority display-only). Rewrite to: "display-only (ordering in pickers / visualizations); the engine no longer consults it for transition legality." The field itself stays required.

### Module manifest (`modules/workflows/module.lowdefy.yaml`)

- `app_name` var description update per Part 30.
- Declare `notifications` as a dependency (task 22) — commit step 4 dispatches to the notifications module's `send-notification` endpoint, and the connection's `endpoints.send_notification` resolution needs the dependency for the `{ id, module }` operator form.

## Files changed

### New — `plugins/modules-mongodb-plugins/src/connections/mongo/`

The Mongo driver layer. Engine-internal write paths only.

- `findOneAndUpdateDoc.js` — wraps native `findOneAndUpdate({ returnDocument: 'after' })`.
- `bulkWriteActions.js` — wraps native `bulkWrite` against the actions collection.
- `insertOneDoc.js` — wraps native `insertOne`.
- `insertManyDocs.js` — wraps native `insertMany`.
- `findDocs.js` — wraps native `find().toArray()`.
- `getMongoDb.js` — constructs and owns the engine's own `MongoClient` from the connection's `databaseUri`, caches it at module scope keyed by `databaseUri`, and exposes both `context.mongoDb` (the `Db`, for the helpers above) and `context.mongoClient` (for `startSession`, D11). The community plugin exposes no client/`Db` and creates a fresh one per request, so there is nothing to extract or reuse (D8).
- `*.test.js` for each — small unit tests against an in-memory or test Mongo.

Plus the plugin manifest:

- `plugins/modules-mongodb-plugins/package.json` — add `mongodb: "^6"` to `peerDependencies`. `getMongoDb.js`'s direct `import` from `mongodb` is the first engine use of the driver; declaring it as a peer (not a bundled dependency) keeps the engine on the app's single v6 driver build (D8 single-driver-version expectation).

### New — `plugins/modules-mongodb-plugins/src/connections/shared/phases/`

Phase functions, one file per phase, with sub-files for planners.

- `loadWorkflowState.js` — reads workflow + actions, resolves configs, runs invariant checks.
- `invokePreHook.js` — wraps `callApi` to the pre-hook routine. Returns `PreHookResult`.
- `invokePostHook.js` — wraps `callApi` to the post-hook routine. Receives `LoadedState` + `Plan` + `CommitResult` + the cascade fire list (D6).
- `buildHookPayload.js` (+ test) — **relocated** from `SubmitWorkflowAction/utils/` (both hook wrappers import it; envelope unchanged except `interaction`→`signal` + `current_status` dropped — task 14).
- `commitPlan.js` — single commit-phase entry point; sequences the writes per D9.
- `runTrackerCascade.js` — the D10 per-level tracker loop, **relocated** from `SubmitWorkflowAction/fireTrackerSubscription.js` (task 16): a cross-handler orchestrator called by Submit (task 15) and Start/Cancel/Close (task 17), so it lives at the phase layer, not in the Submit directory.
- `planSubmit.js` — the Submit plan-phase orchestrator (composes the planners below; task 15).
- `planners/` — pure planning functions:
  - `planActionTransition.js` — given an action + signal + payload + context, returns the planned post-commit action doc + change-log delta. **Field write — generic passthrough.** This planner is the home of today's `updateAction` `...fields` spread: it sets `payload.fields` onto the planned action doc (the rebuilt equivalent of `$set: { ...fields }`). It is **kind-agnostic** and does not name `assignees` / `due_date` / `description` — it passes the `fields` bag through verbatim, exactly as today. This is the behavior-preserving baseline; the universal-fields surface ([Part 24](../../_next/24-universal-fields/design.md)) layers a kind-based rule on top (write the universal fields only for `kind: simple`; `kind: form` owns them via its own operation). Part 38 itself stays ignorant of universal fields — it only carries the generic passthrough forward so no submit (notably `kind: simple`, whose submission content *is* those fields) regresses before Part 24 lands.
  - `planAutoUnblock.js` — fixpoint loop over the in-progress action plan; emits `unblock` signals via the FSM (engine cascades are unblock-only; pre-hook `block` entries are planned by `planActionTransition` from `preHookResult.actions[]`, not here).
  - `planWorkflowRecompute.js` — composes the planned post-commit workflow doc (summary, groups, completed push). Optional `lifecyclePush: { stage, reason }` skips the auto-complete and pushes the declared entry instead — Cancel/Close's `cancelled`/`completed` push (task 17).
  - `planFormDataMerge.js` — merges form + form_review + form_overrides into the planned workflow's form_data.
  - `planEventDispatch.js` — composes + renders the event payload(s) for a submit.
  - `planChangeLog.js` — builds change-log deltas from before/after pairs accumulated during planning.
  - `planTrackerLevel.js` — thin per-level tracker planner (emits the mirror signal, then delegates to the planners above — D10; task 16).
  - `recomputeGroups.js` / `deriveGroupStatus.js` — **relocated unchanged** from `SubmitWorkflowAction/` (with their tests); the shared group-recompute helper imported by both `planAutoUnblock` and `planWorkflowRecompute` (D4; task 9).
  - `*.test.js` for each — unit tests on pure functions.

Plus, one level up at `shared/`:

- `errors.js` — `WorkflowEngineError` base class + codes per D13 (task 9); `ConcurrentSubmitError` (task 13) and `TrackerCascadeDepthError` (task 16) extend it.
- `mergeEventOverrides.js` (+ test) — relocated from `SubmitWorkflowAction/` (consumed by `planEventDispatch`; task 12 — relocated there, before task 15 dismantles the handler directory).

### New — `plugins/modules-mongodb-plugins/src/connections/shared/fsm/`

- `tables.js` — exports the FSM tables per state-machine.md. Two distinct tables — `form` and `tracker` — plus `simple` **aliased** to the form table (`FSM_TABLES.simple = FSM_TABLES.form`), never a hand-maintained copy: state-machine.md says simple is "Identical to the form-kind table above." Aliasing makes the identity mechanical (CLAUDE.md "One correct way"), so a future edit to the form table can't silently diverge from simple.
- `resolveSignal.js` — the `(action, signal, payload, actionConfig) → targetStage | null` function.
- `tables.test.js` — exhaustive coverage of every cell in the `form` and `tracker` tables, plus an assertion that `FSM_TABLES.simple === FSM_TABLES.form` (the alias identity, not a re-test of every simple cell).

### New — `plugins/modules-mongodb-plugins/src/connections/shared/render/`

- `renderTree.js` — recursive Nunjucks walker per Part 30 D13. Carried over.
- `parseNunjucks.js` — moved from `src/blocks/ContactSelector/parseNunjucks.js` per Part 30.
- `renderStatusMap.js` — orchestrator for action-doc cell rendering. Inputs: cell, plannedActionDoc, mergedMetadata. Output: rendered cell ready to spread.
- `computeEngineLinks.js` — per-verb link **map** computation (`{ view, edit, review, error }` per slug) per Part 34 D7 + entry_id mechanic. Supersedes Part 30 D4's single-link computation.
- `substituteActionIdSentinel.js` — for `kind: custom` cell links per Part 30 D5.
- `renderEventDisplay.js` — renders event payload `display` block per Part 30 D14.
- `*.test.js` for each.

### Rewritten — engine entry points

- `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` + `handleSubmit.js` — restructured around phase calls. Old 11-step flow collapses to: load → invokePreHook → planSubmit (composition of the planners above) → commitPlan → runTrackerCascade → invokePostHook.
- `WorkflowAPI/StartWorkflow/StartWorkflow.js` — restructured: load (workflowConfig + parent action if any), plan (workflow doc + seeded action drafts), commit, tracker cascade (the parent-tracker mirror fire when started as a tracker child — the parent action belongs to a different workflow, so its transition is never in Start's per-aggregate Plan; D3/D10). No pre-hook in v1; could add later.
- `WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — load (workflow + all actions), plan (mark all non-terminal actions `not-required` via FSM signal `internal_cancel_action`, recompute, push workflow `cancelled`), commit, tracker cascade.
- `WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — same shape as Cancel.
- `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — restructured into the loop in D10 and **relocated** to `shared/phases/runTrackerCascade.js` (its consumers span Submit and Start/Cancel/Close — task 16). Each iteration calls into the same phases. The `CHILD_STAGE_MAP` export dies with it, superseded by the FSM tracker table.

### Deleted

- `shared/createAction.js` — replaced by `planActionTransition.js` (which handles both insert and update operations).
- `shared/updateAction.js` — replaced by `planActionTransition.js`.
- `shared/recomputeWorkflowAfterActionWrite.js` — replaced by `planWorkflowRecompute.js`.
- `SubmitWorkflowAction/utils/shouldUpdate.js` — priority rule logic; obsolete with FSM.
- `SubmitWorkflowAction/resolveTargetStatus.js` — interaction → status table; obsolete with FSM. (Renamed `task`→`simple` by [Part 35](../35-rename-task-kind-to-simple/design.md); this part sequences after Part 35 and deletes the file outright. The action kind is `simple` throughout this design, per state-machine.md and Part 35.)
- `SubmitWorkflowAction/computeAutoUnblocks.js` — replaced by `planAutoUnblock.js` (signal-emitting, not status-emitting).
- `SubmitWorkflowAction/reevaluateBlockedActions.js` — folded into `planAutoUnblock.js`.
- `SubmitWorkflowAction/utils/getCurrentAction.js` — load phase reads workflow + all actions in one call; no per-action targeted fetch needed.
- `SubmitWorkflowAction/mergePreHookActions.js` — the merge of current + auto-unblock + pre-hook `actions[]` entries folds into the submit planner's entry composition; each resolved entry is handed to `planActionTransition`.
- `SubmitWorkflowAction/utils/shouldCreate.js` — the upsert-vs-update branch folds into `planActionTransition` operation selection: an absent target with `upsert: true` → `operation: "insert"` resolved via the FSM `none` creation row; an absent target without `upsert` → throw (D13 (2)).
- `SubmitWorkflowAction/dispatchLogEvent.js` (the dispatch part) — folded into commit phase. The whole `buildDefaultLogEventPayload` composition (engine-default templates, app-keyed display, references incl. the entity ref key, per-type metadata) is absorbed by `planEventDispatch.js` (task 12).
- `SubmitWorkflowAction/utils/deriveEntityRefKey.js` — deleted with its tests, not relocated; superseded by the required `entity_ref_key` workflow-config field (see "Engine entry points emit events").
- `SubmitWorkflowAction/mergeFormOverrides.js` — superseded by Q6's uniform deep-merge (the top-level spread is not preserved; the landed `planFormDataMerge` doesn't import it). Deleted by task 15.
- `shared/getActions.js` — its only importers are `handleSubmit.js` (rewritten) and `recomputeWorkflowAfterActionWrite.js` (deleted); dead after task 15.
- `shared/getActionFields.js` — its importers are `fireTrackerSubscription.js` (rewritten, task 16) and `StartWorkflow.js` (rewritten, task 17); deleted by task 17 once both are migrated.
- `shared/pushWorkflowStatus.js` (+ test) — orphaned by the task-15/16 rewrites of its former call sites (status pushes now compose in `planWorkflowRecompute`); swept by task 17.
- `shared/populateIds.js` — orphaned likewise (zero importers); swept by task 17.
- `SubmitWorkflowAction/utils/buildHookPayload.js` — **relocated** (not deleted) to `shared/phases/` by task 14; the original is removed after task 15 rewires.

`SubmitWorkflowAction/dispatchNotifications.js` is **not** deleted — it is the commit step-4 helper (D9). Its dispatch mechanic (one `send-notification` call carrying `{ event_ids }`) is unchanged, but its call shape and error handling are corrected by task 22 to the shipped contract (`callApi({ endpointId: connection.endpoints.send_notification, payload })`, no `result.success` check — see "The shipped `callApi` contract" under D9); `commitPlan` calls it after the event write, passing the `event_id`s committed in step 3. (Today it is called only by Submit; under this rebuild every handler's `commitPlan` invokes it with that invocation's committed event ids — Start/Cancel/Close included — so the new lifecycle events can drive notifications via the same path. The app's `send_routine` decides which event types to act on.)

### Modified — display surfaces (carried from Part 30)

- `modules/workflows/pages/group-overview.yaml` → **renamed** `workflow-group-overview.yaml` (page `id` `group-overview` → `workflow-group-overview`; D16 / Part 34 D10). Page-side reads are unchanged (already `actions_list.$.message` + the singular `.link`); the single rendered link is resolved server-side by the shared display-layer stage ([Part 42 D5](../42-timeline-action-cards/design.md)), not picked in the UI.
- `modules/workflows/api/stages/access_filter.yaml` → **replaced by** `visible_verbs_filter.yaml` (per-verb `$let`/`$or` resolution → `$addFields visible_verbs` → `$match $anyElementTrue`; D16 / Part 34 D12).
- `modules/workflows/api/get-entity-workflows.yaml`, `api/get-workflow-overview.yaml`, `api/get-action-group-overview.yaml` — swap the access-stage `_ref` from `access_filter.yaml` to `visible_verbs_filter.yaml`; their `message` projection lights up automatically once the engine writes the top-level fields. Their singular `link: $<app_name>.link` projection references the field this part deletes (now the per-verb `.links` map) — it's replaced by the server-side `resolve_action_link.yaml` pick, owned by [Part 42 D5](../42-timeline-action-cards/design.md).
- `modules/workflows/pages/simple-view.yaml` / `simple-edit.yaml` / `simple-review.yaml` → **renamed** `workflow-action-view/edit/review.yaml` (page `id` gains the `workflow-` prefix and swaps the kind word for the domain noun — final ids, pulled forward from Part 43 per review-14 #1; D16 / Part 34 D10). Update every `_module.pageId: simple-*` reference (inside the pages themselves, and in `computeEngineLinks`'s simple-kind link table) and the `pages:` `_ref` paths in `module.lowdefy.yaml`. `workflow-overview.yaml` is already conformant (no rename).

### Modified — resolver + manifest (carried from Part 30)

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — add `validateStatusMapCells` per Part 30 D9, and `validateActionAccess` per Part 34 (verb-key whitelist; gate `true | [roles]`; reject empty-list, shorthand array, action-wide `access.roles`, unknown top-level `access` keys; lint-warn on `edit`/`review`/`error` without `view`). Also hard-error when a workflow config lacks the required `entity_ref_key` (task 6; "Engine entry points emit events").
- `modules/workflows/resolvers/makeActionPages.js` — read declared verbs from the `access.{app}` **map keys** (not the old verb array); emitted page ids stay `{workflow_type}-{action_type}-{verb}` (no `workflow-` prefix; entry scoping handles glob slicing — D16 / Part 34 D10).
- `modules/workflows/connections/workflow-api.yaml` — add `entry_id: { _module.id: true }`; add the `endpoints` property with build-resolved dispatch targets (`new_event` / `send_notification` via cross-module `_module.endpointId` — task 22).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — add `entry_id` field; rewrite the now-false `actionsEnum[].priority` description (display-only, no longer the priority-rule check) and the `changeLog` description (consumed natively by the engine, not forwarded to the community plugin) — see "Connection schema" above.
- `modules/workflows/module.lowdefy.yaml` — update `app_name` description.

### Modified — API + payload surfaces

- `modules/workflows/resolvers/makeWorkflowApis.js` — emitted-api payload mapping passes `signal`, `comment` (kept on the wire for [Part 33](../../_next/33-comment-rendering/design.md)'s `foldCommentIntoEvent` — the rebuilt engine itself writes no `metadata.comment`; task 12), `metadata`, `form`, `form_review`, `event_overrides`, hooks. Drops `force`, `interaction`, and `current_status` (superseded by `signal`; the simple-selector path is gone — state-machine.md). The hook/event emission loops re-key from interaction names to **signal names** (`submit`/`progress` added; `submit_edit` gone), so authored `hooks:`/`event:` blocks and emitted hook Api ids are signal-keyed (task 19). Hook ids in the emitted `hooks` map are wrapped in `_module.endpointId` (string form) so they resolve to pre-scoped opaque endpoint ids at app build — the engine passes them to `callApi` verbatim (task 22; see "The shipped `callApi` contract" under D9). Emitted Api ids stay `{workflow_type}-{action_type}-{...}` (no `workflow-` prefix; entry-scoped — D16 / Part 34 D10).
- `modules/workflows/api/start-workflow.yaml` — add `metadata` to payload (Part 30 carry-over). The `actions:` payload override keeps the `{ type, status }` grammar — the Start planner seeds drafts directly at the declared status via `planActionTransition`'s `seedStage` mode (legal seeds: `action-required`, `blocked`; tasks 10/17); creation at workflow start is not an FSM transition, and the `none` row is the pre-hook spawn path only (Part 45 review 1 #2; state-machine.md "Creation").
- Hook payload envelope (`buildHookPayload.js`, relocated to `shared/phases/` — task 14) — unchanged **except** `interaction` → `signal` (the D12 one-concept-one-name rename; hook routines read `_payload: signal`) and `current_status` dropped (source field removed). Hook resolution is signal-keyed (`params.hooks?.[params.signal]`). Pre-hook **return** shape changes: `{ type, status }` → `{ type, signal }` per state-machine.md.

### Modified — demo app (rebuilt by Part 45; see Proposed change item 13)

The demo `workflow_config` is **not migrated in place** — [Part 45](../45-demo-rebuild/design.md) deletes it and authors a new realistic demo directly in the post-rebuild grammar; its "Files changed" table is the authoritative list. What stays in this part vs. moves:

- `action_role_check` component (Part 18) — populate per-verb `_state.action_allowed: { view, edit, review, error }` (D16 / Part 34 D8). The component itself is task 8 (this part); the demo's template consumers reading the verb-specific bool land with Part 45.
- Demo's notification config — new lifecycle event types (`workflow-started` / `workflow-cancelled` / `workflow-closed`) are "ignore unless an app explicitly wires them"; Part 45 wires exactly one notification (`action-approve` × `send-quote`) to demonstrate.
- Engine-internal apps with custom workflow configs (out of repo) — migration documented separately; the in-repo demo is the canonical example.

## Worked example

A full Submit walked through all five phases — three-action installation workflow, FSM resolution, auto-unblock fixpoint, planned docs with rendered cells + per-verb links, CAS-gated commit, log-changes entries — lives in [worked-example.md](worked-example.md). It demonstrates the core claim: renders all happen during planning against the planned post-commit shape, so no re-fetch, no in-memory mirroring, and later write sites reopen no staleness window.

## Test strategy

Test coverage falls into several bands. If the section grows beyond what fits comfortably below, split into `test-strategy.md` alongside this design.

**Unit tests — pure phase / planner functions.** Every file under `shared/phases/planners/` is pure. Inputs are JS objects, outputs are JS objects. One test file per planner:

- `planActionTransition.test.js` — input `{ action, signal, payload, actionConfig, loadedWorkflow, event_id, now, newId }` (reads only the immutable `workflow_type` off `loadedWorkflow`, not the recomputed doc; the per-invocation `event_id` / `now` / `newId` are injected — minted once at the handler entry, task 15 — so tests pass deterministic stubs); verify output planned-action doc shape (status push, fields set, rendered cell spread, engine links computed, metadata merged, change-log delta). Per-kind variants. Sticky display assertions. FSM no-op signal returns null entry.
- `planAutoUnblock.test.js` — fixpoint termination (linear actions terminate in 1 iter; chained unblocks terminate; cycles don't deadlock thanks to FSM structural safety); `unblock` emission against the right targets; asserts the engine never auto-emits `block` on dep regression (unblock-only cascade); the empty case.
- `planWorkflowRecompute.test.js` — summary/groups recompute correctness; `shouldPushCompleted` trigger conditions (`total > 0`, all terminal, current stage not already `completed`/`cancelled` — empty-workflow and already-completed/already-cancelled cases carried over from the old `recomputeWorkflowAfterActionWrite` tests); `cancelled`/`completed` mutually exclusive; no `loadedState` mutation.
- `planFormDataMerge.test.js` — keyed vs unkeyed; merge order (params.form → params.form_review → preHookResult.form_overrides); shape preservation.
- `planEventDispatch.test.js` — engine default rendering; YAML override layering; pre-hook override layering; three-source merge order; **two render-context shapes asserted separately** — the action-event context (`user`, `action`, `workflow`, `signal`, `status_before`, `status_after`, `submitted_form`) for `action-{signal}` + tracker-mirror, and the workflow-lifecycle context (`user`, `workflow`, `signal` only) for `workflow-started` / `workflow-cancelled` / `workflow-closed`; per-event-type defaults; assert `planEventDispatch` branches on handler/event type to pick the context.
- `planChangeLog.test.js` — one `log-changes` entry per affected doc, per-type community schema (update: `args.filter`/`args.update`, `before`/`after`, no `response`; insert: `args.doc`, `response`, no `before`/`after`; both: `payload`, `meta`, request-context fields); update before from loaded doc, after from planned doc; `meta` copied verbatim from `changeLog.meta`; opt-out when `changeLog` unconfigured.

**Unit tests — FSM tables.** `tables.test.js` asserts every cell in every kind's table exhaustively. One assertion per (kind, currentStage, signal) tuple. Catches typos and structural mistakes (e.g. accidentally allowing `unblock` from `action-required`, which would re-fire). State-machine.md is the source of truth for expected values.

**Unit tests — Mongo helpers.** `mongo/*.test.js` against a test Mongo instance (or `mongodb-memory-server`). Cover happy path + CAS-miss path for `findOneAndUpdateDoc`. (Re-running the *same* `$set`-whole-doc bulk is trivially idempotent and is not the retry hazard worth testing — the real retry path re-runs load+plan and produces *different* operations from the advanced state. That hazard belongs in the integration band below, not here.)

**Shared role-gate oracle — one fixture set, three implementations.** The `(gate, user-roles) → bool` semantic is evaluated in three runtimes that can't share code: query-time (`visible_verbs_filter.yaml` aggregation), submit-time (load-phase JS), and client (`action_role_check`). To stop the three from drifting (a future `*` wildcard or deny-list would otherwise need three lockstep edits), a single shared fixture table — `gates.fixtures.js` — enumerates the cases (`true` gate → always pass; array gate intersecting user roles → pass; empty intersection → fail; undeclared/missing verb → fail; empty user-roles vs non-`true` gate → fail) and **all three implementations are tested against it**, so divergence fails CI. The aggregation case runs the fixtures through a `mongodb-memory-server` `$match`; the JS and client cases assert the helper directly. This is the mechanism standing in for the code-sharing the runtimes preclude (CLAUDE.md "One correct way").

**Integration tests — full handler invocations.** Per entry point: `StartWorkflow.test.js`, `SubmitWorkflowAction.test.js`, `CancelWorkflow.test.js`, `CloseWorkflow.test.js`, `fireTrackerSubscription.test.js`. Each runs the full load-plan-commit cycle against a test Mongo, asserts on-disk shape (action docs, workflow doc, events collection, `log-changes` collection) post-commit. Includes:

- The Part 30 worked-example assertions (rendered cells at top level of action doc; sticky display across transitions; engine links per stage × verb; status_title persistence).
- CAS-miss → retryable error throw.
- Concurrent submit on same workflow (one wins, one throws ConcurrentSubmitError).
- **Retry after a CAS miss does not double-transition.** Submit → force a concurrent write so the workflow CAS misses → retry the same submit → assert the action's `status[]` gained exactly one entry total, not two (guards the non-idempotent-retry hazard; see D9/D15).
- Multi-workflow tracker cascade (3 levels deep).
- Pre-hook returns auxiliary signals that cascade through auto-unblock.
- **Pre-hook upsert spawn (D4 / D13 (2) / state-machine.md `none` row):** a pre-hook returns `{ type, key, signal, upsert: true }` against a non-existent target → a new keyed action doc is inserted at the `none`-resolved birth stage (`activate` → `action-required`, `block` → `blocked`, `request_changes` → `changes-required`); the same signal against an *existing* doc transitions it normally; a missing target *without* `upsert: true` throws.
- Cancel preserves `done` actions (their status stays `done`; cancelled workflow status pushes to workflow doc).
- **Submit-time per-verb gate (D16 / Part 34 D5):** a user whose roles don't satisfy `access.{current_app}.{signal-verb}` is rejected with a structured error; a satisfying user (or `true` gate) passes. Covers `submit`↔`edit`, `approve`/`request_changes`↔`review`, `resolve_error`↔`error`.
- **Action-global review-stage resolution (D4 / `hasReview`):** a multi-app action with `review` declared in one app and absent in another — a `submit` from the review-declaring app and a `submit` from the other app land the **same** stage (`in-review`), confirming the split reads `hasReview` app-global, not the submitting app's access.
- **Per-verb `links` map (Part 34 D7):** each transition writes `<slug>.links: { view, edit, review, error }` with `null` for undeclared verbs / stages with no page. (Read-side resolution of the map to a single rendered link is owned and tested by [Part 42 D5](../42-timeline-action-cards/design.md), not here.)
- **`visible_verbs` filter (Part 34 D12):** `get-entity-workflows` returns the four-key bag per action; an action with no true verb for the user drops out of the response.

**Resolver validation (build-time).** `makeWorkflowsConfig.test.js` — `validateActionAccess` accepts the verb→gate map, and rejects the empty-list, shorthand array, action-wide `access.roles`, and unknown top-level keys with clear messages; lint-warns on `edit`/`review`/`error` without `view`. `makeActionPages.test.js` / `makeWorkflowApis.test.js` — emitted derived ids are `{workflow_type}-{action_type}-…` (unprefixed, entry-scoped), pages are emitted from the `access.{app}` map keys, and a workflow type named `workflow` is rejected (reserved — Part 34 D10).

**End-to-end — demo app.** The migrated demo's workflows exercise the engine via real Lowdefy YAML CallApi flows. One Playwright-style smoke test per demo workflow: start the workflow, transition through all states, verify display surfaces render the expected messages. This is the integration test that catches things unit + integration tests miss (resolver wiring, build-time validation, callApi boundaries, page rendering of action.{appName}.message).

## Open questions

All six are resolved; each decision is baked into the task noted in its heading.

**Q1. Plan shape: whole doc vs delta. (RESOLVED — whole-doc; task 13.)** D3 notes the planner can either compose the whole post-commit doc (planner does the work; commit `$set`s the whole thing) or compose a delta (planner identifies changed fields; commit `$set`s only those). Same on-disk effect for the workflow case (one update). Different testability: whole-doc tests assert against complete shapes; delta tests assert against the set of changed paths. Whole-doc is easier to reason about for renders (templates see one cohesive object); delta is closer to MongoDB's `$set` idiom and produces smaller writes. **Resolved: whole-doc** for workflow + actions; revisit if write size becomes an issue.

**Q2. Should the planner throw on FSM no-op for user-driven current-action signal, or return a `no-op` plan result that the API turns into a 200-with-noop response? (RESOLVED — throw; task 10.)** D13 says throw. Throw is simpler and surfaces real bugs (user clicked a button the page shouldn't have surfaced). Soft no-op is friendlier to race conditions where the action transitioned in another tab between page load and click. Resolved: throw, with a 200-with-noop response only if real user-experience pain emerges.

**Q3. Sticky display for slugs leaving `access`. (RESOLVED — no cleanup; task 10 notes.)** Confirmed in conversation: slugs that leave an action's `access` block don't get their existing `.message` / `.links` cleared. The doc carries stale values; display surfaces don't project them (they only read `actions_list.$.{app_name}.message` / `.links` for the current app's slug, and `visible_verbs` is recomputed per query so a departed slug yields no true verb). If the slug re-enters `access` later, its stale message reappears unless a new cell writes over it. Acceptable for v1 — document the behaviour, don't add cleanup.

**Q4. Recursive submits via pre-hooks. (RESOLVED — (b), document + CAS; task 15 notes.)** A pre-hook can call back into the engine (`submit-workflow-action` for a different action). The inner submit is its own load-plan-commit cycle. If it writes to a workflow the outer planner has already loaded, the outer's plan is stale by commit time. Two options: (a) detect and throw (pre-hook callbacks blocked); (b) document the constraint and let CAS catch real conflicts (outer commit will fail with ConcurrentSubmitError, caller retries). Resolved: (b) — CAS already covers it; explicit detection adds plumbing. Document the gotcha.

**Q5. Event emission for Cancel/Close — workflow-level only, or also per-action? (RESOLVED — workflow-level only; task 17.)** Cancel sweeps every non-terminal action to `not-required`. Today (no events at all) it's silent. Under the rebuild, Cancel emits one `workflow-cancelled` event for the workflow lifecycle change. Should each swept action also emit an `action-internal-cancel-action` event? Pro: complete audit trail of every state change. Con: a workflow with 50 actions emits 51 events per cancel. Resolved: workflow-level only for v1; the change-log captures per-action mechanics for forensic audit. Author of a notification config wanting per-action visibility can derive from change-log if needed.

**Q6. `form_data` write semantics on the workflow doc — what merge rule replaces the imperative per-handler writes? (RESOLVED — uniform deep-merge.)** (Raised by review-2 #2; the supersession of engine D5 is real but the underlying question is bigger than D5's stated rationale.)

D3/D9/Q1 commit the workflow as a **whole-doc `$set`** of `plan.workflow.doc`, so the form_data behaviour is determined entirely by how `planFormDataMerge` composes the planned `form_data.{action}` from the loaded base. Engine D5 originally specced form_data as per-field `$set` on dot-notation paths, justified there by *concurrency*. That framing was a mis-attribution: concurrency is now handled by CAS on `workflow.updated` (D15) — one writer wins, the other retries, **accepted**. The real, load-bearing requirement is **sequential accumulation**: one action's form_data accumulates across multiple submits of *different shapes* (submit → approve, draft → draft → submit, changes-required → resubmit), and a later write must not wipe a sibling sub-key an earlier write set. The reference project (`apps/shared/workflow_config/device-installation`) met this imperatively by letting each handler pick its own write shape — submitter replaced the whole `form_data.{action}` namespace; reviewer set only `form_data.{action}.validation`.

**Resolution — one uniform merge rule for all channels:** `planFormDataMerge` builds `submitted_form` by merging the three channels in order (`params.form` → `params.form_review` → `preHookResult.form_overrides`) — this inter-channel pre-merge uses the **same deep-merge rule** as the merge onto the base (one merge rule everywhere; the old `mergeFormOverrides.js` top-level spread is not preserved), so a pre-hook override touching one nested key doesn't drop the submitter's sibling keys — then **deep-merges `submitted_form` onto the loaded `form_data.{action}` sub-object**:

- **Deep-merge plain objects; replace arrays, scalars, and `null` whole.** Arrays *must* replace — element-wise merge of differing-length arrays (`form.access_control[]`) is garbage. (Implementation: lodash `mergeWith` with an `Array.isArray(src) ? src : undefined` customizer onto a **deep clone** of the loaded base — `mergeWith` mutates its target, and the planner must not mutate `loadedState` — or equivalent.)
- **Sibling survival** is guaranteed because the loaded sub-keys are already in the Plan's base — the reviewer's scoped `validation` write and the submitter's fields coexist without either clobbering the other.
- **Clearing is explicit, not by omission.** Sending `field: null` overwrites (scalar replace); *omitting* a field leaves the prior value. So the rule is **set-only / persists-until-overwritten**. v1 does not support removal-by-omission.

**Why uniform (Option A) over per-channel replace/merge (Option B).** Per-channel semantics — submitter replaces its namespace, reviewer merges a sub-key — mirrors prod exactly and preserves removal-by-omission, but makes the write shape a contract each author must remember ("which channel replaces vs merges?"), the exact opt-in-correctness drift the project's *one-correct-way* principle rejects. The single mechanical rule every handler gets for free wins. The only behaviour given up is the submitter's namespace-wipe: on `changes-required → resubmit → re-review` the prior `validation` block now **persists** until the reviewer overwrites it (or a payload sends `validation: null`), rather than being wiped by the resubmit. This is acceptable — the reviewer overwrites it on the next pass, the module is greenfield (no shipped workflows; the demo is rebuilt from scratch by Part 45, Proposed change #13, so its config is authored to the rule), and any flow that genuinely needs a fresh `validation` clears it explicitly. Rejected alternatives: per-action merge-strategy config (speculative surface — "build for what exists"); sub-namespacing `form_data.{action}.form` vs `.review` (changes the salvaged on-disk shape and breaks flat template references like `form_data.site-check.physical_id`).

**Bookkeeping.** Engine D5's "Write semantics" is reframed from concurrency to "multi-stage/multi-shape accumulation within an action namespace," annotated that Part 38 implements it via whole-doc `$set` + uniform deep-merge + CAS. (review-2 #2's suggested fix, subsumed by this rule.)

## Non-goals

- **In-flight action-doc backfill.** The rebuilt engine reads the per-verb `<slug>.links` map (Part 34 D7) and the renamed fixed-page ids (D16 / Part 34 D10); pre-rebuild action docs carry the old singular `<slug>.link` and stale `pageId`s. No migration backfills existing action docs — an action already at a terminal stage keeps its old shape and renders no link affordance. This is acceptable because there are **no shipped workflows** (greenfield), and is consistent with the module's V1 migration stance (no version actions; an author with live action docs writes their own data migration — see D16 / Part 34 D6). The demo ships no seeded action docs (it carries no seed/fixture files — action docs are created at runtime by starting a workflow), so there is nothing to backfill; a developer with stale local action docs from a prior build just re-runs the workflow.
- **`notification_roles` consumer wiring / role-based fan-out.** `notification_roles` is authored config at the action root (Part 34 D9) but is consumed nowhere in current code, and the engine does **not** propagate it onto the event. This part does not wire it: `planEventDispatch` builds the event from the references/metadata it already composes, and recipient fan-out stays the notifications module's concern via `send_routine`. The whole model is a rethink — deferred to [Part 41 — Notification-roles model](../../_next/41-notification-roles-model/design.md).
- **Threading the engine transaction into callApi'd subroutines** (so `new-event` / notification writes can join the workflow+action transaction). v1 scopes the transaction to workflow + action writes only (D9/D11); extending it across the callApi boundary is a larger, separately-tracked change.
- **Field-diff storage for change-log.** The engine writes whole before/after docs (the community plugin's behaviour); field-diff is a future optimization for the `log-changes` collection owner, not this part.
- **Rollback API.** Out of scope; the `log-changes` before/after shape supports a future inverse-apply tool, but nothing engine-specific is built here.
- **Operational-event signals** (`due_date_passed`, scheduled triggers). Per state-machine.md non-goals.
- **Author-overridable FSM tables.** v1 ships per-kind tables engine-locked, per state-machine.md.
- **Custom statuses.** Eight-status enum stays fixed per critique § 7 / state-machine.md.
- **Engine-specific change-log fields** (`commit_id`, `source`, rollback grouping). The engine matches the community `log-changes` schema exactly; no bespoke audit fields in v1.
- **`action_display` per-call payload override.** YAML `status_map` is the author channel for per-stage messages; no consumer in this repo asks for a per-call override. Re-addable if a real use case appears.
- **Migrating apps outside this repo to the new payload shape.** The in-repo demo is rebuilt by Part 45 (Proposed change #13); external apps get a separate migration doc.

## Related

- [Part 34 — Action access model](../34-action-access-model/design.md) — the per-app per-verb access contract this part implements (per-verb `links` map, `visible_verbs`, signal→verb submit gating, emitted-id naming + fixed-page `workflow-` prefix, resolver validation). Design-only; Part 38 is its implementation vehicle.
- [Part 30 — Engine-managed display (rejected)](../../_rejected/30-status-map-rendering/design.md) — the rejected predecessor. On-disk contract carries over; the rest is rebuilt.
- [state-machine.md](../../../../workflows-module-concept/state-machine/design.md) — concept-level FSM model.
- [engine/design.md](../../../../workflows-module-concept/engine/design.md) — concept-level engine surface (Decision 4 updated separately).
- [submit-pipeline/design.md](../../../../workflows-module-concept/submit-pipeline/design.md) — concept-level submit lifecycle (Decision 3 updated separately).
- [Part 28 — Custom action kind](../../_next/28-custom-action-kind/design.md) — `kind: custom` author-driven link authoring; the planner handles it via Part 30's carried-over sentinel-substitution rule.
- [Part 32 — Drop static interactions overrides](../32-drop-static-overrides/design.md) — adjacent topic on event_overrides channel; no shared edits.
- [Part 37 — Actions collection indexes](../37-actions-collection-indexes/design.md) — index migration pattern (the engine adds no new collection, so no change-log index work here).
- [`docs/idioms.md` § Event display](../../../../../docs/idioms.md#event-display) — the cross-repo event_display idiom the engine path conforms to (plain Nunjucks strings).
