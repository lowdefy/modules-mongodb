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

### 1. The check surface's mandatory `request_changes` comment is the _modal_ input at `:626` — which already has `required` + a validate; D5/task 07 target the wrong block

> **Resolved.** Confirmed in the working tree: two `current_action.comment` `TiptapInput`s (optional `:268`, mandatory modal `:626`), shared id, modal `Validate` at `:599` fires both. Rather than retarget to `:626` and keep relying on the shared id staying benign, fixed the root cause: **split the modal comment onto its own path `current_action.change_request_comment`** (id, `Validate` regex, submit payload, `onClose` reset, onMount seed) and tightened _its_ `_ne null` validate to the text-or-fileList fold gate; the optional `:268` input and the five signal-button payloads stay on `current_action.comment`, validate-free. This mirrors the form template's two-path model and removes the coupling. Updated D5, Files-changed, In-scope, Background (capture/send), task 07 (Context + step 2 + Files + Notes), and tasks.md.

D5, Files-changed (`:106`), and task 07 step 2 all assert that on the check surface the
mandatory `request_changes` comment is `current_action.comment` at
`check-action-surface.yaml:268`, which "needs a `validate` rule **added** (it has none
today — the modal's `Validate` step currently enforces nothing)." That is wrong on every
clause. There are **two** `current_action.comment` `TiptapInput`s in the file:

- **`:268`** — the surface-level _optional_ comment, visible in `edit`/`review`/`view@error`
  modes (`:270-284`), placeholder "Add a comment (optional)", **no** `required`/`validate`.
  This is the optional comment that rides `approve`/`progress`/`resolve_error` submits.
- **`:626`** — inside `request_changes_modal` (`:582`, review mode only), already
  `required: true` with `validate.pass: _ne: [current_action.comment, null]` (`:628-635`) —
  structurally identical to the form template's `change_request_comment` (`review.yaml.njk:380-389`).

Both blocks carry the **same id** `current_action.comment`, so the modal's
`Validate { regex: ^current_action\.comment$ }` (`:599`) matches both — it is _already_
enforcing the `:626` rule. So "the field declares none" / "the modal's Validate enforces
nothing" is false; the mandatory comment is the modal input at `:626`, and it already has
the `_ne null` validate that this part means to **tighten**, not add.

Consequences of following task 07 literally:

- It adds a required-style validate to `:268`, the **optional** comment shown in
  `edit`/`error`/`approve` contexts. The task tries to defend this by saying the rule only
  fires via the request-changes `Validate` — but because the two blocks share an id, the
  modal's `Validate` would then fire the new rule on `:268` too, and the _actual_ mandatory
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

> **Resolved (via a deeper reshape of D4).** Confirmed all four templates post a `comment` on submit. Rather than only correct the parenthetical, the underlying decision was reconsidered: the false claim existed to justify a _static author `description`_ surviving — but that static-description channel was unexercised inherited surface (Part 48 examples only ever set `title`), and it was the sole reason D4 needed a comment-vs-static precedence rule. **D4 is now "the comment owns the description; description is comment-only."** Authors override `title` per app only; an authored `display.{app}.description` is rejected at build (`makeWorkflowsConfig`, new task 8) and a pre-hook description is stripped at merge (task 2). The false parenthetical is gone and D4 now states plainly that form submits carry comments (optional on most signals, mandatory on `request_changes`). Added the optional-comment integration case (submit `approve`/`submit` with a comment → description renders it). Updated: D4, D7, Proposed-change item 4, Files-changed (`mergeEventOverrides` strip + new `makeWorkflowsConfig` reject), In-scope, Verification, Part 32 relation; tasks 02/03 rewritten and task 08 added.

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
precisely _because_ submits carry it. The "static description survives" claim holds only for
a comment-_less_ submit (approve without typing the optional comment), not "all form
submits."

**Fix:** correct D4's parenthetical — form submits carry an optional `comment` (and a
mandatory one on `request_changes`); the fold covers them via `planSubmit`; the static
author description survives only when no comment is typed. Add one integration case to
Verification: submit `approve`/`submit` _with_ the optional comment → the submit event's
description renders it (today Verification only exercises `request_changes` and the Part 24
fields path).

## Minor

### 3. The two surfaces model the optional-vs-mandatory comment differently — worth one line so the validate fix isn't mis-ported

> **Rejected — asymmetry removed by the id split in #1.** The split (resolution to #1) puts the check surface on the same two-path model as the form template (optional `comment`/`current_action.comment` + mandatory `change_request_comment`/`current_action.change_request_comment`), so there is no longer an asymmetry to warn about. Task 07's Notes record the now-symmetric model instead.

The form review template uses **two distinct state paths** — optional `comment` (`:171`)
and mandatory `change_request_comment` (`:380`) — so tightening one leaves the other
alone. The check surface uses **one path** `current_action.comment` for both the optional
surface input (`:268`) and the mandatory modal input (`:626`). An implementer porting the
`change_request_comment` fix across "by analogy" could reasonably land it on the wrong
block (finding 1). A sentence in task 07 noting this asymmetry — _form template: two paths;
check surface: one path, tighten the modal block only_ — would prevent it.
