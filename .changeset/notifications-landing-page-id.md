---
"@lowdefy/modules-mongodb-notifications": patch
---

The dispatch routine passes the notification link page to `RenderNotification` as a page id (`_module.pageId: link`) rather than a hand-built path. This needs a Lowdefy release whose `RenderNotification` takes `landingPage` as a page id or `{ pageId, pathParams }`.
