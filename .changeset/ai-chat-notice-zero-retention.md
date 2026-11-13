---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-plugins": minor
---

**ai-assistant, ai-reporting:** Model calls run with zero data retention and only on Anthropic by default, and both chats show a notice under the composer.

- **Changed defaults, ai-reporting:** the reporting assistant and the report page's AI summary now send `zeroDataRetention: true` and `only: [anthropic]` to the AI Gateway, from the new vars `zero_data_retention` (default `true`) and `providers` (default `[anthropic]`). If you set `model` to a non-Anthropic model, set `providers` to match.
- **Changed defaults, ai-assistant:** the thread-title call now runs with `title_zero_data_retention: true` (was `false`) and the new `title_providers: [anthropic]`, and `title_model` defaults to `anthropic/claude-haiku-4.5` (was `openai/gpt-5-mini`, which an Anthropic-only route cannot serve). If you set `title_model` to another provider's model, set `title_providers` to match. Your own agent is yours to configure: set `zeroDataRetention: true` and `only: [anthropic]` on it, as the docs now show.
- **A notice under the composer, by default, in both modules:** "Don't enter personal information such as names, ID or employee numbers, salaries or contact details. Chats are processed by an AI service and kept for 90 days. Privacy Notice". New vars on both: `privacy_notice_url` (the Privacy Notice link, opened in a new tab; left out when unset) and `retention_days` (default 90, the number in the notice; your TTL index on the conversations collection should match). ai-reporting gains `composer_note`. In both, `composer_note` replaces the text and `composer_note: false` hides the note. **ai-assistant apps that left `composer_note` unset now show this notice**; set `composer_note: false` to keep the old look.
- **Plugins:** the `AiText` connection's `GenerateChatTitle` takes `only`, and `SummarizeReportData` takes `zeroDataRetention` and `only`, passed to the AI Gateway as `providerOptions.gateway`.
