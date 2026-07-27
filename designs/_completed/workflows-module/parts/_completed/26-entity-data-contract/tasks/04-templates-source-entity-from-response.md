# Task 4: Drop `get_entity`; source entity data from the action response

## Context

With Task 3, the entity instance name arrives on `entity_link.name` and the entity fields arrive
on the `get_workflow_action` response's `entity` object. The action pages can now stop baking the
per-workflow `get_entity` request entirely.

Today `requests/get_entity.yaml.njk` (a `MongoDBAggregation` returning an **array**) feeds three
consumers across the action templates:

1. **Breadcrumb name** — `entity_name` var, currently `_request: get_entity.0.{{ name_field }}`.
2. **`DataDescriptions` summary** — `data.entity: _request: get_entity` (in `view` + `review` only).
3. **`entity_view` slot** — host slot blocks read `get_entity.0.<field>` (handled in Task 6 — demo).

`makeActionPages.js` passes `name_field` (and `connection_id`) into the templates via
`workspaceVars` (`makeActionPages.js:69-79`). `name_field` is now dead; `connection_id` stays
(it is still passed as `entity_connection_id` to the actions-on-entity panel).

The five templates each reference `get_entity` in **three** spots: the request-list `_ref`, the
`onMount` `Request` action, and the `entity_name` breadcrumb var. `view`/`review` additionally have
a `DataDescriptions` `data.entity` read. The check page (`action.yaml.njk`) uses the `current_action`
state key (not `action`) for its breadcrumb link.

`components/action-breadcrumbs.yaml` needs **no functional change** — it already takes `entity_name`
as an injected `_var`; only its header comment is stale.

## Task

1. **`modules/workflows/resolvers/makeActionPages.js`** — in `workspaceVars` (`:69-79`):
   - **Remove** the `name_field: workflow.entity.name_field ?? ""` line.
   - **Keep** `connection_id`, `reference_field`, `workflow_title`, `entity_view_slot`,
     `list_page_id`, `list_title`.
   - Update the function's doc comment (`:61-68`) to drop the `name_field` mention.
   - Update `makeActionPages.test.js` to drop `name_field` assertions.

2. **Delete** `modules/workflows/requests/get_entity.yaml.njk`.

3. **For each of the five templates** `templates/{view,review,edit,error,action}.yaml.njk`:
   - **Remove** the request-list `_ref` to `requests/get_entity.yaml.njk` (in `view`: lines
     105-107, inside the `requests:` `_build.array.concat`). The remaining entry is
     `requests/get_workflow_action.yaml`.
   - **Remove** the `onMount` `get_entity` `Request` action step (in `view`: the
     `id: get_entity / type: Request / params: get_entity` block at lines 139-142). Leaving it
     would dangle against the deleted request file → build error.
   - **Re-source the `entity_name` breadcrumb var.** Replace the `{% if name_field %} _request:
get_entity.0.{{ name_field }} {% else %} null {% endif %}` block with a single line reading
     the action's `entity_link.name` (keep it as the injected `_var` value passed to
     `action-breadcrumbs.yaml`; do **not** hard-code a state path inside the shared component): - `view`, `review`, `edit`, `error` (state key `action`):
     `entity_name: { _state: action.entity_link.name }` - `action.yaml.njk` (state key `current_action`):
     `entity_name: { _state: current_action.entity_link.name }`
     This mirrors how the sibling `entity_title` var is already sourced (`_state:
action.entity_link.title` / `current_action.entity_link.title`). Remove the now-unused
     `{% if name_field %}` Nunjucks gating.
   - **Repoint the `DataDescriptions` `data.entity` read** — in `view` (`:217`) and `review`
     (`:223`) only — from `_request: get_entity` to `_request: get_workflow_action.entity`
     (now an object, not a `.0` array). `edit`/`error`/`action` carry the entity surface via the
     slot (Task 6), not `DataDescriptions`, so they have no such read.

4. **`modules/workflows/components/action-breadcrumbs.yaml`** — refresh the header comment only
   (`:28-30`): the `entity_name` var is now sourced from `entity_link.name`, not from the
   `get_entity` request via `entity.name_field`. No functional change.

5. Also remove the now-stale `name_field` / `get_entity` mentions in each template's top-of-file
   build-time-vars comment (e.g. `view.yaml.njk:12` and `:16`).

## Acceptance Criteria

- `requests/get_entity.yaml.njk` no longer exists; no template references it (request list, onMount,
  or breadcrumb).
- `makeActionPages` no longer emits a `name_field` workspace var; `connection_id` is still emitted.
- All five templates source the breadcrumb instance name from `entity_link.name` (via the
  `entity_name` `_var`), using the correct state key per template (`action` vs `current_action`).
- `view` and `review` `DataDescriptions` read `get_workflow_action.entity`.
- `pnpm jest modules/workflows/resolvers/makeActionPages.test.js` passes.
- `cd apps/demo && pnpm ldf:b` succeeds (no dangling `get_entity` reference). Note this also
  requires Task 6 (demo routine + slot repoint) to be in place for a green demo build.

## Files

- `modules/workflows/resolvers/makeActionPages.js` — modify — drop `name_field` from
  `workspaceVars`; keep `connection_id`; update comment.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — drop `name_field` assertions.
- `modules/workflows/requests/get_entity.yaml.njk` — delete.
- `modules/workflows/templates/view.yaml.njk` — modify — remove `get_entity` (request, onMount,
  breadcrumb), repoint `DataDescriptions` entity read, refresh comment.
- `modules/workflows/templates/review.yaml.njk` — modify — same as `view` (it also has the
  `DataDescriptions` entity read at `:223`).
- `modules/workflows/templates/edit.yaml.njk` — modify — remove `get_entity` (request, onMount,
  breadcrumb); no `DataDescriptions` entity read.
- `modules/workflows/templates/error.yaml.njk` — modify — same as `edit`.
- `modules/workflows/templates/action.yaml.njk` — modify — remove `get_entity` (request, onMount,
  breadcrumb using `current_action`); the slot read is repointed in Task 6.
- `modules/workflows/components/action-breadcrumbs.yaml` — modify — refresh header comment only.

## Notes

- The result shape changes from a single-element **array** (`get_entity.0.<field>`) to an
  **object** (`get_workflow_action.entity.<field>`) — drop the `.0`.
- This task and Task 6 (demo) together make the demo build green; the module-level changes here are
  what unblock the demo's slot repoint.
