---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

ai-assistant: say when the assistant is unavailable

An app that has stopped the assistant — a workspace out of AI credits, a paused tenant — had
nowhere to say so. The chat still offered a composer, and a message sent into it failed on its
own terms, which reads as the assistant being broken rather than switched off.

The new `notice` var takes `{ type, message, description }` and replaces the conversation with
that alert, taking the composer with it. The thread list stays reachable, so earlier answers can
still be read. Null, the default, shows the chat as normal.
