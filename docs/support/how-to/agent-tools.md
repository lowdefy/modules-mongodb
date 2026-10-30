---
title: Give the app's agent the support tools
module: support
type: how-to
concepts: [agent-tools, agent-instructions, chat-files, filed-by-agent]
---

# Give the app's agent the support tools

The module ships four tools and a brief for the app's own agent, so a user can describe a problem in the chat and the agent files the ticket and follows it up for them.

| Tool name                 | Endpoint                | Does                                                                                           |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `support_file_ticket`     | `agent-file-ticket`     | Files a ticket with the chat's images and PDFs. Answers `{ ok, key, url, stage, files }`.      |
| `support_list_my_tickets` | `agent-list-my-tickets` | The user's tickets, each `{ key, url, title, stage, updated, unread }`.                        |
| `support_read_ticket`     | `agent-read-ticket`     | One ticket's key, `url` and thread, each message `{ from, author, at, text, files, deleted }`. |
| `support_post_message`    | `agent-post-message`    | Adds a message, with the chat's images and PDFs not yet sent on any ticket.                    |

Every tool acts for the session user, through the same checked cores as the report form, and answers `{ ok: false, error }` on a failure, with the `kind` the [endpoints](../index.md#endpoints) describe. The brief tells the agent what each kind means.

## Links to tickets

Every answer that names a ticket carries `url`, the app path of the ticket's page: `/{entry id}/{ticket key}`, such as `/support/PEL-1715`. It is built from the module's entry id, so it is right whatever the entry id is, and it carries no origin or base path. The brief tells the agent to write every ticket key as a markdown link to that `url`, such as `[PEL-1715](/support/PEL-1715)`, so the key is a link in the chat and never plain text.

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

The tools send the images and PDFs the user attached in the chat. They take them from the chat request (`_agent: files`), never from the model, so the agent can only send files of its own conversation. Each file is sent once: the copy records the keys sent on each ticket in `chat_files`, and a later ticket or message leaves out any key already sent on one of the user's tickets, so a second problem's ticket never repeats the first one's screenshots. At most five go with one ticket or message.

The browser builds the chat request, so the tools send a file only when its key starts with the caller's own chat upload prefix. Set `chat_files_prefix` to the prefix the app's chat upload request gives the user's uploads:

```yaml
- id: support
  source: "github:lowdefy/modules-mongodb/modules/support@v2.0.0"
  vars:
    chat_files_prefix:
      _string.concat:
        - ai-assistant/
        - _user: id
        - /
```

With no prefix set, the tools send no chat files. Chat uploads must go to the `files` module's bucket, the one the module signs links on. See the ai-assistant module's [attachments](../../ai-assistant/index.md#attachments).

With the ai-assistant's `screenshot: true`, the user can take a screenshot of the page from the chat panel, with passwords and the app's mask selectors blanked and a blur and crop editor, and it attaches to the message like any file ([Screenshot](../../ai-assistant/index.md#screenshot)). It uploads under the same chat prefix, so `chat_files_prefix` covers it and the tools send it with the ticket.

A file the user attaches on the very message that asks for the ticket goes with it: the chat request carries every message of the conversation, the newest included.

## Share the browser's context with the agent

A ticket from the report form carries the page, the browser's details and the tab's recent errors. A ticket the agent files carries the same when the app adds the module's `agent-context` component to its agent's shared state, under the key `support_context`. With the ai-assistant module, that is its `shared_state` var:

```yaml
- id: ai-assistant
  source: "github:lowdefy/modules-mongodb/modules/ai-assistant@v2.0.0"
  vars:
    shared_state:
      support_context:
        _ref:
          module: support
          component: agent-context
```

An app with its own `AgentChat` block puts the same key in the block's `sharedState`. The key must be `support_context`: `support_file_ticket` reads it there and nowhere else.

The component is the plugin's `_support_context` operator. In the browser it gives the page id and a [SupportContext](../../plugins/support-context.md) snapshot: `url`, `user_agent`, `viewport`, `screen`, `locale`, `timezone` and the tab's last 20 `errors`. It reads them each time the page re-evaluates, and the chat sends the latest value with every message. Loading the operator also starts the plugin's error recorder, so an app with no help button still keeps the tab's errors.

`support_file_ticket` takes the snapshot from the chat request (`_agent: sharedState`), never from the tool's input, which the model writes. It keeps only the fields above, held to the recorder's limits (the last 20 errors, 2,000 characters a text). The page and url the model passes are used only for a page or url the snapshot lacks. The app, environment, version and organisation are always the server's.

The agent sees its shared state with every message, so the snapshot costs tokens on every turn: a few hundred for the browser, up to about 20,000 for a tab with 20 errors with long messages and stacks. The model reads the error messages too, so treat them like any other text the page shows it.

## What the team sees

A ticket the agent files carries `extra.filed_by: agent` and `extra.conversation_id`, the chat's conversation id, in its context, beside the app, environment, version and organisation every ticket carries. With `agent-context` shared, it also carries the page, url, browser and recent errors, as a ticket from the form does.

The tools are ordinary endpoints. Called with no agent, by a person or over MCP, they send no chat files and no browser context, and `extra.conversation_id` is null.
