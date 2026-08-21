---
'@lowdefy/modules-mongodb-ai-assistant': minor
---

The `ai-assistant` module's chat now takes app behaviour on four events: `on_before_send`, `on_user_message`, `on_data_part` and `on_feedback`. Thread persistence and titling stay the module's own, but an app can now refuse a send before the model is called (a daily question cap, an entitlement check), keep its own record of what was asked, read custom data parts the agent streams, and handle ratings from the feedback control — none of which was possible without forking the chat shell.

The feedback control remains off unless `message_display` turns it on, and it now has somewhere to send the rating.
