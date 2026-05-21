# Task 5: Error template (`templates/error.yaml.njk`)

## Context

`error.yaml.njk` is the recovery surface for actions in `error` status. Ships:

- Failure-context banner reading `status[0].error_message` and `status[0].error_metadata` from the action doc.
- Recovery form via `_ref: { resolver: makeActionsForm.js, vars: { form: action_config.form_error, mode: 'error' } }`. **Per part 15:** the resolver does **not** synthesize `form_error` from `form` when absent — when the author hasn't declared `form_error`, the template falls through to `[]` (empty form body), and the failure-context banner stands alone.
- Template-shipped `resolve_error` button with overridable title (the one interaction button whose label varies per app, per the chrome-override table) and optional confirm modal.
- Same outer-card suppression rule as edit (per the design: "This applies to `edit.yaml.njk` and `error.yaml.njk` only").

Current file at `modules/workflows/templates/error.yaml.njk` is a placeholder. Replace its body.

Error's stale-URL allowlist: `[error]`. Only renders during recovery; everything else redirects to `-view`.

## Task

Replace the body of `modules/workflows/templates/error.yaml.njk`.

### Top-level shape

Single `_ref: { module: layout, component: page }`. Outer-card suppression: wrap card-interior content in `layout.card` unless `action_config.form_error[0]?.form` is truthy. Note this is `form_error[0]` (not `form[0]`) — error template's first-entry check is against its own form schema, not the main `form`.

### Requests

```yaml
requests:
  _build.array.concat:
    - - _ref: ../requests/get_action.yaml
      - _ref: ../requests/get_workflow.yaml
      - _ref:
          path: ../requests/get_entity.yaml.njk
          vars:
            entity_collection: {{ entity_collection }}
    - _var:
        key: page_config.requests
        default: []
```

### `onMount` sequence

Full 8-step sequence with step 3 stale-URL guard limited to `[error]`:

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
            _eq:
              - _request: get_action.status.0.stage
              - error
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

Block ordering inside `layout.card`:

