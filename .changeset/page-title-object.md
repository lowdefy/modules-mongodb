---
"@lowdefy/modules-mongodb-layout": patch
---

**Pages whose title comes from a runtime operator no longer show "[object Object]" as the browser-tab title.** The server writes the tab title without evaluating operators, so the layout page component now uses `title` only when it is a string at build time, and otherwise the page's `type` (for example "Company"), or the page id when there is none.
