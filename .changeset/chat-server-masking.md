---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-ai-reporting": minor
---

**Personal information is masked on the server, before the model sees it and before a chat is stored.** The browser guard only stops what an honest user types: anyone signed in can call the chat endpoints or the agent route directly. Now, while `pii_guard` is on (the default), every match of `pii_patterns` in a message's text becomes `[removed]`:

- `ai-reporting`'s agent sets Lowdefy's `redact`, so the model, the title call, the tools and the hooks see masked text. Its `save-conversation` and `set-conversation-title` endpoints mask what they store too.
- `ai-assistant`'s `save-thread`, `save-thread-on-finish` and `title-thread` mask the messages and titles they store, and `title-thread` masks the exchange it sends the titling model.

`ai-assistant`'s agent is your app's, so set its `redact` yourself with the new `agent-redact` component: `redact: { _ref: { module: ai-assistant, component: agent-redact } }`. It needs Lowdefy 7.2 or later. Files and screenshots are not masked; see the `ai-assistant` docs' "Masking on the server".
