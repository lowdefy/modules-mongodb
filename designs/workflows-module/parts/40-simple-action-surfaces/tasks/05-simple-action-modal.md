# Task 5: Standalone `simple-action-modal` component (D5)

## Context

Part 40 adds an in-context modal so live working surfaces (`actions-on-entity`, and later the event timeline in Part 41) can open a simple action **in place** without a full page navigation. The modal is an opt-in shortcut layered on those surfaces — never a replacement for the page (notifications, overviews, and deep-links still navigate to the canonical page).

This task ships the standalone, reusable component `modules/workflows/components/simple-action-modal.yaml`. It wraps the `simple-action-surface` (Task 3) — one body, two containers. Task 6 wires it into `actions-on-entity`; a host app page that renders the event timeline can drop and wire it independently (Part 41).

**Container choice (D5):** a single **`Drawer`** block with a **fixed blockId `simple_action_modal`**. One container type for all modes — a `Drawer` holds the heavy `view` mode (fields + status-history + events timeline) comfortably and serves the lighter `edit`/`review` surfaces equally. A single block type keeps the one fixed blockId / one open contract intact (a runtime block cannot switch type by mode, so two container types would break the contract).

## Task

Create `modules/workflows/components/simple-action-modal.yaml`:

1. **A single `Drawer`** block, blockId **`simple_action_modal`** (fixed — hosts target it by this id), accepting an `onComplete` var (the host-supplied refetch action sequence, passed as `_var`).
2. **Body `_ref`s `simple-action-surface`** with `mode` **derived from the action's stage** (D5):
   - stage `error` → `view` (surfaces `resolve_error`);
   - stage `in-review` **and** `surface.action_allowed.review` → `review`;
   - an actionable stage **and** `surface.action_allowed.edit` → `edit`;
   - otherwise → `view`.
3. **Open handler** — on open, run the **same gating sequence the page `onMount` runs** (Task 4), for `simple_action_modal.action_id` (the host sets this before calling `open`). The surface depends on all of it, and none of it runs unless the modal replicates it:
   1. `get_action` (fresh — list/timeline data may be stale) → seed `surface.action` + `surface.fields`.
   2. `get_workflow` → drives the workflow-closed banner + `required_after_close` gate.
   3. `action_role_check` → populate the per-verb `surface.action_allowed: { view, edit, review, error }` ([Part 34 D8]) that the role gates and mode derivation read.
   4. Then render.
4. **On a successful signal call**, run the host-supplied `onComplete` (the `_var` refetch sequence) and **close** the drawer.
5. **Open contract** (fixed — every host wires it the same way):

   ```yaml
   # Host wiring (ActionSteps / EventsTimeline onActionClick):
   - type: SetState
     params: { simple_action_modal: { action_id: { _event: action._id } } }
   - type: CallMethod
     params: { blockId: simple_action_modal, method: open }
   ```

6. **Export the component** in the manifest so host app pages outside `actions-on-entity` can drop it (`module.lowdefy.yaml` `components:` list), mirroring `actions-on-entity` / `entity-workflows-refetch` entries.

## Acceptance Criteria

- `simple-action-modal.yaml` exists: a `Drawer` with fixed blockId `simple_action_modal`, an `onComplete` `_var`, and a body that `_ref`s `simple-action-surface` with stage-derived `mode`.
- The open handler runs `get_action` → `get_workflow` → `action_role_check` for `simple_action_modal.action_id` and seeds the `surface.*` namespace before render.
- Mode derivation follows the D5 rules (`error`→view; `in-review`+review→review; actionable+edit→edit; else view).
- On a successful signal, the modal runs `onComplete` and closes.
- The component is exported in `module.lowdefy.yaml`.
- A successful `submit` / `approve` / `resolve_error` from the modal updates the action and refetches without page navigation (verified in Task 8).

## Files

- `modules/workflows/components/simple-action-modal.yaml` — create — the standalone Drawer + open contract + onComplete var (D5).
- `modules/workflows/module.lowdefy.yaml` — modify — export the new component under `components:`.

## Notes

- **`view` mode in the Drawer** shows the status-history card + the events timeline (Part 33); `edit`/`review` render just the actionable surface. This is the surface's own mode behaviour (Task 3) — the modal just selects the mode.
- **Keep the open sequence byte-for-byte aligned with the page `onMount`** (Task 4) so a simple action behaves identically whether opened as a page or in the drawer — that parity is the whole point of the shared surface.
- The `action_role_check` per-verb `action_allowed` output is the same [Part 34 D8] cross-wave dependency noted in Tasks 3 and 4; land its result under `surface.action_allowed` here too.
- This task defines the component and its open contract; the `EventsTimeline.onActionClick` event and the timeline wiring that also consume this modal are **Part 41**.
