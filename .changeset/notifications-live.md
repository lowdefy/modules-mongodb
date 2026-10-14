---
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-layout": minor
---

**Notifications are live, and toasts are compact.** The bell, the toast stack and the inbox now update the moment a notification arrives or is read in another tab or on another device, through a change stream the notifications module ships (`notifications-live`). The `layout` page component subscribes on every page with a signed-in user, unless the page passes `hide_notifications: true`. A notification flagged `popup: true` toasts the moment it arrives, with an opt-in chirp for people who turn **Sound** on in the inbox. The toast is redesigned: 360px wide under the header, with an icon, a one-line title, a two-line preview, the time, **Dismiss** and **Open** (now also for links stored at `data.links.button`). Each signed-in user with a page open holds one change stream and one pooled MongoDB connection, so size `maxPoolSize` for your concurrent users. Change streams need a replica set; where they cannot run, set the new `live` var to `false`.
