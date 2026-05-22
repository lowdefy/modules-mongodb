# Task 3: Ship `components/actions-on-entity.yaml`

## Context

`actions-on-entity` is the entity-page widget — host apps drop it onto their own entity pages (e.g. `lead-view`, `ticket-view`) to surface all workflows attached to that entity. It calls `get-entity-workflows`, iterates the returned workflows, and per workflow renders a `workflow-header` (task 2) whose collapsible slot contains a single `ActionSteps` block from the modules-mongodb plugins package.

Depends on task 2 (`workflow-header`). Also depends on the `ActionSteps` block at [plugins/modules-mongodb-plugins/src/blocks/ActionSteps/](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/), which is already shipped (commit `13895bf`). The `get-entity-workflows` Api at [modules/workflows/api/get-entity-workflows.yaml](../../../../modules/workflows/api/get-entity-workflows.yaml) is also already shipped.

The component does no rendering of per-action form data — it feeds data into `ActionSteps`, which owns the per-group + per-action visual surface internally. Per-action drill-downs happen by clicking through to the action's own `-view` / `-edit` / `-review` / `-error` page via `ActionSteps`'s built-in `Link` on each row.

## Task

Create `modules/workflows/components/actions-on-entity.yaml`.

**Vars contract:**

| Var | Type | Required | Description |
| --- | --- | --- | --- |
| `entity_id` | string | yes | The entity's `_id`. Passed to `get-entity-workflows.payload.entity_id`. |
| `entity_collection` | string | yes | The entity's MongoDB collection name. Passed to `get-entity-workflows.payload.entity_collection`. |

**Caller call shape** (the externally-stable contract):

```yaml
- _ref:
    module: workflows
    component: actions-on-entity
    vars:
      entity_id: { _state: lead._id }
      entity_collection: leads
```

**Runtime structure:**

1. **Outer `Box`** carrying an `onMount` event that fires `CallApi` to `get-entity-workflows` ([part 19](../../_completed/19-operational-apis/design.md), already shipped). Payload: `{ entity_id: _var.entity_id, entity_collection: _var.entity_collection }`. Capture the result to `_state.entity_workflows` via the action chain (a `SetState` step after the `CallApi`).

   **Use `onMount`, not `onInit`** — the entity page owns the page-level `onInit`; this component fetches on mount to avoid blocking the entity-page render. Matches the events-timeline pattern at [modules/events/components/events-timeline.yaml:7-11](../../../../modules/events/components/events-timeline.yaml).

   **Use `CallApi`, not `Request`** — the data path goes through the module's Api layer; `CallApi` invokes the shipped Api routine.

2. **List of workflow rows** rendering one entry per element in `_state.entity_workflows.workflows[]` (matching the Api's return shape — verify against [get-entity-workflows.yaml](../../../../modules/workflows/api/get-entity-workflows.yaml)'s `:return:` step). Use a `List` block or `_build.array.map` to iterate.

3. **Per workflow** — `_ref` `workflow-header.yaml` with:

   ```yaml
   - _ref:
       path: workflow-header.yaml
       vars:
         workflow: { _var: workflow }                # current iteration item
         collapsed_default:
           _eq:
             - _var: workflow.status.0.stage
             - completed
         is_overview_page: false
         blocks:
           - id: action_steps_<workflow._id>          # id-scope by workflow
             type: ActionSteps
             properties:
               actionGroupConfig: <built per below>
               items: <built per below>
   ```

**Client-side data prep for `ActionSteps`** (the data transforms — implement either with operator chains or a small `_js` block, whichever reads more clearly per CLAUDE.md):

- **`actionGroupConfig`** — a map keyed by `action_group` id with `{ order, title, icon? }`. Build from `_global.workflows_config[workflow.workflow_type].action_groups[]` by iterating with index for `order` and reading `title` + `icon?` off each entry. Same `_global` join as task 2's group-title resolution.

  Example output:
  ```js
  {
    "phase-1-qualify": { order: 0, title: "Phase 1 — Qualify", icon: "AiOutlineFlag" },
    "phase-2-quote":   { order: 1, title: "Phase 2 — Quote" },
    "phase-3-deliver": { order: 2, title: "Phase 3 — Deliver" }
  }
  ```

