---
"@lowdefy/modules-mongodb-plugins": patch
---

fix: `compileReport` strips every key that starts with `_`, at any depth, from the section rows it inlines into a report. Without this, a query field named `__function`, `_state` or `__api` would have run as a live operator in the viewer's browser. A table, KPI or chart contract that declares an underscore key, such as `_id`, now renders that section as an Alert naming the available columns. Project the field under another name to show it. An options query can still use `_id` as its `valueKey`.
