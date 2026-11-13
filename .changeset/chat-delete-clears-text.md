---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-ai-reporting": minor
---

**Deleting a chat now removes its text, and chats can expire 90 days after they start.** In both chat modules a delete marked the thread or conversation deleted and kept everything in it, and in `ai-reporting` a deleted conversation still opened by its id. Now the same write that marks it deleted clears its messages and title (and, in `ai-reporting`, its result panel's `data_parts`), and every read of one chat returns nothing for a deleted id. A reply that finishes after the delete, through the browser's save or the agent's `onFinish` hook, writes nothing back, so the text stays gone even when the chat was deleted while the answer was still arriving. Saved reports are not chats and keep their soft delete.

To expire chats, declare a TTL index on the creation date, set to your retention period (90 days is `expireAfterSeconds: 7776000`): `{ created: 1 }` on the `ai-assistant` threads collection and `{ "created.timestamp": 1 }` on the `ai-reporting` conversations collection. Replace any TTL index those collections already have (for example one on `updated`, which never expires a chat still in use) rather than adding beside it. See the `ai-assistant` docs' "Retention and delete" section and `ai-reporting`'s expected indexes. Files people attach in `ai-assistant` live in your app's storage, which delete and the TTL do not reach: expire your chat upload prefix at the same period.
