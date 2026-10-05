---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-ai-assistant": patch
---

The ai-assistant module builds under `auth.organizations.policy: tenant`. The `AiText` connection (thread titling) holds no data and now declares itself non-scopable (`tenant: false`), so the tenant wall no longer fails the build on it. The threads connection is walled like any MongoDB connection, so each organization keeps its own thread history.
