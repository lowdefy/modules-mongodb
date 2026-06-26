# Task 4: Review template (`templates/review.yaml.njk`)

## Context

`review.yaml.njk` is the read-only-main + writable-review hybrid. It renders the main form via `DataView` (v0 parity per finding #12 resolution — `makeActionsForm`'s `mode` var only filters `viewOnly`, doesn't switch components to read-only render), the writable `form_review` block via `makeActionsForm` with `mode: 'review'`, two interaction buttons (`approve` + `request_changes`), a navigation button (`Edit`), and a dedicated request-changes modal.

Current file at `modules/workflows/templates/review.yaml.njk` is a placeholder. Replace its body.

Review's stale-URL allowlist: `[in-review, error]`. (`error` is included so reviewers can see the action while it's mid-recovery; the engine-side recovery flow handles the actual transition.)

The `Edit` navigation button links to `page_ids.edit` with `input: { skip_status_redirect: true }` so edit's stale-URL guard doesn't redirect away when the action is sitting in `in-review`.

## Task

Replace the body of `modules/workflows/templates/review.yaml.njk`.

### Top-level shape

Single `_ref: { module: layout, component: page }`. No outer-card suppression on review (per design's note in "Outer-card suppression" subsection: "This applies to `edit.yaml.njk` and `error.yaml.njk` only — `view.yaml.njk` and `review.yaml.njk` use `DataView` / read-only rendering with their own composition").

### Requests

Same as edit/view:

```yaml
requests:
  _build.array.concat:
    - - _ref: ../requests/get_action.yaml
      - _ref: ../requests/get_workflow.yaml
      - _ref:
          path: ../requests/get_entity.yaml.njk
          vars:
            entity_collection: { { entity_collection } }
    - _var:
        key: page_config.requests
        default: []
```

### `onMount` sequence

Full 8-step sequence with step 3 redirect allowlist `[in-review, error]`:

```yaml
events:
  onMount:
    _build.array.concat:
      - - id: redirect_no_action
          type: Link
          skip:
            _ne:
              - _url_query: action_id
              - null
          params:
            back: true
        - id: get_action
          type: Request
          params: get_action
        - id: redirect_stale_status
          type: Link
          skip:
            _array.includes:
              - [in-review, error]
              - _request: get_action.status.0.stage
          params:
            pageId:
              _var: page_ids.view
            urlQuery:
              _url_query: true
        - id: get_workflow
          type: Request
          params: get_workflow
        - id: get_entity
          type: Request
          params: get_entity
        - _ref:
            path: ../components/action_role_check.yaml
            vars:
              action_config:
                _var: action_config
        - id: prime_form_state
          type: SetState
          params:
            form:
              _request:
                _string.concat:
                  - get_workflow.form_data.
                  - _var: action_config.type
            form_review:
              _request:
                _string.concat:
                  - get_workflow.form_data.
                  - _var: action_config.type
            fields:
              assignees:
                _request: get_action.assignees
              due_date:
                _request: get_action.due_date
              description:
                _request: get_action.description
            comment: null
      - _var:
          key: page_config.events.onMount
          default: []
```

### Title

```yaml
title:
  _var:
    key: page_config.title
    default: null
```

### Content blocks

Per the design's block-ordering subsection — review's interior is:

1. `page_config.formHeader`.
2. Universal-fields band (part 24 component, `mode: display`, `kind: form`).
3. Read-only main form via `DataView` (against `action_config.form`).
4. Writable form_review body via `makeActionsForm` (against `action_config.form_review` with `mode: 'review'`).
5. Optional comment input.
6. `page_config.formFooter`.

```yaml
blocks:
  _build.array.concat:
    - - _ref:
          module: layout
          component: card
          vars:
            hide_title: true
            blocks:
              _build.array.concat:
                - _var:
                    key: page_config.formHeader
                    default: []
                - - _ref:
                      path: ../components/universal-fields/universal-fields.yaml
                      vars:
                        mode: display
                        kind: form
                        action_data:
                          assignees:
                            _request: get_action.assignees
                          due_date:
                            _request: get_action.due_date
                          description:
                            _request: get_action.description
                - - id: form_body
                    type: DataView
                    properties:
                      formConfig:
                        _var: action_config.form
                      data:
                        form:
                          _state: form
                        entity:
                          _request: get_entity
                # Writable form_review section — only renders if form_review is non-empty
                - _build.if:
                    test:
                      _build.gt:
                        - _build.array.length:
                            _build.get:
                              key: action_config.form_review
                              default: []
                        - 0
                    then:
                      - id: form_review_section
                        type: Box
                        visible:
                          _and:
                            - _eq:
                                - _request: get_action.status.0.stage
                                - in-review
                            - _eq:
                                - _state: action_allowed
                                - true
                        blocks:
                          - id: form_review_divider
                            type: Divider
                            properties:
                              title: Review
                          - _ref:
                              resolver: ../resolvers/makeActionsForm.js
                              vars:
                                form:
                                  _var: action_config.form_review
                                mode: review
                    else: []
                - - id: comment
                    type: TiptapInput
                    properties:
                      title: Comment
                      placeholder: Add a comment (optional).
                - _var:
                    key: page_config.formFooter
                    default: []
    # Floating-actions bar with three buttons: Edit (navigation), approve, request_changes
    - - _ref:
          module: layout
          component: floating-actions
          vars:
            actions: [BUTTONS]
    # Dedicated request-changes modal
    - - id: request_changes_modal
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
              - _var:
                  key: page_config.events.onRequestChanges
                  default: []
              - - id: submit_request_changes
                  type: CallApi
                  params:
                    endpointId:
                      _module.endpointId:
                        id:
                          _string.concat:
                            - update-action-
                            - _var: action_config.type
                        module: workflows
                    payload:
                      action_id:
                        _request: get_action._id
                      interaction: request_changes
                      current_key:
                        _request: get_action.key
                      form:
                        _state: form
                      form_review:
                        _state: form_review
                      fields:
                        _state: fields
                      comment:
                        _state: comment
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

### `[BUTTONS]` — three buttons (Edit navigation + approve + request_changes interaction)

```yaml
# Edit navigation button — renders iff page_ids.edit is defined
- id: button_edit
  type: Button
  visible:
    _var:
      key: page_config.buttons.edit.visible
      default:
        _build.ne:
          - _var: page_ids.edit
          - null
  properties:
    title: Edit
    type: default
    disabled:
      _var:
        key: page_config.buttons.edit.disabled
        default: false
  events:
    onClick:
      - id: link_edit
        type: Link
        params:
          pageId:
            _var: page_ids.edit
          urlQuery:
            _url_query: true
          input:
            skip_status_redirect: true

# request_changes button
- id: button_request_changes
  type: Button
  visible:
    _and:
      - _var:
          key: page_config.buttons.request_changes.visible
          default: true
      - _eq:
          - _state: action_allowed
          - true
  properties:
    title: Request Changes
    type: danger
    ghost: true
    disabled:
      _var:
        key: page_config.buttons.request_changes.disabled
        default: false
  events:
    onClick:
      - id: open_request_changes_modal
        type: CallMethod
        params:
          method: open
          blockId: request_changes_modal

# approve button
- id: button_approve
  type: Button
  visible:
    _and:
      - _var:
          key: page_config.buttons.approve.visible
          default: true
      - _eq:
          - _state: action_allowed
          - true
  properties:
    title: Approve
    type: primary
    disabled:
      _var:
        key: page_config.buttons.approve.disabled
        default: false
  events:
    onClick:
      _build.if:
        test:
          _build.ne:
            - _build.get:
                key: page_config.buttons.approve.modal
                default: null
            - null
        then:
          - id: open_approve_modal
            type: CallMethod
            params:
              method: open
              blockId: approve_modal
        else:
          _build.array.concat:
            - - id: validate
                type: Validate
                params:
                  regex:
                    - ^form_review\.
                    - ^fields\.
            - _var:
                key: page_config.events.onApprove
                default: []
            - - id: submit_approve
                type: CallApi
                params:
                  endpointId:
                    _module.endpointId:
                      id:
                        _string.concat:
                          - update-action-
                          - _var: action_config.type
                      module: workflows
                  payload:
                    action_id:
                      _request: get_action._id
                    interaction: approve
                    current_key:
                      _request: get_action.key
                    form:
                      _state: form
                    form_review:
                      _state: form_review
                    fields:
                      _state: fields
                    comment:
                      _state: comment
```

Also append an optional `approve_modal` (ConfirmModal) iff `page_config.buttons.approve.modal` is set, mirroring task 3's submit-edit-modal pattern.

## Acceptance Criteria

- `modules/workflows/templates/review.yaml.njk` no longer contains the placeholder Html.
- Top-level block is a single `_ref: { module: layout, component: page }`.
- `requests:` concatenates three module-shipped requests + `page_config.requests`.
- `onMount` runs the 8-step sequence including step 3 stale-URL guard with allowlist `[in-review, error]`. No `_input: skip_status_redirect` escape hatch here (review doesn't need one — edit is the only template that does).
- Step 7 (`prime_form_state`) primes both `_state.form` AND `_state.form_review` from the same `get_workflow.form_data.{action_type}` path.
- Block ordering inside `layout.card`: `page_config.formHeader` → universal-fields band (`mode: display`) → read-only main form via `DataView` → writable `form_review` section (conditional on `action_config.form_review` non-empty + status `in-review` + action_allowed) → comment input → `page_config.formFooter`.
- Read-only main form uses `DataView` with `formConfig: action_config.form`. **Not** `makeActionsForm`.
- Writable form_review section uses `makeActionsForm` with `vars: { form: action_config.form_review, mode: 'review' }`.
- Floating-actions bar carries three buttons in order: `Edit` (navigation, leftmost), `Request Changes` (danger style), `Approve` (primary).
- `Edit` button is a `Link` to `page_ids.edit` with `input: { skip_status_redirect: true }`. Renders iff `page_ids.edit` is defined.
- `Request Changes` button opens `request_changes_modal` — does NOT post directly (modal is mandatory; the comment is required input).
- `Approve` button posts directly OR opens optional confirm modal if `page_config.buttons.approve.modal` is set.
- Approve payload: `action_id`, `interaction: approve`, `current_key`, `form`, `form_review`, `fields`, `comment`.
- Request-changes payload: `action_id`, `interaction: request_changes`, `current_key`, `form`, `form_review`, `fields`, `comment`. Comment is **required** (modal validates).
- `_state.action_allowed` gates both interaction buttons (Edit navigation button is NOT gated on action_allowed — anyone with view-then-edit access can navigate; the edit page's own `action_allowed` gate guards writes).
- Building the demo app emits `workflows/onboarding-send-quote-review` (and equivalents) and renders without runtime errors.

## Files

- `modules/workflows/templates/review.yaml.njk` — modify — replace placeholder body with the full review-page implementation.

## Notes

- **Three buttons, two payloads.** `Edit` is a navigation Link (no payload). `Request Changes` and `Approve` are interaction buttons that post to `update-action-{action_type}`.
- **Validate regex on approve.** Reviewers may not have edited `form` (it's read-only), but the validate step still scans `^form_review\.` and `^fields\.` to surface any errors before submission. v0 used regex `'^form\.'`; v1 broadens to include form_review.
- **`Request Changes` modal vs. `submit_edit` modal.** The submit-edit modal is a confirm-style "Are you sure?" prompt (optional). The request-changes modal is a _required_ input modal carrying the comment field. Different blocks: one is `ConfirmModal`, one is `Modal` with form inputs.
- **`approve_modal` is the only optional modal on review.** v0 didn't have one; v1 adds it for parity with edit's `submit_edit_modal` since both buttons land terminal-style transitions. Skip it if scope-tight; the design's chrome-overrides table lists `modal` for `submit_edit`, `not_required`, `resolve_error` only — approve and request_changes have their own dedicated modals (per the chrome table footer).
- **Reviewer-as-form-editor concern.** With the writable `form_review` section visible only when status is `in-review`, after approve, the page redirects (typical pattern) — but the design doesn't specify what happens post-submit. Suggested behavior: after a successful CallApi, fire a `Link` to the workflow's parent entity page or to view. v0 redirected to the entity view page. Add this as the last step in the approve `onClick` chain if test fixtures show the page stays on review post-submit.
- **The `form_review` section's `visible:` test** — current proposal: visible iff `status === in-review` AND `action_allowed`. v0 also wrapped it in a Collapse panel for visual hierarchy ("Approve Review" collapsible header). v1 simplifies to a Divider with title; restore Collapse if v0 parity verification requires it.
