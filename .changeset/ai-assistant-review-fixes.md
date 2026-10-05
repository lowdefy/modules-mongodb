---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

ai-assistant: keep threads and their names intact, and refuse calls with no session

- New chat, Manage chats and Delete are disabled while a reply streams. Switching mid-reply dropped the reply before it could be saved, and left the thread named after its question.
- A name the user types is kept. Renaming before the first reply skips titling, a rename while the title is generating wins, and a later save no longer puts an older name back.
- The generated title updates the thread list even after the user has switched threads.
- Every endpoint rejects a call with no signed-in user, and `title-thread` refuses when titling is off.
- The empty thread list reads in secondary text, and thread tag chips have a background.
- Docs: the panel mount example sets its vars on the module entry, and `on_before_send` is documented as a browser-side check that some sends skip.
