# Task 3: Edit template (`templates/edit.yaml.njk`)

## Context

`edit.yaml.njk` is the most surface-rich template: writable universal-fields band, writable form body via `makeActionsForm`, two interaction buttons (`submit_edit` + opt-in `not_required`), confirm modals, outer-card suppression, status-stage stale-URL guard, full button payload assembly.

Current file at `modules/workflows/templates/edit.yaml.njk` is a placeholder. Replace its body.

Build-time vars (same as view; see task 2 Context for the full list): `action_config`, `page_config`, `page_ids`, `workflow_type`, `entity_collection`.

Edit's stale-URL allowlist (per the design): `[action-required, in-progress, changes-required]`. Escape hatch: `_input: skip_status_redirect` (set by the review-page Edit-button link — see task 4).

## Task

Replace the body of `modules/workflows/templates/edit.yaml.njk` with the implementation below.

### Top-level shape

Single `_ref: { module: layout, component: page }` wrapper. Outer-card suppression is per-render: wrap card-interior content in `_ref: { module: layout, component: card }` **unless** `action_config.form[0]?.form` is truthy.

### Requests

Same three module-shipped requests as view, concatenated with `page_config.requests`:

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

Full 8-step sequence per the design. Edit gets step 3 (stale-URL guard) with the allowlist `[action-required, in-progress, changes-required]` and the `_input: skip_status_redirect` escape hatch:

```yaml
events:
  onMount:
    _build.array.concat:
      - # Step 1: action_id presence guard
        - id: redirect_no_action
          type: Link
          skip:
            _ne:
              - _url_query: action_id
              - null
          params:
            back: true
        # Step 2: get_action
        - id: get_action
          type: Request
          params: get_action
        # Step 3: stale-URL guard — redirect to -view if status not in allowlist
        - id: redirect_stale_status
          type: Link
          skip:
            _or:
              - _array.includes:
                  - [action-required, in-progress, changes-required]
                  - _request: get_action.status.0.stage
              - _eq:
                  - _input: skip_status_redirect
                  - true
          params:
            pageId:
              _var: page_ids.view
            urlQuery:
              _url_query: true
        # Step 4: get_workflow
        - id: get_workflow
          type: Request
          params: get_workflow
        # Step 5: get_entity
        - id: get_entity
          type: Request
          params: get_entity
        # Step 6: action_role_check (sets _state.action_allowed)
        - _ref:
            path: ../components/action_role_check.yaml
            vars:
              action_config:
                _var: action_config
        # Step 7: SetState — prime form state from get_workflow.form_data
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
      # Step 8: author-supplied onMount
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

### Content blocks — block ordering inside `layout.card` (with suppression)

Wrap the interior content in `layout.card` **unless** `action_config.form[0]?.form` is truthy. Use `_build.if`:

```yaml
blocks:
  _build.array.concat:
    - _build.if:
        test:
          _build.ne:
            - _build.get:
                key: action_config.form.0.form
                default: null
            - null
        then: # First entry owns its own outer chrome — render content directly, no outer card.
          [BLOCKS]
        else: # Wrap in layout.card.
          - _ref:
              module: layout
              component: card
              vars:
                hide_title: true
                blocks: [BLOCKS]
    # Floating-actions sticky button bar (always outside layout.card)
    - - _ref:
          module: layout
          component: floating-actions
          vars:
            actions: [BUTTONS]
```

`[BLOCKS]` and `[BUTTONS]` are defined below.

### `[BLOCKS]` — card-interior content (per the design's block ordering)

```yaml
- _var:
    key: page_config.formHeader
    default: []
- - _ref:
      path: ../components/universal-fields/universal-fields.yaml
      vars:
        mode: edit
        kind: form
        action_data:
          assignees:
            _state: fields.assignees
          due_date:
            _state: fields.due_date
          description:
            _state: fields.description
- - _ref:
      resolver: ../resolvers/makeActionsForm.js
      vars:
        form:
          _var: action_config.form
        mode: edit
- # Optional comment input
  - id: comment
    type: TiptapInput
    properties:
      title: Comment
      placeholder: Add a comment (optional).
