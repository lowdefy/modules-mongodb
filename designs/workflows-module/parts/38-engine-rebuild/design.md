# Part 38 — Engine rebuild: FSM + load-plan-commit

**Layer:** engine handlers + shared write helpers + Mongo driver layer + audit log. **Size:** XL. **Repo:** `plugins/modules-mongodb-plugins/src/connections/`, `modules/workflows/`.

**Prerequisite.** Concept-level reconciliation lands first: [`state-machine`](../../../workflows-module-concept/state-machine/design.md) becomes the authority for transition resolution, with [`engine`](../../../workflows-module-concept/engine/design.md) Decision 4 and [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) Decision 3 citing it. This implementation design assumes those edits are settled.

**Supersedes** [Part 30 — Engine-managed display](../30-status-map-rendering/design.md). Part 30 is moved to `_rejected/` with a README pointing here. The on-disk contract Part 30 established (top-level per-app keys on action docs, sticky display, engine-computed links for built-in kinds, engine-rendered event display) is the right contract — Part 30's mistake was layering it onto the existing handleSubmit shape, which couples render context to mutable handler state and produces a class of staleness bugs that surface review after review (see Part 30 reviews 5 + 6). This part keeps Part 30's contract and rebuilds the API beneath it.

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
2. **Signals replace the priority rule + `force: true`.** FSM tables per action kind (form/task/tracker) drive transition resolution. Engine-internal call sites emit named `internal_*` signals. Pre-hook returns shift from `{ type, status }` to `{ type, signal }`. Per state-machine.md.
3. **One in-memory Plan object accumulates every consequence of a submit.** Per-action transitions (signal resolved → new stage + rendered cell + computed links + fields + merged metadata), workflow changes (summary, groups, form_data, optional `completed` push), the event payload (rendered against the planned post-state), notification payloads. Plan is purely additive — actions/workflow/events are written from the Plan; nothing reads back from Mongo during plan.
4. **Render-against-planned-state replaces render-on-write.** Part 30's action-doc display contract (rendered cell + engine links spread at top level of the action doc, sticky across transitions) is unchanged on disk. The difference is *when* the render happens: during the plan phase, against the doc shape the commit phase will write. There is no "pre-write doc" vs "post-write doc" gap because the Plan is the only source of truth for both render and commit.
5. **Engine writes go through new shared helpers using the native Mongo driver.** `findOneAndUpdate({ returnDocument: "after" })` for single-doc writes that the caller needs back; `bulkWrite` for batched action transitions. The community-plugin `MongoDBUpdateOne` / `MongoDBUpdateMany` is replaced for engine-internal write paths; the plugin stays in use for app-side YAML CallApi requests.
6. **Audit change-log is a first-class output of the commit phase.** New `change_log` collection. Every engine commit writes a change-log entry capturing the before/after snapshot of every affected doc (action, workflow). Authored separately from the user-facing `events` collection (events are the timeline; change-log is the rollback-grade audit).
7. **Pre-hooks are read-only with respect to the engine's atomicity boundary.** Pre-hooks may do their own callApi/MongoDB work for external coordination, but the engine's plan-then-commit treats pre-hook returns purely as input. Writes the pre-hook performs are independent of the engine's commit; this is a deliberate contract, documented for authors.
8. **Tracker recursion is its own load-plan-commit cycle per level.** `fireTrackerSubscription` becomes a loop that, for each parent workflow up the chain, runs the same four phases on that parent workflow. No shared in-memory state between levels; each level is independently atomic.
9. **`shared/` reorganizes around the phase model.** `createAction.js` / `updateAction.js` go away as primary call sites. Replaced by: `loadWorkflowState.js` (read phase), planners (`planActionTransition.js`, `planWorkflowRecompute.js`, `planEventDispatch.js`), `commitPlan.js` (write phase), and Mongo-driver helpers (`mongo/findOneAndUpdateDoc.js`, `mongo/bulkWriteActions.js`, `mongo/insertOneDoc.js`).
10. **Salvaged from Part 30 unchanged:** the on-disk action-doc shape (per-app cells spread at top level, sticky display, `status_title`, `metadata`); engine-computed links for built-in kinds with the `entry_id`-scoped pageId mechanic; the per-kind link table (kind × stage × access verbs); the resolver shape-validator for status_map cells; caller-supplied `action_display` payload field; engine-rendered event display with the fixed render context; display-surface fixes (group-overview reads `actions_list.$.message` / `.link`); the engine-default event template rewrite to plain Nunjucks strings; the workflow-api connection `entry_id` wiring; the resolver `app_name` var description update.

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

