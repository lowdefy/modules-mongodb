# Task 7: Tighten the mandatory `request_changes` comment validate

## Context

> **Re-baselined against shipped Parts 40/46.** There is no longer a single `id: comment` input shared across the review surfaces. Post-Part-40 the mandatory `request_changes` comment lives in **two** places, and they guard emptiness differently — neither correctly:

- **Form review template** — `modules/workflows/templates/review.yaml.njk:380`: the `change_request_comment` `TiptapInput` (distinct from the page's *optional* inline `comment`) has `required: true` plus a `validate` whose `pass` is `_ne: [change_request_comment, null]`.
- **Check surface** — `modules/workflows/components/check-action-surface.yaml:268`: the `current_action.comment` `TiptapInput` is labelled "Add a comment (optional)" and declares **no** `validate`/`required`. The Request Changes modal's `onOk` runs `Validate { regex: ^current_action\.comment$ }` (`:596`), which only triggers the matched field's own rules — and since the field has none, the mandatory comment is presently **un-guarded at the input** on this surface.

The shared problem: an "empty" TipTap value is not `null`. TipTap emits `'<p></p>'` for an empty document and nulls only `text` (`useTiptapState.js:44-52` in `@lowdefy/blocks-tiptap`), so a user who types then deletes everything leaves `{ html: '<p></p>', text: null, markdown: '', fileList: [] }` — a non-null object that passes `_ne: [_, null]`. The submit then goes through and the engine's fold gate (task 1) correctly drops the empty comment, so the mandatory comment silently never appears (design D5).

This task makes both inputs mirror the engine's fold gate: a comment is non-empty when `comment.text` is a non-empty string **or** `comment.fileList` is a non-empty array (image-only comment). TipTap itself trims, so `text` is either `null` or a non-whitespace string — the text leg only needs a null check.

## Task

### 1. Form review template — tighten `change_request_comment`

In `modules/workflows/templates/review.yaml.njk` (`:380`), replace the `pass` of the `change_request_comment` validate.

Old:

```yaml
pass:
  _ne:
    - _state: change_request_comment
    - null
```

New — pass when text is present or fileList is non-empty:

```yaml
pass:
  _or:
    - _ne:
        - _if_none:
            - _state: change_request_comment.text
            - null
        - null
    - _gt:
        - _array.length:
            _if_none:
              - _state: change_request_comment.fileList
              - []
        - 0
```

### 2. Check surface — add a `validate` to `current_action.comment`

In `modules/workflows/components/check-action-surface.yaml` (`:268`), add a `validate` rule to the `current_action.comment` `TiptapInput` so the modal's existing `Validate { regex: ^current_action\.comment$ }` step has something to enforce. The rule mirrors the fold gate, on `current_action.comment.{text,fileList}`:

```yaml
validate:
  - message: A comment is required to request changes
    status: error
    pass:
      _or:
        - _ne:
            - _if_none:
                - _state: current_action.comment.text
                - null
            - null
        - _gt:
            - _array.length:
                _if_none:
                  - _state: current_action.comment.fileList
                  - []
            - 0
```

This input is shared across edit/review/`error`-stage modes (it's optional there), so the `validate` rule must only **fail** the submit when it actually runs — and it only runs via the request-changes modal's `Validate` step, which fires for `request_changes` only. (The signal buttons that submit without a comment, e.g. `progress`/`approve`/`resolve_error`, do not `Validate` this field.) Confirm at build that the rule doesn't block those other signals; if a stray validation fires, gate the rule (e.g. on `current_action.mode`/`stage`) so it's inert outside request-changes. The `_if_none` wrappers normalise the never-touched case (`current_action.comment` seeded `null` in onMount).

The exact operator composition may be simplified if equivalent — the acceptance cases below are the contract. Keep YAML block sequences for the comparison operators (project rule).

## Acceptance Criteria

For **both** surfaces, the request-changes comment validation behaves:

- Never-touched / seeded-`null` comment → validate **fails** with the message.
- Type-then-deleted comment (`{ html: '<p></p>', text: null, markdown: '', fileList: [] }`) → validate **fails**.
- Text comment (`{ html: '<p>hi</p>', text: 'hi', fileList: [] }`) → validate **passes**.
- Image-only comment (`{ html: '<p><img …></p>', text: null, fileList: [file] }`) → validate **passes**.
- On the check surface, submitting a non-`request_changes` signal with an empty comment is **not** blocked by this rule.
- `pnpm ldf:b` (demo app build) succeeds — no operator parse errors.

## Files

- `modules/workflows/templates/review.yaml.njk` — modify — tighten `change_request_comment`'s `validate.pass`.
- `modules/workflows/components/check-action-surface.yaml` — modify — add the fold-gate `validate` to `current_action.comment`.

## Notes

- The engine-side fold gate (task 1) is the guard that must hold — it covers every caller, including the optional-comment paths where no validate runs. This task is the input-feedback half: without it a mandatory comment can vanish with no feedback.
- The static `pages/workflow-action-review.yaml` is a Part 40 thin container with no comment input of its own — nothing to change there (it renders the check surface).
- Independent of tasks 1–6; can land in any order.
