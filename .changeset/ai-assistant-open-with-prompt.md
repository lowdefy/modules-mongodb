---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

New `open-with-prompt` component: an action list for a button anywhere on a page that mounts `panel`. It opens the panel on a new thread and sends its `prompt` var (a string, or a runtime operator resolved on click) into it, whether the panel is open on another thread, closed, or was never opened. The earlier thread stays in the list, untouched. Like the welcome prompts, the send does not run `on_before_send`.
