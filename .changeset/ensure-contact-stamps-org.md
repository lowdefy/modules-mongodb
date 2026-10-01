---
"@lowdefy/modules-mongodb-user-account": patch
---

A person record created when someone signs in now always carries its organisation. Under the tenant policy, sign-up could leave a contact with no organisation, which the tenant wall can never show and which its preflight flags on every start. The record is only created when the session has a real organisation.
