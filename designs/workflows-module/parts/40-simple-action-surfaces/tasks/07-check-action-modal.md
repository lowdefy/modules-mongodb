# Task 7: New standalone `check-action-modal` component (+ manifest export)

## Context

The live working surfaces (`actions-on-entity`, the event-timeline action
cards) should open a **check** action in place, without a full page
navigation. Design D5 ships this as a standalone, reusable component: a single
`Modal` block with a **fixed blockId `check_action_modal`** and a fixed open
contract, wrapping task 3's `check-action-surface` with `mode` **derived from
the fetched action at open time**. The modal is an in-app shortcut layered on
hosts — never a replacement for the canonical pages.

Fixed open contract (any host wires it the same way — design D5):

```yaml
- type: SetState
  params: { check_action_modal: { action_id: <id> } }
- type: CallMethod
  params: { blockId: check_action_modal, method: setOpen, args: [{ open: true }] }
```

On open the modal runs the **same fetch the pages' `onMount` runs** — one
`GetWorkflowAction` read for `check_action_modal.action_id` (fresh; the
list/timeline data may be stale), spread into `current_action` + the working
seeds. There is no separate workflow read or role check: `allowed`, `buttons`,
`workflow_closed`, and `required_after_close` all arrive on the one response.

Mode derivation (D5 — drives the **signal button bar** only; field
editability is the separate `allowed.edit` gate inside the surface):

1. stage `error` → `view` (surfaces `resolve_error`);
2. stage `in-review` ∧ `allowed.review` → `review`;
3. stage ∈ `[action-required, in-progress, changes-required]` ∧
   `allowed.edit` → `edit`;
4. otherwise → `view`.

The events timeline is **not** rendered in the modal (page-level only, design
D1) — `view` mode's status history (stateful List, no request) is modal-safe.

## Task

1. Create `modules/workflows/components/check-action-modal.yaml`:
   - **Root block**: `Modal`, `id: check_action_modal`, width ~`750`
     (matching the pages' `content_width`), with the built-in OK/Cancel footer
     hidden — the surface's signal buttons drive submission. (Check the Modal
     block's schema for the footer-hiding prop; the repo's antd version may
     expose `footer: null` or per-button hiding.)
   - **Request** (component-local): `id: get_workflow_action`, type
     `GetWorkflowAction`, `connectionId: { _module.connectionId: workflow-api }`,
     payload `action_id: { _state: check_action_modal.action_id }`,
     properties `action_id: { _payload: action_id }` — the modal-side twin of
     `modules/workflows/requests/get_workflow_action.yaml` (which reads
     `_url_query`; URL-bound, so not reusable here).
   - **`onOpen`**: `Request get_workflow_action` → `set_current_action`
     (spread the response into `current_action`) → `seed_working_state`
     (`current_action.fields.{assignees, due_date, description}` from the
     response; `current_action.comment: null`) — the same population
     convention as the pages (tasks 4–6). One read convention, two writers
     (design D1).
   - **Body**: `_ref` `components/check-action-surface.yaml` with:
     - `mode`: the runtime `_if` chain above, reading
       `_state: current_action.status.0.stage`,
       `_state: current_action.allowed.review`,
       `_state: current_action.allowed.edit` (and
       `_array.includes` for the actionable-stage test). Remember the surface
       only evaluates `mode` in runtime positions (tasks.md note 6) — this is
       why a derived mode works at all.
     - `on_complete`:

       ```yaml
       on_complete:
         _build.array.concat:
           - _var:
               key: on_complete
               default: []
           - - id: close_check_action_modal
             type: CallMethod
             params:
               blockId: check_action_modal
               method: setOpen
               args:
                 - open: false
       ```

       i.e. the host-supplied refetch runs first, then the modal closes
       (design D5: "runs the host-supplied onComplete refetch and closes").
   - **Component vars**: `on_complete` (optional actions array, default `[]`)
     — the host's refetch sequence.
   - **Header comment**: the open contract (verbatim YAML), the
     one-instance-per-page rule ("the modal is dropped exactly once per page,
     and `actions-on-entity` is what drops it when present"), the fixed
     request id constraint (never drop this component on a page that already
     defines a `get_workflow_action` request — i.e. the `workflow-action-*`
     pages), and the mode-derivation table.

2. Register in `modules/workflows/module.lowdefy.yaml`:
   - `components:` list — `id: check-action-modal`, `_ref` the file;
   - `exports.components` — same id with a description (host pages compose it
     with `EventsTimeline.onActionClick`; `actions-on-entity` bundles it).
   The surface (task 3) stays unregistered/internal.

## Acceptance Criteria

- The component is a single `Modal` with fixed blockId `check_action_modal`,
  opened exclusively via the documented SetState + CallMethod contract.
- Opening it fetches fresh `GetWorkflowAction` data for the clicked action
  and populates `current_action` identically to the pages.
- Mode derivation matches the four rules above (verifiable in task 10's e2e:
  an `action-required` check action opens in `edit` mode with
  Submit/Mark Started; an `error`-stage one opens in `view` mode with
  Resolve Error).
- A successful signal from inside the modal runs the host's `on_complete`
  actions and then closes the modal.
- `check-action-modal` appears in the manifest's `components:` and
  `exports.components`; the demo app build succeeds.

## Files

- `modules/workflows/components/check-action-modal.yaml` — create — standalone modal per above
- `modules/workflows/module.lowdefy.yaml` — modify — register + export `check-action-modal`

## Notes

- **`setOpen` vs `open`:** the design's contract says
  `method: setOpen, args: [{ open: true }]`; the shipped review page calls
  `method: open` on its modal (`workflow-action-review.yaml:152–156`). Verify
  which methods the Modal block actually registers in this repo's Lowdefy
  version and use that consistently in the modal, its header-comment
  contract, and task 8's wiring — if it's `open`/`close` rather than
  `setOpen`, keep the design's intent (a fixed, documented method call) and
  note the method-name substitution in the component header.
- If the Modal block exposes no `onOpen` event, fall back to documenting the
  fetch as part of the open contract (SetState → CallMethod → the host fires
  nothing else; the modal's own `onOpen` is strongly preferred — check the
  block's events before restructuring).
- `mode: view` inside the modal still renders the status history — by design
  (stateful List, no request, no duplicate-requestId hazard).
