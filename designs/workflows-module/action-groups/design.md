# Workflows Action Groups

Elevate `action_group` from a render-time UI label to a first-class engine concept. The engine persists per-group status on the workflow doc, evaluates `blocked_by` references against both action types and group IDs, and surfaces completed-group IDs to the caller so an outer mechanism can invoke an optional `on_complete` hook per group.

This sub-design owns groups-as-engine-concept. Authoring vocabulary on the workflow YAML stays consistent with [action-authoring](../action-authoring/design.md); the runtime that writes group status lives in [engine](../engine/design.md); the UI changes for reading persisted group state come from [ui](../ui/design.md); the per-group endpoint generation falls under [module-surface](../module-surface/design.md). This sub-design ties them together.

## Problem

In the existing design, `action_group` is a free-form string on each action. The `actions-on-entity` UI component groups rendered actions by `(workflow_id, action_group)`. Beyond that, the engine knows nothing about groups — they have no status, no aggregate behaviour, no implications for `blocked_by`, no events.

Workflow designers consistently think in terms of phases ("Phase 1 done → Phase 2 starts"). Today, expressing that in YAML means listing every Phase 2 action's `blocked_by` with every Phase 1 action — an O(N×M) declaration that grows brittle as phases gain actions, and misses the conceptual unit ("the phase") authors actually have in mind.

What this sub-design commits:

- A workflow declares its `action_groups:` as an ordered list with `id`, `title`, and an optional `on_complete` reference. Every `action.action_group` value must reference a declared group.
- `blocked_by` entries accept both action types and group IDs in one field.
- Group status is a derived three-value enum (`blocked` / `in-progress` / `done`) eagerly written to the workflow doc as part of each `UpdateWorkflowActions` call.
- The engine's existing transition flow grows two new steps inside `UpdateWorkflowActions`: (a) recompute group statuses and write them, (b) re-evaluate `blocked_by` against the new state and push affected blocked actions to `action-required`.
- `UpdateWorkflowActions` returns a `completed_groups: [...]` list so a higher orchestration layer can fire each group's `on_complete` hook. **The exact orchestration mechanism for invoking per-group hooks is deferred to a follow-up sub-design** — see Decision 6.

What's intentionally not in this design:

- Phase ordering as an engine primitive (no `gates_next`). Sequencing remains the job of `blocked_by`; groups don't impose order beyond display.
- Entity status mirroring. Apps that want `entity.stage` to follow phase transitions write that in their `on_complete` hook's routine, same way action submit hooks write entity updates today.
- A new event channel for "group-completed." If a workflow wants such events, the `on_complete` hook calls the events module's `new-event` API.

## Decision 1 — Workflow-level `action_groups:` declaration

A workflow YAML grows a top-level `action_groups:` field — an ordered array of group objects:

```yaml
type: onboarding
title: Onboarding
entity_type: lead
display_order: 1

action_groups:
  - id: phase-1
    title: Discovery
    on_complete: workflow_config/onboarding/api/phase-1-complete.yaml
  - id: phase-2
    title: Quote
  - id: phase-3
    title: Installation

starting_actions:
  - { type: qualify, status: action-required }
  - ...

actions:
  - _ref: ./qualify.yaml
  - ...
```

**Per-group fields:**

| Field         | Type    | Description                                                                                                                |
| ------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string  | Group identifier. Must be unique within the workflow. Referenced from `action.action_group` and from `blocked_by` entries. |
| `title`       | string  | Display title used in `workflow-header` group headers.                                                                     |
| `on_complete` | string? | Optional path to a Lowdefy routine YAML. Invoked once when the group transitions to `done`. See Decision 6.                |

**Constraint: every `action.action_group` value must reference a declared group.** The build-time resolver pipeline (`makeWorkflowsConfig`) validates this and fails the build with a clear error if an action references an unknown group. Catches typos and lets `_ref`/build operators stay simple downstream.

**Display order = YAML order.** No separate `sort_order` on groups. The order authors write groups in is the order `actions-on-entity` renders them. Matches the existing per-action `sort_order` pattern (which still controls intra-group ordering).

**Why a top-level workflow field, not a separate file/module export.** Groups are per-workflow concepts — phase 1 of onboarding is unrelated to phase 1 of any other workflow. Co-locating the declaration with the workflow it scopes keeps authoring tight; cross-workflow group reuse isn't a real use case.

## Decision 2 — `blocked_by` accepts group IDs

Actions' `blocked_by:` field accepts either action types or group IDs, in one mixed list:

