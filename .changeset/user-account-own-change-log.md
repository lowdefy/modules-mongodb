---
"@lowdefy/modules-mongodb-user-account": patch
---

**Apps on `policy: tenant` build again without remapping `user-contacts-system`.** The contact minted at sign-in now writes its change log to its own `log-changes-system` collection instead of `log-changes`. That connection is shared across organizations, so its change-log records carry no `organization_id`; in `log-changes`, which walled connections read, one such record made the tenant preflight refuse to serve the app, and current Lowdefy refuses the pairing at build time. Apps that remapped `user-contacts-system` to their own connection only to move its change log can drop the remap. Anything that reads the sign-in mint's change-log records should read `log-changes-system`.
