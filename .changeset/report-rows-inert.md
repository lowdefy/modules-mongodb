---
"@lowdefy/modules-mongodb-plugins": patch
---

fix: `compileReport` now strips, at any depth, every key that starts with `_` from the section rows it inlines into a report, except `_id`. Before this, a query field named `__function`, `_state` or `__api` ran as a live operator in the viewer's browser. `_id` is not an operator, so a `$group` result can still use it as a table column or KPI value. A contract that declares any other underscore key now renders that section as an Alert naming the available columns. Project the field under another name to show it. The stored query no longer enters the compiled report either: re-queries and downloads name the report and section, and the endpoint loads the query.