1. Failure-context banner (alert block reading `status[0].error_message` + `status[0].error_metadata`).
2. `page_config.formHeader` (author-supplied above the form).
3. Universal-fields band (`mode: display`, `kind: form` — recovery flow doesn't include metadata edits).
4. Recovery form body via `makeActionsForm` against `action_config.form_error` (defaults to `[]` when absent).
5. Optional comment input.
6. `page_config.formFooter`.

```yaml
blocks:
  _build.array.concat:
    - _build.if:
        test:
          _build.ne:
            - _build.get:
                key: action_config.form_error.0.form
                default: null
            - null
        then: # First entry of form_error owns its own outer chrome — no outer layout.card wrap.
          [BLOCKS]
        else:
          - _ref:
              module: layout
              component: card
              vars:
                hide_title: true
                blocks: [BLOCKS]
    # Floating-actions sticky button bar
    - - _ref:
          module: layout
          component: floating-actions
          vars:
            actions: [BUTTONS]
    # Optional confirm modal
    - [MODAL]
```

### `[BLOCKS]`

```yaml
# Failure-context banner
- - id: failure_banner
    type: Alert
    properties:
      type: error
      showIcon: true
      message:
        _nunjucks:
          template: |
            <strong>{% raw %}{{ message }}{% endraw %}</strong>
          on:
            message:
              _request: get_action.status.0.error_message
      description:
        _nunjucks:
          template: |
            <pre>{% raw %}{{ metadata | safe }}{% endraw %}</pre>
          on:
            metadata:
              _json.stringify:
                - _request: get_action.status.0.error_metadata
                - null
                - 2
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
# Recovery form — defaults to [] when form_error is absent (per part 15, no synthesis from form)
- - _ref:
      resolver: ../resolvers/makeActionsForm.js
      vars:
        form:
          _var:
            key: action_config.form_error
            default: []
        mode: error
- - id: comment
    type: TiptapInput
    properties:
      title: Comment
      placeholder: Add a comment about the recovery (optional).
- _var:
    key: page_config.formFooter
    default: []
```

### `[BUTTONS]`

Single `resolve_error` button. v0-parity overrides: `title`, `disabled`, `visible`, optional `modal`.

```yaml
- id: button_resolve_error
  type: Button
  visible:
    _and:
      - _var:
          key: page_config.buttons.resolve_error.visible
          default: true
      - _eq:
          - _state: action_allowed
          - true
  properties:
    title:
      _var:
        key: page_config.buttons.resolve_error.title
        default: Resolve
    type: primary
    disabled:
      _var:
        key: page_config.buttons.resolve_error.disabled
        default: false
  events:
    onClick:
      _build.if:
        test:
          _build.ne:
            - _build.get:
                key: page_config.buttons.resolve_error.modal
                default: null
            - null
        then:
          - id: open_resolve_error_modal
            type: CallMethod
            params:
              method: open
              blockId: resolve_error_modal
        else:
          _build.array.concat:
            - - id: validate
                type: Validate
                params:
                  regex:
                    - ^form\.
                    - ^fields\.
            - _var:
                key: page_config.events.onSubmit
                default: []
            - - id: submit_resolve_error
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
                    interaction: resolve_error
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

### `[MODAL]`

Optional `resolve_error_modal` (ConfirmModal) iff `page_config.buttons.resolve_error.modal` is set:

```yaml
- id: resolve_error_modal
  type: ConfirmModal
  visible:
    _build.ne:
      - _build.get:
          key: page_config.buttons.resolve_error.modal
          default: null
      - null
  properties:
    width: 600
    title:
      _var:
        key: page_config.buttons.resolve_error.modal.title
        default: null
    okText:
      _var:
        key: page_config.buttons.resolve_error.title
        default: Resolve
    content:
      _var:
        key: page_config.buttons.resolve_error.modal.content
        default: You are resolving this error. Would you like to proceed?
  events:
    onOk:
      _build.array.concat:
        - - id: validate
            type: Validate
            params:
              regex:
                - ^form\.
                - ^fields\.
        - _var:
            key: page_config.events.onSubmit
            default: []
        - - id: submit_resolve_error
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
                interaction: resolve_error
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

## Acceptance Criteria

- `modules/workflows/templates/error.yaml.njk` no longer contains the placeholder Html.
- Top-level block is a single `_ref: { module: layout, component: page }`.
- `requests:` concatenates the three module-shipped requests + `page_config.requests`.
- `onMount` runs the 8-step sequence with step 3 stale-URL guard against allowlist `[error]` (redirect to `-view` if status is not `error`).
- Failure-context banner is the first card-interior block — renders an Alert with `error_message` (from `status[0].error_message`) as the main message and `error_metadata` (JSON-stringified from `status[0].error_metadata`) as the description.
- Block ordering: failure-context banner → `page_config.formHeader` → universal-fields band (`mode: display`) → recovery form body → comment input → `page_config.formFooter`.
- Recovery form body uses `makeActionsForm` with `vars: { form: <action_config.form_error or []>, mode: 'error' }`. **No synthesis from `form`** — when `form_error` is absent, the resolver receives `[]` and renders nothing (the failure-context banner stands alone).
- Outer-card suppression: if `action_config.form_error[0]?.form` is truthy (first entry of the recovery form owns its outer chrome), drop the outer `layout.card`; otherwise wrap.
- Floating-actions bar carries one button: `resolve_error`, with overridable `title` (default `"Resolve"`), `disabled`, `visible`, and optional `modal`.
- `resolve_error` button is gated on `_state.action_allowed === true`.
- `resolve_error` payload: `action_id`, `interaction: resolve_error`, `current_key`, `form`, `form_review`, `fields`, `comment`.
- Optional `resolve_error_modal` (ConfirmModal) renders iff `page_config.buttons.resolve_error.modal` is set. Modal `onOk` does the same Validate + onSubmit + CallApi sequence the direct path does.
- Building the demo app emits the error page (e.g. `workflows/qualify-error` — only when `error` is in the action's access list) and renders without runtime errors. Manual verification: navigate to the error page for an action whose `status[0].stage === error`; banner shows; recovery form renders if `form_error` is declared, otherwise empty; clicking Resolve calls the engine with the right payload.

## Files

- `modules/workflows/templates/error.yaml.njk` — modify — replace placeholder body with the full error-page implementation.

## Notes

- **`form_error` is the resolver-input var, not the state path.** The state path for the recovery form is still `_state.form` (not `_state.form_error`) — `makeActionsForm` emits input blocks under `form.*`. The button reads `_state: form` per the standard payload contract. The `form_error` var only tells the resolver which schema to substitute against.
- **`form` payload field on resolve_error.** The button sends `form: { _state: form }` — this is the recovery form's data, which the engine writes back to the action's `form_data`. The handler's `resolve_error` interaction handles the same submit path as `submit_edit`; the engine resolves target status via `interactions.resolve_error.status` or the default per submit-pipeline.
- **JSON-stringify `error_metadata`.** v0 didn't pretty-print metadata; v1 wraps in a `<pre>` block with JSON-stringified output. If the metadata is HTML-unsafe (user-supplied), the `| safe` filter is *not* applied — Nunjucks auto-escapes by default. The wrapper template above uses `{{ metadata | safe }}` after JSON-stringifying; check that the resulting string is safe (JSON-stringified JS values are HTML-safe unless they contain literal `<script>` strings, which would still render as text inside `<pre>`).
- **Per-app `error` page emission.** Part 12 only emits the `-error` page when `error` is in the action's `access.{app_name}` verb list. Apps that don't grant `error` access have no recovery surface; the engine still writes the `error` transition to the action doc but there's no UI route.
- **The `resolve_error` button is the only `title`-overridable button** in the entire vocabulary (per the chrome-override table in the design). v0 parity: error recovery wording varies per app ("Retry installation", "Mark resolved", "Acknowledge"), so the title slot is exposed. Other interaction buttons have fixed labels.
- **`_json.stringify` operator.** If this repo's Lowdefy operator set doesn't include `_json.stringify`, fall back to `_js` with `JSON.stringify(metadata, null, 2)`. Check `apps/demo/lowdefy.yaml` or any existing operator usage for the canonical form.
