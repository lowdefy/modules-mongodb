---
"@lowdefy/modules-mongodb-plugins": patch
---

Thread session user and entities map onto the WorkflowAPI connection. Fixes a latent submit-gate bug where role-array gates always denied because `createEngineContext` read user from the wrong location.
