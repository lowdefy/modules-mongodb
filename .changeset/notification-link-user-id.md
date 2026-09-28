---
"@lowdefy/modules-mongodb-notifications": patch
---

**Fix: a notification never reached the signed-in recipient it was addressed to when the app's contact id is not the user id.**

The module found a caller's records by comparing the record's `contact_id` against `_user.id` — a contact row id against an auth user id. Where an app models people as per-organization contact rows (the shape `user-contacts.user_id` establishes: the contact points at the auth user, not the reverse), those are different values and the comparison never matched. The landing link sent every type outside `public_link_types` to the invalid page, and the inbox, bell, popups and mark-read never saw the record.

`dispatch-notification-item` now stores `user_id` on the record, from `item.contact.user_id`, and every session-scoped read and write matches the caller against `contact_id` OR `user_id` (`requests/match-recipient.yaml`). Apps whose `contact._id` is the user id, and records written before this, behave exactly as before. To use it, add `user_id` to each item's `contact`.

The landing-link request also stops taking the caller's id from the request payload, which is client-supplied: it reads `_user` server side, like the inbox requests. With no session it compares against a sentinel rather than null, so a record addressed to a login-less contact (`user_id: null`) is never readable by anyone holding its id — such a record resolves only through `public_link_types`.
