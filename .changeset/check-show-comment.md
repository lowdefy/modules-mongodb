---
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Honour `show_comment` on `kind: check` actions. The flag chooses whether an action's working surface offers the optional free-text comment box — it has worked on form actions since it shipped, but check actions silently ignored it and always rendered the box. Declaring `show_comment: false` on a check action now removes it, on both the standalone check page and the in-context check modal.

Each check action's declaration is honoured independently even though one `{workflow_type}-action` page serves them all. The flag is resolved from workflow config on every read (like `description` and `universal_fields`), so it is never stored on the action document — change it and redeploy, and in-flight actions pick it up with nothing to migrate.

Only the **optional** comment is gated. The two mandatory comment inputs always render, because the engine needs their text: the reviewer's brief in the review-mode Request Changes modal, and the recovery note on an action sitting in the `error` stage. This matches what form actions already did.

`show_comment` is now validated: a non-boolean value fails the build instead of being silently accepted. If an app authored a quoted `show_comment: "false"`, that build will now error — the quoted string was never honoured as `false`, so update it to a real boolean. The field is also now documented in the authoring grammar reference, where it was previously missing entirely.
