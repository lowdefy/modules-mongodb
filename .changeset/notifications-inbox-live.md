---
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-layout": minor
---

**The notifications inbox is redesigned, and notifications are live.**

- **Inbox.** The `all` page fills the screen with a rail of views and types, each with its unread count, a list of up to 1000 notifications that scrolls on its own, and a reading pane. Filters are Unread / All / Read, a date range, a search over title and preview, and a view or type from the rail. The new `views` var groups notification types, such as Mentions, at the top of the rail. Below tablet width the rail becomes a View selector and the list and pane take turns.
- **Mark all as read follows the filters.** It marks only the unread notifications the filters match, across all pages, and names the count whenever a view, type, search or date narrows it. A notification can be marked unread again from the pane.
- **The reading pane shows the message, not the email.** The stored email's canvas, card, logo, sign-off and footer are hidden, and the message takes the app's typography. Emails themselves are unchanged.
- **Appearance per type.** Each type takes its icon and colour from the app's `event_types` entry; a type with none gets a palette colour chosen consistently from its id. Every colour follows the app's theme, dark mode included.
- **Live.** The bell, the toasts and the inbox update the moment a notification arrives or is read in another tab or device, through the module's `notifications-live` websocket. The `layout` page component subscribes on every page with a signed-in user, unless the page passes `hide_notifications: true`. Each signed-in user with a page open holds one change stream and one pooled MongoDB connection, so size `maxPoolSize` for concurrent users. Change streams need a replica set; where they cannot run, set the new `live` var to `false` and the bell and toasts update on navigation.
- **Toasts.** A notification flagged `popup: true` toasts the moment it arrives. The toast is 360px wide under the header, with the type's icon, a one-line title, a two-line preview, the time, **Dismiss** and **Open** (now also for links stored at `data.links.button`). The dispatch pipeline stores `popup` from the item, default `false`.
- **Sound.** An opt-in chirp plays once per batch of popup notifications, after the viewer turns on **Sound** in the inbox header; the setting is kept per device. The module now declares `@lowdefy/modules-mongodb-plugins` for the `NotificationSound` block.
- **A record's type** reads `type` before `event_type` everywhere, so a record carrying both is filtered, counted and labelled under its notification id.
