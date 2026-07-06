---
"@lowdefy/modules-mongodb-workflows": patch
---

Make action edit-page button titles configurable

The edit page's progress ("Save Draft") and submit ("Submit") button titles can
now be overridden per action via `page_config.buttons.progress.title` /
`page_config.buttons.submit.title` (defaults unchanged). This lets an app relabel
e.g. a perpetual-log action's "Save Draft" button to "Save".
