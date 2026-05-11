---
"@lowdefy/modules-mongodb-notifications": minor
---

Allow `resend-user-invite` notifications to be resolved by the link page. The `get_notification_for_link` aggregation now matches `event_type: resend-user-invite` in its `$or` filter alongside the existing `invite-user` branch, so resent invite emails can deep-link the recipient straight to the invite-acceptance page without requiring the contact to already be logged in as themselves.
