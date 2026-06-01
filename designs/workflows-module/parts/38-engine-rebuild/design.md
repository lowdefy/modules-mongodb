# Part 38 — Engine rebuild: FSM + load-plan-commit

**Layer:** engine handlers + shared write helpers + Mongo driver layer + audit log. **Size:** XL. **Repo:** `plugins/modules-mongodb-plugins/src/connections/`, `modules/workflows/`.

**Prerequisite.** Concept-level reconciliation lands first: [`state-machine`](../../../workflows-module-concept/state-machine/design.md) becomes the authority for transition resolution, with [`engine`](../../../workflows-module-concept/engine/design.md) Decision 4 and [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) Decision 3 citing it. This implementation design assumes those edits are settled. This part also sequences **after** [Part 35 — rename `kind:task`→`simple`](../_completed/35-rename-task-kind-to-simple/design.md): the action kinds are `form` / `simple` / `tracker` throughout, and the FSM tables key on `simple` (not `task`).

**Supersedes** [Part 30 — Engine-managed display](../_rejected/30-status-map-rendering/design.md). Part 30 is moved to `_rejected/` with a README pointing here. The on-disk contract Part 30 established (top-level per-app keys on action docs, sticky display, engine-computed links for built-in kinds, engine-rendered event display) is the right contract — Part 30's mistake was layering it onto the existing handleSubmit shape, which couples render context to mutable handler state and produces a class of staleness bugs that surface review after review (see Part 30 reviews 5 + 6). This part keeps Part 30's contract and rebuilds the API beneath it.

**Implements [Part 34 — Action access model](../_completed/34-action-access-model/design.md).** Part 34 is a design-only contract with no standalone implementation; its engine/resolver/display-touching decisions land here. Part 38 is the implementation vehicle for: (1) the per-app per-verb `access` shape and its resolver validation; (2) the per-verb `links` map on action docs (Part 34 D7), which **supersedes** Part 30's single `action[slug].link`; (3) signal→verb submit-time gating (Part 34 D6); (4) the `visible_verbs` query response replacing the binary `access_filter` (Part 34 D12); and (5) the emitted-id naming for central-auth globs (Part 34 D10) — derived per-workflow endpoints stay entry-scoped with no literal prefix, the `workflow-` prefix instead marking the module's fixed pages. Wherever this design previously carried a Part 30 surface that Part 34 changed (single link, the `access`-verb shorthand array), the Part 34 shape wins. See D16 for the consolidated list of surfaces touched.

## Why this rebuild

