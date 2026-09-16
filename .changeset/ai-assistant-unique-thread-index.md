---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

ai-assistant: the threads index on `{ conversationId, user_id }` should be unique

Saving a thread upserts on that pair. Two saves that race and both find no existing row will
both insert, and MongoDB allows it unless the index is unique — so one conversation ends up
stored twice, showing twice in the list, with whichever row the query reaches first being the
one that reads back. The index was already recommended for speed; it is needed for correctness
too. Apps that added it as non-unique should replace it.
