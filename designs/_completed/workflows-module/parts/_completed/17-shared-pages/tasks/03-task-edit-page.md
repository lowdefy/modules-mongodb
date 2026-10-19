# Task 3: Ship `pages/task-edit.yaml` — task edit page with status selector + gates

## Context

After task 2 lands, `modules/workflows/pages/` exists and `task-view.yaml` establishes the page-shell pattern. Task 3 adds `task-edit.yaml` — the most complex of the three task pages because it carries:

- Status selector with priority-rule filter (lower-priority transitions + same-stage idempotent option; disabled when current stage is `not-required`).
- Universal-fields band in `edit` mode.
- Comment field (rich text).
- Save button that calls `update-action-{action_type}` with `interaction: submit_edit`, `current_status`, `fields`, `comment`.
- **Role gate** — Save hidden / disabled when `_state.action_allowed !== true`.
- **`required_after_close` gate** — Save disabled with a "workflow closed" banner when the workflow is `completed`/`cancelled` and the action doesn't declare `required_after_close: true`.
- **Stale-URL redirect** — opens `task-view?action_id=<id>` if action's current stage isn't in `[action-required, in-progress, changes-required]`.

This page exercises the full eight-step `onMount` sequence (steps 4–7 are all live on task-edit, unlike task-view).

## Task

Create `modules/workflows/pages/task-edit.yaml`:

