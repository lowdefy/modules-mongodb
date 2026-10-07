---
"@lowdefy/modules-mongodb-support": minor
---

The `support` module ships four tools for an app's own agent, `agent-file-ticket`, `agent-list-my-tickets`, `agent-read-ticket` and `agent-post-message`, and a brief for it. The `agent-tools` component lists them under the names the brief uses, and `agent-instructions` is the brief: file once the problem is clear, one ticket per problem, follow-ups on the existing ticket, and what each kind of failure means. A ticket the agent files carries `extra.filed_by: agent` and the chat's conversation id. The tools send the images and PDFs the user attached in the chat, taken from the chat request (`_agent: files`), never from the model, and only those under the new `chat_files_prefix` var; each goes once per ticket, recorded in the copy's new `chat_files` field.
