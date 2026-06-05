# Task 7: Tighten the `request_changes` comment validate on both review surfaces

## Context

`request_changes` mandates a comment, but the validate on both review surfaces is `_ne: [comment, null]` — and an "empty" TipTap value is not null. TipTap emits `'<p></p>'` for an empty document and nulls only `text` (`useTiptapState.js:44-52` in `@lowdefy/blocks-tiptap`), so a user who types and then deletes everything leaves `_state.comment = { html: '<p></p>', text: null, markdown: '', fileList: [] }` — a non-null object that passes "required". The submit then goes through and the engine's fold gate (task 1) correctly drops the empty comment, so the mandatory comment silently never appears (design D5).

This task makes the input-side validate mirror the engine's fold gate: a comment is non-empty when `comment.text` is a non-empty string **or** `comment.fileList` is a non-empty array (image-only comment). Note TipTap itself trims: `text` is either `null` or a non-whitespace string, so the text leg only needs a null check.

## Task

In both files, replace the `pass` condition of the "A comment is required to request changes" validate on the `id: comment` TiptapInput:

- `modules/workflows/pages/workflow-action-review.yaml` (`:256-262`)
- `modules/workflows/templates/review.yaml.njk` (`:364-369`)

Old:

```yaml
pass:
  _ne:
    - _state: comment
    - null
```

New — pass when text is present or fileList is non-empty:

```yaml
pass:
  _or:
    - _ne:
        - _if_none:
            - _state: comment.text
            - null
        - null
    - _gt:
        - _array.length:
            _if_none:
              - _state: comment.fileList
              - []
        - 0
```

The `_if_none` wrappers normalise the never-touched case (`_state.comment` undefined → dot-path reads undefined) so both legs fail cleanly. The exact operator composition may be simplified if equivalent — the acceptance cases below are the contract. Keep YAML block sequences for the comparison operators (project rule).

## Acceptance Criteria

- Never-touched comment (`_state.comment` undefined/null) → validate **fails** with the existing message.
- Type-then-deleted comment (`{ html: '<p></p>', text: null, markdown: '', fileList: [] }`) → validate **fails**.
- Text comment (`{ html: '<p>hi</p>', text: 'hi', fileList: [] }`) → validate **passes**.
- Image-only comment (`{ html: '<p><img …></p>', text: null, fileList: [file] }`) → validate **passes**.
- Both surfaces carry the identical condition; the validate message is unchanged.
- `pnpm ldf:b` (demo app build) succeeds — no operator parse errors.

## Files

- `modules/workflows/pages/workflow-action-review.yaml` — modify — tighten the comment validate `pass`.
- `modules/workflows/templates/review.yaml.njk` — modify — same change on the form review template.

## Notes

- The engine-side fold gate (task 1) is the guard that must hold — it covers every caller, including the optional-comment surfaces (`edit`/`error`/approve) where no validate exists. This task is the input-feedback half: without it a mandatory comment can vanish with no feedback.
- Independent of tasks 1–6; can land in any order.