Today's `SubmitWorkflowAction.handleSubmit` interleaves 11 read/write/render steps over a mutable `context` bag. Each step's input is what previous steps left in `context`. Render points (Part 30's render-on-write at action transitions, and the always-needed event display render before `dispatchLogEvent`) need the "latest" version of action and workflow docs — but the latest version is spread across (a) the original reads, (b) per-call write returns, (c) helper-internal recomputes, (d) the form_data sidewrite at step 6. The handler tracks all four by mirroring writes back into `context.action` / `context.workflow` step by step. Adding any new write or any new render point opens a new staleness window.

The priority-rule + `force: true` transition model layers a second axis of complexity on top: every call to `updateAction` carries a `force` flag, the priority gate has a same-stage self-exception, engine-internal call sites bypass the gate, and the FSM that the action lifecycle actually expresses is implicit across priority numbers and code-path branches. [State-machine.md](../../../workflows-module-concept/state-machine/design.md) is the concept-level answer to this axis.

This part addresses both axes at once because they share surface area:

- The signal-resolution model (FSM) restructures the per-entry write loop in handleSubmit.
- The load-plan-commit architecture restructures the surrounding read/write/render flow.
- They share the same shared helpers (`updateAction`, `createAction`, `recomputeWorkflowAfterActionWrite`, the cascade sweepers) and the same `context` shape.

Sequencing them is more churn than combining them. Combined, they collapse the recurring "render against stale in-memory doc" bug class into something structurally impossible: renders happen against the **planned** state, which is also exactly what gets committed.

## Proposed change

1. **Every engine write entry point (`SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, plus the tracker-recursion sub-handler) restructures into four phases:** load → pre-hook → plan → commit → post-hook. Reads happen in load. Writes happen in commit. The plan phase is pure (no I/O). Pre-hook returns intent (signals + overrides); post-hook fires against committed state.
2. **Signals replace the priority rule + `force: true`.** FSM tables per action kind (form/simple/tracker) drive transition resolution. Engine-internal call sites emit named `internal_*` signals. Pre-hook returns shift from `{ type, status }` to `{ type, signal }`. Per state-machine.md.
3. **One in-memory Plan object accumulates every consequence of a submit.** Per-action transitions (signal resolved → new stage + rendered cell + computed links + fields + merged metadata), workflow changes (summary, groups, form_data, optional `completed` push), the event payload (rendered against the planned post-state), notification payloads. Plan is purely additive — actions/workflow/events are written from the Plan; nothing reads back from Mongo during plan.
4. **Render-against-planned-state replaces render-on-write.** Part 30's action-doc display contract (rendered cell + engine links spread at top level of the action doc, sticky across transitions) is unchanged on disk. The difference is *when* the render happens: during the plan phase, against the doc shape the commit phase will write. There is no "pre-write doc" vs "post-write doc" gap because the Plan is the only source of truth for both render and commit.
5. **Engine writes go through new shared helpers using the native Mongo driver.** `findOneAndUpdate({ returnDocument: "after" })` for single-doc writes that the caller needs back; `bulkWrite` for batched action transitions. The community-plugin `MongoDBUpdateOne` / `MongoDBUpdateMany` is replaced for engine-internal write paths; the plugin stays in use for app-side YAML CallApi requests.
6. **Audit change-log reuses the community plugin's `changeLog` contract.** No new collection: the engine writes the same `log-changes` entries, in the same schema, configured by the same `changeLog: { collection, meta }` connection property — it just populates before/after from the Plan instead of from extra reads (D7). Because engine writes now bypass the community plugin (D8), the engine reproduces the audit the plugin used to write automatically.
7. **Pre-hooks are read-only with respect to the engine's atomicity boundary.** Pre-hooks may do their own callApi/MongoDB work for external coordination, but the engine's plan-then-commit treats pre-hook returns purely as input. Writes the pre-hook performs are independent of the engine's commit; this is a deliberate contract, documented for authors.
8. **Tracker recursion is its own load-plan-commit cycle per level.** `fireTrackerSubscription` becomes a loop that, for each parent workflow up the chain, runs the same four phases on that parent workflow. No shared in-memory state between levels; each level is independently atomic.
9. **`shared/` reorganizes around the phase model.** `createAction.js` / `updateAction.js` go away as primary call sites. Replaced by: `loadWorkflowState.js` (read phase), planners (`planActionTransition.js`, `planWorkflowRecompute.js`, `planEventDispatch.js`), `commitPlan.js` (write phase), and Mongo-driver helpers (`mongo/findOneAndUpdateDoc.js`, `mongo/bulkWriteActions.js`, `mongo/insertOneDoc.js`).
10. **Salvaged from Part 30 unchanged:** the on-disk action-doc shape (per-app cells spread at top level, sticky display, `status_title`, `metadata`); engine-computed links for built-in kinds with the `entry_id`-scoped pageId mechanic, now emitted as a **per-verb `links` map** (kind × stage × **verb**) per Part 34 D7 rather than Part 30's single `link`; the resolver shape-validator for status_map cells; engine-rendered event display with the fixed render context; display-surface fixes (`workflow-group-overview` reads `actions_list.$.message` / `.links`); the engine-default event template rewrite to plain Nunjucks strings; the workflow-api connection `entry_id` wiring; the resolver `app_name` var description update.
11. **Start, Cancel, and Close each emit a log event** in addition to action-level events. Today only Submit dispatches log events; under this rebuild, every engine handler invocation produces exactly one `event_id` and a corresponding entry in the `events` timeline (`workflow-started`, `workflow-cancelled`, `workflow-closed`). One `event_id` per invocation anchors that invocation's events-timeline entry; the `log-changes` audit (D7) follows the community plugin's schema and is keyed/grouped the same way the plugin keys it (no engine-specific `commit_id` field).
12. **Concurrency: Compare-And-Swap on `workflow.updated`.** Each handler reads `workflow.updated` at load; the commit's workflow `findOneAndUpdate` filter pins that value. Concurrent writes between our load and commit make the filter miss; the engine throws a retryable error. No version field, no transactions required. See D15.
13. **Demo migration ships with this part.** The demo app's `workflow_config/` migrates to the new payload + pre-hook return shapes (signals, no `force`) as part of this part's task list. The demo is the only in-tree end-to-end exercise of the engine; without migrating it together, there is no integration test of the rebuild until app-side migrations run.
14. **Part 34's access model is absorbed here.** The resolver validates the per-app per-verb `access` shape (verb-key whitelist, gate values `true | [roles]`; reject the empty-list / shorthand-array / action-wide `access.roles` / unknown top-level forms; lint-warn on `edit`/`review`/`error` without `view`). The submit handler runs the signal→verb access check against `access.{current_app}.{verb}` and `_user.apps.{current_app}.roles` before any write. `get-entity-workflows` (and its `get-workflow-overview` / `get-action-group-overview` `_ref` callers) replace `access_filter.yaml` with `visible_verbs_filter.yaml`, projecting a four-key `visible_verbs` bag per action and dropping actions with no true verb. Derived page ids (`makeActionPages`) and Api ids (`makeWorkflowApis`) stay `{workflow_type}-{action_type}-…` with no literal prefix (entry scoping namespaces them); the `workflow-` prefix is instead added to the module's fixed pages (`workflow-simple-*`, `workflow-group-overview`, `workflow-overview`). See D16 and Part 34 D10 for full rationale.

## Key decisions

### D1. Why load-plan-commit (and not "render-on-write + re-fetch before event dispatch")

The lightweight band-aid is: keep handleSubmit's current shape, add Part 30's render-on-write, and re-fetch action + workflow once before `dispatchLogEvent`. That works mechanically. It does not survive the next write site added between step 5 and step 7 — at which point a future reviewer files the same bug Part 30 review-6 #2 filed (workflow.form_data staleness), and the fix is "re-fetch again" or "mirror this write too."

The load-plan-commit pattern makes render staleness structurally impossible:

- During the plan phase, every consequence of the submit is computed against the loaded state plus accumulating planned changes. The Plan is the post-commit shape of every doc.
- Renders consume the Plan, not the loaded docs and not Mongo.
- The commit phase writes the Plan and nothing else.

There is no "in-memory copy vs Mongo" gap because the in-memory copy *is* the source of truth at render time, and the commit just persists it. New write sites added later don't introduce staleness — they extend the Plan, and renders that depend on what they wrote are already reading from the Plan.

The pattern is standard industry practice. Names: DDD aggregate + unit-of-work; functional-core, imperative-shell; command → event → projection (event sourcing lite); Kubernetes controller reconciliation. The workflow doc is the aggregate root; actions are entities within it; a submit is one atomic mutation of the aggregate.

### D2. Phase contracts

The four phases are not just labels — each has an explicit input/output contract that the code structure enforces.

**Load phase.** Input: handler context (params, user, connection). Output: a `LoadedState` object containing the workflow doc, all action docs, the workflowConfig, the actionConfig for the target action (Submit only — Start/Cancel/Close operate on the whole workflow). Performs N reads (workflow + actions for the target workflow; for Submit, also the target action; hooks haven't run yet). Throws if state is missing or invalid (workflow not found, action not found, **per-verb access check fails**, workflow stage doesn't accept submissions). The access check (Submit only) resolves the signal's required verb (Part 34 D6: `submit`/`progress`/`not_required`→`edit`, `resolve_error`→`error`, `approve`/`request_changes`→`review`) and rejects unless `access.{current_app}.{verb}` is `true` or intersects `_user.apps.{current_app}.roles` (D16). **The check living in the load phase — ahead of the pre-hook — is intentional: an unauthorized submit is rejected before any pre-hook fires, so unauthorized users never trigger pre-hook external side effects (callApi, third-party writes). Do not move the check after the pre-hook.** After load returns, no further reads happen until the next load (the tracker-recursion next-level load).

**Pre-hook phase.** Input: `LoadedState` + caller payload. Output: `PreHookResult` containing auxiliary signals (against *other* actions), form_overrides, event_overrides. A pre-hook **cannot** re-signal the current action — there is no root-level signal redirect (state-machine.md, "How signals get emitted"); the current action lands per the signal the user fired. Single `callApi` to the hook routine. Pure consumer of the result — the engine doesn't trust the hook to have done writes that affect engine state; if a hook does writes for external reasons (e.g. updating a third-party system), those are out-of-band by contract.

**Plan phase.** Input: `LoadedState` + `PreHookResult`. Output: a `Plan` object (see D3). Pure functions only. No I/O. Computes every consequence of the submit: per-action transitions via FSM resolution, per-action rendered cells + engine links + merged metadata, workflow summary/groups/form_data updates, workflow auto-complete push, event payload (rendered against planned post-state), notification payloads, change-log entries. The plan phase can throw — invalid signal target, invalid status transition that the FSM doesn't allow but the author asked for explicitly (depending on whether we want noisy or silent rejection — see D14), shape-validation errors caught at plan time rather than at commit time.

**Commit phase.** Input: `Plan`. Output: commit result (the doc IDs of what was written). Single ordered batch of writes through the new Mongo helpers. No reads. No renders. No logic that wasn't in the plan. If transactions are enabled (D11), the entire commit is one transaction; if not, writes are sequenced in a documented order with documented partial-failure semantics.

**Post-hook phase.** Input: `LoadedState` (pre-write) + `Plan` (committed) + commit result. Output: post-hook return value, surfaced as part of the handler's return payload. Single `callApi`. Authors writing post-hooks see fresh state because the Plan contains it — no need to re-read.

The contract is enforced by the file layout (D8: `shared/` reorg). Phase functions live in different files; a planner that imports a Mongo driver is a code smell caught in review.

### D3. The Plan object

```ts
type Plan = {
  workflow: {
    doc: WorkflowDoc;              // post-commit shape — what commit phase writes
    changeLog: ChangeLogDelta;     // before-after for audit
  };
  actions: Array<{
    doc: ActionDoc;                // post-commit shape (including rendered cell, engine links, metadata)
    operation: "insert" | "update"; // commit phase dispatches accordingly
    changeLog: ChangeLogDelta;     // before-after for audit; null `before` for inserts
  }>;
  events: Array<{                  // one entry per dispatched log event
    doc: EventDoc;                 // fully rendered display, references, metadata
  }>;
  notifications: Array<{
    doc: NotificationDoc;
  }>;
  trackerFires: Array<{            // recursion handled per-level outside this plan
    parentWorkflowId: string;
    parentActionId: string;
    signal: string;                // internal_mirror_child_active | _completed | _cancelled
  }>;
};
```

Notes:

- `workflow.doc` is the **whole** post-commit workflow doc, not a delta. The planner composes it from `loadedState.workflow` + each accumulated change (summary recompute, groups recompute, form_data merge, optional `completed` status push). The commit phase does `findOneAndUpdate` with a `$set` of the whole doc minus `_id`. (Open question: should commit phase set whole doc or computed delta — see "Open questions" below.)
- `actions[].doc` is the whole post-commit action doc. For inserts, that's the full draft. For updates, that's the loaded action with planned changes layered on (new status entry prepended, fields set, rendered cell spread, engine links computed, metadata merged).
- Renders run during planning: `actions[].doc.<app-slug>.message`, `actions[].doc.status_title`, and `events[].doc.display.<app-slug>.{title,detail}` are rendered Nunjucks strings at plan time, against the planned post-commit shape of the doc the template references. The per-verb `actions[].doc.<app-slug>.links` map (Part 34 D7) is **computed** in the same pass by `computeEngineLinks` (not a Nunjucks render) — one `{ view, edit, review, error }` map per slug.
- `changeLog` deltas (D7) capture before vs after for audit. Built during planning, alongside the planned doc shape.
- `trackerFires` records what tracker subscriptions should fire after the current workflow's commit completes — the tracker recursion loop runs the next-level load-plan-commit per entry.

The Plan is immutable once handed to commit. The planner can return early with an empty-actions Plan; commit on an empty Plan is a no-op write of just the workflow's `updated` stamp if anything else changed, or a complete no-op if nothing changed. Empty plans arise only from **engine cascade / pre-hook auxiliary signals** that no-op against their targets — a user-driven current-action signal with no FSM entry *throws* (D13 (3) / Q2), so the user path never produces a silent empty-plan no-op.

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

One action doc is shared across every app (all read the same `status[0].stage`), so whether a review step exists is a property of the action, not the submitter — otherwise a `team-app` submit would land `in-review` while a `support-app` submit on the same action lands `done`. `resolveSignal` takes no current-app argument for exactly this reason. (Equivalent to "a review page is emitted," since Part 34 D5 emits it iff some app declares `review` — same input.) Read live from the static `actionConfig`; the module ships no in-flight migration, so editing `access` to add/remove a review stage on a live workflow is the author's migration responsibility — see D16. Per Part 34 D6.

Three signal sources, identical resolution:

1. **User signal** — `payload.signal` from the API endpoint. Submit applies this to the target action identified by `payload.action_id`.
2. **Pre-hook auxiliary signals** — `preHookResult.actions[]` carries `{ target, signal }` entries; each resolves through the FSM against its target action.
3. **Engine cascade signals** — auto-unblock re-evaluation, tracker subscriptions, cancel/close cascades. Emit `unblock`/`internal_mirror_child_*`/`internal_cancel_action` signals against affected actions. All resolved through the same FSM call. The engine never auto-emits `block`: per state-machine.md, engine cascades are monotonic (unblock-only), and `block` is a **pre-hook-only** auxiliary signal that arrives via `preHookResult.actions[]` (source 2) and resolves through the same FSM call.

Auto-unblock is itself a fixpoint over the Plan: an action's `blocked_by` references other actions; if a planned transition makes those references terminal, the dependent action gains `unblock`. The planner iterates until no further unblocks fire. The unblock-only cascade makes the bound trivial: each action unblocks at most once, and `unblock` no-ops from every non-`blocked` state per the FSM (`unblock` from `blocked` goes to `action-required`, which doesn't itself accept `unblock`). The engine does **not** auto-emit `block` on dep regression — once unblocked, an action stays unblocked unless an author explicitly re-blocks it via a pre-hook (state-machine.md). Worst case: N iterations for N actions in the workflow. In practice 1-2.

### D5. Pre-hook contract: read-only relative to engine atomicity

A pre-hook returns intent (signals + overrides) and may have done external work (callApi, third-party integration). The engine treats pre-hook returns as plan input. Two consequences:

- **Pre-hook writes don't participate in the engine's transaction (if transactions are adopted — D11).** Authors writing pre-hooks that do their own Mongo writes must accept that their writes commit independently of the engine's atomicity boundary. Documented in module README.
- **Pre-hook returns are the only channel into the Plan.** A pre-hook that wants to influence *other* actions returns `{ actions: [...] }` (auxiliary signals). A pre-hook that wants to override event display returns `{ event_overrides: {...} }`; written form data, `{ form_overrides: {...} }`. There is no current-action signal redirect — where the current action lands is fixed by the signal the user fired and the FSM (state-machine.md). Conditional landing ("this submission should be marked not-required") is modelled as a separate thin action with its own button, not a redirect of the current submit. There is no "the pre-hook quietly mutated context" path because there is no shared mutable context across phases.

This contract is the same as today's pre-hooks structurally — today's hooks already return a structured response that handleSubmit consumes. What changes: the response shape (Part 30 + state-machine signal mapping), and the explicit "writes are out-of-band" framing.

### D6. Post-hook contract: against committed state

Post-hooks fire after the commit. Their input is `LoadedState` (pre-commit) + the committed `Plan` + the commit result (IDs written). They see fresh state through the Plan — no re-read needed. The handler return value carries the post-hook response.

This is identical to today's post-hook semantically — the only difference is that the "what was just written" data structure is now the Plan rather than a soup of mirrored fields on `context`.

### D7. Change-log mechanic — reuse the community plugin's `changeLog` contract

The engine does **not** introduce a bespoke audit collection. It reproduces the community plugin's existing `changeLog` feature exactly: same collection (`log-changes` by convention), same per-entry schema, same connection configuration. The only difference is internal — how before/after are obtained (from the Plan, not from extra reads).

Today engine writes go through the community plugin's `MongoDBUpdateOne` / `MongoDBInsertOne`, which auto-write a `log-changes` entry per op (the `changeLog: { collection, meta }` property on `WorkflowAPI/schema.js` already configures this). Once D8 routes engine writes through native-driver helpers, the community plugin's `changeLog` stops firing for those writes — so the engine must produce the same entries itself.

**Configuration — unchanged.** The existing `changeLog: { collection, meta }` property on the WorkflowAPI connection is **kept and now honored by the engine natively**. Opt-in exactly like the community plugin and the events module (`{ collection: log-changes, meta: { user: { _user: true } } }`). When `changeLog` is not configured, the engine writes no audit entries — same behaviour as the community plugin.

**Schema — identical to the community plugin's `log-changes` entry.** Per affected doc the engine writes one entry with the community shape: `{ type, args, before, after, response, timestamp, meta, ... }` (plus the request-context fields `blockId` / `connectionId` / `pageId` / `requestId`, populated from the engine handler's request context, shared across all entries from one invocation). `type` reflects the logical operation (`MongoDBUpdateOne` for an action/workflow update, `MongoDBInsertOne` for an action insert). `meta` is resolved from `connection.changeLog.meta` (e.g. the current user via `_user`). No engine-specific fields are added — a `log-changes` reader can't tell an engine-written entry from a community-plugin-written one except by `type`/content.

**How before/after are obtained — from the Plan, no extra reads.** The community plugin captures `before`/`after` with extra reads (`findOneAndUpdate` + `findOne`) because it is stateless per op. The engine doesn't need to: `before` is the doc the load phase already read (`loadedState.action` / `loadedState.workflow`), and `after` is the doc the plan phase already composed (`plan.actions[i].doc` / `plan.workflow.doc`). The entries are built from the Plan and inserted with one `insertManyDocs`.

**Why bulkWrite is not a problem.** The engine commits action transitions via one `bulkWriteActions`, whose return value is counts only — no per-doc before/after. This is exactly the limitation that makes the community plugin omit before/after on `UpdateMany` and omit `bulkWrite` entirely. It does not affect us, because the engine never derives before/after *from* the write — both halves are in the Plan before `bulkWriteActions` runs. So bulk writes and full per-doc before/after audit coexist with zero extra reads (strictly cheaper than the community plugin's per-op double-read).

**When written.** Commit phase, after the workflow + action writes, as one `insertManyDocs`. It's outside the transaction (the txn is scoped to workflow + actions — D11) and runs last, so a failure here is the smallest possible mode: a committed change with a missing audit entry, never an audit entry for a change that didn't commit. A commit of N action transitions + 1 workflow update produces N + 1 `log-changes` entries.

**What's logged.**

- Action transitions: `before` = loaded action doc; `after` = planned post-commit action doc.
- Workflow updates: `before` = loaded workflow doc; `after` = planned post-commit workflow doc.
- Events: logged by the events module's *own* `changeLog` config (the `new-event` write goes through the community plugin, which logs it). The engine does not double-log the event.
- Notifications: same — logged by their own write path if configured; not the engine's concern here.

**Rollback.** Out of scope (Non-goals), exactly as for any other `log-changes` consumer. The community `before`/`after` shape already supports a future inverse-apply tool; nothing engine-specific is needed.

**Diff storage.** v1 stores whole before/after docs (the community plugin's behaviour). Field-level diffs are a future optimization for whoever owns the `log-changes` collection, not this part.

### D8. Mongo driver layer

We roll our own helpers in `plugins/modules-mongodb-plugins/src/connections/mongo/`. These are used by engine-internal write paths only — app-side YAML CallApi requests continue to use the community plugin.

**Helpers:**

- `findOneAndUpdateDoc({ collection, filter, update, session? })` — wraps native driver `findOneAndUpdate({ returnDocument: "after" })`. Returns the post-write doc.
- `bulkWriteActions({ operations, session? })` — wraps native driver `bulkWrite` for the actions collection. `operations` is an array of `{ updateOne: {...} }` / `{ insertOne: {...} }` entries built from the Plan. Returns acknowledged counts; does NOT return per-op post-write docs (use case doesn't need them — the Plan already has them).
- `insertOneDoc({ collection, doc, session? })` — wraps native driver `insertOne`. Returns inserted ID.
- `insertManyDocs({ collection, docs, session? })` — wraps native driver `insertMany`. Used for change-log entries and notifications.
- `findDocs({ collection, query, options?, session? })` — wraps native driver `find().toArray()`. Used by load phase.

**Obtaining the `Db` and client.** The community plugin does **not** expose its `MongoClient` or `Db` — `createMongoDBConnection.js` closes over the plugin's `MongoDBCollection` and returns per-collection request dispatchers, nothing more. Worse for our purposes, the community plugin creates a **fresh client per request** (it was written for single-operation Lowdefy requests in a serverless context and hasn't been updated for connection reuse). So there is nothing to "extract" and nothing worth reusing.

`mongo/getMongoDb.js` therefore **constructs and owns the engine's own `MongoClient`** from the connection's `databaseUri` (already in `WorkflowAPI/schema.js`), and **caches it at module scope keyed by `databaseUri`**, reusing it across handler invocations. This is a deliberate improvement over the community plugin's per-request client: a persistent pooled client is required for transactions anyway (a session is bound to its client — D11), and it avoids a cold-start connection storm in Lambda. `getMongoDb` exposes both:

- `context.mongoDb` — the raw `Db`, used by all D8 helpers.
- `context.mongoClient` — the `MongoClient`, used by `commitPlan` for `startSession()` (D11).

Engine code uses these; app-side and pre-hook code continue to use `context.mongoDBConnection` (the community-plugin wrapper). This means **two independent clients coexist** — the engine's cached pooled client and the community plugin's per-request client. That's the root cause of why callApi'd writes (events) can't join the engine's transaction (D9): they run on a different client. Accepted for v1; unifying on one client is the "thread the session across callApi" deferred work.

**Why not extend the community plugin.** Three reasons:

1. The community plugin's `changeLog` does an internal before/after read per op (stateless), where the engine already holds before (load) and after (plan) — so the engine reproduces the same `log-changes` output (D7) without the extra reads. Routing engine writes through the plugin just to get its auto-changeLog would re-incur those reads.
2. The plugin's API surface is YAML-CallApi-shaped (per-call `{ filter, update }` objects with serializable values); the engine's need is JS-shaped (sessions, raw driver methods, bulk ops).
3. `MongoDBBulkWrite` is deliberately absent from the community plugin (per Part 30 D11's analysis); we need it.

The community plugin stays in use for app-side code unchanged.

### D9. Commit ordering and partial-failure semantics

Commit writes are ordered **workflow-first**:

1. **Workflow** — `findOneAndUpdateDoc` on the workflows collection with the planned post-commit workflow doc, carrying the CAS filter (`updated.timestamp`, D15). **This is the claim step:** if the filter misses (a concurrent submit moved the workflow between our load and commit), `findOneAndUpdate` matches zero docs, writes nothing, and the engine throws `ConcurrentSubmitError` **before any action write happens**.
2. **Actions** — `bulkWriteActions` with all inserts + updates from `plan.actions`.
3. **Events** — `insertOneDoc` per entry in `plan.events`.
4. **Notifications** — `insertManyDocs` (single call) for all `plan.notifications`.
5. **Change-log** — `insertManyDocs` (single call) of all `log-changes` entries (D7), built from the Plan. Last step (outside the txn) so an earlier failure prevents an audit entry claiming a write that didn't happen.

**Invariant: no action write is durable until the workflow claim succeeds.** Workflow-first is what makes the CAS gate meaningful — the common failure (concurrent submit) is detected and thrown with *zero* writes, so a retry re-loads and re-plans from un-advanced state and never double-transitions. (Actions-first would commit the action transitions before the CAS check, so a CAS miss would leave orphaned action writes and a retry would re-apply the transition against the already-advanced action — a double `status[]` push. See review-1 finding #1.) Events after the workflow+actions because event docs reference workflow + action IDs. Change-log last so any earlier step failing prevents an audit entry claiming a write that didn't happen.

The denormalised summary/groups on the planned workflow doc are computed from the *planned* action states, so writing the workflow before the actions is internally consistent — both come from the same Plan.

**On a replica set, steps 1–2 run inside one transaction (D11)** — workflow + actions commit atomically or not at all, which subsumes the ordering concern entirely. The ordering above is the **standalone-mongod fallback** path (no transactions available), where it is the sole correctness mechanism.

**Events go through `callApi("new-event")` and are outside the transaction boundary regardless.** The events module owns event-doc validation, type-keying, and the `display_key` projection — bypassing `new-event` and writing directly into `events` would duplicate that logic across modules. The event write also uses the community-plugin's MongoClient, not the engine's (D8/finding #2 root cause: two clients), so it *cannot* join the engine's session. Trade-off: an event write isn't rolled back if a later step (notifications, change-log) fails. The window is one step and events failing is more visible than events succeeding without notifications; acceptable for v1. Future work: thread the engine session into subroutine calls so callApi'd module endpoints can participate — a larger change tracked separately.

Partial-failure outcomes if a step throws mid-commit (the **standalone fallback** path; the transaction path rolls steps 1–2 back together):

- Workflow claim succeeds, action write fails: workflow summary/groups claim transitions the actions didn't get. Recoverable — a future submit's load reads the un-advanced actions and `planWorkflowRecompute` corrects the summary; not silently broken. On a retry of the *same* submit, the action write is re-attempted (it didn't land), so no double-transition.
- Workflow + actions succeed, events fail: the submit happened but didn't log to the timeline. Operationally bad — flag in monitoring. Authors can re-fire via a manual operational API.
- Events succeed, change-log fails: audit gap. Log loudly; the change-log insert is the last step specifically so this is the smallest possible failure mode.

### D10. Tracker recursion

`fireTrackerSubscription` becomes a loop, not a recursive function with shared engine context:

```js
async function runTrackerCascade(initialFires, baseContext) {
  // Each fire carries its own depth (chain length up the parent tree), seeded at 1.
  let pendingFires = initialFires.map((f) => ({ ...f, depth: 1 }));
  while (pendingFires.length > 0) {
    const fire = pendingFires.shift();
    if (fire.depth > MAX_DEPTH) throw new TrackerCascadeDepthError(fire);
    const levelContext = { ...baseContext, /* per-level overrides */ };
    const levelLoaded = await loadWorkflowState(levelContext, { workflowId: fire.parentWorkflowId });
    const levelPlan = await planTrackerLevel(levelLoaded, { parentActionId: fire.parentActionId, signal: fire.signal });
    const commitResult = await commitPlan(levelContext, levelPlan);
    // Children inherit depth + 1 — the guard tracks chain depth, not total fan-out.
    pendingFires.push(...levelPlan.trackerFires.map((f) => ({ ...f, depth: fire.depth + 1 })));
  }
}
```

Each level is its own load-plan-commit cycle on its own workflow. No shared in-memory state between levels. Each level's commit is independently atomic (or transactional). The `MAX_DEPTH = 10` cycle guard from today's recursive `fireTrackerSubscription` carries over, but it must track **chain depth, not loop iterations**: each fire carries a `depth` field seeded at 1 and incremented per level, so a wide-but-shallow cascade (one workflow with many tracker parents) doesn't trip the guard while a genuinely deep cycle still does. A single dequeue counter on the BFS loop would measure total fan-out (breadth), not depth, and would mis-fire on legitimate wide cascades — hence the per-fire `depth`.

This restructure is the only viable shape with load-plan-commit — recursion across workflows can't share a Plan because the Plan is per-aggregate. The good news is the per-level Plan reuses 100% of the per-Submit planner machinery; the only new piece is `planTrackerLevel`, which is a thin wrapper that emits the signal and then delegates to the same auto-unblock/recompute logic.

### D11. Transactions: conditional on replica-set detection (v1)

Mongo multi-document transactions wrap the two writes that must be atomic — **the workflow claim + the action transitions (D9 steps 1–2)** — and nothing more. The seam is clean: every Mongo helper accepts an optional `session`, and `commitPlan` is the only function that touches multiple collections.

What stays outside, and why:
- **Events** — *must* be outside: they go through `callApi("new-event")` on the community plugin's client, which can't join the engine's session (D9, finding #2).
- **Notifications and change-log** — use the engine's own client (`insertManyDocs`), so they *could* technically join, but v1 keeps the transaction minimal at the workflow+action aggregate. They run after the commit as best-effort downstream writes: a notification failure shouldn't roll back a committed submit, and change-log runs last so its only failure mode is a missing audit entry (D7/D9), never a phantom one.

Transactions require a replica set (or mongos); a standalone `mongod` can't run them. This module is open source — we control our own deployments (all replica sets) but not external consumers', who may run standalone. So v1 **detects topology and adapts**, rather than hard-requiring a replica set or deferring transactions entirely:

```js
async function commitPlan(context, plan) {
  if (!context.useTransactions) {
    // standalone fallback: workflow-first ordered writes (D9). Correct on its own —
    // the CAS gate (D15) throws before any action write on a concurrency miss.
    return commitWithoutTransaction(plan);
  }
  const session = context.mongoClient.startSession();
  try {
    // withTransaction auto-retries transient/write-conflict errors; a CAS miss inside
    // surfaces as a null findOneAndUpdate → we throw ConcurrentSubmitError → clean abort.
    return await session.withTransaction(() => commitWithSession(plan, session));
  } finally {
    await session.endSession();
  }
}
```

**Detecting the topology.** At connection init, run the `hello` command and set `context.useTransactions = true` when the result carries `setName` (replica set) or `msg: "isdbgrid"` (mongos); `false` otherwise. **Log the detected mode at startup** — never silent — so an operator debugging consistency knows which commit path is live. (`useTransactions` can also be forced off via connection config for consumers who want the ordered-writes path explicitly.)

**Why both paths stay correct, not just present.** The standalone fallback (D9 workflow-first + CAS) is fully correct on its own — finding #1's reorder is the baseline. Transactions are an *additive* atomicity upgrade on top: on a replica set, steps 1–2 commit atomically, so even the rare "workflow claim succeeds, action write fails" partial-failure (D9) can't happen. The two paths converge on the same observable outcome; the transaction path just removes the partial-failure window.

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

Sticky display still works: `plannedActionDoc.<slug>.message` is the prior value carried through unless the new cell sets it. The `$mergeObjects` clobber bug I flagged in the previous turn doesn't apply here — the planner composes the full post-commit doc in JS, where deep merging is unambiguous, and commit writes it as one `$set` of the whole subtree.

Event display render context, per dispatched event:

```js
const renderCtx = {
  user: context.user,
  action: plannedActionDoc,         // post-commit shape
  workflow: plannedWorkflowDoc,     // post-commit shape including form_data, summary, groups
  interaction: signal,              // or "submit" / etc. — the user-facing name
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
  workflow: plannedWorkflowDoc,     // post-commit shape (status pushed: started/cancelled/closed)
  interaction: signal,              // user-facing lifecycle name (started / cancelled / closed)
};
```

This matches what the lifecycle engine-default templates reference (`user.profile.name`, `workflow.workflow_type` — see "Engine entry points emit events"); nothing more is bound until a concrete template needs it. `planEventDispatch` **branches on handler/event type**: action events (`action-{interaction}`, `action-internal-mirror-{state}`) get the full action-event context; lifecycle events (`workflow-started` / `workflow-cancelled` / `workflow-closed`) get the workflow-only context. The tracker-mirror event is an action event (it has a single mirrored target action), so it uses the action-event context.

### D13. Signal validation and error model

Three places where signals can be invalid:

1. **Unknown signal name** — payload says `signal: "frobnicate"`. Planner throws at plan time. Surfaces to caller as a 400-shaped error.
2. **Unknown target** — pre-hook returns `{ actions: [{ type: "nonexistent", signal: "..." }] }`. Planner throws (today's `actions[]` behaviour for missing targets).
3. **Signal doesn't apply to current state** — payload says `signal: "approve"` against an `action-required` action. FSM table has no entry. **Engine policy:** for the user-driven current-action signal, throw (the user clicked a button that shouldn't have been available — actionable bug). For pre-hook auxiliary signals and engine cascade signals, no-op silently (the FSM's "structural safety" property; e.g. `unblock` against already-unblocked target).

The distinction is intentional: user-driven signals indicate an explicit intent that should not silently fail, while cascade signals are deliberately permissive so engine re-evaluation can fire broadly without regressing siblings.

### D14. Salvaged from Part 30

Parts of Part 30 that carry over with no architectural change, just rewired to fit the new phase model:

- **Action-doc on-disk shape.** Per-app cells spread at top level (`action.demo`, `action['app-a']`). Sticky display across transitions. `status_title` top-level. `metadata` accumulated object. New denormalised `workflow_type` and renamed `tracker.child_workflow_type` per Part 30's schema additions.
- **Engine-computed links for built-in kinds.** Now a **per-verb `links` map** per [Part 34 D7](../_completed/34-action-access-model/design.md) — `computeEngineLinks` builds `links: { view, edit, review, error }` per slug from the per-verb-isolated **kind × stage × verb** table, which supersedes Part 30 D4's compound (kind × stage × access-verbs) cells. Each cell is `null` where the slug doesn't declare the verb or the stage has no meaningful page. Per-verb *role gates* don't enter the computation — they filter which verbs the user is in (`visible_verbs`), which the UI applies on read via the static priority `edit > review > error > view`. Build-time `_module.pageId` scoping via the `entry_id` connection field. `urlQuery` carries `action_id` for simple/form, `workflow_id` for tracker.
- **Resolver shape-validation.** Status_map cell shape rules from Part 30 D9 (built-in kinds reject `link:`, custom accepts `{message?, link?}`, no coverage requirement).
- **Engine-rendered event display.** Three source layers (engine default → YAML override → pre-hook return) merged via `mergeEventOverrides`, all plain Nunjucks template strings, rendered during the plan phase. D14 of Part 30 carries.
- **Display surface fixes.** `workflow-group-overview.yaml` (renamed from `group-overview.yaml`, D16 / Part 34 D10) reads `actions_list.$.message` / `.links` (the UI applies the per-verb selection rule). Other surfaces' aggregation projections light up automatically once the engine writes the top-level fields.
- **`workflow-api.yaml` `entry_id: { _module.id: true }` wiring.** Connection schema gains `entry_id` field.
- **Engine-default event template rewrite** to plain Nunjucks string (`"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"`).

Discarded from Part 30:

- `createAction.js` / `updateAction.js` as primary call sites — replaced by planners + commit helpers.
- In-memory mirroring (handleSubmit edits 2/3/4 from Part 30) — unnecessary in the new architecture.
- The `recomputeWorkflowAfterActionWrite.js` post-write-shape composition — replaced by `planWorkflowRecompute.js`.
- Force/fetch unification in `updateAction` — `updateAction` itself goes away.
- The `$mergeObjects` engine-link composition — replaced by JS-side deep merge during planning, written as one whole-subtree `$set` at commit.
- **`action_display` payload override channel.** Authors set per-stage messages via `status_map` in YAML; that's the primary channel and it's preserved. The per-call payload override `action_display` was a speculative escape hatch with no in-repo consumer; dropped per "Build for what exists, not what might." Re-addable as a payload field + 2-line planner branch if a real use case appears.

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
- Engine throws a retryable error (e.g. `class ConcurrentSubmitError extends Error`). Caller's retry policy decides what to do; the engine itself does not auto-retry (each retry runs the pre-hook again, which may have non-idempotent side effects — author's call).

**Action writes.** Actions are bulk-written without per-doc CAS in v1. The race here is narrower than the workflow case (per-action concurrency is rare — same user submitting same action twice typically lands in same-stage no-ops via the FSM), and adding per-action CAS would force the bulk write into a loop. If contention proves real, add per-action `_id` + `updated` filters to the bulkWrite operations as a follow-up.

**Why not version field.** A monotonic `version` integer is the textbook OCC mechanism. `updated` is already on every workflow doc, already updated on every write, and serves the same role. Adding a parallel `version` doubles the per-write bookkeeping for no benefit.

**Relationship to transactions (D11).** CAS is not replaced by transactions — it works *with* them. On the transaction path, two concurrent submits writing the same workflow produce a MongoDB write conflict; `withTransaction` auto-retries, but the retry re-issues the *same planned writes* without re-planning, so the CAS filter (now stale) misses, `findOneAndUpdate` returns null, and the engine throws cleanly rather than committing stale writes. On the standalone fallback path, CAS is the sole concurrency guard. Either way the CAS filter is what converts a race into a clean `ConcurrentSubmitError`.

### D16. Access model (Part 34) — what this part implements

[Part 34](../_completed/34-action-access-model/design.md) is design-only; its engine/resolver/display changes land here. Part 34 owns the full rationale; this section records the concrete surfaces Part 38 touches.

**Access shape + resolver validation.** `access.{app_name}` is a verb→gate map (`view`/`edit`/`review`/`error` → `true | [roles]`). `makeWorkflowsConfig` validates it (`validateActionAccess`): unknown verb keys, the empty-list `[]`, the old shorthand list (`access.{app}: [view, edit]`), the removed action-wide `access.roles`, and unknown top-level `access` keys all hard-error; an app block declaring `edit`/`review`/`error` without `view` lint-warns (Part 34 D4). `notification_roles` lives at the action root, not under `access`.

**Submit-time gating.** The load phase resolves the signal's required verb (Part 34 D6 table) and rejects the submit unless `access.{current_app}.{verb}` is `true` or intersects `_user.apps.{current_app}.roles`. This is the authoritative inner gate; the central `api.roles` glob (`{entry_id}/{type}-{action}-submit`) is the coarse outer fence (Part 34 D11).

**Per-verb links.** `computeEngineLinks` writes `action.<slug>.links: { view, edit, review, error }` — per-verb-isolated cells from the kind × stage × verb table (Part 34 D7), each `null` where the slug doesn't declare the verb or the stage has no meaningful page. Per-verb *role gates* don't enter the computation; they filter which verbs the user is in, which the UI applies on read. UI selection is the static priority `edit > review > error > view`.

**`visible_verbs` query response.** `visible_verbs_filter.yaml` replaces `access_filter.yaml`: per-verb `$let`/`$or` resolution against `_user.apps.{app_name}.roles` → `$addFields visible_verbs: { view, edit, review, error }` → `$match $anyElementTrue` (drop actions with no true verb). Concrete pipeline in Part 34 D12. The same `_ref` is consumed by `get-entity-workflows`, `get-workflow-overview`, and `get-action-group-overview`.

**Emitted-id naming.** Derived per-workflow endpoints stay `{workflow_type}-{action_type}-{verb}` (pages, `makeActionPages`) and `{workflow_type}-{action_type}-{...}` (Apis, `makeWorkflowApis`) — no literal prefix; the Lowdefy build's entry-id scoping (`{entry_id}/…`) namespaces them, so `{entry_id}/{type}-*` slices a workflow type's endpoints. The `workflow-` prefix is instead carried by the module's **fixed** pages — `workflow-overview`, `workflow-group-overview`, and the shared simple-kind pages `workflow-simple-{verb}` — reserving the `workflow-*` glob space for module infrastructure, disjoint from the per-type derived endpoints (Part 34 D10). `workflow` is a reserved workflow-type name (its derived ids would collide with the fixed-page space).

**Client mirror.** Part 18's `action_role_check` populates per-verb `_state.action_allowed: { view, edit, review, error }` (Part 34 D8); page templates read the verb-specific bool. This rides along with the demo's page-template migration (Proposed change #13).

**Access drives FSM reachability (known V1 limitation).** The *presence* of the `review` verb decides whether `submit` lands `in-review` vs `done` (D4, `hasReview`), and verb presence also gates page/link emission (Part 34 D5/D7). So `access` is not a pure gate over a fixed state graph — editing it reshapes which stages are reachable. Removing a verb from a deployed action while actions sit at the stage it gates strands them (e.g. drop `review` while an action is at `in-review`: no review page, no gate, `links.review = null`, no engine remediation). The module ships no version actions or in-flight migration; consistent with the module's V1 migration stance, an author editing access on a live workflow owns any required data migration. Documented in [Part 34 D6](../_completed/34-action-access-model/design.md).

**Tasking note — the access-model work is its own task cluster.** Most of the Part 34 absorption is orthogonal to the load-plan-commit write path and should be tasked (and reviewed) as an independent block, sequenced alongside — not interleaved with — the engine rebuild. Three surfaces touch neither the FSM nor load-plan-commit and are fully independent: `visible_verbs_filter.yaml` (read-path aggregation), `validateActionAccess` (build-time resolver validation), and the `action_role_check` client component (which **implements** Part 18's amend-via-note — Part 38 is where that completed-part amendment actually lands). The write-path-coupled pieces — the submit-time access gate (load phase) and the per-verb `links` map (`computeEngineLinks`, plan phase) — stay with the rebuild because they share its surface. `r:design-task` should split these accordingly so the engine-independent surfaces don't gate on the rebuild core.

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
   ├─ per-verb access check (signal→verb, D16 / Part 34 D6), workflow-stage check
   └─ output: LoadedState { workflow, actions, workflowConfig, actionConfig, targetAction }
   │
   ▼
PRE-HOOK phase
   ├─ if no pre-hook declared → PreHookResult = { actions: [], overrides: {} }
   ├─ else → callApi(hook); validate response shape (no current-action signal redirect)
   └─ output: PreHookResult { actions[], event_overrides, form_overrides }   // current action lands per payload.signal
   │
   ▼
PLAN phase  (pure, no I/O)
   ├─ resolve current-action signal → target stage via FSM
   ├─ resolve auxiliary signals (preHookResult.actions[]) → target stages via FSM
   ├─ initial planned action transitions (current + auxiliary)
   ├─ auto-unblock fixpoint over the in-progress Plan (unblock-only; pre-hook `block` already resolved above)
   ├─ recompute groups + summary against planned actions
   ├─ check auto-complete → optional 'completed' push on workflow
   ├─ merge form_data (params.form + form_review + preHookResult.form_overrides)
   ├─ compose planned workflow doc (summary, groups, form_data, optional completed)
   ├─ for each planned action transition:
   │     - compose planned action doc (status push, fields, metadata merge)
   │     - lookup status_map[targetStage] for action's kind
   │     - render cell against planned-action-doc + metadata context
   │     - compute per-verb engine links map `{view,edit,review,error}` (built-in kinds) against planned-action-doc + entry_id (D16 / Part 34 D7)
   │     - spread rendered cell + links map into planned action doc
   ├─ build event payload (default + YAML override + pre-hook override; render against engine render context)
   ├─ build notification payloads
   ├─ build log-changes entries (before vs after for every doc touched; D7)
   └─ output: Plan { workflow, actions[], events[], notifications[], trackerFires[], changeLog[] }
   │
   ▼
COMMIT phase   (steps 1–2 wrapped in one transaction on a replica set; ordered fallback on standalone — D9/D11)
   ├─ 1. findOneAndUpdateDoc(workflows, { _id, "updated.timestamp": loadedState.workflow.updated.timestamp }, $set: plan.workflow.doc)
   │        └─ CAS claim: null return → throw ConcurrentSubmitError before any action write (D15)
   ├─ 2. bulkWriteActions(plan.actions)
   ├─ 3. for each event in plan.events: callApi('new-event', module: 'events', { _id: event_id, display, references, type, metadata })   [outside txn; community client]
   ├─ 4. insertManyDocs(notifications, plan.notifications)
   ├─ 5. insertManyDocs(<changeLog.collection, e.g. log-changes>, plan.changeLog)   [outside txn, last]
   └─ output: CommitResult { action_ids, event_ids, ... }
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
   ├─ else → callApi(post-hook) with { loadedState, plan, commitResult, trackerFires }
   └─ output: handler return payload
```

Start / Cancel / Close follow the same shape with different planners (no pre-hook for Start/Cancel/Close in v1; planner inputs differ; commit batches differ but use the same helpers). Each also dispatches its own log event during the commit phase — see "Engine entry points emit events" below.

## Engine entry points emit events

Today only `SubmitWorkflowAction` dispatches a log event. This rebuild extends event emission to every engine handler so the events timeline is a complete audit trail of workflow lifecycle changes — one `event_id` per handler invocation, anchoring that invocation's events-timeline entry.

| Handler | Event `type` | Engine-default title (plain Nunjucks string) |
|---|---|---|
| `StartWorkflow` | `workflow-started` | `{{ user.profile.name }} started {{ workflow.workflow_type }}` |
| `SubmitWorkflowAction` | `action-{interaction}` (unchanged) | `{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}` |
| `CancelWorkflow` | `workflow-cancelled` | `{{ user.profile.name }} cancelled {{ workflow.workflow_type }}` |
| `CloseWorkflow` | `workflow-closed` | `{{ user.profile.name }} closed {{ workflow.workflow_type }}` |
| Tracker-mirror commit (per cascade level) | `action-internal-mirror-{state}` | `Tracker mirrored child {{ status_after }}` (system event; lower-prominence in the timeline) |

One `event_id` per invocation, used as the dispatched event doc's `_id`. (Tracker-mirror commits per cascade level each generate their own `event_id`.) The `log-changes` audit (D7) follows the community plugin's schema and is not keyed by `event_id`.

Apps that subscribe to events (notifications, external syncs) will start seeing the new event types. App-side handling: either explicitly route the new types or ignore them. The notifications module's subscription config is the primary integration point — Part 8's contract is unaffected, but apps will want to opt into (or out of) the new types. Demo's notification config gets the necessary update as part of this part's demo migration.

## Schema additions

### Change-log: no new collection

The engine reuses the community plugin's `log-changes` collection and entry schema (D7), configured by the existing `changeLog: { collection, meta }` property on the WorkflowAPI connection. No new collection, no new schema. Indexing the `log-changes` collection is the owning app's concern (as it already is for community-plugin and events-module writes), not this part.

### Action and workflow doc shapes

No additions beyond what Part 30 already specified (see § D14 Salvaged), with two access-model touches from Part 34: the per-app cell now carries a per-verb `links` map (`<slug>.links: { view, edit, review, error }`) instead of Part 30's single `<slug>.link` (D16); and the denormalised `access` on the action doc follows Part 34's verb→gate map shape (`access.{app}.{verb}: true | [roles]`), consumed by `visible_verbs_filter.yaml`. This part doesn't otherwise change the docs; it changes how they're produced.

### Connection schema (`WorkflowAPI/schema.js`)

- `entry_id` (string, required) — per Part 30. Wired from `_module.id: true` in `workflow-api.yaml`.
- `changeLog: { collection, meta }` — **kept** (already present). Previously forwarded to the community plugin so its auto-changeLog logged engine writes; now consumed by the engine's native `log-changes` writer (D7), since engine writes bypass the plugin. Same shape, same behaviour from the app's perspective. **The field description is rewritten**: the current "forwarded to the community-plugin MongoDBCollection handlers … automatically" text is now false (engine writes bypass the plugin — D8), so it's updated to describe native engine consumption.
- `actionsEnum[].priority` **description rewrite** — the current "load-bearing — the engine compares priorities in the priority-rule check in SubmitWorkflowAction" is made false by this part (the priority-rule check is removed; engine D4 makes priority display-only). Rewrite to: "display-only (ordering in pickers / visualizations); the engine no longer consults it for transition legality." The field itself stays required.

### Module manifest (`modules/workflows/module.lowdefy.yaml`)

- `app_name` var description update per Part 30.

## Files changed

### New — `plugins/modules-mongodb-plugins/src/connections/mongo/`

The Mongo driver layer. Engine-internal write paths only.

- `findOneAndUpdateDoc.js` — wraps native `findOneAndUpdate({ returnDocument: 'after' })`.
- `bulkWriteActions.js` — wraps native `bulkWrite` against the actions collection.
- `insertOneDoc.js` — wraps native `insertOne`.
- `insertManyDocs.js` — wraps native `insertMany`.
- `findDocs.js` — wraps native `find().toArray()`.
- `getMongoDb.js` — extracts the raw `Db` reference from the plugin context.
- `*.test.js` for each — small unit tests against an in-memory or test Mongo.

### New — `plugins/modules-mongodb-plugins/src/connections/shared/phases/`

Phase functions, one file per phase, with sub-files for planners.

- `loadWorkflowState.js` — reads workflow + actions, resolves configs, runs invariant checks.
- `invokePreHook.js` — wraps `callApi` to the pre-hook routine. Returns `PreHookResult`.
- `invokePostHook.js` — wraps `callApi` to the post-hook routine. Receives `LoadedState` + `Plan` + `CommitResult`.
- `commitPlan.js` — single commit-phase entry point; sequences the writes per D9.
- `planners/` — pure planning functions:
  - `planActionTransition.js` — given an action + signal + payload + context, returns the planned post-commit action doc + change-log delta. **Field write — generic passthrough.** This planner is the home of today's `updateAction` `...fields` spread: it sets `payload.fields` onto the planned action doc (the rebuilt equivalent of `$set: { ...fields }`). It is **kind-agnostic** and does not name `assignees` / `due_date` / `description` — it passes the `fields` bag through verbatim, exactly as today. This is the behavior-preserving baseline; the universal-fields surface ([Part 24](../24-universal-fields/design.md)) layers a kind-based rule on top (write the universal fields only for `kind: simple`; `kind: form` owns them via its own operation). Part 38 itself stays ignorant of universal fields — it only carries the generic passthrough forward so no submit (notably `kind: simple`, whose submission content *is* those fields) regresses before Part 24 lands.
  - `planAutoUnblock.js` — fixpoint loop over the in-progress action plan; emits `unblock` signals via the FSM (engine cascades are unblock-only; pre-hook `block` entries are planned by `planActionTransition` from `preHookResult.actions[]`, not here).
  - `planWorkflowRecompute.js` — composes the planned post-commit workflow doc (summary, groups, completed push).
  - `planFormDataMerge.js` — merges form + form_review + form_overrides into the planned workflow's form_data.
  - `planEventDispatch.js` — composes + renders the event payload(s) for a submit.
  - `planNotifications.js` — composes notification payloads.
  - `planChangeLog.js` — builds change-log deltas from before/after pairs accumulated during planning.
  - `*.test.js` for each — unit tests on pure functions.

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
- `WorkflowAPI/StartWorkflow/StartWorkflow.js` — restructured: load (workflowConfig + parent action if any), plan (workflow doc + initial action docs + optional parent-tracker transition), commit, optional tracker cascade (the parent-tracker push). No pre-hook in v1; could add later.
- `WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — load (workflow + all actions), plan (mark all non-terminal actions `not-required` via FSM signal `internal_cancel_action`, recompute, push workflow `cancelled`), commit, tracker cascade.
- `WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — same shape as Cancel.
- `WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — restructured into the loop in D10. Each iteration calls into the same phases.

### Deleted

- `shared/createAction.js` — replaced by `planActionTransition.js` (which handles both insert and update operations).
- `shared/updateAction.js` — replaced by `planActionTransition.js`.
- `shared/recomputeWorkflowAfterActionWrite.js` — replaced by `planWorkflowRecompute.js`.
- `SubmitWorkflowAction/utils/shouldUpdate.js` — priority rule logic; obsolete with FSM.
- `SubmitWorkflowAction/resolveTargetStatus.js` — interaction → status table; obsolete with FSM. (Renamed `task`→`simple` by [Part 35](../_completed/35-rename-task-kind-to-simple/design.md); this part sequences after Part 35 and deletes the file outright. The action kind is `simple` throughout this design, per state-machine.md and Part 35.)
- `SubmitWorkflowAction/computeAutoUnblocks.js` — replaced by `planAutoUnblock.js` (signal-emitting, not status-emitting).
- `SubmitWorkflowAction/reevaluateBlockedActions.js` — folded into `planAutoUnblock.js`.
- `SubmitWorkflowAction/utils/getCurrentAction.js` — load phase reads workflow + all actions in one call; no per-action targeted fetch needed.
- `SubmitWorkflowAction/dispatchLogEvent.js` (the dispatch part) — folded into commit phase. The `buildDefaultLogEventPayload` template constants survive in `planEventDispatch.js`.

### Modified — display surfaces (carried from Part 30)

- `modules/workflows/pages/group-overview.yaml` → **renamed** `workflow-group-overview.yaml` (page `id` `group-overview` → `workflow-group-overview`; D16 / Part 34 D10), and switch to reading `actions_list.$.message` / `.links` (UI applies the per-verb selection rule).
- `modules/workflows/api/stages/access_filter.yaml` → **replaced by** `visible_verbs_filter.yaml` (per-verb `$let`/`$or` resolution → `$addFields visible_verbs` → `$match $anyElementTrue`; D16 / Part 34 D12).
- `modules/workflows/api/get-entity-workflows.yaml`, `api/get-workflow-overview.yaml`, `api/get-action-group-overview.yaml` — swap the access-stage `_ref` from `access_filter.yaml` to `visible_verbs_filter.yaml`; their `message` / `links` projections light up automatically once the engine writes the top-level fields.
- `modules/workflows/pages/simple-view.yaml` / `simple-edit.yaml` / `simple-review.yaml` → **renamed** `workflow-simple-view/edit/review.yaml` (page `id` gains the `workflow-` prefix; D16 / Part 34 D10). Update every `_module.pageId: simple-*` reference (inside `simple-edit`/`simple-review`, and in `computeEngineLinks`'s simple-kind link table) and the `pages:` `_ref` paths in `module.lowdefy.yaml`. `workflow-overview.yaml` is already conformant (no rename).

### Modified — resolver + manifest (carried from Part 30)

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — add `validateStatusMapCells` per Part 30 D9, and `validateActionAccess` per Part 34 (verb-key whitelist; gate `true | [roles]`; reject empty-list, shorthand array, action-wide `access.roles`, unknown top-level `access` keys; lint-warn on `edit`/`review`/`error` without `view`).
- `modules/workflows/resolvers/makeActionPages.js` — read declared verbs from the `access.{app}` **map keys** (not the old verb array); emitted page ids stay `{workflow_type}-{action_type}-{verb}` (no `workflow-` prefix; entry scoping handles glob slicing — D16 / Part 34 D10).
- `modules/workflows/connections/workflow-api.yaml` — add `entry_id: { _module.id: true }`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — add `entry_id` field; rewrite the now-false `actionsEnum[].priority` description (display-only, no longer the priority-rule check) and the `changeLog` description (consumed natively by the engine, not forwarded to the community plugin) — see "Connection schema" above.
- `modules/workflows/module.lowdefy.yaml` — update `app_name` description.

### Modified — API + payload surfaces

- `modules/workflows/resolvers/makeWorkflowApis.js` — emitted-api payload mapping passes `signal`, `metadata`, `form`, `form_review`, `event_overrides`, hooks. Drops `force`. Emitted Api ids stay `{workflow_type}-{action_type}-{...}` (no `workflow-` prefix; entry-scoped — D16 / Part 34 D10).
- `modules/workflows/api/start-workflow.yaml` — add `metadata` to payload (Part 30 carry-over). Document `signal` as the replacement for the implicit "what status do we start in" path.
- Pre-hook payload shape (`buildHookPayload.js`) — unchanged. Pre-hook **return** shape changes: `{ type, status }` → `{ type, signal }` per state-machine.md.

### Modified — demo app (in scope; see Proposed change item 13)

Demo migration ships with this part — without it, there is no end-to-end exercise of the new architecture.

- `apps/demo/modules/workflows/workflow_config/*.yaml` — strip `force: true`; convert pre-hook returns from `{ type, status }` to `{ type, signal }`; convert page-template button bars to signal-emitting form per state-machine.md; migrate every action's `access` to Part 34's per-verb verb→gate map (D16). Strip authored `link:` from cells per Part 30's existing demo migration item.
- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — migrate `access.demo` from the old nested `{ roles, verbs }` shape to the Part 34 verb→gate map (e.g. `demo: { view: [admin] }`).
- `action_role_check` component (Part 18) — populate per-verb `_state.action_allowed: { view, edit, review, error }`; page templates read the verb-specific bool (D16 / Part 34 D8).
- Demo's notification config — add subscriptions or filters for the new `workflow-started` / `workflow-cancelled` / `workflow-closed` event types as appropriate. The default decision is "ignore unless an app explicitly wires them" — demo can show one notification wired up to demonstrate.
- Engine-internal apps with custom workflow configs (out of repo) — migration documented separately; the in-repo demo is the canonical example.

## Worked example

**Workflow:** an installation workflow with three actions in one group:

```yaml
type: installation
action_groups:
  - id: install
    actions:
      - { type: install-step, kind: simple, action_group: install }
      - { type: install-verify, kind: form, action_group: install, blocked_by: [install-step] }
      - { type: install-cleanup, kind: simple, action_group: install, blocked_by: [install-step] }
```

State before submit:

- `install-step`: `action-required`
- `install-verify`: `blocked` (blocked_by install-step)
- `install-cleanup`: `blocked` (blocked_by install-step)
- Workflow summary: `{ done: 0, not_required: 0, total: 3 }`

**Caller submits:** `signal: submit` against `install-step` with `metadata: { physical_id: "D-42" }`. `install-step` declares no `review` verb in `access` (no app declares it), so `submit` lands `done` (the action-global `hasReview` rule from D4, identical for form and simple kinds). No `target_status` — the v0 simple selector is gone (state-machine.md review #6).

**Load phase:**

```js
loadedState = {
  workflow: {
    _id: "w1",
    summary: { done: 0, not_required: 0, total: 3 },
    groups: [{ id: "install", status: "in-progress" }],
    form_data: {},
    /* ... */
  },
  actions: [
    { _id: "a-step", type: "install-step", kind: "simple", status: [{ stage: "action-required" }], blocked_by: [] },
    { _id: "a-verify", type: "install-verify", kind: "form", status: [{ stage: "blocked" }], blocked_by: ["install-step"] },
    { _id: "a-cleanup", type: "install-cleanup", kind: "simple", status: [{ stage: "blocked" }], blocked_by: ["install-step"] },
  ],
  targetAction: <ref to a-step>,
};
```

**Pre-hook phase:** no pre-hook declared. `PreHookResult = { actions: [], overrides: {} }`. The current-action signal is `payload.signal` (`submit`), not a pre-hook output.

**Plan phase:**

1. Resolve current-action signal: `FSM["simple"]["action-required"]["submit"]` → "in-review or done"; `hasReview(actionConfig)` is false (no app declares `review`) → `done`.
2. Initial planned transitions: `[ { action: a-step, target: "done", fields: {...}, metadata: { physical_id: "D-42" } } ]`.
3. Auto-unblock fixpoint over planned actions:
   - a-verify.blocked_by = ["install-step"]; planned install-step is "done" → terminal → emit `unblock` against a-verify.
   - FSM["form"]["blocked"]["unblock"] → `action-required`. Add to planned transitions.
   - a-cleanup.blocked_by = ["install-step"]; same → `unblock` → `action-required`.
   - Next iteration: planned transitions are a-step→done, a-verify→action-required, a-cleanup→action-required. No further unblocks (verify/cleanup don't accept unblock from action-required).
4. Compose planned action docs:
   - a-step planned doc: status prepended with `{ stage: "done", event_id: e1, created: now }`, metadata: `{ physical_id: "D-42" }`, rendered cell for `done` stage (e.g. `demo.message: "Installed D-42."`), per-verb links map `demo.links: { view: <workflow-simple-view>, edit: null, review: null, error: null }` (the `done` stage exposes only `view`; D16 / Part 34 D7).
   - a-verify planned doc (kind `form` → derived pages): status prepended with `{ stage: "action-required", event_id: e1, created: now }`, sticky message from prior stage (none — was blocked, no cell), per-verb links map `demo.links: { view: <installation-install-verify-view>, edit: <installation-install-verify-edit>, review: null, error: null }`.
   - a-cleanup planned doc (kind `simple` → fixed pages): status prepended, per-verb links map `demo.links: { view: <workflow-simple-view>, edit: <workflow-simple-edit>, review: null, error: null }`.
5. Recompute groups: install group has 1 done + 2 action-required → "in-progress" (unchanged).
6. Recompute summary: `{ done: 1, not_required: 0, total: 3 }`.
7. Check auto-complete: no — `total !== done + not_required`. No completed push.
8. Merge form_data: `submitted_form = { physical_id: "D-42" }`. Planned workflow.form_data = `{ "install-step": { physical_id: "D-42" } }`.
9. Compose planned workflow doc with summary, groups, form_data.
10. Build event payload: render `display.{appName}.title` against `{ user, action: a-step-planned-doc, workflow: planned-workflow-doc, interaction: "submit", status_before: "action-required", status_after: "done", submitted_form }`. Engine default renders to e.g. `"Sam marked install-step as done"`.
11. Build notification payloads (per Part 8 / notifications module).
12. Build log-changes entries (community schema, D7): one per mutated doc — a-step, a-verify, a-cleanup, workflow — each with before (loaded) / after (planned). The event write logs itself via the events module's own changeLog config; the engine doesn't double-log it.

**Commit phase:**

```
// steps 1–2 in one transaction on a replica set; ordered fallback on standalone (D9/D11)
// 1. workflow claim first — CAS gate throws before any action write on a concurrency miss
findOneAndUpdateDoc(workflows,
  { _id: "w1", "updated.timestamp": <loaded w1 updated.timestamp> },
  { $set: <workflow-planned-doc minus _id> })   // null return → throw ConcurrentSubmitError
