# Task 5: Ship `pages/workflow-overview.yaml` — workflow detail page

## Context

The workflow-overview page is standalone — different shape from the three task pages (different Api, different layout, different data flow). It fires a single `CallApi` to `get-workflow-overview` (shipped by part 19, see `modules/workflows/api/get-workflow-overview.yaml`), renders the workflow header via `_ref` to part 18's `workflow-header` component, and lists action cards with status + DataView over form_data.

The Api returns `{ workflow, actions: [] }` or `{ workflow: null, actions: [] }` when no actions are visible (null short-circuit per part 19 task 6). The page reads the response and either renders the workflow + actions or redirects back to the entity page.

**Entity back-link**: the page deep-links to the host app's entity page via the new `entities` module var (see [design § "`entities` module var"](../design.md) and [design § Workflow overview page](../design.md)). The page reads `_module.var: entities[workflow.entity_collection]` to get `{ page_id, id_query_key, title }`; the back-link's URL is `pageId: <page_id>`, `urlQuery: { <id_query_key>: <entity_id> }`. **No entity doc fetch on this page** — the `entities` enum provides the URL components and the entity-kind label.

## Task

Create `modules/workflows/pages/workflow-overview.yaml`:

- **Page id:** `workflow-overview`. URL query: `?workflow_id=<id>`.
- **Top-level wrap:** `_ref` to `layout.page`.
- **`onMount` sequence:**
  1. `workflow_id` presence guard — `Link back: true` if `_url_query.workflow_id` is null.
  2. `CallApi: get-workflow-overview` — single call, payload `{ workflow_id: { _url_query: workflow_id } }`. Use `_module.endpointId: { id: get-workflow-overview, module: workflows }` to resolve the scoped Api id. Stores the response in a state key (e.g. `_state.overview`).
  3. **Null-redirect guard** — if `_state.overview.workflow === null`, `Link back: true` (browser-back to the previous page — typically the entity page). The Api's null short-circuit happens when no actions pass the access filter; this matches the design's "page redirects back to its host entity page in that case."

  **No `Request: get_entity`.** The entity doc is not fetched on this page in v1 — the `entities` module var provides what the page needs (back-link URL components + entity-kind title for chrome).

- **Blocks (inside `layout.page.blocks`):**

  1. **Workflow header** — `_ref` to part 18's `workflow-header` component:

     ```yaml
     - _ref:
         path: ../components/workflow-header.yaml
         vars:
           workflow:
             _state: overview.workflow
     ```

     The component carries title, lifecycle stage badge, summary counts, milestone label, and collapse toggle. Part 18 hasn't shipped — this is a path-stub until part 18 lands. If part 18 ends up consuming `_module.var: entities[workflow.entity_collection].title` for an entity-kind label in the header, that's a part 18 concern; this task just passes the workflow doc and lets part 18 reach for the var itself.

  2. **Entity back-link** — a `Button` (or breadcrumb element, depending on the chrome convention established by tasks 2/3/4 and part 16) that navigates to the host-app entity page:

     ```yaml
     - id: entity_back_button
       type: Button
       properties:
         title:
           _string.concat:
             - _get:
                 from:
                   _module.var: entities
                 key:
                   _string.concat:
                     - _state: overview.workflow.entity_collection
                     - .title
                 default: Entity
             - " "
             - _state: overview.workflow.entity_id
       events:
         onClick:
           - id: link_to_entity
             type: Link
             params:
               pageId:
                 _get:
                   from:
                     _module.var: entities
                   key:
                     _string.concat:
                       - _state: overview.workflow.entity_collection
                       - .page_id
               urlQuery:
                 _object.from_entries:
                   - - - _get:
                           from:
                             _module.var: entities
                           key:
                             _string.concat:
                               - _state: overview.workflow.entity_collection
                               - .id_query_key
                       - _state: overview.workflow.entity_id
     ```

     The `_object.from_entries` shape is awkward because the URL query key is dynamic (it comes from the entities map per-collection). Verify the exact operator name (`_object.fromEntries` vs `_object.from_entries`) against the Lowdefy operators guide — kebab-case naming convention applies depending on the operator family.

  3. **List of action cards** — iterate over `_state: overview.actions` using a `List` block. Each item renders a `layout.card` with:
     - **Card title block:**
       - Status badge from `_global: action_statuses.{actions_list.$.status.0.stage}` (display attrs — color, title).
       - `status_map.{current_stage}.{app_name}.message` Nunjucks-templated.
       - Optional link button to the action's own page (`{workflow_type}-{action_type}-{verb}` per part 12; falls through if `status_map.{current_stage}.{app_name}.link` is set).
     - **Card body:**
       - **Empty state:** Html block visible when no `form_data` slice exists for the action. Use `_get` with `default: null` and check for null.
       - **DataView:** visible when the slice exists. Properties:
         - `formConfig`: `_array.concat` of `_global: action_form_configs.{actions_list.$.type}.form` and `.form_review` (preserves v0's `_array.concat` pattern).
         - `data`: `{ form: <form_data slice>, workflow: _state.overview.workflow }`.
       - **Per-card `form_data` indexing:** `workflow.form_data[action.type]` for non-keyed actions; `workflow.form_data[action.type][action.key]` for keyed actions. Each card knows its own `action.type` and `action.key` from the iteration context. Use `_get` with key-path chaining; if `action.key` is null, the chain falls through to the type-level slice.

## Acceptance Criteria

- `modules/workflows/pages/workflow-overview.yaml` exists, parses as valid Lowdefy YAML.
- Page id is `workflow-overview`. URL query: `?workflow_id=<id>`.
- Single `CallApi` to `get-workflow-overview` fires on mount; response stored in `_state.overview`.
- Null-workflow guard redirects back when `_state.overview.workflow === null`.
- **No `get_entity` request** — the page does not fetch the entity doc.
- Workflow header renders via `_ref` to `../components/workflow-header.yaml` (path-stub until part 18 ships).
- Entity back-link button renders with title `"<title> <entity_id>"` — `<title>` comes from `_module.var: entities[workflow.entity_collection].title`; `<entity_id>` from `_state: overview.workflow.entity_id`. Clicking navigates to `pageId: <page_id>`, `urlQuery: { <id_query_key>: <entity_id> }`.
- Action cards render in order returned by the Api (already sorted by `(_group_index, sort_order, _id)` per part 19 task 6) — no client-side re-sorting.
- DataView's `formConfig` is the `_array.concat` of `.form` + `.form_review` per type.
- For a keyed action (e.g. `proof-of-installation` with `key: device-A`), the card's DataView reads `workflow.form_data["proof-of-installation"]["device-A"]`. For a non-keyed action, it reads `workflow.form_data[action.type]`.
- Empty-state Html block renders when the form_data slice is null/missing; DataView renders otherwise.
- No page-level `Request` block duplicates the Api's join (per design's contract with part 19).
- Page builds once part 18 ships `workflow-header.yaml`, AND once the host app (or worked-example demo) declares `vars.entities` with at least one entry matching the worked-example's `entity_collection`. Until then, build / runtime errors on the missing entries are expected.

