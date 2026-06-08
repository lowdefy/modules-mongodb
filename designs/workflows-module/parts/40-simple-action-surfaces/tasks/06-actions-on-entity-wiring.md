# Task 6: Bundle the modal in `actions-on-entity` and wire `ActionSteps.onActionClick` (D5)

## Context

`modules/workflows/components/actions-on-entity.yaml` renders an entity's workflows as a `List`, each row containing an `ActionSteps` block (`entity_workflows.$.action_steps`, lines 66–99). Today clicking an action navigates to its page (the `ActionSteps` `<Link>` default).

With the generic `onActionClick` event on `ActionSteps` (Task 2) and the standalone `check-action-modal` (Task 5), this task makes `actions-on-entity` the place that **drops the modal once** and **wires the event** — so any app already using `actions-on-entity` gets the in-context modal for free, with no per-app wiring ("one correct way").

**The "exactly once" rule (D5):** the modal is dropped exactly once per page, and `actions-on-entity` is what drops it when present. Because the blockId is fixed (`check_action_modal`), any other action surface on the same page (e.g. a co-present event timeline) targets this same instance by id — it does not drop its own. A developer never drops the standalone modal on a page that already has `actions-on-entity`.

The module has an `entity-workflows-refetch` component (and this component's own `call_entity_workflows` + `set_entity_workflows` `onMount` sequence) used to refetch entity workflows — pass it as the modal's `onComplete`.

## Task

1. **Drop the modal once.** Add a single `_ref` of `components/check-action-modal.yaml` into `actions-on-entity.yaml`, passing the entity-workflows refetch (the `entity-workflows-refetch` component, or this component's existing `call_entity_workflows` + `set_entity_workflows` sequence) as the modal's `onComplete` `_var`.
2. **Wire `ActionSteps.onActionClick`.** On the `entity_workflows.$.action_steps` block, add an `onActionClick` event that opens the modal for the clicked action, per the modal's open contract (use the same open method chosen in Task 5):

   ```yaml
   onActionClick:
     - id: set_modal_action
       type: SetState
       params: { check_action_modal: { action_id: { _event: action._id } } }
     - id: open_check_action_modal
       type: CallMethod
       params: { blockId: check_action_modal, method: setOpen, args: [{ open: true }] }
   ```

   (Use the repo's snake_case action ids and established event-handler conventions.)

## Acceptance Criteria

- `actions-on-entity.yaml` drops exactly one `check-action-modal` instance with `onComplete` set to the entity-workflows refetch.
- `ActionSteps.onActionClick` is wired to set `check_action_modal.action_id` from the clicked action and open the modal.
- Clicking a check action in `actions-on-entity` opens the modal instead of navigating; submitting from the modal refetches the entity workflows list (verified in Task 8).
- Apps already consuming `actions-on-entity` need no additional wiring to get the modal.
- The demo build succeeds.

## Files

- `modules/workflows/components/actions-on-entity.yaml` — modify — drop `check-action-modal` once (with `onComplete` refetch) and wire `ActionSteps.onActionClick` to open it.

## Notes

- **Open question — `kind` branch (open-questions §4, NOT yet resolved in D5).** The design's host wiring fires the modal for **every** clicked action, but a **form** action cannot render in the check surface (no form body). The likely resolution is to branch in the `onActionClick` handler: open the modal only for `kind: check`, and navigate via `action.link` otherwise. `kind` is stamped on the doc (`planActionTransition.js:148`), so the `get-entity-workflows` response should carry it — **verify `kind` survives the response projection** before adding the branch. This is flagged in the design as a substantive open item; implement the plain wiring as the design currently states **unless** the design has been amended to add the branch by the time this task runs. Surface the decision rather than guessing.
- Do **not** add the modal to any page that also has `actions-on-entity` — it's bundled here. A page that has the event timeline but **not** `actions-on-entity` and wants the modal drops it itself (a timeline-host concern, not this task).
- The `entity-workflows-refetch` component / the `call_entity_workflows`+`set_entity_workflows` `onMount` sequence is the natural `onComplete` payload — reuse it rather than authoring a new refetch.
