---
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-user-account": minor
---

Workflows Part 24 — universal-fields surface (`assignees` / `due_date` / `description`) as a state-orthogonal operation.

On **form-kind** actions the three universal fields are decoupled from the form submit: they render as a right-hand sidebar card with its own Update button and are written by a new per-workflow `{workflow_type}-update-fields` operation (`UpdateActionFields` handler) with no FSM transition and no workflow doc write. On **check-kind** actions the fields are still written on `submit`/`progress` and are also independently editable via the same Update operation. The operation re-renders the status-map cell so the entity-page card never goes stale, emits an `action-fields-updated` event, is gated on the per-app `edit` verb, and is editable in any stage (including after workflow close).

Authoring gains an optional `universal_fields` action field (`[assignees, due_date, description]`; omit = all three, `false`/`[]` = hidden) controlling UI presence only. `description` is now stored as `{ text, html }`. `user-multi-selector` gains parameterizable `id`/`title` vars; `GetWorkflowAction` returns `assignee_docs` for display avatars.
