---
"@lowdefy/modules-mongodb-user-account": patch
---

The Access tokens tile works under `auth.organizations.policy: tenant`. It lists the member's tokens, a new token stays on screen once it is created, and switching a token off finds it. The token reads no longer name `organization_id`, which the tenant wall refuses; the wall scopes them to the active organization.
