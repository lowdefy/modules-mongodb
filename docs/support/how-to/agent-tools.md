---
title: Give the app's agent the support tools
module: support
type: how-to
concepts: [agent-tools, agent-instructions, chat-files, filed-by-agent]
---

# Give the app's agent the support tools

The module ships four tools and a brief for the app's own agent, so a user can describe a problem in the chat and the agent files the ticket and follows it up for them.

| Tool name                 | Endpoint                | Does                                                                                 |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `support_file_ticket`     | `agent-file-ticket`     | Files a ticket with the chat's images and PDFs. Answers `{ ok, key, stage, files }`. |
| `support_list_my_tickets` | `agent-list-my-tickets` | The user's tickets, each `{ key, title, stage, updated, unread }`.                   |
| `support_read_ticket`     | `agent-read-ticket`     | One ticket's thread, each message `{ from, author, at, text, files, deleted }`.      |
| `support_post_message`    | `agent-post-message`    | Adds a message, with the chat's images and PDFs not on the ticket yet.               |

Every tool acts for the session user, through the same checked cores as the report form, and answers `{ ok: false, error }` on a failure, with the `kind` the [endpoints](../index.md#endpoints) describe. The brief tells the agent what each kind means.

## Wire them into the agent

The agent is the app's own. Give it the tools with the `agent-tools` component, which names them as the brief does, and add the brief to its instructions with the `agent-instructions` component:

```yaml
agents:
  - id: assistant
    type: AIGatewayAgent
    connectionId: ai_gateway
    properties:
      model: google/gemini-2.5-flash
      instructions:
        _build.string.concat:
          - You are the assistant in this app. ...
          - "\n\n"
          - _ref:
              module: support
              component: agent-instructions
    tools:
      _ref:
        module: support
        component: agent-tools
```

An agent with tools of its own joins the lists with `_build.array.concat`.

The app sets its agent's model. Gemini Flash is a good fit: the tools need a model that writes a clear ticket and follows the brief, not a large one.

## Let the chat's files through

The tools send the images and PDFs the user attached in the chat. They take them from the chat request (`_agent: files`), never from the model, so the agent can only send files of its own conversation. Each file is sent once per ticket: the copy records the keys sent on it in `chat_files`, and a later message leaves those out. At most five go with one ticket or message.

The browser builds the chat request, so the tools send a file only when its key starts with the caller's own chat upload prefix. Set `chat_files_prefix` to the prefix the app's chat upload request gives the user's uploads:

```yaml
- id: support
  source: "github:lowdefy/modules-mongodb/modules/support@vX"
  vars:
    chat_files_prefix:
      _string.concat:
        - ai-assistant/
        - _user: id
        - /
```

With no prefix set, the tools send no chat files. Chat uploads must go to the `files` module's bucket, the one the module signs links on. See the ai-assistant module's [attachments](../../ai-assistant/index.md#attachments).

A file the user attaches on the very message that asks for the ticket goes with it: the chat request carries every message of the conversation, the newest included.

## What the team sees

A ticket the agent files carries `extra.filed_by: agent` and `extra.conversation_id`, the chat's conversation id, in its context, beside the app, environment, version and organisation every ticket carries.

The tools are ordinary endpoints. Called with no agent, by a person or over MCP, they send no chat files and `extra.conversation_id` is null.
