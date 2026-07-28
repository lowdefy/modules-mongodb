---
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Add a `lock_when_done` action flag for actions that must only ever be submitted once

By default a submitted action can be submitted again — that is what keeps form actions editable while done. When a submit has side effects that must happen exactly once, such as creating a record in an external system or starting a downstream workflow, set `lock_when_done: true` on the action to declare it final.

Once the action is done, its Edit and Submit buttons disappear and the engine rejects a repeat submit outright, so a hand-crafted request cannot re-run the action's hooks either. The action stays readable, and a reviewer can still send it back with Request Changes.

Defaults to `false`, so no existing action changes behaviour.
