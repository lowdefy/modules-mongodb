# Task 5: Standalone `check-action-modal` component (D5)

## Context

Part 40 (D5) adds an in-context modal so live working surfaces (`actions-on-entity`, and timeline hosts via [Part 42](../../_completed/42-timeline-action-cards/design.md)) can open a check action **in place** without a full page navigation. The modal is an opt-in shortcut layered on those surfaces — never a replacement for the canonical page (notifications, overviews, and deep-links still navigate).

This task ships the standalone, reusable component `modules/workflows/components/check-action-modal.yaml`. It wraps the `check-action-surface` (Task 3) — one body, two containers. Task 6 wires it into `actions-on-entity`; a host page that renders the event timeline can drop and wire it independently.

**Container choice (D5):** a single **`Modal`** block with a **fixed blockId `check_action_modal`**. With the events timeline page-only (D1 / review-2 #4), every mode is light — universal fields, status history, comment, signal buttons — so a centred `Modal` fits the content (an earlier draft chose a `Drawer` to hold a timeline-bearing `view` mode; that rationale died with the in-modal timeline). One block type for all modes keeps the one fixed blockId / one open contract intact (a runtime block cannot switch type by mode, so two container types would break the contract).

## Task

Create `modules/workflows/components/check-action-modal.yaml`:

1. **A single `Modal`** block, blockId **`check_action_modal`** (fixed — hosts target it by this id), accepting an `onComplete` var (the host-supplied refetch action sequence, passed as `_var`).
2. **Body `_ref`s `check-action-surface`** with `mode` **derived from the action's stage** (D5):
   - stage `error` → `view` (surfaces `resolve_error`);
   - stage `in-review` **and** `surface.action_allowed.review` → `review`;
   - an actionable stage **and** `surface.action_allowed.edit` → `edit`;
   - otherwise → `view`.
3. **Open handler** — on open, run the **same gating sequence the page `onMount` runs** (Task 4), for `check_action_modal.action_id` (the host sets this before opening). The surface depends on all of it, and none of it runs unless the modal replicates it:
   1. `get_action` (fresh — list/timeline data may be stale) → seed `surface.action` + `surface.fields`.
   2. `get_workflow` → drives the workflow-closed banner + `required_after_close` gate.
   3. `action_role_check` → then a following `SetState` lands the per-verb map under `surface.action_allowed: { view, edit, review, error }` (Part 34 D8) that the role gates and mode derivation read.
   4. Then render.
4. **On a successful signal call**, run the host-supplied `onComplete` (the `_var` refetch sequence) and **close** the modal.
5. **Open contract** (fixed — every host wires it the same way):

   ```yaml
   # Host wiring (ActionSteps / EventsTimeline onActionClick):
   - type: SetState
     params: { check_action_modal: { action_id: { _event: action._id } } }
   - type: CallMethod
     params: { blockId: check_action_modal, method: setOpen, args: [{ open: true }] }
   ```

6. **Export the component** in the manifest so host pages outside `actions-on-entity` can drop it (`module.lowdefy.yaml` `components:` list), mirroring `actions-on-entity` / `entity-workflows-refetch` entries.

## Acceptance Criteria

- `check-action-modal.yaml` exists: a `Modal` with fixed blockId `check_action_modal`, an `onComplete` `_var`, and a body that `_ref`s `check-action-surface` with stage-derived `mode`.
- The open handler runs `get_action` → `get_workflow` → `action_role_check` (+ `SetState` into `surface.action_allowed`) for `check_action_modal.action_id` and seeds the `surface.*` namespace before render.
- Mode derivation follows the D5 rules (`error`→view; `in-review`+review→review; actionable+edit→edit; else view).
- The modal renders **no** events timeline (page-level only — D1); the `view` mode's status-history is the surface's request-less `List`.
- On a successful signal, the modal runs `onComplete` and closes.
- The component is exported in `module.lowdefy.yaml`.
- A successful `submit` / `approve` / `resolve_error` from the modal updates the action and refetches without page navigation (verified in Task 8).

## Files

- `modules/workflows/components/check-action-modal.yaml` — create — the standalone `Modal` + open contract + `onComplete` var (D5).
- `modules/workflows/module.lowdefy.yaml` — modify — export the new component under `components:`.

## Notes

- **Confirm the `Modal` block's open method.** The open contract above quotes the design's `setOpen` with `args: [{ open: true }]`; the existing `request_changes_modal` uses `method: open`. Use whichever the AntD `Modal` block actually exposes (`open`/`setOpen`), and keep the host-wiring contract (Task 6) consistent with the method chosen here.
- **Keep the open sequence byte-for-byte aligned with the page `onMount`** (Task 4) so a check action behaves identically whether opened as a page or in the modal — that parity is the whole point of the shared surface.
- The `EventsTimeline.onActionClick` event + the timeline action-item wiring shipped with [Part 42](../../_completed/42-timeline-action-cards/design.md); this task defines the modal and its open contract that timeline hosts consume. **Payload caveat (open-questions §5):** as shipped `EventsTimeline.onActionClick` fires `{ pageId, urlQuery }`, not the action object — a timeline host driving this modal must reconcile the payload to carry `action._id`. That reconciliation is not owned by this task (the `actions-on-entity`/`ActionSteps` path, Task 6, carries the action object correctly).
