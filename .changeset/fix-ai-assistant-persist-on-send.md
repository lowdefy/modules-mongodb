---
'@lowdefy/modules-mongodb-ai-assistant': patch
---

A thread now survives leaving the page mid-answer. Threads were persisted only when the reply finished streaming, from the chat block's `onMessageComplete` on the client, so sending a message and navigating away before the answer landed saved nothing at all: the thread was never created, leaving no history to resume and no record of what had been asked.

The module now also saves on `onUserMessage`, whose payload already carries the message just sent. The worst case becomes a thread missing its answer rather than a thread that never existed, and it is named from the question rather than left as "New chat" — the provisional-title derivation is now a shared action used by both save paths, so the two cannot drift apart.

`on_user_message` still runs after the module's own steps, so a consumer's actions on that event now see a thread that is already stored.

This persists the question, not the answer: the reply is only ever known to the client that received it. An app that needs the answer in its stored history should write it from its agent's `onFinish` hook, which is awaited server-side and so still runs once the client has gone.
