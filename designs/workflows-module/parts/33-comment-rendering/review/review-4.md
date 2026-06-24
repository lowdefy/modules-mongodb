# Review 4 — Check-surface validate targets the wrong input; "form submits carry no comment" is false

Verified the tasked design and tasks 01–07 against the current branch (post Parts
38/40/46/48/53). The engine spine still checks out: `planEventDispatch.js` matches the
cited shape — curated per-signal title map (`:29-57`), closed handler enum throwing on
unknown (`:211-214`), `isFieldsUpdate` branch (`:178-183`), `comment` already on the
signature un-folded (`:138`, `:105-108`), no `metadata.comment` written, merge→render at
`:266-279`; `mergeEventOverrides.js:28-31` still shallow-merges `display` and its docblock
is still stale (`:1-15`); `deepMerge.js` has the right semantics; `renderEventDisplay.js`
compiles every display string so the post-render fold ordering (D4) is right; the
`events-timeline` component reads `reference_field`/`reference_value`/`display_key` vars
(`events-timeline.yaml:19-57`) and the templates seed `_state.action` from
`get_workflow_action` (`view.yaml.njk:56-60`). Task 02 correctly replaces the
one-level-deep display test (`mergeEventOverrides.test.js:86-96`) that review-3 didn't
mention, and `_if_none` / `_array.length` (task 07) are real operators used across the
repo. The findings below are the gaps.

## Correctness

### 1. The check surface's mandatory `request_changes` comment is the *modal* input at `:626` — which already has `required` + a validate; D5/task 07 target the wrong block

D5, Files-changed (`:106`), and task 07 step 2 all assert that on the check surface the
mandatory `request_changes` comment is `current_action.comment` at
`check-action-surface.yaml:268`, which "needs a `validate` rule **added** (it has none
today — the modal's `Validate` step currently enforces nothing)." That is wrong on every
clause. There are **two** `current_action.comment` `TiptapInput`s in the file:

- **`:268`** — the surface-level *optional* comment, visible in `edit`/`review`/`view@error`
  modes (`:270-284`), placeholder "Add a comment (optional)", **no** `required`/`validate`.
  This is the optional comment that rides `approve`/`progress`/`resolve_error` submits.
- **`:626`** — inside `request_changes_modal` (`:582`, review mode only), already
  `required: true` with `validate.pass: _ne: [current_action.comment, null]` (`:628-635`) —
  structurally identical to the form template's `change_request_comment` (`review.yaml.njk:380-389`).

Both blocks carry the **same id** `current_action.comment`, so the modal's
`Validate { regex: ^current_action\.comment$ }` (`:599`) matches both — it is *already*
enforcing the `:626` rule. So "the field declares none" / "the modal's Validate enforces
nothing" is false; the mandatory comment is the modal input at `:626`, and it already has
the `_ne null` validate that this part means to **tighten**, not add.

Consequences of following task 07 literally:

- It adds a required-style validate to `:268`, the **optional** comment shown in
  `edit`/`error`/`approve` contexts. The task tries to defend this by saying the rule only
  fires via the request-changes `Validate` — but because the two blocks share an id, the
  modal's `Validate` would then fire the new rule on `:268` too, and the *actual* mandatory
  input at `:626` keeps its loose `_ne null` gate. Net: the type-then-deleted mandatory
  comment the part exists to block still passes.
- It misses tightening `:626`, the block that genuinely guards `request_changes`.

**Fix:** in task 07 step 2 and D5/Files-changed, retarget the check surface to
`check-action-surface.yaml:626` — tighten its existing `validate.pass` from
`_ne: [current_action.comment, null]` to the text-or-fileList fold gate (exactly the
`change_request_comment` change in step 1), and leave the optional `:268` input
validate-free. Note the shared-id coupling: the two `current_action.comment` blocks bind
one state path, so the modal's `Validate` matches both — keeping `:268` rule-free is what
keeps the optional surfaces unguarded.

## Accuracy

### 2. D4's "form-submit events carry no comment" is false — all four form templates post a comment on submit

D4 argues the static author `description` "survives and renders" on the normal case of
"**form-submit events, which carry no comment** (the comment rides Part 24's sidebar
fields operation, not form submit)." The templates contradict this directly — every
form-kind submit posts a `comment`:

- `edit.yaml.njk` — `not_required` (`:283-284`), `submit` (`:376-377`, `:449-450`),
  `not_required` (`:515-516`) all post `comment: { _state: comment }` (the optional inline
  input at `:145`/`:170`);
- `error.yaml.njk` — `resolve_error` (`:306-307`, `:357-358`);
- `review.yaml.njk` — `approve` (`:338-339`, `:441-442`) posts the optional `comment`;
  `request_changes` posts `change_request_comment` (`:372-373`);
- `view.yaml.njk` — `request_changes` posts `change_request_comment` (`:265-266`).

These are all `SubmitWorkflowAction` (signal=`approve`/`submit`/`not_required`/
`resolve_error`/`request_changes`) → `planSubmit` → `planEventDispatch`. So form submits
routinely carry comments, and task 04's `comment: params.comment` threading folds them into
the submit event's `display.{app}.description`. The behaviour is correct and intended — but
D4's justification contradicts task 04, which threads `comment` through the **submit** path
precisely *because* submits carry it. The "static description survives" claim holds only for
a comment-*less* submit (approve without typing the optional comment), not "all form
submits."

**Fix:** correct D4's parenthetical — form submits carry an optional `comment` (and a
mandatory one on `request_changes`); the fold covers them via `planSubmit`; the static
author description survives only when no comment is typed. Add one integration case to
Verification: submit `approve`/`submit` *with* the optional comment → the submit event's
description renders it (today Verification only exercises `request_changes` and the Part 24
fields path).

## Minor

### 3. The two surfaces model the optional-vs-mandatory comment differently — worth one line so the validate fix isn't mis-ported

The form review template uses **two distinct state paths** — optional `comment` (`:171`)
and mandatory `change_request_comment` (`:380`) — so tightening one leaves the other
alone. The check surface uses **one path** `current_action.comment` for both the optional
surface input (`:268`) and the mandatory modal input (`:626`). An implementer porting the
`change_request_comment` fix across "by analogy" could reasonably land it on the wrong
block (finding 1). A sentence in task 07 noting this asymmetry — *form template: two paths;
check surface: one path, tighten the modal block only* — would prevent it.
