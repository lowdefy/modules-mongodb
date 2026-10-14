---
"@lowdefy/modules-mongodb-notifications": minor
---

**Mark all as read follows the inbox filter, and inbox views group types.** Mark all as read now marks only the unread notifications the inbox's filters match (type, search, date), across all pages, instead of every unread notification. A new `views` var names groups of notification types, such as Mentions, for the inbox rail. The inbox gains a search over title and preview, an All status beside Unread and Read, and loads up to 1000 notifications a page. A record's type now reads `type` before `event_type` everywhere, so a record carrying both is filtered, counted and labelled under its notification id. The dispatch pipeline stores `popup` from the item (default `false`), so a dispatched notification can toast.
