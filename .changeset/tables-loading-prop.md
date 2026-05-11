---
"@lowdefy/modules-mongodb-activities": patch
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-user-admin": patch
---

Use the AgGrid block's native `loading` property for the list tables (`activities_table`, `companies_table`, `contacts_table`, `users_table`) instead of swapping the `overlayNoRowsTemplate` between `Loading...` and `No rows` via `_if`. The block now enters its built-in loading state while the list request is pending and falls back to a static `No rows` overlay once it resolves empty — the previous wiring conflated "loading" with "empty" through a single text overlay.
