---
"@lowdefy/modules-mongodb-user-account": patch
---

Signing in works again. The check that a new session has an organisation before its person record is created used a form of the type test Lowdefy does not have, so every sign-in failed with a server error.
