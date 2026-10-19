# Task 4: Make the request-changes comment text-only

## Context

The changes-requested callout (this Part) renders the reviewer's comment as the `description` of an `Alert`. Decision D3 / proposal point 5 require the comment to be **text-only** so the callout never has to render an attachment: the empty-document case (TipTap's `<p></p>` marker, with content living in `fileList`) cannot arise from the normal flow. This is the input-side guarantee behind that — it disables inline image uploads on every Request Changes comment input.

Each `request_changes` comment is a `TiptapInput`. To make it text-only, set `properties.image.disabled: true` and leave `s3PostPolicyRequestId` unset (the meta's "leave unset to disable image uploads"). With files disabled, the `validate` rule's `fileList` clause is now dead and should be simplified away, leaving `comment.text` non-empty as the sole gate.

The four affected inputs (the `request_changes` comment exists only on the review-capable surfaces — not on `edit`/`error`):

| File                                                     | Input block id                                  | State path                              |
| -------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `modules/workflows/templates/review.yaml.njk`            | `change_request_comment` (~L476)                | `change_request_comment`                |
| `modules/workflows/templates/view.yaml.njk`              | `change_request_comment` (~L368)                | `change_request_comment`                |
| `modules/workflows/templates/action.yaml.njk`            | `current_action.change_request_comment` (~L376) | `current_action.change_request_comment` |
| `modules/workflows/components/check-action-surface.yaml` | `current_action.change_request_comment` (~L630) | `current_action.change_request_comment` |

The current `validate` on each looks like (paths differ per surface):

```yaml
validate:
  - message: A comment is required to request changes
    status: error
    pass:
      _or:
        - _ne:
            - _if_none:
                - _state: <path>.text
                - null
            - null
        - _gt:
            - _array.length:
                _if_none:
                  - _state: <path>.fileList
                  - []
            - 0
```

## Task

On each of the four `change_request_comment` `TiptapInput` blocks:

### 1. Disable inline files

Under `properties`, add:

```yaml
properties:
  image:
    disabled: true
  title: Change Description
  placeholder: Please provide a description of the changes you would like.
```

Do **not** add `s3PostPolicyRequestId` — leaving it unset is what disables S3 upload.

### 2. Simplify `validate` — drop the dead `fileList` clause

Replace the `_or`-wrapped `pass` with the single text-non-empty check (substitute the surface's actual state path for `<path>`):

```yaml
validate:
  - message: A comment is required to request changes
    status: error
    pass:
      _ne:
        - _if_none:
            - _state: <path>.text
            - null
        - null
```

State paths per surface: `change_request_comment` (review, view); `current_action.change_request_comment` (action.yaml.njk, check-action-surface.yaml).

## Acceptance Criteria

- All four `change_request_comment` inputs set `properties.image.disabled: true` and have no `s3PostPolicyRequestId`.
- Each input's `validate` pass is the single `comment.text` non-empty check (the `_or` and the `fileList` `_gt` clause removed).
- `pnpm ldf:b` from `apps/demo` compiles cleanly.

## Files

- `modules/workflows/templates/review.yaml.njk` — modify — disable image + simplify validate on `change_request_comment`.
- `modules/workflows/templates/view.yaml.njk` — modify — same.
- `modules/workflows/templates/action.yaml.njk` — modify — same on `current_action.change_request_comment`.
- `modules/workflows/components/check-action-surface.yaml` — modify — same on `current_action.change_request_comment`.

## Notes

- This task is independent of the render chain (Tasks 1–3); it can be done in parallel.
- `edit.yaml.njk` and `error.yaml.njk` have no Request Changes comment input, so they are not touched here.
- The envelope read (Task 1) still defensively normalizes empty/whitespace html to `null`, covering any legacy image-only rows that predate this block.
