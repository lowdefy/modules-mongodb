# Task 9: Replace lead-view "Start onboarding" button with a device-keyed modal

## Context

`apps/demo/pages/leads/lead-view.yaml:157–199` currently has a "Start onboarding" Button (from 20a) that calls `start-workflow` with `workflow_type: onboarding` and no `actions:` payload — the engine instantiates only the `starting_actions` set. With the new `onboarding` shape (tasks 3–8), the workflow declares `proof-of-installation` as a `key: $device_serial`-instanced action; the user needs a way to provide one or more device serials at workflow start, and the engine fans out one action instance per supplied entry.

This task replaces the button with a modal that:

- Preserves the existing `visible:` guard so you can't start two onboarding workflows on the same lead.
- Collects per-device input via a `ControlledList`.
- Submits to `start-workflow` with `actions:` constructed from the device rows.
- Refreshes `actions-on-entity` via the new `entity-workflows-refetch` component (task 2).

## Task

Modify `apps/demo/pages/leads/lead-view.yaml`. The current button at lines 157–199 has:

```yaml
- id: start_onboarding_btn
  type: Button
  visible:
    _eq:
      - _state: entity_workflows.length
      - 0
  # ... onClick: start-workflow + refetch_entity_workflows + set_entity_workflows
```

Replace it with:

1. **A button that opens a modal** — same `visible:` guard (preserve the `_eq: [_state: entity_workflows.length, 0]` check), same title "Start onboarding", same icon. Replace the `onClick` with a single Lowdefy `Action` that opens a modal (e.g. an `Anchor` / `Button` with `events.onClick: [{ type: SetState, params: { start_onboarding_modal_open: true } }]`, or however modals are conventionally opened in this codebase — check existing demo pages for the idiom).

2. **A modal block** elsewhere on the page (typically at the page root or alongside the workflows section). The modal contains:
   - A `ControlledList` with id `devices`, initialised to one empty row, each row carrying a `text_input` for `device_serial` and a Remove button.
   - An Add button outside the list that appends a new empty row.
   - A Cancel button that closes the modal and clears the list state.
   - A Submit button whose `onClick` action sequence:
     1. Calls `workflows/start-workflow` with payload:
        ```yaml
        workflow_type: onboarding
        entity_id: { _url_query: _id }
        entity_collection: leads-collection
        actions:
          _js:
            args:
              devices: { _state: devices }
            fn: |
              return (args.devices || []).map((row) => ({
                type: 'proof-of-installation',
                key: row.device_serial,
                status: 'blocked',
                fields: { device_serial: row.device_serial },
              }));
        ```
        (Use the project's preferred operator idiom — see [CLAUDE.md "Operators before `_js`"](prp/CLAUDE.md). If `_array.map` works for this shape, prefer it; fall back to `_js` only when operator chaining is unwieldy.)
     2. Chains `_ref: { module: workflows, component: entity-workflows-refetch, vars: { entity_id: { _url_query: _id }, entity_collection: leads-collection } }` to refresh `actions-on-entity` (replaces the existing inline `refetch_entity_workflows` + `set_entity_workflows` pair).
     3. Closes the modal.

3. **Delete the inline `refetch_entity_workflows` + `set_entity_workflows` actions** that the 20a button used — the new `entity-workflows-refetch` component replaces them.

## Acceptance Criteria

- The lead-view "Start onboarding" button is visible only when `entity_workflows.length === 0` (preserves the 20a guard).
- Clicking the button opens a modal containing a `ControlledList` for device entries.
- The modal's Submit button calls `start-workflow` with an `actions:` array constructed from the device rows.
- After `start-workflow` returns, the page references `entity-workflows-refetch` via `_ref` (no inline `refetch_entity_workflows` + `set_entity_workflows` actions remain in lead-view).
- The modal closes on Submit or Cancel.
- `apps/demo` builds without errors and lead-view renders.
- Manual test: with no onboarding workflow on a lead, open lead-view → click "Start onboarding" → add two device rows with serials (e.g. `device-1`, `device-2`) → submit. Engine should create one workflow doc plus two `proof-of-installation` action docs keyed by serial; `actions-on-entity` should re-render showing the new workflow with both `proof-of-installation` instances under one parent slot.

## Files

- `apps/demo/pages/leads/lead-view.yaml` — modify — replace the existing `start_onboarding_btn` and its inline action sequence with a modal-trigger button + a modal block consuming `ControlledList` + `entity-workflows-refetch`.

## Notes

- The `ControlledList` block is available in the project (see `apps/shared/components/` or the form-components library). Check existing usages for the idiom — `apps/demo/modules/workflows/workflow_config/onboarding/proof-of-installation.yaml`'s `form:` block might use it too.
- Modal idiom — there are usually two conventions: page-state-driven (`SetState: { modal_open: true }` + a `Modal` block with `visible:` bound to that state) or block-event-driven (a `Modal` block whose `events.open` is fired via a `BlockAction`). Pick whichever the rest of the demo uses; consult [docs/idioms.md](../../../../../../docs/idioms.md) if both are in play.
- Avoid building the `actions:` payload via `_js` if `_array.map` over `_state: devices` produces an equivalent shape — see [CLAUDE.md "Operators before `_js`"](prp/CLAUDE.md).
- The Submit button doesn't need to validate device serials are unique — that's engine concern. Empty rows can be filtered out by the operator chain before constructing the payload.
- `status: 'blocked'` on each `proof-of-installation` instance matches the action's `blocked_by: [send-quote]` — the engine will keep them blocked until `send-quote` lands `done`. (Could equally be omitted; engine defaults to the action's blocked state if `blocked_by` matches an open action.)
