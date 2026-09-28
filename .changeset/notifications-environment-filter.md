---
"@lowdefy/modules-mongodb-notifications": minor
---

**Exempt notification types opt out with `filter: false`, and `server_url` / `email.filter` can be left to the Lowdefy environment.**

Lowdefy now declares an app's deployment environments once under `config.environments`. An unset (`null`) SMTP or SendGrid connection filter falls back to the current environment's `email.filter`, and the RenderNotification `serverUrl` defaults to the environment's `url`. So the module's exempt branch (`filter_exempt_types`, such as invites, which must reach the real recipient) now returns `false` rather than `null`: `null` would pick up the environment's catch-all and redirect the invite.

Apps that declare their environments can drop the `server_url` and `email.filter` / `sendgrid.filter` vars.

**Requires a Lowdefy version with `config.environments`** (lowdefy/lowdefy#2414 / #2415). An older Lowdefy rejects `filter: false` in the connection schema, which would fail sends of exempt types.
