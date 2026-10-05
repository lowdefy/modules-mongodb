---
"@lowdefy/modules-mongodb-layout": patch
"@lowdefy/modules-mongodb-activities": patch
"@lowdefy/modules-mongodb-companies": patch
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-deals": patch
---

**Pages whose title comes from a runtime operator no longer show "[object Object]" as the browser-tab title.** The server writes the tab title without evaluating operators, so the layout page component now uses `title` only when it is a string at build time, and otherwise the page's `type` (for example "Company"), or the page id when there is none. The new and edit pages of activities, companies, contacts and deals build their `type` at build time, so their tab reads, for example, "Edit Company".
