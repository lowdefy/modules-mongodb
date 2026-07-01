# Task 8: `actions-on-entity` — bundle the modal, wire `ActionSteps.onActionClick`; `workflows-events-timeline` — `on_action_click` passthrough

## Context

`modules/workflows/components/actions-on-entity.yaml` renders each entity's
workflows as `ActionSteps` blocks (`:59–83`) fed by the `get-entity-workflows`
endpoint (`GetEntityWorkflows` — each action card already carries
`{ _id, kind, type, status, allowed, message, link }`). Today every action row
navigates via the server-resolved `action.link` (the block default).

Design D5: `actions-on-entity` **bundles one `check-action-modal` instance**
and wires `ActionSteps.onActionClick` with a kind-branch — `check` actions
open the modal in place; every other kind navigates. Apps already using
`actions-on-entity` get the modal for free ("one correct way"). Because the
modal's blockId is fixed (`check_action_modal`), any other action surface on
the same page (e.g. a co-present event timeline) targets **this same
instance** by id rather than dropping its own.

Tasks 1 and 7 supplied two of the pieces: the `onActionClick(action)` event
(which, when wired, fires instead of navigating and never fires for linkless
rows) and the modal with its `on_complete` var. Task 2 converged
`EventsTimeline` onto the same contract — this task's second half exposes
that event through the module's `workflows-events-timeline` wrapper
component (Part 46 task 11, shipped) so timeline hosts can drive the same
modal without forking the component (design D5 / § Event-timeline action
items).

## Task

### Part A — `modules/workflows/components/actions-on-entity.yaml`

1. **Drop the modal once**, as a sibling of the `entity_workflows` List (top
   level of the component's `blocks:`):

   ```yaml
   - _ref:
       path: components/check-action-modal.yaml
       vars:
         on_complete:
           _ref:
             path: components/entity-workflows-refetch.yaml
             vars:
               entity_id:
                 _var: entity_id
               entity_collection:
                 _var: entity_collection
   ```

   `entity-workflows-refetch.yaml` is the existing actions-list component
   (CallAPI `get-entity-workflows` + SetState `entity_workflows`); the
   `entity_id` / `entity_collection` vars pass through from
   `actions-on-entity`'s own vars, exactly as the `onMount` fetch uses them
   (`:5–19`).

2. **Wire the event** on the `entity_workflows.$.action_steps` block
   (`:59–83`) with the design's kind-branch (D5):

   ```yaml
   events:
     onActionClick:
       - id: set_check_action_modal_action
         type: SetState
         skip:
           _ne:
             - _event: action.kind
             - check
         params:
           check_action_modal:
             action_id:
               _event: action._id
       - id: open_check_action_modal
         type: CallMethod
         skip:
           _ne:
             - _event: action.kind
             - check
         params:
           blockId: check_action_modal
           method: setOpen
           args:
             - open: true
       - id: link_to_action_page
         type: Link
         skip:
           _eq:
             - _event: action.kind
             - check
         params:
           pageId:
             _event: action.link.pageId
           urlQuery:
             _event: action.link.urlQuery
   ```

   (`setOpen` is the Modal block's registered method — confirmed in task 7;
   the shipped review page's `method: open` is a latent bug, don't copy it.)
   Linkless rows never reach the `Link` branch — the block suppresses the
   click for them (task 1).

3. **Header comment** — note the bundled-modal rule: the modal is dropped
   exactly once per page; `actions-on-entity` is what drops it when present;
   a host page composing the event timeline alongside this component targets
   the same `check_action_modal` blockId and must not drop its own.

### Part B — `modules/workflows/components/workflows-events-timeline.yaml`

Add an **`on_action_click`** events-passthrough var onto the wrapped
`workflows_events_timeline_list` (`EventsTimeline`) block — absent by
default, preserving the block's navigate fallback (task 2):

```yaml
events:
  _build.if:
    test:
      _build.eq:
        - _var: on_action_click
        - null
    then: {}
    else:
      onActionClick:
        _var: on_action_click
```

**The `_build.if` is load-bearing, not style** (verified at task time): an
unset `_var` resolves to `null` — never to an absent key — and the engine
registers **every** key on a block's `events` object
(`lowdefy/packages/engine/src/Events.js:48`), so the naive
`events: { onActionClick: { _var: on_action_click } }` would register a null
event, the block would see itself as wired, and clicking would fire a no-op
instead of navigating. The key must be absent from the built config when the
var is unset.

Document the var in the component's header-comment Vars list: "optional
actions array wired to the timeline's `onActionClick` (the host supplies the
kind-branch / modal wiring — see `check-action-modal`); absent by default →
action cards navigate via the server-resolved `action.link`."

## Acceptance Criteria

- Clicking a `check`-kind action row on an entity page opens the modal (no
  navigation); clicking a form-kind action navigates to its resolved page.
- A successful signal submitted from the modal refetches the entity
  workflows list (the `entity-workflows-refetch` sequence) and closes the
  modal.
- The modal appears exactly once in the component, and overview pages /
  notifications / deep links are unaffected (they never used the event).
- `workflows-events-timeline` accepts an `on_action_click` actions array and
  passes it as the `EventsTimeline` block's `onActionClick`; with the var
  unset, the built page carries **no** `onActionClick` key on the block
  (inspect the demo build output) and timeline action cards still navigate.
- Demo app build succeeds; demo entity pages that already embed
  `actions-on-entity` need no changes.

## Files

- `modules/workflows/components/actions-on-entity.yaml` — modify — bundle the modal `_ref`, wire `onActionClick` with the kind-branch
- `modules/workflows/components/workflows-events-timeline.yaml` — modify — `on_action_click` events-passthrough var (`_build.if`, key absent when unset)

## Notes

- Snake_case action ids in the event handler (`set_check_action_modal_action`,
  `open_check_action_modal`, `link_to_action_page`) per repo convention.
- Verify the `_ref`-as-actions-list composition for `on_complete` builds
  (component returning a YAML sequence consumed in a var position —
  `entity-workflows-refetch.yaml` is already consumed this way by hosts).
