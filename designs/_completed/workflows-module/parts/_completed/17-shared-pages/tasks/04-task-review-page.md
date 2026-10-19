# Task 4: Ship `pages/task-review.yaml` — task review page with approve / request_changes

## Context

After tasks 2 and 3, the page-shell pattern is established and the role gate + `required_after_close` gate + stale-URL redirect are working on task-edit. Task 4 ships `task-review.yaml` — the review surface for task actions.

The page is simpler than task-edit (no status selector, no form fields — just approve / request_changes buttons against the read-only universal fields) but reuses the same gate logic and stale-URL redirect (with a different allowlist).

## Task

Create `modules/workflows/pages/task-review.yaml`:

- **Page id:** `task-review`. URL query: `?action_id=<id>`.
- **Top-level wrap:** `_ref` to `layout.page` (match the chrome from task 2 / 3).
- **Requests:** `get_action.yaml` AND `get_workflow.yaml` (for the `required_after_close` gate). No entity fetch.
- **`onMount` sequence (eight steps):**
  1. `action_id` presence guard.
  2. `Request: get_action`.
  3. **Stale-URL redirect guard** — `Link` to `task-view?action_id=<id>` when `_request: get_action.status.0.stage` is NOT in `[in-review, error]`. Match part 16's `review.yaml.njk` allowlist (`error` included so reviewers can see the action while it's mid-recovery; engine-side recovery flow handles it).
  4. `Request: get_workflow` — needed for `required_after_close` gate.
  5. `Request: get_entity` — **skipped**.
  6. `action_role_check` — sets `_state.action_allowed`.
  7. `SetState` — primes `_state.comment` to empty string. Universal fields are displayed read-only (no `_state.fields.*` priming for editing — they come from `_request: get_action.*` directly into the universal-fields component's `action_data:` slot).
  8. Author-supplied `pages.review.events.onMount`.

- **Blocks (inside `layout.page.blocks` wrapped in `layout.card`):**

  1. **Workflow-closed banner** — same visibility expression and Alert content as task-edit (task 3). Same gate logic, same content. Inline emit; defer extraction.

  2. **Action header** — title + current status badge (from `_global: action_statuses`).

  3. **Universal-fields display** — `_ref` to `../components/universal-fields/universal-fields.yaml` with `vars: { mode: display, kind: task, action_data: { assignees, due_date, description } }`. Read-only.

  4. **Optional comment field** — `TextArea` or `RichText` bound to `_state.comment`. ID: `comment` (top-level scalar). Comment is sent to the resolver-emitted API; the API maps it to `event.metadata.comment` per part 13's Comment mapping. The field is optional; user can submit approve / request_changes with or without a comment.

  5. **`approve` button** — template-shipped block; calls `update-action-{action_type}` with `interaction: approve`, `fields: { _state: fields }`, `comment: { _state: comment }`. No `current_status` (task-edit is the one interaction where caller supplies the status — review interactions use the engine-default target stage `done`).
     - **Role gate:** hidden when `_state.action_allowed !== true`.
     - **`required_after_close` gate:** disabled when the gate triggers.

  6. **`request_changes` button** — template-shipped block; calls `update-action-{action_type}` with `interaction: request_changes`, same payload shape as approve. Engine resolves target stage to `changes-required`.
     - Same role gate + `required_after_close` gate.
     - Fires the author's `pages.review.events.onRequestChanges` handler first.

- **Author chrome slots:** task-review supports `pages.review.events.onMount`, `pages.review.events.onApprove`, `pages.review.events.onRequestChanges` only. Reject all other `pages.review.*` fields via part 4's validator (out of scope for this task — part 4 owns the validator).

## Acceptance Criteria

- `modules/workflows/pages/task-review.yaml` exists, parses as valid Lowdefy YAML.
- Page id is `task-review`.
- `onMount` array contains all eight steps with step 5 omitted; step 3 redirects to `task-view?action_id=<id>` when current stage is not in `[in-review, error]`.
- Workflow-closed banner appears when workflow is `completed`/`cancelled` and action doesn't declare `required_after_close: true`. Same expression as task-edit.
- `approve` and `request_changes` buttons are hidden when `_state.action_allowed === false` and disabled when the `required_after_close` gate triggers.
- `approve` button sends `{ interaction: approve, fields, comment }` (no `current_status`) to `update-action-{action_type}`; engine resolves target stage to `done`.
- `request_changes` button sends `{ interaction: request_changes, fields, comment }`; engine resolves target stage to `changes-required`.
- `pages.review.events.onApprove` fires before approve's API call; `pages.review.events.onRequestChanges` fires before request_changes's API call.
- Input block IDs: `comment`.
- Snake_case block IDs.

## Files

- `modules/workflows/pages/task-review.yaml` — **create** — the task review page.

## Notes

- The approve and request_changes buttons are template-shipped per part 16's button vocabulary. Check `modules/workflows/templates/review.yaml.njk` for the canonical button block shapes; copy/adapt for task-review (drop the `Edit` navigation button since task pages don't have a per-action edit page to link to — `task-edit` is shared and the URL is just `?action_id=` away).

- The workflow-closed banner is duplicated across task-edit and task-review with identical content. v1 ships the duplication. If a third consumer emerges or the message needs to change, extract to `components/workflow-closed-banner.yaml` as a follow-up.

- File scale: ~200–250 lines.

- The `request_changes` button's modal: part 16's review template ships an optional `request_changes` modal that lets reviewers explain what changes are needed. Task-review should ship the same modal (or omit it entirely if the worked-example doesn't require). Per design § "What's supported on task actions", `pages.review.modals.{name}` is NOT supported on task actions — so the modal config can't be per-action. If shipping the modal, it's hardcoded in the template.
