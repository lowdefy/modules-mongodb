---
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Honour `universal_fields` on `kind: check` actions. The flag chooses which of the two action-level fields (`assignees`, `due_date`) an action's UI shows — it has worked on form actions since it shipped, but check actions silently ignored it and always rendered both. Declaring `universal_fields: [due_date]` on a check action now hides the assignees chip and drops the assignees input from the ✎ edit modal, on both the standalone check page and the in-context check modal.

Each check action's declaration is honoured independently even though one `{workflow_type}-action` page serves them all. The presence list is resolved from workflow config on every read (like `description`), so it is never stored on the action document — change it and redeploy, and in-flight actions pick it up with nothing to migrate.

This is presence, not permission: hiding a field does not gate who may change it (use `access:` for that), and a hidden field is never written or cleared, so narrowing the list on an action that already has assignees stops showing them rather than wiping them. `universal_fields` is now documented in the authoring grammar reference, where it was previously missing entirely.