```yaml
type: send-quote
action_group: phase-2
blocked_by: [qualify] # action type — Phase 2 starts when qualify is done

type: schedule-installation
action_group: phase-3
blocked_by: [phase-2] # group ID — wait for the whole Phase 2 group

type: emergency-escalation
action_group: phase-3
blocked_by: [phase-2, contact-customer] # mixed — group + action type
```

**Resolution at runtime.** The engine reads `blocked_by` and resolves each entry by lookup precedence:

1. Is this entry a declared group ID in the workflow's `action_groups:`? If yes → group reference. An action is unblocked by this entry when the group's status is `done`.
2. Otherwise, is it a declared action type in the workflow's `actions:`? If yes → action reference. An action is unblocked by this entry when an action with that type has reached a terminal status (`done` or `not-required`).
3. Otherwise → build-time error.

**Build-time validation.** `makeWorkflowsConfig` walks every action's `blocked_by` and verifies each entry resolves to either a declared group or a declared action type. Unknown identifiers fail the build with a message naming the action and the unresolved entry.

**Collision rule.** A group ID and an action type within the same workflow MUST NOT collide. Build-time validation enforces. The lookup-precedence rule never triggers in practice; the engine errors cleanly at build, not at runtime.

**Why one field, not two.** A separate `blocked_by_groups:` field would force authors to look in two places when reading "what does this action wait on." The collision risk is small (author-controlled names) and caught at build time. Single field reads better.

**Fan-out / keyed actions.** Group references in `blocked_by` work identically to action references when the dependency action(s) are keyed. The engine waits for the group's terminal status, which itself requires every action in the group (including all keyed instances) to be terminal. No new semantics for keyed dependencies.

## Decision 3 — Group status as a derived three-value enum

Group status is a **derived** value: the engine computes it from the actions in the group on every relevant transition. The vocabulary is intentionally minimal — three values, distinct from the eight-value `action_statuses` enum:

| Group status  | Rule                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `done`        | Every action in the group has terminal status (`done` or `not-required`), AND the group is non-empty.                                                      |
| `in-progress` | At least one action in the group is non-terminal AND at least one action is `action-required`, `in-progress`, `in-review`, `changes-required`, or `error`. |
| `blocked`     | Every non-terminal action in the group is `blocked`. (Default for an unstarted group.)                                                                     |

**Empty groups.** A group with no actions is `done` by convention — no work to wait on. Matches author intent: declaring an empty placeholder group and seeing it as `done` is the least surprising behaviour. Build-time validation MAY warn on empty groups but doesn't error.

**No `action_statuses` reuse.** Mapping action priorities to a group status would invent semantics that don't exist (what's the "priority" of a group with a mix of `done` and `blocked`?). The three-value enum captures exactly what matters for downstream logic: "did this group complete?" (`done`), "is something happening in it?" (`in-progress`), "is it untouched?" (`blocked`). Nothing else queries group status.

**Cancelled workflows.** When `CancelWorkflow` flips all open actions to `not-required`, every group lands at `done` (every action terminal, group non-empty). The `on_complete` hook **does not fire** on cancellation — see Decision 6 invocation rules.

## Decision 4 — Persistence: `groups: [...]` on the workflow doc

The workflow doc carries the persisted group state as an array:

```js
// workflow doc
{
  _id, workflow_type, entity_type, entity_id, key,
  status: [ { stage: 'active', created } ],
  summary: { done: 3, not_required: 0, total: 6 },
  groups: [
    { id: 'phase-1', status: 'done',        summary: { done: 2, not_required: 0, total: 2 } },
    { id: 'phase-2', status: 'in-progress', summary: { done: 1, not_required: 0, total: 3 } },
    { id: 'phase-3', status: 'blocked',     summary: { done: 0, not_required: 0, total: 1 } }
  ],
  // ... references spread to root ...
}
```

**Shape.** Array (not map keyed by id) preserves display order. Each entry carries `id`, derived `status`, and a per-group `summary: { done, not_required, total }` parallel to the workflow-level `summary`.

**Eager writeback inside `UpdateWorkflowActions`.** Same pattern as the workflow-level `summary` (engine sub-design "Decision 1"). On every action transition that affects a group, the engine recomputes the group's status and summary and writes it atomically as part of the same handler invocation. Detail in Decision 5.

**Drift class.** Same risk family as `summary` writeback: a direct DB write to an action (a migration, admin tool, or future change-stream) leaves `groups[]` stale. Mitigated by:

- The same periodic reconciliation job that already covers `summary` drift (engine sub-design "Failure-mode story") extends to recompute `groups[]`.
- `get-entity-workflows` MAY in v1 verify-and-correct group state on read if cheap.
- The README documents that direct writes to actions bypass the engine and may leave workflow-doc denormalizations stale.

