---
"@lowdefy/modules-mongodb-deals": patch
---

Stop shipping a second, deal-only task implementation — delete
`components/detail/task_modal.yaml`, `api/create-task.yaml`, and
`api/update-task.yaml`, and consume activities' new exported `task-modal`
component (with activities' `create-task`/`update-task` APIs underneath)
instead. The deal view passes `entity_type: deal`, the deal id, and its
`deal-task-created`/`deal-task-completed`/`deal-task-reopened` event
config, so task creation still writes to the same `actions` collection,
links to the deal, and emits the same event display markup as before.
`get_task_assignee_options` stays in deals and is now passed to the shared
modal as its assignee-options source.
