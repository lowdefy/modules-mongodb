---
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-events": patch
---

Fix user-admin roles projection and events-timeline display_key filter.

- `user-admin`: `get_user` now defaults the projected `roles` to `[]` when the user has no roles array for the app. Previously this returned `null`, which broke the multiple selector on the user edit page for users with undefined roles.
- `events`: `events-timeline` now filters out events where the resolved `display_key` field is missing, preventing fetched rows that would render with unresolved `$<key>.title` placeholders for title/description/info.