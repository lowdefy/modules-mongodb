---
"@lowdefy/modules-mongodb-user-account": patch
---

Fix the `user-selector` / `user-multi-selector` options request returning no users. The request scoped the dropdown to `apps.{app_name}.is_user` using `_module.var: app_name`, but these components are only ever consumed through a cross-module `_ref` and `_module.var` resolved to `null` in that scope — so the query matched `apps.null.is_user` and returned nothing. It now reads the app slug via `_app: slug`, which resolves from the app root independently of module-entry-var resolution. Consuming apps must declare `slug:` on their `lowdefy.yaml` (kebab-case).
