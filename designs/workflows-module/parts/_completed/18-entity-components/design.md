# Part 18 — Entity-page components

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md). **Layer:** UI delivery. **Size:** M. **Repo:** `modules/workflows/components/`.

## Goal

Ship the three entity-page components that consuming apps drop onto their own entity pages: `actions-on-entity` (the workflow widget), `workflow-header` (per-workflow strip), and `action_role_check` (role gate primitive).

## In scope

### `components/actions-on-entity.yaml`

The entity-page widget — host apps drop it onto their entity pages to surface all workflows attached to that entity.

**Call shape** (on a host app's entity page):

```yaml
- _ref:
    module: workflows
    component: actions-on-entity
    vars:
      entity_id: { _state: lead._id }
      entity_collection: leads
```

**Vars contract:**

| Var                 | Type   | Required | Description                                                                                                                                            |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entity_id`         | string | yes      | The entity's `_id`. Passed straight through to `get-entity-workflows`'s `payload.entity_id`.                                                            |
| `entity_collection` | string | yes      | The entity's MongoDB collection name (per [part 21](../_completed/21-entity-type-to-collection/design.md)). Passed straight through to `get-entity-workflows`'s `payload.entity_collection`. |

The component's behaviour (iteration, client-side grouping + sort, `ActionSteps` data prep) is hardcoded; callers don't customize it beyond the two ids. Per-action rendering itself is delegated to the `ActionSteps` block — see "Client-side data prep for `ActionSteps`" below.

**Runtime behaviour:**

- Fetches workflows on `onMount` (not `onInit` — concept ui/review-1 #1) via `CallApi` to `get-entity-workflows` ([part 19](../_completed/19-operational-apis/design.md)). `CallApi` is deliberate because the data path goes through the module's Api layer (ui/review-1 #2). The Api returns each workflow with a flat `actions: [...]` array (every access-filtered action, no nesting or sort) — bucketing into groups is done client-side per "Client-side data prep for `ActionSteps`" below.
- Iterates returned workflows by `display_order` ASC, with `created.timestamp` DESC as tie-break.
- Per workflow:
  - `_ref`s `workflow-header` (this part) with the workflow doc as `workflow:`. The collapsible content (`blocks:`) is **a single [`ActionSteps`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md) block** fed the per-workflow `items` and `actionGroupConfig` payloads built client-side. No form-data rendering, no per-action card body — per-action drill-downs are reached by clicking through to the action's `-view` / `-edit` / `-review` / `-error` page via `ActionSteps`'s built-in `Link` on each row.
  - `collapsed_default` is `true` when `workflow.status[0].stage === 'completed'` (matches the completed-workflow auto-collapse rule), `false` otherwise.
- Tracker actions are not special-cased — they flow through the same `ActionSteps` item shape as form / task actions, with their `link` resolved from `status_map.{current_stage}.{vars.app_name}.link` per concept [ui/spec.md § Status-map binding](../../../workflows-module-concept/ui/spec.md) and [part 17 design.md:53](../17-shared-pages/design.md).

**Client-side data prep for `ActionSteps`.** The component builds two payloads per workflow and passes them straight to the bundled `ActionSteps` block from [`plugins/modules-mongodb-plugins`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md). `ActionSteps` owns the rendering (Antd `Steps` view, per-group badge rollup, per-action row with `Link`); `actions-on-entity` owns the data transform.

- **`actionGroupConfig`** — a map keyed by `action_group` id with `{ order, title, icon? }`. Built from `_global.workflows_config[workflow.workflow_type].action_groups[]` by iterating with index for `order` and looking up `title` (and optional `icon`) off each entry. Same `_global` join as the "Group title resolution" rule under `workflow-header`.
- **`items`** — an array of `{ action_group, actions: [...] }`. Built by iterating `workflow.groups[]` in persisted order. Per group: filter `workflow.actions` where `action.action_group === group.id`, sort by `(sort_order ASC, _id ASC)` (matches the shipped `get-workflow-overview` `$sort: { _group_index: 1, sort_order: 1, _id: 1 }` tie-breaker), then map each action to `{ status: action.status[0].stage, message: <Nunjucks-rendered status_map cell>, link: <status_map cell.link if present> }`. Keyed actions surface as N entries within their parent group's `actions[]`, one per instance, since `get-entity-workflows` already returns each keyed instance as its own action doc.

The `status_map` cell consulted is `action.status_map[action.status[0].stage][_module.var: app_name]`. Empty / missing cells render no message and no link (the action row still renders with the badge).

**Per-group title link (Part 25 extension).** [Part 25](../25-group-overview-page/design.md) extends this `actionGroupConfig` builder to also write `link: { pageId, urlQuery: { workflow_id, group_id } }` on every group, so each group title becomes a clickable navigation surface into the `group-overview` page. The block-level `actionGroupConfig[group].link` slot is already shipped; Part 25's edit is in the `_js` builder only.

**Why `ActionSteps` instead of composing rows in Lowdefy YAML.** v0 used the same plugin block (`apps/prp-team/pages/tickets/ticket-view/components/action_groups.yaml`); the block is already shipped from `plugins/modules-mongodb-plugins` ([`src/blocks/ActionSteps/`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/)) and handles per-group status rollup, per-action badge rendering, and Antd theme-token integration internally. Composing the same tree in Lowdefy YAML would duplicate that logic and lose the theme integration. Trade-off: `actions-on-entity` adds a plugin dependency that wasn't strictly necessary for the previous row-rendering design, but the dependency already exists in the module via other shipped blocks.

**Why the Api stays closed.** `get-entity-workflows` doesn't bucket actions by group or sort them. The component does both client-side, same trade-off as "Group title resolution": keeps the shipped Api closed; the marginal client-side cost is one filter+sort+map per group per workflow per render. If a future consumer outside `actions-on-entity` needs the Api to do the bucketing itself, lift the `_group_index`/`sort_order`/`_id` sort step from `get-workflow-overview` into `get-entity-workflows` then.

### `components/workflow-header.yaml`

A `_ref`-able component rendered as a per-workflow strip plus a slot for collapsible content. Used by two callers in v1: `actions-on-entity` (this part, one header per workflow in the iteration, slot = a single `ActionSteps` block per workflow) and `workflow-overview` ([part 17 design.md:46](../17-shared-pages/design.md), one header per page, slot = action card list). Same data shape, same component, no per-caller modes — the collapse toggle hides whatever the caller passes in `blocks:`.

**Call shape:**

```yaml
# actions-on-entity (this part) — one per workflow in the iteration
- _ref:
    path: workflow-header.yaml
    vars:
      workflow: { _var: workflow }
      collapsed_default:
        _eq:
          - _var: workflow.status.0.stage
          - completed
      is_overview_page: false
      blocks:
        - id: action_steps
          type: ActionSteps
          properties:
            actionGroupConfig: { <client-side map, see "Client-side data prep for `ActionSteps`" under actions-on-entity> }
            items: { <client-side items array, see same> }

# workflow-overview (part 17)
- _ref:
    path: ../components/workflow-header.yaml
    vars:
      workflow: { _request: get-workflow-overview.workflow }
      is_overview_page: true
      blocks:
        - <list of action cards>
```

**Vars contract:**

| Var                 | Type            | Required | Description                                                                                                                                                                                                                                                                                                                              |
| ------------------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow`          | object          | yes      | The workflow doc. Must carry `_id`, `workflow_type`, `status[0].stage`, `summary.{done, not_required, total}`, and `groups[]` with `{ id, status, summary }` as persisted by [`recomputeGroups.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js). Group titles are not on the doc — the component resolves them from `_global: workflows_config[workflow.workflow_type].action_groups[]` by `id` (see "Group title resolution" below). Source: an element of `get-entity-workflows`'s `workflows[]` for the entity-page caller; the top-level `workflow` field of `get-workflow-overview`'s response for the overview-page caller. |
| `blocks`            | array of blocks | yes      | Collapsible content the toggle hides/shows. On the entity page (`actions-on-entity`) the caller passes a single `ActionSteps` block — no form-data rendering, no per-action card body, just the steps tree. On `workflow-overview` (part 17) the caller passes the action card list, which is where the per-action `form_data` rendering lives. The component renders the strip (title, lifecycle badge, summary counts, milestone label, toggle, workflow-overview link) then renders `blocks` underneath; the toggle controls a `Box`'s `visible` around `blocks`. |
| `collapsed_default` | boolean         | no, default `false` | Initial collapse state. Lets `actions-on-entity` ship a completed-workflow row pre-collapsed (per the "Completed workflow: collapsed tile with a check mark" rule in concept ui/spec.md § `actions-on-entity` states) while `workflow-overview` keeps expanded by default. Ephemeral per render — collapse state persistence is the open question in [Open questions](#open-questions). |
| `is_overview_page` | boolean         | no, default `false` | Suppresses the workflow-overview link button when the host page is itself `workflow-overview` (otherwise the button would link the page to itself). `actions-on-entity` always passes `false`; part 17's `workflow-overview` passes `true`. |

**What the component renders (the strip):**

- **Title** — `workflowsConfig.{workflow.workflow_type}.title` via `_global: workflows_config` lookup. The workflow doc carries `workflow_type` (per [`StartWorkflow.js:77`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js)), not a `title` field — human-readable titles live in build-time `workflowsConfig`.
- **Workflow-overview link button** — Tooltip-wrapped icon button (Antd `LuWorkflow` icon, matching v0's `apps/prp-team/pages/tickets/ticket-view/components/action_groups.yaml`) that navigates to `workflow-overview?workflow_id=<workflow._id>` via Lowdefy `Link`. The button is suppressed when the host page *is* `workflow-overview` (per the `is_overview_page` var below) — otherwise the page would link to itself.
- **Lifecycle stage badge** — `workflow.status[0].stage` rendered with `global.workflow_lifecycle_stages` display attributes.
- **Summary counts** — `workflow.summary.{done, not_required, total}` (e.g. "3 of 7 done").
- **Current-phase milestone** — title of the lowest-ordered group whose `status !== done` (concept's group-based milestone rule); falls back to the workflow's title when every group is `done` (per [ui/spec.md § `workflow-header`](../../../workflows-module-concept/ui/spec.md)). Title comes from the same `_global: workflows_config` join as group titles below.
- **Collapse / expand toggle** — initial state from `collapsed_default`; controls visibility of `blocks`.

**Group title resolution.** The persisted `groups[]` on the workflow doc carries `{ id, status, summary }` only ([`recomputeGroups.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js)); group titles live in build-time `workflowsConfig.{workflow_type}.action_groups[]` and are not denormalized onto the doc. The component resolves the milestone-label title (and any other place it shows a group title) by joining `workflow.groups[i].id` against `_global.workflows_config[workflow.workflow_type].action_groups[]` by `id`. The `actions-on-entity` per-group section headers use the same join. Trade-off: client-side cost is one `_global` chain per render; benefit is no reopening of the shipped engine helper or the shipped `get-entity-workflows` / `get-workflow-overview` Apis, and titles always reflect the current YAML rather than the title in effect when the workflow started.

