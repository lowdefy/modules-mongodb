# Task 5: Add a floating-actions button bar to `view.yaml.njk`

## Context

`modules/workflows/templates/view.yaml.njk` is the read-only landing page for an action (the default landing for `done` actions). Today it is read-only with **no button bar** (line 14: "View is read-only — no buttons"). It has no stale-URL guard.

The state-machine design's default `view` bar surfaces two affordances:

- An **Edit** button that _navigates_ to the edit page (navigation, not a signal).
- A **`request_changes`** button (behind a comment modal) for the `done → changes-required` revise-after-done path.

This is the one net-new surface in Part 39. The concrete need is the **no-`review`-verb** configuration: an action with no `review` verb has `submit` land it straight to `done` and ships **no review page at all**, so `view` is the only surface from which it can be sent back.

Task 1 shipped `enums/button_signal_sources.yaml`. The `request_changes` source list is `[in-review, done]`. The `review.yaml.njk` template (existing) is the reference for both the Edit-nav `Link` button (lines ~195–224) and the `request_changes` mandatory-comment modal (lines ~225–250, ~316–373).

## Task

Add a floating-actions bar and its modal to `view.yaml.njk`. The page's `blocks` is currently a single `form_card` block (not a `_build.array.concat`); wrap it so the bar and modal are appended.

### 1. Restructure `blocks` into a concat

Change the top-level `blocks:` from the bare `form_card` block into a `_build.array.concat` whose first element is the existing `form_card` (unchanged), followed by the floating-actions bar and the request-changes modal.

### 2. Edit-nav `Link` button

Mirror `review.yaml.njk`'s `button_edit`: a `Link` to `page_ids.edit`, visible when `page_ids.edit` is set (and per `page_config.buttons.edit.visible`), that sets `input: { skip_status_redirect: true }`.

The `skip_status_redirect` flag is **essential**: without it, a `view`→Edit click on a `done` action bounces straight back, because `edit.yaml.njk`'s stale-URL guard redirects any stage outside `[action-required, in-progress, changes-required]` to `-view` (and `done` is excluded). The flag is what makes the re-open path reachable from the UI.

```yaml
- id: button_edit
  type: Button
  visible:
    _var:
      key: page_config.buttons.edit.visible
      default:
        _build.ne:
          - _var: { key: page_ids.edit, default: null }
          - null
  properties:
    title: Edit
    type: default
    disabled:
      _var: { key: page_config.buttons.edit.disabled, default: false }
  events:
    onClick:
      - id: link_edit
        type: Link
        params:
          pageId:
            _module.pageId:
              _var: page_ids.edit
          urlQuery:
            _url_query: true
          input:
            skip_status_redirect: true
```

### 3. `request_changes` comment-modal button

Add `button_request_changes`, gated like every other template button (author opt-out AND FSM source-stage AND the per-verb role gate — here **`action_allowed.view`**, this template's verb) — **not** a "reviewers only" gate. Do **not** gate on `action_allowed.review`: the gate returns `false` for verbs absent from `access`, so review-gating would permanently hide the button in exactly the no-`review`-verb configuration that justifies it. It is **opt-in**: its author opt-out default is **`false`** (an extra revise-after-done affordance, off unless the author enables it). Its `onClick` opens the comment modal.

```yaml
- id: button_request_changes
  type: Button
  visible:
    _and:
      - _var:
          { key: page_config.buttons.request_changes.visible, default: false }
      - _array.includes:
          - _ref:
              { path: enums/button_signal_sources.yaml, key: request_changes }
          - _state: action.status.0.stage
      - _eq: [{ _state: action_allowed.view }, true]
  properties:
    title: Request Changes
    type: default
    danger: true
    ghost: true
    disabled:
      _var:
        { key: page_config.buttons.request_changes.disabled, default: false }
  events:
    onClick:
      - id: open_request_changes_modal
        type: CallMethod
        params:
          method: open
          blockId: request_changes_modal
```

### 4. `request_changes_modal`

Mirror `review.yaml.njk`'s `request_changes_modal` (mandatory comment, `maskClosable: false`, `Validate comment` → optional `onRequestChanges` author verb → `CallAPI` with `signal: request_changes`). The payload carries `action_id`, `signal: request_changes`, `current_key`, `form`, `comment` — **no `fields`** (view renders universal fields display-only). On `onClose`, reset `comment` to null.

```yaml
- id: request_changes_modal
  type: Modal
  properties:
    width: 600
    title: Request Changes
    maskClosable: false
    okText: Request Changes
  events:
    onOk:
      _build.array.concat:
        - - id: validate
            type: Validate
            params: comment
        - _var: { key: page_config.events.onRequestChanges, default: [] }
        - - id: submit_request_changes
            type: CallAPI
            params:
              endpointId:
                _module.endpointId:
                  _build.string.concat:
                    [update-action-, { _var: action_config.type }]
              payload:
                action_id: { _state: action._id }
                signal: request_changes
                current_key: { _state: action.key }
                form: { _state: form }
                comment: { _state: comment }
    onClose:
      - id: reset_comment
        type: SetState
        params:
          comment: null
  blocks:
    - id: comment
      type: TiptapInput
      required: true
      validate:
        - message: A comment is required to request changes
          status: error
          pass:
            _ne:
              - _state: comment
              - null
      properties:
        title: Change Description
        placeholder: Please provide a description of the changes you would like.
```

## Acceptance Criteria

- `view.yaml.njk` renders a `floating-actions` bar (via `_ref: { module: layout, component: floating-actions }`) with `button_edit` and `button_request_changes`, plus a `request_changes_modal`.
- The existing `form_card` content is preserved unchanged inside the new `_build.array.concat`.
- `button_edit` is a `Link` to `page_ids.edit` that sets `input: { skip_status_redirect: true }`.
- `button_request_changes` is opt-in (author opt-out default `false`), gated by the three-way `_and` (opt-out / FSM source-stage / `action_allowed.view`), reading `enums/button_signal_sources.yaml` key `request_changes`.
- The `request_changes` payload sends `signal: request_changes` and carries no `fields` key.
- The module builds with no template errors.

## Notes

- Keep the existing `onMount` and `requests` blocks unchanged — only `blocks` grows.
- Do **not** add a stale-URL guard to `view` — it intentionally has none.
- The header comment on line 14 ("View is read-only — no buttons, no stale-URL guard…") should be updated to reflect the new bar.
- Gating is `action_allowed.view` (the per-verb gate keyed on this template's verb — `_state.action_allowed` is a map `{ view, edit, review, error }`, never a coarse boolean), not verb-scoped "reviewers only" — the no-`review`-verb case (the concrete justification) has no reviewer subset to single out. Task 8 reconciles the stale "reviewers only" prose in state-machine.md.
