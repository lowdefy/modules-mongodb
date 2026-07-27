# Task 2: Stop the surface components from dropping the check-action modal

## Context

Today the check-action modal is dropped by a surface component, not the page:

- **`modules/workflows/components/actions-on-entity.yaml`** renders each workflow as `ActionSteps` and, at the end of its `blocks`, drops `check-action-modal` via `_ref`, hardcoding the modal's `on_complete` as `entity-workflows-refetch` concatenated with an `on_action_complete` var (default `[]`) threaded down from the page. This is the "actions-on-entity owns the modal" rule.
- **`modules/workflows/components/workflows-events-timeline.yaml`** can _optionally_ drop the modal via an `include_modal` flag (default `false`), inside a `_build.if`, hardcoding `on_complete` as `[Request get_events_timeline, …on_action_complete]`.

The design (D1, D4) moves the single modal drop up to the page (Task 3) and collapses these two parallel mechanisms into one. After this task **no surface component drops the modal**; surfaces only render their block (with the baked-in `check-action-click` handler from Task 1, which now degrades gracefully when no modal is present).

`check-action-click.yaml` is already `_ref`'d into each surface's `onActionClick` and stays. Task 1 has already made it safe on a modal-less page.

## Task

### `actions-on-entity.yaml`

- Remove the trailing `_ref: components/check-action-modal.yaml` block (the last item in `blocks`, lines ~125–139). The `blocks` list ends with the `entity_workflows` List.
- Remove the `on_action_complete` var from the `Vars:` header documentation — the component no longer drops the modal, so it no longer threads a sibling-surface refetch.
- Update the header comment: the component now only renders per-workflow `ActionSteps` (with the baked-in click handler). State that the check-action modal is dropped **by the page, not here** (delete the "Bundled-modal rule" / "dropped exactly once / actions-on-entity owns it" language). Keep the `entity_id` / `entity_collection` var docs.
- Leave the `onMount` CallAPI/SetState (`call_entity_workflows` → `set_entity_workflows`) and the `entity_workflows` List rendering untouched.

### `workflows-events-timeline.yaml`

- Remove the `include_modal` and `on_action_complete` vars from the `Vars:` header documentation.
- Replace the `blocks: { _build.array.concat: [ [empty paragraph, EventsTimeline list], { _build.if: …modal… } ] }` structure with a plain list `blocks: [empty paragraph, EventsTimeline list]`. Delete the `_build.if` branch that bundled `check-action-modal` and its `on_complete`/`on_action_complete` wiring.
- Remove the standalone comment block (lines ~56–62) that explains `include_modal` bundling.
- Keep everything else: the `onMount` `get_events_timeline` Request, the `requests` `_ref`, the `EventsTimeline` block with its baked-in `onActionClick: { _ref: components/check-action-click.yaml }`, and all its existing props/vars (`reverse`, `contact_page_url`, `disable_contact_link`, `compact`, `s3GetPolicyRequestId`, `reference_field`, `reference_value`).

Resulting `blocks` shape:

```yaml
blocks:
  - id: workflows_events_timeline_empty
    type: Paragraph
    visible:
      _eq:
        - _array.length:
            _request: get_events_timeline
        - 0
    properties:
      content: No activity
      type: secondary
      style:
        fontSize: 12
        fontStyle: italic
  - id: workflows_events_timeline_list
    type: EventsTimeline
    events:
      onActionClick:
        _ref: components/check-action-click.yaml
    visible:
      _gt:
        - _array.length:
            _request: get_events_timeline
        - 0
    properties:
      # …unchanged…
```

## Acceptance Criteria

- `actions-on-entity.yaml` no longer references `check-action-modal.yaml` and no longer reads an `on_action_complete` var.
- `workflows-events-timeline.yaml` has no `include_modal` var, no `on_action_complete` var, and no `_build.if` modal branch; its `blocks` is a plain two-item list.
- Neither surface component drops `check-action-modal`.
- `pnpm ldf:b` from `apps/demo` compiles. (Note: at this point the demo pages no longer show the in-context modal — a check-row click navigates via the Task 1 fallback. That is expected and is corrected in Task 3. The build must still pass.)

## Files

- `modules/workflows/components/actions-on-entity.yaml` — modify — remove the bundled modal `_ref`; drop the `on_action_complete` var; update header.
- `modules/workflows/components/workflows-events-timeline.yaml` — modify — remove `include_modal` + `on_action_complete` vars and the `_build.if` modal bundling; flatten `blocks`; update header.

## Notes

- `lead-view.yaml` still passes an `on_action_complete` var to `actions-on-entity` until Task 3 removes it. A passed-but-unused `_ref` var is harmless in Lowdefy (no build error), so the build stays green between tasks 2 and 3.
- `check-action-modal.yaml` and `entity-workflows-refetch.yaml` are **not** edited — they remain in the manifest `components:` registry, already `_ref`-able for the page drops in Task 3.