**Load phase.** Input: handler context (params, user, connection). Output: a `LoadedState` object containing the workflow doc, all action docs, the workflowConfig, the actionConfig for the target action (Submit only — Start/Cancel/Close operate on the whole workflow). Performs N reads (workflow + actions for the target workflow; for Submit, also the target action; hooks haven't run yet). Throws if state is missing or invalid (workflow not found, action not found, role check fails, workflow stage doesn't accept submissions). After load returns, no further reads happen until the next load (the tracker-recursion next-level load).

**Pre-hook phase.** Input: `LoadedState` + caller payload. Output: `PreHookResult` containing signal redirects, auxiliary signals, form_overrides, event_overrides, action_display overrides. Single `callApi` to the hook routine. Pure consumer of the result — the engine doesn't trust the hook to have done writes that affect engine state; if a hook does writes for external reasons (e.g. updating a third-party system), those are out-of-band by contract.

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

- `workflow.doc` is the **whole** post-commit workflow doc, not a delta. The planner composes it from `loadedState.workflow` + each accumulated change (summary recompute, groups recompute, form_data merge, optional `completed` status push). The commit phase does `findOneAndUpdate` with a `$set` of the whole doc minus `_id`. (Alternative: commit phase computes the delta from before vs after. Same on-disk effect; pick the side that's easier to test — leaning toward "set the whole doc" because the planner already has it.)
- `actions[].doc` is the whole post-commit action doc. For inserts, that's the full draft. For updates, that's the loaded action with planned changes layered on (new status entry prepended, fields set, rendered cell spread, engine links computed, metadata merged).
- Renders run during planning: `actions[].doc.<app-slug>.message`, `actions[].doc.<app-slug>.link`, `actions[].doc.status_title`, and `events[].doc.display.<app-slug>.{title,detail}` are all rendered Nunjucks strings at plan time, against the planned post-commit shape of the doc the template references.
- `changeLog` deltas (D7) capture before vs after for audit. Built during planning, alongside the planned doc shape.
- `trackerFires` records what tracker subscriptions should fire after the current workflow's commit completes — the tracker recursion loop runs the next-level load-plan-commit per entry.

The Plan is immutable once handed to commit. The planner can return early with an empty-actions Plan (e.g. priority-rule-equivalent rejection where no FSM transition exists for the requested signal); commit on an empty Plan is a no-op write of just the workflow's `updated` stamp if anything else changed, or a complete no-op if nothing changed.

### D4. FSM resolution at the plan phase

State-machine.md defines the FSM tables per kind. The planner resolves signals through them:

```js
function resolveSignal({ action, signal, payload, actionConfig }) {
  const table = FSM_TABLES[action.kind];
  const currentStage = action.status[0].stage;
  const entry = table[currentStage]?.[signal];
  if (entry === undefined) return null; // no-op signal — non-listening state
  if (typeof entry === "string") return entry; // direct target
  return entry({ action, payload, actionConfig }); // function — e.g. submit_edit picks in-review vs done based on access.review
}
```

Three signal sources, identical resolution:

1. **User signal** — `payload.signal` from the API endpoint. Submit applies this to the target action identified by `payload.action_id`.
2. **Pre-hook auxiliary signals** — `preHookResult.actions[]` carries `{ target, signal }` entries; each resolves through the FSM against its target action.
3. **Engine cascade signals** — auto-unblock/auto-block re-evaluation, tracker subscriptions, cancel/close cascades. Emit `unblock`/`block`/`internal_mirror_child_*`/`internal_cancel_action` signals against affected actions. All resolved through the same FSM call.

Auto-unblock/auto-block is itself a fixpoint over the Plan: an action's `blocked_by` references other actions; if a planned transition makes those references terminal, the dependent action gains `unblock`. The planner iterates until no further unblocks/blocks fire (cycle detection: the FSM tables ensure no signal can flip an action back to a state that would re-fire — `unblock` from `blocked` goes to `action-required`, which doesn't accept `unblock` again). In practice this terminates in 1-2 iterations.

### D5. Pre-hook contract: read-only relative to engine atomicity

A pre-hook returns intent (signals + overrides) and may have done external work (callApi, third-party integration). The engine treats pre-hook returns as plan input. Two consequences:

- **Pre-hook writes don't participate in the engine's transaction (if transactions are adopted — D11).** Authors writing pre-hooks that do their own Mongo writes must accept that their writes commit independently of the engine's atomicity boundary. Documented in module README.
- **Pre-hook returns are the only channel into the Plan.** A pre-hook that wants to influence action transitions returns `{ actions: [...] }`. A pre-hook that wants to redirect the user's signal returns `{ signal: ... }`. A pre-hook that wants to override event display returns `{ event_overrides: {...} }`. There is no "the pre-hook quietly mutated context" path because there is no shared mutable context across phases.

