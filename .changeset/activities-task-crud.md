---
"@lowdefy/modules-mongodb-activities": minor
---

Add exported task CRUD — `create-task` / `update-task` APIs writing
`kind: task` docs into activities' `actions-collection`, and a paired
`task-modal` component. Two seams keep this from being a lossy
generalization of deals' original deal-only implementation: an arbitrary
entity link (payload `entity_type`/`entity_id`, not a hardcoded reference,
so a task can hang off a deal, a meeting, or any entity) and a
consumer-supplied emitted event (`task-modal`'s `events` var supplies the
`type` + Nunjucks display template per create/complete/reopen transition,
forwarded through to the events module's `new-event`). `task-modal` also
takes the assignee-options source as a var (`assignee_options` +
optional `assignee_search`) instead of hardcoding a request.
