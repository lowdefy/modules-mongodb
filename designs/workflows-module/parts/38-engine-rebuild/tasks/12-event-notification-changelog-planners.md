# Task 12: Event / notification / change-log planners

## Context

The remaining three plan-phase planners build the event payload (rendered against planned post-state), notification payloads, and the change-log deltas. They consume the render layer (task 3) and phase types (task 9). `planEventDispatch` absorbs the template constants from the deleted `dispatchLogEvent.js` (the dispatch action itself moves to commit).

## Task

**Create `shared/phases/planners/planEventDispatch.js`:**

- Compose + render the event payload(s). Three source layers merged via `mergeEventOverrides` (carried from Part 30): engine default → YAML override → pre-hook return, all plain Nunjucks strings, rendered during the plan phase.
- **Branch on handler/event type to pick the render context** (D12):
  - **Action-event context** (for `action-{interaction}` and the tracker-mirror `action-internal-mirror-{state}` event — both have a single target action):
    ```js
    { user, action: plannedActionDoc, workflow: plannedWorkflowDoc,
      interaction: signal, status_before, status_after, submitted_form }
    ```
    `submitted_form` is the pre-merged form from `planFormDataMerge` (task 11). `workflow.form_data` remains available for cross-action templates.
  - **Workflow-lifecycle context** (for `workflow-started` / `workflow-cancelled` / `workflow-closed` — no single target action):
    ```js
    { user, workflow: plannedWorkflowDoc, interaction: signal }
    ```
- Engine-default titles are plain Nunjucks strings per the "Engine entry points emit events" table:
  - `StartWorkflow` → `workflow-started` → `{{ user.profile.name }} started {{ workflow.workflow_type }}`
  - `SubmitWorkflowAction` → `action-{interaction}` → `{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}`
  - `CancelWorkflow` → `workflow-cancelled` → `{{ user.profile.name }} cancelled {{ workflow.workflow_type }}`
  - `CloseWorkflow` → `workflow-closed` → `{{ user.profile.name }} closed {{ workflow.workflow_type }}`
  - Tracker-mirror → `action-internal-mirror-{state}` → `Tracker mirrored child {{ status_after }}` (system event, lower prominence)
- One `event_id` per handler invocation, used as the dispatched event doc's `_id`.

**Create `shared/phases/planners/planNotifications.js`:**

- Compose notification payloads (per Part 8 / notifications module) from references/metadata already in the Plan. Does **not** propagate `notification_roles` onto the event (Non-goal — deferred to Part 41); recipient fan-out stays the notifications module's concern.

**Create `shared/phases/planners/planChangeLog.js`:**

- Build `log-changes` entries from before/after pairs accumulated during planning (D7).
- One entry per affected doc (N action transitions + 1 workflow update → N+1 entries), in the **community-plugin schema**: `{ type, args, before, after, response, timestamp, meta, blockId, connectionId, pageId, requestId, ... }`.
- `type` reflects the logical op: `MongoDBUpdateOne` for action/workflow update, `MongoDBInsertOne` for an action insert.
- `before` = loaded doc (null for inserts); `after` = planned doc.
- `meta` resolved from `connection.changeLog.meta` (e.g. current user via `_user`).
- Request-context fields shared across all entries from one invocation.
- **Opt-out:** when `changeLog` is not configured, produce **no** entries (same as the community plugin).
- Do **not** double-log events (the events module's own `changeLog` logs the `new-event` write) or notifications. No engine-specific fields (`commit_id` etc. — Non-goal).

## Acceptance Criteria

- `planEventDispatch` selects the correct context per event type (action-event vs workflow-lifecycle), asserted **separately** in tests; tracker-mirror uses the action-event context.
- Three-source override merge order correct; per-event-type defaults render as specified.
- `planChangeLog` emits N+1 community-schema entries with correct before/after and `meta`; emits **nothing** when `changeLog` is unconfigured.
- `planNotifications` builds payloads without propagating `notification_roles`.
- Tests: `planEventDispatch.test.js` (both contexts asserted separately, override layering, per-type defaults, branch assertion), `planChangeLog.test.js` (entry-per-doc, community schema, before/after sourcing, meta resolution, opt-out), notification payload tests.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planNotifications.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planChangeLog.js` — create
- `…/planners/planEventDispatch.test.js` — create
- `…/planners/planNotifications.test.js` — create
- `…/planners/planChangeLog.test.js` — create

## Notes

- The engine-default templates are plain Nunjucks strings (idioms.md § Event display) — the rewrite from object templates is part of this.
- `planChangeLog` reproduces the community plugin's `log-changes` output so a reader can't distinguish engine-written from plugin-written entries except by `type`/content.