This contract is the same as today's pre-hooks structurally — today's hooks already return a structured response that handleSubmit consumes. What changes: the response shape (Part 30 + state-machine signal mapping), and the explicit "writes are out-of-band" framing.

### D6. Post-hook contract: against committed state

Post-hooks fire after the commit. Their input is `LoadedState` (pre-commit) + the committed `Plan` + the commit result (IDs written). They see fresh state through the Plan — no re-read needed. The handler return value carries the post-hook response.

This is identical to today's post-hook semantically — the only difference is that the "what was just written" data structure is now the Plan rather than a soup of mirrored fields on `context`.

### D7. Change-log mechanic

The audit `change_log` collection is independent of `events`. Events are user-facing timeline entries with rendered display. Change-logs are mechanical before-after snapshots for rollback and forensic audit.

**Schema** (`change_log` collection):

```ts
type ChangeLogEntry = {
  _id: string;
  commit_id: string;           // groups all entries from one commit; = context.eventId for Submit-driven commits
  collection: "workflows" | "actions" | "events";
  doc_id: string;
  operation: "insert" | "update" | "delete";
  before: object | null;       // null for inserts
  after: object | null;        // null for deletes; whole post-commit doc for inserts/updates
  user_id: string | null;      // who triggered the commit
  app_name: string;            // host app slug
  entry_id: string;            // workflows module entry id
  created: ISODate;
  source: "submit" | "start" | "cancel" | "close" | "tracker-mirror" | "auto-unblock";
};
```

**When written.** During the commit phase, after the primary writes succeed (or atomically with them if transactions land). One `bulkWrite` insert of all change-log entries per commit. A commit of N action transitions + 1 workflow update + 1 event produces N + 2 change-log entries with a shared `commit_id`.

**What's logged.**

- Action transitions: before = loaded action doc; after = planned post-commit action doc.
- Workflow updates: before = loaded workflow doc; after = planned post-commit workflow doc.
- Event inserts: before = null; after = the inserted event doc.
- Notifications: out of scope for change-log v1 — they're per-recipient and high-volume; can be added later if rollback granularity needs them.

**Rollback support.** Not implemented in this part; the schema is designed for it. A separate part can ship a `RollbackChangeLog` operational API that takes a `commit_id` and applies the inverse (`after` → `before` for each entry) to restore state. Out of scope here.

**Diff storage.** v1 stores whole before/after docs, not field-level diffs. Workflow + action docs are small (< 10KB typical); storage cost is acceptable. If volume becomes an issue, a future migration moves to field-diff storage.

### D8. Mongo driver layer

We roll our own helpers in `plugins/modules-mongodb-plugins/src/connections/mongo/`. These are used by engine-internal write paths only — app-side YAML CallApi requests continue to use the community plugin.

**Helpers:**