- _var:
    key: page_config.formFooter
    default: []
```

The `makeActionsForm` resolver shipped in part 15 — `modules/workflows/resolvers/makeActionsForm.js`. Path from the template is `../resolvers/makeActionsForm.js`.

### `[BUTTONS]` — floating-actions button bar

Two interaction buttons: `submit_edit` (always renders) and `not_required` (opt-in via `page_config.buttons.not_required.visible: true`).

```yaml
# submit_edit button
- id: button_submit_edit
  type: Button
  visible:
    _and:
      - _var:
          key: page_config.buttons.submit_edit.visible
          default: true
      - _eq:
          - _state: action_allowed
          - true
  properties:
    title: Submit
    type: primary
    disabled:
      _var:
        key: page_config.buttons.submit_edit.disabled
        default: false
  events:
    onClick:
      _build.if:
        test:
          _build.ne:
            - _build.get:
                key: page_config.buttons.submit_edit.modal
                default: null
            - null
        then: # Open confirm modal
          - id: open_submit_modal
            type: CallMethod
            params:
              method: open
              blockId: submit_edit_modal
        else: # Validate + fire onSubmit + post to engine
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
            - - id: submit_edit
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
                    interaction: submit_edit
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

# not_required button (opt-in)
- id: button_not_required
  type: Button
  visible:
    _and:
      - _var:
          key: page_config.buttons.not_required.visible
          default: false
      - _eq:
          - _state: action_allowed
          - true
      - _gt:
          - _global:
              _string.concat:
                - action_statuses.
                - _request: get_action.status.0.stage
                - .priority
          - 0
  properties:
    title: Mark Not Required
    type: secondary
    disabled:
      _var:
        key: page_config.buttons.not_required.disabled
        default: false
  events:
    onClick:
      _build.if:
        test:
          _build.ne:
            - _build.get:
                key: page_config.buttons.not_required.modal
                default: null
            - null
        then:
          - id: open_not_required_modal
            type: CallMethod
            params:
              method: open
              blockId: not_required_modal
        else:
          _build.array.concat:
            - _var:
                key: page_config.events.onSubmit
                default: []
            - - id: submit_not_required
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
                    interaction: not_required
                    current_key:
                      _request: get_action.key
                    fields:
                      _state: fields
                    comment:
                      _state: comment
```

### Confirm modals

Append two `ConfirmModal` blocks **outside** `layout.card` (siblings to the floating-actions bar in the page's `blocks` list). These render iff the corresponding `page_config.buttons.{name}.modal` is set:

```yaml
- id: submit_edit_modal
  type: ConfirmModal
  visible:
    _build.ne:
      - _build.get:
          key: page_config.buttons.submit_edit.modal
          default: null
      - null
  properties:
    width: 600
    title:
      _var:
        key: page_config.buttons.submit_edit.modal.title
        default: null
    okText: Submit
    content:
      _var:
        key: page_config.buttons.submit_edit.modal.content
        default: You are confirming your submission. Would you like to proceed?
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
        - - id: submit_edit
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
                interaction: submit_edit
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

- id: not_required_modal
  type: ConfirmModal
  visible:
    _build.ne:
      - _build.get:
          key: page_config.buttons.not_required.modal
          default: null
      - null
  properties:
    width: 600
    title:
      _var:
        key: page_config.buttons.not_required.modal.title
        default: null
    okText: Mark Not Required
    content:
      _var:
        key: page_config.buttons.not_required.modal.content
        default: You are marking this action as not required. Would you like to proceed?
  events:
    onOk:
      _build.array.concat:
        - _var:
            key: page_config.events.onSubmit
            default: []
        - - id: submit_not_required
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
                interaction: not_required
                current_key:
                  _request: get_action.key
                fields:
                  _state: fields
                comment:
                  _state: comment
