# Task 3: Rewrite `review.yaml.njk` — signals, FSM visibility, drop dead `fields`

## Context

`modules/workflows/templates/review.yaml.njk` is the reviewer's surface. It has three buttons: `button_edit` (navigation — a `Link` to the edit page, not a signal), `button_request_changes` (opens a mandatory comment modal), and `button_approve`. The `approve` and `request_changes` payloads carry `interaction:`, and the `approve` button has an optional confirm modal (so `approve` has **two** payload copies — inline `onClick` else-branch + modal `onOk`).

Part 38 moved the engine to signals (`signal:` on the wire, FSM resolves the target). Part 24 decoupled universal-field writes, and `review` renders the universal fields in **display (read-only) mode**, so `_state.fields` is primed-then-resent dead state that should be dropped. Task 1 shipped `enums/button_signal_sources.yaml` for FSM-derived visibility.

## Task

Edit `modules/workflows/templates/review.yaml.njk`:

### 1. Migrate payloads to `signal:` and drop dead `fields`

In **all three** `CallAPI` payloads — `approve` (inline else-branch + modal `onOk`) and `request_changes` (the `request_changes_modal` `onOk`):

- Change `interaction: approve` → `signal: approve` and `interaction: request_changes` → `signal: request_changes`.
- **Remove the `fields: { _state: fields }` line** from each. Keep `action_id`, `signal`, `current_key`, `form`, `form_review`, `comment`.

### 2. Narrow the `approve` `Validate` regex

In both `approve` `Validate` steps (inline + modal), change the regex from `[^form_review\., ^fields\.]` → `[^form_review\.]`.

(The `request_changes_modal` uses `Validate` with `params: comment` — a comment-presence check, not a regex. Leave it unchanged.)

### 3. Rewrite `approve` and `request_changes` visibility to the FSM source-stage form

Replace each button's `visible` `_and` with the three-way form: author opt-out, FSM source-stage membership, role gate. Pattern for `approve`:

```yaml
visible:
  _and:
    - _var: { key: page_config.buttons.approve.visible, default: true }
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: approve }
        - _state: action.status.0.stage
    - _eq: [{ _state: action_allowed.review }, true]
```

- `button_approve` — key `approve`, default `true`.
- `button_request_changes` — key `request_changes`, default `true`.

**Leave `button_edit` unchanged** — it is navigation (a `Link`), not a gated signal button. Its visibility stays `page_config.buttons.edit.visible` defaulting to "`page_ids.edit` is set."

## Acceptance Criteria

- No `interaction:` key remains in `review.yaml.njk`; `approve`/`request_changes` send `signal:`.
- No `fields:` key remains in any `CallAPI` payload (all three).
- The `approve` `Validate` regex (both copies) is `[^form_review\.]`.
- `button_approve` and `button_request_changes` use the three-way `_and` reading `enums/button_signal_sources.yaml` via `_ref`, testing `_state: action.status.0.stage`, and role-gating on `action_allowed.review` (the per-verb key — never the bare `action_allowed` object).
- `button_edit` is untouched.
- The module builds with no template errors.

## Files

- `modules/workflows/templates/review.yaml.njk` — modify — migrate `approve`/`request_changes` payloads to `signal:` (all copies); drop `fields`; narrow `approve` `Validate` to `^form_review\.`; rewrite `approve`/`request_changes` visibility to FSM source-stage form.

## Notes

- **The role gate is per-verb.** `_state.action_allowed` is a map of per-verb booleans (`{ view, edit, review, error }`) — never compare the whole object to `true`. This template tests **`action_allowed.review`**, preserving what the shipped buttons already test (`review.yaml.njk:233/259`).
- `approve` carries its payload + `Validate` **twice** (inline `onClick` else-branch + the optional `approve_modal` `onOk`). Apply changes to both.
- `request_changes` keeps `form` and `form_review` in its payload — only `fields` is dropped.
- The `request_changes` source list (`[in-review, done]`) means it stays visible on `in-review` here; the `done` source matters on the `view` template (task 5), not review.