**Why persist at all.** Two reasons:

- Diverse consumers (analytics pipelines, dashboards, admin tools) can read group state directly from the workflow doc without going through the module's API. The events module's `references` writeback pattern follows the same logic — denormalize to the doc to keep consumers simple.
- The `groups[]` write happens inside `UpdateWorkflowActions` anyway (it's what powers the `blocked_by` re-evaluation step and the `completed_groups` return value). Persisting the result alongside the computation that already runs is essentially free.

**Index strategy.** No new module-shipped indexes. Apps that query workflows by current phase (e.g. "find all leads in phase-2") add their own Mongo index on `groups.status` or on a denormalized scalar if needed. Documented in the module README.

## Decision 5 — Engine flow inside `UpdateWorkflowActions`

The handler's existing ordered steps (engine sub-design "Ordering relative to other engine work") grow two new steps. Updated ordering:

```
1. Write the requesting action's status      (existing)
2. Recompute affected groups' statuses;
   write groups[] back to the workflow doc   (NEW — Decision 4)
3. Re-evaluate blocked_by for every blocked
   action in the workflow; push action-required
   on those whose dependencies are now terminal (NEW — Decision 2 unblock)
4. Auto-complete check on the workflow       (existing — re-run after step 3,
                                               since step 3 may have transitioned
                                               more actions)
5. If step 4 wrote a workflow status, run
   tracker-update for sub-workflow actions
   referencing this workflow                  (existing)
6. Recompute workflow-level summary           (existing)
7. Return { action_ids, completed_groups }    (NEW return shape — Decision 6)
```

**Step 2 — affected-groups recompute.** "Affected groups" means: the group containing the requesting action, plus any group that has actions transitioning as a result of this call (e.g. when `unblocks: [{ type: send-quote, status: action-required }]` moves an action into a different group). The handler tracks which actions it wrote in step 1 and groups them by `action_group` before recomputing.

The handler MAY recompute every group on every call without correctness issues — only an efficiency consideration. v1 implementation recomputes the affected groups; later optimisations are additive.

**Step 3 — `blocked_by` re-evaluation.** A general scan of every action in the workflow with current status `blocked`. For each, evaluate the action's `blocked_by` list against the new state of groups (`groups[].status`) and actions (`actions.status[0].stage`). If every entry resolves to terminal, write `action-required` to that action's status (subject to the priority transition rule — see engine sub-design "Decision 4").

This single evaluation step covers both inter-action and inter-group dependencies. Today the engine doesn't do this — apps declare explicit `unblocks: [...]` in submit hooks. With group references becoming valid `blocked_by` entries, the engine has to do the unblock work itself (the submit hook can't enumerate "every action waiting on phase-1"). The same evaluation handles action-type entries too; in v2 we MAY deprecate the explicit `unblocks:` field if real apps prefer purely declarative `blocked_by`. v1 keeps both — `unblocks:` for backward compatibility with already-authored hooks.

**Step 7 — return shape.** `UpdateWorkflowActions` returns:

```
{
  action_ids: [...],          // existing — ids of all actions written
  completed_groups: [         // NEW — groups that transitioned to `done` in this call
    { workflow_id, id, on_complete? }  // on_complete carries the YAML path from
                                       // workflows_config so the caller can route
  ]
}
```

`completed_groups` is populated when step 2 transitioned a group to `done` (from any other status). Groups that were already `done` before this call don't appear. The outer orchestration layer reads this list and fans out to hook invocations (Decision 6).

**Idempotency / retry.** Step 2 is idempotent: writing the same `groups[]` array twice produces the same state. Step 3 is idempotent: the priority transition rule no-ops repeated stage pushes. Step 7's `completed_groups` is computed from step 2's transitions, so a retry that no-ops step 2 returns an empty `completed_groups` — the hook does not fire twice. Matches the design's existing partial-state-plus-retry model.

**Recursion bound.** Step 3 may push actions to `action-required`, which doesn't trigger another `UpdateWorkflowActions` invocation — the transition is a write, not a request. Group `on_complete` hooks (invoked at Layer 1, outside `UpdateWorkflowActions`) may themselves call `submit-action`, which calls `UpdateWorkflowActions` recursively. The existing tracker-update depth-limit story (engine sub-design open question 1) extends here: same proposed guard, same default of 10 levels.

## Decision 6 — `on_complete` invocation (defers to a follow-up sub-design)

A group with `on_complete: <yaml-path>` declared in its workflow YAML wants its routine fired once, when the group transitions to `done`.

