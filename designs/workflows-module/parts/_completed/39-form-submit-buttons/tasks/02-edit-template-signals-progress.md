# Task 2: Rewrite `edit.yaml.njk` — signals, `progress` button, FSM visibility, drop `fields`

## Context

`modules/workflows/templates/edit.yaml.njk` is the submitter's working surface. Today its floating-actions bar has two buttons:

- `button_submit_edit` — payload carries `interaction: submit_edit`; visibility is `page_config.buttons.submit_edit.visible` (default `true`) AND `action_allowed.edit`.
- `button_not_required` — payload carries `interaction: not_required`; visibility AND's a hand-rolled `_js` priority lookup (`statuses[stage].priority > 0`, lines ~272–282), a direct expression of the now-dead priority rule.

There is **no Save Draft button**. Each button's `onClick` either runs `Validate` → author `onSubmit` → `CallAPI`, or opens a confirm modal (when `page_config.buttons.{name}.modal` is set) whose `onOk` carries a **second, independent copy** of the same `Validate` + `CallAPI`.

Part 38 moved the engine to signals: the wire field is `signal:`, the engine's FSM resolves the target stage, and `force`/the priority rule are gone. Part 24 decoupled universal-field writes (`assignees`/`due_date`/`description`) into a separate `update-action-fields-{action_type}` op, so the form submit must stop sending `fields`. Task 1 shipped `enums/button_signal_sources.yaml` for FSM-derived visibility.

This task rewrites the `edit` bar to fire signals, adds the `progress` button, and derives every button's visibility from the FSM source-stages.

## Task

Edit `modules/workflows/templates/edit.yaml.njk`:

### 1. Rename the submit button and migrate its payload

- Rename `button_submit_edit` → `button_submit`.
- Rename its config namespace `page_config.buttons.submit_edit.*` → `page_config.buttons.submit.*` (visible / disabled / modal).
- Rename the confirm modal and its wiring consistently: modal block id `submit_edit_modal` → `submit_modal`; the `open_submit_edit_modal` CallMethod action id → `open_submit_modal` (blockId `submit_modal`); the inner `CallAPI` action id `submit_edit` → `submit`.
- In **both** payload copies (inline `onClick` else-branch + modal `onOk`):
  - Change `interaction: submit_edit` → `signal: submit`.
  - **Remove the `fields: { _state: fields }` line** — universal fields are owned by Part 24's sidebar op. Keep `action_id`, `signal`, `current_key`, `form`, `comment`.
  - Narrow the `Validate` regex from `[^form\., ^fields\.]` → `[^form\.]`.

The post-rewrite inline else-branch payload:

```yaml
payload:
  action_id: { _state: action._id }
  signal: submit
  current_key: { _state: action.key }
  form: { _state: form }
  comment: { _state: comment }
```

### 2. Add the `progress` (Save Draft) button

Add a new `button_progress` button to the floating-actions `actions` array. It mirrors `submit`'s shape but: title "Save Draft", `type: default`, **no `Validate` step**, fires the new `onProgress` author verb (not `onSubmit`), no `fields`, and has **no modal variant** (single payload copy):

```yaml
- id: button_progress
  type: Button
  visible:
    _and:
      - _var: { key: page_config.buttons.progress.visible, default: true }
      - _array.includes:
          - _ref: { path: enums/button_signal_sources.yaml, key: progress }
          - _state: action.status.0.stage
      - _eq: [{ _state: action_allowed.edit }, true]
  properties:
    title: Save Draft
    type: default
    disabled:
      _var: { key: page_config.buttons.progress.disabled, default: false }
  events:
    onClick:
      _build.array.concat:
        - _var: { key: page_config.events.onProgress, default: [] }
        - - id: progress
            type: CallAPI
            params:
              endpointId:
                _module.endpointId:
                  _build.string.concat:
                    [update-action-, { _var: action_config.type }]
              payload:
                action_id: { _state: action._id }
                signal: progress
                current_key: { _state: action.key }
                form: { _state: form }
```

### 3. Migrate `not_required`'s payload and visibility

- In **both** payload copies (inline `onClick` else-branch + modal `onOk`): change `interaction: not_required` → `signal: not_required`, and **remove the `fields: { _state: fields }` line** (keep `action_id`, `signal`, `current_key`, `comment` — `not_required` sends no `form`).
- Delete the entire `_gt`/`_js` priority-lookup clause from its `visible` block.

### 4. Rewrite every button's `visible` to the FSM source-stage form

Each button's `visible` becomes a three-way `_and`: author opt-out (`_var` on the per-button `visible` key), FSM source-stage membership, and the role gate. Pattern (shown for `submit`):

```yaml
visible:
  _and:
    - _var: { key: page_config.buttons.submit.visible, default: true }
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: submit }
        - _state: action.status.0.stage
    - _eq: [{ _state: action_allowed.edit }, true]
```

Apply to `button_submit` (key `submit`, default `true`), `button_progress` (key `progress`, default `true` — already shown above), and `button_not_required` (key `not_required`, **default `false`** — keep its opt-in default; do **not** flip it to `true`).

## Acceptance Criteria

- `button_submit_edit` is renamed to `button_submit` everywhere (button id, `page_config.buttons.submit.*`, modal block id `submit_modal`, CallMethod/CallAPI action ids).
- No `interaction:` key remains anywhere in `edit.yaml.njk`; `submit`/`progress`/`not_required` all send `signal:`.
- No `fields:` key remains in any `CallAPI` payload in the file.
- The `submit` `Validate` regex (both copies) is `[^form\.]` (no `^fields\.`).
- `button_progress` exists with title "Save Draft", no `Validate`, fires `onProgress`, sends `signal: progress` + `form` (no `fields`), and has no modal.
- All three buttons' `visible` is the three-way `_and` reading `enums/button_signal_sources.yaml` via `_ref`, testing `_state: action.status.0.stage` via `_array.includes`, and role-gating on `action_allowed.edit` (the per-verb key — never the bare `action_allowed` object).
- The `_js` priority-lookup clause is gone; `../shared/enums/action_statuses.yaml` is no longer referenced from a button `visible`.
- `not_required`'s author opt-out default stays `false`.
- The module builds (`pnpm ldf:b` or the repo's build command) with no template errors.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — rename submit button + namespace; migrate `submit`/`not_required` payloads to `signal:` (both copies each); drop `fields` and narrow submit `Validate` to `^form\.`; add `button_progress`; rewrite all `visible` blocks to FSM source-stage form; delete the `_js` priority lookup.

## Notes

- **The role gate is per-verb.** `_state.action_allowed` is a map of per-verb booleans (`{ view, edit, review, error }`, written by `action_role_check.yaml`) — never compare the whole object to `true` (an object never equals `true`; the button would be permanently hidden). This template tests **`action_allowed.edit`**, preserving what the shipped buttons already test (`edit.yaml.njk:207/270`).
- **Two copies per modal button.** `submit` and `not_required` each carry their payload + (for submit) `Validate` twice — once in the `onClick` `_build.if` else-branch, once in the confirm-modal's `onOk`. Apply every payload/validate change to **both** copies. `progress` has no modal — single copy.
- `submit` is **nullary** — it sends no `target_status`. The engine derives `in-review` vs `done` from whether the action declares the `review` verb. Do not add any target-status logic to the page.
- The `progress` log event (`progress_saved`) and `form_data` persistence are engine-side (Part 38); the template only fires the signal.
- The submit button's source list includes `done` (re-submit of a completed action) — that's intentional and is exercised by e2e case (c) in task 7.
