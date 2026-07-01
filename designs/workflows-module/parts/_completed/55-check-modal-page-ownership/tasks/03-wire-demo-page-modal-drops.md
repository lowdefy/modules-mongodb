# Task 3: Drop the modal once per page on the demo multi-surface pages

## Context

After Task 2 no surface component drops the check-action modal. Per design D1, the **page** is the only scope that sees every surface, so the page drops `check-action-modal` once and composes its `on_complete` — the action sequence run after a successful signal, which must refresh every co-present surface.

`check-action-modal` and `entity-workflows-refetch` are already entries in the workflows manifest `components:` registry, so both are `_ref`-able cross-module (this is why `actions-on-entity` resolves from `lead-view` today). No resolution change is needed.

Two demo pages are multi-surface consumers and must be wired:

- **`apps/demo/pages/leads/lead-view.yaml`** — workflows card (`actions-on-entity`) + Activity card (`workflows-events-timeline`). After a check submit, both the action steps and the activity timeline must refresh. The timeline only fetches on mount, so its page-scoped `get_events_timeline` request must be re-run by id.
- **`apps/demo/modules/companies/vars.yaml`** — `components.sidebar_slots` composes the workflows card (`actions-on-entity`) + an activities tile (`activities` → `tile_activities`). A check submit changes workflow state, **not** activities, so the activities tile is intentionally left out of `on_complete` (it keeps its own `on_created` refetch for activity creation). The companies page therefore drops the modal with `on_complete = [entity-workflows-refetch]` only.

The page composes `on_complete` from each surface's _own_ refetch primitive — `entity-workflows-refetch` (the `CallAPI` + `SetState entity_workflows` sequence) for the action steps, and a `Request get_events_timeline` for the timeline — so no surface internals leak to the page.

## Task

### `apps/demo/pages/leads/lead-view.yaml`

1. Remove the now-dead `on_action_complete` var passed to the `actions-on-entity` `_ref` (lines ~68–75, including its explanatory comment). The `actions-on-entity` `_ref` should pass only `entity_id` and `entity_collection`.
2. Add a single page-level modal drop as a sibling of `lead_view_row` (i.e. another item in the page's top-level `blocks`), wiring both refetches per D1:

```yaml
- _ref:
    module: workflows
    component: check-action-modal
    vars:
      on_complete:
        _build.array.concat:
          # refresh the action steps (actions-on-entity's surface)
          - _ref:
              module: workflows
              component: entity-workflows-refetch
              vars:
                entity_id:
                  _url_query: _id
                entity_collection: leads-collection
          # refresh the activity timeline (workflows-events-timeline's surface)
          - - id: refetch_events_timeline
              type: Request
              params: get_events_timeline
```

The `workflows-events-timeline` `_ref` keeps its existing vars unchanged (it never carried the deleted vars).

### `apps/demo/modules/companies/vars.yaml`

In `components.sidebar_slots`, add a page-level modal drop (a new slot entry, alongside the workflows card and the `tile_activities` slot), with `on_complete = [entity-workflows-refetch]` only. Pass `entity_collection` as the `companies-collection` connectionId operator (not a literal), matching how the workflows card already passes it:

```yaml
- _ref:
    module: workflows
    component: check-action-modal
    vars:
      on_complete:
        _build.array.concat:
          - _ref:
              module: workflows
              component: entity-workflows-refetch
              vars:
                entity_id:
                  _url_query: _id
                entity_collection:
                  _module.connectionId:
                    { id: companies-collection, module: companies }
```

Leave the `tile_activities` slot's `on_created: [Request get-events]` untouched — the activities tile keeps its own refetch and is deliberately not in the modal's `on_complete`.

## Acceptance Criteria

- `lead-view.yaml` drops `check-action-modal` exactly once, as a sibling of `lead_view_row`, with `on_complete = [entity-workflows-refetch (entity_id, leads-collection), Request get_events_timeline]`.
- `lead-view.yaml` no longer passes `on_action_complete` to `actions-on-entity`.
- `companies/vars.yaml` drops `check-action-modal` exactly once in `sidebar_slots`, with `on_complete = [entity-workflows-refetch (entity_id, companies-collection connectionId)]`; the activities tile is not in `on_complete`.
- Neither page double-drops the modal (the fixed global blockId `check_action_modal` appears once per page).
- `pnpm ldf:b` from `apps/demo` compiles cleanly.
- Manual/observed behaviour (to confirm in Task 5): a check-row click on either page opens the modal in place (no navigation); on submit, the action steps refresh, and on `lead-view` the activity timeline also refreshes.

## Files

- `apps/demo/pages/leads/lead-view.yaml` — modify — drop the modal once with the two-surface `on_complete`; remove the dead `on_action_complete` var on the `actions-on-entity` `_ref`.
- `apps/demo/modules/companies/vars.yaml` — modify — drop the modal once in `sidebar_slots` with the single-surface `on_complete`.

## Notes

- The modal carries a fixed global blockId `check_action_modal` and defines a component-local `get_workflow_action` request — never drop it on a page that already defines a `get_workflow_action` request (the `workflow-action-*` pages). The demo entity pages are safe; do not add the drop anywhere else.
- `entity_id` / `entity_collection` passed to `entity-workflows-refetch` must match what each page passes to its `actions-on-entity` surface so the refetch targets the same workflows.
