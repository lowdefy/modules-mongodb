---
"@lowdefy/modules-mongodb-notifications": patch
---

**Fix: a notification's landing link never resolved for the recipient it was addressed to.**

`get_notification_for_link` authorized a caller by comparing the record's `contact_id` against `_user.id` — a contact row id against an auth user id. Where an app models people as per-organization contact rows (the shape `user-contacts.user_id` establishes: the contact points at the auth user, not the reverse), those are different values and the comparison could never match. Every notification type outside `public_link_types` therefore landed on the invalid page, including for the signed-in recipient, in the right organization.

`dispatch-notification-item` now persists `user_id` on the record, from `item.contact.user_id`, and the link request matches on it — like for like. The previous `contact_id` comparison is kept, so apps whose `contact._id` is the user id, and records written before this, behave exactly as before.

A recipient with no login has `user_id: null` and resolves only through `public_link_types`, which is correct — there is no session to check. The request sends a sentinel rather than null when there is no session, so a null-to-null match can never expose a login-less contact's notification to anyone holding its id.
