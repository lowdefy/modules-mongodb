---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-ai-assistant": patch
---

**The ai-assistant module installs under `auth.organizations.policy: tenant`.** The threads connection is walled like any MongoDB connection, so each organization keeps its own thread history. The `AiText` connection (thread titling) holds no data and declares itself non-scopable (`tenant: false`).
