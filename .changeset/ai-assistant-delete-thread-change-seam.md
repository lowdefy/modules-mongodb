---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

ai-assistant: run `on_thread_change` when the open thread is deleted

Deleting the open thread mints a fresh conversation to land in, which is the active thread
changing by a user action — but `delete-thread` never ran `on_thread_change`, so a consuming
app was not told. Anything derived from the open conversation and rendered outside the chat
kept describing the thread that had just been deleted, and stayed that way until the user
opened another one. That reads as wrong data rather than as missing data.

`new-thread` and `select-thread` already ran the seam; this was the third way the active
thread can change, and the only one that did not.
