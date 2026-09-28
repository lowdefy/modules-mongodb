---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-plugins": minor
---

ai-assistant: `title_zero_data_retention` keeps thread titling on zero-data-retention providers

Titling sends a thread's first question and reply to the title model. An agent can already restrict
its routing to providers with a zero data retention policy, but titling had no way to follow, so it
could land on a provider that retains what it's sent. The `GenerateChatTitle` request takes
`zeroDataRetention`, and the module passes it from the new var, which defaults to off.