- `findOneAndUpdateDoc({ collection, filter, update, session? })` — wraps native driver `findOneAndUpdate({ returnDocument: "after" })`. Returns the post-write doc.
- `bulkWriteActions({ operations, session? })` — wraps native driver `bulkWrite` for the actions collection. `operations` is an array of `{ updateOne: {...} }` / `{ insertOne: {...} }` entries built from the Plan. Returns acknowledged counts; does NOT return per-op post-write docs (use case doesn't need them — the Plan already has them).
- `insertOneDoc({ collection, doc, session? })` — wraps native driver `insertOne`. Returns inserted ID.
- `insertManyDocs({ collection, docs, session? })` — wraps native driver `insertMany`. Used for change-log entries and notifications.
- `findDocs({ collection, query, options?, session? })` — wraps native driver `find().toArray()`. Used by load phase.

These helpers receive a Mongo `Db` reference through the engine context. The plugin shell exposes `context.mongoDb` (raw `Db` from the driver), in addition to the existing `context.mongoDBConnection` (community-plugin wrapper). Engine code uses the former; app-side and pre-hook code use the latter.

**Why not extend the community plugin.** Three reasons:

1. The community plugin's change-log feature (its internal before/after read per op) duplicates what we're now doing in our own change-log — wasteful.
2. The plugin's API surface is YAML-CallApi-shaped (per-call `{ filter, update }` objects with serializable values); the engine's need is JS-shaped (sessions, raw driver methods, bulk ops).
3. `MongoDBBulkWrite` is deliberately absent from the community plugin (per Part 30 D11's analysis); we need it.

The community plugin stays in use for app-side code unchanged.

### D9. Commit ordering and partial-failure semantics

Without transactions (the default in v1), commit writes are ordered:

1. **Actions** — `bulkWriteActions` with all inserts + updates from `plan.actions`.
2. **Workflow** — `findOneAndUpdateDoc` on the workflows collection with the planned post-commit workflow doc.
3. **Events** — `insertOneDoc` per entry in `plan.events`.
4. **Notifications** — `insertManyDocs` (single call) for all `plan.notifications`.
5. **Change-log** — `insertManyDocs` (single call) for all change-log entries built from the prior writes.

Rationale: actions first so the workflow's denormalised summary/groups reflect what was just written (matters only if a subsequent read happens between steps, which doesn't in this flow but keeps the invariant clean). Events after workflow because event docs reference workflow + action IDs. Change-log last so any of the above failing prevents an audit entry claiming a write that didn't happen.

Partial-failure outcomes if a step throws mid-commit:

- Action writes succeed, workflow write fails: workflow's summary/groups become stale. Recoverable by re-running `planWorkflowRecompute` on a future submit; not silently broken, but flagged in the next submit's load (the plan-vs-loaded comparison can detect a stale summary).
- Workflow write succeeds, events fail: the submit appears to have happened from the action/workflow side but didn't log to the timeline. Operationally bad — flag in monitoring. Authors can re-fire via a manual operational API.
- Events succeed, change-log fails: audit gap. Log loudly; the change-log insert is the last step specifically so this is the smallest possible failure mode.

Transactions (D11) close all of the above. They're additive — D11 covers the path to adopting them.

### D10. Tracker recursion

`fireTrackerSubscription` becomes a loop, not a recursive function with shared engine context:

```js
async function runTrackerCascade(initialFires, baseContext) {
  let pendingFires = initialFires;
  while (pendingFires.length > 0) {
    const fire = pendingFires.shift();
    const levelContext = { ...baseContext, /* per-level overrides */ };
    const levelLoaded = await loadWorkflowState(levelContext, { workflowId: fire.parentWorkflowId });
    const levelPlan = await planTrackerLevel(levelLoaded, { parentActionId: fire.parentActionId, signal: fire.signal });
    const commitResult = await commitPlan(levelContext, levelPlan);
    pendingFires.push(...levelPlan.trackerFires);
  }
}
```

Each level is its own load-plan-commit cycle on its own workflow. No shared in-memory state between levels. Each level's commit is independently atomic (or transactional). The `MAX_DEPTH = 10` cycle guard from today's `fireTrackerSubscription` carries over as a counter on the loop.

This restructure is the only viable shape with load-plan-commit — recursion across workflows can't share a Plan because the Plan is per-aggregate. The good news is the per-level Plan reuses 100% of the per-Submit planner machinery; the only new piece is `planTrackerLevel`, which is a thin wrapper that emits the signal and then delegates to the same auto-unblock/recompute logic.

### D11. Transactions: additive, deferred

Mongo multi-document transactions are supported and the rebuild leaves a clean seam for them: every Mongo helper accepts an optional `session`, and `commitPlan` is the only function that touches multiple collections. Adoption path when ready:

```js
async function commitPlan(context, plan) {
  if (!context.useTransactions) {
    // current ordered-writes path, no session
    return commitWithoutTransaction(plan);
  }
  const session = context.mongoClient.startSession();
  try {
    return await session.withTransaction(() => commitWithSession(plan, session));
  } finally {
    await session.endSession();
  }
}
```

The decision to defer is partly about hook semantics (D5) and partly about validating the rebuild against real flows before adding another layer. Hook-side reads/writes don't participate in the transaction by contract; this is fine but worth confirming against real workflows.

### D12. Render-against-planned-state

Action display render context, per affected action:

```js
const renderCtx = {
  ...plannedActionDoc, // includes _id, type, key, assignees, due_date, status[], <slug>.message (sticky from prior), metadata
  ...plannedActionDoc.metadata, // metadata fields hoisted; metadata wins over action-doc-field collisions
};
```

`plannedActionDoc` is the **after** version — the doc with the new status entry prepended, fields set, metadata merged. Templates can reference fields the current transition is setting (e.g. a task whose `submit_edit` lands `done` and whose cell quotes `{{ assignees[0].name }}` where assignees was set in the same submit). The pre-write doc is no longer the render context — it's "the doc as it will look after the commit" because we have the plan.

Sticky display still works: `plannedActionDoc.<slug>.message` is the prior value carried through unless the new cell sets it. The `$mergeObjects` clobber bug I flagged in the previous turn doesn't apply here — the planner composes the full post-commit doc in JS, where deep merging is unambiguous, and commit writes it as one `$set` of the whole subtree.

Event display render context, per dispatched event:

```js
const renderCtx = {
  user: context.user,
  action: plannedActionDoc,         // post-commit shape
  workflow: plannedWorkflowDoc,     // post-commit shape including form_data, summary, groups
  interaction: signal,              // or "submit_edit" / etc. — the user-facing name
  status_before: loadedActionDoc.status[0].stage,
  status_after: plannedActionDoc.status[0].stage,
  submitted_form: planInputs.mergedFormData, // pre-merged from params.form + params.form_review + preHookResult.form_overrides
};
```

`submitted_form` replaces `workflow.form_data` as the primary "what was just submitted" binding. `workflow.form_data` remains exposed for templates that need cross-action form data, and it's fresh because the plannedWorkflowDoc already has it merged. Two paths to the same data; the explicit `submitted_form` is clearer for templates that just want the current submission.

### D13. Signal validation and error model

Three places where signals can be invalid:

1. **Unknown signal name** — payload says `signal: "frobnicate"`. Planner throws at plan time. Surfaces to caller as a 400-shaped error.
2. **Unknown target** — pre-hook returns `{ actions: [{ type: "nonexistent", signal: "..." }] }`. Planner throws (today's `actions[]` behaviour for missing targets).
3. **Signal doesn't apply to current state** — payload says `signal: "approve"` against an `action-required` action. FSM table has no entry. **Engine policy:** for the user-driven current-action signal, throw (the user clicked a button that shouldn't have been available — actionable bug). For pre-hook auxiliary signals and engine cascade signals, no-op silently (the FSM's "structural safety" property; e.g. `unblock` against already-unblocked target).

The distinction is intentional: user-driven signals indicate an explicit intent that should not silently fail, while cascade signals are deliberately permissive so engine re-evaluation can fire broadly without regressing siblings.

### D14. Salvaged from Part 30

Parts of Part 30 that carry over with no architectural change, just rewired to fit the new phase model:

- **Action-doc on-disk shape.** Per-app cells spread at top level (`action.demo`, `action['app-a']`). Sticky display across transitions. `status_title` top-level. `metadata` accumulated object. New denormalised `workflow_type` and renamed `tracker.child_workflow_type` per Part 30's schema additions.
- **Engine-computed links for built-in kinds.** Per-kind link table (kind × stage × access verbs) from Part 30 D4. Build-time `_module.pageId` scoping via the `entry_id` connection field. `urlQuery` carries `action_id` for task/form, `workflow_id` for tracker.
- **Resolver shape-validation.** Status_map cell shape rules from Part 30 D9 (built-in kinds reject `link:`, custom accepts `{message?, link?}`, no coverage requirement).
- **Caller-supplied `action_display` payload field.** Per-call cell overrides. Routes through the Plan: the planner reads `payload.action_display` and applies it when composing planned action docs, same priority as today (D8 of Part 30).
- **Engine-rendered event display.** Three source layers (engine default → YAML override → pre-hook return) merged via `mergeEventOverrides`, all plain Nunjucks template strings, rendered during the plan phase. D14 of Part 30 carries.
- **Display surface fixes.** `group-overview.yaml` reads `actions_list.$.message` / `.link`. Other surfaces' aggregation projections light up automatically once the engine writes the top-level fields.
- **`workflow-api.yaml` `entry_id: { _module.id: true }` wiring.** Connection schema gains `entry_id` field.
- **Engine-default event template rewrite** to plain Nunjucks string (`"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"`).

Discarded from Part 30:

- `createAction.js` / `updateAction.js` as primary call sites — replaced by planners + commit helpers.
- In-memory mirroring (handleSubmit edits 2/3/4 from Part 30) — unnecessary in the new architecture.
- The `recomputeWorkflowAfterActionWrite.js` post-write-shape composition — replaced by `planWorkflowRecompute.js`.
- Force/fetch unification in `updateAction` — `updateAction` itself goes away.
- The `$mergeObjects` engine-link composition — replaced by JS-side deep merge during planning, written as one whole-subtree `$set` at commit.

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
   ├─ role check, workflow-stage check
   └─ output: LoadedState { workflow, actions, workflowConfig, actionConfig, targetAction }
   │
   ▼
PRE-HOOK phase
   ├─ if no pre-hook declared → PreHookResult = { signal: payload.signal, actions: [], overrides: {} }
   ├─ else → callApi(hook); validate response shape
   └─ output: PreHookResult { signal, actions[], event_overrides, form_overrides, action_display }
   │
   ▼
PLAN phase  (pure, no I/O)
   ├─ resolve current-action signal → target stage via FSM
   ├─ resolve auxiliary signals (preHookResult.actions[]) → target stages via FSM
   ├─ initial planned action transitions (current + auxiliary)
   ├─ auto-unblock/auto-block fixpoint over the in-progress Plan
   ├─ recompute groups + summary against planned actions
   ├─ check auto-complete → optional 'completed' push on workflow
   ├─ merge form_data (params.form + form_review + preHookResult.form_overrides)
   ├─ compose planned workflow doc (summary, groups, form_data, optional completed)
   ├─ for each planned action transition:
   │     - compose planned action doc (status push, fields, metadata merge, action_display override)
   │     - lookup status_map[targetStage] for action's kind
   │     - render cell against planned-action-doc + metadata context
   │     - compute engine links (for built-in kinds) against planned-action-doc + access verbs + entry_id
   │     - spread rendered cell + links into planned action doc
   ├─ build event payload (default + YAML override + pre-hook override; render against engine render context)
   ├─ build notification payloads
   ├─ build change-log deltas (before vs after for every doc touched)
   └─ output: Plan { workflow, actions[], events[], notifications[], trackerFires[], changeLog[] }
   │
   ▼
COMMIT phase
   ├─ bulkWriteActions(plan.actions)
   ├─ findOneAndUpdateDoc(workflows, _id: workflow._id, $set: plan.workflow.doc)
   ├─ for each event in plan.events: insertOneDoc(events, event.doc) via callApi('new-event', module: 'events')
   ├─ insertManyDocs(notifications, plan.notifications)
   ├─ insertManyDocs(change_log, plan.changeLog)
   └─ output: CommitResult { action_ids, event_ids, ... }
   │
   ▼
TRACKER cascade (loop, not recursion)
   ├─ for each fire in plan.trackerFires + any subsequent fires:
   │     - run load-plan-commit on the parent workflow with internal_mirror_child_* signal
   │     - append any new trackerFires to the queue
   ├─ depth guard at 10
   └─ output: trackerFires log
   │
   ▼
POST-HOOK phase
   ├─ if no post-hook declared → return handler result
   ├─ else → callApi(post-hook) with { loadedState, plan, commitResult, trackerFires }
   └─ output: handler return payload
```

Start / Cancel / Close follow the same shape with different planners (no pre-hook for Start/Cancel/Close in v1; planner inputs differ; commit batches differ but use the same helpers).

## Schema additions

### `change_log` collection (new)

See D7 for the entry schema. Indexed on `commit_id`, `doc_id`, `created`. Indexes ship in a separate part following the established index migration pattern in this repo (Part 37 — actions-collection-indexes is the precedent).

### Action and workflow doc shapes

No additions beyond what Part 30 already specified (see § D14 Salvaged). The on-disk contract is identical to Part 30's. This part doesn't change the docs; it changes how they're produced.

### Connection schema (`WorkflowAPI/schema.js`)

- `entry_id` (string, required) — per Part 30. Wired from `_module.id: true` in `workflow-api.yaml`.

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
  - `planActionTransition.js` — given an action + signal + payload + context, returns the planned post-commit action doc + change-log delta.
  - `planAutoUnblock.js` — fixpoint loop over the in-progress action plan; emits unblock/block signals via the FSM.
  - `planWorkflowRecompute.js` — composes the planned post-commit workflow doc (summary, groups, completed push).
  - `planFormDataMerge.js` — merges form + form_review + form_overrides into the planned workflow's form_data.
  - `planEventDispatch.js` — composes + renders the event payload(s) for a submit.
  - `planNotifications.js` — composes notification payloads.
  - `planChangeLog.js` — builds change-log deltas from before/after pairs accumulated during planning.
  - `*.test.js` for each — unit tests on pure functions.

### New — `plugins/modules-mongodb-plugins/src/connections/shared/fsm/`

- `tables.js` — exports the three FSM tables (form, task, tracker) per state-machine.md.
- `resolveSignal.js` — the `(action, signal, payload, actionConfig) → targetStage | null` function.
- `tables.test.js` — exhaustive coverage of every cell in every kind's table.

### New — `plugins/modules-mongodb-plugins/src/connections/shared/render/`

- `renderTree.js` — recursive Nunjucks walker per Part 30 D13. Carried over.
- `parseNunjucks.js` — moved from `src/blocks/ContactSelector/parseNunjucks.js` per Part 30.
- `renderStatusMap.js` — orchestrator for action-doc cell rendering. Inputs: cell, plannedActionDoc, mergedMetadata, actionDisplay. Output: rendered cell ready to spread.
- `computeEngineLinks.js` — per-kind link computation per Part 30 D4 + entry_id mechanic.
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
- `SubmitWorkflowAction/resolveTargetStatus.js` — interaction → status table; obsolete with FSM.
- `SubmitWorkflowAction/computeAutoUnblocks.js` — replaced by `planAutoUnblock.js` (signal-emitting, not status-emitting).
- `SubmitWorkflowAction/reevaluateBlockedActions.js` — folded into `planAutoUnblock.js`.
- `SubmitWorkflowAction/utils/getCurrentAction.js` — load phase reads workflow + all actions in one call; no per-action targeted fetch needed.
- `SubmitWorkflowAction/dispatchLogEvent.js` (the dispatch part) — folded into commit phase. The `buildDefaultLogEventPayload` template constants survive in `planEventDispatch.js`.

### Modified — display surfaces (carried from Part 30)

- `modules/workflows/pages/group-overview.yaml` — switch to reading `actions_list.$.message` / `.link`.
- `modules/workflows/api/get-entity-workflows.yaml`, `api/get-workflow-overview.yaml`, `api/get-action-group-overview.yaml` — projections light up automatically; no edits needed.

### Modified — resolver + manifest (carried from Part 30)

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — add `validateStatusMapCells` per Part 30 D9.
- `modules/workflows/connections/workflow-api.yaml` — add `entry_id: { _module.id: true }`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — add `entry_id` field.
- `modules/workflows/module.lowdefy.yaml` — update `app_name` description.

### Modified — API + payload surfaces

- `modules/workflows/resolvers/makeWorkflowApis.js` — emitted-api payload mapping passes `signal`, `action_display`, `metadata`, `form`, `form_review`, `event_overrides`, hooks. Drops `force`.
- `modules/workflows/api/start-workflow.yaml` — add `action_display`, `metadata` to payload (Part 30 carry-over).
- Pre-hook payload shape (`buildHookPayload.js`) — unchanged. Pre-hook **return** shape changes: `{ type, status }` → `{ type, signal }` per state-machine.md.

### Migration — apps that use the engine

A separate migration task documents:

- Pre-hook return shape: `{ type, status }` → `{ type, signal }` per state-machine.md's table.
- Pre-hook current-action override: `{ status }` → `{ signal }`.
- Templates that surface buttons: button bars now declare signals (state-machine.md "Templates and buttons" section). Default v1 button bars per state-machine.md table.
- `force: true` removals from app YAML.
- Any custom apps that wrote directly to `actions` or `workflows` outside the engine — out of scope; documented as a separate concern.

The demo app's workflow configs (`apps/demo/modules/workflows/workflow_config/`) are the primary in-tree migration target. They demonstrate the new payload + return shapes.

## Worked example

**Workflow:** an installation workflow with three actions in one group:

```yaml
type: installation
action_groups:
  - id: install
    actions:
      - { type: install-step, kind: task, action_group: install }
      - { type: install-verify, kind: form, action_group: install, blocked_by: [install-step] }
      - { type: install-cleanup, kind: task, action_group: install, blocked_by: [install-step] }
```

State before submit:

- `install-step`: `action-required`
- `install-verify`: `blocked` (blocked_by install-step)
- `install-cleanup`: `blocked` (blocked_by install-step)
- Workflow summary: `{ done: 0, not_required: 0, total: 3 }`

**Caller submits:** `signal: submit_edit` against `install-step` with `target_status: done`, `metadata: { physical_id: "D-42" }`.

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
    { _id: "a-step", type: "install-step", kind: "task", status: [{ stage: "action-required" }], blocked_by: [] },
    { _id: "a-verify", type: "install-verify", kind: "form", status: [{ stage: "blocked" }], blocked_by: ["install-step"] },
    { _id: "a-cleanup", type: "install-cleanup", kind: "task", status: [{ stage: "blocked" }], blocked_by: ["install-step"] },
  ],
  targetAction: <ref to a-step>,
};
```

**Pre-hook phase:** no pre-hook declared. `PreHookResult = { signal: "submit_edit", actions: [], overrides: {} }`.

**Plan phase:**

1. Resolve current-action signal: `FSM["task"]["action-required"]["submit_edit"]` with `target_status: done` → `done`.
2. Initial planned transitions: `[ { action: a-step, target: "done", fields: {...}, metadata: { physical_id: "D-42" } } ]`.
3. Auto-unblock fixpoint over planned actions:
   - a-verify.blocked_by = ["install-step"]; planned install-step is "done" → terminal → emit `unblock` against a-verify.
   - FSM["form"]["blocked"]["unblock"] → `action-required`. Add to planned transitions.
   - a-cleanup.blocked_by = ["install-step"]; same → `unblock` → `action-required`.
   - Next iteration: planned transitions are a-step→done, a-verify→action-required, a-cleanup→action-required. No further unblocks (verify/cleanup don't accept unblock from action-required).
4. Compose planned action docs:
   - a-step planned doc: status prepended with `{ stage: "done", event_id: e1, created: now }`, metadata: `{ physical_id: "D-42" }`, rendered cell for `done` stage (e.g. `demo.message: "Installed D-42."`), engine link `task-view` (since done has no edit verb).
   - a-verify planned doc: status prepended with `{ stage: "action-required", event_id: e1, created: now }`, sticky message from prior stage (none — was blocked, no cell), engine link `form-edit`.
   - a-cleanup planned doc: status prepended, engine link `task-edit`.
5. Recompute groups: install group has 1 done + 2 action-required → "in-progress" (unchanged).
6. Recompute summary: `{ done: 1, not_required: 0, total: 3 }`.
7. Check auto-complete: no — `total !== done + not_required`. No completed push.
8. Merge form_data: `submitted_form = { physical_id: "D-42" }`. Planned workflow.form_data = `{ "install-step": { physical_id: "D-42" } }`.
9. Compose planned workflow doc with summary, groups, form_data.
10. Build event payload: render `display.{appName}.title` against `{ user, action: a-step-planned-doc, workflow: planned-workflow-doc, interaction: "submit_edit", status_before: "action-required", status_after: "done", submitted_form }`. Engine default renders to e.g. `"Sam marked install-step as done"`.
11. Build notification payloads (per Part 8 / notifications module).
12. Build change-log deltas: one entry per affected doc (a-step before/after, a-verify before/after, a-cleanup before/after, workflow before/after, event before=null/after=eventDoc).

**Commit phase:**

```
bulkWriteActions([
  { updateOne: { filter: {_id: "a-step"}, update: {$set: <a-step-planned-doc minus _id>} } },
  { updateOne: { filter: {_id: "a-verify"}, update: {$set: <a-verify-planned-doc minus _id>} } },
  { updateOne: { filter: {_id: "a-cleanup"}, update: {$set: <a-cleanup-planned-doc minus _id>} } },
])
findOneAndUpdateDoc(workflows, {_id: "w1"}, { $set: <workflow-planned-doc minus _id> })
callApi("new-event", events, { _id: e1, ...eventPayload })
insertManyDocs(notifications, [...])
insertManyDocs(change_log, [...])
```

**Tracker cascade:** none (workflow didn't push `completed`).

**Post-hook:** none declared. Handler returns `{ action_ids: ["a-step", "a-verify", "a-cleanup"], event_id: e1, ... }`.

Renders all happened in step 4 + step 10 of planning, against the planned post-commit shape. No re-fetch. No in-memory mirroring. Adding a sixth or seventh write to the commit phase later doesn't reopen any staleness window — render context is the Plan.

## Non-goals

- **Transactions in v1.** D11 establishes the seam; adoption is a follow-up.
- **Field-diff storage for change-log.** D7 stores whole before/after docs; field-diff is a future optimization.
- **Rollback API.** D7's schema supports rollback; a separate part implements `RollbackChangeLog`.
- **Operational-event signals** (`due_date_passed`, scheduled triggers). Per state-machine.md non-goals.
- **Author-overridable FSM tables.** v1 ships per-kind tables engine-locked, per state-machine.md.
- **Custom statuses.** Eight-status enum stays fixed per critique § 7 / state-machine.md.
- **Notifications change-log entries.** D7 explicitly defers.
- **Migrating apps to the new payload shape.** A separate task documents the migration; this part ships the engine, not the migrations.

## Related

- [Part 30 — Engine-managed display (rejected)](../_rejected/30-status-map-rendering/design.md) — the rejected predecessor. On-disk contract carries over; the rest is rebuilt.
- [state-machine.md](../../../workflows-module-concept/state-machine/design.md) — concept-level FSM model.
- [engine/design.md](../../../workflows-module-concept/engine/design.md) — concept-level engine surface (Decision 4 updated separately).
- [submit-pipeline/design.md](../../../workflows-module-concept/submit-pipeline/design.md) — concept-level submit lifecycle (Decision 3 updated separately).
- [Part 28 — Custom action kind](../28-custom-action-kind/design.md) — `kind: custom` author-driven link authoring; the planner handles it via Part 30's carried-over sentinel-substitution rule.
- [Part 32 — Drop static interactions overrides](../_completed/32-drop-static-overrides/design.md) — adjacent topic on event_overrides channel; no shared edits.
- [Part 37 — Actions collection indexes](../37-actions-collection-indexes/design.md) — index migration pattern; change-log indexes follow this.
- [`docs/idioms.md` § Event display](../../../../docs/idioms.md#event-display) — the cross-repo event_display idiom the engine path conforms to (plain Nunjucks strings).
