# Task 4: Author `send-quote` action + pre-submit + post-approve hook routines + form_review

## Context

`send-quote` is the form-with-review action in the new `onboarding` worked example — `kind: form`, in group `g2` (blocked by `g1`), exercising the full `form_review` lifecycle. Submitting `submit_edit` transitions the action to `in-review`; reviewers land on `onboarding-send-quote-review` and either `approve` (→ `done`) or `request_changes` (→ `action-required`). A pre-hook fires on `submit_edit`; a post-hook fires on `approve` reading `result`.

Same shape as task 3 for the action authoring; this one is larger because it has two hook routines and a `form_review` block.

## Task

1. **Create `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml`** — a `kind: form` action declaring:
   - `type: send-quote`
   - `kind: form`
   - `action_group: g2`
   - `sort_order: 10`
   - `blocked_by: [qualify]`
   - `description: Build and send the lead a quote; reviewer approves before send.`
   - `access.demo: [edit, view, review]`, `access.roles: [admin]`.
   - `form:` block with a couple of fields — e.g. `number` `quote_total`, `text_area` `notes`.
   - `form_review:` block — e.g. a `text_area` `review_notes` (the reviewer's comments).
   - `interactions.submit_edit.status: in-review`, `interactions.approve.status: done`, `interactions.request_changes.status: action-required`.
   - `hooks.submit_edit.pre.routine: { _ref: modules/workflows/workflow_config/onboarding/hooks/send-quote-pre-submit.yaml }`.
   - `hooks.approve.post.routine: { _ref: modules/workflows/workflow_config/onboarding/hooks/send-quote-post-approve.yaml }`.
   - (App `_ref` paths resolve relative to `apps/demo/lowdefy.yaml` — the app root — not the file containing the `_ref`. See task 3's `hooks.submit_edit.pre.routine._ref` for the precedent.)
   - `status_map` with entries for `action-required`, `in-progress`, `in-review`, `changes-required`, `done`, plus `blocked` (the initial state on workflow start). Active statuses carry `link:` blocks; terminal statuses (`done`) carry `message` only.
     - `action-required.demo.link.pageId: { _module.pageId: { id: onboarding-send-quote-edit, module: workflows } }`, `urlQuery: { action_id: true }`.
     - `changes-required.demo.link` — same `-edit` page (per [design.md line 125](../design.md), `changes-required` reuses the `-edit` link).
     - `in-progress.demo.link.pageId: { _module.pageId: { id: onboarding-send-quote-view, module: workflows } }`, `urlQuery: { action_id: true }`.
     - `in-review.demo.link.pageId: { _module.pageId: { id: onboarding-send-quote-review, module: workflows } }`, `urlQuery: { action_id: true }`.
     - `blocked.demo.message: Awaiting lead qualification.` (no `link:`).
     - `done.demo.message: Quote approved and sent.` (no `link:`).

2. **Create `apps/demo/modules/workflows/workflow_config/onboarding/hooks/send-quote-pre-submit.yaml`** — pre-hook routine for `send-quote.submit_edit`. Minimal demo routine with a `:return:` that demonstrates the pre-hook return contract (e.g. `event_overrides.display: 'Quote sent for review.'`).

3. **Create `apps/demo/modules/workflows/workflow_config/onboarding/hooks/send-quote-post-approve.yaml`** — post-hook routine for `send-quote.approve`. Demonstrates a post-hook reading `result` per the [submit-pipeline spec](../../../../workflows-module-concept/submit-pipeline/spec.md):

   ```yaml
   - id: log_post_approve
     type: Set
     params:
       message:
         _string.concat:
           - 'Quote approved; event id: '
           - _payload: result.event_id
   - :return:
       message:
         _step: log_post_approve.message
   ```

   Post-hooks can't abort — return shape is free-form, surfaced as `post_hook_response` on the API return.

## Acceptance Criteria

- All three files exist and are valid YAML.
- `send-quote.yaml`'s `hooks.submit_edit.pre.routine` and `hooks.approve.post.routine` both `_ref` their respective sibling files.
- `send-quote.yaml` declares both `form:` and `form_review:` blocks.
- `status_map` covers at minimum `action-required`, `in-progress`, `in-review`, `changes-required`, `done`, and `blocked`.
- `apps/demo` builds without errors.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` — create.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/send-quote-pre-submit.yaml` — create.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/send-quote-post-approve.yaml` — create.

## Notes

- This is the only action in 20b that exercises `form_review`. The `review` verb in `access.demo` is what gets `makeActionPages` to emit the `onboarding-send-quote-review` page.
- `changes-required` is a recoverable status — the reviewer sending back to `action-required` lets the original author edit and re-submit. The link target stays `-edit`.
- The exact form-field choices are flexible; pick two simple fields each for `form:` and `form_review:` to exercise the library without over-engineering.
