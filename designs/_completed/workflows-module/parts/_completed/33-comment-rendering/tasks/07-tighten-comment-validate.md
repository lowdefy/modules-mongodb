# Task 7: Tighten the mandatory `request_changes` comment validate

## Context

> **Re-baselined against shipped Parts 40/46.** There is no longer a single `id: comment` input shared across the review surfaces. Post-Part-40 the mandatory `request_changes` comment lives in **two** places, and both guard emptiness with a loose `_ne null` that a type-then-deleted comment passes:

- **Form review template** — `modules/workflows/templates/review.yaml.njk:380`: the `change_request_comment` `TiptapInput` (a **separate state path** from the page's _optional_ inline `comment` at `:171`) has `required: true` plus a `validate` whose `pass` is `_ne: [change_request_comment, null]`.
- **Check surface** — `modules/workflows/components/check-action-surface.yaml:626`: the mandatory comment is the `TiptapInput` **inside `request_changes_modal`** (review mode only), already `required: true` with `validate.pass: _ne: [current_action.comment, null]`, enforced by the modal's `onOk` `Validate { regex: ^current_action\.comment$ }` (`:599`). **The problem is the shared id:** this modal input binds `current_action.comment`, the _same_ path as the _optional_ surface comment at `:268`. Because `Validate` matches blocks by id, the modal's `Validate` fires the rules of **both** inputs — so you cannot tighten the mandatory comment by adding a rule to one without it affecting the other. This task fixes that by **splitting** the modal input onto its own path `current_action.change_request_comment` (mirroring the form template's two-path model), then tightening _its_ validate.

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

### 2. Check surface — split the modal comment onto its own path, then tighten its validate

The mandatory comment is the `TiptapInput` **inside `request_changes_modal`** in `modules/workflows/components/check-action-surface.yaml` (`:626`), not the optional surface input at `:268`. The two share the id `current_action.comment`, so any validate added to either fires inside the modal. The fix is to give the modal input its own state path and tighten its existing validate — leaving the optional `:268` input untouched.

**Split.** In `request_changes_modal` (the block at `:582`), retarget every reference to `current_action.comment` onto `current_action.change_request_comment`:

- the modal input id (`:626`): `id: current_action.change_request_comment`;
- the modal's `onOk` `Validate` regex (`:599`): `regex: ^current_action\.change_request_comment$`;
- the submit `CallAPI` payload `comment` (`:616`): `_state: current_action.change_request_comment`;
- the `onClose` reset `SetState` (`:624`): `current_action.change_request_comment: null`;
- the onMount seed that currently seeds `current_action.comment: null` (see the file header note at `:18`) — add a `current_action.change_request_comment: null` seed alongside it.

Do **not** touch the optional `:268` input or the five signal-button payloads (`progress`/`not_required`/`submit`/`approve`/`resolve_error` at `:368`/`:412`/`:458`/`:532`/`:574`) — they correctly ride `current_action.comment`.

**Tighten.** Replace the split modal input's `validate.pass` (today `_ne: [current_action.comment, null]`) with the fold gate on `current_action.change_request_comment.{text,fileList}`:

```yaml
validate:
  - message: A comment is required to request changes
    status: error
    pass:
      _or:
        - _ne:
            - _if_none:
                - _state: current_action.change_request_comment.text
                - null
            - null
        - _gt:
            - _array.length:
                _if_none:
                  - _state: current_action.change_request_comment.fileList
                  - []
            - 0
```

The modal input keeps `required: true`. Because it now binds its own path, the modal's `Validate` matches only this block — there's no shared-id coupling and no need to gate the rule by mode/stage. The `_if_none` wrappers normalise the never-touched / seeded-`null` case.

The exact operator composition may be simplified if equivalent — the acceptance cases below are the contract. Keep YAML block sequences for the comparison operators (project rule).

## Acceptance Criteria

For **both** surfaces, the request-changes comment validation behaves:

- Never-touched / seeded-`null` comment → validate **fails** with the message.
- Type-then-deleted comment (`{ html: '<p></p>', text: null, markdown: '', fileList: [] }`) → validate **fails**.
- Text comment (`{ html: '<p>hi</p>', text: 'hi', fileList: [] }`) → validate **passes**.
- Image-only comment (`{ html: '<p><img …></p>', text: null, fileList: [file] }`) → validate **passes**.
- On the check surface, submitting a non-`request_changes` signal with an empty comment is **not** blocked — the optional `:268` input stays on `current_action.comment` and validate-free.
- On the check surface, the request-changes modal binds `current_action.change_request_comment`, a path distinct from the optional surface comment.
- `pnpm ldf:b` (demo app build) succeeds — no operator parse errors.

## Files

- `modules/workflows/templates/review.yaml.njk` — modify — tighten `change_request_comment`'s `validate.pass`.
- `modules/workflows/components/check-action-surface.yaml` — modify — split the request-changes modal comment onto its own `current_action.change_request_comment` path (input id, `Validate` regex, submit payload, `onClose` reset, onMount seed) and tighten its `validate.pass` to the fold gate; leave the optional `:268` input untouched.

## Notes

- The engine-side fold gate (task 1) is the guard that must hold — it covers every caller, including the optional-comment paths where no validate runs. This task is the input-feedback half: without it a mandatory comment can vanish with no feedback.
- After the split both surfaces use the same two-path model — an optional comment (`comment` / `current_action.comment`) and a separate mandatory one (`change_request_comment` / `current_action.change_request_comment`) — so the two validate changes are now true mirrors, with no shared-id footgun on either.
- The static `pages/workflow-action-review.yaml` is a Part 40 thin container with no comment input of its own — nothing to change there (it renders the check surface).
- Independent of tasks 1–6; can land in any order.
