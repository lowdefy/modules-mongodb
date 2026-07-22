---
"@lowdefy/modules-mongodb-activities": minor
---

Add the **open-tasks** component — a compact card list of an entity's open
`kind: task` docs, reading activities' own `actions` collection filtered by
`entity_type`/`entity_id` (the shape `create-task`/`update-task` write) and
an open status (current stage not `done`). It's the activities-owned
sibling of the `workflows` module's `open-actions` card, styled to match
it so a host can compose both side by side into one "what's open" row.
Takes `entity_type` + `entity_id` vars and an optional `on_click` action
list for wiring a host's `task-modal` instance. Reads no workflow-engine
data.