**Consumers:**

- `actions-on-entity` (this part) — one header per workflow in the iteration.
- `workflow-overview` ([part 17 design.md:46](../17-shared-pages/design.md)) — one header at the top of the page.

**Module export:** declared in `exports.components` ([part 20](../20-module-manifest/design.md)) so host apps can `_ref` it independently if they need a workflow-header outside the two module-shipped surfaces. Cost is zero; gives apps a clean header primitive.

### `components/action_role_check.yaml`

A `_ref`-able YAML file containing an action sequence (not a block). Callers compose it as a step inside their page's `onMount` action list; the sequence reads the current user's roles, evaluates the role intersection against the action's `access` map, and writes the boolean result to `_state.action_allowed`. Downstream blocks gate on `_state.action_allowed === true`.

**Call shape** — same shape Part 16's shipped templates already use ([edit.yaml.njk:78-82](../../../../modules/workflows/templates/edit.yaml.njk)):

```yaml
- _ref:
    path: ../components/action_role_check.yaml
    vars:
      action_config:
        _var: action_config   # full action config — the sequence reads access.roles off it
```

**Vars contract:**

| Var            | Type   | Required | Description                                                                                                                |
| -------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `action_config` | object | yes      | The action's config object (carries `access.{app_name}` verb list and `access.roles`). Resolved by the caller from `_var: action_config` (part 16) or equivalent. |

