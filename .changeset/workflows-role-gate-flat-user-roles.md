---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-workflows": patch
---

Workflows: read the caller's roles from the flat `user.roles` session field instead of `user.apps.{app_name}.roles`. The engine's verb gates (`view`/`edit`/`review`/`error`) were resolving roles from a nested `apps.{app_name}.roles` path that the standard Lowdefy session user (`userFields.roles`) does not expose, so role-gated actions (e.g. an `admin`-only quote review) were denied even for users holding the role. Removed the unused `user_schema` / `roles_path` var, which documented a configurable roles path that was never plumbed into the connection or read in code.