// 2. actions
bulkWriteActions([
  { updateOne: { filter: {_id: "a-step"}, update: {$set: <a-step-planned-doc minus _id>} } },
  { updateOne: { filter: {_id: "a-verify"}, update: {$set: <a-verify-planned-doc minus _id>} } },
  { updateOne: { filter: {_id: "a-cleanup"}, update: {$set: <a-cleanup-planned-doc minus _id>} } },
])
// 3–5. outside the transaction
callApi("new-event", events, { _id: e1, ...eventPayload })
insertManyDocs(notifications, [...])
insertManyDocs("log-changes", [...])   // community-schema entries built from the Plan
```

**Tracker cascade:** none (workflow didn't push `completed`).

**Post-hook:** none declared. Handler returns `{ action_ids: ["a-step", "a-verify", "a-cleanup"], event_id: e1, ... }`.

Renders all happened in step 4 + step 10 of planning, against the planned post-commit shape. No re-fetch. No in-memory mirroring. Adding a sixth or seventh write to the commit phase later doesn't reopen any staleness window — render context is the Plan.

## Test strategy

Test coverage falls into several bands. If the section grows beyond what fits comfortably below, split into `test-strategy.md` alongside this design.

**Unit tests — pure phase / planner functions.** Every file under `shared/phases/planners/` is pure. Inputs are JS objects, outputs are JS objects. One test file per planner:

- `planActionTransition.test.js` — input `{ action, signal, payload, actionConfig, plannedWorkflowDoc }`; verify output planned-action doc shape (status push, fields set, rendered cell spread, engine links computed, metadata merged, change-log delta). Per-kind variants. Sticky display assertions. FSM no-op signal returns null entry.
- `planAutoUnblock.test.js` — fixpoint termination (linear actions terminate in 1 iter; chained unblocks terminate; cycles don't deadlock thanks to FSM structural safety); `unblock` emission against the right targets; asserts the engine never auto-emits `block` on dep regression (unblock-only cascade); the empty case.
- `planWorkflowRecompute.test.js` — summary/groups recompute correctness; `shouldPushCompleted` trigger conditions; `cancelled`/`completed` mutually exclusive.
- `planFormDataMerge.test.js` — keyed vs unkeyed; merge order (params.form → params.form_review → preHookResult.form_overrides); shape preservation.
- `planEventDispatch.test.js` — engine default rendering; YAML override layering; pre-hook override layering; three-source merge order; **two render-context shapes asserted separately** — the action-event context (`user`, `action`, `workflow`, `interaction`, `status_before`, `status_after`, `submitted_form`) for `action-{interaction}` + tracker-mirror, and the workflow-lifecycle context (`user`, `workflow`, `interaction` only) for `workflow-started` / `workflow-cancelled` / `workflow-closed`; per-event-type defaults; assert `planEventDispatch` branches on handler/event type to pick the context.
- `planChangeLog.test.js` — one `log-changes` entry per affected doc, community schema (`type`, `before`, `after`, `meta`, request-context fields); before from loaded doc, after from planned doc; `meta` resolved from `changeLog.meta`; opt-out when `changeLog` unconfigured.

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
- Cancel preserves `done` actions (their status stays `done`; cancelled workflow status pushes to workflow doc).
- **Submit-time per-verb gate (D16 / Part 34 D5):** a user whose roles don't satisfy `access.{current_app}.{signal-verb}` is rejected with a structured error; a satisfying user (or `true` gate) passes. Covers `submit`↔`edit`, `approve`/`request_changes`↔`review`, `resolve_error`↔`error`.
- **Action-global review-stage resolution (D4 / `hasReview`):** a multi-app action with `review` declared in one app and absent in another — a `submit` from the review-declaring app and a `submit` from the other app land the **same** stage (`in-review`), confirming the split reads `hasReview` app-global, not the submitting app's access.
- **Per-verb `links` map (Part 34 D7):** each transition writes `<slug>.links: { view, edit, review, error }` with `null` for undeclared verbs / stages with no page; the UI priority `edit > review > error > view` lands the right page given the user's `visible_verbs`.
- **`visible_verbs` filter (Part 34 D12):** `get-entity-workflows` returns the four-key bag per action; an action with no true verb for the user drops out of the response.

**Resolver validation (build-time).** `makeWorkflowsConfig.test.js` — `validateActionAccess` accepts the verb→gate map, and rejects the empty-list, shorthand array, action-wide `access.roles`, and unknown top-level keys with clear messages; lint-warns on `edit`/`review`/`error` without `view`. `makeActionPages.test.js` / `makeWorkflowApis.test.js` — emitted derived ids are `{workflow_type}-{action_type}-…` (unprefixed, entry-scoped), pages are emitted from the `access.{app}` map keys, and a workflow type named `workflow` is rejected (reserved — Part 34 D10).

**End-to-end — demo app.** The migrated demo's workflows exercise the engine via real Lowdefy YAML CallApi flows. One Playwright-style smoke test per demo workflow: start the workflow, transition through all states, verify display surfaces render the expected messages. This is the integration test that catches things unit + integration tests miss (resolver wiring, build-time validation, callApi boundaries, page rendering of action.{appName}.message).

## Open questions

Resolve before tasking (or accept-and-defer with a tracking note in the relevant task).

**Q1. Plan shape: whole doc vs delta.** D3 notes the planner can either compose the whole post-commit doc (planner does the work; commit `$set`s the whole thing) or compose a delta (planner identifies changed fields; commit `$set`s only those). Same on-disk effect for the workflow case (one update). Different testability: whole-doc tests assert against complete shapes; delta tests assert against the set of changed paths. Whole-doc is easier to reason about for renders (templates see one cohesive object); delta is closer to MongoDB's `$set` idiom and produces smaller writes. **Lean: whole-doc** for workflow + actions; revisit if write size becomes an issue.

**Q2. Should the planner throw on FSM no-op for user-driven current-action signal, or return a `no-op` plan result that the API turns into a 200-with-noop response?** D13 says throw. Throw is simpler and surfaces real bugs (user clicked a button the page shouldn't have surfaced). Soft no-op is friendlier to race conditions where the action transitioned in another tab between page load and click. Lean: throw, with a 200-with-noop response only if real user-experience pain emerges.

**Q3. Sticky display for slugs leaving `access`.** Confirmed in conversation: slugs that leave an action's `access` block don't get their existing `.message` / `.links` cleared. The doc carries stale values; display surfaces don't project them (they only read `actions_list.$.{app_name}.message` / `.links` for the current app's slug, and `visible_verbs` is recomputed per query so a departed slug yields no true verb). If the slug re-enters `access` later, its stale message reappears unless a new cell writes over it. Acceptable for v1 — document the behaviour, don't add cleanup.

**Q4. Recursive submits via pre-hooks.** A pre-hook can call back into the engine (`submit-workflow-action` for a different action). The inner submit is its own load-plan-commit cycle. If it writes to a workflow the outer planner has already loaded, the outer's plan is stale by commit time. Two options: (a) detect and throw (pre-hook callbacks blocked); (b) document the constraint and let CAS catch real conflicts (outer commit will fail with ConcurrentSubmitError, caller retries). Lean: (b) — CAS already covers it; explicit detection adds plumbing. Document the gotcha.

**Q5. Event emission for Cancel/Close — workflow-level only, or also per-action?** Cancel sweeps every non-terminal action to `not-required`. Today (no events at all) it's silent. Under the rebuild, Cancel emits one `workflow-cancelled` event for the workflow lifecycle change. Should each swept action also emit an `action-internal-cancel-action` event? Pro: complete audit trail of every state change. Con: a workflow with 50 actions emits 51 events per cancel. Lean: workflow-level only for v1; the change-log captures per-action mechanics for forensic audit. Author of a notification config wanting per-action visibility can derive from change-log if needed.

**Q6. `form_data` write semantics on the workflow doc — what merge rule replaces the imperative per-handler writes?** (Raised by review-2 #2; the supersession of engine D5 is real but the underlying question is bigger than D5's stated rationale.)

D3/D9/Q1 commit the workflow as a **whole-doc `$set`** of `plan.workflow.doc`. Engine D5 instead specs form_data as **per-field `$set` on dot-notation paths**, justified there by *concurrency* ("so concurrent edits on different fields of the same action don't clobber each other"). That concurrency framing is at least partly a mis-attribution. The real, load-bearing requirement is visible in the reference project (`apps/shared/workflow_config/device-installation`, prod stores form_data as `ticket.workflows.{action}`):

- **Submitter** (`devices/api/routines/client_save_site_check_changes.yaml`) writes the *whole* action namespace: `$set { "workflows.site-check": _object.assign(form, {site_details}) }`.
- **Reviewer** (`device-installation-site-check-approve.yaml`) writes *only one sub-key*, deliberately scoped: `$set { "workflows.site-check.validation": _object.assign(form.validation, {created}) }`.

So one action's form_data accumulates across **multiple submits of different shapes** (submit → approve, draft → draft → submit, changes-required → resubmit), and a later write must not wipe a sibling sub-key an earlier write set. This is a *sequential* requirement, independent of concurrency. The imperative model met it by letting each handler choose its own write shape per context — a flexibility a single declarative merge rule struggles to cover.

Whole-doc `$set` *can* satisfy the sequential requirement **iff** `planFormDataMerge` deep-merges submitted fields onto the **loaded** `form_data.{action}` sub-object (not replacing it), since the loaded sibling sub-keys are already in the Plan's base. The concurrency case (two writers, different fields of the same workflow) genuinely changes — it's now CAS-serialized (one wins, one retries, D15), which is **accepted**. The open parts are the merge rule itself and its edge cases:

1. **Merge vs replace granularity.** Candidate rule: deep-merge nested objects, replace arrays + scalars whole. Arrays *must* replace (`form.access_control[]` is an array; element-wise merge of differing-length arrays is garbage). But a single global rule may not fit every handler — prod's submitter intentionally *replaces* its namespace while the reviewer *merges* one sub-key. A blanket deep-merge changes the submitter's semantics.
2. **Removal-by-omission.** prod's submitter (whole-namespace overwrite) drops a field when the payload omits it; deep-merge keeps stale values until overwritten. Concretely diverges in `changes-required → resubmit → re-review`, where deep-merge preserves the prior `validation` block that prod's overwrite would wipe. Decide whether v1 supports clearing, or documents "set-only, persists until overwritten."
3. **Per-channel shapes.** Whether submitter (`form`) and reviewer (`form_review`) should follow *different* write semantics (replace vs scoped-merge) to mirror the imperative handlers, or whether one uniform rule is acceptable for v1.
4. **Bookkeeping.** Once decided: reframe engine D5's "Write semantics" justification from concurrency to "multi-stage/multi-shape accumulation within an action namespace," and annotate that Part 38 implements it via whole-doc `$set` + the chosen merge + CAS. (review-2 #2's suggested fix, now subordinate to the merge-rule decision.)

Verified evidence is in this design's review-2 #2 discussion; no further code archaeology needed to decide — it's a design-judgement call on which behaviors to preserve.

## Non-goals

- **In-flight action-doc backfill.** The rebuilt engine reads the per-verb `<slug>.links` map (Part 34 D7) and the renamed fixed-page ids (D16 / Part 34 D10); pre-rebuild action docs carry the old singular `<slug>.link` and stale `pageId`s. No migration backfills existing action docs — an action already at a terminal stage keeps its old shape and renders no link affordance. This is acceptable because there are **no shipped workflows** (greenfield), and is consistent with the module's V1 migration stance (no version actions; an author with live action docs writes their own data migration — see D16 / Part 34 D6). The demo ships no seeded action docs (it carries no seed/fixture files — action docs are created at runtime by starting a workflow), so there is nothing to backfill; a developer with stale local action docs from a prior build just re-runs the workflow.
- **`notification_roles` consumer wiring / role-based fan-out.** `notification_roles` is authored config at the action root (Part 34 D9) but is consumed nowhere in current code, and the engine does **not** propagate it onto the event. This part does not wire it: `planEventDispatch` builds the event from the references/metadata it already composes, and recipient fan-out stays the notifications module's concern via `send_routine`. The whole model is a rethink — deferred to [Part 41 — Notification-roles model](../41-notification-roles-model/design.md).
- **Threading the engine transaction into callApi'd subroutines** (so `new-event` / notification writes can join the workflow+action transaction). v1 scopes the transaction to workflow + action writes only (D9/D11); extending it across the callApi boundary is a larger, separately-tracked change.
- **Field-diff storage for change-log.** The engine writes whole before/after docs (the community plugin's behaviour); field-diff is a future optimization for the `log-changes` collection owner, not this part.
- **Rollback API.** Out of scope; the `log-changes` before/after shape supports a future inverse-apply tool, but nothing engine-specific is built here.
- **Operational-event signals** (`due_date_passed`, scheduled triggers). Per state-machine.md non-goals.
- **Author-overridable FSM tables.** v1 ships per-kind tables engine-locked, per state-machine.md.
- **Custom statuses.** Eight-status enum stays fixed per critique § 7 / state-machine.md.
- **Engine-specific change-log fields** (`commit_id`, `source`, rollback grouping). The engine matches the community `log-changes` schema exactly; no bespoke audit fields in v1.
- **`action_display` per-call payload override.** YAML `status_map` is the author channel for per-stage messages; no consumer in this repo asks for a per-call override. Re-addable if a real use case appears.
- **Migrating apps outside this repo to the new payload shape.** The in-repo demo migrates with this part (Proposed change #13); external apps get a separate migration doc.

## Related

- [Part 34 — Action access model](../_completed/34-action-access-model/design.md) — the per-app per-verb access contract this part implements (per-verb `links` map, `visible_verbs`, signal→verb submit gating, emitted-id naming + fixed-page `workflow-` prefix, resolver validation). Design-only; Part 38 is its implementation vehicle.
- [Part 30 — Engine-managed display (rejected)](../_rejected/30-status-map-rendering/design.md) — the rejected predecessor. On-disk contract carries over; the rest is rebuilt.
- [state-machine.md](../../../workflows-module-concept/state-machine/design.md) — concept-level FSM model.
- [engine/design.md](../../../workflows-module-concept/engine/design.md) — concept-level engine surface (Decision 4 updated separately).
- [submit-pipeline/design.md](../../../workflows-module-concept/submit-pipeline/design.md) — concept-level submit lifecycle (Decision 3 updated separately).
- [Part 28 — Custom action kind](../_next/28-custom-action-kind/design.md) — `kind: custom` author-driven link authoring; the planner handles it via Part 30's carried-over sentinel-substitution rule.
- [Part 32 — Drop static interactions overrides](../_completed/32-drop-static-overrides/design.md) — adjacent topic on event_overrides channel; no shared edits.
- [Part 37 — Actions collection indexes](../_completed/37-actions-collection-indexes/design.md) — index migration pattern (the engine adds no new collection, so no change-log index work here).
- [`docs/idioms.md` § Event display](../../../../docs/idioms.md#event-display) — the cross-repo event_display idiom the engine path conforms to (plain Nunjucks strings).
