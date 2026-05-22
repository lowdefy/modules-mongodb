# Task 7: Add workflow buttons + actions-on-entity to lead-view

## Context

After task 6, `apps/demo` pulls in the workflows module and resolves cross-module `_ref`s. The lead-view page from task 5 currently renders the lead's `name` and `email` with an empty placeholder where workflows go. This task wires the workflows-module surface onto lead-view so the demo can exercise the static surface end-to-end.

Three additions:

1. **`actions-on-entity` component** rendered below the lead's `name`/`email`. This is the module-shipped component from [part 18](../../18-entity-components/design.md) that surfaces every workflow attached to one entity with its action list. Drop it onto the page via `_ref: { module: workflows, component: actions-on-entity, vars: { entity_id, entity_collection } }`.
2. **"Start onboarding" button** that calls the `start-workflow` API to instantiate an `onboarding` workflow on the current lead.
3. **Admin-style "Close installation child" and "Cancel installation child" buttons** that call `close-workflow` / `cancel-workflow` against the child `installation` workflow's id. These drive the child's lifecycle (per design § "Child workflow rendering — skipped in 20a") because the child's `task-edit` page isn't surfaced in this part.

When 20b lands, the admin-style buttons get removed and the parent tracker action will link into the child's `task-edit` page directly. For 20a, they're the only way the demo drives child-workflow status transitions.

API call shape — the demo uses `CallApi` (or whatever Lowdefy primitive is available at the time; if the `callApi` primitive from [part 01](../../01-call-api-primitive/design.md) hasn't shipped yet, use the inline `Request` block pattern that exists in v0 demo pages). Endpoints to call:

- `start-workflow` — payload: `{ workflow_type: 'onboarding', entity_id: <lead._id>, entity_collection: 'leads-collection' }`. No `parent_action_id` for the top-level call (the engine starts the child workflow internally for each tracker action via its `start-workflow` invocation with `parent_action_id` set — confirm by reading [part 5](../../05-start-cancel-handlers/design.md)).
- `close-workflow` — payload: `{ workflow_id: <child workflow id> }`. The child id needs to be discoverable from the parent tracker action's `child_workflow_id` field (returned by `get-entity-workflows`).
- `cancel-workflow` — same shape as close-workflow.

API IDs are scoped — refer to them via `_module.endpointId: { id: start-workflow, module: workflows }` (or whichever shape the demo uses).

## Task

Modify `apps/demo/pages/leads/lead-view.yaml` to add the following blocks below the existing `name`/`email` display.

### 1. `actions-on-entity` component

```yaml
- id: workflows_section
  type: Box
  blocks:
    - _ref:
        module: workflows
        component: actions-on-entity
        vars:
          entity_id:
            _state: _id
          entity_collection: leads-collection
```

Read the component's prop signature from `modules/workflows/components/actions-on-entity.yaml` to confirm the vars shape — adjust if the component expects different var names.

### 2. "Start onboarding" button

A button (or `Button`/`CallApi` pair) that fires `start-workflow` with the lead's `_id`. Disable the button when an `onboarding` workflow already exists on the lead (read this from the data `actions-on-entity` already fetched, or fire a separate `get-entity-workflows` request).

Skeleton:

```yaml
- id: start_onboarding_btn
  type: Button
  properties:
    title: Start onboarding
  events:
    onClick:
      - id: start
        type: CallApi
        params:
          endpointId:
            _module.endpointId:
              module: workflows
              id: start-workflow
          payload:
            workflow_type: onboarding
            entity_id:
              _state: _id
            entity_collection: leads-collection
      - id: refetch
        type: Reset   # or whatever triggers actions-on-entity to refetch
```

### 3. Admin-style "Close installation child" + "Cancel installation child" buttons

Each button needs the child workflow's `_id`. The `actions-on-entity` data exposes `child_workflow_id` on each tracker action. Pick the first tracker action whose `child_workflow_id` is non-null. If the demo's actions-on-entity output isn't easy to drill into, fall back: fire `get-entity-workflows` on mount, find the workflow whose `workflow_type` is `onboarding`, find the first action whose `child_workflow_id` is set, save it to `_state.installation_child_id`. The buttons read `_state.installation_child_id` for the payload's `workflow_id`.

The "Close installation child" button — visible only when `_state.installation_child_id` is set — fires `close-workflow` with `{ workflow_id: _state.installation_child_id }`. After completion, refetch `actions-on-entity`.

The "Cancel installation child" button mirrors close but calls `cancel-workflow`.

Label both buttons as `[admin]` in their text so the demo audience knows these are temporary admin-style shims; they will be removed in 20b.

## Acceptance Criteria

- `lead-view` renders `actions-on-entity` below the lead's `name`/`email`.
- After clicking "Start onboarding" on a fresh lead, `actions-on-entity` re-renders showing three tracker actions: first in `action-required`, others in `blocked`.
- The "Close installation child" button calls `close-workflow` against the right child id; after completion, the parent tracker action transitions to `done` and the next tracker unblocks to `action-required`.
- The "Cancel installation child" button calls `cancel-workflow` against the same id with the same effect (transitions the tracker to `not-required`, blocks remaining trackers via the `blocked_by` chain).
- `lead-view` still builds cleanly.
- No new placeholder `_ref` errors anywhere in the build.

## Files

- `apps/demo/pages/leads/lead-view.yaml` — **modify**

## Notes

- The exact button vocabulary (`Button`, `CallApi` event type vs inline `Request`) depends on whether [part 01](../../01-call-api-primitive/design.md) has shipped. If `CallApi` isn't yet a Lowdefy action type at this point in the timeline, use the existing v0 pattern (inline `Request` + manual refetch). The design notes 20a does NOT depend on part 01 — so prefer the v0 pattern.
- Verify the `start-workflow` endpoint's payload shape by reading `modules/workflows/api/start-workflow.yaml` before wiring the button.
- The "admin-style" framing in the button labels is intentional — these buttons are scaffolding for 20a. The 20b task list will remove them.
- `actions-on-entity` may auto-refetch on the page's request changes — if not, wire an explicit refetch trigger after each button-driven API call. Confirm by reading `modules/workflows/components/actions-on-entity.yaml`.
- A "Workflows" entry on the CRM menu is mentioned in the design (line 114) — that's a nice-to-have but not required for the verification walk-through. If easy, add it; if it expands scope, skip.
