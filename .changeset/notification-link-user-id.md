---
"@lowdefy/modules-mongodb-notifications": patch
---

**Fix: a notification reaches its signed-in recipient when the app's contact id is not the user id.**

The module found a caller's records by comparing the record's `contact_id` with `_user.id`, a contact id against an auth user id. Where an app keeps people as per-organization contact rows, those differ, so the inbox, bell, popups and mark-read never saw the record and the landing link sent it to the invalid page. Records now store `user_id`, from `item.contact.user_id`, and every session-scoped read and write matches the caller against `contact_id` or `user_id`. To use it, add `user_id` to each item's `contact`. Apps whose contact id is the user id, and records written before this, behave as before.

The landing link also stops taking the caller's id from the request payload and reads the session on the server. With no session, a record addressed to a contact with no login is readable only through `public_link_types`.