**What the sequence does** — pure roles check, matching v0's `action_role_check.yaml` and the engine's submit-time gate at [`handleSubmit.js:115-124`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):

1. Reads the current user's roles via `_user: { _module.var: user_schema.roles_path }` (host app picks the roles field via `user_schema.roles_path`, default `roles`).
2. Computes the role intersection: `access.roles` ∩ user roles. Empty / missing `access.roles` ⇒ allowed (matches the engine's "empty or missing = no gate" rule).
3. `SetState`: writes the boolean to `_state.action_allowed`.

**No verb-membership check** — per-app verb gating happens upstream (page emission in [part 12](../12-resolver-pages/design.md) per the action's `access.{app_name}` list at build time, and query-time visibility in `get-entity-workflows` via [`access_filter.yaml`](../../../../modules/workflows/api/stages/access_filter.yaml)). By the time a page renders to the user, the question this primitive answers is "given that this user has access to *some* verb on this action, do their roles let them write?" — which is exactly the engine's submit-time question. Mirroring it client-side is defense in depth and avoids surfacing buttons the server will reject.

**Consumers (the externally-stable contract Part 18 commits to):**

- Part 16's four form-action templates (`edit` / `view` / `review` / `error`) call it at step 6 of the eight-step `onMount` sequence ([part 16 § Template `onMount` sequence](../_completed/16-page-templates/design.md)).
- Part 17's three task pages (`task-edit` / `task-view` / `task-review`) call it at the same step 6 ([part 17 design.md:136](../17-shared-pages/design.md)).
- Part 24's universal-fields component reads `_state.action_allowed` to switch its inputs to read-only when `false` ([part 24 design.md:73](../24-universal-fields/design.md)).

**Same logic, different layer**: the role-intersection rule is the same one the engine runs server-side at query time (`access_filter.yaml`) and submit time ([`handleSubmit.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)). `action_role_check` is the client-side mirror — defense in depth, surfacing the gate before the user submits.

### Module exports

These three components are exposed via `module.lowdefy.yaml`'s `exports.components` (declared in [part 20](../20-module-manifest/design.md)).

## Out of scope / deferred

- **Restricted-action display** — concept marks as open question. Hide for v1.
- **`workflow-history` timeline** mentioned in concept ui spec for status-map binding — out of v1 scope per the concept's component list (the exported set is the three above only).
- **Entity-kind label on `workflow-header`** — [part 17 design.md:90](../17-shared-pages/design.md) notes that `workflow-header` *may* consume `vars.entities[entity_collection].title` for an entity-kind label (e.g. "Lead: Onboarding"). Deferred to v1.x per [review-1 #14](review/review-1.md); adding it later is purely additive since `_module.var: entities` is already required at the manifest level.

## Depends on

[Part 19](../_completed/19-operational-apis/design.md) (`get-entity-workflows`), [part 4](../_completed/04-workflow-config-schema/design.md) (`global.action_statuses`, `global.workflow_lifecycle_stages`, `_global.workflows_config` for the group-title and `actionGroupConfig` joins), [part 16](../_completed/16-page-templates/design.md) (the verification flow exercises form-action pages emitted by part 16's templates), and the [`ActionSteps` block](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/) from `plugins/modules-mongodb-plugins` (already shipped; `actions-on-entity` feeds it the per-workflow `items` + `actionGroupConfig` payloads built client-side).

## Verification

- Worked-example demo:
  - Lead page renders `actions-on-entity`: one workflow strip with an `ActionSteps` block in its slot. Step count matches `workflow.groups[].length`; per-step action count matches the filtered+sorted client-side bucketing.
  - `qualify` status flips after submit; `actions-on-entity` re-renders (via entity-page remount on back-nav per [Refresh after submit](#refresh-after-submit)). Both the `ActionSteps` group rollup and the `workflow-header` milestone label reflect the new state.
  - `workflow-header`'s workflow-overview link button navigates to `workflow-overview?workflow_id=<id>` when clicked from the entity page; the same button is not rendered on the `workflow-overview` page itself (`is_overview_page: true` suppresses it).
  - `workflow-header` milestone label updates when group statuses change.
  - With two same-type workflows on one entity, `actions-on-entity` orders them by `display_order` ASC then `created.timestamp` DESC (newer first) — exercises the tie-breaker shipped in [`get-entity-workflows.yaml`](../../../../modules/workflows/api/get-entity-workflows.yaml).
  - `action_role_check` correctly hides buttons for users without the required role.
- Responsive: widget reflows on narrow viewports.
- a11y: keyboard nav reaches every link / button.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Refresh after submit

The v1 refresh path is **remount-on-back-navigation**, not an explicit signal. Part 16's shipped submit templates navigate to the action's `-view` page on success; when the user navigates back to the entity page (browser back, breadcrumb, or app-shipped link) the entity page remounts and `actions-on-entity`'s `onMount` re-fetches `get-entity-workflows`. This works for the standard form-edit flow Part 16 ships.

Out of scope for v1: modal-flow submits (where the entity page stays mounted), or any flow where the user stays on the entity page after submitting. These would need an explicit refresh signal — e.g. the component watching a state key the host page bumps, or exposing a named event the host fires. v1.x can land this additively without breaking the v1 contract.

## Open questions

- **`workflow-header` collapse state persistence.** v1: ephemeral. Persistent (per-user) is a follow-up.

## Contract to neighbours

- **Part 16 (form-action templates)** and **Part 17 (task pages)** each call `action_role_check` at step 6 of their eight-step `onMount` sequence to set `_state.action_allowed`. Part 18 owns the primitive; part 16 / part 17 own the templates that invoke it. The interface is the `_ref` call shape committed in the `action_role_check` "Vars contract" section above.
- **Part 17 (`workflow-overview` page)** composes `workflow-header` directly, passing the workflow doc returned by `get-workflow-overview` and `is_overview_page: true` to suppress the self-referential link button. Part 18 owns the component shape; part 17 owns the call site. See [part 17 design.md:46](../17-shared-pages/design.md) for the consumer side.
- **Part 19** provides the data path (`get-entity-workflows` for `actions-on-entity`, `get-workflow-overview` for `workflow-overview`'s workflow doc fed into `workflow-header`).
- **Part 20** exports these components via the module manifest (declared `exports.components`).
- **Part 24 (universal-fields component)** reads `_state.action_allowed` that `action_role_check` writes. Part 18 owns the boolean's contract; part 24 owns the component that toggles its inputs read-only on `false`.
- **`ActionSteps` plugin block** from `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/` is consumed by `actions-on-entity` for the per-workflow steps tree. Part 18 owns the data-prep contract (`items` + `actionGroupConfig`); the block itself ships separately.
