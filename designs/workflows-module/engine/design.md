# Workflows Engine

The server-side workflow engine — the WorkflowAPI Lowdefy connection, the three request handlers (`StartWorkflow`, `UpdateWorkflowActions`, `CancelWorkflow`), the references-spread write contract, the sub-workflow tracker subscription, and the status enum priority rule.

This sub-design owns the runtime that makes workflows work. The YAML surface that drives the engine comes from [action-authoring](../action-authoring/design.md); the module APIs that call into the engine come from [module-surface](../module-surface/design.md); the page templates that read engine output come from [ui](../ui/design.md).

## Problem

The module commits the data model (workflows + actions collections, status-array history with newest at index 0, references spread to root) and the engine semantics (priority transition rule, eager summary writeback, auto-complete check, sub-workflow lifecycle mirroring). What's not yet decided:

- The plugin package's server-side scaffolding — `@lowdefy/modules-mongodb-plugins` is client-side only today.
- Whether the references write contract enforces reserved-keys via validation throws or merge-order silence.
- How the priority rule reads the status enum at runtime.
- The subscription mechanism for child-workflow → sub-workflow-action updates (synchronous in-process vs change-stream vs other).
- Universal action fields handling — `assignees`, `due_date`, `description` merged into per-action writes atomically with status transitions.
- The `keys: [...]` payload shape on `UpdateWorkflowActions`.

This sub-design covers all of the above.

## Decision 1 — Plugin shape

**Add a server-side `WorkflowAPI` connection to `@lowdefy/modules-mongodb-plugins`.**

The package is client-side only today (`types.js` declares `connections: []`, `requests: []`). Adding the server-side connection is bootstrapping a new capability for the package — a discrete chunk of v1 work.

### Connection structure

```
src/connections/WorkflowAPI/
  WorkflowAPI.js                    # 4-line shell that registers handlers
  UpdateWorkflowActions/
    UpdateWorkflowActions.js        (~25 lines)
    handleUpdateActions.js          (~60 lines)
    createAction.js                 (~30 lines)
    updateAction.js                 (~40 lines)
    utils/{shouldUpdate,shouldCreate,getCurrentAction}.js
  StartWorkflow/
    StartWorkflow.js                (~25 lines)
    createActions.js                (~70 lines)
  CancelWorkflow/
    CancelWorkflow.js
  shared/
    createMongoDBConnection.js
    getActionFields.js
    getActions.js
    populateIds.js
```

### Capabilities

- **Entity-agnostic field shape.** Action docs and workflow docs use scalar `entity_type` + `entity_id` (not a per-entity-key array shape).
- **`StartWorkflow` writes both a workflow doc and N action docs.** The workflow doc carries `key`, `display_order`, initial `status: [{ stage: 'active', created }]`, empty `form_data`, empty `summary`.
- **`summary` writeback in `UpdateWorkflowActions`** — eager strategy: recompute the parent workflow's `summary: { done, not_required, total }` after each transition.
- **Auto-complete check** — when all actions on a workflow reach a terminal stage (`done` or `not-required`), push `{ stage: 'completed' }` to the workflow's `status` history.
- **`references` field handling** — see "References write contract" below.
- **Tracker subscription handler** — see "Sub-workflow tracker subscription mechanism" below; runs synchronously after each workflow status write.
- **Priority-based transition rule** — see "Status enum priority rule" below.
- **`UpdateWorkflowActions` payload uses `keys: [...]` only** — no singular `key` field on action entries. The plugin flat-maps over `keys` before per-action processing: omitted → one op with `key: null`; `[]` → zero ops; `[k]` → one op with `key: k`; `[k1, k2, ...]` → N ops one per key. The on-disk action doc keeps singular `key`; only the plugin's input shape unifies. The `(workflow_id, type, key)` unique index is unchanged.
- **Universal action fields handling.** The plugin reads `actions[].fields` from the `UpdateWorkflowActions` payload (see action-authoring sub-design) and merges it into the per-action `$set`. `fields.assignees` / `fields.due_date` / `fields.description` are written to the action doc's root alongside core fields. A null value clears the field; an omitted key leaves the existing value unchanged. Field writes are atomic with the status transition — the engine emits one update event covering both.
- **`CancelWorkflow` primitive** — pushes `cancelled` to workflow status; flips remaining open actions to `not-required`.

