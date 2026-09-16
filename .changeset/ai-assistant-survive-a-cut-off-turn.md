---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

ai-assistant: survive a turn that is cut off mid-stream

A reply that stopped early left its tool call with no result. That pairing cannot be sent back
to the model, so every later message on the thread failed before it reached one, and the thread
could not be opened again either — the stored history no longer validated. One interrupted reply
therefore killed the conversation permanently, and the only signal was that nothing happened.

Unresolved tool calls are now dropped when the history is saved and again when a thread is
loaded, along with any message left carrying nothing. The load side is what brings threads
already stored in that state back.

A turn that ends without an answer also says so. This is not an error the chat can report —
the stream closes normally and only carries nothing — so it went by in silence, which reads as
the assistant ignoring the question and invites the same question again.

Deleting a single message now keeps the stored thread in step. Regenerating or editing one
already did, because each ends in a send the thread is saved from; deleting ends there, so the
message came back on the next reload.