**What this sub-design commits:**

- `UpdateWorkflowActions` returns `completed_groups` from its handler (Decision 5 step 7). Each entry carries the `on_complete` path declared in YAML (or null).
- The invocation is **at Layer 1** — a Lowdefy routine step that runs after `UpdateWorkflowActions` returns. The plugin handler does not call APIs; orchestration stays in routine YAML.
- Invocation rules:
  - Fire **at most once per group per workflow lifetime** — the group transitions `blocked` → `in-progress` → `done`, not back. Same priority semantics as action statuses (`done` is terminal in the three-value enum).
  - Do **not** fire on `CancelWorkflow` — cancellation flips actions to `not-required` and groups to `done`, but the hook is for natural completion, not for cleanup-on-cancel. Engine distinguishes via the call site: `CancelWorkflow` doesn't populate `completed_groups`.
  - **Reuse the same `eventId`** as the triggering call (existing engine convention for tracker subscription updates).

**What's deferred:** the _mechanism_ by which the routine fans out one `CallApi` per entry in `completed_groups`. Lowdefy's idioms for "do N variable-length API calls inside a routine" need vetting against real-world usage before locking the shape. Candidate mechanisms:

- **Per-group generated endpoints.** `makeWorkflowApis` (action-authoring sub-design "Decision 5") generates one endpoint per declared `on_complete` — `{workflow_type}-{group_id}-on-complete` — and `submit-action`'s routine `CallApi`s each. Requires a fanout primitive in Lowdefy routine YAML (`ForEach`-equivalent over an array).
- **A dispatcher API.** One module-level `dispatch-group-hooks` API takes `completed_groups` as payload and resolves to each group's routine inside the dispatcher's own server-side code. Removes the fanout-primitive requirement but adds an indirection layer.
- **Plugin-side invocation.** The connection handler itself calls back into the Lowdefy API runtime to fire hooks. Conflates layers (rejected on first principles — connections do DB-shaped work, orchestration belongs in routines) but listed for completeness.

Each candidate has implications for retry behaviour, error reporting, and authoring. The follow-up sub-design (working title: `api-hooks`) will pick one. Until then, the action-groups design commits to _what_ happens; _how_ it happens is the follow-up's scope.

**Behaviour without `on_complete`.** Groups without an `on_complete` declared have no hook to fire — they appear in `completed_groups` with `on_complete: null` and the routine no-ops for them.

## Interaction with the other sub-designs

This sub-design is layered on top of the existing four; the affected surfaces:

- **[action-authoring](../action-authoring/design.md)** — `action_groups:` becomes a top-level workflow field (Decision 1); `blocked_by` grammar expands to accept group IDs (Decision 2). The action-status enum and form components library are untouched.
- **[engine](../engine/design.md)** — `UpdateWorkflowActions` gains two ordered steps and a new return-value key (Decision 5). The plugin handler files (`handleUpdateActions.js` + helpers) grow group-computation utilities. No new collection or connection.
- **[ui](../ui/design.md)** — `actions-on-entity` reads persisted `groups[]` from `get-entity-workflows` instead of computing groupings from action lists. `workflow-header` MAY surface the current group as a milestone label (open question). No new components.
- **[module-surface](../module-surface/design.md)** — `submit-action`'s routine grows the hook-invocation step (Decision 6, mechanism TBD). `get-entity-workflows` returns the persisted `groups[]` payload directly. No new APIs.

The parent [workflows-module design](../design.md) gets a fifth row in its sub-design table and a brief mention in the framing.

## Worked example — phase transition end-to-end

Using the parent design's onboarding workflow with action groups elevated:

```yaml
# workflow_config/onboarding/onboarding.yaml
type: onboarding
title: Onboarding
entity_type: lead
display_order: 1
action_groups:
  - id: phase-1
    title: Discovery
    on_complete: workflow_config/onboarding/api/phase-1-complete.yaml
  - id: phase-2
    title: Quote
  - id: phase-3
    title: Installation
starting_actions:
  - { type: qualify, status: action-required }
  - { type: send-quote, status: blocked }
  - { type: schedule-followup, status: blocked }
  - { type: track-installation, status: blocked }
actions:
  - _ref: ./qualify.yaml # action_group: phase-1
  - _ref: ./send-quote.yaml # action_group: phase-1, blocked_by: [qualify]
  - _ref: ./schedule-followup.yaml # action_group: phase-2, blocked_by: [phase-1]
  - _ref: ./track-installation.yaml # action_group: phase-3, blocked_by: [phase-2]
```