## Files

- `modules/workflows/pages/workflow-overview.yaml` — **create** — the workflow overview page.

## Notes

- The List block's iteration context: Lowdefy's `List` exposes `actions_list.$` for each item. Inside the iteration, `actions_list.$.type`, `actions_list.$.status.0.stage`, `actions_list.$.key`, etc. are available. The state path for the iterated array should be `_state.overview.actions` (or wherever the Api response is stored).

- Tracker actions: per design § "Workflow overview page" → "Tracker actions link to the child workflow's `workflow-overview` page when configured." Render them with a link target that uses the tracker action's `status_map.{stage}.{app_name}.link.pageId` (which app authors typically point at the child workflow's `workflow-overview?workflow_id=<id>` URL). No special branching by `kind` in the page — the link comes from `status_map` like any other action.

- The card body's `_get` chain for keyed indexing:

  ```yaml
  data:
    form:
      _get:
        from:
          _state: overview.workflow.form_data
        key:
          _if_else:
            - _ne:
                - _state: actions_list.$.key
                - null
            - _string.concat:
                - _state: actions_list.$.type
                - .
                - _state: actions_list.$.key
            - _state: actions_list.$.type
        default: null
  ```

  Adjust to the operator chaining conventions in the codebase (`_if_else` may not be the exact operator name — check the operators guide).

- The dynamic-key `_object.from_entries` for the back-link's `urlQuery`: if the operator chain proves unreadable, the alternative is to commit to `id_query_key: _id` for v1 and use a static `urlQuery: { _id: ... }` slot, with the design's `id_query_key` field reserved for future use. This loses generality but ships cleaner YAML. Decide during implementation; the design accepts either as long as the operator path is correct.

- File scale: ~250–320 lines depending on how much of the action-card structure is inlined vs. extracted.

- v0 reference shape lives in the workflows-module v0 example for the workflow-overview page — preserve the `_array.concat` `formConfig` pattern, but adapt the data path (v0 had no keyed actions and stored form_data on the entity doc, not the workflow doc; this page reads from `_state.overview.workflow.form_data`).

- This task introduces the **first consumer of `vars.entities`**. The var's declaration lands in part 20 (manifest wiring); the validator obligation (every `entity_collection` in `workflows_config` must have a matching entry) lands in part 4. Task 7 wires the var in the demo app for the worked-example workflows.
