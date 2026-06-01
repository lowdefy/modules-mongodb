# Task 6: Bundle the modal in `actions-on-entity` and wire `ActionSteps.onActionClick` (D5)

## Context

`modules/workflows/components/actions-on-entity.yaml` renders an entity's workflows as a `List`, each row containing an `ActionSteps` block (`entity_workflows.$.action_steps`). Today clicking an action navigates to its page (the `ActionSteps` `Link` default).

With the generic `onActionClick` event on `ActionSteps` (Task 2) and the standalone `simple-action-modal` (Task 5), this task makes `actions-on-entity` the place that **drops the modal once** and **wires the event** — so any app already using `actions-on-entity` gets the in-context modal for free, with no per-app wiring ("one correct way").

**The "exactly once" rule (D5):** the modal is dropped exactly once per page, and `actions-on-entity` is what drops it when present. Because the blockId is fixed (`simple_action_modal`), any other action surface on the same page (e.g. a co-present event timeline) targets this same instance by id — it does not drop its own. A developer never drops the standalone modal on a page that already has `actions-on-entity`.

The component already has an `entity-workflows-refetch` sibling component used to refetch entity workflows — pass it as the modal's `onComplete`.

## Task

1. **Drop the modal once.** Add a single `_ref` of `components/simple-action-modal.yaml` into `actions-on-entity.yaml`, passing the entity-workflows refetch sequence (`components/entity-workflows-refetch.yaml`, or the existing `call_entity_workflows` + `set_entity_workflows` refetch used in this component's `onMount`) as the modal's `onComplete` `_var`.
2. **Wire `ActionSteps.onActionClick`.** On the `entity_workflows.$.action_steps` block, add an `onActionClick` event that opens the modal for the clicked action, per the modal's open contract:

   ```yaml
   onActionClick:
     - type: SetState
       params: { simple_action_modal: { action_id: { _event: action._id } } }
     - type: CallMethod
       params: { blockId: simple_action_modal, method: open }
   ```

   (Use the repo's snake_case action ids and the established event-handler conventions.)

## Acceptance Criteria

- `actions-on-entity.yaml` drops exactly one `simple-action-modal` instance with `onComplete` set to the entity-workflows refetch.
- `ActionSteps.onActionClick` is wired to set `simple_action_modal.action_id` from the clicked action and call `open` on the modal.
- Clicking a simple action in `actions-on-entity` opens the modal instead of navigating; submitting from the modal refetches the entity workflows list (verified in Task 8).
- Apps already consuming `actions-on-entity` need no additional wiring to get the modal.
- The demo build succeeds.

## Files

- `modules/workflows/components/actions-on-entity.yaml` — modify — drop `simple-action-modal` once (with `onComplete` refetch) and wire `ActionSteps.onActionClick` to open it.

## Notes

- Do **not** add the modal to any page that also has `actions-on-entity` — it's bundled here. A page that has the event timeline but **not** `actions-on-entity` and wants the modal drops it itself (Part 41 concern, not this task).
- The `entity-workflows-refetch` component / the component's own `call_entity_workflows`+`set_entity_workflows` onMount sequence is the natural `onComplete` payload — reuse it rather than authoring a new refetch.
