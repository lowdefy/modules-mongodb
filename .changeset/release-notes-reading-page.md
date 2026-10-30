---
"@lowdefy/modules-mongodb-release-notes": minor
---

**release-notes:** an app can show a New mark while a release note is unread.

- New exported component `get_unread_release_notes_count`: a request of the same name that counts the signed-in person's unread notes as `[{ total }]`. Add it to a page's `requests` or the layout's `global_requests`, fire it with a `Request` action, and read `_request: get_unread_release_notes_count.0.total` to show a "New" mark while it is above zero.
- New var `about`: one sentence on what the page is for, handed to the layout page component as `about`. A layout that shows a page's `about` on its last crumb uses it; other layouts ignore it.

What's new itself looks as before.
