# Task 12: Cross-Module Exports — `capture_activity` + `open_capture`

## Context

After Task 8, `form_activity` exists. This task builds two cross-module exports for the capture flow:

- `capture_activity` — button + modal bundle for creating activities from anywhere. Self-contained.
- `open_capture` — action sequence component that navigates to `pageId: new` with prefill in `urlQuery`. For non-button triggers (menu items, command-palette entries, keyboard shortcuts, list row actions).

Both are declared in the manifest's `exports.components` from Task 1. This task adds the actual files and wires them into the manifest's `components:` list.

The convention shift this codifies: companies/contacts ship `button_new_company.yaml` / `button_new_contact.yaml` as **internal** components — each consumer that wants a "create" trigger references their page via `_module.pageId: { id: new, module: companies }` and styles their own button. Activities exports `capture_activity` cross-module because the modal flow + form prefill + action wiring is non-trivial to replicate per consumer (per `design.md`'s Exports section rationale).

## Task

### `modules/activities/components/capture_activity.yaml`

Self-contained button + modal. Drop it anywhere on a page; it provides a capture flow that stays in context.

Vars accepted (all optional):
- **Prefill** — `prefill: { type, contact_ids, company_ids, title, description }`. Any subset; missing fields default to empty.
- **Appearance** — `label` (button text), `icon`, `button_type` (`primary | default | link | text`), `size` (`small | middle | large`).
- **Behavior** — `mode: modal | page` (default `modal`). In `page` mode, the button skips the modal and Links to `pageId: new` with prefill in `urlQuery`. In `modal` mode (default), opens a Modal that renders `form_activity`.
- **Callbacks** — `on_created` (action sequence run after successful submit).

Shape:

```yaml
id: capture_activity
type: Box
blocks:
  - id: trigger_button
    type: Button
    properties:
      title:
        _state: capture.label  # or _module.var or via vars binding — verify pattern
      icon:
        _state: capture.icon
      type:
        _state: capture.button_type
      size:
        _state: capture.size
    events:
      onClick:
        _if:
          test:
            _eq:
              - _state: capture.mode
              - page
          then:
            - id: go_new
              type: Link
              params:
                pageId:
                  _module.pageId: new
                urlQuery:
                  # serialize prefill into URL query — see Task 13's contract
                  ...
          else:
            - id: open_modal
              type: SetState
              params:
                capture.open: true

  - id: capture_modal
    visible:
      _state: capture.open
    type: Modal
    properties:
      title:
        _string.concat:
          - "New "
          - _module.var: label
    blocks:
      - _ref: form_activity.yaml
    events:
      onSubmit:
        - id: create
          type: CallApi
          params:
            endpointId: create-activity
            payload:
              # Build payload from form state + the modal's prefill
              ...
        - id: close_modal
          type: SetState
          params:
            capture.open: false
            capture.values: null
        - id: clear_state
          # reset form state
          ...
        - id: on_created
          type: ActionSequence
          # invoke the consumer-provided on_created (if set) — verify Lowdefy's pattern
          ...
```

Internal state lives at `state.capture.*`:
- `state.capture.open: boolean` — modal visibility.
- `state.capture.values: object` — form field values (initialized from prefill).
- `state.capture.label / icon / button_type / size / mode` — wired from vars on init.
- `state.capture.prefill` — held so submit can build the payload.

Multiple instances on a page each carry independent state — disambiguate by namespacing `state.capture_<id>.*`, or by relying on Lowdefy's per-instance state isolation if the block engine handles that.

### `modules/activities/components/open_capture.yaml`

Always-navigate action sequence. Exposed as a component (Lowdefy's cross-module sharing mechanism — there is no `action:` key on `_ref`; any config fragment shared cross-module is a component).

```yaml
- id: open_capture
  type: Link
  params:
    pageId:
      _module.pageId: new
    urlQuery:
      # Prefill carried in URL params
      type:
        _state: prefill.type      # or however vars surface
      contact_id:
        _state: prefill.contact_id
      contact_ids:
        _state: prefill.contact_ids
      company_id:
        _state: prefill.company_id
      company_ids:
        _state: prefill.company_ids
      title:
        _state: prefill.title
```

The component is a single-action sequence (a YAML list of one Link action). Consumers `_ref` it from `events.onClick` (or any event) on a button, menu item, list row, etc.:

```yaml
events:
  onClick:
    _ref:
      module: activities
      component: open_capture
      vars:
        prefill:
          type: note
          contact_id: { _url_query: _id }
```

### Manifest update

Add component `_ref` entries:

```yaml
components:
  # existing entries...
  - id: capture_activity
    component:
      _ref: components/capture_activity.yaml
  - id: open_capture
    component:
      _ref: components/open_capture.yaml
```

## Acceptance Criteria

- `capture_activity` renders as a button. Clicking in `mode: modal` opens a modal containing `form_activity` with prefill applied. Submit calls `create-activity`, closes the modal, runs `on_created`. Clicking in `mode: page` Links to `pageId: new` with the prefill in `urlQuery`.
- `open_capture` always navigates to `pageId: new` with prefill query params. Used in a button's `onClick`, it acts like a Link.
- Multiple `capture_activity` instances on the same page maintain independent state — opening one modal doesn't open the others.
- Both components register as cross-module exports and can be `_ref`'d from companies/contacts.
- Build is clean.

## Files

- `modules/activities/components/capture_activity.yaml` — create — button + modal bundle.
- `modules/activities/components/open_capture.yaml` — create — always-navigate action sequence.
- `modules/activities/module.lowdefy.yaml` — modify — add the two component `_ref` entries to the `components:` list.

## Notes

- **`open_capture` always navigates.** Don't add "open the modal if `capture_activity` is on the page" logic. Multiple `capture_activity` instances can coexist (header + tile + row action), and a shared `open_capture` trigger has no way to pick which modal to open. Single-purpose exports keep the mental model clean — see review-1 #9 resolution.
- **`description` is NOT URL-prefillable** for `mode: page` and `open_capture`. The Tiptap rich-text HTML doesn't round-trip through URL params cleanly. Channels needing to seed body content (calendar/email/WhatsApp ingestion) bypass the URL contract and call `create-activity` directly with `source: { ... }` set.
- **`mode: modal` is default.** In-context flow stays in context. `mode: page` is for main-nav buttons or contexts where a modal would feel wrong.
- **Per-instance state isolation.** If multiple `capture_activity` blocks coexist on a page, each must have independent `state.capture.*` so opening one doesn't affect others. Verify Lowdefy's behavior — block-id-namespaced state is the typical pattern. If state collisions happen, namespace via the block's id.
- **Future consideration — modal-from-link triggers.** Some flows want a link or table cell that opens capture in a modal without leaving the page. Not in scope. If it surfaces, an additional export (`capture_activity_link`) bundles its own modal — see the inline note in `design.md`'s "Capture entry points" section.
