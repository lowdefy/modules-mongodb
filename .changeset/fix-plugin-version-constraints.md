---
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-events": patch
"@lowdefy/modules-mongodb-files": patch
"@lowdefy/modules-mongodb-user-account": patch
"@lowdefy/modules-mongodb-data-upload": patch
---

Fix plugin version constraints in module manifests. `@lowdefy/modules-mongodb-plugins` references updated from the invalid `^1` (no matching published version) to `^0.1.0`, and missing `version` declarations added for `@lowdefy/modules-mongodb-plugins` and `@lowdefy/community-plugin-xlsx` where the module validator required them.
