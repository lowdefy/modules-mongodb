---
"@lowdefy/modules-mongodb-layout": patch
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-user-account": patch
---

**The user view page and the account page no longer show "[object Object]" as the browser-tab title.** Both set the page title from the user's name, a request read that has no value when the tab title is resolved. The layout page component takes a `page_title` var for a static tab title, and these two pages pass one.
