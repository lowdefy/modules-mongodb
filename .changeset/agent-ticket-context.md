---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-support": minor
---

**Tickets the app's agent files carry the same context as the report form's.** Add the support module's new `agent-context` component to the agent's shared state, under `support_context`, and every ticket the agent files carries the page, the browser, the viewport and screen, the locale and time zone, and the tab's last 20 errors, so the team sees the same whichever way a ticket came. The agent tool takes these from the chat itself, never from what the model writes, and keeps them to the form's limits. The component is the plugins package's new `_support_context` operator, which also starts recording the tab's errors on pages with no help button.
