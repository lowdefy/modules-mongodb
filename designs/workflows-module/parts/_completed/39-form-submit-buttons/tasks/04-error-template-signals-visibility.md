# Task 4: Rewrite `error.yaml.njk` — signal, FSM visibility, drop dead `fields`/`form_review`

## Context

`modules/workflows/templates/error.yaml.njk` is the error-handler's recovery surface. It has a single button, `button_resolve_error`, with an optional confirm modal — so it carries **two** `CallAPI` payload copies (inline `onClick` else-branch + `resolve_error_modal` `onOk`). The button fires the author's `onSubmit` verb (error reuses `onSubmit`, not a dedicated verb — this is unchanged).

Both payload copies currently carry `interaction: resolve_error` plus three **dead** keys:

- `form_review: { _state: form_review }` — the error page's `prime_form_state` (lines ~87–102) only primes `form`/`fields`/`comment`, never `form_review`, so this is always null.
- `fields: { _state: fields }` — error renders the universal fields in **display (read-only)** mode (Part 24), so this is primed-then-resent dead state.

Part 38 moved the engine to signals. Task 1 shipped `enums/button_signal_sources.yaml`.

## Task

Edit `modules/workflows/templates/error.yaml.njk`:

### 1. Migrate the payload to `signal:` and drop the dead keys

In **both** `resolve_error` `CallAPI` payloads (inline else-branch + modal `onOk`):

- Change `interaction: resolve_error` → `signal: resolve_error`.
- **Remove the `form_review: { _state: form_review }` line** (never primed).
- **Remove the `fields: { _state: fields }` line** (display-only, dead state).
- Keep `action_id`, `signal`, `current_key`, `form`, `comment`.

### 2. Narrow the `Validate` regex

In both `resolve_error` `Validate` steps (inline + modal), change the regex from `[^form\., ^fields\.]` → `[^form\.]`.

### 3. Rewrite `button_resolve_error` visibility to the FSM source-stage form

```yaml
visible:
  _and:
    - _var: { key: page_config.buttons.resolve_error.visible, default: true }
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: resolve_error }
        - _state: action.status.0.stage
    - _eq: [{ _state: action_allowed.error }, true]
```

(Key `resolve_error`, default `true`.)

## Acceptance Criteria

- No `interaction:` key remains in `error.yaml.njk`; `resolve_error` sends `signal:`.
- No `form_review:` and no `fields:` key remain in either `CallAPI` payload.
- The `resolve_error` `Validate` regex (both copies) is `[^form\.]`.
- `button_resolve_error` uses the three-way `_and` reading `enums/button_signal_sources.yaml` via `_ref`, testing `_state: action.status.0.stage`, and role-gating on `action_allowed.error` (the per-verb key — never the bare `action_allowed` object).
- The overridable button title (`page_config.buttons.resolve_error.title`, default "Resolve") is preserved.
- The module builds with no template errors.

## Files

- `modules/workflows/templates/error.yaml.njk` — modify — migrate `resolve_error` payload to `signal:` (both copies); drop dead `form_review` + `fields`; narrow `Validate` to `^form\.`; rewrite visibility to FSM source-stage form.

## Notes

- **The role gate is per-verb.** `_state.action_allowed` is a map of per-verb booleans (`{ view, edit, review, error }`) — never compare the whole object to `true`. This template tests **`action_allowed.error`**, preserving what the shipped button already tests (`error.yaml.njk:237`).
- `resolve_error` carries its payload + `Validate` **twice** (inline `onClick` else-branch + the optional `resolve_error_modal` `onOk`). Apply changes to both.
- The author event verb stays `onSubmit` (error has no dedicated verb — D5 adds `onProgress` for the edit page's Save Draft button only).