```yaml
# workflow_config/onboarding/api/phase-1-complete.yaml
- id: emit_event
  type: CallApi
  endpointId: { _module.endpointId: { id: new-event, module: events } }
  payload:
    type: onboarding-phase-1-complete
    references:
      lead_ids: [{ _payload: entity_id }]
- id: write_entity
  type: MongoDBUpdateOne
  connectionId: leads-collection
  properties:
    filter: { _id: { _payload: entity_id } }
    update: { $set: { stage: qualified } }
```

**Runtime sequence when the user submits `send-quote` (last open action in phase-1):**

1. App page calls the generated `workflows/onboarding-send-quote-submit` endpoint.
2. Endpoint runs `send-quote`'s submit hook → `CallApi submit-action`.
3. `submit-action`'s routine:
   - Step `update_actions` → `UpdateWorkflowActions`:
     1. Writes `send-quote.status[0] = done`.
     2. Recomputes affected groups: phase-1 now has every action terminal → `groups[0].status = done`. Writes `groups[]` to the workflow doc.
     3. Re-evaluates `blocked_by` on every `blocked` action. `schedule-followup` had `blocked_by: [phase-1]`; phase-1 is now `done` → push `action-required`.
     4. Auto-complete check on the workflow: `schedule-followup` and `track-installation` still open → no workflow transition.
     5. Tracker subscription: no workflow status change in this call → skip.
     6. Recompute workflow summary.
     7. Return `{ action_ids: [send-quote, schedule-followup], completed_groups: [{ workflow_id, id: phase-1, on_complete: '<path>' }] }`.
   - Step (Decision 6, TBD mechanism) → fan out one `CallApi` per `completed_groups` entry → `phase-1-complete` routine runs → emits event + writes `lead.stage = qualified`.
   - Step `new_event` → emits the action-level event for `send-quote`'s own submit (if declared).
   - Step `notify` → notifications dispatch if opted in.
4. App page receives the success response; re-renders the workflow with phase-1 collapsed (`done`), phase-2's `schedule-followup` showing as `action-required`, phase-3 unchanged.

This one submission exercises every step in Decision 5 plus the deferred Decision 6 hook fan-out.

## Open Questions

1. **Fanout primitive at Layer 1.** Locked in the follow-up sub-design. Current candidates: routine-level loop (`ForEach`-equivalent), dispatcher API, or plugin-side invocation. Until decided, action-groups can ship with hook invocation stubbed — `UpdateWorkflowActions` returns `completed_groups` cleanly even if the orchestration layer doesn't fan out yet, so engine work proceeds in parallel.
2. **`workflow-header` milestone label.** The existing UI sub-design proposes a milestone label as "the highest-priority `status_title` of any non-blocked action." With persisted group state, the natural label becomes "the title of the current group" (lowest-ordered group not in `done`). v1 ships the group-based label; the action-based label is retired.
3. **Auto-complete consistency.** When the last group completes, the workflow itself auto-completes (existing behaviour). The hook for the last group fires _before_ the workflow auto-completes (Decision 5 step 3 runs before step 4). Authors can rely on the order; the README documents it.

## Risks

- **`groups[]` write contention.** Same family as `summary` write contention (engine sub-design "Workflow-doc write contention"). Same mitigation — the `summary_dirty: true` opt-in lazy mode also defers `groups[]` writeback. Default stays eager.
- **`on_complete` retry duplication / loss.** If `submit-action` retries mid-routine after `UpdateWorkflowActions` succeeded but before the hook-invocation step ran, the next retry of `UpdateWorkflowActions` returns `completed_groups: []` (the group is already `done`; no transition happens), so the hook does not fire. **The hook is missed entirely** in that retry shape. Mitigation: idempotent hooks (apps write hooks that can be re-run safely); the periodic reconciliation job extends to "groups in `done` whose `on_complete` audit-event is missing." Same risk class as the event / notification leak documented in module-surface "Composition error semantics."
- **`blocked_by` evaluation cost.** Step 3 scans every blocked action in the workflow on every transition. For typical workflows (<20 actions) this is negligible. For pathologically large workflows the scan is O(N) per transition; if real apps surface this, a "dirty group" index can prune the scan to actions whose dependencies just changed. Listed as a v2 optimisation.

## Next Step

After this sub-design is reviewed, follow up with the `api-hooks` sub-design (or whatever the natural name turns out to be) covering the orchestration mechanism for hook fan-out. Together they make group `on_complete` end-to-end functional. Implementation can proceed on engine work (Decisions 1–5) in parallel with the api-hooks discussion — the `completed_groups` return value lands first; the hook invocation step plugs in once the mechanism is locked.