- **`items`** — array of `{ action_group, actions: [...] }`. Build by iterating `workflow.groups[]` in persisted order. Per group:
  1. Filter `workflow.actions` where `action.action_group === group.id`.
  2. Sort by `(sort_order ASC, _id ASC)` — matches the shipped `get-workflow-overview` tie-breaker.
  3. Map each action to `{ status: action.status.0.stage, message: <Nunjucks-rendered status_map cell>, link: <status_map cell.link if present> }`.

  The status-map cell consulted is `action.status_map[action.status.0.stage][_module.var: app_name]`. Empty / missing cells → no `message`, no `link` (the action row still renders with the badge).

  Example output:
  ```js
  [
    {
      action_group: "phase-1-qualify",
      actions: [
        { status: "done", message: "Lead qualified", link: { pageId: "lead-onboarding-qualify-view", urlQuery: { action_id: "..." } } },
        { status: "in-progress", message: "Awaiting quote", link: null }
      ]
    },
    ...
  ]
  ```

  **Keyed actions** surface as N rows within their parent group's `actions[]`, one per instance — `get-entity-workflows` already returns each keyed instance as its own action doc, so no special-casing.

  **Tracker actions** flow through the same shape — no inline-only special case. Their `link` is resolved from `status_map` exactly like form / task actions.

**Implementation choice — operators vs `_js`** — the `items` build is non-trivial (filter, sort, map per group). Per CLAUDE.md "Operators before `_js`": prefer operator chains, fall back to a small `_js` when chaining gets deeply nested. The Nunjucks-rendering of the status_map message can be done inline via `_nunjucks` or by passing the raw string to `ActionSteps` (the block renders HTML in `message` per its README). Pick what reads more cleanly.

## Acceptance Criteria

- File exists at `modules/workflows/components/actions-on-entity.yaml`.
- `pnpm ldf:b` on `apps/demo` builds cleanly.
- When dropped on a host-app entity page (e.g. a future lead-view page in Part 27):
  - On mount, fires `get-entity-workflows` with the entity's `_id` and `collection`.
  - Renders one `workflow-header` strip per workflow returned, ordered by the Api's `display_order` ASC / `created.timestamp` DESC sort (the Api already applies this; the component just iterates).
  - Each header's slot contains one `ActionSteps` block fed `items` (groups with sorted actions) + `actionGroupConfig` (titles, order from `workflows_config`).
  - Completed workflows render collapsed by default (`collapsed_default: true`).
  - Clicking an action row in `ActionSteps` navigates to the page configured by that action's `status_map.{stage}.{app_name}.link`.
  - Tracker actions navigate to the linked child workflow's `workflow-overview` page when their status_map has a `link`.
- No form-data rendering in the widget itself; per-action drill-downs go via `ActionSteps`'s row link.

## Files

- `modules/workflows/components/actions-on-entity.yaml` — **create** — the widget per the spec above.

## Notes

- **Refresh strategy is remount-on-back-nav.** Don't add a `SocketIoSubscriber` or any explicit refresh signal. Part 16's submit templates navigate to `-view`; back-nav remounts the entity page, which remounts this widget, which re-fires `get-entity-workflows`. Documented in design.md "Refresh after submit."
- **`ActionSteps` props reference** — see [plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md) for the full prop contract including the status table (which `status_map` values map to which step / badge state).
- **`_module.var: app_name`** — the status_map cell selection needs the host app's name. Read via `_module.var: app_name` per CLAUDE.md's `app_name` idiom and the shipped `access_filter.yaml` precedent.
- **`get-entity-workflows` return shape** — verify the top-level key the routine returns. The current routine's `:return:` step writes `{ workflows: _step: query }`, so the captured state shape is `_state.entity_workflows.workflows[]` if the `CallApi` result is captured to `entity_workflows`. Adjust the state key per the actual capture target.
- **Empty entity (no workflows)** — render nothing (empty list). No "no workflows" placeholder in v1; if a host app wants one, they can wrap the component.
- **Per CLAUDE.md** snake_case block IDs (`action_steps_<id>`, etc.), kebab-case component filename (already `actions-on-entity.yaml`).
- **No unit tests** for the YAML; e2e in Part 22.
