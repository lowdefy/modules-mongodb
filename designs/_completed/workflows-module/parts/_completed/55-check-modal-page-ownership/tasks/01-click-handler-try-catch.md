# Task 1: Make the shared click handler degrade gracefully with `try`/`catch`

## Context

The shared action-card click handler `modules/workflows/components/check-action-click.yaml` is `_ref`'d into the `onActionClick` of both action surfaces (`actions-on-entity` → `ActionSteps`, `workflows-events-timeline` → `EventsTimeline`). Today it is a flat action array: a `check`-kind card runs `SetState` + `CallMethod(setOpen)` against the fixed global blockId `check_action_modal`; every other kind navigates via the server-resolved `action.link`.

The handler unconditionally assumes the modal exists. `createCallMethod` reads `RootSlots.map[blockId].methods[method]` — if the block is absent, `map[blockId]` is `undefined` and `.methods` throws, so a surface on a page without the modal errors on a `check`-row click. Subsequent tasks move the modal drop up to the page, so surfaces can no longer assume it is present.

Verified facts (from the design) this change relies on:

- **`try`/`catch` is a first-class action-chain shape.** `initEvent` (Events.js) maps an `onClick.try` → `actions` and `onClick.catch` → `catchActions`; `callActions` (Actions.js) runs the catch chain when the try chain throws. An array-valued `onClick` is sugar for `{ try: [...], catch: [] }`.
- **A missing block throws.** `createCallMethod` dereferences `RootSlots.map[blockId].methods` (`undefined.methods` on an absent block), so the absent-modal `CallMethod` reliably throws and the `catch` fires.
- **The recovered path can be made silent.** On an action error the runner shows a 6s error toast _unless_ the action sets `messages.error: false` — `displayMessage` (Actions.js) gates the toast on `hideExplicitly && message !== false`. Setting `messages: { error: false }` on the open `CallMethod` suppresses the would-be toast so the recovery is silent.

## Task

Rewrite `modules/workflows/components/check-action-click.yaml` from a flat action array into a `try`/`catch` map.

The `try` body keeps the existing three kind-branched steps, plus one addition:

1. `set_check_action_modal_action` — `SetState`, `skip` when `action.kind != check` (unchanged).
2. `open_check_action_modal` — `CallMethod` on `check_action_modal`/`setOpen`, `skip` when `action.kind != check`. **Add `messages: { error: false }`** so that when the modal is absent and the `CallMethod` throws, no error toast flashes before the catch navigates.
3. `link_to_action_page` — `Link` to `action.link.{pageId,urlQuery}`, `skip` when `action.kind == check` (unchanged; non-`check` kinds navigate directly and never touch the modal).

The `catch` body navigates to the action's own page (the absent-modal recovery path):

4. `link_to_action_page_fallback` — `Link` to `action.link.{pageId,urlQuery}` (no skip).

Match the existing YAML idioms in the file: block-sequence form for `_ne`/`_eq` operands, `_event:` for event payload access.

Target shape:

```yaml
# check kind → try the in-context modal, else navigate to the action's page.
# other kinds → navigate via action.link (never touches the modal).
try:
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
    # error:false → when no modal is on the page the CallMethod throws and the
    # catch navigates; suppress the would-be error toast so recovery is silent.
    messages:
      error: false
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
catch:
  # Modal not on the page (open threw) — navigate to the action's own page.
  - id: link_to_action_page_fallback
    type: Link
    params:
      pageId:
        _event: action.link.pageId
      urlQuery:
        _event: action.link.urlQuery
```

Update the header comment block to describe the new behaviour: a `check` card _tries_ to open the modal and, when no modal is on the page, the `catch` navigates to `action.link`; non-`check` kinds navigate in the `try` body and never touch the modal. Note that only the open `CallMethod` carries `messages.error:false`.

## Acceptance Criteria

- `check-action-click.yaml` is a `try`/`catch` map (no longer a flat array).
- `open_check_action_modal` carries `messages: { error: false }`.
- The `catch` contains exactly one `Link` step navigating to `action.link.{pageId,urlQuery}`.
- The behaviour matrix holds: `check` + modal present → modal opens, `link` skipped; `check` + modal absent → `open` throws → `catch` navigates; other kind → `set`/`open` skipped, `link` runs, no `catch`.
- `pnpm ldf:b` from `apps/demo` compiles cleanly (the handler is `_ref`'d by both surfaces, still mounted on `lead-view`/`companies/view`).

## Files

- `modules/workflows/components/check-action-click.yaml` — modify — restructure into `try`/`catch`; add `messages.error:false` to the open `CallMethod`; add the catch-path navigation `Link`; update the header comment.

## Notes

- The `catch` is a catch-all (Lowdefy runs it on _any_ throw in the `try` body), not modal-absent-only. The only expected throw is the absent-modal `CallMethod` — the preceding `SetState` is a static assignment that effectively cannot throw. A throw from elsewhere would still navigate to the action's own page, a safe default for any check-row failure.
- Only the open `CallMethod` carries `messages.error:false`; a throw from anywhere else in the `try` body would still flash a toast before the fallback navigates. This is an accepted residual (those cases are not expected to occur) — do not blanket-suppress errors on the other steps.
