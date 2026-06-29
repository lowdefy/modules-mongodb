# Task 4: Document `buttons.extra` in the authoring-grammar reference

## Context

Consumer-facing docs for the workflows module live under `docs/` (the module `README.md` is a stub that points there — do not add content to it). The `buttons.extra` slot is consumer-observable authoring behaviour, so it belongs in the authoring-grammar reference.

`docs/workflows/reference/authoring-grammar.md` § "Page overrides (`pages:`)" (starts ~line 258) currently documents only the `buttons.{signal}.{successMessage,visible}` config knobs on template-shipped signal buttons. It needs the new `extra:` array shape and a note on the button→modal pattern.

Every file in `docs/` must keep its YAML front-matter block intact — do not alter it.

## Task

Extend the § "Page overrides (`pages:`)" section of `docs/workflows/reference/authoring-grammar.md` with:

1. **The `buttons.extra:` array shape.** Document that `pages.{verb}.buttons.extra` is an array of author-composed buttons rendered in the same `floating-actions` bar, after the template-shipped signal buttons. Each entry follows standard Lowdefy `Button` shape:

   ```yaml
   pages:
     edit:
       buttons:
         extra:
           - id: <string> # required; must not collide with a reserved id
             title: <string>
             type: primary | default | link | danger # optional
             icon: <string> # optional
             visible: <bool | operator> # optional
             disabled: <bool | operator> # optional
             events:
               onClick: [<actions>] # required
   ```

2. **Form-action only + reserved ids.** Note the slot is **form-action only** (`check` / `tracker` actions have no verb pages, so the slot is rejected there by the validator) and is available on all four verb pages the section already lists (`edit`, `view`, `review`, `error`) — no per-verb caveat. List the **globally reserved** block ids that an `extra` entry's `id` may not use: `button_submit`, `button_progress`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`, `button_edit`.

3. **Button → modal pattern (one short paragraph).** To collect input or confirm before a side-effect: declare a `Modal` (or `ConfirmModal`) block inside `pages.{verb}.formFooter:`, and open it from the extra button's `onClick` via `CallMethod` — `method: toggleOpen` for a `Modal`, `method: open` for a `ConfirmModal`. The modal's `onOk` reads the modal's inputs via `_state:` and typically calls an app API.

4. **Role/visibility note (optional, brief).** Extras get no implicit role gating; authors gate them with `visible:` / `disabled:` operators, using the server-resolved `_state: action.allowed.{verb}` bool where role gating is wanted (e.g. `disabled: { _ne: [{ _state: action.allowed.edit }, true] }`). App endpoints called from extras must enforce their own server-side checks.

## Acceptance Criteria

- § "Page overrides (`pages:`)" documents the `buttons.extra` array shape, the form-action-only constraint, the global reserved-id list, and the button→modal pattern.
- Front-matter is unchanged and valid.
- `pnpm docs:check` passes (front-matter lint + no generator drift). Note: `vars.md` is generated from the manifest and is unaffected by this prose change; do not hand-edit generated files.

## Files

- `docs/workflows/reference/authoring-grammar.md` — modify — extend § "Page overrides (`pages:`)".

## Notes

- Do not touch the module `README.md` (it's a stub).
- This documents observable behaviour only; rationale updates to the concept designs are Task 5.
