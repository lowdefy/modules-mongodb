---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

Threads save again when the `tag` var is left unset, and thread titling runs when `title_context` is left unset. Both vars default to null, and the `save-thread` and `title-thread` endpoints refused a null `tag` or `context` against their payload schemas, so an app that set neither never persisted a thread.