```

## Acceptance Criteria

- `modules/workflows/templates/edit.yaml.njk` no longer contains the placeholder Html.
- Top-level block is a single `_ref: { module: layout, component: page }`.
- `requests:` concatenates the three module-shipped requests + `page_config.requests`.
- `onMount` runs the full 8-step sequence including step 3 (stale-URL guard with `[action-required, in-progress, changes-required]` allowlist + `_input: skip_status_redirect` escape hatch).
- Block ordering inside `layout.card`: `page_config.formHeader` → universal-fields band (`mode: edit`) → form body (`makeActionsForm` with `mode: edit`) → comment input → `page_config.formFooter`.
- **Outer-card suppression rule:** if `action_config.form[0]?.form` is truthy (first entry owns its outer chrome — `section`, `controlled_list`, `label`, or `file_upload`), the outer `layout.card` is dropped and content renders directly inside `layout.page`. Otherwise, content is wrapped in `layout.card`.
- Floating-actions bar carries two buttons: `submit_edit` (always; gated on `_state.action_allowed`) and `not_required` (opt-in via `page_config.buttons.not_required.visible: true`; additionally gated on `_state.action_allowed` AND `global.action_statuses.{status}.priority > 0` to hide once already terminal).
- Both buttons fire `page_config.events.onSubmit` (page-state work) before posting to `update-action-{action_type}`.
- Submit-edit `CallApi` payload includes: `action_id`, `interaction: submit_edit`, `current_key`, `form`, `form_review`, `fields`, `comment`. (No `current_status` — form actions don't send it.)
- Not-required `CallApi` payload: `action_id`, `interaction: not_required`, `current_key`, `fields`, `comment`. (No `form` / `form_review` — not_required is a metadata-only transition.)
- Confirm modals (`submit_edit_modal`, `not_required_modal`) render iff `page_config.buttons.{name}.modal` is set; otherwise the button posts directly. Modal `onOk` does the same Validate + onSubmit + CallApi sequence the direct path does.
- Validate step regex matches both `^form\.` and `^fields\.` paths.
- Comment input ID is `comment` (top-level scalar; the button reads `_state: comment` and posts it as a top-level payload field — the resolver-emitted API maps to `event.metadata.comment`).
- Building the demo app emits `workflows/onboarding-qualify-edit` (and equivalents for other form actions with edit access) and the page renders without runtime errors.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — replace placeholder body with the full edit-page implementation.

## Notes

- **Path to `makeActionsForm.js`.** Templates live at `modules/workflows/templates/`; the resolver lives at `modules/workflows/resolvers/makeActionsForm.js`. The `_ref` path is `../resolvers/makeActionsForm.js`.
- **`endpointId` shape.** Lowdefy's `_module.endpointId` accepts either a string id or an `{ id, module }` object. The endpoint is in the same module so the `module: workflows` is redundant but matches the cross-module-pattern in `dist/.../update-action-{action_type}` references. Either form works.
- **`status_map` and `interactions` are not read from `action_config` here.** Those are engine-side concerns. The template doesn't switch on them.
- **Stale-URL guard's `_input: skip_status_redirect` escape hatch.** Set by task 4's `Edit` navigation button on review (so reviewers can round-trip into edit even when the action is sitting in `in-review`).
- **Outer-card suppression doesn't apply to the comment input or universal-fields band.** Suppression is conditional on `action_config.form[0]?.form` only — when the _first form entry_ owns its outer chrome, the outer `layout.card` is suppressed but the universal-fields band, comment, etc. all still render inside `layout.page` (just without the card wrap). The form body's own chrome (provided by the structural component) is the visual frame in that case.
- **v0 parity gotcha re `box` first.** Per the design's "Outer-card suppression" subsection: "`box` declares `form:` (per part 15's sub-form-var allowlist) but emits a transparent `Box`, so a `box`-first form will incorrectly suppress the outer card. v1 accepts this v0 behavior verbatim." Authors who hit it work around by leading their form with a non-`box` entry.
- **`comment` field uses TiptapInput.** v0 used TiptapInput for the comment (rich text). v1 inherits that. If a host app doesn't have the TiptapInput plugin registered, it'll surface a block-not-found build error — that's a host-app concern (plugin manifest), not a template concern.
- **`status_map.error` link.** Outside this template's scope. Whether the host app surfaces a recovery link from view / review to error is governed by `status_map.error.{app_name}` (concept ui spec).