### Package shape changes (`@lowdefy/modules-mongodb-plugins/package.json`)

- Add `dependencies` for the Mongo driver (`mongodb`) and any Lowdefy server-side helpers (`@lowdefy/helpers` is already a peerDep — confirm it's available server-side).
- Add `src/connections/WorkflowAPI/` directory with the handler files.
- Update `src/types.js` to register the connection: `connections: [{ id: 'WorkflowAPI', type: WorkflowAPI }]`. Currently `connections: []`.
- Build pipeline: SWC currently builds `src/*` → `dist/*`. Verify it handles the deeper `src/connections/WorkflowAPI/...` tree the same way and emits both client and server entry points cleanly. The package's `exports` map already uses `./*` → `./dist/*`, so no `exports`-side change needed. Consumers don't import the connection class directly — Lowdefy's plugin runtime discovers connections from the package's `types.js` `connections` array. Apps reference the connection by id (`connectionId: WorkflowAPI`) in their connection YAMLs.

**Bump the package version** to the next minor and update the workflows module's `plugins:` entry to require it.

## Decision 2 — References write contract

The `references` map is spread onto the doc root at write time, matching the events module's contract exactly.

**Shape of `references` in the call payload.** One map per call, applied to all docs that call writes:

- `StartWorkflow` — `references` in the call payload is spread onto the workflow doc and onto every starting action doc.
- `UpdateWorkflowActions` — `references` at the call level is spread onto every action being written; per-action overrides on individual `actions[].references` are supported but rare.
- `CancelWorkflow` — `references` is rarely used; if supplied, spread onto the workflow doc on the `cancelled` status push.

**Storage shape.** No `references` key on the stored doc — the map is unwrapped and spread to root. Queries are flat (`{ company_ids: 'C1' }`); indexes live at root. Apps add Mongo indexes on whichever `*_ids` keys they query; the module ships indexes only for core fields.

**Update semantics.** `UpdateWorkflowActions` uses **replace per-key**: a call passing `references: { company_ids: [C2] }` replaces the doc's `company_ids` field but leaves other root-level reference fields (`deal_ids`, `region_ids`, etc.) untouched. Same as Mongo's `$set` semantics.

**Reserved-keys enforcement — merge order, not validation.** Matches the events module's pattern. The plugin builds the doc by spreading `references` first, then layering core fields on top via `_object.assign`-equivalent semantics:

```js
// pseudo-code in createAction.js
const doc = {
  ...actionUpdate.references, // spread first
  // core fields layered last so they override any collision
  _id: actionId,
  workflow_id: currentAction.workflow_id,
  type: actionUpdate.type,
  entity_type: currentAction.entity_type,
  entity_id: currentAction.entity_id,
  // universal action fields — also reserved
  ...(actionUpdate.fields ?? {}),
  // ... other core fields ...
};
```

If `references.{key}` collides with a core field name, the core field wins silently. The stored doc is always correct. The README documents the **reserved-keys list** (`_id`, `workflow_id`, `type`, `entity_type`, `entity_id`, `key`, `status`, `summary`, `created`, `updated`, `assignees`, `due_date`, `description`, `tracker`, plus any other engine-managed keys) so authors know which keys to avoid; collisions from genuine app bugs surface as "the reference value I set didn't appear when I queried." The three universal fields (`assignees`, `due_date`, `description`) are reserved because they are user-editable engine-managed fields — apps that try to put `assignees` on `references` would have it silently overridden.

**Validation throws are deliberately not implemented in v1.** The events module enforces its reserved-keys rule via merge order without throwing on collision; we match that pattern for cross-module consistency. Build-time validation in `makeWorkflowsConfig` (catching collisions in static workflow YAML) and write-time validation in the plugin handlers (catching collisions in dynamic payloads) are nice-to-have additions if real apps surface confusion from silent overrides — purely additive, can be added later.

**App-defined index strategy.** The module ships indexes on core fields only. Apps populating `company_ids`, `deal_ids`, `region_ids`, etc. add their own Mongo index definitions wherever they manage indexes; out of scope for the module. The README documents this so authors know to add an index when they query by a reference key.

## Decision 3 — Sub-workflow tracker subscription mechanism

### Mechanism — synchronous in-process within `UpdateWorkflowActions`

When `UpdateWorkflowActions` writes a workflow's `status[0].stage`, the same handler — before returning — looks up sub-workflow actions whose `key` equals that `workflow_id` and applies the hard-coded child-stage map (defined in [action-authoring](../action-authoring/design.md)). No event bus, no async machinery, no separate consumer process. It's part of the handler's normal flow.

Pseudo-code:

```js
const CHILD_STAGE_MAP = {
  active: "in-progress",
  completed: "done",
  cancelled: "not-required",
};

async function pushWorkflowStatus(ctx, workflowId, newStage, eventId) {
  // 1. Write the workflow's status (existing behaviour)
  const workflow = await writeWorkflowStatus(
    ctx,
    workflowId,
    newStage,
    eventId,
  );

  // 2. Find sub-workflow actions whose key references this workflow's _id
  const trackers = await ctx.actionsCollection.find({
    key: workflowId,
    "tracker.workflow_type": workflow.workflow_type,
  });

  // 3. Apply the hard-coded map and update via UpdateWorkflowActions
  const targetStage = CHILD_STAGE_MAP[newStage];
  if (!targetStage) return; // unmapped child stage → no parent update
  for (const tracker of trackers) {
    await updateAction(ctx, {
      currentActionId: null,
      actions: [{ type: tracker.type, key: tracker.key, status: targetStage }],
      eventId, // reuse the same eventId — the sub-workflow action update is part of this transition
    });
  }
}
```

### Why synchronous in-process

Three alternatives were considered:

- **In-process event emitter.** Adds an indirection (publish/subscribe) for no decoupling benefit — the plugin owns both writer and tracker-update handler, so direct calls match the data flow. Rejected.
- **MongoDB change-stream consumer.** A separate process tails the `workflows` collection's oplog and runs tracker logic on every status write. Multi-server safe by construction, captures direct DB writes (migrations, admin tools), but adds a long-running process to the deployment, requires resume-token discipline, and runs trackers in a separate transaction from the trigger write. **Deferred** — no current trigger forces this. Re-open if multi-process writers, direct DB writes, or migration tooling become real.
- **App-side imperative chaining (no engine subscription).** Each submit handler that triggers a workflow transition explicitly updates the tracker. Fragile because every lifecycle handler must remember to call the tracker update. Rejected.

Synchronous in-process wins because:

- **Same transactional semantics as the underlying write.** If `UpdateWorkflowActions` succeeds, trackers are updated; if it fails, neither happened. No new failure surface relative to the existing summary writeback.
- **No new infrastructure.** No background process, no oplog tailing, no resume tokens.
- **Multi-server safe by construction.** Each server's plugin instance handles whatever writes go through it; trackers update in the same process.
- **Matches the data-flow shape.** Tracker updates _are_ part of "what happens when a workflow's status changes." Modelling them as follow-up steps in the same handler is the most direct expression.

### Reverse-lookup index

The unique `(workflow_id, type, key)` index supports sub-workflow action uniqueness within a parent workflow but not the reverse-lookup direction (find all actions whose `key` references a given child workflow). Module-design ships a sparse index `{ key: 1, "tracker.workflow_type": 1 }` on the `actions` collection — sparse because only sub-workflow actions populate `tracker.workflow_type`, so Mongo excludes the rest from the index. Matches the natural query shape `actions.find({ key: <child workflow_id>, "tracker.workflow_type": <child workflow_type> })` so the lookup is one indexed scan.

### Auto-complete recursion

When a sub-workflow action transitions to `done` via this mechanism, the parent workflow's auto-complete check runs as part of the same `UpdateWorkflowActions` invocation. If all parent's actions are now terminal, the parent workflow auto-completes, which fires this same tracker-update logic for any sub-workflow actions tracking _it_. Recursion depth is bounded in practice because typical workflow nestings are 1–2 levels deep.

**The engine doesn't statically prove acyclicity.** Without a relationship registry, there's no metadata for the engine to walk in advance to confirm the parent/child workflow graph is acyclic. Pathological app code — e.g. parent A's sub-workflow action tracks workflow B, whose sub-workflow action tracks workflow A — could in principle recurse. Cycles are rare in real apps because they require app code to deliberately link parents to grandchildren; the design accepts the risk for v1. If it surfaces operationally, the engine adds a runtime depth-limit guard that fails with a clear error citing the recursion chain at, say, 10 levels.

### Idempotency

Tracker updates are just additional `UpdateWorkflowActions` calls — same priority/force rules, same `eventId`, same audit chain. The `eventId` is reused so all writes triggered by one user submission share one event id. Repeating the call is harmless because the priority-based transition rule no-ops repeated stage pushes — pushing the same stage twice is rejected as a redundant write.

### Failure-mode story

If the tracker update throws after the workflow status write succeeded, the workflow doc is in `completed` (or whatever new stage) but the tracker is still in its previous stage. Same risk model as the `summary` writeback. Mitigations:

- **Idempotent retry on next read of the parent workflow.** The `get-entity-workflows` API can detect "workflow's status[0] is terminal but tracker referencing it isn't" and queue a tracker reconciliation. Optional; cheap.
- **Periodic reconciliation job.** Walk workflows in terminal stages; verify their trackers are also terminal; correct any drift. Can run on a schedule. Listed in parent Risks.
- **Strong invariant in the engine.** The tracker update runs _before_ `UpdateWorkflowActions` returns, in the same execution context. If the user got a successful response, both writes happened.

Documented as the same risk-class as the summary writeback. Acceptable.

### Ordering relative to other engine work

Within one `UpdateWorkflowActions` call, the order is:

1. Write the action's status (the original transition the caller asked for).
2. Apply auto-complete check on the workflow if all actions are terminal — push `completed` to workflow status.
3. If step 2 wrote a workflow status, run tracker-update for any sub-workflow actions referencing this workflow.
4. Recompute the workflow's `summary` (eager writeback).
5. Return action ids and event id.

Step 3 happens between step 2 and step 4 because tracker writes themselves trigger their own auto-complete chain — a sub-workflow action going `done` can complete its parent workflow. Doing summary writeback after lets it reflect the final state. Implementation verifies this ordering.

## Decision 4 — Status enum priority rule

The plugin's `shouldUpdate.js` implements the priority transition rule, reading the **static module-shipped enum** (see [action-authoring](../action-authoring/design.md) "Action status enum") at runtime.

**Priority semantics.** A status transition is allowed when the new status's priority is **strictly less than** the current status's priority — lower number wins. Exceptions:

- The engine permits same-stage transitions for the action being submitted (`currentActionId` self-exception).
- A `force: true` override on `UpdateWorkflowActions` allows any transition (used for migrations and admin tools).
- `not-required` (priority 0) is the universal terminal — once an action is `not-required`, only `force: true` can move it.

The plugin reads `actionsEnum` from `_module.var` or directly from `global.action_statuses`; either way the same eight-name vocabulary is in effect across every consuming app. No per-app override at runtime.

## Risks

- **Plugin dual-runtime build complexity.** SWC building both client-side React blocks and server-side Mongo handlers from one package may surface tooling issues (e.g. accidental React imports leaking into server bundles). Mitigation: split `src/blocks/` and `src/connections/` clearly; verify the SWC config emits clean entry points before declaring the work done.
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: provide a `summary_dirty: true` lazy-writeback fallback as an opt-in mode (set per workflow YAML), so apps with high parallelism can defer the recompute. Default stays eager.
- **Cross-module endpoint resolution at the module-level (`_module.endpointId: { id, module }`)** inside `submit-action`. The API calls into events (`new-event`) and notifications (`send-notification`); cross-module reference works from inside another module's API routine (verified — the contacts module already does this pattern in `update-contact`). If a future change to the module-loader breaks the cross-module reference, fallback is having the app pass endpoint IDs as caller-supplied vars.
- **Tracker subscription drift.** Mitigated by the failure-mode mitigations above; periodic reconciliation as the catch-all.

## Open Questions

1. **Relationship-registry cycle protection.** Hard graph-cycle prevention is deferred. If real apps surface pathological linking patterns, add a runtime depth-limit guard (default 10) that fails with a clear error citing the recursion chain.
2. **Change-stream subscription variant.** Re-open if multi-process writers, direct DB writes, or migration tooling become real triggers.
3. **Entity-status mirroring on `tracker:` (revisit if real apps surface the need).** Decision 3 commits sub-workflow actions to mirror workflow status only. Adding entity-status mirroring (an `on: workflow | entity` selector) is purely additive — no migration if it lands later.

## Next Step

Implementation of the plugin, the references write contract, and the tracker subscription mechanism. Builds against the action-authoring sub-design's payload contracts and is called by the module-surface sub-design's `submit-action` / `start-workflow` / `cancel-workflow` APIs.
