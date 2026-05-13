---
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
---

Fix companies module to honour the `name_field` module var consistently across the form, state, write APIs, and read-side requests.

Previously, with `name_field` overridden (e.g. to `trading_name`), the edit form rendered an empty name input and updates silently dropped the change — `update-company.yaml` had a YAML indentation bug that caused `_build.object.fromEntries` to never evaluate, so Mongo received a literal `_build.object.fromEntries` field in `$set` instead of the configured name field. The contacts module's `get_contact_companies` request also hardcoded `name`, ignoring the companies module's configuration.
