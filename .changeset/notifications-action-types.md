---
"@lowdefy/modules-mongodb-notifications": minor
---

Notifications the person must act on can stay out of the inbox. List their ids in the new `action_types` var: they are stored and emailed as before, and the link page still opens them, but the inbox list, its counts, the bell count, the live toasts and Mark all as read skip them. An app that does not set `action_types` sees no change.

Also new: `summary_row`, blocks drawn as the first row of the `list` layout for an app's own live summary; `tone` (`gold` or `red`), the colour of the bell's count badge; and the `resolve-notifications` endpoint (`InternalApi`, payload `{ types?, match, resolution? }`, returns `{ count }`), which marks the matching unread notifications read for every recipient in the caller's organisation when the item they are about is resolved, and stores `resolution` as `data.resolved`. The link page passes a record's `data.resolved` to the target page as `resolved` in the URL.
