---
"@lowdefy/modules-mongodb-support": patch
---

The `support` module's manifest lists its components once: `launcher`, `requests`, `on-init`, `agent-instructions` and `agent-tools` sit under one `components` key, in `exports` and at the top level, so the module builds again.