- **Page id:** `task-edit`. URL query: `?action_id=<id>`.
- **Top-level wrap:** `_ref` to `layout.page` (match the chrome choices task 2 settled on for task-view).
- **Requests:** `get_action.yaml` AND `get_workflow.yaml` reused from `modules/workflows/requests/`. Do not fetch entity.
- **`onMount` sequence (eight steps, all live except 5):**
  1. `action_id` presence guard.
  2. `Request: get_action`.
  3. **Stale-URL redirect guard** — `Link` action to `task-view?action_id=<id>` (with `input: { skip_status_redirect: true }`-equivalent passthrough if needed) when `_request: get_action.status.0.stage` is NOT in `[action-required, in-progress, changes-required]`. Match part 16's `edit.yaml.njk` redirect pattern. The escape hatch isn't strictly needed on task-edit (there's no review-page Edit-button equivalent to bypass the guard), but adding it matches the part 16 contract.
  4. `Request: get_workflow` — needed for the `required_after_close` gate (reads `workflow.status.0.stage`) and to surface workflow context if any.
  5. `Request: get_entity` — **skipped** (task pages don't fetch entity).
  6. `action_role_check` — sets `_state.action_allowed`. Gate the Save button on this.
  7. `SetState` — primes:
     - `_state.fields.assignees`, `_state.fields.due_date`, `_state.fields.description` from `_request: get_action.assignees` / `.due_date` / `.description`.
     - `_state.status` (the status selector's default) to `_request: get_action.status.0.stage` (per design — "the selector defaults to the action's current stage ... so a same-stage save is a one-click action").
     - `_state.comment` to empty string.
  8. Author-supplied `pages.edit.events.onMount` from `_var: page_config.events.onMount`, default `[]`.

- **Blocks (inside `layout.page.blocks` wrapped in `layout.card`):**

  1. **Workflow-closed banner** (visible when the `required_after_close` gate triggers):
     - `visible:` expression: workflow is in `completed` or `cancelled` AND action does NOT have `required_after_close: true`. Build the expression using `_and` / `_or` with `_request: get_workflow.status.0.stage` and `_request: get_action.required_after_close`. Default for missing `required_after_close` is `false`.
     - Render an `Alert` block (or equivalent) with a message like "This workflow is closed. Updates to this action are no longer accepted."
     - This banner is also referenced by task 4 (task-review). Consider whether to extract into a small reusable block file — for v1, inline is fine; defer extraction.

  2. **Universal-fields band** — `_ref` to `../components/universal-fields/universal-fields.yaml` with `vars: { mode: edit, kind: task, action_data: {...} }`. Primary content per design ("primary content, with the status selector and comment field below").

  3. **Status selector** — a `Selector` (or `Radio` if the worked-example pattern uses it) block bound to `_state.status`. Options:
     - Source: `_global: action_statuses` (a merged enum carrying display attrs — title, color, etc.). The enum is keyed by status slug.
     - Filter: priority-rule. For each enum key, include if:
       - Status priority < current stage's priority, OR
       - Status slug === current stage (same-stage idempotent re-save).
       - Exclude `force: true` overrides — UI never exposes those.
     - Disabled when current stage is `not-required` (priority 0, universal terminal). Render with a "No transitions available" placeholder text.
     - Use the established Lowdefy `_js` operator if the filter logic exceeds operator chaining readability; per CLAUDE.md "Operators before `_js`", attempt the operator chain first.

  4. **Comment field** — `TextArea` or `RichText` bound to `_state.comment` (rich text per design). ID: `comment` (top-level scalar, NOT nested under `event.metadata.*` per design § Comment mapping).

  5. **Save button** — template-shipped `submit_edit` block; calls the action's `update-action-{action_type}` Api with `interaction: submit_edit`, `current_status: { _state: status }`, `fields: { _state: fields }`, `comment: { _state: comment }`. The button's `visible:` / `disabled:` props enforce:
     - **Role gate:** hidden when `_state.action_allowed !== true`.
     - **`required_after_close` gate:** disabled when the same condition as the workflow-closed banner (workflow `completed`/`cancelled` AND action's `required_after_close !== true`).
     - **Form-action verb namespace:** see [part 13](../../13-resolver-apis/design.md) for the `update-action-{action_type}` endpoint shape.

- **Author chrome slots:** task-edit supports `pages.edit.events.onMount` and `pages.edit.events.onSubmit` only (per design § "What's supported on task actions"). Do NOT wire `formHeader` / `formFooter` / `title` / `requests` / `modals` / `maxWidth` — rejected at build time by part 4's validator. The `onSubmit` handler fires before the Api call.

## Acceptance Criteria

- `modules/workflows/pages/task-edit.yaml` exists, parses as valid Lowdefy YAML, and follows the part 16 template pattern adapted for static (non-Nunjucks) emission.
- Page id is `task-edit`.
- `onMount` array contains all eight steps in the design's order, with step 5 (get_entity) omitted and step 3 (stale guard) wired against the allowlist `[action-required, in-progress, changes-required]`. Redirect target is `task-view?action_id=<id>`.
- Status selector filters correctly: from `action-required` it offers lower-priority transitions plus the same-stage option; from `not-required` the selector renders disabled with the "no transitions available" message.
- Save button is hidden when `_state.action_allowed === false` and disabled when the `required_after_close` gate triggers.
- Workflow-closed banner appears when the workflow is `completed`/`cancelled` and the action doesn't declare `required_after_close: true`.
- Save payload sends `current_status: { _state: status }`, `fields: { _state: fields }`, `comment: { _state: comment }` to `update-action-{action_type}` with `interaction: submit_edit`.
- Input block IDs match data paths per CLAUDE.md: `fields.assignees`, `fields.due_date`, `fields.description`, `status`, `comment`.
- Snake_case block IDs, snake_case action IDs.
- Page builds once parts 18 and 24 ship their components.

## Files

- `modules/workflows/pages/task-edit.yaml` — **create** — the task edit page.

## Notes

- The status selector's priority filter is the trickiest piece. The enum from `_global: action_statuses` is keyed by status slug with a `priority` field on each entry. The selector's `options` need to be computed at render time. Sketch (using `_js` since operator chaining for filter+map is awkward):

  ```yaml
  options:
    _js:
      args:
        - _global: action_statuses
        - _request: get_action.status.0.stage
      script: |
        const [statuses, currentStage] = arguments;
        const currentPriority = statuses[currentStage]?.priority ?? 0;
        if (currentPriority === 0) return []; // not-required terminal
        return Object.entries(statuses)
          .filter(([slug, s]) => s.priority < currentPriority || slug === currentStage)
          .map(([slug, s]) => ({ label: s.title, value: slug, color: s.color }));
  ```

  Adjust to the actual enum shape (check `modules/workflows/enums/action_statuses.yaml`) and Lowdefy `_js` operator syntax conventions in the codebase.

- The disabled state for the `not-required` terminal needs a `disabled:` prop + a visible explanatory message. Two approaches: (a) emit empty `options` + a disabled selector + a sibling Html message; (b) render an alert in place of the selector when `currentStage === 'not-required'`. (b) is cleaner UX. Pick whichever matches the established UI patterns.

- The workflow-closed banner's visibility expression:

  ```yaml
  visible:
    _and:
      - _or:
          - _eq:
              - _request: get_workflow.status.0.stage
              - completed
          - _eq:
              - _request: get_workflow.status.0.stage
              - cancelled
      - _ne:
          - _request: get_action.required_after_close
          - true
  ```

- The Save button block in part 16 is template-shipped — check `modules/workflows/templates/edit.yaml.njk` for the exact button block to copy/adapt. The task-edit Save button adds the `current_status` payload field; form-edit doesn't send it (engine resolves target stage from `action.interactions[interaction].status` for form actions).

- File scale: ~250–350 lines depending on how much status-selector filter logic ends up inline. Don't extract into components unless a clear second consumer exists.
